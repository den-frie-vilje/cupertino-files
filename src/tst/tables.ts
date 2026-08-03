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
import { protoFields } from "../proto/fields.ts";
import type { IwaObject } from "../tsp/iwa.ts";
import type { ObjectStore } from "../tsp/store.ts";
import { makeRef, refId } from "../tsp/schema.ts";
import { Storage } from "../tswp/schema.ts";
import { RawMessage } from "../base/protobuf.ts";
import { APPLE_EPOCH_MS, ByteWriter, bytesEqual } from "../base/bytes.ts";
import {
  CellFlag,
  CellRecord,
  CellType,
  decodeDecimal128,
  FORMAT_FLAGS,
  VALUE_FLAGS,
} from "./cellrecord.ts";
import type { CellFormatting } from "./styles.ts";
import { TableStyleHandle, TST_STYLE_TYPE } from "./styles.ts";
import { StyleHandle } from "../tss/stylesheet.ts";
import { StyleSuper } from "../tss/schema.ts";
import {
  AstNodeFields,
  AstNodeType,
  renderFormula,
  type RenderedFormula,
} from "./formulas.ts";
import {
  buildConditionalStyleSet,
  ConditionalStyleSet,
  type ConditionalCondition,
  type ConditionalRule,
} from "./conditional.ts";
import { FilterSet, type FilterRule } from "./filters.ts";
import {
  categoriesOf,
  type CategoryGroup,
  type GroupValue,
  type TableCategories,
} from "./categories.ts";
import { randomUid, uidMapOf, uidMapTarget, writeUidMap, type ColumnRowUidMap } from "./uidmap.ts";
import {
  CELL_RECORD_TILE,
  CellRecordExpandedFields,
  CellRecordTileFields,
  FORMULA_OWNER_DEPENDENCIES,
  FormulaOwnerFields,
  FormulaOwnerRegistry,
  OwnerKind,
  readCfUid,
  readOwnerUid,
  TiledDependenciesFields,
} from "../tsce/owners.ts";
import {
  controlsOf,
  buildPopupMenuModel,
  CellSpecFields,
  CONTROL_CELL_SPEC_TABLE,
  InteractionType,
  type CellControl,
  type PopupItem,
} from "./controls.ts";
import { decodePreBncRecord, splitPreBncRow, type PreBncRecord } from "./prebnc.ts";
import { buildFormula, parseFormula, type FormulaExpression } from "./formula-builder.ts";

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
export const TableModelFields = protoFields("TST.TableModelArchive", {
  BASE_DATA_STORE: "base_data_store",
  NUMBER_OF_ROWS: "number_of_rows",
  NUMBER_OF_COLUMNS: "number_of_columns",
  TABLE_NAME: "table_name",
  HEADER_ROWS: "number_of_header_rows",
  HEADER_COLUMNS: "number_of_header_columns",
  FOOTER_ROWS: "number_of_footer_rows",
  TABLE_STYLE: "table_style",
  HEADER_ROWS_FROZEN: "header_rows_frozen",
  HEADER_COLUMNS_FROZEN: "header_columns_frozen",
  DEFAULT_ROW_HEIGHT: "default_row_height",
  DEFAULT_COLUMN_WIDTH: "default_column_width",
  REPEATING_HEADER_ROWS: "repeating_header_rows_enabled",
  TABLE_NAME_STYLE: "table_name_style",
  REPEATING_HEADER_COLUMNS: "repeating_header_columns_enabled",
  MERGE_OWNER: "merge_owner",
  HIDDEN_STATES_OWNER: "hidden_states_owner",
});

/** TST.HiddenStatesOwnerArchive / .HiddenStatesArchive / .HiddenStateExtentArchive. */
const HiddenStatesOwner = { HIDDEN_STATES: 2 } as const;
const HiddenStates = { COLUMN_EXTENT: 2, ROW_EXTENT: 3 } as const;
const HiddenStateExtent = { FILTER_SET: 8 } as const;
/** TST.DataStore. */
export const DataStoreFields = protoFields("TST.DataStore", {
  ROW_HEADERS: "rowHeaders",
  COLUMN_HEADERS: "columnHeaders",
  TILES: "tiles",
  STRING_TABLE: "stringTable",
  ROW_TILE_TREE: "rowTileTree",
  STYLE_TABLE: "styleTable",
  FORMULA_TABLE: "formula_table",
  MERGE_REGION_MAP: "merge_region_map",
  RICH_TEXT_TABLE: "rich_text_table",
  CONDITIONAL_STYLE_TABLE: "conditionalstyletable",
  FORMAT_TABLE: "format_table",
});
/** TST.TileStorage / .Tile / .TileRowInfo. */
export const TileStorageFields = protoFields("TST.TileStorage", { TILES: "tiles", TILE_SIZE: "tile_size" });
export const TileEntry = protoFields("TST.TileStorage", { TILEID: "tiles", TILE: "tile_size" });
export const TileFields = protoFields("TST.Tile", {
  MAX_COLUMN: "maxColumn",
  MAX_ROW: "maxRow",
  NUM_CELLS: "numCells",
  NUM_ROWS: "numrows",
  ROW_INFOS: "rowInfos",
  STORAGE_VERSION: "storage_version",
  LAST_SAVED_IN_BNC: "last_saved_in_BNC",
});
export const TileRowInfo = protoFields("TST.TileRowInfo", {
  TILE_ROW_INDEX: "tile_row_index",
  CELL_COUNT: "cell_count",
  CELL_STORAGE_BUFFER_PRE_BNC: "cell_storage_buffer_pre_bnc",
  CELL_OFFSETS_PRE_BNC: "cell_offsets_pre_bnc",
  STORAGE_VERSION: "storage_version",
  CELL_STORAGE_BUFFER: "cell_storage_buffer",
  CELL_OFFSETS: "cell_offsets",
  HAS_WIDE_OFFSETS: "has_wide_offsets",
});
/**
 * `TST.CellStyleArchive.super`, and the `TSS.StyleArchive` fields inside it.
 *
 * The field numbers come from {@link StyleSuper} rather than being restated
 * here: a local copy had `style_identifier` as 4, which is `is_variation`.
 * The clone path was stripping the wrong field and leaving the parent's
 * identifier in place — two styles answering to one identifier, which is
 * exactly what the code was trying to avoid.
 */
const STYLE_SUPER = 1;

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

/**
 * The matching text-style reference for each band.
 *
 * `TSWP.ParagraphStyleArchive`, despite what an earlier comment here said —
 * checked across three fixtures. Worth being precise about, because a
 * conditional rule's required `text_style` points at one of these.
 */
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
/** TST.TableDataList archive type, for the rare case of creating one. */
const TABLE_DATA_LIST_TYPE = 6005;
/**
 * `list_type` and entry payload field of the control-spec table.
 *
 * Neither is a guess. Apple writes the control list into 44 of the corpus's
 * 50 tables — empty, because none of those documents uses a widget — and
 * every one of them declares `list_type = 12`. The payload field is 12 too,
 * read off documents that do carry controls. So a table that needs a
 * control list almost always already has one.
 */
const CONTROL_LIST_TYPE = 12;
/** `list_type` of the conditional-style table, and the set's archive type. */
const CONDITIONAL_LIST_TYPE = 9;
const CONDITIONAL_STYLE_SET_TYPE = 6010;
/** TST.PopUpMenuModel — the list of choices behind a pop-up menu. */
const POPUP_MENU_MODEL_TYPE = 6206;
const CONTROL_LIST_ENTRY_SPEC = 12;
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
/**
 * The function node that wraps a merge's rectangle.
 *
 * Every merge in every document is `SUM` (index 168) over one argument.
 * Nothing evaluates it — the value is never shown — but the engine stores
 * a merge as a formula, and a formula needs a call. Omitting this node
 * produces a file our own reader accepts and Apple's engine would find
 * malformed.
 */
function mergeFunctionNode(): RawMessage {
  const node = RawMessage.create();
  node.setVarint(AstNodeFields.TYPE, AstNodeType.FUNCTION);
  node.setVarint(AstNodeFields.FUNCTION_INDEX, MERGE_FUNCTION_INDEX);
  node.setVarint(AstNodeFields.FUNCTION_NUM_ARGS, 1);
  return node;
}

