/**
 * Version awareness and backwards/forwards compatibility.
 *
 * Design principle (see docs/FORMAT.md §12): **structural detection beats
 * version sniffing**. Declared versions are metadata — informative, and
 * useful for reporting — but every behavioral decision in this library is
 * driven by probing what a document actually contains. A file is never
 * refused for declaring a version we haven't seen; unknown fields, types
 * and components round-trip untouched.
 *
 * This module provides the vocabulary: parse and compare version markers,
 * classify them into observed format eras, probe a document's structure,
 * and produce a {@link CompatibilityReport} that tells a caller exactly
 * what this library can and cannot do with the file in front of it.
 */
import type { ObjectStore } from "./store.ts";
import { typeName } from "./registry.ts";

/** A dotted version marker ("14.1.1") or packed triple ([2, 0, 24]). */
export class IWorkVersion {
  readonly parts: readonly number[];

  constructor(parts: readonly number[]) {
    this.parts = parts;
  }

  static parse(value: string | readonly number[] | undefined): IWorkVersion | undefined {
    if (value === undefined) return undefined;
    if (typeof value !== "string") {
      return value.length > 0 ? new IWorkVersion([...value]) : undefined;
    }
    const parts = value
      .trim()
      .split(".")
      .map((p) => Number.parseInt(p, 10));
    if (parts.length === 0 || parts.some((p) => !Number.isFinite(p))) return undefined;
    return new IWorkVersion(parts);
  }

  get major(): number {
    return this.parts[0] ?? 0;
  }

  /** Negative when this < other, 0 when equal, positive when this > other. */
  compare(other: IWorkVersion): number {
    const len = Math.max(this.parts.length, other.parts.length);
    for (let i = 0; i < len; i++) {
      const diff = (this.parts[i] ?? 0) - (other.parts[i] ?? 0);
      if (diff !== 0) return diff;
    }
    return 0;
  }

  gte(other: IWorkVersion): boolean {
    return this.compare(other) >= 0;
  }

  toString(): string {
    return this.parts.join(".");
  }
}

/**
 * Observed format eras, derived from the `fileFormatVersion` marker in
 * `Metadata/Properties.plist` (mirrored by
 * `TSP.PackageMetadata.file_format_version`).
 *
 * The numbering discontinuity is real: Apple used a format-specific counter
 * (1.x → 3.x) through 2019, then switched to mirroring the **application**
 * version (10.x with Pages/Numbers/Keynote 10 in 2020, up to 14.x), then to
 * year-based versioning (26.x) in 2025. Eras are ordered, so
 * `eraAtLeast(era, "modern")` is a meaningful test.
 */
export const IWORK_ERAS = ["iwork13", "iwork16", "iwork19", "modern", "current", "future"] as const;
export type IWorkEra = (typeof IWORK_ERAS)[number];

export interface EraInfo {
  era: IWorkEra;
  label: string;
  /** Approximate application releases that write this era's marker. */
  apps: string;
}

const ERA_INFO: Record<IWorkEra, EraInfo> = {
  iwork13: { era: "iwork13", label: "iWork '13", apps: "Pages 5.x / Numbers 3.x / Keynote 6.x (2013–2014)" },
  iwork16: { era: "iwork16", label: "iWork '15–'16", apps: "Pages 6.x / iOS 2.x builds (2015–2016)" },
  iwork19: {
    era: "iwork19",
    label: "iWork '18–'19",
    // The pre-jump sequence ran 1.x → 2.x → 3.x → 4.x before the 2020
    // renumbering; both 3.x and 4.x land in this era.
    apps: "Pages 7.x–8.x, format 3.x–4.x (2017–2019)",
  },
  modern: {
    era: "modern",
    label: "iWork 10–14",
    apps: "Pages/Numbers/Keynote 10–14 (2020–2024); e.g. build M14.5 writes 14.4.1",
  },
  current: {
    era: "current",
    label: "iWork 26.x",
    // The marketing version jumped to 26 while internal builds continued
    // from 15.x, so the build string does NOT match the format version:
    // build M15.1 writes 26.0.0; builds M15.2/M15.2.1 write 26.1.0.
    apps: "the 2025/2026 year-versioned releases (internal builds M15.x)",
  },
  future: { era: "future", label: "newer than known", apps: "released after this library's last survey" },
};

