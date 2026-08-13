/**
 * TSWP.StorageArchive wrapper: read and edit rich text held in any iWork
 * text storage (document body, headers, footers, text boxes, notes, cells).
 *
 * Model recap (see docs/FORMAT.md):
 *  - `text[0]` holds the storage's whole plain text; paragraphs are
 *    terminated by "\n", inline attachments sit at U+FFFC characters.
 *  - Formatting is run-length data in attribute tables keyed by UTF-16
 *    code-unit index (JS string indexing matches exactly).
 *  - Paragraph-aligned object tables (para/list/layout style) carry one entry
 *    per paragraph; an entry with no object means "same as previous".
 *  - Character tables (char style, smart fields, language, …) are sparse
 *    runs; an entry with no value ends the previous run.
 *
 * Every edit goes through {@link TextStorage.replaceRange}, which rewrites
 * the text and adjusts ALL attribute tables so no index ever points past the
 * end of text (stale indexes are a known crash source in the apps).
 */
import { protoEnum } from "../proto/fields.ts";
import type { IwaObject } from "../tsp/iwa.ts";
import { RawMessage } from "../base/protobuf.ts";
import type { ObjectStore } from "../tsp/store.ts";
import {
  ATTR_TABLE_ENTRIES,
  BookmarkField,
  CharProps,
  DrawableAttachment,
  ENTRY_CHARACTER_INDEX,
  ENTRY_OBJECT,
  ENTRY_PARA_FIRST,
  ENTRY_PARA_SECOND,
  FootnoteRefAttachment,
  Highlight,
  HyperlinkField,
  OBJECT_TABLE_FIELDS,
  OVERLAP_FIELD,
  OVERLAP_RANGE,
  OVERLAP_TABLE_FIELDS,
  PARA_ALIGNED_OBJECT_TABLES,
  PARA_DATA_TABLE_FIELDS,
  POINT_ANCHORED_OBJECT_TABLES,
  Storage,
  STRING_TABLE_FIELDS,
  StyleArchive,
  TSWP_TYPE,
} from "./schema.ts";
import { makeRef, RANGE_LENGTH, RANGE_LOCATION, refId } from "../tsp/schema.ts";
import { TSD_TYPE } from "../tsd/schema.ts";
import { StylesheetModel, type CharacterFormatting } from "../tss/stylesheet.ts";
import { ParagraphHandle, TextRange } from "./range.ts";
import { typeName } from "../tsp/registry.ts";
import {
  ATTACHMENT_TYPE,
  AttachmentKind,
  SMART_FIELD_TYPE,
  TextualAttachment,
  buildBookmark,
  buildDateField,
  buildNumberAttachment,
  buildPlaceholderField,
  readDateField,
  readNumberAttachment,
  type DateFieldOptions,
  type NumberAttachmentInfo,
  type NumberAttachmentOptions,
} from "./fields.ts";
import {
  buildComment,
  readCommentStorage,
  type AddCommentOptions,
  type CommentInfo,
} from "./comments.ts";

/**
 * U+FFFC OBJECT REPLACEMENT CHARACTER — the placeholder every inline
 * attachment occupies. One character of text standing in for something the
 * app renders: a page number, a footnote mark, an anchored drawable.
 */
export const OBJECT_REPLACEMENT_CHARACTER = "\uFFFC";

/**
 * U+000E SHIFT OUT — the character a footnote *reference* occupies.
 *
 * Not U+FFFC. Footnote references live in their own table and use their own
 * anchor character; the placeholder inside the note, where the number is
 * drawn, is a U+FFFC like any other attachment. Confusing the two produces
 * a document whose footnote marks do not appear.
 */
export const FOOTNOTE_MARK_CHARACTER = "\u000E";

/** TSWP.StorageArchive.KindType — which container a storage belongs to. */
export const STORAGE_KIND = protoEnum("TSWP.StorageArchive.KindType", {
  BODY: "BODY",
  HEADER: "HEADER",
  FOOTNOTE: "FOOTNOTE",
  TEXTBOX: "TEXTBOX",
  NOTE: "NOTE",
  CELL: "CELL",
  UNCLASSIFIED: "UNCLASSIFIED",
  TABLE_OF_CONTENTS: "TABLEOFCONTENTS",
  UNDEFINED: "UNDEFINED",
});

/**
 * Characters that end a paragraph.
 *
 * **Not just `\n`.** Treating `charCodeAt(i) === 10` as the only terminator
 * is wrong in a way nothing offline can show: reader and writer agree with
 * each other, so every round trip is clean, while Pages disagrees about
 * where paragraphs begin. Since `writeParagraphTable` rebuilds
 * `table_para_style` from *our* paragraph starts, any boundary this
 * predicate fails to see has its style entry silently dropped, and Pages
 * renders the body unstyled.
 *
 * The set is measured, not guessed. Across the Pages fixtures, taking every
 * `table_para_style` entry at index > 0 and looking at the character just
 * before it gives:
 *
 * | before an entry | count | meaning |
 * | --- | ---: | --- |
 * | `U+000A` | 2002 | line feed |
 * | `U+0004` | 28 | section break |
 * | `U+0005` | 17 | layout/column break |
 * | `U+000C` | 1 | page break |
 *
 * `U+2028` is the instructive one: it occurs 205 times in the same corpus
 * and is **never** followed by an entry. It is a soft line break inside a
 * paragraph — a shift-return — and treating it as a terminator would break
 * the mapping just as thoroughly in the other direction.
 */
/** Edit-start log per storage object; see TextStorage#editStarts. */
const EDIT_STARTS = new WeakMap<IwaObject, number[]>();

function isParagraphTerminator(code: number): boolean {
  return code === 0x0a || code === 0x04 || code === 0x05 || code === 0x0c;
}

/**
 * The six fields every storage in the corpus carries.
 *
 * `table_para_style`, `table_para_data`, `table_list_style`,
 * `table_para_starts`, `table_para_bidi` and `in_document` are present on
 * **2676 of 2676** storages across these fixtures — all nine kinds, all
 * three apps, every era of writer. A storage built from just a kind, a
 * stylesheet and a string lacks all six, and nothing offline objects:
 * every one of the six is `optional`, the archive round-trips,
 * `required:check` passes, and the reader gives the text back unchanged.
 * But `table_para_style` is where a paragraph's style *lives* — a storage
 * without it has no styled paragraph at all, and the identical omission in
 * a body storage renders the whole document unstyled in Pages. This fills
 * the shape in at the one place a storage gets made from scratch rather
 * than edited.
 *
 * The values are Apple's, measured on footnote storages: one entry at
 * character 0 in each table, `{0, 0, 0}` for the para-data triples, and
 * `in_document` true.
 */
function fillStorageShape(
  m: RawMessage,
  styles: { paragraphStyle?: bigint; listStyle?: bigint },
): void {
  // `ObjectAttribute.object` is optional, so an entry with no style is
  // well-formed — but it is also the shape that means "unstyled", so the
  // table is only written when there is a style to name.
  const objectTable = (styleId: bigint | undefined): RawMessage | undefined => {
    if (styleId === undefined) return undefined;
    const entry = RawMessage.create();
    entry.setVarint(ENTRY_CHARACTER_INDEX, 0);
    entry.setMessage(ENTRY_OBJECT, makeRef(styleId));
    const table = RawMessage.create();
    table.addMessage(ATTR_TABLE_ENTRIES, entry);
    return table;
  };
  const paraData = (): RawMessage => {
    const entry = RawMessage.create();
    entry.setVarint(ENTRY_CHARACTER_INDEX, 0);
    entry.setVarint(ENTRY_PARA_FIRST, 0);
    entry.setVarint(ENTRY_PARA_SECOND, 0);
    const table = RawMessage.create();
    table.addMessage(ATTR_TABLE_ENTRIES, entry);
    return table;
  };

  const para = objectTable(styles.paragraphStyle);
  if (para) m.setMessage(Storage.TABLE_PARA_STYLE, para);
  const list = objectTable(styles.listStyle);
  if (list) m.setMessage(Storage.TABLE_LIST_STYLE, list);
  m.setMessage(Storage.TABLE_PARA_DATA, paraData());
  m.setMessage(Storage.TABLE_PARA_STARTS, paraData());
  m.setMessage(Storage.TABLE_PARA_BIDI, paraData());
  m.setBool(Storage.IN_DOCUMENT, true);
}

export interface ParagraphInfo {
  index: number;
  /** UTF-16 offset of the first character. */
  start: number;
  /** UTF-16 offset just past the last character (excluding the "\n"). */
  end: number;
  text: string;
  /** Effective paragraph style object identifier, if any. */
  styleId: bigint | undefined;
}

export interface StyleRun {
  start: number;
  end: number;
  /** Style/object identifier in effect for this run (undefined = none). */
  objectId: bigint | undefined;
}

export class TextStorage {
  readonly store: ObjectStore;
  readonly object: IwaObject;

  constructor(store: ObjectStore, object: IwaObject) {
    this.store = store;
    this.object = object;
  }

  get id(): bigint {
    return this.object.identifier;
  }

  private get msg(): RawMessage {
    return this.object.message;
  }

  /**
   * The start offset of every edit made to this storage, in order — keyed
   * by the underlying object, since wrapper instances are created freely.
   * A captured offset stays meaningful as long as every later edit began
   * at or after it — nothing under it has moved — which is what lets
   * {@link TextRange} tell a still-valid range from a stale one and refuse
   * the stale one loudly instead of editing the wrong span.
   */
  private get editStarts(): number[] {
    let starts = EDIT_STARTS.get(this.object);
    if (!starts) {
      starts = [];
      EDIT_STARTS.set(this.object, starts);
    }
    return starts;
  }

  /** Edit count; pair with {@link offsetsStableSince} for staleness checks. */
  get revision(): number {
    return this.editStarts.length;
  }

  /** True when every edit made after `revision` began at or after `end`. */
  offsetsStableSince(revision: number, end: number): boolean {
    for (let i = revision; i < this.editStarts.length; i++) {
      if (this.editStarts[i]! < end) return false;
    }
    return true;
  }

