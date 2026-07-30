/**
 * TST family — table/spreadsheet reading (Numbers tables, and the same
 * archives when embedded in Pages/Keynote). Implements the modern "BNC"
 * v5 cell storage per research/numbers-cells.md: tiles → row infos →
 * signed-16 offset arrays → 12-byte-header cell records, with string /
 * rich-text table resolution, decimal128 numbers and merge ranges.
 *
 * Read-only by design for now: cell edits require formula-dependency
 * bookkeeping (see docs/FORMAT.md §14).
 */
import type { IwaObject } from "../tsp/iwa.ts";
import type { ObjectStore } from "../tsp/store.ts";
import { makeRef, refId } from "../tsp/schema.ts";
import { Storage } from "../tswp/schema.ts";
import { RawMessage } from "../base/protobuf.ts";
import { ByteWriter, bytesEqual } from "../base/bytes.ts";
import {
  CellFlag,
  CellRecord,
  CellType,
  FORMAT_FLAGS,
  VALUE_FLAGS,
} from "./cellrecord.ts";
import type { CellFormatting } from "./styles.ts";
import { TableStyleHandle, TST_STYLE_TYPE } from "./styles.ts";
import { StyleHandle } from "../tss/stylesheet.ts";
import { renderFormula, type RenderedFormula } from "./formulas.ts";
import { ConditionalStyleSet, type ConditionalRule } from "./conditional.ts";
import { FilterSet } from "./filters.ts";
import {
  categoriesOf,
  type CategoryGroup,
  type GroupValue,
  type TableCategories,
} from "./categories.ts";
import { uidMapOf, type ColumnRowUidMap } from "./uidmap.ts";
import { FormulaOwnerRegistry } from "../tsce/owners.ts";

/**
 * One owner registry per store, kept weakly so a closed document is not
 * held alive by its formula cache.
 */
const OWNER_REGISTRIES = new WeakMap<ObjectStore, FormulaOwnerRegistry>();
import {
  flagForFormat,
  readFormat,
  writeFormat,
  FORMAT_FLAG_BY_CATEGORY,
  type CellFormat,
} from "./formats.ts";

export const TST_TYPE = {
  TABLE_INFO: 6000,
  TABLE_MODEL: 6001,
  TILE: 6002,
  MERGE_REGION_MAP: 6144,
} as const;

/** TST.TableInfoArchive. */
const TableInfo = { SUPER: 1, TABLE_MODEL: 2 } as const;
/** TST.TableModelArchive (reader-relevant fields). */
const TableModelFields = {
  BASE_DATA_STORE: 4,
  NUMBER_OF_ROWS: 6,
  NUMBER_OF_COLUMNS: 7,
  TABLE_NAME: 8,
  HEADER_ROWS: 9,
  HEADER_COLUMNS: 10,
  FOOTER_ROWS: 11,
  TABLE_STYLE: 3,
  HEADER_ROWS_FROZEN: 12,
  HEADER_COLUMNS_FROZEN: 13,
  DEFAULT_ROW_HEIGHT: 16,
  DEFAULT_COLUMN_WIDTH: 17,
  REPEATING_HEADER_ROWS: 29,
  TABLE_NAME_STYLE: 30,
  REPEATING_HEADER_COLUMNS: 32,
  MERGE_OWNER: 47,
  HIDDEN_STATES_OWNER: 70,
} as const;

/** TST.HiddenStatesOwnerArchive / .HiddenStatesArchive / .HiddenStateExtentArchive. */
const HiddenStatesOwner = { HIDDEN_STATES: 2 } as const;
const HiddenStates = { COLUMN_EXTENT: 2, ROW_EXTENT: 3 } as const;
const HiddenStateExtent = { FILTER_SET: 8 } as const;
/** TST.DataStore. */
const DataStoreFields = {
  ROW_HEADERS: 1,
  COLUMN_HEADERS: 2,
  TILES: 3,
  STRING_TABLE: 4,
  ROW_TILE_TREE: 9,
  STYLE_TABLE: 5,
  FORMULA_TABLE: 6,
  MERGE_REGION_MAP: 13,
  RICH_TEXT_TABLE: 17,
  CONDITIONAL_STYLE_TABLE: 18,
  FORMAT_TABLE: 22,
} as const;
/** TST.TileStorage / .Tile / .TileRowInfo. */
const TileStorageFields = { TILES: 1, TILE_SIZE: 2 } as const;
const TileEntry = { TILEID: 1, TILE: 2 } as const;
const TileFields = {
  MAX_COLUMN: 1,
  MAX_ROW: 2,
  NUM_CELLS: 3,
  NUM_ROWS: 4,
  ROW_INFOS: 5,
  STORAGE_VERSION: 6,
  LAST_SAVED_IN_BNC: 7,
} as const;
const TileRowInfo = {
  TILE_ROW_INDEX: 1,
  CELL_COUNT: 2,
  CELL_STORAGE_BUFFER_PRE_BNC: 3,
  CELL_OFFSETS_PRE_BNC: 4,
  STORAGE_VERSION: 5,
  CELL_STORAGE_BUFFER: 6,
  CELL_OFFSETS: 7,
  HAS_WIDE_OFFSETS: 8,
} as const;
/** TSS.StyleArchive fields we touch on cloned TST styles. */
const STYLE_SUPER = 1;
const STYLE_NAME = 1;
const STYLE_IDENTIFIER = 4;

/**
 * The bands a table styles separately. Each names a `TSP.Reference` field
 * on `TST.TableModelArchive` pointing at a `TST.CellStyleArchive`.
 */
export type TableBand =
  | "body"
  | "headerRow"
  | "headerColumn"
  | "footerRow";

const BAND_STYLE_FIELDS: Record<TableBand, number> = {
  body: 18,
  headerRow: 19,
  headerColumn: 20,
  footerRow: 21,
};

/** The matching TSWP.CharacterStyleArchive references for each band's text. */
const BAND_TEXT_STYLE_FIELDS: Record<TableBand, number> = {
  body: 24,
  headerRow: 25,
  headerColumn: 26,
  footerRow: 27,
};

/** TST.TableRBTree: repeated Node { key = 1, value = 2 }. */
const RbTree = { NODES: 1, KEY: 1, VALUE: 2 } as const;

/** Rows per tile. Apple uses 256 and records it on TileStorage. */
const DEFAULT_TILE_SIZE = 256;

/** A row's cell records plus the geometry its header carries. */
interface RowSnapshot {
  records: (Uint8Array | undefined)[];
  height: number;
  hidden: number;
}

/**
 * Move a merge across an insert or delete, or drop it.
 *
 * A merge that straddles the edit shrinks or grows; one entirely inside a
 * deleted span disappears. Anything before the edit is untouched.
 */
function shiftRange(
  merge: MergeRange,
  at: number,
  delta: number,
  axis: "row" | "column",
): MergeRange | undefined {
  const start = axis === "row" ? merge.row : merge.column;
  const span = axis === "row" ? merge.rowCount : merge.columnCount;
  const end = start + span;
  let nextStart = start;
  let nextSpan = span;

  if (delta > 0) {
    if (at <= start) nextStart = start + delta;
    else if (at < end) nextSpan = span + delta;
  } else {
    const removed = -delta;
    const removeEnd = at + removed;
    if (removeEnd <= start) nextStart = start - removed;
    else if (at < end) {
      const overlap = Math.min(end, removeEnd) - Math.max(start, at);
      nextSpan = span - overlap;
      if (at < start) nextStart = at;
      if (nextSpan < 1) return undefined;
    }
  }
  return axis === "row"
    ? { ...merge, row: nextStart, rowCount: nextSpan }
    : { ...merge, column: nextStart, columnCount: nextSpan };
}

/** TST.HeaderStorage / .HeaderStorageBucket / .Header. */
const HeaderStorage = { BUCKETS: 2 } as const;
const HeaderBucket = { HEADERS: 2 } as const;
const HeaderFields = { INDEX: 1, SIZE: 2, HIDING_STATE: 3, NUMBER_OF_CELLS: 4 } as const;
/** TST.TableDataList / .ListEntry. */
const DataList = { LIST_TYPE: 1, NEXT_LIST_ID: 2, ENTRIES: 3 } as const;
const ListEntry = {
  KEY: 1,
  REFCOUNT: 2,
  STRING: 3,
  REFERENCE: 4,
  FORMULA: 5,
  FORMAT: 6,
  RICH_TEXT_PAYLOAD: 9,
} as const;
/** TST.RichTextPayloadArchive: storage = 1. */
const RichTextPayload = { STORAGE: 1 } as const;
/** TST.MergeRegionMapArchive: cell_range = 1 { origin = 1, size = 2 (packed fixed32) }. */
const MergeMap = { CELL_RANGE: 1 } as const;
const CellRange = { ORIGIN: 1, SIZE: 2 } as const;
const PACKED_DATA = 1;

/**
 * Where modern merges actually live: the calc engine.
 *
 * `TST.MergeOwnerArchive { owner_id = 1, formula_store = 2 }` →
 * `FormulaStoreArchive { next_formula_index = 2, formulas = 3 }` →
 * `FormulaStorePair { formula_index = 1, formula = 2 }` →
 * `TSCE.FormulaArchive { AST_node_array = 1 }` → repeated `AST_node = 1`.
 * A merge is a colon-tract node (type 67) whose `AST_colon_tract` gives
 * the rectangle in absolute row/column ranges.
 */
const MergeOwner = { OWNER_ID: 1, FORMULA_STORE: 2 } as const;
const FormulaStore = { NEXT_INDEX: 2, FORMULAS: 3, PAIR_INDEX: 1, PAIR_FORMULA: 2 } as const;
const Formula = { AST_NODE_ARRAY: 1 } as const;
const AstNodeArray = { NODES: 1 } as const;
const AstNode = { TYPE: 1, CROSS_TABLE_INFO: 28, STICKY_BITS: 33, COLON_TRACT: 40 } as const;
const AST_COLON_TRACT_NODE = 67;
const ColonTract = {
  RELATIVE_COLUMN: 1,
  RELATIVE_ROW: 2,
  ABSOLUTE_COLUMN: 3,
  ABSOLUTE_ROW: 4,
  PRESERVE_RECTANGULAR: 5,
} as const;
const TractRange = { BEGIN: 1, END: 2 } as const;

/** First absolute range of a colon tract; `range_end` absent means one unit. */
function absoluteRange(
  tract: RawMessage | undefined,
  field: number,
): { begin: number; end: number } | undefined {
  const range = tract?.getMessages(field)[0];
  const begin = range?.getUint(TractRange.BEGIN);
  if (begin === undefined) return undefined;
  return { begin, end: range!.getUint(TractRange.END) ?? begin };
}