/** Highest format major version this library has actually seen documented. */
export const HIGHEST_KNOWN_FORMAT_MAJOR = 26;

/** Classify a `fileFormatVersion` marker into its era. */
export function eraOf(version: IWorkVersion | undefined): IWorkEra {
  if (!version) return "modern"; // no marker: assume contemporary, probe structurally
  const major = version.major;
  if (major <= 1) return "iwork13";
  if (major === 2) return "iwork16";
  if (major <= 9) return "iwork19";
  if (major <= 14) return "modern";
  if (major <= HIGHEST_KNOWN_FORMAT_MAJOR) return "current";
  return "future";
}

export function eraInfo(era: IWorkEra): EraInfo {
  return ERA_INFO[era];
}

/** Ordering test over {@link IWORK_ERAS}. */
export function eraAtLeast(era: IWorkEra, minimum: IWorkEra): boolean {
  return IWORK_ERAS.indexOf(era) >= IWORK_ERAS.indexOf(minimum);
}

/**
 * Structural facts probed from a document — the inputs behavioral decisions
 * are actually made from. Every field here is observed, never inferred from
 * a version number.
 */
export interface StructuralProbe {
  /** Container shape: how the package was zipped. */
  containerLayout: "flat" | "nested-index-zip" | "wrapper-directory";
  /** Object types present that this library's registry does not know. */
  unknownTypeIds: number[];
  /** Count of objects carrying those unknown types. */
  unknownTypeObjectCount: number;
  /**
   * Archives using the merge/patch encoding (should_merge, or a type-0 diff
   * payload). Their payloads are preserved but not interpreted.
   */
  patchArchiveCount: number;
  /**
   * Archives holding several complete messages (each with its own type).
   * Normal in modern documents — all payloads are preserved; only the first
   * is exposed through the typed model.
   */
  multiPayloadArchiveCount: number;
  /** Stylesheets carrying `styles_for_*` per-version snapshots. */
  hasVersionedStyleSnapshots: boolean;
  /** Collaboration session/command-history objects are present. */
  hasCollaborationState: boolean;
  /** Table cell storage generation, when the document has tables. */
  cellStorage: "none" | "v5" | "preBNC" | "mixed";
  /** Objects whose payload could not be parsed as protobuf at all. */
  unparseableObjectCount: number;
}

export interface CompatibilityReport {
  app: string;
  era: IWorkEra;
  eraLabel: string;
  /** `fileFormatVersion` from Properties.plist (authoritative when present). */
  formatVersion: IWorkVersion | undefined;
  /** `TSP.PackageMetadata.file_format_version`. */
  packageFormatVersion: IWorkVersion | undefined;
  /** Minimum reader version the package declares. */
  readVersion: IWorkVersion | undefined;
  writeVersion: IWorkVersion | undefined;
  /**
   * Application build strings from BuildVersionHistory.plist. The prefix
   * identifies the writing platform: `M…` for macOS, `T…` for iOS/iPadOS
   * (both observed writing the same format versions).
   */
  appBuilds: string[];
  probe: StructuralProbe;
  /**
   * True when a load → save round-trip preserves everything this library
   * does not explicitly change. False only for structures we cannot
   * faithfully reproduce.
   */
  canRoundTrip: boolean;
  /** Features present in the file that this library cannot interpret. */
  unsupportedFeatures: string[];
  /** Non-fatal observations worth surfacing to a developer or user. */
  warnings: string[];
}