  get kind(): number {
    return this.msg.getUint(Storage.KIND) ?? 3;
  }

  /** Identifier of the TSS.StylesheetArchive governing this storage. */
  get stylesheetId(): bigint | undefined {
    return refId(this.msg, Storage.STYLE_SHEET);
  }

  /**
   * A style of `type` named `name`, from this storage's stylesheet chain.
   *
   * Not a general style lookup — `StylesheetModel` is that — but the small
   * amount of it needed here, without `tswp` having to depend on `tss`. A
   * new storage has to name a paragraph style and a list style, and the
   * ones it wants ("Footnote", "None") are already in the document.
   */
  private styleNamed(name: string, type: number): bigint | undefined {
    const seen = new Set<bigint>();
    for (let sheet = this.stylesheetId; sheet !== undefined && !seen.has(sheet); ) {
      seen.add(sheet);
      const obj = this.store.resolve(sheet);
      if (!obj) return undefined;
      for (const ref of obj.message.getMessages(1)) {
        const style = this.store.resolve(ref.getVarint(1));
        if (style?.type !== type) continue;
        if (style.message.getMessage(1)?.getString(1) === name) return style.identifier;
      }
      sheet = refId(obj.message, 3); // TSS.StylesheetArchive.parent
    }
    return undefined;
  }

  get text(): string {
    const parts = this.msg.getStrings(Storage.TEXT);
    if (parts.length > 1) {
      throw new RangeError(
        `storage ${this.id}: multiple text elements are not supported for editing`,
      );
    }
    return parts[0] ?? "";
  }

  /** UTF-16 offsets where paragraphs begin. Always includes 0 for non-empty text. */
  paragraphStarts(text = this.text): number[] {
    if (text.length === 0) return [0];
    const starts = [0];
    for (let i = 0; i < text.length - 1; i++) {
      if (isParagraphTerminator(text.charCodeAt(i))) starts.push(i + 1);
    }
    return starts;
  }

  paragraphs(): ParagraphInfo[] {
    const text = this.text;
    const starts = this.paragraphStarts(text);
    const styles = this.paragraphValues(Storage.TABLE_PARA_STYLE, starts, text);
    return starts.map((start, i) => {
      let end = start;
      while (end < text.length && !isParagraphTerminator(text.charCodeAt(end))) end++;
      return { index: i, start, end, text: text.slice(start, end), styleId: styles[i] };
    });
  }

  /**
   * Effective object id per paragraph for a paragraph-aligned object table
   * (an entry without an object carries the previous value forward).
   */
  private paragraphValues(
    tableField: number,
    starts: number[],
    _text: string,
  ): (bigint | undefined)[] {
    return this.effectiveObjectsAt(tableField, starts);
  }

  /**
   * Decode an object table into runs. `objectId` undefined covers both "no
   * attribute" and "continues previous" — for paragraph-aligned tables the
   * effective value carries forward (see {@link paragraphValues}).
   */
  objectRuns(tableField: number, textLength = this.text.length): StyleRun[] {
    const table = this.msg.getMessage(tableField);
    if (!table) return [];
    const entries = table.getMessages(ATTR_TABLE_ENTRIES);
    const runs: StyleRun[] = [];
    for (let i = 0; i < entries.length; i++) {
      const start = entries[i]!.getUint(ENTRY_CHARACTER_INDEX) ?? 0;
      const end =
        i + 1 < entries.length
          ? (entries[i + 1]!.getUint(ENTRY_CHARACTER_INDEX) ?? textLength)
          : textLength;
      runs.push({ start, end, objectId: refId(entries[i], ENTRY_OBJECT) });
    }
    return runs;
  }

  /**
   * Effective object ids at many positions in one pass.
   *
   * `positions` must be ascending. Doing this per position would rescan the
   * whole table each time, which is quadratic on long documents (a 500-
   * paragraph body has 500 entries per paragraph-aligned table).
   */
  private effectiveObjectsAt(tableField: number, positions: readonly number[]): (bigint | undefined)[] {
    const table = this.msg.getMessage(tableField);
    if (!table) return positions.map(() => undefined);
    const entries = table.getMessages(ATTR_TABLE_ENTRIES).map((e) => ({
      index: e.getUint(ENTRY_CHARACTER_INDEX) ?? 0,
      id: refId(e, ENTRY_OBJECT),
    }));
    const carryForward = PARA_ALIGNED_OBJECT_TABLES.includes(tableField);
    const out: (bigint | undefined)[] = [];
    let cursor = 0;
    let value: bigint | undefined;
    for (const pos of positions) {
      while (cursor < entries.length && entries[cursor]!.index <= pos) {
        const id = entries[cursor]!.id;
        // A char-table entry with no object clears the run; for
        // paragraph-aligned tables an unset entry means "carry forward".
        if (id !== undefined) value = id;
        else if (!carryForward) value = undefined;
        cursor++;
      }
      out.push(value);
    }
    return out;
  }

  /**
   * The character style ruling `pos`, or `undefined` when no direct
   * character styling applies there and the paragraph style alone rules —
   * the normal state of most text. Resolve a name with
   * {@link styleNameOf}.
   */
  characterStyleIdAt(pos: number): bigint | undefined {
    return this.effectiveObjectAt(Storage.TABLE_CHAR_STYLE, pos);
  }

  /**
   * The formatting in effect at `pos`, with inheritance folded in: the
   * paragraph style's character bag as the base, the character-style
   * chain's values on top — id in, effective {@link CharacterFormatting}
   * out, no schema knowledge needed.
   */
  characterFormattingAt(pos: number): CharacterFormatting {
    const sheet = this.sheet();
    if (!sheet) return {};
    const resolve = (id: bigint | undefined) =>
      id === undefined ? undefined : sheet.style(id)?.resolved().character;
    const base = resolve(this.effectiveObjectAt(Storage.TABLE_PARA_STYLE, pos));
    const overlay = resolve(this.characterStyleIdAt(pos));
    return { ...base, ...overlay };
  }

  /**
   * Effective object id at a position — the last value set at or before
   * `pos` in the given attribute table.
   *
   * `tableField` is a `Storage.*` field number (e.g.
   * `Storage.TABLE_CHAR_STYLE`), not a name. `undefined` means no run
   * entry rules the position: for the character table that is "no direct
   * character styling here — the paragraph style alone applies", which is
   * the normal state of most text, not an error.
   */
  effectiveObjectAt(tableField: number, pos: number): bigint | undefined {
    if (typeof tableField !== "number" || !Number.isInteger(tableField)) {
      throw new TypeError(
        `effectiveObjectAt: tableField must be a Storage.* field number ` +
          `(e.g. Storage.TABLE_CHAR_STYLE), got ${typeof tableField}`,
      );
    }
    let value: bigint | undefined;
    const table = this.msg.getMessage(tableField);
    if (!table) return undefined;
    for (const e of table.getMessages(ATTR_TABLE_ENTRIES)) {
      const idx = e.getUint(ENTRY_CHARACTER_INDEX) ?? 0;
      if (idx > pos) break;
      const id = refId(e, ENTRY_OBJECT);
      if (id !== undefined) value = id;
      // A char-table entry with no object explicitly clears the run; for
      // paragraph-aligned tables an unset entry means "carry forward", so we
      // only clear for non-paragraph tables.
      else if (!PARA_ALIGNED_OBJECT_TABLES.includes(tableField)) value = undefined;
    }
    return value;
  }

  // ----------------------------------------------------------------- editing

  /**
   * Replace [start, end) with `replacement`, fixing up every attribute table.
   * Offsets are UTF-16 code units (plain JS string indexes).
   */
  replaceRange(start: number, end: number, replacement: string): void {
    const oldText = this.text;
    if (start < 0 || end < start || end > oldText.length) {
      throw new RangeError(`replaceRange: invalid range ${start}..${end} (len ${oldText.length})`);
    }
    this.editStarts.push(start);
    const newText = oldText.slice(0, start) + replacement + oldText.slice(end);
    const delta = replacement.length - (end - start);

    // Effective paragraph-aligned values must be computed BEFORE mutation.
    //
    // Text ending with a paragraph terminator has one more paragraph than
    // paragraphStarts() lists: the empty final one after the terminator,
    // whose entry sits at exactly text.length. Corpus-wide, 31 of 31
    // terminator-ending storages carry that entry in the dense para-style
    // table and 0 of 1270 others do; sparse tables declare it only when
    // its value differs, like any paragraph. Treating the position as one
    // more paragraph start makes the one rebuild loop produce every
    // observed shape — and matters: a final empty paragraph left without
    // its para-style entry makes Pages drop styling for the whole body.
    const endsWithTerminator =
      newText.length > 0 && isParagraphTerminator(newText.charCodeAt(newText.length - 1));
    const newStarts = this.paragraphStarts(newText);
    const rebuildStarts = endsWithTerminator ? [...newStarts, newText.length] : newStarts;
    const paraRebuilds = new Map<number, (bigint | undefined)[]>();
    const oldPositions = rebuildStarts.map((s) => {
      // Map each new paragraph start back to a position in the old text.
      const oldPos = s <= start ? s : s >= start + replacement.length ? s - delta : start;
      return Math.min(Math.max(oldPos, 0), oldText.length);
    });
    for (const f of PARA_ALIGNED_OBJECT_TABLES) {
      if (!this.msg.has(f)) continue;
      paraRebuilds.set(f, this.effectiveObjectsAt(f, oldPositions));
    }

    // 1. The text itself.
    this.msg.setString(Storage.TEXT, newText);

    // 2. Character-indexed tables: shift/drop entries.
    //
    // Where an entry may land is table-class law, measured across the
    // corpus's 2921 storages: no table carries an entry past text.length,
    // and the character-content tables never carry one at text.length
    // either — a run reaching the end of the text is left open (0 of 2079
    // character-style entries, 0 of 220 smart-field entries sit at the
    // length). The paragraph-family tables are the exception: they carry
    // an entry at exactly text.length whenever a final empty paragraph
    // exists to describe — empty text, or text ending with a terminator
    // (the phantom paragraph; 1565–1597 such entries per table). A run
    // boundary stranded at the length is a state no app file exhibits,
    // and Pages answers attribute-table states it never writes with
    // document-wide style repair.
    const tailEntryLawful = newText.length === 0 || endsWithTerminator;
    for (const f of [...OBJECT_TABLE_FIELDS, ...STRING_TABLE_FIELDS]) {
      if (PARA_ALIGNED_OBJECT_TABLES.includes(f)) continue; // rebuilt below
      const paragraphFamily = f === Storage.TABLE_SECTION || f === Storage.TABLE_DROP_CAP_STYLE;
      this.shiftIndexedTable(f, start, end, delta, newText.length, paragraphFamily && tailEntryLawful);
    }
    for (const f of PARA_DATA_TABLE_FIELDS) {
      this.shiftIndexedTable(f, start, end, delta, newText.length, tailEntryLawful);
    }
    for (const f of OVERLAP_TABLE_FIELDS) {
      this.shiftOverlapTable(f, start, end, delta);
    }

    // 3. Paragraph-aligned tables: rebuild one entry per paragraph.
    for (const [f, values] of paraRebuilds) {
      this.writeParagraphTable(f, rebuildStarts, values);
    }
    this.ensureTrailingParagraphEntry();
  }

