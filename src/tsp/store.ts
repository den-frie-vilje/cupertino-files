/**
 * Object store: the document-wide graph of IWA objects across components.
 *
 * Responsibilities (mirroring what the apps require of a writer, as
 * established in research/format-invariants.md):
 *
 *  - index every object by identifier across all components
 *  - allocate new object identifiers in a fresh block above the existing
 *    maximum (rounded up to the next multiple of 1,000,000, like
 *    numbers-parser) and record each allocation in
 *    TSP.PackageMetadata.last_object_identifier (object 2, field 1)
 *  - on save: recompute MessageInfo.object_references for every dirty object
 *    whose type has a registered reference extractor, and record
 *    cross-component references in the referencing component's
 *    TSP.ComponentInfo.external_references
 *  - re-serialize only dirty components; untouched components keep their
 *    original bytes for perfect round-trip fidelity
 */
import { IwaObject, parseIwaFile, serializeIwaFile } from "./iwa.ts";
import { IWorkContainer, locatorForIwaName } from "./package.ts";
import { RawMessage } from "../base/protobuf.ts";
import { sha1 } from "../base/sha1.ts";
import { bytesEqual } from "../base/bytes.ts";
import type { IWorkApp } from "./registry.ts";

// TSP.PackageMetadata field numbers.
const PKG_LAST_OBJECT_IDENTIFIER = 1;
const PKG_COMPONENTS = 3;
const PKG_DATAS = 4;
// TSP.DataInfo field numbers.
const DATA_IDENTIFIER = 1;
const DATA_DIGEST = 2;
const DATA_PREFERRED_FILE_NAME = 3;
const DATA_FILE_NAME = 4;
const DATA_MATERIALIZED_LENGTH = 18;
// TSP.ComponentInfo field numbers.
const COMPONENT_IDENTIFIER = 1;
const COMPONENT_PREFERRED_LOCATOR = 2;
const COMPONENT_LOCATOR = 3;
const COMPONENT_EXTERNAL_REFERENCES = 6;
// TSP.ComponentExternalReference field numbers.
const EXTREF_COMPONENT_IDENTIFIER = 1;
const EXTREF_OBJECT_IDENTIFIER = 2;

const PACKAGE_METADATA_ID = 2n;
const PACKAGE_METADATA_TYPE = 11006;

/** Extracts the object identifiers referenced by a message of a known type. */
export type ReferenceExtractor = (message: RawMessage) => bigint[];

export class Component {
  /** Canonical zip path, e.g. "Index/Document.iwa". */
  readonly name: string;
  /** TSP locator form, e.g. "Document" or "Tables/DataList-5". */
  readonly locator: string;
  objects: IwaObject[];
  readonly byId = new Map<bigint, IwaObject>();
  private originalBytes: Uint8Array | undefined;
  /** Set when objects were added/removed (not just edited in place). */
  structurallyDirty = false;

  constructor(name: string, bytes: Uint8Array) {
    this.name = name;
    this.locator = locatorForIwaName(name);
    this.originalBytes = bytes;
    this.objects = parseIwaFile(bytes);
    for (const o of this.objects) this.byId.set(o.identifier, o);
  }

  get dirty(): boolean {
    return this.structurallyDirty || this.objects.some((o) => o.isDirty);
  }

  serialize(): Uint8Array {
    if (!this.dirty && this.originalBytes) return this.originalBytes;
    return serializeIwaFile(this.objects);
  }
}

export class ObjectStore {
  readonly container: IWorkContainer;
  readonly components: Component[] = [];
  readonly app: IWorkApp;
  private readonly index = new Map<bigint, { obj: IwaObject; component: Component }>();
  private readonly refExtractors: ReadonlyMap<number, ReferenceExtractor>;
  private nextId: bigint | undefined;

  constructor(
    container: IWorkContainer,
    options: { app?: IWorkApp; referenceExtractors?: ReadonlyMap<number, ReferenceExtractor> } = {},
  ) {
    this.container = container;
    this.app = options.app ?? "pages";
    this.refExtractors = options.referenceExtractors ?? new Map();
    for (const [name, bytes] of container.iwaFiles) {
      const component = new Component(name, bytes);
      this.components.push(component);
      for (const o of component.objects) {
        this.index.set(o.identifier, { obj: o, component });
      }
    }
  }

  object(id: bigint): IwaObject | undefined {
    return this.index.get(id)?.obj;
  }

  componentOf(id: bigint): Component | undefined {
    return this.index.get(id)?.component;
  }