/** `SUM` — the call a merge's range sits inside. */
const MERGE_FUNCTION_INDEX = 168;

/** A tract range as the calc engine writes it; `end` omitted when equal. */
function absoluteRangeMessage(begin: number, end: number): RawMessage {
  const range = RawMessage.create();
  range.setVarint(TractRange.BEGIN, begin);
  // Apple omits the end for a single row or column, and the reader treats
  // an absent end as "same as begin". Writing it anyway would be readable
  // but would not match what the app produces.
  if (end !== begin) range.setVarint(TractRange.END, end);
  return range;
}

/** The rectangle a merge-store pair describes, if it describes one. */
function mergeRangeOfPair(pair: RawMessage): MergeRange | undefined {
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
    return {
      row: rows.begin,
      column: columns.begin,
      rowCount: rows.end - rows.begin + 1,
      columnCount: columns.end - columns.begin + 1,
    };
  }
  return undefined;
}

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
/**
 * A value to write into a cell.
 *
 * The tagged forms are exact — `{ type: "duration", seconds }` is the only
 * way to say "45 minutes" rather than "the number 2700". Everything else
 * has an obvious plain form, so a bare `string`, `number`, `boolean`,
 * `Date` or `null` is accepted and normalised by {@link normalizeCellInput}.
 *
 * Bare values were not accepted originally, and passing one *silently
 * cleared the cell*: the tag was `undefined`, no case matched, and the
 * record came out empty. Erasing data because a caller wrote the natural
 * thing is not a tolerable failure mode, so plain values are now first
 * class and anything genuinely unrecognised throws.
 */
export type CellInput = TaggedCellInput | string | number | boolean | Date | null;

export type TaggedCellInput =
  | { type: "empty" }
  | { type: "number"; value: number }
  | { type: "text"; value: string }
  | { type: "bool"; value: boolean }
  | { type: "date"; value: Date }
  | { type: "duration"; seconds: number };

/**
 * Put a {@link CellInput} in tagged form, or throw.
 *
 * `null` and `undefined` mean "empty" — clearing a cell by writing nothing
 * is the natural reading, and it is what `clearCell` does anyway. `NaN` is
 * refused: it is almost always a failed parse upstream, and storing it
 * produces a cell the apps render as an error with no clue why.
 */
export function normalizeCellInput(value: CellInput | undefined): TaggedCellInput {
  if (value === null || value === undefined) return { type: "empty" };
  switch (typeof value) {
    case "string":
      return { type: "text", value };
    case "boolean":
      return { type: "bool", value };
    case "number":
      if (!Number.isFinite(value)) {
        throw new RangeError(
          `cannot write ${value} to a cell; use a finite number, or clear the cell instead`,
        );
      }
      return { type: "number", value };
    case "object":
      break;
    default:
      throw new RangeError(`cannot write a ${typeof value} to a cell`);
  }
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) throw new RangeError("cannot write an invalid Date to a cell");
    return { type: "date", value };
  }
  const tag = (value as { type?: unknown }).type;
  if (
    tag === "empty" ||
    tag === "number" ||
    tag === "text" ||
    tag === "bool" ||
    tag === "date" ||
    tag === "duration"
  ) {
    return value;
  }
  // The case that used to erase the cell.
  throw new RangeError(
    `unrecognised cell value ${JSON.stringify(tag)}; pass a string, number, boolean, Date, ` +
      `null, or a tagged value such as { type: "duration", seconds: 60 }`,
  );
}

export interface WriteOptions {
  /**
   * Write into a cell a merge has swallowed. Off by default, because such
   * a value is stored but never displayed.
   */
  allowCovered?: boolean;
}


export interface MergeRange {
  row: number;
  column: number;
  rowCount: number;
  columnCount: number;
}

/**
 * A pre-BNC record as a {@link CellValue}, or `undefined` when the record's
 * shape has not been measured.
 *
 * `undefined` is not "empty": the caller omits the cell and counts it, so a
 * partial read stays visible. `isFormula` is always false — pre-BNC
 * formulas are not decoded, and claiming otherwise would be a guess.
 */