export type CellValue =
  | { type: "empty" }
  | { type: "number"; value: number; isFormula: boolean }
  | { type: "text"; value: string; isFormula: boolean }
  | { type: "richText"; value: string; isFormula: boolean }
  | { type: "date"; value: Date; isFormula: boolean }
  | { type: "bool"; value: boolean; isFormula: boolean }
  | { type: "duration"; seconds: number; isFormula: boolean }
  | { type: "error"; isFormula: boolean };

export interface CellInfo {
  row: number;
  column: number;
  value: CellValue;
}

/**
 * A cell's value in the plain form categories compare against.
 *
 * Durations and errors have no group equivalent — a category never groups
 * by one — so they read as absent rather than being coerced into a number
 * that would match the wrong group.
 */
export function groupValueOf(value: CellValue | undefined): GroupValue {
  switch (value?.type) {
    case "number":
    case "text":
    case "richText":
    case "date":
    case "bool":
      return value.value;
    default:
      return undefined;
  }
}

/**
 * A value that can be written into a cell.
 *
 * Mirrors {@link CellValue} minus the read-only variants: `richText` lives
 * in a separate storage object, and `error` is produced by formula
 * evaluation rather than authored.
 */
export type CellInput =
  | { type: "empty" }
  | { type: "number"; value: number }
  | { type: "text"; value: string }
  | { type: "bool"; value: boolean }
  | { type: "date"; value: Date }
  | { type: "duration"; seconds: number };

export interface WriteOptions {
  /**
   * Write into a cell a merge has swallowed. Off by default, because such
   * a value is stored but never displayed.
   */
  allowCovered?: boolean;
}

/** Coerce a plain JS value to a {@link CellInput}. */
export function toCellInput(value: string | number | boolean | Date | null | undefined): CellInput {
  if (value === null || value === undefined || value === "") return { type: "empty" };
  if (typeof value === "string") return { type: "text", value };
  if (typeof value === "number") return { type: "number", value };
  if (typeof value === "boolean") return { type: "bool", value };
  return { type: "date", value };
}

export interface MergeRange {
  row: number;
  column: number;
  rowCount: number;
  columnCount: number;
}

/** Seconds between the Unix epoch and Apple's 2001-01-01 epoch. */
const APPLE_EPOCH_MS = Date.UTC(2001, 0, 1);
const DECIMAL128_BIAS = 0x1820;

export class TableModel {
  readonly store: ObjectStore;
  readonly object: IwaObject;
  /** The TST.TableInfoArchive drawable owning this model, when known. */
  readonly infoObject: IwaObject | undefined;

  constructor(store: ObjectStore, object: IwaObject, infoObject?: IwaObject) {
    this.store = store;
    this.object = object;
    this.infoObject = infoObject;
  }

  get name(): string | undefined {
    return this.object.message.getString(TableModelFields.TABLE_NAME);
  }

  set name(value: string) {
    this.object.message.setString(TableModelFields.TABLE_NAME, value);
  }

  get rowCount(): number {
    return this.object.message.getUint(TableModelFields.NUMBER_OF_ROWS) ?? 0;
  }

  get columnCount(): number {
    return this.object.message.getUint(TableModelFields.NUMBER_OF_COLUMNS) ?? 0;
  }

  get headerRowCount(): number {
    return this.object.message.getUint(TableModelFields.HEADER_ROWS) ?? 0;
  }

  get headerColumnCount(): number {
    return this.object.message.getUint(TableModelFields.HEADER_COLUMNS) ?? 0;
  }

  private dataStore(): RawMessage | undefined {
    return this.object.message.getMessage(TableModelFields.BASE_DATA_STORE);
  }

  /** key → string map of a TableDataList referenced from the data store. */
  private dataListMap(
    field: number,
    value: (entry: RawMessage) => string | undefined,
  ): Map<number, string> {
    const out = new Map<number, string>();
    const ds = this.dataStore();
    const table = this.store.resolve(refId(ds, field));
    if (!table) return out;
    for (const e of table.message.getMessages(DataList.ENTRIES)) {
      const key = e.getUint(ListEntry.KEY);
      const v = value(e);
      if (key !== undefined && v !== undefined) out.set(key, v);
    }
    return out;
  }

  private stringTable(): Map<number, string> {
    return this.dataListMap(DataStoreFields.STRING_TABLE, (e) => e.getString(ListEntry.STRING));
  }

  /** Rich-text entries resolved through their payload storage's plain text. */
  private richTextTable(): Map<number, string> {
    return this.dataListMap(DataStoreFields.RICH_TEXT_TABLE, (e) => {
      const payload = this.store.resolve(refId(e, ListEntry.RICH_TEXT_PAYLOAD));
      const storage = this.store.resolve(refId(payload?.message, RichTextPayload.STORAGE));
      return storage?.message.getStrings(Storage.TEXT)[0];
    });
  }

