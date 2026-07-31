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
import { detectIwaFraming, type IwaFraming } from "../base/snappy.ts";
import { IWorkContainer, locatorForIwaName } from "./package.ts";
import { RawMessage } from "../base/protobuf.ts";
import { sha1 } from "../base/sha1.ts";
import { bytesEqual } from "../base/bytes.ts";
import { typeName, type IWorkApp } from "./registry.ts";

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

  /**
   * Set when the component could not be decoded — its bytes are still
   * preserved verbatim on save, but its objects are not available.
   *
   * Collaboration-mode documents are the real case: they write
   * `Index/OperationStorage.iwa` with Apple LZFSE framing while every other
   * component uses normal Snappy chunking. Failing the whole document over
   * one such component would lose the many that parse fine.
   */
  readonly framing: IwaFraming;
  readonly loadError: Error | undefined;

  constructor(name: string, bytes: Uint8Array) {
    this.name = name;
    this.locator = locatorForIwaName(name);
    this.originalBytes = bytes;
    this.framing = detectIwaFraming(bytes);
    let error: Error | undefined;
    let objects: IwaObject[] = [];
    try {
      objects = parseIwaFile(bytes);
    } catch (e) {
      error = e as Error;
    }
    this.loadError = error;
    this.objects = objects;
    for (const o of this.objects) this.byId.set(o.identifier, o);
  }

  /** True when this component's objects could not be read. */
  get isOpaque(): boolean {
    return this.loadError !== undefined;
  }

  get dirty(): boolean {
    if (this.isOpaque) return false; // never rewrite what we could not read
    return this.structurallyDirty || this.objects.some((o) => o.isDirty);
  }

  serialize(): Uint8Array {
    if (this.isOpaque || (!this.dirty && this.originalBytes)) {
      return this.originalBytes ?? serializeIwaFile(this.objects);
    }
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
  /**
   * Objects this library created, as opposed to ones Apple wrote.
   *
   * Their reference declarations are ours to get right: nothing in the file
   * vouches for them, and their archive types generally have no registered
   * extractor. See {@link save}.
   */
  private readonly created = new Set<bigint>();

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

  /** Registry name of an object's archive type, resolved for this app. */
  typeNameOf(object: IwaObject): string | undefined {
    return typeName(object.type, this.app);
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
    this.created.add(id);
    return obj;
  }

  /**
   * Drop objects nothing can reach, and report how many went.
   *
   * Deleting a sheet or a slide unlinks its archives but does not remove
   * them: they sit in their component, unreferenced, and go on being
   * written out. A document blanked from a real one is mostly this — a
   * template with eleven tables becomes one table and ten ghosts.
   *
   * ## Why the scan is deliberately crude
   *
   * Reachability is computed by walking **every submessage of every
   * object** and treating anything shaped like a `TSP.Reference` — a
   * message whose only field is varint 1 — as a pointer, if that value
   * names an object. No schema is consulted.
   *
   * That over-approximates: a field that happens to hold an integer equal
   * to some object's id keeps that object alive for no reason. This is the
   * safe direction. The alternative, walking only the references this
   * library knows how to extract, would silently drop whatever an
   * unmodelled archive points at — and a document that loses an object it
   * needed is unrecoverable, while one that keeps a few too many is merely
   * larger than it could be.
   *
   * Objects in components that failed to decode are never touched, and
   * neither are the roots.
   */
  prune(roots: readonly bigint[]): number {
    const reachable = new Set<bigint>();
    const queue: bigint[] = [];
    for (const root of roots) {
      if (this.index.has(root) && !reachable.has(root)) {
        reachable.add(root);
        queue.push(root);
      }
    }

    while (queue.length > 0) {
      const object = this.index.get(queue.pop()!)?.obj;
      if (!object) continue;
      for (const id of referencedIds(object.message)) {
        if (!this.index.has(id) || reachable.has(id)) continue;
        reachable.add(id);
        queue.push(id);
      }
    }

    let removed = 0;
    for (const component of this.components) {
      if (component.isOpaque) continue;
      const keep = component.objects.filter((o) => reachable.has(o.identifier));
      if (keep.length === component.objects.length) continue;
      for (const object of component.objects) {
        if (reachable.has(object.identifier)) continue;
        component.byId.delete(object.identifier);
        this.index.delete(object.identifier);
        removed++;
      }
      component.objects = keep;
      component.structurallyDirty = true;
    }
    return removed;
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
   * Objects edited in this session that carry older-reader compatibility
   * diffs (see IwaObject.compatibilityPatchVersions). The diffs are
   * preserved verbatim but NOT recomputed, so an older app opening the
   * saved document would apply a stale diff for those objects. Empty in
   * practice unless you edit UI-state objects.
   */
  staleCompatibilityPatches(): { id: bigint; type: number; targetVersions: number[][] }[] {
    const out: { id: bigint; type: number; targetVersions: number[][] }[] = [];
    for (const { obj } of this.allObjects()) {
      if (obj.isDirty && obj.hasCompatibilityPatches) {
        out.push({ id: obj.identifier, type: obj.type, targetVersions: obj.compatibilityPatchVersions() });
      }
    }
    return out;
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
        // An object we created has no history to fall back on: whatever it
        // references, it references because this library put it there, and
        // its archive type usually has no extractor. Scanning it is safe
        // for the same reason it would be unsafe on an Apple archive — we
        // know exactly what is in it.
        //
        // Getting this wrong is not a subtle failure. An undeclared
        // reference into another component makes Numbers refuse the whole
        // document as damaged, because external_references is how it
        // decides which components to load.
        const refs = extractor
          ? dedupe(extractor(obj.message))
          : this.created.has(obj.identifier)
            ? dedupe(referencedIds(obj.message).filter((id) => this.index.has(id)))
            : undefined;
        if (!refs) continue;
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

/**
 * Every object id a message could be pointing at.
 *
 * Recursive over submessages, and deliberately shape-based: a `TSP.Reference`
 * is a message whose sole field is varint 1, so anything matching that is
 * treated as a pointer. See {@link ObjectStore.prune} for why guessing wide
 * is the safe direction here.
 */
function referencedIds(message: RawMessage): bigint[] {
  const out: bigint[] = [];
  const visit = (node: RawMessage, depth: number): void => {
    // Deep nesting is real (an AST inside a formula inside a list entry),
    // but unbounded recursion on hostile input is not worth the risk.
    if (depth > 24) return;
    const fields = node.fields;
    if (fields.length === 1 && fields[0]!.no === 1 && fields[0]!.wire === 0) {
      const id = node.getVarint(1);
      if (id !== undefined && id > 0n) out.push(id);
      return;
    }
    // Every occurrence, not just the first: repeated fields are how a data
    // list holds its entries, and reading one entry per list would strand
    // hundreds of live objects — which is exactly what it did.
    const seen = new Set<number>();
    for (const field of fields) {
      if (field.wire !== 2 || seen.has(field.no)) continue;
      seen.add(field.no);
      let subs: RawMessage[] = [];
      try {
        subs = node.getMessages(field.no);
      } catch {
        continue; // bytes that are not messages
      }
      for (const sub of subs) {
        if (sub.fields.length > 0) visit(sub, depth + 1);
      }
    }
  };
  visit(message, 0);
  return out;
}