function preBncCellValue(
  record: PreBncRecord | undefined,
  strings: Map<number, string>,
): CellValue | undefined {
  if (!record) return undefined;
  if (record.stringId !== undefined) {
    const text = strings.get(record.stringId);
    return text === undefined ? undefined : { type: "text", value: text, isFormula: false };
  }
  if (record.number !== undefined) {
    return { type: "number", value: record.number, isFormula: false };
  }
  if (record.seconds !== undefined) {
    return { type: "date", value: new Date(APPLE_EPOCH_MS + record.seconds * 1000), isFormula: false };
  }
  return undefined;
}

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
   * @agentTool set_cell_format
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

  /**
   * Apply one format across a rectangular block.
   *
   * @agentTool set_cell_format
   */
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

  /**
   * The raw `TSCE.FormulaArchive` behind a cell, if it has one.
   *
   * The unrendered truth — what {@link cellFormulaDetail} renders, and the
   * yardstick formula *writing* is measured against: a rebuilt formula is
   * proven by comparing bytes with what Apple stored here.
   */
  formulaArchiveAt(row: number, column: number): RawMessage | undefined {
    const id = this.formulaId(row, column);
    return id === undefined ? undefined : this.formulaTable().get(id);
  }

  /** `formula_id` of a cell, if its record carries one. */
  formulaId(row: number, column: number): number | undefined {
    const located = this.locateRow(row);
    if (!located) return undefined;
    const raw = readRowLayout(located.rowInfo, this.columnCount).records[column];
    return raw ? CellRecord.decode(raw).id(CellFlag.FORMULA_ID) : undefined;
  }

  /**
   * Every formula cell in the table, with its rendered text.
   *
   * @agentTool list_formulas
   */
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

  /**
   * True when {@link cells} decodes **every** cell in this table.
   *
   * Always true for v5 storage. For pre-BNC it means every record matched a
   * measured shape — the interesting case is `false`, which says the list
   * `cells()` returns is short and {@link undecodedPreBncCells} says by how
   * much.
   */
  get hasReadableCells(): boolean {
    return this.storageGeneration !== "preBNC" || this.undecodedPreBncCells() === 0;
  }

  /**
   * All non-empty cells in reading order.
   *
   * Reads pre-BNC (storage version 4) tables too, for the record shapes
   * that have been measured — see {@link ./prebnc.ts}. A cell whose shape
   * is unmeasured is **omitted**, and {@link undecodedPreBncCells} counts
   * them, so "this table read clean" and "this table half-read" stay
   * distinguishable.
   */
  cells(): CellInfo[] {
    const out: CellInfo[] = [];
    const ds = this.dataStore();
    if (!ds) return out;
    if (this.storageGeneration === "preBNC") return this.preBncCells(ds);
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

  /**
   * Cells of a pre-BNC table.
   *
   * Kept separate from the v5 path rather than folded into it: the two
   * share a header shape and nothing else, and interleaving them would
   * make both harder to read for no gain.
   */
  private preBncCells(ds: RawMessage): CellInfo[] {
    const out: CellInfo[] = [];
    const strings = this.stringTable();
    const tiles = ds.getMessage(DataStoreFields.TILES);
    if (!tiles) return out;
    const tileSize = tiles.getUint(TileStorageFields.TILE_SIZE) ?? 256;

    for (const t of tiles.getMessages(TileStorageFields.TILES)) {
      const tileId = t.getUint(TileEntry.TILEID) ?? 0;
      const tile = this.store.resolve(refId(t, TileEntry.TILE));
      if (!tile) continue;
      for (const ri of tile.message.getMessages(TileFields.ROW_INFOS)) {
        const row = tileId * tileSize + (ri.getUint(TileRowInfo.TILE_ROW_INDEX) ?? 0);
        const buffer = ri.getBytes(TileRowInfo.CELL_STORAGE_BUFFER_PRE_BNC);
        const offsets = ri.getBytes(TileRowInfo.CELL_OFFSETS_PRE_BNC);
        if (!buffer || !offsets) continue;
        for (const { column, bytes } of splitPreBncRow(buffer, offsets)) {
          if (column >= this.columnCount) continue;
          const value = preBncCellValue(decodePreBncRecord(bytes), strings);
          if (value) out.push({ row, column, value });
        }
      }
    }
    out.sort((a, b) => a.row - b.row || a.column - b.column);
    return out;
  }

  /**
   * How many pre-BNC cells this table holds that {@link cells} could not
   * decode — zero for a v5 table, and zero for a pre-BNC table that read
   * cleanly.
   *
   * Exposed because a partial read is the one outcome a caller must be able
   * to detect: `cells()` returning fewer rows than the file contains is
   * otherwise indistinguishable from a sparse table.
   */
  undecodedPreBncCells(): number {
    if (this.storageGeneration !== "preBNC") return 0;
    const tiles = this.dataStore()?.getMessage(DataStoreFields.TILES);
    let undecoded = 0;
    for (const t of tiles?.getMessages(TileStorageFields.TILES) ?? []) {
      const tile = this.store.resolve(refId(t, TileEntry.TILE));
      for (const ri of tile?.message.getMessages(TileFields.ROW_INFOS) ?? []) {
        const buffer = ri.getBytes(TileRowInfo.CELL_STORAGE_BUFFER_PRE_BNC);
        const offsets = ri.getBytes(TileRowInfo.CELL_OFFSETS_PRE_BNC);
        if (!buffer || !offsets) continue;
        for (const { bytes } of splitPreBncRow(buffer, offsets)) {
          if (!decodePreBncRecord(bytes)) undecoded++;
        }
      }
    }
    return undecoded;
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

  /**
   * One cell's typed value, or `undefined` when the cell is empty.
   *
   * `undefined` also covers a pre-BNC cell whose record shape has not been
   * measured — see {@link undecodedPreBncCells}, which is how the two are
   * told apart.
   */
  cellValue(row: number, column: number): CellValue | undefined {
    for (const c of this.cells()) {
      if (c.row === row && c.column === column) return c.value;
    }
    return undefined;
  }

  /** Convenience: cell text/number as a display string ("" for empty). */
  cellText(row: number, column: number): string {
    const value = this.cellValue(row, column);
    return value === undefined ? "" : cellValueToString(value);
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
   * @agentTool set_cells
   */
  setCell(row: number, column: number, input: CellInput, options: WriteOptions = {}): void {
    // Normalise first: an unrecognised value must throw before anything is
    // touched, not after the row layout has been rebuilt.
    const value = normalizeCellInput(input);
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
    const previousFormulaId = record.id(CellFlag.FORMULA_ID);

    this.applyValue(record, value);

    // A literal supersedes whatever formula produced the old value.
    record.removeAll(CellFlag.FORMULA_ID | CellFlag.FORMULA_ERROR_ID);
    if (previousFormulaId !== undefined) this.releaseFormula(previousFormulaId);
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
   * Write a formula into a cell.
   *
   * The formula is compiled to a TSCE AST, interned in the table's formula
   * table, and the cell's record points at it — the same three steps the
   * app performs. Relative references are stored as offsets from this cell,
   * so `=A1+1` in B2 and in B3 compile to different bytes, exactly as in
   * the app.
   *
   * **Nothing here evaluates.** A cell record carries the formula *and* its
   * cached result, and the apps display the cache until the engine
   * recalculates. `value` is that cache: supply it and the cell reads
   * correctly before any app has touched the file; omit it and whatever the
   * cell held is kept, which is right when the formula reproduces the value
   * already there and wrong otherwise. There is no third option that does
   * not involve implementing Apple's calc engine.
   *
   * **The dependency tracker is not written — and does not need to be.**
   * The calc engine keeps its own per-cell ledger
   * (`TSCE.FormulaOwnerDependenciesArchive`) that this method leaves
   * alone. Numbers rebuilds it on open rather than trusting it: the e2e
   * recompute probe writes a formula with a deliberately wrong cached
   * value and the app reports the recomputed result on every
   * `npm run test:e2e`.
   *
   * Refuses a function it has no index for rather than inventing one — see
   * `authorableFunctions()` for the 272 it knows.
   * @agentTool set_formula
   */
  setFormula(
    row: number,
    column: number,
    formula: string | FormulaExpression,
    options: WriteOptions & { value?: CellInput } = {},
  ): void {
    this.requireWritable();
    if (row < 0 || row >= this.rowCount || column < 0 || column >= this.columnCount) {
      throw new RangeError(
        `cell ${row},${column} is outside the table (${this.rowCount}×${this.columnCount})`,
      );
    }
    this.requireVisible(row, column, options);

    const expression = typeof formula === "string" ? parseFormula(formula) : formula;
    const ast = buildFormula(expression, { row, column }, {
      tableUid: (name) => this.owners().tableUid(name),
    });

    // When the cell already carries this exact recipe, keep its entry
    // instead of minting a new key. This is what makes a same-text replace
    // a byte-level no-op — the strongest proof formula writing has — and it
    // also preserves entry fields this library does not model (the xlsx
    // importer's translation_flags ride alongside the AST in field 6).
    const previousId = this.formulaId(row, column);
    const previousAst =
      previousId === undefined
        ? undefined
        : this.formulaTable().get(previousId)?.getMessage(Formula.AST_NODE_ARRAY);
    const reuse = previousAst !== undefined && bytesEqual(previousAst.toBytes(), ast.toBytes());
    let key: number;
    if (reuse) {
      key = previousId!;
      this.retainFormula(key);
    } else {
      const archive = RawMessage.create();
      archive.setMessage(Formula.AST_NODE_ARRAY, ast);
      key = this.internFormula(archive);
    }
    // The cell's old reference is dropped exactly once: by the value write
    // below when there is one — setCell strips formula flags — or directly.
    // With `reuse` the retain above and this release cancel to a no-op.
    if (options.value !== undefined) {
      // The cached value first, so its flags are in place before the
      // formula id is attached; `value: undefined` leaves the old cache.
      this.setCell(row, column, options.value, options);
    } else if (previousId !== undefined) {
      this.releaseFormula(previousId);
    }

    const located = this.locateRow(row);
    if (!located) {
      throw new RangeError(
        `row ${row} has no cell storage; only rows the app has materialized can be written`,
      );
    }
    const layout = readRowLayout(located.rowInfo, this.columnCount);
    const existing = layout.records[column];
    const record = existing ? CellRecord.decode(existing) : new CellRecord();
    record.setId(CellFlag.FORMULA_ID, key);
    record.remove(CellFlag.FORMULA_ERROR_ID);
    layout.records[column] = record.encode();
    this.writeRowLayout(located.rowInfo, layout);
    this.refreshRowHeader(row, layout.records.filter((r) => r !== undefined).length);
    this.refreshTileTotals();
  }

  /**
   * Remove a cell's formula, keeping the value it last cached.
   *
   * Returns false when the cell had none. This is what "convert to value"
   * does in the app: the number stays, the recipe goes.
   */
  clearFormula(row: number, column: number): boolean {
    this.requireWritable();
    const located = this.locateRow(row);
    if (!located) return false;
    const layout = readRowLayout(located.rowInfo, this.columnCount);
    const existing = layout.records[column];
    if (!existing) return false;
    const record = CellRecord.decode(existing);
    const previousId = record.id(CellFlag.FORMULA_ID);
    if (previousId === undefined) return false;
    this.releaseFormula(previousId);
    record.removeAll(CellFlag.FORMULA_ID | CellFlag.FORMULA_ERROR_ID);
    layout.records[column] = record.encode();
    this.writeRowLayout(located.rowInfo, layout);
    this.refreshTileTotals();
    return true;
  }

  /**
   * Add a formula to the table's formula table, returning its key.
   *
   * Unlike strings, formulas are not deduplicated: two cells running the
   * same calculation from different origins compile to different ASTs, and
   * comparing encoded messages to find the rare true duplicate would cost
   * more than the entry it saves.
   */
  private internFormula(archive: RawMessage): number {
    const list = this.store.resolve(refId(this.dataStore(), DataStoreFields.FORMULA_TABLE));
    if (!list) {
      throw new RangeError("table has no formula table; cannot store a formula");
    }
    const message = list.message;
    const key = message.getUint(DataList.NEXT_LIST_ID) ?? nextFreeKey(message);
    const entry = RawMessage.create();
    entry.setVarint(ListEntry.KEY, key);
    entry.setVarint(ListEntry.REFCOUNT, 1);
    entry.setMessage(ListEntry.FORMULA, archive);
    message.addMessage(DataList.ENTRIES, entry);
    message.setVarint(DataList.NEXT_LIST_ID, key + 1);
    return key;
  }

  /**
   * Bump a formula-table entry's refcount by one more referencing cell.
   *
   * Apple's convention, measured across every fixture: the refcount equals
   * the number of cell records naming the key — 39 of 39 entries agree.
   */
  private retainFormula(key: number): void {
    const list = this.store.resolve(refId(this.dataStore(), DataStoreFields.FORMULA_TABLE));
    const entry = list?.message
      .getMessages(DataList.ENTRIES)
      .find((e) => e.getUint(ListEntry.KEY) === key);
    entry?.setVarint(ListEntry.REFCOUNT, (entry.getUint(ListEntry.REFCOUNT) ?? 0) + 1);
  }

  /** Drop one cell's reference to a formula entry, removing it at zero. */
  private releaseFormula(key: number): void {
    const list = this.store.resolve(refId(this.dataStore(), DataStoreFields.FORMULA_TABLE));
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

  /**
   * Merge a rectangle of cells, anchored at its top-left.
   *
   * A merge is not a property of the cells. It is a **formula owned by the
   * calc engine**: `TableModelArchive.merge_owner.formula_store` holds one
   * colon-tract AST node per merged rectangle, and the covered cells are
   * simply deleted — Apple leaves them with no record at all, which is why
   * `cellValue` returns `undefined` for them rather than "empty".
   *
   * Every table in every document examined already carries a `merge_owner`
   * with an owner id, merged or not, so nothing here has to mint a calc
   * engine identity. A table that somehow lacks one is refused rather than
   * guessed at: an owner the engine does not know about is worse than no
   * merge, because the document would load and then behave oddly.
   *
   * The anchor's value survives; everything the rectangle covers is
   * discarded, exactly as merging does in the app.
   * @agentTool merge_cells
   */
  mergeCells(row: number, column: number, rowCount: number, columnCount: number): void {
    this.requireWritable();
    if (rowCount < 1 || columnCount < 1) {
      throw new RangeError(`merge must span at least one cell, got ${rowCount}×${columnCount}`);
    }
    if (rowCount === 1 && columnCount === 1) {
      throw new RangeError("a 1×1 merge is not a merge; nothing to do");
    }
    const lastRow = row + rowCount - 1;
    const lastColumn = column + columnCount - 1;
    if (row < 0 || column < 0 || lastRow >= this.rowCount || lastColumn >= this.columnCount) {
      throw new RangeError(
        `merge ${row},${column} ${rowCount}×${columnCount} is outside the table ` +
          `(${this.rowCount}×${this.columnCount})`,
      );
    }
    // Overlapping merges are the one thing the format cannot express: the
    // covered cells would belong to two rectangles at once.
    for (const existing of this.merges()) {
      const overlaps =
        row <= existing.row + existing.rowCount - 1 &&
        existing.row <= lastRow &&
        column <= existing.column + existing.columnCount - 1 &&
        existing.column <= lastColumn;
      if (overlaps) {
        throw new RangeError(
          `merge ${row},${column} ${rowCount}×${columnCount} overlaps the existing merge at ` +
            `${existing.row},${existing.column} ${existing.rowCount}×${existing.columnCount}`,
        );
      }
    }

    const owner = this.object.message.getMessage(TableModelFields.MERGE_OWNER);
    if (!owner || !owner.has(MergeOwner.OWNER_ID)) {
      throw new RangeError(
        "table has no merge owner; merging would need a calc-engine identity this library " +
          "will not invent",
      );
    }
    const store = owner.getMessage(MergeOwner.FORMULA_STORE) ?? RawMessage.create();
    const index = store.getUint(FormulaStore.NEXT_INDEX) ?? 0;

    const pair = RawMessage.create();
    pair.setVarint(FormulaStore.PAIR_INDEX, index);
    const formula = RawMessage.create();
    const nodes = RawMessage.create();
    // Two nodes, in the postfix order the engine evaluates: the rectangle,
    // then the call that consumes it. A merge is stored as SUM(range) —
    // not because anything sums, but because the engine needs a formula to
    // own the range, and that is the one Apple writes.
    nodes.addMessage(AstNodeArray.NODES, this.mergeNode(row, column, lastRow, lastColumn));
    nodes.addMessage(AstNodeArray.NODES, mergeFunctionNode());
    formula.setMessage(Formula.AST_NODE_ARRAY, nodes);
    pair.setMessage(FormulaStore.PAIR_FORMULA, formula);

    store.addMessage(FormulaStore.FORMULAS, pair);
    store.setVarint(FormulaStore.NEXT_INDEX, index + 1);
    owner.setMessage(MergeOwner.FORMULA_STORE, store);
    this.object.message.setMessage(TableModelFields.MERGE_OWNER, owner);
    this.object.message.markDirty();
    this.addMergeLedgerRecord(index);

    // Everything the merge swallows loses its record entirely.
    for (let r = row; r <= lastRow; r++) {
      for (let c = column; c <= lastColumn; c++) {
        if (r === row && c === column) continue;
        this.deleteCellRecord(r, c);
      }
    }
  }

  /**
   * The calc engine's dependency ledger entry for one merge.
   *
   * The merge owner's `FormulaOwnerDependenciesArchive` lists each merge
   * as a synthetic cell — `(row 0, column = formula_index)` with an empty
   * edges message; both merge-bearing corpus documents agree byte for
   * byte, 8 records of 8. Idempotent, because recreating a merge at an
   * index the ledger still remembers must not duplicate the record. A
   * document with no kind-5 dependencies archive (the pre-4008 era) is
   * left alone: its merges live in the region map and the engine has no
   * ledger to keep consistent.
   */
  private addMergeLedgerRecord(index: number): void {
    const owner = this.mergeDependenciesOwner();
    if (!owner) return;
    const tiled =
      owner.message.getMessage(FormulaOwnerFields.TILED_CELL_DEPENDENCIES) ?? RawMessage.create();
    // 32-column tiles, created when first occupied.
    const tileBegin = index - (index % 32);
    let tile: IwaObject | undefined;
    for (const ref of tiled.getMessages(TiledDependenciesFields.TILES)) {
      const candidate = this.store.resolve(ref);
      if (candidate?.message.getUint(CellRecordTileFields.TILE_COLUMN_BEGIN) === tileBegin) {
        tile = candidate;
        break;
      }
    }
    if (!tile) {
      const component = this.store.componentOf(owner.identifier);
      if (!component) return;
      tile = this.store.createObject(CELL_RECORD_TILE, component);
      tile.message.setVarint(
        CellRecordTileFields.INTERNAL_OWNER_ID,
        owner.message.getUint(FormulaOwnerFields.INTERNAL_FORMULA_OWNER_ID) ?? 0,
      );
      tile.message.setVarint(CellRecordTileFields.TILE_COLUMN_BEGIN, tileBegin);
      tile.message.setVarint(CellRecordTileFields.TILE_ROW_BEGIN, 0);
      tiled.addMessage(TiledDependenciesFields.TILES, makeRef(tile.identifier));
      owner.message.setMessage(FormulaOwnerFields.TILED_CELL_DEPENDENCIES, tiled);
      owner.message.markDirty();
      // The owner is an Apple-authored object with no reference extractor,
      // so its bookkeeping does not recompute on save; declare the one
      // reference this write added, or the tile dangles and the shape
      // audit (rightly) flags an object nothing points at.
      this.store.declareReference(owner, tile.identifier);
    }
    const records = tile.message.getMessages(CellRecordTileFields.CELL_RECORDS);
    if (records.some((r) => r.getUint(CellRecordExpandedFields.COLUMN) === index)) return;
    const record = RawMessage.create();
    record.setVarint(CellRecordExpandedFields.COLUMN, index);
    record.setVarint(CellRecordExpandedFields.ROW, 0);
    record.setMessage(CellRecordExpandedFields.EXPANDED_EDGES, RawMessage.create());
    tile.message.addMessage(CellRecordTileFields.CELL_RECORDS, record);
    tile.message.markDirty();
  }

  /** Drop a merge's ledger record; the tile stays, like the high-water index. */
  private removeMergeLedgerRecord(index: number): void {
    const owner = this.mergeDependenciesOwner();
    const tiled = owner?.message.getMessage(FormulaOwnerFields.TILED_CELL_DEPENDENCIES);
    for (const ref of tiled?.getMessages(TiledDependenciesFields.TILES) ?? []) {
      const tile = this.store.resolve(ref);
      if (!tile) continue;
      const records = tile.message.getMessages(CellRecordTileFields.CELL_RECORDS);
      const kept = records.filter(
        (r) => r.getUint(CellRecordExpandedFields.COLUMN) !== index,
      );
      if (kept.length !== records.length) {
        tile.message.setMessages(CellRecordTileFields.CELL_RECORDS, kept);
        tile.message.markDirty();
        return;
      }
    }
  }

  /** The kind-5 dependencies archive matching this table's merge owner id. */
  private mergeDependenciesOwner(): IwaObject | undefined {
    const uid = readCfUid(
      this.object.message
        .getMessage(TableModelFields.MERGE_OWNER)
        ?.getMessage(MergeOwner.OWNER_ID),
    );
    if (!uid) return undefined;
    for (const { obj } of this.store.allObjects()) {
      if (obj.type !== FORMULA_OWNER_DEPENDENCIES) continue;
      const candidate = readOwnerUid(
        obj.message.getMessage(FormulaOwnerFields.FORMULA_OWNER_UID),
      );
      if (candidate && candidate.lo === uid.lo && candidate.hi === uid.hi) return obj;
    }
    return undefined;
  }

  /**
   * Remove the merge anchored at a cell, returning false if there is none.
   *
   * The cells it covered come back empty, which is what the app does: the
   * values they held before merging were discarded at merge time and are
   * not recoverable from the file.
   * @agentTool merge_cells
   */
  unmergeCells(row: number, column: number): boolean {
    this.requireWritable();
    const owner = this.object.message.getMessage(TableModelFields.MERGE_OWNER);
    const store = owner?.getMessage(MergeOwner.FORMULA_STORE);
    if (!owner || !store) return false;

    const pairs = store.getMessages(FormulaStore.FORMULAS);
    const removed = pairs.filter((pair) => {
      const range = mergeRangeOfPair(pair);
      return range !== undefined && range.row === row && range.column === column;
    });
    if (removed.length === 0) return false;
    const kept = pairs.filter((pair) => !removed.includes(pair));

    // next_index is a high-water mark, not a count: leaving it alone keeps
    // ids unique against anything the engine still remembers.
    store.setMessages(FormulaStore.FORMULAS, kept);
    owner.setMessage(MergeOwner.FORMULA_STORE, store);
    this.object.message.setMessage(TableModelFields.MERGE_OWNER, owner);
    this.object.message.markDirty();
    // The ledger record goes with its pair; the tile stays, like the index.
    for (const pair of removed) {
      const index = pair.getUint(FormulaStore.PAIR_INDEX);
      if (index !== undefined) this.removeMergeLedgerRecord(index);
    }
    return true;
  }

  /**
   * One merged rectangle as the calc engine stores it.
   *
   * `cross_table_info` names the table's *own* formula owner — a merge
   * reaches nowhere else — and is taken from the registry rather than
   * derived arithmetically, because the `base + kind` derivation holds for
   * most files and demonstrably not all (see `src/tsce/owners.ts`). When an
   * existing merge is present its cross-table info is copied verbatim,
   * which is both cheaper and safer than reconstructing it.
   */
  private mergeNode(row: number, column: number, lastRow: number, lastColumn: number): RawMessage {
    const node = RawMessage.create();
    node.setVarint(AstNode.TYPE, AST_COLON_TRACT_NODE);

    const template = this.existingMergeNode();
    const crossTable = template?.getMessage(AstNode.CROSS_TABLE_INFO) ?? this.crossTableInfo();
    if (crossTable) node.setMessage(AstNode.CROSS_TABLE_INFO, crossTable);

    // Every merge in every document sets all four sticky bits: a merged
    // rectangle does not move when rows or columns are inserted around it.
    const sticky = template?.getMessage(AstNode.STICKY_BITS) ?? RawMessage.create();
    if (!template) for (const field of [1, 2, 3, 4]) sticky.setVarint(field, 1);
    node.setMessage(AstNode.STICKY_BITS, sticky);

    const tract = RawMessage.create();
    tract.setMessage(ColonTract.ABSOLUTE_COLUMN, absoluteRangeMessage(column, lastColumn));
    tract.setMessage(ColonTract.ABSOLUTE_ROW, absoluteRangeMessage(row, lastRow));
    tract.setVarint(ColonTract.PRESERVE_RECTANGULAR, 1);
    node.setMessage(AstNode.COLON_TRACT, tract);
    return node;
  }

  /** A merge node already in this table, to copy the invariant parts from. */
  private existingMergeNode(): RawMessage | undefined {
    const store = this.object.message
      .getMessage(TableModelFields.MERGE_OWNER)
      ?.getMessage(MergeOwner.FORMULA_STORE);
    for (const pair of store?.getMessages(FormulaStore.FORMULAS) ?? []) {
      const nodes = pair
        .getMessage(FormulaStore.PAIR_FORMULA)
        ?.getMessage(Formula.AST_NODE_ARRAY)
        ?.getMessages(AstNodeArray.NODES);
      for (const node of nodes ?? []) {
        if (node.getUint(AstNode.TYPE) === AST_COLON_TRACT_NODE) return node;
      }
    }
    return undefined;
  }

  /** `cross_table_info` naming this table's own formula owner. */
  private crossTableInfo(): RawMessage | undefined {
    // Owners name the table's *info* object, not its model — the two are
    // different archives and only the info one is registered.
    const ours = new Set(
      [this.object.identifier, this.infoObject?.identifier].filter((id) => id !== undefined),
    );
    const own = this.owners()
      .all()
      .find((o) => o.kind === OwnerKind.TABLE && o.ownerId !== undefined && ours.has(o.ownerId));
    if (!own) return undefined;
    const uid = RawMessage.create();
    uid.setVarint(2, Number(own.uid.lo & 0xffffffffn));
    uid.setVarint(3, Number(own.uid.lo >> 32n));
    uid.setVarint(4, Number(own.uid.hi & 0xffffffffn));
    uid.setVarint(5, Number(own.uid.hi >> 32n));
    const info = RawMessage.create();
    info.setMessage(1, uid);
    return info;
  }

  /** Delete a cell's record outright, as merging does to a covered cell. */
  private deleteCellRecord(row: number, column: number): void {
    const located = this.locateRow(row);
    if (!located) return;
    const layout = readRowLayout(located.rowInfo, this.columnCount);
    const existing = layout.records[column];
    if (!existing) return;
    const stringId = CellRecord.decode(existing).id(CellFlag.STRING_ID);
    if (stringId !== undefined) this.releaseString(stringId);
    layout.records[column] = undefined;
    this.writeRowLayout(located.rowInfo, layout);
    this.refreshRowHeader(row, layout.records.filter((r) => r !== undefined).length);
    this.refreshTileTotals();
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
   * @agentTool set_table_bands
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

  /**
   * Set an explicit row height; 0 restores the table default.
   *
   * @agentTool modify_table
   */
  setRowHeight(row: number, points: number): void {
    const header = this.header(DataStoreFields.ROW_HEADERS, row);
    if (!header) throw new RangeError(`row ${row} has no header entry to size`);
    header.setFloat(HeaderFields.SIZE, points);
  }

  /**
   * Set one column's width in points.
   *
   * @agentTool modify_table
   */
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
   * @agentTool modify_table
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
    this.spliceUidMap("rows", at, 0, count);
    this.shiftMergesForRows(at, count);
  }

  /**
   * Delete rows starting at `at`.
   *
   * @agentTool modify_table
   */
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
    for (const row of rows.slice(at, at + count)) this.releaseRowRefs(row);
    rows.splice(at, count);
    this.rewriteRows(rows);
    this.spliceUidMap("rows", at, count, 0);
    this.shiftMergesForRows(at, -count);
  }

  /**
   * Insert blank columns before `at`.
   *
   * @agentTool modify_table
   */
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
    this.spliceUidMap("columns", at, 0, count);
    this.shiftMergesForColumns(at, count);
  }

  /**
   * Delete columns starting at `at`.
   *
   * @agentTool modify_table
   */
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
      for (const record of row.records.slice(at, at + count)) this.releaseRecordRefs(record);
      row.records.splice(at, count);
    }
    const widths = this.columnWidths();
    widths.splice(at, count);
    this.object.message.setVarint(TableModelFields.NUMBER_OF_COLUMNS, this.columnCount - count);
    this.rewriteRows(rows);
    this.rewriteColumnHeaders(widths, rows);
    this.spliceUidMap("columns", at, count, 0);
    this.shiftMergesForColumns(at, -count);
  }

  /**
   * Keep the identity map in lockstep with a row/column splice.
   *
   * Numbers renders a table at its identity map's size, not the grid's:
   * an inserted column the map does not know is invisible in the app.
   * New positions mint fresh identities; surviving positions keep theirs,
   * which is the map's whole purpose. Tables without a map stay without.
   */
  private spliceUidMap(kind: "columns" | "rows", at: number, removed: number, added: number): void {
    const target = uidMapTarget(this.store, this.object.message);
    if (!target) return;
    const map = this.uidMap();
    const columns = map.columnUidList();
    const rows = map.rowUidList();
    const list = kind === "columns" ? columns : rows;
    list.splice(at, removed, ...Array.from({ length: added }, randomUid));
    writeUidMap(target, columns, rows);
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

  /** Drop the string- and formula-table references a deleted row held. */
  private releaseRowRefs(row: RowSnapshot): void {
    for (const record of row.records) this.releaseRecordRefs(record);
  }

  private releaseRecordRefs(record: Uint8Array | undefined): void {
    if (!record) return;
    const decoded = CellRecord.decode(record);
    const stringId = decoded.id(CellFlag.STRING_ID);
    if (stringId !== undefined) this.releaseString(stringId);
    const formulaId = decoded.id(CellFlag.FORMULA_ID);
    if (formulaId !== undefined) this.releaseFormula(formulaId);
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

  /**
   * Apply the same formatting to a rectangular block of cells — fill,
   * borders, padding, alignment, wrap — leaving every cell's value
   * untouched.
   *
   * @agentTool format_cells
   */
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

  /**
   * Attach a conditional-formatting rule set to a cell, or to a block of
   * them via `span`.
   *
   * `(row, column)` first, like every other cell method — the reader
   * {@link conditionalRules} is positional, and taking a range object here
   * made the pair read as two unrelated APIs.
   *
   * The set is interned in the table's conditional-style table and every
   * cell in the range points at it — which is how the app writes it too:
   * three sets cover 1921 cells in one corpus document, because a rule is
   * authored once and applied to a column.
   *
   * Only the four comparisons whose `predicate_type` has been *observed*
   * can be written. `>` and `>=` are predicted to be 7 and 8, and a rule
   * stored under a wrong code is one the condition editor shows as a
   * different condition while the formula says the truth — a disagreement
   * that is very hard to spot. Refused rather than guessed.
   */
  setConditionalRules(
    row: number,
    column: number,
    conditions: readonly ConditionalCondition[],
    span: { rowCount?: number; columnCount?: number } = {},
  ): number {
    this.requireWritable();
    const uid = this.crossTableInfo()?.getMessage(1);
    if (!uid) {
      throw new RangeError(
        "table has no calc-engine owner; a conditional rule names its table and this library " +
          "will not invent an identity",
      );
    }
    const resolved = conditions.map((condition) => this.resolveConditionStyles(condition));
    const key = this.internConditionalSet(buildConditionalStyleSet(resolved, uid));

    const rows = span.rowCount ?? 1;
    const columns = span.columnCount ?? 1;
    for (let r = row; r < row + rows; r++) {
      for (let c = column; c < column + columns; c++) {
        if (r >= this.rowCount || c >= this.columnCount) continue;
        this.setConditionalStyleKey(r, c, key);
      }
    }
    return key;
  }

  /**
   * Create — or reuse — the `TST.PopUpMenuModel` behind a menu.
   *
   * Two cells offering the same choices share one archive, matched on the
   * encoded bytes, which is what Apple does and what keeps a column of
   * forty menus from becoming forty identical objects.
   *
   * The model goes in **the control list's own component**, for the reason
   * a conditional rule set does: Numbers decides which components to open
   * from `ComponentInfo.external_references`, a data list's type has no
   * extractor to declare them, and a reference reaching out of the
   * component it was found in gets the document called damaged. Keeping the
   * model with the list that points at it means there is no cross-component
   * reference to declare in the first place.
   */
  private internPopupModel(items: readonly PopupItem[]): bigint {
    const encoded = buildPopupMenuModel(items).toBytes();
    const dataStore = this.dataStore();
    if (!dataStore) throw new RangeError("table has no data store; cannot store a menu");
    const list = this.store.resolve(refId(dataStore, CONTROL_CELL_SPEC_TABLE));
    const component = list
      ? this.store.componentOf(list.identifier)
      : this.store.componentOf(this.object.identifier);
    if (!component) throw new RangeError("control spec table has no component");

    for (const { obj } of this.store.allObjects()) {
      if (obj.type !== POPUP_MENU_MODEL_TYPE) continue;
      if (bytesEqual(obj.message.toBytes(), encoded)) return obj.identifier;
    }
    const object = this.store.createObject(POPUP_MENU_MODEL_TYPE, component);
    object.setMessageBytes(encoded);
    return object.identifier;
  }

  /** Add a rule set to the conditional-style table, returning its key. */
  private internConditionalSet(set: RawMessage): number {
    const dataStore = this.dataStore();
    if (!dataStore) throw new RangeError("table has no data store");
    let list = this.store.resolve(refId(dataStore, DataStoreFields.CONDITIONAL_STYLE_TABLE));
    if (!list) {
      const tableComponent = this.store.componentOf(this.object.identifier);
      if (!tableComponent) throw new RangeError("table object has no component");
      list = this.store.createObject(TABLE_DATA_LIST_TYPE, tableComponent);
      list.message.setVarint(DataList.LIST_TYPE, CONDITIONAL_LIST_TYPE);
      list.message.setVarint(DataList.NEXT_LIST_ID, 1);
      dataStore.setMessage(DataStoreFields.CONDITIONAL_STYLE_TABLE, makeRef(list.identifier));
      this.object.message.markDirty();
    }
    // **In the list's component, not the table's.** Apple gives every data
    // list a component of its own — `Index/Tables/DataList-904495-2.iwa` —
    // and the archives it points at live there with it. Creating the set
    // beside the table model instead put it in CalculationEngine.iwa, one
    // component away from the list that references it, and that reference
    // was never declared in ComponentInfo.external_references because the
    // list's type has no extractor. Numbers decides which components to
    // load from those declarations, so it found a reference into a
    // component it had no reason to open, and called the document damaged.
    //
    // Keeping the object with its list sidesteps the whole question: there
    // is no cross-component reference left to declare.
    const component = this.store.componentOf(list.identifier);
    if (!component) throw new RangeError("conditional style table has no component");
    const object = this.store.createObject(CONDITIONAL_STYLE_SET_TYPE, component);
    object.setMessageBytes(set.toBytes());

    const key = list.message.getUint(DataList.NEXT_LIST_ID) ?? nextFreeKey(list.message);
    const entry = RawMessage.create();
    entry.setVarint(ListEntry.KEY, key);
    entry.setVarint(ListEntry.REFCOUNT, 1);
    entry.setMessage(ListEntry.REFERENCE, makeRef(object.identifier));
    list.message.addMessage(DataList.ENTRIES, entry);
    list.message.setVarint(DataList.NEXT_LIST_ID, key + 1);
    return key;
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
    return (
      this.conditionalStyleSet(row, column)?.rules({ row, column }, { owners: this.owners() }) ?? []
    );
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

  /**
   * A filter set's rules with this table's owner registry supplied, so a
   * rule reaching into another table names it instead of rendering
   * `OTHER_TABLE::`.
   *
   * {@link FilterSet.rules} takes the registry as an argument rather than
   * finding it itself: a `FilterSet` is constructible from any object and
   * has no table to ask.
   */
  filterRules(set: FilterSet | undefined): FilterRule[] {
    return set?.rules({ owners: this.owners() }) ?? [];
  }

  /**
   * Data-entry controls (checkbox, slider, stepper, pop-up menu) the table
   * interns, by key. A cell's record points at one through `CONTROL_ID`.
   *
   * Empty for every corpus document — see `src/tst/controls.ts`.
   */
  controls(): Map<number, CellControl> {
    return controlsOf(this.store, this.dataStore());
  }

  /** Key into {@link controls} carried by a cell's record, if it has one. */
  controlKey(row: number, column: number): number | undefined {
    return this.recordAt(row, column)?.id(CellFlag.CONTROL_ID);
  }

  /** The control on one cell, if it has one. */
  cellControl(row: number, column: number): CellControl | undefined {
    const key = this.controlKey(row, column);
    return key === undefined ? undefined : this.controls().get(key);
  }

  /**
   * Put a data-entry widget on a cell — checkbox, star rating, slider or
   * stepper.
   *
   * The spec is interned in the table's control table exactly as strings
   * and formats are, and the cell's record points at it through
   * `CONTROL_ID`. Identical specs are shared: a column of checkboxes is one
   * archive and forty pointers, which is what the app writes.
   *
   * The **value still lives in the cell**, and the widget only changes how
   * it is edited. A checkbox therefore needs a boolean in its cell and a
   * slider a number; writing the widget without the value gives a control
   * with nothing to show, so the value is set here when one is supplied.
   *
   * A pop-up menu additionally needs a `chooser_control_popup_model` — a
   * separate archive holding the list of choices — which is created here
   * and shared between cells given the same items. That part is built from
   * the vendored schema rather than measured against a real menu, so it is
   * the one widget here nobody has yet seen work; see
   * {@link buildPopupMenuModel}. {@link setPopupMenu} still attaches a
   * model a caller already has.
   */
  setCellControl(
    row: number,
    column: number,
    control:
      | { widget: "checkbox"; value?: boolean }
      | { widget: "starRating"; value?: number }
      | { widget: "slider" | "stepper"; minimum: number; maximum: number; increment: number; value?: number }
      | {
          widget: "popupMenu";
          items: readonly PopupItem[];
          value?: string | number;
          /**
           * Whether the menu starts on its first choice rather than blank.
           *
           * Measured: with this off, Numbers offers the model's None entry
           * as a selectable row above the real choices. With it on — the
           * default — the menu shows only the items given here.
           */
          startsWithFirstItem?: boolean;
        },
    options: WriteOptions = {},
  ): number {
    this.requireWritable();
    const spec = RawMessage.create();
    switch (control.widget) {
      case "checkbox":
        spec.setVarint(CellSpecFields.INTERACTION_TYPE, InteractionType.CHECKBOX);
        break;
      case "popupMenu": {
        // The value has to be one of the choices — a menu showing something
        // it cannot offer is a state the app has no way to represent.
        if (control.value !== undefined && !control.items.includes(control.value)) {
          throw new RangeError(
            `value ${JSON.stringify(control.value)} is not one of the menu's items`,
          );
        }
        spec.setVarint(CellSpecFields.INTERACTION_TYPE, InteractionType.POPUP_MENU);
        spec.setMessage(
          CellSpecFields.CHOOSER_POPUP_MODEL,
          makeRef(this.internPopupModel(control.items)),
        );
        spec.setVarint(
          CellSpecFields.CHOOSER_START_WITH_FIRST,
          control.startsWithFirstItem === false ? 0 : 1,
        );
        break;
      }
      case "starRating":
        // Every star rating in every document is bounded [0…5] step 1, and
        // the app offers no way to change that.
        spec.setVarint(CellSpecFields.INTERACTION_TYPE, InteractionType.STAR_RATING);
        spec.setDouble(CellSpecFields.RANGE_MIN, 0);
        spec.setDouble(CellSpecFields.RANGE_MAX, 5);
        spec.setDouble(CellSpecFields.RANGE_INCREMENT, 1);
        break;
      default: {
        if (!(control.increment > 0)) {
          throw new RangeError(`increment must be positive, got ${control.increment}`);
        }
        if (!(control.maximum > control.minimum)) {
          throw new RangeError(
            `maximum ${control.maximum} must exceed minimum ${control.minimum}`,
          );
        }
        spec.setVarint(
          CellSpecFields.INTERACTION_TYPE,
          control.widget === "slider" ? InteractionType.SLIDER : InteractionType.STEPPER,
        );
        spec.setDouble(CellSpecFields.RANGE_MIN, control.minimum);
        spec.setDouble(CellSpecFields.RANGE_MAX, control.maximum);
        spec.setDouble(CellSpecFields.RANGE_INCREMENT, control.increment);
      }
    }

    if (control.value !== undefined) this.setCell(row, column, control.value, options);
    const key = this.internControl(spec);
    this.attachControl(row, column, key);
    this.ensureControlFormat(
      row,
      column,
      control.widget,
      control.widget === "popupMenu" ? typeof control.items[0] : undefined,
    );
    return key;
  }

  /**
   * Give a control cell the format that draws it.
   *
   * **The spec alone is not enough.** A control needs two things: the spec,
   * which says what the widget is, and a *format*, which says to draw the
   * cell as that widget rather than as its value. Without the format
   * Numbers renders the underlying value — `TRUE` for a checkbox, a bare
   * number for a slider — and the control is nowhere to be seen. That is
   * exactly what shipped: the spec was written, the reader read it back,
   * and no cell ever showed a widget.
   *
   * Every control cell in every borrowed document carries a format id
   * matching its value type: bool cells a `bool_format`, string cells a
   * `text_format`, numeric cells a `num_format`. The minimal case settles
   * which is load-bearing — a checkbox in `test-format-save.numbers` has
   * the boolean format and no number format at all.
   *
   * A format the caller already set is left alone, so choosing a percentage
   * for a stepper survives.
   */
  private ensureControlFormat(
    row: number,
    column: number,
    widget: string,
    itemType?: string,
  ): void {
    const numberFormat: CellFormat = {
      // Apple writes the two zeros explicitly on a slider's plain number
      // format, so this comes out byte-identical to theirs.
      kind: "number",
      decimals: "auto",
      negativeStyle: 0,
      thousandsSeparator: false,
    };
    const format: CellFormat =
      widget === "checkbox"
        ? { kind: "checkbox" }
        : widget === "starRating"
          ? { kind: "starRating" }
          : // A menu follows its items: Apple's text menus carry a
            // `text_format` and its numeric ones a `num_format`, the same
            // value-type rule every other control cell obeys.
            widget === "popupMenu"
            ? itemType === "number"
              ? numberFormat
              : { kind: "text" }
            : numberFormat;
    if (this.recordAt(row, column)?.id(flagForFormat(format)) !== undefined) return;
    this.setCellFormat(row, column, format);
  }

  /**
   * Point a cell at a pop-up menu model that already exists.
   *
   * Kept alongside {@link setCellControl}, which builds a model from a list
   * of items, for the case where a caller already has one — from another
   * cell, or another document — and wants that exact archive shared rather
   * than a second copy of the same choices.
   *
   * `itemType` decides the cell's format, and the default is `"string"`
   * because text menus are the common case. Passing the wrong one leaves a
   * numeric menu formatted as text; passing none on a numeric menu does the
   * same. This path shipped for a while with **no format at all**, which is
   * the defect that made every other widget invisible — a spec without a
   * format is a control the app never draws.
   */
  setPopupMenu(
    row: number,
    column: number,
    popupModelId: bigint,
    options: { startsWithFirstItem?: boolean; itemType?: "string" | "number" } = {},
  ): number {
    this.requireWritable();
    const spec = RawMessage.create();
    spec.setVarint(CellSpecFields.INTERACTION_TYPE, InteractionType.POPUP_MENU);
    spec.setMessage(CellSpecFields.CHOOSER_POPUP_MODEL, makeRef(popupModelId));
    spec.setVarint(
      CellSpecFields.CHOOSER_START_WITH_FIRST,
      options.startsWithFirstItem === false ? 0 : 1,
    );
    const key = this.internControl(spec);
    this.attachControl(row, column, key);
    this.ensureControlFormat(row, column, "popupMenu", options.itemType ?? "string");
    return key;
  }

  /** Take the widget off a cell, keeping its value. Returns false if none. */
  removeCellControl(row: number, column: number): boolean {
    this.requireWritable();
    const located = this.locateRow(row);
    if (!located) return false;
    const layout = readRowLayout(located.rowInfo, this.columnCount);
    const existing = layout.records[column];
    if (!existing) return false;
    const record = CellRecord.decode(existing);
    if (record.id(CellFlag.CONTROL_ID) === undefined) return false;
    record.remove(CellFlag.CONTROL_ID);
    layout.records[column] = record.encode();
    this.writeRowLayout(located.rowInfo, layout);
    this.refreshTileTotals();
    return true;
  }

  /** Point a cell's record at a control key. */
  private attachControl(row: number, column: number, key: number): void {
    const located = this.locateRow(row);
    if (!located) {
      throw new RangeError(
        `row ${row} has no cell storage; only rows the app has materialized can be written`,
      );
    }
    const layout = readRowLayout(located.rowInfo, this.columnCount);
    const existing = layout.records[column];
    const record = existing ? CellRecord.decode(existing) : new CellRecord();
    record.setId(CellFlag.CONTROL_ID, key);
    layout.records[column] = record.encode();
    this.writeRowLayout(located.rowInfo, layout);
    this.refreshRowHeader(row, layout.records.filter((r) => r !== undefined).length);
    this.refreshTileTotals();
  }

  /**
   * Add a control spec to the table's control table, reusing an identical
   * one, and creating the table itself when the document has none.
   *
   * Deduplication matters here in a way it does not for formulas: a column
   * of checkboxes is one spec shared by every cell, and writing forty
   * copies would be both larger and unlike anything the app produces.
   */
  private internControl(spec: RawMessage): number {
    const dataStore = this.dataStore();
    if (!dataStore) throw new RangeError("table has no data store; cannot store a control");
    let list = this.store.resolve(refId(dataStore, CONTROL_CELL_SPEC_TABLE));
    if (!list) {
      // No document in the corpus lacks one, so this path is close to
      // unreachable; when it does run, the list goes beside the table
      // rather than in a component of its own, which is a simplification
      // worth knowing about if a file built this way is ever rejected.
      const component = this.store.componentOf(this.object.identifier);
      if (!component) throw new RangeError("table object has no component");
      list = this.store.createObject(TABLE_DATA_LIST_TYPE, component);
      list.message.setVarint(DataList.LIST_TYPE, CONTROL_LIST_TYPE);
      list.message.setVarint(DataList.NEXT_LIST_ID, 1);
      dataStore.setMessage(CONTROL_CELL_SPEC_TABLE, makeRef(list.identifier));
      this.object.message.markDirty();
    }

    const encoded = spec.toBytes();
    for (const entry of list.message.getMessages(DataList.ENTRIES)) {
      const existing = entry.getMessage(CONTROL_LIST_ENTRY_SPEC);
      const key = entry.getUint(ListEntry.KEY);
      if (key === undefined || !existing || !bytesEqual(existing.toBytes(), encoded)) continue;
      entry.setVarint(ListEntry.REFCOUNT, (entry.getUint(ListEntry.REFCOUNT) ?? 0) + 1);
      return key;
    }

    const key = list.message.getUint(DataList.NEXT_LIST_ID) ?? nextFreeKey(list.message);
    const entry = RawMessage.create();
    entry.setVarint(ListEntry.KEY, key);
    entry.setVarint(ListEntry.REFCOUNT, 1);
    entry.setMessage(CONTROL_LIST_ENTRY_SPEC, spec);
    list.message.addMessage(DataList.ENTRIES, entry);
    list.message.setVarint(DataList.NEXT_LIST_ID, key + 1);
    return key;
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

  /**
   * Put rows back in the groups their current values call for.
   *
   * The fix for what {@link staleCategoryGroups} reports. Returns the number
   * of rows that moved — zero when the tree was already correct, in which
   * case the archive is rewritten to the same bytes.
   *
   * Throws if a row's value has no group: see
   * {@link TableCategories.regroup} for why creating one is refused.
   */
  regroupCategories(): number {
    const definition = this.activeCategories();
    if (!definition) return 0;
    const byPosition = new Map<string, CellValue>();
    for (const cell of this.cells()) byPosition.set(`${cell.row}:${cell.column}`, cell.value);
    return definition.regroup((row, column) =>
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
  /**
   * Fill in a condition's two required style references.
   *
   * `TST.ConditionalStyleRule` declares `cell_style` and `text_style` as
   * `required`, so neither can be left out — a rule missing one is a
   * malformed message, not a rule that formats less. Callers should not
   * have to know that, so:
   *
   *  - `cell` formatting becomes a new `TST.CellStyleArchive`, interned in
   *    the table's style table the same way {@link setCellFormatting} does.
   *  - the text style defaults to the table's **body** text style, which is
   *    a real `TSWP.ParagraphStyleArchive` and leaves the text looking
   *    exactly as it did. Satisfying the reference is the point; changing
   *    the text is opt-in via `textStyleId`.
   *
   * A condition naming no formatting at all is refused. It cannot be
   * represented, and silently pointing it at the defaults would write a
   * rule that does nothing while reading back as though it did.
   */
  private resolveConditionStyles(condition: ConditionalCondition): ConditionalCondition {
    if (condition.cellStyleId === undefined && !condition.cell) {
      throw new RangeError(
        "a conditional rule must format something: pass `cell` formatting (e.g. " +
          "{ cell: { fill: { kind: 'color', color: red } } }) or an existing cellStyleId. " +
          "TST.ConditionalStyleRule declares both style references as `required`, so a rule " +
          "that formats nothing cannot be written — it would be a malformed message",
      );
    }

    const cellStyleId =
      condition.cellStyleId ?? this.styleTableEntry(this.createCellStyle(condition.cell!));
    if (cellStyleId === undefined) {
      throw new RangeError("failed to intern a cell style for the conditional rule");
    }

    const textStyleId = condition.textStyleId ?? this.bandTextStyle("body")?.object.identifier;
    if (textStyleId === undefined) {
      throw new RangeError(
        "the table has no body text style to point the rule's required text_style at; " +
          "pass textStyleId explicitly",
      );
    }

    return { ...condition, cellStyleId, textStyleId };
  }

  /**
   * The stylesheet a new style should belong to.
   *
   * Read off a style the table already interns rather than looked up from
   * the document, so a table in a component with its own stylesheet gets
   * that one. `undefined` when the table has no styles to learn from, which
   * leaves the reference out rather than pointing it somewhere wrong.
   */
  private stylesheetReference(): bigint | undefined {
    const list = this.store.resolve(refId(this.dataStore(), DataStoreFields.STYLE_TABLE));
    for (const entry of list?.message.getMessages(DataList.ENTRIES) ?? []) {
      const style = this.store.resolve(refId(entry, ListEntry.REFERENCE));
      const id = refId(style?.message.getMessage(STYLE_SUPER), StyleSuper.STYLESHEET);
      if (id !== undefined) return id;
    }
    return undefined;
  }

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
      sup.remove(StyleSuper.NAME);
      sup.remove(StyleSuper.STYLE_IDENTIFIER);
    } else {
      // **`super` is `required`.** With a parent to clone it arrives for
      // free; created from nothing it does not, and a TST.CellStyleArchive
      // without it is a message Numbers will not parse — it refuses the
      // whole document. Apple's own cell styles carry a style_identifier
      // and a stylesheet reference here; the identifier must not be
      // duplicated, but the stylesheet must be right, so it is copied from
      // a style the table already has.
      const fresh = RawMessage.create();
      const stylesheet = this.stylesheetReference();
      if (stylesheet !== undefined) fresh.setMessage(StyleSuper.STYLESHEET, makeRef(stylesheet));
      created.message.setMessage(STYLE_SUPER, fresh);
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
  private applyValue(record: CellRecord, value: TaggedCellInput): void {
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