  /**
   * Merged cell ranges, anchored at their top-left cell.
   *
   * Two encodings exist and the *documented* one is not the one current
   * apps use. `DataStore.merge_region_map` holds packed CellRange values,
   * but no document in the corpus — Numbers or Pages, 2013 through 26.x —
   * actually has one. Real merges live in the calc engine, as colon-tract
   * AST nodes inside `TableModelArchive.merge_owner.formula_store`. A
   * reader that only knows the region map silently reports zero merges for
   * every merged table it will ever meet, so the formula store is read
   * first and the region map kept as a fallback.
   *
   * Ranges are deduplicated: a table can carry the same rectangle in both
   * encodings, and the same merge more than once in the formula store.
   */
  merges(): MergeRange[] {
    const out: MergeRange[] = [...this.mergesFromFormulaStore(), ...this.mergesFromRegionMap()];
    const seen = new Set<string>();
    return out.filter((m) => {
      const key = `${m.row},${m.column},${m.rowCount},${m.columnCount}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  /**
   * Decode merges from the merge owner's formula store.
   *
   * Each merge is a one-argument function node over a colon tract whose
   * `absolute_column` / `absolute_row` ranges give the rectangle. An
   * omitted `range_end` means a single row or column.
   */
  private mergesFromFormulaStore(): MergeRange[] {
    const out: MergeRange[] = [];
    const store = this.object.message
      .getMessage(TableModelFields.MERGE_OWNER)
      ?.getMessage(MergeOwner.FORMULA_STORE);
    for (const pair of store?.getMessages(FormulaStore.FORMULAS) ?? []) {
      const nodes = pair
        .getMessage(FormulaStore.PAIR_FORMULA)
        ?.getMessage(Formula.AST_NODE_ARRAY)
        ?.getMessages(AstNodeArray.NODES);
      for (const node of nodes ?? []) {
        if (node.getUint(AstNode.TYPE) !== AST_COLON_TRACT_NODE) continue;
        const tract = node.getMessage(AstNode.COLON_TRACT);
        const columns = absoluteRange(tract, ColonTract.ABSOLUTE_COLUMN);
        const rows = absoluteRange(tract, ColonTract.ABSOLUTE_ROW);
        if (!columns || !rows) continue;
        out.push({
          row: rows.begin,
          column: columns.begin,
          rowCount: rows.end - rows.begin + 1,
          columnCount: columns.end - columns.begin + 1,
        });
      }
    }
    return out;
  }

  private mergesFromRegionMap(): MergeRange[] {
    const out: MergeRange[] = [];
    const map = this.store.resolve(refId(this.dataStore(), DataStoreFields.MERGE_REGION_MAP));
    if (!map) return out;
    for (const range of map.message.getMessages(MergeMap.CELL_RANGE)) {
      const origin = range.getMessage(CellRange.ORIGIN)?.getFixed32(PACKED_DATA);
      const size = range.getMessage(CellRange.SIZE)?.getFixed32(PACKED_DATA);
      if (origin === undefined || size === undefined) continue;
      out.push({
        column: origin >>> 16,
        row: origin & 0xffff,
        columnCount: size >>> 16,
        rowCount: size & 0xffff,
      });
    }
    return out;
  }

  // ----------------------------------------------------------------- formats

  /**
   * How a cell's value is displayed, or undefined when it has no explicit
   * format and the app falls back to its automatic rendering.
   */
  cellFormat(row: number, column: number): CellFormat | undefined {
    const record = this.recordAt(row, column);
    if (!record) return undefined;
    const formats = this.formatTable();
    for (const flag of Object.values(FORMAT_FLAG_BY_CATEGORY)) {
      const id = record.id(flag);
      if (id === undefined) continue;
      const format = formats.get(id);
      if (format) return readFormat(format);
    }
    return undefined;
  }

  /**
   * Set how a cell's value is displayed.
   *
   * A cell shows one format, so any format the record already carried is
   * cleared first — leaving a stale currency id beside a new date id would
   * make the display depend on which flag the app happens to read first.
   */
  setCellFormat(row: number, column: number, format: CellFormat): void {
    this.requireWritable();
    const located = this.locateRow(row);
    if (!located) throw new RangeError(`row ${row} has no cell storage to format`);
    const layout = readRowLayout(located.rowInfo, this.columnCount);
    const existing = layout.records[column];
    if (!existing) throw new RangeError(`cell ${row},${column} is empty; give it a value first`);

    const record = CellRecord.decode(existing);
    record.removeAll(FORMAT_FLAGS);
    record.setId(flagForFormat(format), this.internFormat(format));

    layout.records[column] = record.encode();
    this.writeRowLayout(located.rowInfo, layout);
  }

  /** Apply one format across a rectangular block. */
  setRangeFormat(
    row: number,
    column: number,
    rowCount: number,
    columnCount: number,
    format: CellFormat,
  ): void {
    for (let r = row; r < row + rowCount; r++) {
      for (let c = column; c < column + columnCount; c++) {
        if (this.recordAt(r, c)) this.setCellFormat(r, c, format);
      }
    }
  }

  /** key → TSK.FormatStructArchive from the data store's format table. */
  private formatTable(): Map<number, RawMessage> {
    const out = new Map<number, RawMessage>();
    const list = this.store.resolve(refId(this.dataStore(), DataStoreFields.FORMAT_TABLE));
    for (const entry of list?.message.getMessages(DataList.ENTRIES) ?? []) {
      const key = entry.getUint(ListEntry.KEY);
      const format = entry.getMessage(ListEntry.FORMAT);
      if (key !== undefined && format) out.set(key, format);
    }
    return out;
  }

  /**
   * Add or reuse a format-table entry, returning its key.
   *
   * Reuse is by encoded equality: two cells showing "2 decimal places, no
   * separator" should share one entry, exactly as they do in Apple's own
   * files, rather than growing the table by one per formatted cell.
   */
  private internFormat(format: CellFormat): number {
    const list = this.store.resolve(refId(this.dataStore(), DataStoreFields.FORMAT_TABLE));
    if (!list) throw new RangeError("table has no format table; cannot store a cell format");
    const encoded = writeFormat(format);
    const wanted = encoded.toBytes();
    const m = list.message;
    for (const entry of m.getMessages(DataList.ENTRIES)) {
      const candidate = entry.getMessage(ListEntry.FORMAT);
      const key = entry.getUint(ListEntry.KEY);
      if (key === undefined || !candidate) continue;
      if (bytesEqual(candidate.toBytes(), wanted)) {
        entry.setVarint(ListEntry.REFCOUNT, (entry.getUint(ListEntry.REFCOUNT) ?? 0) + 1);
        return key;
      }
    }
    const key = m.getUint(DataList.NEXT_LIST_ID) ?? nextFreeKey(m);
    const entry = RawMessage.create();
    entry.setVarint(ListEntry.KEY, key);
    entry.setVarint(ListEntry.REFCOUNT, 1);
    entry.setMessage(ListEntry.FORMAT, encoded);
    m.addMessage(DataList.ENTRIES, entry);
    m.setVarint(DataList.NEXT_LIST_ID, key + 1);
    return key;
  }

  /** The decoded record of a cell, if it has storage. */
  private recordAt(row: number, column: number): CellRecord | undefined {
    const located = this.locateRow(row);
    if (!located) return undefined;
    const raw = readRowLayout(located.rowInfo, this.columnCount).records[column];
    return raw ? CellRecord.decode(raw) : undefined;
  }

  // ---------------------------------------------------------------- formulas

  /**
   * The formula in a cell, as text, or undefined when it holds a literal.
   *
   * Rendered from the cell's position because references are stored as
   * *offsets* from the cell using them — one formula entry is shared by
   * every cell in a filled-down column, and each renders differently.
   *
   * Function names come from a registry the format does not contain (see
   * `formulas.ts`); an unrecognised one renders as `FUNCTION_<id>` rather
   * than a guess. Use {@link cellFormulaDetail} to see what was unnamed.
   */
  cellFormula(row: number, column: number): string | undefined {
    return this.cellFormulaDetail(row, column)?.text || undefined;
  }

  /** {@link cellFormula} plus the ids and node types it could not name. */
  cellFormulaDetail(row: number, column: number): RenderedFormula | undefined {
    const id = this.formulaId(row, column);
    if (id === undefined) return undefined;
    const formula = this.formulaTable().get(id);
    if (!formula) return undefined;
    return renderFormula(formula, { row, column }, { owners: this.owners() });
  }

  /**
   * The document's calc-engine owner map, built once and cached.
   *
   * What turns a cross-table reference from an unnameable identity into
   * `Revenue::A2`. Scanning every object to build it is not something to do
   * per formula, so it is memoised on the store — a document's owners do
   * not change while its formulas are being read.
   */
  private owners(): FormulaOwnerRegistry {
    let registry = OWNER_REGISTRIES.get(this.store);
    if (!registry) {
      registry = new FormulaOwnerRegistry(this.store);
      OWNER_REGISTRIES.set(this.store, registry);
    }
    return registry;
  }

  /** `formula_id` of a cell, if its record carries one. */
  formulaId(row: number, column: number): number | undefined {
    const located = this.locateRow(row);
    if (!located) return undefined;
    const raw = readRowLayout(located.rowInfo, this.columnCount).records[column];
    return raw ? CellRecord.decode(raw).id(CellFlag.FORMULA_ID) : undefined;
  }

  /** Every formula cell in the table, with its rendered text. */
  formulas(): { row: number; column: number; formula: string }[] {
    const out: { row: number; column: number; formula: string }[] = [];
    if (this.storageGeneration !== "v5") return out;
    const table = this.formulaTable();
    if (table.size === 0) return out;
    for (const cell of this.cells()) {
      if (cell.value.type === "empty" || !cell.value.isFormula) continue;
      const formula = this.cellFormula(cell.row, cell.column);
      if (formula) out.push({ row: cell.row, column: cell.column, formula });
    }
    return out;
  }

  /** key → TSCE.FormulaArchive from the data store's formula table. */
  private formulaTable(): Map<number, RawMessage> {
    const out = new Map<number, RawMessage>();
    const list = this.store.resolve(refId(this.dataStore(), DataStoreFields.FORMULA_TABLE));
    for (const entry of list?.message.getMessages(DataList.ENTRIES) ?? []) {
      const key = entry.getUint(ListEntry.KEY);
      const formula = entry.getMessage(ListEntry.FORMULA);
      if (key !== undefined && formula) out.set(key, formula);
    }
    return out;
  }

  /** The merge covering a cell, if any — including the one it anchors. */
  mergeAt(row: number, column: number): MergeRange | undefined {
    return this.merges().find(
      (m) =>
        row >= m.row &&
        row < m.row + m.rowCount &&
        column >= m.column &&
        column < m.column + m.columnCount,
    );
  }

  /**
   * True when a cell is swallowed by a merge anchored elsewhere.
   *
   * Such a cell is not displayed at all: the anchor's content spans it.
   * Writing to it produces a value nobody will ever see.
   */
  isCovered(row: number, column: number): boolean {
    const merge = this.mergeAt(row, column);
    return merge !== undefined && (merge.row !== row || merge.column !== column);
  }

  /**
   * Cell-storage generation used by this table:
   *  - "v5"     "BNC" storage — readable. Observed in files as early as the
   *             2018-era apps (format 3.2.13), not only Numbers 10+.
   *  - "preBNC" storage versions 3/4 written by iWork '13/'15-era apps —
   *             NOT readable (undocumented layout; the reference Python
   *             implementation refuses these too)
   *  - "empty"  no tile rows at all
   */
  get storageGeneration(): "v5" | "preBNC" | "empty" {
    const tiles = this.dataStore()?.getMessage(DataStoreFields.TILES);
    if (!tiles) return "empty";
    let sawRow = false;
    for (const t of tiles.getMessages(TileStorageFields.TILES)) {
      const tile = this.store.resolve(refId(t, TileEntry.TILE));
      if (!tile) continue;
      // Authoritative markers first. Presence of the v5 buffer alone is NOT
      // a safe test: modern writers also emit the legacy fields 3/4 (as
      // stubs), and pre-BNC files can carry zero-length 6/7.
      if (tile.message.getBool(TileFields.LAST_SAVED_IN_BNC) === true) return "v5";
      const storageVersion = tile.message.getUint(TileFields.STORAGE_VERSION);
      if (storageVersion !== undefined && storageVersion >= 5) return "v5";
      for (const ri of tile.message.getMessages(TileFields.ROW_INFOS)) {
        sawRow = true;
        const rowVersion = ri.getUint(TileRowInfo.STORAGE_VERSION);
        if (rowVersion !== undefined && rowVersion >= 5) return "v5";
        // Fallback: a non-empty modern buffer.
        if ((ri.getBytes(TileRowInfo.CELL_STORAGE_BUFFER)?.length ?? 0) > 0) return "v5";
      }
    }
    return sawRow ? "preBNC" : "empty";
  }

  /** True when {@link cells} can decode this table's storage. */
  get hasReadableCells(): boolean {
    return this.storageGeneration !== "preBNC";
  }

  /**
   * All non-empty cells in reading order.
   *
   * Throws for pre-BNC storage rather than returning an empty list — a
   * silent [] would be indistinguishable from a genuinely empty table.
   * Check {@link hasReadableCells} first when handling files of unknown age.
   */
  cells(): CellInfo[] {
    const out: CellInfo[] = [];
    const ds = this.dataStore();
    if (!ds) return out;
    if (this.storageGeneration === "preBNC") {
      throw new RangeError(
        `table ${JSON.stringify(this.name ?? "")}: pre-BNC cell storage (written by an ` +
          `iWork '13/'15-era app) is not supported; re-saving in a current app converts it`,
      );
    }
    const strings = this.stringTable();
    const richText = this.richTextTable();
    const tiles = ds.getMessage(DataStoreFields.TILES);
    if (!tiles) return out;
    const tileSize = tiles.getUint(TileStorageFields.TILE_SIZE) ?? 256;
    const columnCount = this.columnCount;

    for (const t of tiles.getMessages(TileStorageFields.TILES)) {
      const tileId = t.getUint(TileEntry.TILEID) ?? 0;
      const tile = this.store.resolve(refId(t, TileEntry.TILE));
      if (!tile) continue;
      for (const ri of tile.message.getMessages(TileFields.ROW_INFOS)) {
        const rowInTile = ri.getUint(TileRowInfo.TILE_ROW_INDEX) ?? 0;
        const row = tileId * tileSize + rowInTile;
        const buf = ri.getBytes(TileRowInfo.CELL_STORAGE_BUFFER);
        const offsetsRaw = ri.getBytes(TileRowInfo.CELL_OFFSETS);
        if (!buf || !offsetsRaw) continue; // pre-BNC-only row
        const wide = ri.getBool(TileRowInfo.HAS_WIDE_OFFSETS) ?? false;
        const scale = wide ? 4 : 1;
        const offsets: number[] = [];
        for (let i = 0; i + 1 < offsetsRaw.length; i += 2) {
          const v = offsetsRaw[i]! | (offsetsRaw[i + 1]! << 8);
          offsets.push(v >= 0x8000 ? v - 0x10000 : v);
        }
        for (let col = 0; col < Math.min(columnCount, offsets.length); col++) {
          const off = offsets[col]!;
          if (off < 0) continue;
          let end = buf.length;
          for (let j = col + 1; j < offsets.length; j++) {
            if (offsets[j]! >= 0) {
              end = offsets[j]! * scale;
              break;
            }
          }
          const record = buf.subarray(off * scale, end);
          const value = decodeCellRecord(record, strings, richText);
          if (value.type !== "empty") out.push({ row, column: col, value });
        }
      }
    }
    out.sort((a, b) => a.row - b.row || a.column - b.column);
    return out;
  }

  /** Dense 2-D array of the table (null = empty cell). */
  grid(): (CellValue | null)[][] {
    const rows: (CellValue | null)[][] = [];
    for (let r = 0; r < this.rowCount; r++) {
      rows.push(new Array<CellValue | null>(this.columnCount).fill(null));
    }
    for (const cell of this.cells()) {
      if (cell.row < rows.length && cell.column < this.columnCount) {
        rows[cell.row]![cell.column] = cell.value;
      }
    }
    return rows;
  }

  /** Convenience: cell text/number as a display string ("" for empty). */
  cellText(row: number, column: number): string {
    for (const c of this.cells()) {
      if (c.row === row && c.column === column) return cellValueToString(c.value);
    }
    return "";
  }

  // --------------------------------------------------------------- writing

  /**
   * Write a value into an existing cell.
   *
   * Presentation the record already carries — cell and text style ids,
   * number formats, comments, conditional styles — is preserved, except
   * that format ids tied to the *old* value type are dropped when the type
   * changes (a date format on a number cell would render nonsense). Writing
   * a literal also clears any formula on the cell.
   *
   * Rich text (`{ type: "richText" }`) cannot be written: the value lives
   * in a separate TSWP storage object. Set plain `text` instead, or edit
   * the existing rich-text storage through {@link richTextStorage}.
   */
  setCell(row: number, column: number, value: CellInput, options: WriteOptions = {}): void {
    this.requireWritable();
    if (row < 0 || row >= this.rowCount || column < 0 || column >= this.columnCount) {
      throw new RangeError(
        `cell ${row},${column} is outside the table (${this.rowCount}×${this.columnCount})`,
      );
    }
    // Clearing a covered cell is harmless — it is already invisible, and
    // Apple leaves covered cells with no record at all. Only a real value
    // going somewhere nobody will see is worth refusing.
    if (value.type !== "empty") this.requireVisible(row, column, options);
    const located = this.locateRow(row);
    if (!located) {
      throw new RangeError(
        `row ${row} has no cell storage; only rows the app has materialized can be written`,
      );
    }
    const { rowInfo } = located;
    const layout = readRowLayout(rowInfo, this.columnCount);
    const previous = layout.records[column];
    const record = previous ? CellRecord.decode(previous) : new CellRecord();
    const previousStringId = record.id(CellFlag.STRING_ID);

    this.applyValue(record, value);

    // A literal supersedes whatever formula produced the old value.
    record.removeAll(CellFlag.FORMULA_ID | CellFlag.FORMULA_ERROR_ID);
    if (previousStringId !== undefined && record.id(CellFlag.STRING_ID) !== previousStringId) {
      this.releaseString(previousStringId);
    }

    layout.records[column] =
      record.type === CellType.EMPTY && record.flags === 0 ? undefined : record.encode();
    this.writeRowLayout(rowInfo, layout);
    this.refreshRowHeader(row, layout.records.filter((r) => r !== undefined).length);
    this.refreshTileTotals();
  }

  /** Clear a cell's value, keeping its styling. */
  clearCell(row: number, column: number): void {
    this.setCell(row, column, { type: "empty" });
  }

  /**
   * Clear every cell, keeping the table's shape, styling and bands.
   *
   * A blank table laid out like the one it was copied from, which is what
   * "add a table" usually means — as opposed to a duplicate of the data.
   * Covered cells are cleared too: leaving them would strand values inside
   * a merge whose anchor is now empty.
   */
  clearAllCells(): void {
    this.requireWritable();
    for (let row = 0; row < this.rowCount; row++) {
      for (let column = 0; column < this.columnCount; column++) {
        this.setCell(row, column, { type: "empty" }, { allowCovered: true });
      }
    }
  }

  /** Write a whole row left-to-right, padding with empties. */
  setRow(row: number, values: readonly CellInput[], options: WriteOptions = {}): void {
    for (let column = 0; column < this.columnCount; column++) {
      this.setCell(row, column, values[column] ?? { type: "empty" }, options);
    }
  }

  /** Write a rectangular block anchored at `row`,`column`. */
  setCells(
    row: number,
    column: number,
    values: readonly (readonly CellInput[])[],
    options: WriteOptions = {},
  ): void {
    for (let r = 0; r < values.length; r++) {
      const line = values[r]!;
      for (let c = 0; c < line.length; c++) this.setCell(row + r, column + c, line[c]!, options);
    }
  }

  /** The TSWP storage backing a rich-text cell, for editing its runs. */
  richTextStorage(row: number, column: number): IwaObject | undefined {
    const located = this.locateRow(row);
    if (!located) return undefined;
    const raw = readRowLayout(located.rowInfo, this.columnCount).records[column];
    if (!raw) return undefined;
    const richId = CellRecord.decode(raw).id(CellFlag.RICH_ID);
    if (richId === undefined) return undefined;
    const list = this.store.resolve(refId(this.dataStore(), DataStoreFields.RICH_TEXT_TABLE));
    for (const e of list?.message.getMessages(DataList.ENTRIES) ?? []) {
      if (e.getUint(ListEntry.KEY) !== richId) continue;
      const payload = this.store.resolve(refId(e, ListEntry.RICH_TEXT_PAYLOAD));
      return this.store.resolve(refId(payload?.message, RichTextPayload.STORAGE));
    }
    return undefined;
  }

  // ------------------------------------------------------------- structure

  get footerRowCount(): number {
    return this.object.message.getUint(TableModelFields.FOOTER_ROWS) ?? 0;
  }

  /** Header rows stay visible while the table scrolls (Numbers). */
  get headerRowsFrozen(): boolean {
    return this.object.message.getBool(TableModelFields.HEADER_ROWS_FROZEN) ?? false;
  }

  get headerColumnsFrozen(): boolean {
    return this.object.message.getBool(TableModelFields.HEADER_COLUMNS_FROZEN) ?? false;
  }

  /** Header rows repeat at the top of each page/slide the table spans. */
  get repeatingHeaderRows(): boolean {
    return this.object.message.getBool(TableModelFields.REPEATING_HEADER_ROWS) ?? false;
  }

  get repeatingHeaderColumns(): boolean {
    return this.object.message.getBool(TableModelFields.REPEATING_HEADER_COLUMNS) ?? false;
  }

  /**
   * Change how many leading rows/columns are header bands, and how those
   * bands behave.
   *
   * Bands are presentation only — cell storage is identical either way —
   * so this is a safe edit that does not touch the tiles. Counts are
   * clamped to the table's real size: a header count past the last row
   * would leave the app with no body.
   */
  setBands(bands: {
    headerRows?: number;
    headerColumns?: number;
    footerRows?: number;
    /** Keep header rows on screen while scrolling (Numbers). */
    freezeHeaderRows?: boolean;
    freezeHeaderColumns?: boolean;
    /** Repeat header rows on every page the table spans (Pages/Numbers print). */
    repeatHeaderRows?: boolean;
    repeatHeaderColumns?: boolean;
  }): void {
    const m = this.object.message;
    if (bands.headerRows !== undefined) {
      m.setVarint(TableModelFields.HEADER_ROWS, clampBand(bands.headerRows, this.rowCount));
    }
    if (bands.headerColumns !== undefined) {
      m.setVarint(TableModelFields.HEADER_COLUMNS, clampBand(bands.headerColumns, this.columnCount));
    }
    if (bands.footerRows !== undefined) {
      m.setVarint(TableModelFields.FOOTER_ROWS, clampBand(bands.footerRows, this.rowCount));
    }
    for (const [key, field] of [
      ["freezeHeaderRows", TableModelFields.HEADER_ROWS_FROZEN],
      ["freezeHeaderColumns", TableModelFields.HEADER_COLUMNS_FROZEN],
      ["repeatHeaderRows", TableModelFields.REPEATING_HEADER_ROWS],
      ["repeatHeaderColumns", TableModelFields.REPEATING_HEADER_COLUMNS],
    ] as const) {
      const value = bands[key];
      if (value !== undefined) m.setBool(field, value);
    }
  }

  /** Height of a row in points, falling back to the table default. */
  rowHeight(row: number): number {
    const size = this.header(DataStoreFields.ROW_HEADERS, row)?.getFloat(HeaderFields.SIZE) ?? 0;
    return size > 0 ? size : (this.object.message.getDouble(TableModelFields.DEFAULT_ROW_HEIGHT) ?? 0);
  }

  columnWidth(column: number): number {
    const size =
      this.header(DataStoreFields.COLUMN_HEADERS, column)?.getFloat(HeaderFields.SIZE) ?? 0;
    return size > 0
      ? size
      : (this.object.message.getDouble(TableModelFields.DEFAULT_COLUMN_WIDTH) ?? 0);
  }

  /** Set an explicit row height; 0 restores the table default. */
  setRowHeight(row: number, points: number): void {
    const header = this.header(DataStoreFields.ROW_HEADERS, row);
    if (!header) throw new RangeError(`row ${row} has no header entry to size`);
    header.setFloat(HeaderFields.SIZE, points);
  }

  setColumnWidth(column: number, points: number): void {
    const header = this.header(DataStoreFields.COLUMN_HEADERS, column);
    if (!header) throw new RangeError(`column ${column} has no header entry to size`);
    header.setFloat(HeaderFields.SIZE, points);
  }

  /** True when the row or column is hidden. */
  isRowHidden(row: number): boolean {
    return (this.header(DataStoreFields.ROW_HEADERS, row)?.getUint(HeaderFields.HIDING_STATE) ?? 0) !== 0;
  }

  isColumnHidden(column: number): boolean {
    return (
      (this.header(DataStoreFields.COLUMN_HEADERS, column)?.getUint(HeaderFields.HIDING_STATE) ?? 0) !==
      0
    );
  }

  /**
   * Locate a row or column header entry.
   *
   * `rowHeaders` is a bucket list, `columnHeaders` a single bucket
   * reference — the two are shaped differently in the proto, so both
   * spellings are handled here rather than at every call site.
   */
  private header(field: number, index: number): RawMessage | undefined {
    const ds = this.dataStore();
    if (!ds) return undefined;
    const buckets: (IwaObject | undefined)[] = [];
    const storage = ds.getMessage(field);
    if (storage && storage.has(HeaderStorage.BUCKETS)) {
      for (const ref of storage.getMessages(HeaderStorage.BUCKETS)) {
        buckets.push(this.store.resolve(ref.getVarint(1)));
      }
    } else {
      buckets.push(this.store.resolve(refId(ds, field)));
    }
    for (const bucket of buckets) {
      for (const header of bucket?.message.getMessages(HeaderBucket.HEADERS) ?? []) {
        if (header.getUint(HeaderFields.INDEX) === index) return header;
      }
    }
    return undefined;
  }

  // ------------------------------------------------- rows and columns

  /**
   * Insert blank rows before `at`.
   *
   * The whole table's storage is rebuilt rather than patched: tiles, row
   * headers and per-column cell counts all have to agree afterwards, and
   * shifting them independently is how those three drift apart.
   *
   * **Formula references are not adjusted.** Relative references survive
   * by construction — they are offsets from the cell using them, so a
   * formula that moves keeps pointing at the same relative neighbour — but
   * an absolute range spanning the insertion point still names its old
   * bounds. Adjusting those correctly is calc-engine work; see
   * docs/FORMAT.md §14.7.
   */
  insertRows(at: number, count = 1): void {
    this.requireWritable();
    if (count <= 0) return;
    if (at < 0 || at > this.rowCount) {
      throw new RangeError(`cannot insert at row ${at}: table has ${this.rowCount} rows`);
    }
    const rows = this.snapshotRows();
    const blank = (): RowSnapshot => ({
      records: new Array<Uint8Array | undefined>(this.columnCount).fill(undefined),
      // A new row inherits the height of the one it displaces, so inserting
      // into a table with sized rows does not leave a differently-sized gap.
      height: rows[Math.min(at, rows.length - 1)]?.height ?? 0,
      hidden: 0,
    });
    rows.splice(at, 0, ...Array.from({ length: count }, blank));
    this.rewriteRows(rows);
    this.shiftMergesForRows(at, count);
  }

  /** Delete rows starting at `at`. */
  deleteRows(at: number, count = 1): void {
    this.requireWritable();
    if (count <= 0) return;
    const rows = this.snapshotRows();
    if (at < 0 || at + count > rows.length) {
      throw new RangeError(`cannot delete rows ${at}..${at + count - 1}: table has ${rows.length}`);
    }
    if (rows.length - count < 1) throw new RangeError("a table must keep at least one row");
    // Release the strings the deleted cells held, so the string table does
    // not accumulate entries nothing references.
    for (const row of rows.slice(at, at + count)) this.releaseRowStrings(row);
    rows.splice(at, count);
    this.rewriteRows(rows);
    this.shiftMergesForRows(at, -count);
  }

  /** Insert blank columns before `at`. */
  insertColumns(at: number, count = 1): void {
    this.requireWritable();
    if (count <= 0) return;
    if (at < 0 || at > this.columnCount) {
      throw new RangeError(`cannot insert at column ${at}: table has ${this.columnCount} columns`);
    }
    const rows = this.snapshotRows();
    for (const row of rows) {
      row.records.splice(at, 0, ...new Array<Uint8Array | undefined>(count).fill(undefined));
    }
    const widths = this.columnWidths();
    const width = widths[Math.min(at, widths.length - 1)] ?? 0;
    widths.splice(at, 0, ...new Array<number>(count).fill(width));
    this.object.message.setVarint(TableModelFields.NUMBER_OF_COLUMNS, this.columnCount + count);
    this.rewriteRows(rows);
    this.rewriteColumnHeaders(widths, rows);
    this.shiftMergesForColumns(at, count);
  }

  /** Delete columns starting at `at`. */
  deleteColumns(at: number, count = 1): void {
    this.requireWritable();
    if (count <= 0) return;
    if (at < 0 || at + count > this.columnCount) {
      throw new RangeError(
        `cannot delete columns ${at}..${at + count - 1}: table has ${this.columnCount}`,
      );
    }
    if (this.columnCount - count < 1) throw new RangeError("a table must keep at least one column");
    const rows = this.snapshotRows();
    for (const row of rows) {
      for (const record of row.records.slice(at, at + count)) this.releaseRecordString(record);
      row.records.splice(at, count);
    }
    const widths = this.columnWidths();
    widths.splice(at, count);
    this.object.message.setVarint(TableModelFields.NUMBER_OF_COLUMNS, this.columnCount - count);
    this.rewriteRows(rows);
    this.rewriteColumnHeaders(widths, rows);
    this.shiftMergesForColumns(at, -count);
  }

  /** Every row's records and header geometry, indexed by table row. */
  private snapshotRows(): RowSnapshot[] {
    const rows: RowSnapshot[] = [];
    for (let row = 0; row < this.rowCount; row++) {
      const located = this.locateRow(row);
      const records = located
        ? readRowLayout(located.rowInfo, this.columnCount).records.slice(0, this.columnCount)
        : [];
      while (records.length < this.columnCount) records.push(undefined);
      const header = this.header(DataStoreFields.ROW_HEADERS, row);
      rows.push({
        records,
        height: header?.getFloat(HeaderFields.SIZE) ?? 0,
        hidden: header?.getUint(HeaderFields.HIDING_STATE) ?? 0,
      });
    }
    return rows;
  }

  private columnWidths(): number[] {
    const widths: number[] = [];
    for (let column = 0; column < this.columnCount; column++) {
      widths.push(this.header(DataStoreFields.COLUMN_HEADERS, column)?.getFloat(HeaderFields.SIZE) ?? 0);
    }
    return widths;
  }

  /**
   * Rebuild every tile, row info and row header from a snapshot.
   *
   * Rows are redistributed across tiles of `tile_size` from scratch, which
   * is what makes an insert in the middle of a multi-tile table correct
   * rather than only correct within one tile.
   */
  private rewriteRows(rows: readonly RowSnapshot[]): void {
    const ds = this.dataStore();
    const tiles = ds?.getMessage(DataStoreFields.TILES);
    if (!ds || !tiles) throw new RangeError("table has no tile storage to rewrite");
    const tileSize = tiles.getUint(TileStorageFields.TILE_SIZE) ?? DEFAULT_TILE_SIZE;
    const component = this.store.componentOf(this.object.identifier);
    if (!component) throw new RangeError("table model has no component");

    const existing = tiles.getMessages(TileStorageFields.TILES);
    const spare = existing
      .map((entry) => this.store.resolve(refId(entry, TileEntry.TILE)))
      .filter((obj): obj is IwaObject => obj !== undefined);

    const tileCount = Math.max(1, Math.ceil(rows.length / tileSize));
    const entries: RawMessage[] = [];
    for (let tileIndex = 0; tileIndex < tileCount; tileIndex++) {
      // Reuse tile objects before minting new ones: a fresh object id for
      // an unchanged tile is a gratuitous diff against the app's output.
      const tile = spare[tileIndex] ?? this.store.createObject(TST_TYPE.TILE, component);
      const message = tile.message;
      const infos: RawMessage[] = [];
      const start = tileIndex * tileSize;
      for (let offset = 0; offset < tileSize && start + offset < rows.length; offset++) {
        const rowInfo = RawMessage.create();
        rowInfo.setVarint(TileRowInfo.TILE_ROW_INDEX, offset);
        this.writeRowLayout(rowInfo, {
          records: [...rows[start + offset]!.records],
          offsetSlots: Math.max(this.columnCount, DEFAULT_OFFSET_SLOTS),
        });
        infos.push(rowInfo);
      }
      message.setMessages(TileFields.ROW_INFOS, infos);
      message.setVarint(TileFields.NUM_ROWS, infos.length);
      message.setBool(TileFields.LAST_SAVED_IN_BNC, true);
      message.setVarint(TileFields.STORAGE_VERSION, 5);
      // maxColumn/maxRow/numCells are `required` but Apple writes 0.
      for (const field of [TileFields.MAX_COLUMN, TileFields.MAX_ROW, TileFields.NUM_CELLS]) {
        if (!message.has(field)) message.setVarint(field, 0);
      }
      const entry = RawMessage.create();
      entry.setVarint(TileEntry.TILEID, tileIndex);
      entry.setMessage(TileEntry.TILE, makeRef(tile.identifier));
      entries.push(entry);
    }
    tiles.setMessages(TileStorageFields.TILES, entries);
    if (!tiles.has(TileStorageFields.TILE_SIZE)) {
      tiles.setVarint(TileStorageFields.TILE_SIZE, tileSize);
    }

    // The row→tile index must describe the tiles that now exist.
    const tree = ds.getMessage(DataStoreFields.ROW_TILE_TREE);
    if (tree) {
      const nodes: RawMessage[] = [];
      for (let tileIndex = 0; tileIndex < tileCount; tileIndex++) {
        const node = RawMessage.create();
        node.setVarint(RbTree.KEY, tileIndex * tileSize);
        node.setVarint(RbTree.VALUE, tileIndex);
        nodes.push(node);
      }
      tree.setMessages(RbTree.NODES, nodes);
    }

    this.rewriteRowHeaders(rows);
    this.object.message.setVarint(TableModelFields.NUMBER_OF_ROWS, rows.length);
    this.clampBandsToSize();
  }

  private rewriteRowHeaders(rows: readonly RowSnapshot[]): void {
    const bucket = this.headerBucket(DataStoreFields.ROW_HEADERS);
    if (!bucket) return;
    const headers: RawMessage[] = rows.map((row, index) => {
      const header = RawMessage.create();
      header.setVarint(HeaderFields.INDEX, index);
      header.setFloat(HeaderFields.SIZE, row.height);
      header.setVarint(HeaderFields.HIDING_STATE, row.hidden);
      header.setVarint(
        HeaderFields.NUMBER_OF_CELLS,
        row.records.filter((record) => record !== undefined).length,
      );
      return header;
    });
    bucket.message.setMessages(HeaderBucket.HEADERS, headers);
  }

  private rewriteColumnHeaders(widths: readonly number[], rows: readonly RowSnapshot[]): void {
    const bucket = this.headerBucket(DataStoreFields.COLUMN_HEADERS);
    if (!bucket) return;
    const headers: RawMessage[] = widths.map((width, index) => {
      const header = RawMessage.create();
      header.setVarint(HeaderFields.INDEX, index);
      header.setFloat(HeaderFields.SIZE, width);
      header.setVarint(HeaderFields.HIDING_STATE, 0);
      header.setVarint(
        HeaderFields.NUMBER_OF_CELLS,
        rows.filter((row) => row.records[index] !== undefined).length,
      );
      return header;
    });
    bucket.message.setMessages(HeaderBucket.HEADERS, headers);
  }

  /** The single bucket object behind a header storage field. */
  private headerBucket(field: number): IwaObject | undefined {
    const ds = this.dataStore();
    if (!ds) return undefined;
    const storage = ds.getMessage(field);
    if (storage?.has(HeaderStorage.BUCKETS)) {
      return this.store.resolve(storage.getMessages(HeaderStorage.BUCKETS)[0]?.getVarint(1));
    }
    return this.store.resolve(refId(ds, field));
  }

  /** Header bands cannot outlive the rows and columns they describe. */
  private clampBandsToSize(): void {
    const m = this.object.message;
    for (const [field, limit] of [
      [TableModelFields.HEADER_ROWS, this.rowCount],
      [TableModelFields.FOOTER_ROWS, this.rowCount],
      [TableModelFields.HEADER_COLUMNS, this.columnCount],
    ] as const) {
      const value = m.getUint(field);
      if (value !== undefined && value > limit) m.setVarint(field, limit);
    }
  }

  /** Move or drop merges when rows are inserted (`delta > 0`) or deleted. */
  private shiftMergesForRows(at: number, delta: number): void {
    this.rewriteMerges((merge) => shiftRange(merge, at, delta, "row"));
  }

  private shiftMergesForColumns(at: number, delta: number): void {
    this.rewriteMerges((merge) => shiftRange(merge, at, delta, "column"));
  }

  /**
   * Apply a transform to every merge, writing the result to the region map.
   *
   * Merges are *read* from the calc engine's formula store (§14.4), which
   * cannot be rewritten without inventing calc-engine identity. Writing the
   * adjusted set to `merge_region_map` instead keeps this library's own
   * reading correct after a structural edit, and is the encoding the format
   * documents even though current apps do not emit it. The stale formulas
   * are left alone rather than corrupted.
   */
  private rewriteMerges(transform: (merge: MergeRange) => MergeRange | undefined): void {
    const before = this.merges();
    if (before.length === 0) return;
    const after = before.map(transform).filter((m): m is MergeRange => m !== undefined);
    const ds = this.dataStore();
    if (!ds) return;
    let map = this.store.resolve(refId(ds, DataStoreFields.MERGE_REGION_MAP));
    if (!map) {
      const component = this.store.componentOf(this.object.identifier);
      if (!component) return;
      map = this.store.createObject(TST_TYPE.MERGE_REGION_MAP, component);
      ds.setMessage(DataStoreFields.MERGE_REGION_MAP, makeRef(map.identifier));
    }
    const ranges: RawMessage[] = after.map((merge) => {
      const range = RawMessage.create();
      const origin = RawMessage.create();
      origin.setFixed32(PACKED_DATA, ((merge.column << 16) | (merge.row & 0xffff)) >>> 0);
      const size = RawMessage.create();
      size.setFixed32(PACKED_DATA, ((merge.columnCount << 16) | (merge.rowCount & 0xffff)) >>> 0);
      range.setMessage(CellRange.ORIGIN, origin);
      range.setMessage(CellRange.SIZE, size);
      return range;
    });
    map.message.setMessages(MergeMap.CELL_RANGE, ranges);
    // The formula-store copy would now disagree; drop it so the region map
    // is the single source rather than one of two conflicting ones.
    this.object.message.getMessage(TableModelFields.MERGE_OWNER)?.remove(MergeOwner.FORMULA_STORE);
  }

  /** Decrement string-table refcounts for every string a row referenced. */
  private releaseRowStrings(row: RowSnapshot): void {
    for (const record of row.records) this.releaseRecordString(record);
  }

  private releaseRecordString(record: Uint8Array | undefined): void {
    if (!record) return;
    const id = CellRecord.decode(record).id(CellFlag.STRING_ID);
    if (id !== undefined) this.releaseString(id);
  }

  // --------------------------------------------------------------- styling

  /**
   * The table's own style (banded rows, grid strokes, visibility toggles).
   *
   * Editing it affects every table sharing the style — Numbers' stock
   * themes give each table its own, but a document built by duplication may
   * not. {@link styleTable} is where per-cell styles live instead.
   */
  tableStyle(): TableStyleHandle | undefined {
    const obj = this.store.resolve(refId(this.object.message, TableModelFields.TABLE_STYLE));
    return obj ? new TableStyleHandle(this.store, obj) : undefined;
  }

  /**
   * Cell formatting of a named band — fill, borders, padding, alignment.
   *
   * A band has two styles, not one: this covers the *cell* (background and
   * borders); {@link bandTextStyle} covers the *text* inside it. Making a
   * header row bold means editing the text style, not this one.
   */
  bandStyle(band: TableBand): TableStyleHandle | undefined {
    const obj = this.store.resolve(refId(this.object.message, BAND_STYLE_FIELDS[band]));
    return obj ? new TableStyleHandle(this.store, obj) : undefined;
  }

  /**
   * Character formatting of a named band's text.
   *
   * A `TSWP.CharacterStyleArchive`, so it takes the same
   * {@link CharacterFormatting} as any other text in the suite.
   */
  bandTextStyle(band: TableBand): StyleHandle | undefined {
    const obj = this.store.resolve(refId(this.object.message, BAND_TEXT_STYLE_FIELDS[band]));
    return obj ? new StyleHandle(this.store, obj) : undefined;
  }

  /** The cell style applied to one cell, if it has an explicit one. */
  cellStyle(row: number, column: number): TableStyleHandle | undefined {
    const id = this.cellStyleId(row, column);
    if (id === undefined) return undefined;
    const obj = this.store.resolve(this.styleTableEntry(id));
    return obj ? new TableStyleHandle(this.store, obj) : undefined;
  }

  /** Read the formatting in effect for a cell, or `{}` when it has none. */
  cellFormatting(row: number, column: number): CellFormatting {
    return this.cellStyle(row, column)?.cell() ?? {};
  }

  /**
   * Style one cell: fill, borders, padding, vertical alignment, wrapping.
   *
   * A new cell style is created, based on the cell's current one so
   * unspecified properties are inherited rather than lost, registered in the
   * table's style table and referenced from the cell record. Styling a cell
   * therefore never disturbs its neighbours, even when they shared a style.
   */
  setCellFormatting(row: number, column: number, formatting: CellFormatting): void {
    this.requireWritable();
    const located = this.locateRow(row);
    if (!located) throw new RangeError(`row ${row} has no cell storage; nothing to style`);
    const layout = readRowLayout(located.rowInfo, this.columnCount);
    const existing = layout.records[column];
    const record = existing ? CellRecord.decode(existing) : new CellRecord();

    const basedOn = record.id(CellFlag.CELL_STYLE_ID);
    const styleId = this.createCellStyle(formatting, basedOn);
    record.setId(CellFlag.CELL_STYLE_ID, styleId);

    layout.records[column] = record.encode();
    this.writeRowLayout(located.rowInfo, layout);
    this.refreshRowHeader(row, layout.records.filter((r) => r !== undefined).length);
    this.refreshTileTotals();
  }

  /** Apply the same formatting to a rectangular block of cells. */
  setRangeFormatting(
    row: number,
    column: number,
    rowCount: number,
    columnCount: number,
    formatting: CellFormatting,
  ): void {
    for (let r = row; r < row + rowCount; r++) {
      for (let c = column; c < column + columnCount; c++) this.setCellFormatting(r, c, formatting);
    }
  }

  // --------------------------------------------------- conditional formatting

  /**
   * Every conditional-formatting rule set the table interns, by key.
   *
   * Rule sets are shared: one entry covers every cell it was applied to,
   * and its `refcount` is that cell count. So this returns a handful of
   * sets even for a table where hundreds of cells are conditionally
   * formatted.
   */
  conditionalStyleSets(): Map<number, ConditionalStyleSet> {
    const out = new Map<number, ConditionalStyleSet>();
    const list = this.store.resolve(
      refId(this.dataStore(), DataStoreFields.CONDITIONAL_STYLE_TABLE),
    );
    for (const entry of list?.message.getMessages(DataList.ENTRIES) ?? []) {
      const key = entry.getUint(ListEntry.KEY);
      const target = this.store.resolve(refId(entry, ListEntry.REFERENCE));
      if (key !== undefined && target) out.set(key, new ConditionalStyleSet(this.store, target, key));
    }
    return out;
  }

  /** Key into {@link conditionalStyleSets} carried by a cell's record. */
  conditionalStyleKey(row: number, column: number): number | undefined {
    return this.recordAt(row, column)?.id(CellFlag.COND_STYLE_ID);
  }

  /**
   * The second conditional id a cell record carries, meaning unconfirmed.
   *
   * Sits in the `COND_RULE_STYLE_ID` slot, which by position corresponds to
   * `CellArchive.conditional_style_applied_rule` — the rule that last
   * matched. The corpus does not bear that out: in the one fixture with
   * real rules, every cell sharing a one-rule set carries the same value
   * (15) regardless of content, and cells on other sets carry 0, which is
   * not a valid key in any of the table's lists. So it is exposed raw and
   * preserved byte-for-byte rather than interpreted. See
   * `docs/VERIFICATION.md`.
   */
  conditionalRuleId(row: number, column: number): number | undefined {
    return this.recordAt(row, column)?.id(CellFlag.COND_RULE_STYLE_ID);
  }

  /** The rule set governing one cell, if it has one. */
  conditionalStyleSet(row: number, column: number): ConditionalStyleSet | undefined {
    const key = this.conditionalStyleKey(row, column);
    return key === undefined ? undefined : this.conditionalStyleSets().get(key);
  }

  /**
   * The conditional-formatting rules on a cell, in evaluation order.
   *
   * Conditions render against the cell asked about, so a rule on B4 reads
   * `B4<0`. Nothing here evaluates them: deciding which rule *matches*
   * means running the calc engine over the document, and a wrong answer
   * would be indistinguishable from a right one.
   */
  conditionalRules(row: number, column: number): ConditionalRule[] {
    return this.conditionalStyleSet(row, column)?.rules({ row, column }) ?? [];
  }

  /**
   * Apply an existing rule set to another cell.
   *
   * Only re-points a cell at a set the table already interns — the sets
   * themselves come from the app. That covers the common edit (extend this
   * conditional format to more cells) without asserting a rule layout no
   * fixture demonstrates.
   */
  setConditionalStyleKey(row: number, column: number, key: number | undefined): void {
    this.requireWritable();
    if (key !== undefined && !this.conditionalStyleSets().has(key)) {
      throw new RangeError(`table has no conditional style set with key ${key}`);
    }
    const located = this.locateRow(row);
    if (!located) throw new RangeError(`row ${row} has no cell storage`);
    const layout = readRowLayout(located.rowInfo, this.columnCount);
    const existing = layout.records[column];
    if (!existing) throw new RangeError(`cell ${row},${column} has no storage`);
    const record = CellRecord.decode(existing);
    if (key === undefined) {
      record.remove(CellFlag.COND_STYLE_ID);
      record.remove(CellFlag.COND_RULE_STYLE_ID);
    } else {
      record.setId(CellFlag.COND_STYLE_ID, key);
    }
    layout.records[column] = record.encode();
    this.writeRowLayout(located.rowInfo, layout);
  }

  // -------------------------------------------------------------- filtering

  /**
   * The table's row and column filter sets.
   *
   * Reached through `hidden_states_owner`, because a filter set belongs to
   * a hidden-state extent rather than to the table directly — the extent
   * records *which* rows ended up hidden, the filter set records *why*.
   * Tables written before that structure existed have neither.
   */
  filterSets(): { rows: FilterSet | undefined; columns: FilterSet | undefined } {
    const owner = this.object.message.getMessage(TableModelFields.HIDDEN_STATES_OWNER);
    for (const states of owner?.getMessages(HiddenStatesOwner.HIDDEN_STATES) ?? []) {
      const resolve = (field: number): FilterSet | undefined => {
        const target = this.store.resolve(
          refId(states.getMessage(field), HiddenStateExtent.FILTER_SET),
        );
        return target ? new FilterSet(this.store, target) : undefined;
      };
      const rows = resolve(HiddenStates.ROW_EXTENT);
      const columns = resolve(HiddenStates.COLUMN_EXTENT);
      if (rows || columns) return { rows, columns };
    }
    return { rows: undefined, columns: undefined };
  }

  // ------------------------------------------------------------- categories

  /**
   * Row and column identities, for the parts of the format that address
   * cells by UID rather than position.
   */
  uidMap(): ColumnRowUidMap {
    return uidMapOf(this.store, this.object.message);
  }

  /**
   * The table's category (row grouping) definitions.
   *
   * More than one can exist — Numbers keeps a definition around when
   * grouping is switched off — so `enabled` says which is live.
   */
  categories(): TableCategories[] {
    return categoriesOf(this.store, this.object.message, this.uidMap());
  }

  /** The category definition the app is currently applying, if any. */
  activeCategories(): TableCategories | undefined {
    return this.categories().find((definition) => definition.enabled);
  }

  /**
   * Groups whose cached membership no longer matches the cells.
   *
   * The group tree is what the app worked out last time it grouped the
   * rows; editing cells here does not regroup them. Unlike a table of
   * contents, the staleness is checkable, because the grouping column's
   * values are in the table.
   */
  staleCategoryGroups(): { group: CategoryGroup; rows: number[] }[] {
    const definition = this.activeCategories();
    if (!definition) return [];
    // Index the cells once: verify asks for one column across many rows,
    // and cells() walks every tile.
    const byPosition = new Map<string, CellValue>();
    for (const cell of this.cells()) byPosition.set(`${cell.row}:${cell.column}`, cell.value);
    return definition.verify((row, column) =>
      groupValueOf(byPosition.get(`${row}:${column}`)),
    );
  }

  /** `cell_style_id` of a cell, if its record carries one. */
  cellStyleId(row: number, column: number): number | undefined {
    const located = this.locateRow(row);
    if (!located) return undefined;
    const raw = readRowLayout(located.rowInfo, this.columnCount).records[column];
    return raw ? CellRecord.decode(raw).id(CellFlag.CELL_STYLE_ID) : undefined;
  }

  /**
   * Create a cell style object and register it in the table's style table.
   *
   * The style table is a `TableDataList` of references, so the new object
   * must be reachable from it *and* from the component's external
   * references — hence the explicit `object_references` refresh, which the
   * generic save path cannot do for a type it has no extractor for.
   */
  private createCellStyle(formatting: CellFormatting, basedOn?: number): number {
    const list = this.store.resolve(refId(this.dataStore(), DataStoreFields.STYLE_TABLE));
    if (!list) throw new RangeError("table has no style table; cannot style cells");
    const component = this.store.componentOf(list.identifier);
    if (!component) throw new RangeError("style table has no component");

    const parentId = basedOn !== undefined ? this.styleTableEntry(basedOn) : undefined;
    const parent = parentId !== undefined ? this.store.resolve(parentId) : undefined;
    const created = this.store.createObject(TST_STYLE_TYPE.CELL_STYLE, component, {
      ...(parent ? { cloneFrom: parent } : {}),
    });
    // Cloning copies the parent's name/identifier, which must not be reused:
    // two styles answering to one identifier is a corrupt stylesheet.
    const sup = created.message.getMessage(STYLE_SUPER);
    if (sup) {
      sup.remove(STYLE_NAME);
      sup.remove(STYLE_IDENTIFIER);
    }
    new TableStyleHandle(this.store, created).setCell(formatting);

    const m = list.message;
    const key = m.getUint(DataList.NEXT_LIST_ID) ?? nextFreeKey(m);
    const entry = RawMessage.create();
    entry.setVarint(ListEntry.KEY, key);
    entry.setVarint(ListEntry.REFCOUNT, 1);
    entry.setMessage(ListEntry.REFERENCE, makeRef(created.identifier));
    m.addMessage(DataList.ENTRIES, entry);
    m.setVarint(DataList.NEXT_LIST_ID, key + 1);
    this.refreshDataListReferences(list);
    return key;
  }

  /** Object id behind a style-table key. */
  private styleTableEntry(key: number): bigint | undefined {
    const list = this.store.resolve(refId(this.dataStore(), DataStoreFields.STYLE_TABLE));
    for (const e of list?.message.getMessages(DataList.ENTRIES) ?? []) {
      if (e.getUint(ListEntry.KEY) === key) return refId(e, ListEntry.REFERENCE);
    }
    return undefined;
  }

  /**
   * Refresh a data list's `object_references`.
   *
   * The store's save pass only rewrites references for types it has an
   * extractor for; TableDataList holds references inline in its entries, so
   * we collect them here rather than teaching the generic path about a
   * structure only tables use.
   */
  private refreshDataListReferences(list: IwaObject): void {
    const ids: bigint[] = [];
    for (const e of list.message.getMessages(DataList.ENTRIES)) {
      for (const field of [ListEntry.REFERENCE, ListEntry.RICH_TEXT_PAYLOAD]) {
        const id = refId(e, field);
        if (id !== undefined) ids.push(id);
      }
    }
    list.setObjectReferences([...new Set(ids)]);
  }

  /**
   * Refuse to write a cell a merge has swallowed.
   *
   * The value would be stored faithfully and displayed nowhere, because
   * the merge anchor's content spans the cell. Silently accepting the
   * write is the worse failure: the caller believes the edit landed.
   * `allowCovered: true` writes anyway, for callers deliberately staging
   * data under a merge they are about to remove.
   */
  private requireVisible(row: number, column: number, options: WriteOptions): void {
    if (options.allowCovered || !this.isCovered(row, column)) return;
    const merge = this.mergeAt(row, column)!;
    throw new RangeError(
      `cell ${row},${column} is covered by the merge anchored at ${merge.row},${merge.column} ` +
        `(${merge.rowCount}×${merge.columnCount}); write to the anchor, or pass ` +
        `{ allowCovered: true } to write a value the app will not display`,
    );
  }

  private requireWritable(): void {
    const generation = this.storageGeneration;
    if (generation === "preBNC") {
      throw new RangeError(
        `table ${JSON.stringify(this.name ?? "")}: pre-BNC cell storage cannot be written; ` +
          `re-saving the document in a current app converts it to v5`,
      );
    }
    if (generation === "empty") {
      throw new RangeError(
        `table ${JSON.stringify(this.name ?? "")}: no cell storage to write into`,
      );
    }
  }

  /** Set the value-carrying fields of a record for a new value. */
  private applyValue(record: CellRecord, value: CellInput): void {
    const previousType = record.type;
    record.removeAll(VALUE_FLAGS);
    switch (value.type) {
      case "empty":
        record.type = CellType.EMPTY;
        break;
      case "number":
        record.type = previousType === CellType.CURRENCY ? CellType.CURRENCY : CellType.NUMBER;
        record.setDecimal128(value.value);
        break;
      case "text":
        record.type = CellType.TEXT;
        record.setId(CellFlag.STRING_ID, this.internString(value.value));
        break;
      case "bool":
        record.type = CellType.BOOL;
        record.setDouble(CellFlag.DOUBLE, value.value ? 1 : 0);
        break;
      case "date":
        record.type = CellType.DATE;
        record.setDouble(CellFlag.SECONDS, (value.value.getTime() - APPLE_EPOCH_MS) / 1000);
        break;
      case "duration":
        record.type = CellType.DURATION;
        record.setDouble(CellFlag.DOUBLE, value.seconds);
        break;
    }
    // Formats are per-type; keeping a date format on a number is worse than
    // losing it, so drop them whenever the type actually changes.
    if (record.type !== previousType) record.removeAll(FORMAT_FLAGS);
  }

  /** Add or reuse a string-table entry, returning its key. */
  private internString(text: string): number {
    const list = this.store.resolve(refId(this.dataStore(), DataStoreFields.STRING_TABLE));
    if (!list) throw new RangeError("table has no string table; cannot store text");
    const m = list.message;
    for (const e of m.getMessages(DataList.ENTRIES)) {
      if (e.getString(ListEntry.STRING) !== text) continue;
      const key = e.getUint(ListEntry.KEY);
      if (key === undefined) continue;
      e.setVarint(ListEntry.REFCOUNT, (e.getUint(ListEntry.REFCOUNT) ?? 0) + 1);
      return key;
    }
    const key = m.getUint(DataList.NEXT_LIST_ID) ?? nextFreeKey(m);
    const entry = RawMessage.create();
    entry.setVarint(ListEntry.KEY, key);
    entry.setVarint(ListEntry.REFCOUNT, 1);
    entry.setString(ListEntry.STRING, text);
    m.addMessage(DataList.ENTRIES, entry);
    m.setVarint(DataList.NEXT_LIST_ID, key + 1);
    return key;
  }

  /** Drop one reference to a string-table entry, removing it at zero. */
  private releaseString(key: number): void {
    const list = this.store.resolve(refId(this.dataStore(), DataStoreFields.STRING_TABLE));
    if (!list) return;
    const m = list.message;
    const entries = m.getMessages(DataList.ENTRIES);
    const entry = entries.find((e) => e.getUint(ListEntry.KEY) === key);
    if (!entry) return;
    const remaining = (entry.getUint(ListEntry.REFCOUNT) ?? 1) - 1;
    if (remaining > 0) {
      entry.setVarint(ListEntry.REFCOUNT, remaining);
      return;
    }
    m.setMessages(
      DataList.ENTRIES,
      entries.filter((e) => e !== entry),
    );
  }

  /** Find the tile row info holding a table row. */
  private locateRow(row: number): { tile: IwaObject; rowInfo: RawMessage } | undefined {
    const tiles = this.dataStore()?.getMessage(DataStoreFields.TILES);
    if (!tiles) return undefined;
    const tileSize = tiles.getUint(TileStorageFields.TILE_SIZE) ?? 256;
    for (const t of tiles.getMessages(TileStorageFields.TILES)) {
      const tileId = t.getUint(TileEntry.TILEID) ?? 0;
      const tile = this.store.resolve(refId(t, TileEntry.TILE));
      if (!tile) continue;
      for (const rowInfo of tile.message.getMessages(TileFields.ROW_INFOS)) {
        const inTile = rowInfo.getUint(TileRowInfo.TILE_ROW_INDEX) ?? 0;
        if (tileId * tileSize + inTile === row) return { tile, rowInfo };
      }
    }
    return undefined;
  }

  /** Re-serialize a row's cell buffer, offsets and legacy stubs. */
  private writeRowLayout(rowInfo: RawMessage, layout: RowLayout): void {
    const buffer = new ByteWriter(256);
    const offsets = new Int16Array(layout.offsetSlots).fill(-1);
    let cellCount = 0;
    // Records are 4-byte multiples by construction (12-byte header plus
    // 4/8/16-byte fields), which is what makes >> 2 wide offsets lossless.
    const wide = layout.records.reduce((n, r) => n + (r?.length ?? 0), 0) > 0x7fff;
    for (let column = 0; column < layout.records.length; column++) {
      const record = layout.records[column];
      if (!record) continue;
      if (column >= offsets.length) {
        throw new RangeError(`column ${column} exceeds the row's ${offsets.length} offset slots`);
      }
      const position = buffer.length;
      offsets[column] = wide ? position >> 2 : position;
      buffer.bytes(record);
      cellCount++;
    }
    rowInfo.setBytes(TileRowInfo.CELL_STORAGE_BUFFER, buffer.toBytes());
    rowInfo.setBytes(TileRowInfo.CELL_OFFSETS, new Uint8Array(offsets.buffer.slice(0)));
    if (wide) rowInfo.setBool(TileRowInfo.HAS_WIDE_OFFSETS, true);
    else rowInfo.remove(TileRowInfo.HAS_WIDE_OFFSETS);
    rowInfo.setVarint(TileRowInfo.CELL_COUNT, cellCount);
    rowInfo.setVarint(TileRowInfo.STORAGE_VERSION, 5);
    this.writeLegacyStubs(rowInfo, layout, offsets.length);
  }