/** TSS.StylesheetArchive styles_for_* snapshot range. */
const STYLESHEET_VERSIONED_FIRST = 7;
const STYLESHEET_VERSIONED_LAST = 22;
const TSS_STYLESHEET_TYPE = 401;
/** TSCK collaboration archive types (session state, command history). */
const COLLABORATION_TYPES = new Set([218, 226, 227, 228, 229, 230, 255, 256, 257]);
/** TST.TileRowInfo cell-storage fields. */
const TST_TILE_TYPE = 6002;
const TILE_ROW_INFOS = 5;
const TILE_STORAGE_VERSION = 6;
const TILE_LAST_SAVED_IN_BNC = 7;
const ROW_STORAGE_VERSION = 5;
const ROW_CELL_STORAGE_V5 = 6;

/** Probe a loaded document's structure. */
export function probeStructure(store: ObjectStore): StructuralProbe {
  const unknown = new Map<number, number>();
  let patchArchiveCount = 0;
  let multiPayloadArchiveCount = 0;
  let hasVersionedStyleSnapshots = false;
  let hasCollaborationState = false;
  let unparseableObjectCount = 0;
  let sawV5 = false;
  let sawPreBNC = false;

  for (const { obj } of store.allObjects()) {
    if (typeName(obj.type, store.app) === undefined) {
      unknown.set(obj.type, (unknown.get(obj.type) ?? 0) + 1);
    }
    if (obj.isPatchArchive) patchArchiveCount++;
    else if (obj.payloadCount > 1) multiPayloadArchiveCount++;
    if (COLLABORATION_TYPES.has(obj.type)) hasCollaborationState = true;

    let message;
    try {
      message = obj.message;
    } catch {
      unparseableObjectCount++;
      continue;
    }
    try {
      if (obj.type === TSS_STYLESHEET_TYPE && !hasVersionedStyleSnapshots) {
        for (let f = STYLESHEET_VERSIONED_FIRST; f <= STYLESHEET_VERSIONED_LAST; f++) {
          if (message.has(f)) {
            hasVersionedStyleSnapshots = true;
            break;
          }
        }
      }
      if (obj.type === TST_TILE_TYPE) {
        // Authoritative markers; buffer presence alone is unreliable because
        // modern writers also emit stub legacy buffers (see tst/tables.ts).
        const bnc = message.getBool(TILE_LAST_SAVED_IN_BNC);
        const tileVersion = message.getUint(TILE_STORAGE_VERSION);
        let tileIsV5 = bnc === true || (tileVersion !== undefined && tileVersion >= 5);
        let sawAnyRow = false;
        for (const ri of message.getMessages(TILE_ROW_INFOS)) {
          sawAnyRow = true;
          const rowVersion = ri.getUint(ROW_STORAGE_VERSION);
          if (rowVersion !== undefined && rowVersion >= 5) tileIsV5 = true;
          else if ((ri.getBytes(ROW_CELL_STORAGE_V5)?.length ?? 0) > 0) tileIsV5 = true;
        }
        if (tileIsV5) sawV5 = true;
        else if (sawAnyRow) sawPreBNC = true;
      }
    } catch {
      unparseableObjectCount++;
    }
  }

  const cellStorage: StructuralProbe["cellStorage"] =
    sawV5 && sawPreBNC ? "mixed" : sawV5 ? "v5" : sawPreBNC ? "preBNC" : "none";

  return {
    containerLayout: store.container.layout,
    unknownTypeIds: [...unknown.keys()].sort((a, b) => a - b),
    unknownTypeObjectCount: [...unknown.values()].reduce((a, b) => a + b, 0),
    patchArchiveCount,
    multiPayloadArchiveCount,
    hasVersionedStyleSnapshots,
    hasCollaborationState,
    cellStorage,
    unparseableObjectCount,
  };
}

export interface CompatibilityInputs {
  app: string;
  formatVersion: IWorkVersion | undefined;
  packageFormatVersion: IWorkVersion | undefined;
  readVersion: IWorkVersion | undefined;
  writeVersion: IWorkVersion | undefined;
  appBuilds: string[];
  probe: StructuralProbe;
}

