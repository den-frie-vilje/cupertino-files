/**
 * TST family — table/spreadsheet reading (Numbers tables, and the same
 * archives when embedded in Pages/Keynote). Implements the modern "BNC"
 * v5 cell storage per research/numbers-cells.md: tiles → row infos →
 * signed-16 offset arrays → 12-byte-header cell records, with string /
 * rich-text table resolution, decimal128 numbers and merge ranges.
 *
 * Read-only by design for now: cell edits require formula-dependency
 * bookkeeping (see docs/FORMAT.md §12).
 */
import type { IwaObject } from "../tsp/iwa.ts";
import type { ObjectStore } from "../tsp/store.ts";
import { refId } from "../tsp/schema.ts";
import { Storage } from "../tswp/schema.ts";
import type { RawMessage } from "../base/protobuf.ts";

export const TST_TYPE = {
  TABLE_INFO: 6000,
  TABLE_MODEL: 6001,
  TILE: 6002,
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
} as const;
/** TST.DataStore. */
const DataStoreFields = {
  ROW_HEADERS: 1,
  TILES: 3,
  STRING_TABLE: 4,
  FORMULA_TABLE: 6,
  MERGE_REGION_MAP: 13,
  RICH_TEXT_TABLE: 17,
} as const;
/** TST.TileStorage / .Tile / .TileRowInfo. */
const TileStorageFields = { TILES: 1, TILE_SIZE: 2 } as const;
const TileEntry = { TILEID: 1, TILE: 2 } as const;
const TileFields = { ROW_INFOS: 5, STORAGE_VERSION: 6, LAST_SAVED_IN_BNC: 7 } as const;
const TileRowInfo = {
  TILE_ROW_INDEX: 1,
  CELL_STORAGE_BUFFER: 6,
  CELL_OFFSETS: 7,
  HAS_WIDE_OFFSETS: 8,
} as const;
/** TST.TableDataList / .ListEntry. */
const DataList = { ENTRIES: 3 } as const;
const ListEntry = { KEY: 1, STRING: 3, FORMULA: 5, RICH_TEXT_PAYLOAD: 9 } as const;
/** TST.RichTextPayloadArchive: storage = 1. */
const RichTextPayload = { STORAGE: 1 } as const;
/** TST.MergeRegionMapArchive: cell_range = 1 { origin = 1, size = 2 (packed fixed32) }. */
const MergeMap = { CELL_RANGE: 1 } as const;
const CellRange = { ORIGIN: 1, SIZE: 2 } as const;
const PACKED_DATA = 1;

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

  merges(): MergeRange[] {
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
      for (const ri of tile.message.getMessages(TileFields.ROW_INFOS)) {
        sawRow = true;
        if (ri.getBytes(TileRowInfo.CELL_STORAGE_BUFFER) !== undefined) return "v5";
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