  /**
   * Rewrite the pre-BNC fields, which proto2 marks `required`.
   *
   * Apple's own current writers keep them present but inert: a 12-byte
   * all-zero record per cell (version byte 4) plus a matching offsets
   * array. We reproduce that shape exactly rather than leaving stale
   * offsets pointing into a buffer that no longer matches.
   */
  private writeLegacyStubs(rowInfo: RawMessage, layout: RowLayout, slots: number): void {
    const STUB_SIZE = 12;
    const offsets = new Int16Array(slots).fill(-1);
    let count = 0;
    for (let column = 0; column < layout.records.length; column++) {
      if (!layout.records[column]) continue;
      offsets[column] = count * STUB_SIZE;
      count++;
    }
    const buffer = new Uint8Array(count * STUB_SIZE);
    for (let i = 0; i < count; i++) buffer[i * STUB_SIZE] = 4;
    rowInfo.setBytes(TileRowInfo.CELL_STORAGE_BUFFER_PRE_BNC, buffer);
    rowInfo.setBytes(TileRowInfo.CELL_OFFSETS_PRE_BNC, new Uint8Array(offsets.buffer.slice(0)));
  }

  /** Keep the row header's cell count in step with the row's storage. */
  private refreshRowHeader(row: number, cellCount: number): void {
    const storage = this.dataStore()?.getMessage(DataStoreFields.ROW_HEADERS);
    for (const ref of storage?.getMessages(HeaderStorage.BUCKETS) ?? []) {
      const bucket = this.store.resolve(ref.getVarint(1));
      for (const header of bucket?.message.getMessages(HeaderBucket.HEADERS) ?? []) {
        if (header.getUint(HeaderFields.INDEX) !== row) continue;
        header.setVarint(HeaderFields.NUMBER_OF_CELLS, cellCount);
        return;
      }
    }
  }