  private shiftIndexedTable(
    tableField: number,
    start: number,
    end: number,
    delta: number,
    newLength: number,
    mayEndAtLength: boolean,
  ): void {
    const table = this.msg.getMessage(tableField);
    if (!table) return;
    const entries = table.getMessages(ATTR_TABLE_ENTRIES);
    if (entries.length === 0) return;
    // An entry at exactly `start` is a run boundary in a run table — it
    // survives a deletion beginning there — but in a point-anchored table
    // it is the anchor of the first deleted character, so it goes with it.
    const anchored = POINT_ANCHORED_OBJECT_TABLES.includes(tableField);
    const kept: RawMessage[] = [];
    let changed = false;
    for (const e of entries) {
      const idx = e.getUint(ENTRY_CHARACTER_INDEX) ?? 0;
      if (anchored ? idx < start : idx <= start) {
        // A deletion reaching the end of the text can leave a boundary at
        // exactly the new length. Unless this table lawfully describes the
        // position (see replaceRange), the entry closes nothing — the run
        // is already bounded by the text end — and goes.
        if (idx >= newLength && !mayEndAtLength) {
          changed = true;
          continue;
        }
        kept.push(e);
      } else if (idx < end) {
        changed = true; // dropped
      } else {
        const shifted = Math.max(0, Math.min(idx + delta, newLength));
        if (shifted >= newLength && !mayEndAtLength) {
          changed = true;
          continue;
        }
        if (shifted !== idx) {
          e.setVarint(ENTRY_CHARACTER_INDEX, shifted);
          changed = true;
        }
        // Collisions (e.g. the entry that defined the run at `end` landing on
        // an entry at `start` after a deletion): the later entry wins.
        while (
          kept.length > 0 &&
          (kept[kept.length - 1]!.getUint(ENTRY_CHARACTER_INDEX) ?? 0) >= shifted
        ) {
          kept.pop();
          changed = true;
        }
        kept.push(e);
      }
    }
    if (changed || kept.length !== entries.length) {
      table.setMessages(ATTR_TABLE_ENTRIES, kept);
    }
  }

  private shiftOverlapTable(tableField: number, start: number, end: number, delta: number): void {
    const table = this.msg.getMessage(tableField);
    if (!table) return;
    const entries = table.getMessages(ATTR_TABLE_ENTRIES);
    if (entries.length === 0) return;
    const kept: RawMessage[] = [];
    let changed = false;
    for (const e of entries) {
      const range = e.getMessage(OVERLAP_RANGE);
      const loc = range?.getUint(RANGE_LOCATION) ?? 0;
      const len = range?.getUint(RANGE_LENGTH) ?? 0;
      if (loc + len <= start) {
        kept.push(e); // entirely before the edit
      } else if (loc >= end) {
        range?.setVarint(RANGE_LOCATION, loc + delta);
        kept.push(e);
        changed = true;
      } else {
        changed = true; // overlaps the edited region — drop
      }
    }
    if (changed) table.setMessages(ATTR_TABLE_ENTRIES, kept);
  }

  /**
   * Rewrite a paragraph-aligned run table.
   *
   * **The density rule is per table, not per document.** Measured over the
   * Pages fixtures, for 2060 paragraphs:
   *
   * | table | entries | every paragraph covered |
   * | --- | ---: | --- |
   * | `table_para_style` | 2067 | 19 of 19 documents |
   * | `table_list_style` | 216 | 3 of 19 (all single-paragraph) |
   * | `table_layout_style` | 20 | 3 of 19 (all single-paragraph) |
   *
   * So `table_para_style` is dense — one entry per paragraph, without
   * exception — while the list and layout tables are sparse, carrying an
   * entry only where the value changes. An entry whose object reference is
   * omitted carries the previous value forward, which is why Apple's dense
   * table still contains entries that look empty.
   *
   * A paragraph with no entry at all is what breaks. Appending a line and
   * leaving it undeclared makes Pages drop the styling for the whole body;
   * the same document with an explicit entry — what `setParagraphStyle`
   * writes — renders correctly. That contrast is the evidence.
   *
   * One rule for all three tables fails both ways. Writing them all dense
   * inflates a single-run list table to one entry per paragraph; writing
   * them all sparse leaves an appended paragraph with no style entry at
   * all. Each is wrong for two of the three.
   *
   * The final empty paragraph of terminator-ending text is a paragraph
   * like any other — `starts` includes its position (= text length), so
   * the same loop covers it: dense table always, sparse tables when its
   * value differs. That is the corpus's exact shape, and the entry is
   * load-bearing — see replaceRange.
   */
  private writeParagraphTable(
    tableField: number,
    starts: number[],
    values: (bigint | undefined)[],
  ): void {
    const table = this.msg.getMessage(tableField);
    if (!table) return;
    const dense = tableField === Storage.TABLE_PARA_STYLE;
    const entries: RawMessage[] = [];
    let carried: bigint | undefined;
    for (let i = 0; i < starts.length; i++) {
      const v = values[i];
      const changed = v !== undefined && v !== carried;
      if (!dense && !changed) continue;
      const entry = RawMessage.create();
      entry.setVarint(ENTRY_CHARACTER_INDEX, starts[i]!);
      if (changed) {
        entry.setMessage(ENTRY_OBJECT, makeRef(v));
        carried = v;
      }
      entries.push(entry);
    }
    table.setMessages(ATTR_TABLE_ENTRIES, entries);
  }

  /**
   * Restore the phantom-paragraph invariant: a text ending with a
   * terminator carries a paragraph-style entry at `text.length` for the
   * empty paragraph the app draws there (31 of 31 corpus body storages;
   * the entry names no style). Pages refuses a file with the terminator
   * and no entry. Idempotent; a no-op when the text ends mid-paragraph.
   */
  ensureTrailingParagraphEntry(): void {
    const text = this.text;
    if (!text.endsWith("\n") && !text.endsWith("\u0004")) return;
    const table = this.msg.getMessage(Storage.TABLE_PARA_STYLE);
    if (!table) return;
    const entries = table.getMessages(ATTR_TABLE_ENTRIES);
    if (entries.some((e) => (e.getUint(ENTRY_CHARACTER_INDEX) ?? 0) === text.length)) return;
    const entry = RawMessage.create();
    entry.setVarint(ENTRY_CHARACTER_INDEX, text.length);
    table.addMessage(ATTR_TABLE_ENTRIES, entry);
  }

  insertText(pos: number, text: string): void {
    this.replaceRange(pos, pos, text);
  }

  deleteRange(start: number, end: number): void {
    this.replaceRange(start, end, "");
  }

  /**
   * Apply several non-overlapping edits from one snapshot of the text.
   *
   * Every edit's offsets refer to the text as it is *now*: the batch is
   * sorted descending internally, so no edit shifts another's offsets and
   * callers need no re-reading discipline between spans. Overlapping
   * edits are refused before anything is written. An omitted
   * `replacement` deletes the range.
   */
  applyEdits(edits: readonly { start: number; end: number; replacement?: string }[]): void {
    const length = this.text.length;
    const sorted = [...edits].sort((a, b) => b.start - a.start || b.end - a.end);
    for (const e of sorted) {
      if (e.start < 0 || e.end < e.start || e.end > length) {
        throw new RangeError(`applyEdits: invalid range ${e.start}..${e.end} (len ${length})`);
      }
    }
    for (let i = 1; i < sorted.length; i++) {
      // Descending order: the previous entry begins at or after this one.
      if (sorted[i]!.end > sorted[i - 1]!.start) {
        throw new RangeError(
          `applyEdits: overlapping edits ${sorted[i]!.start}..${sorted[i]!.end} and ` +
            `${sorted[i - 1]!.start}..${sorted[i - 1]!.end}`,
        );
      }
    }
    for (const e of sorted) this.replaceRange(e.start, e.end, e.replacement ?? "");
  }

  /** Replace the storage's whole text, keeping run structure where possible. */
  setText(text: string): void {
    this.replaceRange(0, this.text.length, text);
  }

  /** Literal find/replace across the storage. Returns replacement count. */
  replaceAll(find: string, replace: string): number {
    if (find.length === 0) throw new RangeError("replaceAll: empty search string");
    let count = 0;
    let from = 0;
    for (;;) {
      const at = this.text.indexOf(find, from);
      if (at === -1) break;
      this.replaceRange(at, at + find.length, replace);
      from = at + replace.length;
      count++;
    }
    return count;
  }