  componentByLocator(locator: string): Component | undefined {
    return this.components.find((c) => c.locator === locator);
  }

  /** Resolve a TSP.Reference message (field 1 = identifier) to its object. */
  resolve(ref: RawMessage | bigint | undefined): IwaObject | undefined {
    if (ref === undefined) return undefined;
    const id = typeof ref === "bigint" ? ref : ref.getVarint(1);
    return id === undefined ? undefined : this.object(id);
  }

  findByType(type: number): IwaObject | undefined {
    for (const c of this.components) {
      for (const o of c.objects) if (o.type === type) return o;
    }
    return undefined;
  }

  *allObjects(): IterableIterator<{ obj: IwaObject; component: Component }> {
    for (const c of this.components) {
      for (const o of c.objects) yield { obj: o, component: c };
    }
  }

  get packageMetadata(): IwaObject {
    const obj = this.object(PACKAGE_METADATA_ID);
    if (obj && obj.type === PACKAGE_METADATA_TYPE) return obj;
    const byType = this.findByType(PACKAGE_METADATA_TYPE);
    if (byType) return byType;
    throw new RangeError("TSP.PackageMetadata (object 2) not found — Index/Metadata.iwa missing?");
  }

  /**
   * Allocate a fresh object identifier. First allocation rounds the current
   * maximum up to the next multiple of 1,000,000 (numbers-parser convention,
   * keeping new IDs clear of Apple's); every allocation is recorded in
   * PackageMetadata.last_object_identifier.
   */
  allocateId(): bigint {
    if (this.nextId === undefined) {
      let max = 0n;
      for (const id of this.index.keys()) if (id > max) max = id;
      const last = this.packageMetadata.message.getVarint(PKG_LAST_OBJECT_IDENTIFIER) ?? 0n;
      if (last > max) max = last;
      this.nextId = ((max / 1_000_000n) + 1n) * 1_000_000n;
    }
    this.nextId += 1n;
    const id = this.nextId;
    this.packageMetadata.message.setVarint(PKG_LAST_OBJECT_IDENTIFIER, id);
    return id;
  }

  /**
   * Create a new object of the given type inside a component. The MessageInfo
   * version list is copied from an existing sibling of the same type when one
   * exists (falling back to [1, 0, 5], which is what numbers-parser writes).
   * `cloneFrom` seeds the payload with a copy of another object's message.
   */
  createObject(type: number, component: Component, options: { cloneFrom?: IwaObject } = {}): IwaObject {
    const id = this.allocateId();
    const obj = IwaObject.create(id, type, [1, 0, 5]);
    const sibling = options.cloneFrom ?? this.findByType(type);
    if (sibling) obj.copyVersionsFrom(sibling);
    if (options.cloneFrom) obj.setMessageBytes(options.cloneFrom.message.toBytes());
    component.objects.push(obj);
    component.byId.set(id, obj);
    component.structurallyDirty = true;
    this.index.set(id, { obj, component });
    return obj;
  }

  // ------------------------------------------------------------- Data/ files

  /** Files to add to the package on save (e.g. "Data/photo.png"). */
  readonly pendingFiles = new Map<string, Uint8Array>();

  /**
   * Register media bytes as a Data/ file: dedupes by SHA-1 digest against
   * existing DataInfos, allocates a data-space identifier, appends the
   * DataInfo to PackageMetadata and schedules the file for writing.
   * Returns the data identifier and stored file name.
   */
  addDataFile(data: Uint8Array, preferredFileName: string): { dataId: bigint; fileName: string } {
    const digest = sha1(data);
    const pkg = this.packageMetadata.message;
    let maxId = 0n;
    for (const info of pkg.getMessages(PKG_DATAS)) {
      const existing = info.getBytes(DATA_DIGEST);
      const id = info.getVarint(DATA_IDENTIFIER) ?? 0n;
      if (existing && bytesEqual(existing, digest)) {
        return {
          dataId: id,
          fileName: info.getString(DATA_FILE_NAME) ?? info.getString(DATA_PREFERRED_FILE_NAME) ?? preferredFileName,
        };
      }
      if (id > maxId) maxId = id;
    }
    const dataId = maxId + 1n;
    // Unique file name among existing Data/ entries and pending additions.
    const existingNames = new Set<string>();
    for (const name of this.container.otherFiles().keys()) {
      if (name.startsWith("Data/")) existingNames.add(name.slice("Data/".length));
    }
    for (const name of this.pendingFiles.keys()) {
      if (name.startsWith("Data/")) existingNames.add(name.slice("Data/".length));
    }
    let fileName = preferredFileName;
    if (existingNames.has(fileName)) {
      const dot = fileName.lastIndexOf(".");
      fileName =
        dot > 0
          ? `${fileName.slice(0, dot)}-${dataId}${fileName.slice(dot)}`
          : `${fileName}-${dataId}`;
    }
    const info = RawMessage.create();
    info.setVarint(DATA_IDENTIFIER, dataId);
    info.setBytes(DATA_DIGEST, digest);
    info.setString(DATA_PREFERRED_FILE_NAME, preferredFileName);
    info.setString(DATA_FILE_NAME, fileName);
    info.setVarint(DATA_MATERIALIZED_LENGTH, data.length);
    pkg.addMessage(PKG_DATAS, info);
    this.pendingFiles.set(`Data/${fileName}`, data);
    return { dataId, fileName };
  }