  /**
   * Recompute each tile's cell/row totals.
   *
   * Apple leaves `maxColumn`/`maxRow`/`numCells` at 0 in files we have
   * examined, so we only maintain them when they were already non-zero —
   * writing real values into fields the app zeroes would be a gratuitous
   * difference from what Numbers itself produces.
   */
  private refreshTileTotals(): void {
    const tiles = this.dataStore()?.getMessage(DataStoreFields.TILES);
    for (const t of tiles?.getMessages(TileStorageFields.TILES) ?? []) {
      const tile = this.store.resolve(refId(t, TileEntry.TILE));
      if (!tile) continue;
      const rowInfos = tile.message.getMessages(TileFields.ROW_INFOS);
      if ((tile.message.getUint(TileFields.NUM_CELLS) ?? 0) > 0) {
        const total = rowInfos.reduce((n, ri) => n + (ri.getUint(TileRowInfo.CELL_COUNT) ?? 0), 0);
        tile.message.setVarint(TileFields.NUM_CELLS, total);
      }
      if ((tile.message.getUint(TileFields.NUM_ROWS) ?? 0) > 0) {
        tile.message.setVarint(TileFields.NUM_ROWS, rowInfos.length);
      }
    }
  }
}

/** A row's records by column, plus how many offset slots the row provides. */
interface RowLayout {
  records: (Uint8Array | undefined)[];
  offsetSlots: number;
}

