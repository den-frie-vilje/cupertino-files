/**
 * Tables of contents (TSWP.TOCInfoArchive).
 *
 * A TOC in iWork is not text. It is a drawable — a shape whose contents the
 * app regenerates — carrying two separate things:
 *
 *  - **Settings**: which paragraph styles are collected, at which level,
 *    and which style renders each collected line. This is what the user
 *    edits, and what survives a document round-trip.
 *  - **Entry instances**: the *result* of the last regeneration — heading
 *    text and the page it landed on. These are a cache. Page numbers come
 *    from layout, which this library does not perform, so entries can be
 *    read but writing one would be asserting a page number nobody computed.
 *
 * That split is why this module reads both and only lets you write the
 * first. A TOC whose settings you changed is correct as soon as the app
 * repaginates; a TOC whose cached page numbers you invented is wrong until
 * someone notices.
 */
import { protoFields } from "../proto/fields.ts";
import type { IwaObject } from "../tsp/iwa.ts";
import type { ObjectStore } from "../tsp/store.ts";
import { makeRef, refId } from "../tsp/schema.ts";
import { RawMessage } from "../base/protobuf.ts";
import { ShapeInfo } from "./schema.ts";

/** TSWP archive type ids for the TOC family, from the type registry. */
export const TOC_TYPE = {
  ENTRY_STYLE: 2026,
  SETTINGS: 2051,
  ENTRY_INSTANCE: 2052,
  INFO: 2240,
  ATTACHMENT: 2241,
} as const;

/** TSWP.TOCInfoArchive. */
export const TocInfo = protoFields("TSWP.TOCInfoArchive", {
  SUPER: "super",
  SETTINGS: "toc_settings",
  ENTRY_DATA: "toc_entry_data",
  PAGE_NUMBER_RANGES: "page_number_ranges",
  SYNC_WITH_NAVIGATOR: "sync_toc_settings_with_toc_navigator",
});

/** TSWP.TOCSettingsArchive. */
export const TocSettings = protoFields("TSWP.TOCSettingsArchive", { NAME: "toc_name", SCOPE: "toc_scope", ENTRIES: "entries" });
/** TSWP.TOCSettingsArchive.TOCEntryData. */
export const TocEntryData = protoFields("TSWP.TOCSettingsArchive.TOCEntryData", {
  PARAGRAPH_STYLE: "paragraph_style",
  TOC_ENTRY_STYLE: "toc_entry_style",
  SHOW_IN_TOC: "show_in_toc",
});

/** TSWP.TOCEntryInstanceArchive — the cached result of a regeneration. */
export const TocEntryInstance = protoFields("TSWP.TOCEntryInstanceArchive", {
  PARAGRAPH_INDEX: "paragraph_index",
  PAGE_NUMBER: "page_number",
  NUMBER_FORMAT: "number_format",
  HEADING: "heading",
  INDEXED_STYLE: "indexed_style",
  INDEXED_LIST_STYLE: "indexed_list_style",
  INDEXED_LIST_START: "indexed_list_start",
  INDEXED_PARAGRAPH_LEVEL: "indexed_paragraph_level",
  NUMBER_FORMAT_NAME: "number_format_name",
});

/** What a TOC collects from. */
export const TocScope = {
  DOCUMENT: 0,
  SECTION: 1,
} as const;

/** One rule: "collect paragraphs of this style, render them like that". */
export interface TocRule {
  /** The paragraph style collected, if it resolves. */
  paragraphStyleId: bigint | undefined;
  /** Style the collected line is rendered in. */
  entryStyleId: bigint | undefined;
  /** Whether this style contributes to the TOC at all. */
  included: boolean;
}

/** A line the app produced the last time it regenerated the TOC. */
export interface TocEntry {
  /** Paragraph this line came from, indexed within the source storage. */
  paragraphIndex: number;
  /** Page it landed on — a layout result, not something we can compute. */
  pageNumber: number;
  heading: string;
  /** Outline depth, where the source paragraph was in a list. */
  level: number | undefined;
}

export class TableOfContents {
  readonly store: ObjectStore;
  readonly object: IwaObject;

  constructor(store: ObjectStore, object: IwaObject) {
    this.store = store;
    this.object = object;
  }

  get id(): bigint {
    return this.object.identifier;
  }

  /** The TOC's own name, as shown in the navigator. */
  get name(): string | undefined {
    return this.settings()?.message.getString(TocSettings.NAME);
  }

  set name(value: string) {
    const settings = this.settings();
    if (!settings) throw new RangeError(`TOC ${this.id} has no settings archive`);
    settings.message.setString(TocSettings.NAME, value);
  }

  /** Whether the TOC collects from the whole document or just its section. */
  get scope(): number | undefined {
    return this.settings()?.message.getUint(TocSettings.SCOPE);
  }

  set scope(value: number) {
    const settings = this.settings();
    if (!settings) throw new RangeError(`TOC ${this.id} has no settings archive`);
    settings.message.setVarint(TocSettings.SCOPE, value);
  }

  private settings(): IwaObject | undefined {
    return this.store.resolve(refId(this.object.message, TocInfo.SETTINGS));
  }