  /**
   * Append a paragraph, preserving the file's trailing-newline convention.
   * Returns the new paragraph's index.
   *
   * The new paragraph states its own list membership rather than
   * inheriting the previous one's: attribute tables are read as runs, so
   * one bulleted paragraph would otherwise turn every later append into
   * a list item — invisibly, because membership lives in the list table
   * and not in the paragraph style. Apple writes the same statement,
   * with a list style named "None" (222 of 222 corpus list-table entries
   * name a style; 82 name that one). Pass a list style to opt in, or
   * call {@link setListStyle} afterwards.
   *
   * Character styling ends at the same seam: a character-style run open
   * at the end of the text is closed before the new paragraph is
   * inserted, so a styled last line never bleeds into what is appended
   * after it. Raw {@link insertText}/{@link replaceRange} keep the
   * typing model — text inserted inside or at the edge of a run takes
   * the run's style.
   *
   * Writing direction is stated the same way: when the storage has a
   * bidi table, the new paragraph gets its own pair, copying the
   * baseline at position 0 — 2594 of the corpus's 2896 bidi-bearing
   * storages cover every paragraph start, and an open-ended RTL entry
   * appears only where no paragraph follows it. Without the statement
   * one flipped paragraph turns every later append RTL.
   */
  appendParagraph(text: string, listStyle?: bigint): number {
    if (text.includes("\n")) throw new RangeError("appendParagraph: text must not contain \\n");
    const current = this.text;
    let index: number;
    if (current.length === 0) {
      this.replaceRange(0, 0, text);
      index = 0;
    } else {
      this.closeCharacterRun(current.length);
      const endsWithNewline = current.endsWith("\n");
      const insertion = endsWithNewline ? `${text}\n` : `\n${text}`;
      this.replaceRange(current.length, current.length, insertion);
      index = this.paragraphStarts().length - 1;
    }
    const list = listStyle ?? this.styleNamed("None", TSWP_TYPE.LIST_STYLE);
    if (list !== undefined || this.listStyleIdAt(index) !== undefined) {
      this.setListStyle(index, list);
    }
    const bidi = this.msg.getMessage(Storage.TABLE_PARA_BIDI)?.getMessages(ATTR_TABLE_ENTRIES);
    if (bidi !== undefined && bidi.length > 0) {
      const start = this.paragraphStarts()[index]!;
      if (!bidi.some((e) => (e.getUint(ENTRY_CHARACTER_INDEX) ?? 0) === start)) {
        const first = this.bidiPairAt(0)[0];
        this.setParagraphDirection(index, first === 1 ? "rtl" : first === 0 ? "ltr" : "natural");
      }
    }
    return index;
  }

  /**
   * True when the text ends with a paragraph terminator, so the app
   * draws one more, empty paragraph after the last one
   * {@link paragraphs} lists.
   *
   * Both tail states are the apps' own. Of the corpus's 26 body
   * storages, 15 end bare — the shape typing leaves, and what a
   * current Pages saves for a document whose last paragraph was typed,
   * not returned past — 8 end with a terminator and carry the
   * paragraph-style entry at `text.length` for the phantom paragraph,
   * and 3 are empty. A built document that should not show a stray
   * final line wants the bare shape; {@link normalizeTail} produces
   * it, keeping every attribute table lawful on the way.
   */
  get endsWithEmptyParagraph(): boolean {
    const text = this.text;
    return text.length > 0 && text.endsWith("\n");
  }

  /**
   * Delete a final trailing `\n` terminator so the text ends the way
   * typed text does — bare, with no empty paragraph drawn after the
   * last line. The phantom paragraph's table entries go with it and
   * any character-style run or smart field ending at the old
   * terminator stays closed exactly where its text ends.
   *
   * Idempotent. A no-op on empty text, a bare tail, or a tail ending
   * with a section, layout or page break — those characters carry
   * structure this call must not remove, and no corpus storage ends
   * with one (all 32 terminator-ending tails are U+000A). Returns
   * whether a terminator was removed.
   */
  normalizeTail(): boolean {
    if (!this.text.endsWith("\n")) return false;
    this.deleteRange(this.text.length - 1, this.text.length);
    return true;
  }

  /** Set (or clear) the paragraph style of one paragraph. */
  setParagraphStyle(paragraphIndex: number, styleId: bigint | undefined): void {
    const text = this.text;
    const starts = this.paragraphStarts(text);
    if (paragraphIndex < 0 || paragraphIndex >= starts.length) {
      throw new RangeError(`paragraph ${paragraphIndex} out of range (${starts.length})`);
    }
    const values = this.paragraphValues(Storage.TABLE_PARA_STYLE, starts, text);
    values[paragraphIndex] = styleId;
    this.ensureTable(Storage.TABLE_PARA_STYLE);
    this.writeParagraphTable(Storage.TABLE_PARA_STYLE, starts, values);
  }

  /**
   * Apply (or clear, with undefined) a character-style object over a range.
   * The previous effective style resumes at `end`.
   *
   * A range ending at `text.length` writes no resume entry — no corpus
   * storage (0 of 2896) carries a character-table entry at `text.length`,
   * so the run is left open there. {@link appendParagraph} closes it when
   * it next extends the text, keeping the styled range at exactly
   * `[start, end)`.
   */
  setCharacterStyleRange(start: number, end: number, styleId: bigint | undefined): void {
    const text = this.text;
    // Integer checks first: a NaN or undefined bound passes every `<`
    // comparison and would only surface as a wire-layer BigInt error.
    if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end <= start || end > text.length) {
      throw new RangeError(`setCharacterStyleRange: invalid range ${start}..${end}`);
    }
    this.ensureTable(Storage.TABLE_CHAR_STYLE);
    const table = this.msg.getMessage(Storage.TABLE_CHAR_STYLE)!;
    const resumeId = this.effectiveObjectAt(Storage.TABLE_CHAR_STYLE, end);
    const entries = table.getMessages(ATTR_TABLE_ENTRIES);