/**
 * Split a row's storage buffer back into per-column records.
 *
 * The offsets array is preserved at its original length: Apple writes a
 * fixed 255-entry array regardless of the table's width, and shrinking it
 * would be a difference from Numbers' own output for no benefit.
 */
function readRowLayout(rowInfo: RawMessage, columnCount: number): RowLayout {
  const buffer = rowInfo.getBytes(TileRowInfo.CELL_STORAGE_BUFFER) ?? new Uint8Array(0);
  const rawOffsets = rowInfo.getBytes(TileRowInfo.CELL_OFFSETS) ?? new Uint8Array(0);
  const scale = rowInfo.getBool(TileRowInfo.HAS_WIDE_OFFSETS) ? 4 : 1;
  const offsets: number[] = [];
  for (let i = 0; i + 1 < rawOffsets.length; i += 2) {
    const v = rawOffsets[i]! | (rawOffsets[i + 1]! << 8);
    offsets.push(v >= 0x8000 ? v - 0x10000 : v);
  }
  const slots = Math.max(offsets.length, columnCount, DEFAULT_OFFSET_SLOTS);
  const records = new Array<Uint8Array | undefined>(Math.max(offsets.length, columnCount));
  for (let column = 0; column < offsets.length; column++) {
    const start = offsets[column]!;
    if (start < 0) continue;
    let end = buffer.length;
    for (let next = column + 1; next < offsets.length; next++) {
      if (offsets[next]! >= 0) {
        end = offsets[next]! * scale;
        break;
      }
    }
    records[column] = buffer.slice(start * scale, end);
  }
  return { records, offsetSlots: slots };
}

