/**
 * IWorkDocument — the app-agnostic base class for Pages, Numbers and
 * Keynote documents. Everything built on the shared families (TSP packaging,
 * TSWP text, TSS styles, TSD drawables) lives here; app subclasses add their
 * own object-graph roots (TP.* / TN.* / KN.*).
 *
 * Version awareness: the constructor never rejects a file for being newer
 * than this library. Instead {@link FormatInfo} surfaces the declared
 * versions and any compatibility notes as warnings, and the RawMessage layer
 * guarantees that unknown fields, types and components survive a load→save
 * round-trip untouched. This is the same posture the apps themselves take
 * (forward-compatible readers, additive schema evolution).
 */
import { IWorkContainer } from "../tsp/package.ts";
import { ObjectStore, type ReferenceExtractor } from "../tsp/store.ts";
import type { IwaObject } from "../tsp/iwa.ts";
import { RawMessage } from "../base/protobuf.ts";
import {
  KEYNOTE_TYPES,
  NUMBERS_TYPES,
  PAGES_TYPES,
  SHARED_TYPES,
  typeName,
  type IWorkApp,
} from "../tsp/registry.ts";
import { parseBinaryPlist, xmlPlistStrings, type PlistValue } from "../base/plist.ts";
import {
  buildCompatibilityReport,
  eraOf,
  IWorkVersion,
  probeStructure,
  summarizeCompatibility,
  type CompatibilityReport,
  type IWorkEra,
} from "../tsp/version.ts";
import { SHARED_REFERENCE_EXTRACTORS } from "../tsp/extractors.ts";
import { StorageKind, TSWP_TYPE } from "../tswp/schema.ts";
import { TSS_TYPE } from "../tss/schema.ts";
import { TextStorage } from "../tswp/textstorage.ts";
import { StylesheetModel } from "../tss/stylesheet.ts";
import { DrawableModel, findDrawableCore } from "../tsd/drawables.ts";
import { imagesOf, type ImageModel } from "../tsd/images.ts";
import { chartsOf, type ChartModel } from "../tsch/charts.ts";

// TSP.PackageMetadata version fields.
const PKG_READ_VERSION = 5;
const PKG_WRITE_VERSION = 6;
const PKG_FILE_FORMAT_VERSION = 7;

/** Versions and identity read from the package (all optional, never gating). */
export class FormatInfo {
  /** TSP.PackageMetadata read/write/file-format version triples. */
  readVersion: number[] = [];
  writeVersion: number[] = [];
  fileFormatVersion: number[] = [];
  /** `fileFormatVersion` string from Metadata/Properties.plist (e.g. "14.1.1"). */
  propertiesFileFormatVersion: string | undefined;
  documentUUID: string | undefined;
  /** Build strings from Metadata/BuildVersionHistory.plist (template + app builds). */
  buildHistory: string[] = [];
  /** Non-fatal compatibility observations. */
  warnings: string[] = [];

  static read(container: IWorkContainer, packageMetadata: RawMessage): FormatInfo {
    const info = new FormatInfo();
    info.readVersion = packageMetadata.getPackedVarints(PKG_READ_VERSION).map(Number);
    info.writeVersion = packageMetadata.getPackedVarints(PKG_WRITE_VERSION).map(Number);
    info.fileFormatVersion = packageMetadata.getPackedVarints(PKG_FILE_FORMAT_VERSION).map(Number);
    const others = container.otherFiles();
    const props = others.get("Metadata/Properties.plist");
    if (props) {
      try {
        const plist = parseBinaryPlist(props) as { [k: string]: PlistValue };
        if (typeof plist["fileFormatVersion"] === "string") {
          info.propertiesFileFormatVersion = plist["fileFormatVersion"];
        }
        if (typeof plist["documentUUID"] === "string") {
          info.documentUUID = plist["documentUUID"];
        }
      } catch {
        info.warnings.push("Metadata/Properties.plist could not be parsed (non-fatal)");
      }
    }
    const history = others.get("Metadata/BuildVersionHistory.plist");
    if (history) {
      try {
        info.buildHistory = xmlPlistStrings(history);
      } catch {
        /* ignore */
      }
    }
    return info;
  }
}

export interface DocumentStats {
  app: IWorkApp;
  components: { name: string; objects: number }[];
  objectCount: number;
  typeHistogram: Map<string, number>;
}

export class IWorkDocument {
  readonly container: IWorkContainer;
  readonly store: ObjectStore;
  readonly format: FormatInfo;

  protected constructor(container: IWorkContainer, store: ObjectStore) {
    this.container = container;
    this.store = store;
    this.format = FormatInfo.read(container, store.packageMetadata.message);
  }

  /**
   * Load any modern iWork document, auto-detecting the app. Prefer the app
   * subclasses' `load` when the type is known — they expose richer APIs.
   */
  static open(bytes: Uint8Array): IWorkDocument {
    const container = IWorkContainer.fromBytes(bytes);
    const app = detectApp(container);
    const store = new ObjectStore(container, {
      app,
      referenceExtractors: SHARED_REFERENCE_EXTRACTORS,
    });
    return new IWorkDocument(container, store);
  }

