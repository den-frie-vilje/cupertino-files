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
import type { IwaObject } from "../tsp/iwa.ts";
import { RawMessage } from "../base/protobuf.ts";
import type { ObjectStore } from "../tsp/store.ts";
import {
  ATTR_TABLE_ENTRIES,
  BookmarkField,
  DrawableAttachment,
  ENTRY_CHARACTER_INDEX,
  ENTRY_OBJECT,
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
  TSWP_TYPE,
} from "./schema.ts";
import { makeRef, RANGE_LENGTH, RANGE_LOCATION, refId } from "../tsp/schema.ts";
import { CommentStorage, TSD_TYPE } from "../tsd/schema.ts";
import { StylesheetModel } from "../tss/stylesheet.ts";
import { ParagraphHandle, TextRange } from "./range.ts";
import { typeName } from "../tsp/registry.ts";
import {
  ATTACHMENT_TYPE,
  AttachmentKind,
  TextualAttachment,
  buildBookmark,
  buildDateField,
  buildNumberAttachment,
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
export const STORAGE_KIND = {
  BODY: 0,
  HEADER: 1,
  FOOTNOTE: 2,
  TEXTBOX: 3,
  NOTE: 4,
  CELL: 5,
  UNCLASSIFIED: 6,
  TABLE_OF_CONTENTS: 7,
  UNDEFINED: 8,
} as const;

/**
 * Characters that end a paragraph.
 *
 * **Not just `\n`.** This was `charCodeAt(i) === 10` and that is wrong in a
 * way nothing offline could show: our reader and writer agreed with each
 * other, so every round trip was clean, while Pages disagreed about where
 * paragraphs begin. Since `writeParagraphTable` rebuilds `table_para_style`
 * from *our* paragraph starts, any boundary we failed to see had its style
 * entry silently dropped, and Pages rendered the body unstyled.
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
function isParagraphTerminator(code: number): boolean {
  return code === 0x0a || code === 0x04 || code === 0x05 || code === 0x0c;
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

  get kind(): number {
    return this.msg.getUint(Storage.KIND) ?? 3;
  }

  /** Identifier of the TSS.StylesheetArchive governing this storage. */
  get stylesheetId(): bigint | undefined {
    return refId(this.msg, Storage.STYLE_SHEET);
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
      runs.push({ start, end, objectId: refId(entries[i]!, ENTRY_OBJECT) });
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

  /** Effective object id at a position (last set value at or before `pos`). */
  effectiveObjectAt(tableField: number, pos: number): bigint | undefined {
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
    const newText = oldText.slice(0, start) + replacement + oldText.slice(end);
    const delta = replacement.length - (end - start);

    // Effective paragraph-aligned values must be computed BEFORE mutation.
    const newStarts = this.paragraphStarts(newText);
    const paraRebuilds = new Map<number, (bigint | undefined)[]>();
    const oldPositions = newStarts.map((s) => {
      // Map each new paragraph start back to a position in the old text.
      const oldPos = s <= start ? s : s >= start + replacement.length ? s - delta : start;
      return Math.min(Math.max(oldPos, 0), oldText.length);
    });
    // Whether each table ended with an entry past the last paragraph — a
    // terminator at the old text length, which the rebuild must reproduce
    // at the new one. See writeParagraphTable.
    const paraTerminator = new Map<number, boolean>();
    for (const f of PARA_ALIGNED_OBJECT_TABLES) {
      if (!this.msg.has(f)) continue;
      paraRebuilds.set(f, this.effectiveObjectsAt(f, oldPositions));
      const indexes = (this.msg.getMessage(f)?.getMessages(ATTR_TABLE_ENTRIES) ?? []).map(
        (e) => e.getUint(ENTRY_CHARACTER_INDEX) ?? 0,
      );
      paraTerminator.set(f, indexes[indexes.length - 1] === oldText.length);
    }

    // 1. The text itself.
    this.msg.setString(Storage.TEXT, newText);

    // 2. Character-indexed tables: shift/drop entries.
    for (const f of [...OBJECT_TABLE_FIELDS, ...STRING_TABLE_FIELDS]) {
      if (PARA_ALIGNED_OBJECT_TABLES.includes(f)) continue; // rebuilt below
      this.shiftIndexedTable(f, start, end, delta, newText.length);
    }
    for (const f of PARA_DATA_TABLE_FIELDS) {
      this.shiftIndexedTable(f, start, end, delta, newText.length);
    }
    for (const f of OVERLAP_TABLE_FIELDS) {
      this.shiftOverlapTable(f, start, end, delta);
    }

    // 3. Paragraph-aligned tables: rebuild one entry per paragraph.
    for (const [f, values] of paraRebuilds) {
      this.writeParagraphTable(f, newStarts, values, paraTerminator.get(f));
    }
  }

  private shiftIndexedTable(
    tableField: number,
    start: number,
    end: number,
    delta: number,
    newLength: number,
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
        kept.push(e);
      } else if (idx < end) {
        changed = true; // dropped
      } else {
        const shifted = Math.max(0, Math.min(idx + delta, newLength));
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

  /** Rebuild a paragraph-aligned table: entry per paragraph, ∅ for repeats. */
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
   * writes — renders correctly. That contrast is the evidence, and it is
   * also how this was found: the rung that set a style worked while the two
   * that only appended did not.
   *
   * Both earlier attempts applied one rule to all three tables. Writing them
   * all dense inflates a single-run list table to one entry per paragraph;
   * writing them all sparse leaves an appended paragraph with no style entry
   * at all. Each is wrong for two of the three.
   *
   * `terminator` keeps a trailing entry at the end of the text when the
   * table arrived with one — about half of Apple's do, and it is not a
   * paragraph, so the loop below cannot produce it.
   */
  private writeParagraphTable(
    tableField: number,
    starts: number[],
    values: (bigint | undefined)[],
    terminator?: boolean,
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
    if (terminator) {
      const end = RawMessage.create();
      end.setVarint(ENTRY_CHARACTER_INDEX, this.text.length);
      entries.push(end);
    }
    table.setMessages(ATTR_TABLE_ENTRIES, entries);
  }

  insertText(pos: number, text: string): void {
    this.replaceRange(pos, pos, text);
  }

  deleteRange(start: number, end: number): void {
    this.replaceRange(start, end, "");
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
   */
  appendParagraph(text: string): number {
    if (text.includes("\n")) throw new RangeError("appendParagraph: text must not contain \\n");
    const current = this.text;
    if (current.length === 0) {
      this.replaceRange(0, 0, text);
      return 0;
    }
    const endsWithNewline = current.endsWith("\n");
    const insertion = endsWithNewline ? `${text}\n` : `\n${text}`;
    this.replaceRange(current.length, current.length, insertion);
    return this.paragraphStarts().length - 1;
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
   */
  setCharacterStyleRange(start: number, end: number, styleId: bigint | undefined): void {
    const text = this.text;
    if (start < 0 || end <= start || end > text.length) {
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

  private ensureTable(tableField: number): void {
    if (!this.msg.has(tableField)) {
      const table = RawMessage.create();
      const entry = RawMessage.create();
      entry.setVarint(ENTRY_CHARACTER_INDEX, 0);
      table.addMessage(ATTR_TABLE_ENTRIES, entry);
      this.msg.setMessage(tableField, table);
    }
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

  /** UI name of a style object (via its TSS.StyleArchive super). */
  styleNameOf(styleId: bigint): string | undefined {
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
      if (m.index !== undefined && m[0]!.length > 0) {
        out.push(new TextRange(this, m.index, m.index + m[0]!.length));
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
   */
  insertLink(start: number, end: number, url: string): bigint {
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
    return field.identifier;
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
  addFootnote(pos: number, text: string): TextStorage {
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
    const noteObject = this.store.createObject(TSWP_TYPE.STORAGE, component);
    noteObject.setMessageBytes(noteMessage.toBytes());
    const note = new TextStorage(this.store, noteObject);

    // The mark placeholder inside the note.
    const markMessage = RawMessage.create();
    markMessage.setVarint(TextualAttachment.KIND, AttachmentKind.FOOTNOTE_MARK);
    const mark = this.store.createObject(ATTACHMENT_TYPE.TEXTUAL, component);
    mark.setMessageBytes(markMessage.toBytes());
    note.insertAttachment(0, mark.identifier);
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
    return note;
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
   * The archive itself is left in the package, as everywhere else in this
   * library; what goes is the character and the table entry, which is what
   * makes the field disappear from the text.
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
    const field = buildBookmark(this.store, component, name);
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
}