    const kept: RawMessage[] = entries.filter((e) => {
      const idx = e.getUint(ENTRY_CHARACTER_INDEX) ?? 0;
      return idx < start || idx > end;
    });
    const mk = (idx: number, id: bigint | undefined): RawMessage => {
      const e = RawMessage.create();
      e.setVarint(ENTRY_CHARACTER_INDEX, idx);
      if (id !== undefined) e.setMessage(ENTRY_OBJECT, makeRef(id));
      return e;
    };
    kept.push(mk(start, styleId));
    if (end < text.length) kept.push(mk(end, resumeId));
    kept.sort(
      (a, b) => (a.getUint(ENTRY_CHARACTER_INDEX) ?? 0) - (b.getUint(ENTRY_CHARACTER_INDEX) ?? 0),
    );
    table.setMessages(ATTR_TABLE_ENTRIES, kept);
  }

  /** Character-style runs (undefined objectId = paragraph style applies). */
  characterStyleRuns(): StyleRun[] {
    return this.objectRuns(Storage.TABLE_CHAR_STYLE);
  }

  /**
   * Adopt a sibling storage's attribute shape: its paragraph style, and
   * its character-table and language entries when it has them. This is
   * how text written into one of a page master's always-empty
   * header/footer storages becomes drawable — the bare default shape
   * those storages carry is one the app never draws from, while every
   * rendered corpus header/footer storage states its own paragraph
   * style with the char-style table or the language table beside it.
   */
  copyShapeFrom(sibling: TextStorage): void {
    const source = sibling.object.message;
    const firstEntryRef = (tableField: number): bigint | undefined => {
      const entry = source.getMessage(tableField)?.getMessages(ATTR_TABLE_ENTRIES)[0];
      return entry?.getMessage(ENTRY_OBJECT)?.getVarint(1);
    };
    const paraStyle = firstEntryRef(Storage.TABLE_PARA_STYLE);
    if (paraStyle !== undefined) this.setParagraphStyle(0, paraStyle);
    const charStyle = firstEntryRef(Storage.TABLE_CHAR_STYLE);
    if (charStyle !== undefined && this.text.length > 0) {
      this.setCharacterStyleRange(0, this.text.length, charStyle);
    }
    const language = source.getMessage(Storage.TABLE_LANGUAGE)?.getMessages(ATTR_TABLE_ENTRIES)[0];
    if (language) {
      const table = RawMessage.create();
      table.addMessage(ATTR_TABLE_ENTRIES, RawMessage.parse(language.toBytes()));
      this.msg.setMessage(Storage.TABLE_LANGUAGE, table);
    }
  }

  /**
   * End any character-style run open at `index` by writing an objectless
   * entry there — the shape that ends runs throughout the corpus (624 of
   * 2079 character-table entries carry no object; 459 sit directly after
   * a styled run). Text inserted at or after `index` then falls back to
   * the paragraph style instead of extending the run. No-op when nothing
   * is in effect at `index`.
   */
  private closeCharacterRun(index: number): void {
    if (this.effectiveObjectAt(Storage.TABLE_CHAR_STYLE, index) === undefined) return;
    const table = this.msg.getMessage(Storage.TABLE_CHAR_STYLE)!;
    const entries = table
      .getMessages(ATTR_TABLE_ENTRIES)
      .filter((e) => (e.getUint(ENTRY_CHARACTER_INDEX) ?? 0) !== index);
    const boundary = RawMessage.create();
    boundary.setVarint(ENTRY_CHARACTER_INDEX, index);
    entries.push(boundary);
    entries.sort(
      (a, b) => (a.getUint(ENTRY_CHARACTER_INDEX) ?? 0) - (b.getUint(ENTRY_CHARACTER_INDEX) ?? 0),
    );
    table.setMessages(ATTR_TABLE_ENTRIES, entries);
  }

  private ensureTable(tableField: number): void {
    if (this.msg.has(tableField)) return;
    const table = RawMessage.create();
    // Run-shaped tables get a leading objectless entry — "nothing in effect
    // from 0" — which is a marker the corpus itself carries. Point-anchored
    // tables must NOT: there an entry *is* an object at a position, and an
    // objectless one is a null attachment. Across all 107 attachment and
    // footnote tables in the corpus there is not a single objectless entry,
    // and seeding one crashed Pages on open — the app walked the footnote
    // table to number the notes and dereferenced the entry that named
    // nothing. First created-from-nothing table in the ladder, which is why
    // ten confirmed rungs never hit it.
    if (!POINT_ANCHORED_OBJECT_TABLES.includes(tableField)) {
      const entry = RawMessage.create();
      entry.setVarint(ENTRY_CHARACTER_INDEX, 0);
      table.addMessage(ATTR_TABLE_ENTRIES, entry);
    }
    this.msg.setMessage(tableField, table);
  }

  // -------------------------------------------------------- styles & fluency

  /** The stylesheet governing this storage, if resolvable. */
  sheet(): StylesheetModel | undefined {
    const id = this.stylesheetId;
    const obj = id !== undefined ? this.store.object(id) : undefined;
    return obj ? new StylesheetModel(this.store, obj) : undefined;
  }

  /** Resolve a style given by name (searched in the sheet chain) or id. */
  resolveStyle(style: string | bigint, type: number): bigint {
    if (typeof style === "bigint") return style;
    const sheet = this.sheet();
    const found = sheet?.findByName(style, type);
    if (!found) throw new RangeError(`style not found: ${JSON.stringify(style)}`);
    return found.id;
  }

  /**
   * UI name of a style object — the name the app's style panel shows.
   *
   * Direct formatting parents a paragraph on an *anonymous* child of the
   * named style, so the applied object usually carries no name of its
   * own: 644 of 2093 corpus paragraphs sit on such a style, and every
   * one of the 644 has a named ancestor (one fixture's every paragraph
   * does). The name therefore resolves up the parent chain, which is
   * what makes a directly formatted heading still read as "Heading" —
   * and still be collected by a table of contents, which matches on the
   * named style.
   *
   * {@link ownStyleNameOf} answers the literal question instead.
   */
  styleNameOf(styleId: bigint): string | undefined {
    const sheet = this.sheet();
    const seen = new Set<bigint>();
    let id: bigint | undefined = styleId;
    while (id !== undefined && !seen.has(id)) {
      seen.add(id);
      const name = this.ownStyleNameOf(id);
      if (name !== undefined) return name;
      id = sheet?.style(id)?.info.parentId;
    }
    return undefined;
  }

  /**
   * The name written on this style object itself — `undefined` for the
   * anonymous style direct formatting creates. Use it to tell "styled as
   * Heading" from "styled as Heading, then modified here".
   */
  ownStyleNameOf(styleId: bigint): string | undefined {
    return this.store.object(styleId)?.message.getMessage(1)?.getString(1);
  }

  /** A live fluent handle over [start, end). */
  range(start: number, end: number): TextRange {
    return new TextRange(this, start, end);
  }

  /** Fluent handle for one paragraph. */
  paragraph(index: number): ParagraphHandle {
    return new ParagraphHandle(this, index);
  }

  /** Find matches as fluent ranges (string = literal; RegExp honored with /g). */
  find(pattern: string | RegExp): TextRange[] {
    const text = this.text;
    const out: TextRange[] = [];
    if (typeof pattern === "string") {
      if (pattern.length === 0) return out;
      let from = 0;
      for (;;) {
        const at = text.indexOf(pattern, from);
        if (at === -1) break;
        out.push(new TextRange(this, at, at + pattern.length));
        from = at + pattern.length;
      }
      return out;
    }
    const re = pattern.global ? pattern : new RegExp(pattern.source, pattern.flags + "g");
    for (const m of text.matchAll(re)) {
      if (m[0].length > 0) {
        out.push(new TextRange(this, m.index, m.index + m[0].length));
      }
    }
    return out;
  }

  // ------------------------------------------------------------- list styles

  /** Effective list-style object id of a paragraph. */
  listStyleIdAt(paragraphIndex: number): bigint | undefined {
    const text = this.text;
    const starts = this.paragraphStarts(text);
    const start = starts[paragraphIndex];
    if (start === undefined) throw new RangeError(`paragraph ${paragraphIndex} out of range`);
    return this.effectiveObjectAt(Storage.TABLE_LIST_STYLE, start);
  }

  /** Set the list style of a paragraph (see also PagesDocument.setListStyle). */
  setListStyle(paragraphIndex: number, styleId: bigint | undefined): void {
    this.setParagraphTableValue(Storage.TABLE_LIST_STYLE, paragraphIndex, styleId);
  }

  /** Set one paragraph's value in any paragraph-aligned object table. */
  setParagraphTableValue(
    tableField: number,
    paragraphIndex: number,
    styleId: bigint | undefined,
  ): void {
    const text = this.text;
    const starts = this.paragraphStarts(text);
    if (paragraphIndex < 0 || paragraphIndex >= starts.length) {
      throw new RangeError(`paragraph ${paragraphIndex} out of range (${starts.length})`);
    }
    const values = this.paragraphValues(tableField, starts, text);
    values[paragraphIndex] = styleId;
    this.ensureTable(tableField);
    this.writeParagraphTable(tableField, starts, values);
  }

  // -------------------------------------------------------------- hyperlinks

  /** Hyperlink runs in this storage. */
  links(): { start: number; end: number; url: string; fieldId: bigint }[] {
    const out: { start: number; end: number; url: string; fieldId: bigint }[] = [];
    for (const run of this.objectRuns(Storage.TABLE_SMARTFIELD)) {
      if (run.objectId === undefined) continue;
      const field = this.store.object(run.objectId);
      if (field?.type !== TSWP_TYPE.HYPERLINK_FIELD) continue;
      const url = field.message.getString(HyperlinkField.URL_REF) ?? "";
      out.push({ start: run.start, end: run.end, url, fieldId: run.objectId });
    }
    return out;
  }

  /**
   * Make [start, end) a hyperlink. Creates a TSWP.HyperlinkFieldArchive in
   * this storage's component and spans it in the smart-field table.
   *
   * The link also gets the document's **Link character style** — identifier
   * `character-style-hyperlink`, name "Link", property bag `{underline: 1}`
   * in every native Pages fixture that carries links, and shipped by every
   * template in the corpus. The hyperlink *works* without it (the first
   * in-app check clicked through fine) and does not *look* like one: the
   * field makes it live, the style makes it underlined.
   *
   * `characterStyle` overrides the convention: a style id or identifier
   * applies that style instead; `false` leaves the run unstyled — the text
   * keeps whatever formatting it had.
   */
  insertLink(
    start: number,
    end: number,
    url: string,
    options: { characterStyle?: bigint | string | false } = {},
  ): bigint {
    const text = this.text;
    if (start < 0 || end <= start || end > text.length) {
      throw new RangeError(`insertLink: invalid range ${start}..${end}`);
    }
    const component = this.store.componentOf(this.id);
    if (!component) throw new RangeError("storage component not found");
    const field = this.store.createObject(TSWP_TYPE.HYPERLINK_FIELD, component);
    field.message.setMessage(HyperlinkField.SUPER, RawMessage.create());
    field.message.setString(HyperlinkField.URL_REF, url);
    this.spanObject(Storage.TABLE_SMARTFIELD, start, end, field.identifier);
    const style = this.conventionStyle(options.characterStyle, () => this.linkCharacterStyle());
    if (style !== undefined) this.setCharacterStyleRange(start, end, style);
    return field.identifier;
  }

  /**
   * Resolve a convention-style option: `false` skips, an id or identifier
   * overrides, undefined takes the measured default.
   */
  private conventionStyle(
    option: bigint | string | false | undefined,
    fallback: () => bigint,
  ): bigint | undefined {
    if (option === false) return undefined;
    if (typeof option === "bigint") return option;
    if (typeof option === "string") {
      const sheet = this.sheet();
      const found = sheet?.findByIdentifier(option) ?? sheet?.findByName(option, TSWP_TYPE.CHARACTER_STYLE);
      if (!found) throw new RangeError(`character style ${JSON.stringify(option)} not found`);
      return found.id;
    }
    return fallback();
  }

  /**
   * The document's Link character style, created if a template ever lacks
   * one — none in the corpus does, so creation is the untrodden path and
   * says so by matching the measured shape exactly.
   */
  private linkCharacterStyle(): bigint {
    const sheet = this.sheet();
    const existing = sheet?.findByIdentifier("character-style-hyperlink");
    if (existing) return existing.id;
    if (!sheet) throw new RangeError("storage has no stylesheet to create the Link style in");
    return sheet.createCharacterStyle({
      name: "Link",
      identifier: "character-style-hyperlink",
      character: { underline: 1 },
    });
  }

  /** Remove any hyperlink overlapping [start, end); the text is untouched. */
  removeLinks(start: number, end: number): number {
    let removed = 0;
    for (const link of this.links()) {
      if (link.start < end && link.end > start) {
        this.spanObject(Storage.TABLE_SMARTFIELD, link.start, link.end, undefined);
        removed++;
      }
    }
    return removed;
  }

  /** Span an object over [start, end) in a character-run object table. */
  spanObject(tableField: number, start: number, end: number, objectId: bigint | undefined): void {
    const text = this.text;
    this.ensureTable(tableField);
    const table = this.msg.getMessage(tableField)!;
    const resume = this.effectiveObjectAt(tableField, end);
    const entries = table.getMessages(ATTR_TABLE_ENTRIES);
    const kept = entries.filter((e) => {
      const idx = e.getUint(ENTRY_CHARACTER_INDEX) ?? 0;
      return idx < start || idx > end;
    });
    const mk = (idx: number, id: bigint | undefined): RawMessage => {
      const e = RawMessage.create();
      e.setVarint(ENTRY_CHARACTER_INDEX, idx);
      if (id !== undefined) e.setMessage(ENTRY_OBJECT, makeRef(id));
      return e;
    };
    kept.push(mk(start, objectId));
    if (end < text.length) kept.push(mk(end, resume));
    kept.sort(
      (a, b) => (a.getUint(ENTRY_CHARACTER_INDEX) ?? 0) - (b.getUint(ENTRY_CHARACTER_INDEX) ?? 0),
    );
    table.setMessages(ATTR_TABLE_ENTRIES, kept);
  }

  // ------------------------------------------------------------ smart fields

  /**
   * All smart-field runs (hyperlinks, page numbers, dates, bookmarks, merge
   * fields, TOC fields, …). `kind` is the registry name of the field archive
   * so callers can switch on it without importing type IDs.
   */
  smartFields(): {
    start: number;
    end: number;
    kind: string;
    fieldId: bigint;
    url?: string;
    name?: string;
  }[] {
    const out: {
      start: number;
      end: number;
      kind: string;
      fieldId: bigint;
      url?: string;
      name?: string;
    }[] = [];
    for (const run of this.objectRuns(Storage.TABLE_SMARTFIELD)) {
      if (run.objectId === undefined) continue;
      const field = this.store.object(run.objectId);
      if (!field) continue;
      const kind = typeName(field.type, this.store.app) ?? `type ${field.type}`;
      const entry: (typeof out)[number] = {
        start: run.start,
        end: run.end,
        kind,
        fieldId: run.objectId,
      };
      if (field.type === TSWP_TYPE.HYPERLINK_FIELD) {
        entry.url = field.message.getString(HyperlinkField.URL_REF) ?? "";
      }
      if (field.type === TSWP_TYPE.BOOKMARK_FIELD) {
        entry.name = field.message.getString(BookmarkField.NAME);
      }
      out.push(entry);
    }
    return out;
  }

  /**
   * Inline attachment runs: page numbers, page counts, footnote marks and
   * anchored drawables, each at its U+FFFC character.
   */
  attachments(): { index: number; kind: string; objectId: bigint; drawableId?: bigint }[] {
    const out: { index: number; kind: string; objectId: bigint; drawableId?: bigint }[] = [];
    const table = this.msg.getMessage(Storage.TABLE_ATTACHMENT);
    if (!table) return out;
    for (const e of table.getMessages(ATTR_TABLE_ENTRIES)) {
      const id = refId(e, ENTRY_OBJECT);
      const obj = id !== undefined ? this.store.object(id) : undefined;
      if (!obj || id === undefined) continue;
      const entry: (typeof out)[number] = {
        index: e.getUint(ENTRY_CHARACTER_INDEX) ?? 0,
        kind: typeName(obj.type, this.store.app) ?? `type ${obj.type}`,
        objectId: id,
      };
      const drawableId = refId(obj.message, DrawableAttachment.DRAWABLE);
      if (drawableId !== undefined) entry.drawableId = drawableId;
      out.push(entry);
    }
    return out;
  }

  /**
   * Insert a live page number (or page count) at `pos`.
   *
   * A page number is not text: no digits exist in the storage, because the
   * value depends on pagination the app performs. What is inserted is a
   * U+FFFC placeholder plus an attachment archive that renders it — which
   * is why this cannot simply be `insertText("1")`.
   *
   * Returns the attachment's object identifier. Nothing here computes the
   * number; the app fills it in when it lays the document out.
   */
  insertPageNumber(pos: number, options: NumberAttachmentOptions = {}): bigint {
    const component = this.store.componentOf(this.id);
    if (!component) throw new RangeError("storage component not found");
    const attachment = buildNumberAttachment(this.store, component, options);
    this.insertAttachment(pos, attachment.identifier);
    return attachment.identifier;
  }

  /** Insert a live page count — "of 12" — at `pos`. */
  insertPageCount(pos: number, options: NumberAttachmentOptions = {}): bigint {
    return this.insertPageNumber(pos, { ...options, kind: AttachmentKind.PAGE_COUNT });
  }

  /**
   * Put an existing attachment archive at `pos`.
   *
   * Inserts the U+FFFC placeholder through {@link replaceRange}, so every
   * other attribute table shifts with it, then anchors the attachment at
   * the new character. Doing it the other way round leaves the entry
   * pointing one character short.
   */
  insertAttachment(pos: number, objectId: bigint): void {
    this.anchorObject(pos, objectId, Storage.TABLE_ATTACHMENT, OBJECT_REPLACEMENT_CHARACTER);
  }

  /**
   * Insert an anchor character and point a point-anchored table at it.
   *
   * Two anchor characters exist and they are not interchangeable: an
   * attachment sits at U+FFFC, a footnote reference at U+000E. Each has its
   * own table, and putting one character in the other's table gives a
   * document the apps render with the mark missing.
   */
  private anchorObject(
    pos: number,
    objectId: bigint,
    tableField: number,
    character: string,
  ): void {
    const text = this.text;
    if (pos < 0 || pos > text.length) {
      throw new RangeError(`anchor position ${pos} out of range (${text.length})`);
    }
    this.replaceRange(pos, pos, character);
    this.ensureTable(tableField);
    const table = this.msg.getMessage(tableField)!;
    const entry = RawMessage.create();
    entry.setVarint(ENTRY_CHARACTER_INDEX, pos);
    entry.setMessage(ENTRY_OBJECT, makeRef(objectId));
    const entries = [...table.getMessages(ATTR_TABLE_ENTRIES), entry];
    entries.sort(
      (a, b) => (a.getUint(ENTRY_CHARACTER_INDEX) ?? 0) - (b.getUint(ENTRY_CHARACTER_INDEX) ?? 0),
    );
    table.setMessages(ATTR_TABLE_ENTRIES, entries);
  }

  /**
   * Add a footnote anchored at `pos`, with `text` as its content.
   *
   * A footnote is two storages, not one: this one gains a U+000E reference
   * character, and a new storage of kind FOOTNOTE holds the note itself.
   * That note's text starts with its own U+FFFC placeholder — the spot
   * where the app draws the footnote's number — so the note reads
   * "<mark> your text", exactly as Apple writes it.
   *
   * Numbering is not set here. Which number a footnote gets depends on how
   * many precede it and on the document's numbering settings, both of which
   * the app resolves when it lays the document out.
   *
   * Returns the new footnote storage, so its text can be styled or edited
   * like any other.
   */
  addFootnote(
    pos: number,
    text: string,
    options: { markStyle?: bigint | false } = {},
  ): TextStorage {
    const component = this.store.componentOf(this.id);
    if (!component) throw new RangeError("storage component not found");

    // The note's own storage: same stylesheet as its host, so it inherits
    // the document's footnote style rather than arriving unstyled.
    const noteMessage = RawMessage.create();
    noteMessage.setVarint(Storage.KIND, STORAGE_KIND.FOOTNOTE);
    const stylesheetId = this.stylesheetId;
    if (stylesheetId !== undefined) {
      noteMessage.setMessage(Storage.STYLE_SHEET, makeRef(stylesheetId));
    }
    // A leading space so the mark and the text do not run together, which
    // is what the corpus notes contain.
    noteMessage.setString(Storage.TEXT, ` ${text}`);
    fillStorageShape(noteMessage, {
      paragraphStyle: this.styleNamed("Footnote", TSWP_TYPE.PARAGRAPH_STYLE),
      listStyle: this.styleNamed("None", TSWP_TYPE.LIST_STYLE),
    });
    const noteObject = this.store.createObject(TSWP_TYPE.STORAGE, component);
    noteObject.setMessageBytes(noteMessage.toBytes());
    const note = new TextStorage(this.store, noteObject);

    // The mark placeholder inside the note.
    const markMessage = RawMessage.create();
    markMessage.setVarint(TextualAttachment.KIND, AttachmentKind.FOOTNOTE_MARK);
    const mark = this.store.createObject(ATTACHMENT_TYPE.TEXTUAL, component);
    mark.setMessageBytes(markMessage.toBytes());
    note.insertAttachment(0, mark.identifier);
    // Both marks — the U+000E in this storage and the U+FFFC in the note —
    // are covered by one shared anonymous character style whose entire
    // property bag is `superscript = 1`. Measured on all 16 footnotes in
    // the corpus's footnote fixture: one style object, no name, no
    // identifier, a run over exactly the mark character. Without it the
    // footnote works and its reference sits on the baseline at body size —
    // which is precisely what the app showed.
    // `markStyle: false` skips the superscript convention; an id overrides
    // it. Both marks always share whatever is chosen, like Apple's.
    const markStyle = options.markStyle === false
      ? undefined
      : options.markStyle ?? this.footnoteMarkStyle();
    if (markStyle !== undefined) note.setCharacterStyleRange(0, 1, markStyle);
    note.object.setObjectReferences([
      ...new Set([
        ...note.object.getObjectReferences(),
        mark.identifier,
        ...(stylesheetId !== undefined ? [stylesheetId] : []),
      ]),
    ]);

    // The reference in this storage, pointing at the note.
    const referenceMessage = RawMessage.create();
    // An empty `super` is what every corpus reference carries.
    referenceMessage.setMessage(FootnoteRefAttachment.SUPER, RawMessage.create());
    referenceMessage.setMessage(
      FootnoteRefAttachment.CONTAINED_STORAGE,
      makeRef(noteObject.identifier),
    );
    const reference = this.store.createObject(TSWP_TYPE.FOOTNOTE_REF_ATTACHMENT, component);
    reference.setMessageBytes(referenceMessage.toBytes());
    reference.setObjectReferences([noteObject.identifier]);

    this.anchorObject(pos, reference.identifier, Storage.TABLE_FOOTNOTE, FOOTNOTE_MARK_CHARACTER);
    // The U+000E just inserted gets the same superscript run the note's
    // mark has — after the anchor, so the range covers the real character.
    if (markStyle !== undefined) this.setCharacterStyleRange(pos, pos + 1, markStyle);
    return note;
  }

  /**
   * The one character style every footnote mark shares.
   *
   * Anonymous, and its whole property bag is `superscript = 1` — that is
   * the complete corpus recipe, identical on the body's 8 U+000E marks
   * and their notes' U+FFFC in the footnote fixture, all pointing at a
   * single style object. Found by matching that exact shape
   * so a second footnote reuses the first one's style rather than minting
   * a twin; created through the stylesheet when the document has none.
   */
  private footnoteMarkStyle(): bigint {
    for (const { obj } of this.store.allObjects()) {
      if (obj.type !== TSWP_TYPE.CHARACTER_STYLE) continue;
      let bag: RawMessage | undefined;
      try {
        bag = obj.message.getMessage(StyleArchive.CHAR_PROPERTIES);
      } catch {
        continue;
      }
      if (!bag || bag.fields.length !== 1) continue;
      if (bag.fields[0]!.no === CharProps.SUPERSCRIPT && bag.getUint(CharProps.SUPERSCRIPT) === 1) {
        return obj.identifier;
      }
    }
    const sheet = this.sheet();
    if (!sheet) throw new RangeError("storage has no stylesheet to create the mark style in");
    return sheet.createCharacterStyle({ character: { superscript: 1 } });
  }

  /**
   * Remove a footnote: its reference character goes, and with it the note.
   *
   * Takes the note storage's identifier, which is what {@link footnotes}
   * reports. The archives stay in the package; what removes the footnote is
   * the body no longer referencing it.
   */
  removeFootnote(noteStorageId: bigint): boolean {
    const table = this.msg.getMessage(Storage.TABLE_FOOTNOTE);
    for (const entry of table?.getMessages(ATTR_TABLE_ENTRIES) ?? []) {
      const reference = this.store.resolve(refId(entry, ENTRY_OBJECT));
      if (refId(reference?.message, FootnoteRefAttachment.CONTAINED_STORAGE) !== noteStorageId) {
        continue;
      }
      const index = entry.getUint(ENTRY_CHARACTER_INDEX) ?? 0;
      // Deleting the reference character drops the anchor with it, since
      // the footnote table is point-anchored.
      this.replaceRange(index, index + 1, "");
      return true;
    }
    return false;
  }

  /**
   * Remove an attachment and the placeholder character it occupies.
   *
   * What goes here is the character and the table entry, which is what
   * makes the field disappear from the text. The archives it left behind
   * — for an image, the drawable and its attachment — are reclaimed by
   * `IWorkDocument.compact()`, which collects whatever the document no
   * longer reaches. The image *bytes* stay: a Data/ file's link to its
   * object is not something this library can safely trace, so nothing
   * collects one (see docs/BLOCKERS.md).
   */
  removeAttachment(objectId: bigint): boolean {
    const found = this.attachments().find((entry) => entry.objectId === objectId);
    if (!found) return false;
    // Deleting the character shifts the tables, dropping the entry with it.
    this.replaceRange(found.index, found.index + 1, "");
    return true;
  }

  /** Page-number and page-count fields in this storage, with their formats. */
  pageNumberFields(): (NumberAttachmentInfo & { index: number; objectId: bigint })[] {
    const out: (NumberAttachmentInfo & { index: number; objectId: bigint })[] = [];
    for (const entry of this.attachments()) {
      const object = this.store.object(entry.objectId);
      const info = object ? readNumberAttachment(object) : undefined;
      if (info) out.push({ ...info, index: entry.index, objectId: entry.objectId });
    }
    return out;
  }

  /**
   * Insert a live date field showing `text`.
   *
   * Unlike a page number, a date field spans **real characters**: the text
   * is in the storage and the app rewrites it when the field updates. So
   * the text to show is supplied rather than rendered here — formatting a
   * date the way a given locale and pattern would is Foundation's job, and
   * approximating it would put subtly wrong text in the document. The field
   * is marked as needing an update, so the app replaces it with its own
   * rendering at the first opportunity.
   */
  insertDateField(pos: number, text: string, options: DateFieldOptions = {}): bigint {
    if (text.length === 0) {
      throw new RangeError("insertDateField: a date field must span some text");
    }
    const length = this.text.length;
    if (pos < 0 || pos > length) {
      throw new RangeError(`insertDateField: position ${pos} out of range (${length})`);
    }
    const component = this.store.componentOf(this.id);
    if (!component) throw new RangeError("storage component not found");
    const field = buildDateField(this.store, component, options);
    this.replaceRange(pos, pos, text);
    this.spanObject(Storage.TABLE_SMARTFIELD, pos, pos + text.length, field.identifier);
    return field.identifier;
  }

  /** The date fields in this storage, with their settings. */
  dateFields(): { start: number; end: number; fieldId: bigint; date: Date | undefined; format: string | undefined }[] {
    const out: { start: number; end: number; fieldId: bigint; date: Date | undefined; format: string | undefined }[] = [];
    for (const run of this.objectRuns(Storage.TABLE_SMARTFIELD)) {
      if (run.objectId === undefined) continue;
      const object = this.store.object(run.objectId);
      const info = object ? readDateField(object) : undefined;
      if (!info) continue;
      out.push({
        start: run.start,
        end: run.end,
        fieldId: run.objectId,
        date: info.date,
        format: info.format,
      });
    }
    return out;
  }

  /**
   * A paragraph's base writing direction, from the storage's bidi table
   * (`table_para_bidi`): the run-anchored entry pair whose first slot is
   * the direction — 0 LTR, 1 RTL, 65535 natural — with the second slot 0,
   * or 65535 when the first is natural. The paragraph style plays no part;
   * the app writes only this pair when a paragraph is flipped.
   */
  paragraphDirection(paragraphIndex: number): "ltr" | "rtl" | "natural" {
    const start = this.paragraphStarts()[paragraphIndex];
    if (start === undefined) {
      throw new RangeError(`paragraphDirection: no paragraph ${paragraphIndex}`);
    }
    const first = this.bidiPairAt(start)[0];
    return first === 1 ? "rtl" : first === 0 ? "ltr" : "natural";
  }

  /**
   * Set a paragraph's base writing direction, writing the same pair the
   * app writes when the direction control flips a paragraph: (1, 0) for
   * RTL, (0, 0) for LTR, (65535, 65535) for natural. Every paragraph gets
   * its own entry so no run bleeds into a neighbour, with existing values
   * carried.
   */
  setParagraphDirection(paragraphIndex: number, direction: "ltr" | "rtl" | "natural"): void {
    const starts = this.paragraphStarts();
    if (starts[paragraphIndex] === undefined) {
      throw new RangeError(`setParagraphDirection: no paragraph ${paragraphIndex}`);
    }
    const table = RawMessage.create();
    for (let i = 0; i < starts.length; i++) {
      const pair =
        i === paragraphIndex
          ? direction === "rtl"
            ? [1, 0]
            : direction === "ltr"
              ? [0, 0]
              : [65535, 65535]
          : this.bidiPairAt(starts[i]!);
      const entry = RawMessage.create();
      entry.setVarint(ENTRY_CHARACTER_INDEX, starts[i]!);
      entry.setVarint(ENTRY_PARA_FIRST, pair[0]!);
      entry.setVarint(ENTRY_PARA_SECOND, pair[1]!);
      table.addMessage(ATTR_TABLE_ENTRIES, entry);
    }
    this.msg.setMessage(Storage.TABLE_PARA_BIDI, table);
  }

  /** The bidi pair ruling `pos` — the last entry at or before it. */
  private bidiPairAt(pos: number): [number, number] {
    const entries = this.msg.getMessage(Storage.TABLE_PARA_BIDI)?.getMessages(ATTR_TABLE_ENTRIES) ?? [];
    let pair: [number, number] = [65535, 65535];
    for (const entry of entries) {
      if ((entry.getUint(ENTRY_CHARACTER_INDEX) ?? 0) > pos) break;
      pair = [
        Number(entry.getVarint(ENTRY_PARA_FIRST) ?? 65535n),
        Number(entry.getVarint(ENTRY_PARA_SECOND) ?? 65535n),
      ];
    }
    return pair;
  }

  /**
   * Placeholder text runs — a template's "tap or click to add …" spans,
   * which the app selects whole on a click and replaces on the first
   * keystroke (`TSWP.PlaceholderSmartFieldArchive`).
   */
  placeholders(): { start: number; end: number; text: string; fieldId: bigint }[] {
    const text = this.text;
    const out: { start: number; end: number; text: string; fieldId: bigint }[] = [];
    for (const run of this.objectRuns(Storage.TABLE_SMARTFIELD)) {
      if (run.objectId === undefined) continue;
      if (this.store.object(run.objectId)?.type !== SMART_FIELD_TYPE.PLACEHOLDER) continue;
      out.push({
        start: run.start,
        end: run.end,
        text: text.slice(run.start, run.end),
        fieldId: run.objectId,
      });
    }
    return out;
  }

  /**
   * Fill a placeholder: put real text in its span and shed the placeholder
   * marking, which is what typing into one does in Pages. The replacement
   * keeps the placeholder's styling — a template styles its ghost text the
   * way the final content should look. Returns the filled span.
   *
   * Address the placeholder by its `fieldId` — the id
   * {@link placeholders} reports, passed bare or on the listing's own
   * entry — and the span is resolved live at this call: filling several
   * from one listing lands each in its own field no matter how earlier
   * fills moved the text. A filled or removed field throws rather than
   * editing whatever text now occupies its old offsets. An entry
   * carrying only `start`/`end` keeps positional meaning, offsets
   * against the text as it is *now*.
   */
  fillPlaceholder(
    placeholder: bigint | { start: number; end: number; fieldId?: bigint },
    text: string,
  ): { start: number; end: number } {
    let span: { start: number; end: number };
    if (typeof placeholder === "bigint") span = this.placeholderSpan(placeholder);
    else if (placeholder.fieldId !== undefined) span = this.placeholderSpan(placeholder.fieldId);
    else span = placeholder;
    // Clear the field over the old span before the text moves: the
    // span-clearing write is exact, while a replacement keeps the run
    // boundary at `start` — which would leave the new text still marked.
    this.spanObject(Storage.TABLE_SMARTFIELD, span.start, span.end, undefined);
    this.replaceRange(span.start, span.end, text);
    return { start: span.start, end: span.start + text.length };
  }

  /** The live span of a placeholder field, by id; throws when absent. */
  private placeholderSpan(fieldId: bigint): { start: number; end: number } {
    const live = this.placeholders().find((p) => p.fieldId === fieldId);
    if (!live) {
      throw new RangeError(
        `fillPlaceholder: field ${fieldId} is not a placeholder in this storage (already filled, or another storage's?)`,
      );
    }
    return { start: live.start, end: live.end };
  }

  /**
   * Mark [start, end) as placeholder text, the way Format → Advanced →
   * Define as Placeholder Text does: a click in the app selects the whole
   * span and typing replaces it. Any smart field already on the span is
   * replaced, like inserting any other field. Returns the field's id.
   */
  defineAsPlaceholder(start: number, end: number): bigint {
    const length = this.text.length;
    if (start < 0 || end <= start || end > length) {
      throw new RangeError(`defineAsPlaceholder: invalid range ${start}..${end} (len ${length})`);
    }
    const component = this.store.componentOf(this.id);
    if (!component) throw new RangeError("storage component not found");
    const field = buildPlaceholderField(this.store, component);
    this.spanObject(Storage.TABLE_SMARTFIELD, start, end, field.identifier);
    return field.identifier;
  }

  /**
   * Mark [start, end) as a bookmark — a named destination a link can target.
   *
   * A bookmark with no name is what the apps create for a link pointing at
   * a stretch of text rather than a named place; both shapes occur in the
   * corpus and both are written here.
   */
  addBookmark(start: number, end: number, name?: string): bigint {
    const length = this.text.length;
    if (start < 0 || end <= start || end > length) {
      throw new RangeError(`addBookmark: invalid range ${start}..${end} (len ${length})`);
    }
    const component = this.store.componentOf(this.id);
    if (!component) throw new RangeError("storage component not found");
    const field = buildBookmark(this.store, component, name, { ranged: end - start > 1 });
    this.spanObject(Storage.TABLE_BOOKMARK, start, end, field.identifier);
    return field.identifier;
  }

  /** Remove a bookmark. The text it marked stays. */
  removeBookmark(fieldId: bigint): boolean {
    const found = this.bookmarks().find((bookmark) => bookmark.fieldId === fieldId);
    if (!found) return false;
    this.spanObject(Storage.TABLE_BOOKMARK, found.start, found.end, undefined);
    return true;
  }

  /** Bookmarks anchored in this storage (named destinations). */
  bookmarks(): { start: number; end: number; name: string | undefined; fieldId: bigint }[] {
    const out: { start: number; end: number; name: string | undefined; fieldId: bigint }[] = [];
    for (const run of this.objectRuns(Storage.TABLE_BOOKMARK)) {
      if (run.objectId === undefined) continue;
      const field = this.store.object(run.objectId);
      if (!field) continue;
      out.push({
        start: run.start,
        end: run.end,
        name: field.message.getString(BookmarkField.NAME),
        fieldId: run.objectId,
      });
    }
    return out;
  }

  // ------------------------------------------------------ footnotes/comments

  /** Footnotes/endnotes anchored in this storage (their text is editable). */
  footnotes(): { anchorIndex: number; mark: string | undefined; storage: TextStorage }[] {
    const out: { anchorIndex: number; mark: string | undefined; storage: TextStorage }[] = [];
    const table = this.msg.getMessage(Storage.TABLE_FOOTNOTE);
    if (!table) return out;
    for (const e of table.getMessages(ATTR_TABLE_ENTRIES)) {
      const idx = e.getUint(ENTRY_CHARACTER_INDEX) ?? 0;
      const ref = refId(e, ENTRY_OBJECT);
      const attachment = ref !== undefined ? this.store.object(ref) : undefined;
      if (!attachment) continue;
      const storageId = refId(attachment.message, FootnoteRefAttachment.CONTAINED_STORAGE);
      const storageObj = storageId !== undefined ? this.store.object(storageId) : undefined;
      if (!storageObj) continue;
      out.push({
        anchorIndex: idx,
        mark: attachment.message.getString(FootnoteRefAttachment.CUSTOM_MARK),
        storage: new TextStorage(this.store, storageObj),
      });
    }
    return out;
  }

  /** Comments anchored in this storage (from both anchor tables). */
  comments(): CommentInfo[] {
    const out: CommentInfo[] = [];
    const resolve = (
      highlightId: bigint | undefined,
      start: number,
      end: number,
    ): void => {
      const highlight = highlightId !== undefined ? this.store.object(highlightId) : undefined;
      if (!highlight || highlightId === undefined) return;
      const storageId = refId(highlight.message, Highlight.COMMENT_STORAGE);
      const comment = storageId !== undefined ? this.store.object(storageId) : undefined;
      if (comment?.type !== TSD_TYPE.COMMENT_STORAGE) return;
      const info = readCommentStorage(this.store, comment);
      if (info) out.push({ ...info, start, end, highlightId });
    };
    for (const run of this.objectRuns(Storage.TABLE_HIGHLIGHT)) {
      resolve(run.objectId, run.start, run.end);
    }
    const overlap = this.msg.getMessage(Storage.TABLE_OVERLAPPING_HIGHLIGHT);
    if (overlap) {
      for (const e of overlap.getMessages(ATTR_TABLE_ENTRIES)) {
        const range = e.getMessage(OVERLAP_RANGE);
        const loc = range?.getUint(RANGE_LOCATION) ?? 0;
        const len = range?.getUint(RANGE_LENGTH) ?? 0;
        resolve(refId(e, OVERLAP_FIELD), loc, loc + len);
      }
    }
    return out.sort((a, b) => a.start - b.start);
  }

  /**
   * Attach a comment to [start, end).
   *
   * Creates the three objects a comment needs — highlight, comment storage,
   * author — and spans the highlight over the range, which is what makes
   * the words show highlighted. The author is *reused* by default: a
   * document where every comment has its own copy of the same person is not
   * what the apps produce.
   *
   * Returns the comment storage's identifier, which {@link removeComment}
   * takes.
   */
  addComment(
    start: number,
    end: number,
    text: string,
    options: AddCommentOptions = {},
  ): bigint {
    const length = this.text.length;
    if (start < 0 || end <= start || end > length) {
      throw new RangeError(`addComment: invalid range ${start}..${end} (len ${length})`);
    }
    const component = this.store.componentOf(this.id);
    if (!component) throw new RangeError("storage component not found");
    const { highlight, commentStorage } = buildComment(this.store, component, text, options);
    this.spanObject(Storage.TABLE_HIGHLIGHT, start, end, highlight.identifier);
    return commentStorage.identifier;
  }

  /**
   * Detach a comment. The commented text stays; the highlight goes.
   *
   * The archives are left in the package, as everywhere else here — what
   * makes the comment disappear is the text no longer pointing at it.
   */
  removeComment(commentStorageId: bigint): boolean {
    const found = this.comments().find(
      (comment) => comment.commentStorageId === commentStorageId,
    );
    if (!found) return false;
    this.spanObject(Storage.TABLE_HIGHLIGHT, found.start, found.end, undefined);
    // A comment anchored through the overlapping table needs its entry
    // dropping too; the two tables can each carry one.
    const overlap = this.msg.getMessage(Storage.TABLE_OVERLAPPING_HIGHLIGHT);
    if (overlap) {
      overlap.setMessages(
        ATTR_TABLE_ENTRIES,
        overlap
          .getMessages(ATTR_TABLE_ENTRIES)
          .filter((e) => refId(e, OVERLAP_FIELD) !== found.highlightId),
      );
    }
    return true;
  }

  /**
   * The first attribute-table entry outside its lawful positions, if any.
   *
   * The law, measured across the corpus's 2921 storages: no entry sits
   * past `text.length` in any table, and an entry at exactly
   * `text.length` occurs only in the paragraph-family tables — and only
   * when a final empty paragraph exists to describe: empty text, or text
   * ending with a terminator. The character-content tables (character
   * styles, smart fields, anchors, language runs) leave a run reaching
   * the end of the text open instead.
   */
  tablePositionViolation(): { table: string; position: number } | undefined {
    const length = this.text.length;
    const tailLawful =
      length === 0 || isParagraphTerminator(this.text.charCodeAt(length - 1));
    const check = (
      field: number,
      mayEndAtLength: boolean,
    ): { table: string; position: number } | undefined => {
      const table = this.msg.getMessage(field);
      if (!table) return undefined;
      for (const e of table.getMessages(ATTR_TABLE_ENTRIES)) {
        const idx = e.getUint(ENTRY_CHARACTER_INDEX) ?? 0;
        if (idx > length || (idx === length && !mayEndAtLength)) {
          return { table: TABLE_FIELD_NAMES.get(field) ?? String(field), position: idx };
        }
      }
      return undefined;
    };
    for (const f of [...OBJECT_TABLE_FIELDS, ...STRING_TABLE_FIELDS]) {
      const paragraphFamily =
        PARA_ALIGNED_OBJECT_TABLES.includes(f) ||
        f === Storage.TABLE_SECTION ||
        f === Storage.TABLE_DROP_CAP_STYLE;
      const found = check(f, paragraphFamily && tailLawful);
      if (found) return found;
    }
    for (const f of PARA_DATA_TABLE_FIELDS) {
      const found = check(f, tailLawful);
      if (found) return found;
    }
    return undefined;
  }
}