/** Apple writes 255 offset slots per row regardless of table width. */
const DEFAULT_OFFSET_SLOTS = 255;

function clampBand(value: number, limit: number): number {
  return Math.max(0, Math.min(Math.floor(value), limit));
}

/** Fallback when a data list has no `nextListID`: one past the highest key. */
function nextFreeKey(list: RawMessage): number {
  let max = 0;
  for (const e of list.getMessages(DataList.ENTRIES)) {
    max = Math.max(max, e.getUint(ListEntry.KEY) ?? 0);
  }
  return max + 1;
}

export function cellValueToString(v: CellValue): string {
  switch (v.type) {
    case "empty":
      return "";
    case "number":
      return String(v.value);
    case "text":
    case "richText":
      return v.value;
    case "date":
      return v.value.toISOString();
    case "bool":
      return v.value ? "TRUE" : "FALSE";
    case "duration":
      return `${v.seconds}s`;
    case "error":
      return "#ERROR";
  }
}

/** Enumerate the tables of a document, optionally scoped to a sheet's drawables. */
export function tablesOf(store: ObjectStore, drawableIds?: readonly bigint[]): TableModel[] {
  const out: TableModel[] = [];
  const fromInfo = (info: IwaObject): void => {
    const model = store.resolve(refId(info.message, TableInfo.TABLE_MODEL));
    if (model?.type === TST_TYPE.TABLE_MODEL) out.push(new TableModel(store, model, info));
  };
  if (drawableIds) {
    for (const id of drawableIds) {
      const obj = store.object(id);
      if (obj?.type === TST_TYPE.TABLE_INFO) fromInfo(obj);
    }
  } else {
    for (const { obj } of store.allObjects()) {
      if (obj.type === TST_TYPE.TABLE_INFO) fromInfo(obj);
    }
  }
  return out;
}