  /** Which paragraph styles the TOC collects, and how each is rendered. */
  rules(): TocRule[] {
    const settings = this.settings();
    return (settings?.message.getMessages(TocSettings.ENTRIES) ?? []).map((entry) => ({
      paragraphStyleId: refId(entry, TocEntryData.PARAGRAPH_STYLE),
      entryStyleId: refId(entry, TocEntryData.TOC_ENTRY_STYLE),
      // Absent means included: Apple writes the flag only to turn one off.
      included: entry.getBool(TocEntryData.SHOW_IN_TOC) ?? true,
    }));
  }

  /**
   * Turn collection of a paragraph style on or off.
   *
   * Changing which styles are collected is a settings edit, so it survives
   * as an instruction the app acts on at its next repagination — unlike the
   * cached entries, which this library will not invent.
   */
  setIncluded(paragraphStyleId: bigint, included: boolean): boolean {
    const settings = this.settings();
    if (!settings) return false;
    for (const entry of settings.message.getMessages(TocSettings.ENTRIES)) {
      if (refId(entry, TocEntryData.PARAGRAPH_STYLE) !== paragraphStyleId) continue;
      entry.setBool(TocEntryData.SHOW_IN_TOC, included);
      return true;
    }
    return false;
  }

  /** Add a collection rule for a paragraph style that has none. */
  addRule(paragraphStyleId: bigint, entryStyleId?: bigint): void {
    const settings = this.settings();
    if (!settings) throw new RangeError(`TOC ${this.id} has no settings archive`);
    if (this.rules().some((rule) => rule.paragraphStyleId === paragraphStyleId)) {
      this.setIncluded(paragraphStyleId, true);
      return;
    }
    const entry = RawMessage.create();
    entry.setMessage(TocEntryData.PARAGRAPH_STYLE, makeRef(paragraphStyleId));
    if (entryStyleId !== undefined) {
      entry.setMessage(TocEntryData.TOC_ENTRY_STYLE, makeRef(entryStyleId));
    }
    entry.setBool(TocEntryData.SHOW_IN_TOC, true);
    settings.message.addMessage(TocSettings.ENTRIES, entry);
    settings.setObjectReferences([
      ...new Set([...settings.getObjectReferences(), paragraphStyleId, ...(entryStyleId !== undefined ? [entryStyleId] : [])]),
    ]);
  }

  /**
   * The lines the app produced last time it regenerated this TOC.
   *
   * A cache, not a source of truth: page numbers come from layout. They are
   * accurate for a document nobody has edited since the app last saved it,
   * and stale for one this library has changed.
   */
  entries(): TocEntry[] {
    const out: TocEntry[] = [];
    for (const ref of this.object.message.getMessages(TocInfo.ENTRY_DATA)) {
      const instance = this.store.resolve(ref.getVarint(1));
      if (!instance) continue;
      const m = instance.message;
      out.push({
        paragraphIndex: m.getUint(TocEntryInstance.PARAGRAPH_INDEX) ?? 0,
        pageNumber: m.getUint(TocEntryInstance.PAGE_NUMBER) ?? 0,
        heading: m.getString(TocEntryInstance.HEADING) ?? "",
        level: m.getUint(TocEntryInstance.INDEXED_PARAGRAPH_LEVEL),
      });
    }
    return out;
  }

  /**
   * True when this session has edited the TOC or its settings.
   *
   * Only detects changes made through this library since the document was
   * loaded — a TOC that was already stale when Apple saved it looks clean.
   * Use {@link verifyAgainst} to compare the cache against actual text.
   */
  get entriesAreStale(): boolean {
    return this.object.isDirty || this.settings()?.isDirty === true;
  }

  /**
   * Compare cached headings against the paragraphs they came from.
   *
   * The only staleness check that survives a reload. Entry instances record
   * a paragraph index but not *which* storage it indexes, so the caller
   * supplies the one to check — normally the document body. A mismatch
   * means the app has not regenerated the TOC since the text changed.
   *
   * Page numbers are not checked: they come from layout, and nothing here
   * performs layout, so a page number can only ever be taken on trust.
   */
  verifyAgainst(paragraphs: readonly { text: string }[]): {
    entry: TocEntry;
    actual: string | undefined;
  }[] {
    const mismatches: { entry: TocEntry; actual: string | undefined }[] = [];
    for (const entry of this.entries()) {
      const actual = paragraphs[entry.paragraphIndex]?.text;
      // Headings are stored without the paragraph's trailing whitespace.
      if (actual?.trim() !== entry.heading.trim()) mismatches.push({ entry, actual });
    }
    return mismatches;
  }

  /** The shape that holds the rendered TOC text, when it has one. */
  shapeStorageId(): bigint | undefined {
    const shape = this.object.message.getMessage(TocInfo.SUPER);
    return shape ? refId(shape, ShapeInfo.OWNED_STORAGE) : undefined;
  }
}

/** Every table of contents in a document. */
export function tablesOfContents(store: ObjectStore): TableOfContents[] {
  const out: TableOfContents[] = [];
  for (const { obj } of store.allObjects()) {
    if (obj.type === TOC_TYPE.INFO) out.push(new TableOfContents(store, obj));
  }
  return out;
}