  protected static loadStore(
    bytes: Uint8Array,
    app: IWorkApp,
    extractors: ReadonlyMap<number, ReferenceExtractor>,
  ): { container: IWorkContainer; store: ObjectStore } {
    const container = IWorkContainer.fromBytes(bytes);
    const store = new ObjectStore(container, { app, referenceExtractors: extractors });
    return { container, store };
  }

  get app(): IWorkApp {
    return this.store.app;
  }

  /** Every text storage in the document (bodies, headers, cells, notes …). */
  textStorages(kind?: StorageKind): TextStorage[] {
    const out: TextStorage[] = [];
    for (const { obj } of this.store.allObjects()) {
      if (obj.type !== TSWP_TYPE.STORAGE) continue;
      const storage = new TextStorage(this.store, obj);
      if (kind === undefined || storage.kind === kind) out.push(storage);
    }
    return out;
  }

  /** All stylesheets (document + theme). */
  stylesheets(): StylesheetModel[] {
    const out: StylesheetModel[] = [];
    for (const { obj } of this.store.allObjects()) {
      if (obj.type === TSS_TYPE.STYLESHEET) out.push(new StylesheetModel(this.store, obj));
    }
    return out;
  }

  /** Every object that carries drawable geometry (shapes, images, boxes). */
  drawables(): DrawableModel[] {
    const out: DrawableModel[] = [];
    for (const { obj } of this.store.allObjects()) {
      // Cheap pre-filter: drawable archives live in the TSD/TSWP/app ranges;
      // findDrawableCore does the authoritative structural check.
      try {
        if (findDrawableCore(obj.message)) out.push(new DrawableModel(this.store, obj));
      } catch {
        /* opaque/corrupt payloads are skipped, never fatal */
      }
    }
    return out;
  }

  /** Every chart, with its plotted data (see ChartModel). */
  charts(): ChartModel[] {
    return chartsOf(this.store);
  }

  /** Every image, with filter/mask access (see ImageModel). */
  images(): ImageModel[] {
    return imagesOf(this.store);
  }

  /** Concatenated plain text of all in-document storages (reading order approximation). */
  allText(): string {
    return this.textStorages()
      .map((s) => s.text)
      .filter((t) => t.length > 0)
      .join("\n");
  }

  object(id: bigint): IwaObject | undefined {
    return this.store.object(id);
  }

  typeNameOf(obj: IwaObject): string | undefined {
    return typeName(obj.type, this.app);
  }

  stats(): DocumentStats {
    const histogram = new Map<string, number>();
    let count = 0;
    for (const { obj } of this.store.allObjects()) {
      count++;
      const name = typeName(obj.type, this.app) ?? `type ${obj.type}`;
      histogram.set(name, (histogram.get(name) ?? 0) + 1);
    }
    return {
      app: this.app,
      components: this.store.components.map((c) => ({ name: c.name, objects: c.objects.length })),
      objectCount: count,
      typeHistogram: histogram,
    };
  }

  /**
   * What this library can and cannot do with THIS document: declared
   * versions, the era they place it in, structural probes (unknown type
   * IDs, cell-storage generation, patch archives, collaboration state) and
   * any unsupported features. Loading never fails on version grounds — this
   * is how a caller finds out what to expect.
   */
  compatibility(): CompatibilityReport {
    const f = this.format;
    return buildCompatibilityReport({
      app: this.app,
      formatVersion: IWorkVersion.parse(f.propertiesFileFormatVersion),
      packageFormatVersion: IWorkVersion.parse(f.fileFormatVersion),
      readVersion: IWorkVersion.parse(f.readVersion),
      writeVersion: IWorkVersion.parse(f.writeVersion),
      appBuilds: f.buildHistory,
      probe: probeStructure(this.store),
    });
  }

  /** One-line human summary of {@link compatibility}. */
  compatibilitySummary(): string {
    return summarizeCompatibility(this.compatibility());
  }

  /** Format era this document was written by (see tsp/version.ts). */
  get era(): IWorkEra {
    return eraOf(
      IWorkVersion.parse(this.format.propertiesFileFormatVersion) ??
        IWorkVersion.parse(this.format.fileFormatVersion),
    );
  }

  /** Serialize the document back to package bytes. */
  save(): Uint8Array {
    return this.store.save();
  }
}

/**
 * Detect which app produced a container by scoring app-exclusive type IDs.
 * Data-driven from the registry, so new type additions refine rather than
 * break detection.
 */
export function detectApp(container: IWorkContainer): IWorkApp {
  const store = new ObjectStore(container, { app: "pages" });
  const scores: Record<IWorkApp, number> = { pages: 0, keynote: 0, numbers: 0 };
  for (const { obj } of store.allObjects()) {
    const t = obj.type;
    const inShared = SHARED_TYPES[t] !== undefined;
    if (inShared) continue;
    if (PAGES_TYPES[t] !== undefined) scores.pages++;
    if (KEYNOTE_TYPES[t] !== undefined) scores.keynote++;
    if (NUMBERS_TYPES[t] !== undefined) scores.numbers++;
  }
  // The ambiguous low IDs (1 = app DocumentArchive in both KN and TN) cancel
  // out; app-unique ranges (TP 10000+, KN slides, TN 12000+) decide.
  let best: IWorkApp = "pages";
  for (const app of ["keynote", "numbers"] as const) {
    if (scores[app] > scores[best]) best = app;
  }
  return best;
}