  /** ComponentInfo message inside PackageMetadata for a component, if any. */
  componentInfo(component: Component): RawMessage | undefined {
    const pkg = this.packageMetadata.message;
    const infos = pkg.getMessages(PKG_COMPONENTS);
    // Exact `locator` match wins; otherwise match on preferred_locator.
    for (const ci of infos) {
      if (ci.getString(COMPONENT_LOCATOR) === component.locator) return ci;
    }
    for (const ci of infos) {
      if (
        !ci.has(COMPONENT_LOCATOR) &&
        ci.getString(COMPONENT_PREFERRED_LOCATOR) === component.locator
      ) {
        return ci;
      }
    }
    return undefined;
  }

  /**
   * Ensure `fromComponent`'s ComponentInfo lists an external reference to
   * object `toId` living in `toComponent`. No-op when already recorded.
   */
  private ensureExternalReference(fromComponent: Component, toComponent: Component, toId: bigint): void {
    const fromInfo = this.componentInfo(fromComponent);
    const toInfo = this.componentInfo(toComponent);
    if (!fromInfo || !toInfo) return; // metadata-less packages: nothing to maintain
    const toComponentId = toInfo.getVarint(COMPONENT_IDENTIFIER);
    if (toComponentId === undefined) return;
    for (const er of fromInfo.getMessages(COMPONENT_EXTERNAL_REFERENCES)) {
      if (
        er.getVarint(EXTREF_COMPONENT_IDENTIFIER) === toComponentId &&
        er.getVarint(EXTREF_OBJECT_IDENTIFIER) === toId
      ) {
        return;
      }
    }
    const entry = RawMessage.create();
    entry.setVarint(EXTREF_COMPONENT_IDENTIFIER, toComponentId);
    entry.setVarint(EXTREF_OBJECT_IDENTIFIER, toId);
    fromInfo.addMessage(COMPONENT_EXTERNAL_REFERENCES, entry);
  }

  /** File name registered for a Data/ identifier, from PackageMetadata.datas. */
  dataFileName(dataId: bigint): string | undefined {
    for (const info of this.packageMetadata.message.getMessages(PKG_DATAS)) {
      if (info.getVarint(DATA_IDENTIFIER) === dataId) {
        return info.getString(DATA_FILE_NAME) ?? info.getString(DATA_PREFERRED_FILE_NAME);
      }
    }
    return undefined;
  }

  /**
   * Serialize the document. Recomputes reference bookkeeping for dirty
   * objects, then rebuilds only the components that changed.
   */
  save(): Uint8Array {
    // Pass 1: refresh object_references + external references for dirty
    // objects of known types. (Doing this may dirty Metadata.iwa.)
    for (const component of this.components) {
      for (const obj of component.objects) {
        if (!obj.isDirty) continue;
        const extractor = this.refExtractors.get(obj.type);
        if (!extractor) continue;
        const refs = dedupe(extractor(obj.message));
        obj.setObjectReferences(refs);
        for (const id of refs) {
          const target = this.index.get(id);
          if (target && target.component !== component) {
            this.ensureExternalReference(component, target.component, id);
          }
        }
      }
    }

    // Pass 2: serialize dirty components (Metadata.iwa may have joined in).
    const replacements = new Map<string, Uint8Array>();
    for (const component of this.components) {
      if (component.dirty) replacements.set(component.name, component.serialize());
    }
    return this.container.toBytes(replacements, this.pendingFiles);
  }
}

function dedupe(ids: readonly bigint[]): bigint[] {
  const seen = new Set<bigint>();
  const out: bigint[] = [];
  for (const id of ids) {
    if (!seen.has(id)) {
      seen.add(id);
      out.push(id);
    }
  }
  return out;
}