/** Combine declared versions and structural probes into a report. */
export function buildCompatibilityReport(inputs: CompatibilityInputs): CompatibilityReport {
  const era = eraOf(inputs.formatVersion ?? inputs.packageFormatVersion);
  const warnings: string[] = [];
  const unsupportedFeatures: string[] = [];
  const probe = inputs.probe;

  if (era === "future") {
    warnings.push(
      `document declares format version ${inputs.formatVersion ?? inputs.packageFormatVersion} — ` +
        `newer than any surveyed release (highest known major ${HIGHEST_KNOWN_FORMAT_MAJOR}). ` +
        `Reading and round-tripping still apply; unrecognized content is preserved verbatim.`,
    );
  }
  if (probe.unknownTypeIds.length > 0) {
    warnings.push(
      `${probe.unknownTypeObjectCount} object(s) use ${probe.unknownTypeIds.length} type ID(s) ` +
        `absent from the bundled registry (${probe.unknownTypeIds.slice(0, 8).join(", ")}` +
        `${probe.unknownTypeIds.length > 8 ? ", …" : ""}). They are preserved byte-for-byte but ` +
        `not interpreted — likely features added after this library's last registry survey.`,
    );
  }
  if (probe.patchArchiveCount > 0) {
    warnings.push(
      `${probe.patchArchiveCount} archive(s) carry older-reader compatibility diffs ` +
        `(type-0 patches tagged with diff_merge_version). They are preserved verbatim but not ` +
        `recomputed, so editing such an object would leave its diffs stale for older apps. ` +
        `Observed only on UI-state objects, which this library does not modify.`,
    );
  }
  if (probe.multiPayloadArchiveCount > 0) {
    warnings.push(
      `${probe.multiPayloadArchiveCount} archive(s) carry more than one message payload; all ` +
        `payloads are preserved, but only the first is exposed through the typed model.`,
    );
  }
  if (probe.cellStorage === "preBNC" || probe.cellStorage === "mixed") {
    unsupportedFeatures.push(
      "pre-BNC table cell storage (iWork '13-era): cell values cannot be decoded",
    );
  }
  if (probe.unparseableObjectCount > 0) {
    warnings.push(
      `${probe.unparseableObjectCount} object payload(s) could not be parsed as protobuf; ` +
        `they are passed through unchanged.`,
    );
  }
  if (probe.hasCollaborationState) {
    warnings.push(
      "document carries iCloud collaboration state; it is preserved but live collaboration " +
        "cannot be joined from a file (see docs/FORMAT.md §13.2).",
    );
  }

  return {
    app: inputs.app,
    era,
    eraLabel: eraInfo(era).label,
    formatVersion: inputs.formatVersion,
    packageFormatVersion: inputs.packageFormatVersion,
    readVersion: inputs.readVersion,
    writeVersion: inputs.writeVersion,
    appBuilds: inputs.appBuilds,
    probe,
    // Round-tripping depends only on faithful byte preservation, which the
    // RawMessage/container layers guarantee regardless of era or unknowns.
    canRoundTrip: probe.unparseableObjectCount === 0,
    unsupportedFeatures,
    warnings,
  };
}

/** One-line human summary of a report. */
export function summarizeCompatibility(report: CompatibilityReport): string {
  const version = report.formatVersion?.toString() ?? "unknown";
  const build = report.appBuilds.at(-1);
  return (
    `${report.app} document, format ${version} (${report.eraLabel}` +
    `${build ? `, saved by ${build}` : ""}), ${report.probe.containerLayout} layout; ` +
    `${report.unsupportedFeatures.length === 0 ? "fully supported" : `${report.unsupportedFeatures.length} unsupported feature(s)`}` +
    `${report.warnings.length > 0 ? `, ${report.warnings.length} warning(s)` : ""}`
  );
}