/** Storage table field number → the proto field's short name, for errors. */
const TABLE_FIELD_NAMES = new Map<number, string>(
  Object.entries(Storage)
    .filter(([key]) => key.startsWith("TABLE_"))
    .map(([key, value]) => [value, key.slice("TABLE_".length).toLowerCase()]),
);

/**
 * Refuse to persist a storage whose attribute tables place entries where
 * no app-written storage does ({@link TextStorage#tablePositionViolation}).
 * The app answers such a table with document-wide style repair, far from
 * whatever edit produced it — a corrupted save is strictly worse than a
 * refused one. Scoped to storages edited this session, so loading and
 * re-saving a document costs nothing.
 */
export function verifyTextStorageIntegrity(store: ObjectStore): void {
  for (const { obj } of store.allObjects()) {
    if (obj.type !== TSWP_TYPE.STORAGE) continue;
    const storage = new TextStorage(store, obj);
    if (storage.revision === 0) continue;
    const violation = storage.tablePositionViolation();
    if (violation) {
      throw new RangeError(
        `text storage ${obj.identifier}: table_${violation.table} entry at position ` +
          `${violation.position} with text length ${storage.text.length} — no app-written ` +
          `storage places one there, and the app repairs such tables with document-wide ` +
          `style loss. This is a table-maintenance fault in the edit sequence just run; ` +
          `nothing was saved.`,
      );
    }
  }
}
