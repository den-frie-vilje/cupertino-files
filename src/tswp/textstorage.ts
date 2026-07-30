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
  ENTRY_CHARACTER_INDEX,
  ENTRY_OBJECT,
  OBJECT_TABLE_FIELDS,
  OVERLAP_RANGE,
  OVERLAP_TABLE_FIELDS,
  PARA_ALIGNED_OBJECT_TABLES,
  PARA_DATA_TABLE_FIELDS,
  Storage,
  STRING_TABLE_FIELDS,
} from "./schema.ts";
import { makeRef, RANGE_LENGTH, RANGE_LOCATION, refId } from "../tsp/schema.ts";

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
      if (text.charCodeAt(i) === 10) starts.push(i + 1);
    }
    return starts;
  }

  paragraphs(): ParagraphInfo[] {
    const text = this.text;
    const starts = this.paragraphStarts(text);
    const styles = this.paragraphValues(Storage.TABLE_PARA_STYLE, starts, text);
    return starts.map((start, i) => {
      let end = text.indexOf("\n", start);
      if (end === -1) end = text.length;
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
    text: string,
  ): (bigint | undefined)[] {
    const runs = this.objectRuns(tableField, text.length);
    return starts.map((s) => {
      let value: bigint | undefined;
      for (const r of runs) {
        if (r.start > s) break;
        if (r.objectId !== undefined) value = r.objectId;
      }
      return value;
    });
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
    for (const f of PARA_ALIGNED_OBJECT_TABLES) {
      if (!this.msg.has(f)) continue;
      const values = newStarts.map((s) => {
        // Map each new paragraph start to a position in the old text.
        const oldPos = s <= start ? s : s >= start + replacement.length ? s - delta : start;
        return this.effectiveObjectAt(f, Math.min(oldPos, oldText.length));
      });
      paraRebuilds.set(f, values);
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
      this.writeParagraphTable(f, newStarts, values);
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
    const kept: RawMessage[] = [];
    let changed = false;
    for (const e of entries) {
      const idx = e.getUint(ENTRY_CHARACTER_INDEX) ?? 0;
      if (idx <= start) {
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
  private writeParagraphTable(
    tableField: number,
    starts: number[],
    values: (bigint | undefined)[],
  ): void {
    const table = this.msg.getMessage(tableField);
    if (!table) return;
    const entries: RawMessage[] = [];
    // An explicit reference declares the value; an empty entry carries the
    // previous one forward (the apps' own dedup convention).
    let carried: bigint | undefined;
    for (let i = 0; i < starts.length; i++) {
      const entry = RawMessage.create();
      entry.setVarint(ENTRY_CHARACTER_INDEX, starts[i]!);
      const v = values[i];
      if (v !== undefined && v !== carried) {
        entry.setMessage(ENTRY_OBJECT, makeRef(v));
        carried = v;
      }
      entries.push(entry);
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
}