// ------------------------------------------------------------ record decoder

/** Optional-field sizes by flag bit, in ascending bit order (spec §2.3). */
const FLAG_SIZES: readonly (readonly [flag: number, size: number])[] = [
  [0x1, 16], // decimal128 value
  [0x2, 8], // double
  [0x4, 8], // datetime seconds
  [0x8, 4], // string_id
  [0x10, 4], // rich_id
  [0x20, 4], // cell_style_id
  [0x40, 4], // text_style_id
  [0x80, 4], // conditional-style id
  [0x100, 4], // conditional-rule-style id
  [0x200, 4], // formula_id
  [0x400, 4], // control_id
  [0x800, 4], // formula-error id
  [0x1000, 4], // suggest_id
  [0x2000, 4], // num_format_id
  [0x4000, 4], // currency_format_id
  [0x8000, 4], // date_format_id
  [0x10000, 4], // duration_format_id
  [0x20000, 4], // text_format_id
  [0x40000, 4], // bool_format_id
  [0x80000, 4], // comment id
  [0x100000, 4], // import-warning id
];

export function decodeCellRecord(
  record: Uint8Array,
  strings: ReadonlyMap<number, string>,
  richText: ReadonlyMap<number, string>,
): CellValue {
  if (record.length < 12) return { type: "empty" };
  if (record[0] !== 5) {
    throw new RangeError(`cell storage version ${record[0]} not supported (expected 5)`);
  }
  const cellType = record[1]!;
  const view = new DataView(record.buffer, record.byteOffset, record.byteLength);
  const flags = view.getUint32(8, true);

  let pos = 12;
  let d128: number | undefined;
  let double: number | undefined;
  let seconds: number | undefined;
  let stringId: number | undefined;
  let richId: number | undefined;
  let isFormula = false;
  for (const [flag, size] of FLAG_SIZES) {
    if ((flags & flag) === 0) continue;
    if (pos + size > record.length) break; // tolerate truncated trailing ids
    switch (flag) {
      case 0x1:
        d128 = decodeDecimal128(record.subarray(pos, pos + 16));
        break;
      case 0x2:
        double = view.getFloat64(pos, true);
        break;
      case 0x4:
        seconds = view.getFloat64(pos, true);
        break;
      case 0x8:
        stringId = view.getUint32(pos, true);
        break;
      case 0x10:
        richId = view.getUint32(pos, true);
        break;
      case 0x200:
        isFormula = true;
        break;
      default:
        break; // ids we don't resolve yet (styles, formats, comments)
    }
    pos += size;
  }

  switch (cellType) {
    case 0:
      return { type: "empty" };
    case 2:
    case 10:
      return { type: "number", value: d128 ?? double ?? 0, isFormula };
    case 3:
      return { type: "text", value: strings.get(stringId ?? -1) ?? "", isFormula };
    case 5:
      return { type: "date", value: new Date(APPLE_EPOCH_MS + (seconds ?? 0) * 1000), isFormula };
    case 6:
      return { type: "bool", value: (double ?? 0) > 0, isFormula };
    case 7:
      return { type: "duration", seconds: double ?? 0, isFormula };
    case 8:
      return { type: "error", isFormula: true };
    case 9:
      return { type: "richText", value: richText.get(richId ?? -1) ?? "", isFormula };
    default:
      throw new RangeError(`unrecognized cell type ${cellType} in v5 storage`);
  }
}

/** IEEE 754-2008 decimal128 (binary integer significand), bias 0x1820. */
export function decodeDecimal128(b: Uint8Array): number {
  const exp = (((b[15]! & 0x7f) << 7) | (b[14]! >> 1)) - DECIMAL128_BIAS;
  let mantissa = BigInt(b[14]! & 1);
  for (let i = 13; i >= 0; i--) mantissa = mantissa * 256n + BigInt(b[i]!);
  const sign = (b[15]! & 0x80) !== 0 ? -1 : 1;
  return sign * Number(mantissa) * Math.pow(10, exp);
}
