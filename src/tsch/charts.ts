/**
 * TSCH family — charts, shared by all three apps.
 *
 * A chart on a canvas is a `TSCH.ChartDrawableArchive` whose real payload
 * hangs off a protobuf **extension** field (`unity = 10000`) holding a
 * `TSCH.ChartArchive`. The plotted numbers live in an inline
 * `ChartGridArchive`: row and column names plus a row-major grid of
 * `GridValue`s — so chart data is readable without touching the chart's
 * styling or the calculation engine.
 *
 * Data is editable. What makes that safe is that nothing in the archive is
 * indexed by a *value* — series styling, axes and the grid's id map all key
 * off positions. So changing numbers touches only the numbers, and changing
 * the *shape* (adding or removing a series or category) means moving three
 * things together: the name list, the grid, and the id map, plus shifting
 * the sparse per-series style arrays so styling does not slide onto its
 * neighbour.
 *
 * Chart *appearance* — type, colours, axis settings — is not modeled.
 */
import type { IwaObject } from "../tsp/iwa.ts";
import type { ObjectStore } from "../tsp/store.ts";
import { RawMessage } from "../base/protobuf.ts";
import { randomUuid } from "../base/uuid.ts";

export const TSCH_TYPE = {
  CHART_DRAWABLE: 5021,
  PREUFF_CHART_INFO: 5000,
} as const;

/** TSCH.ChartDrawableArchive. */
const ChartDrawable = { SUPER: 1, UNITY: 10000 } as const;

/** TSCH.ChartArchive (reader-relevant fields). */
const Chart = {
  CHART_TYPE: 1,
  LEGEND_FRAME: 3,
  SERIES_DIRECTION: 5,
  CONTAINS_DEFAULT_DATA: 6,
  GRID: 7,
  SERIES_PRIVATE_STYLES: 18,
  SERIES_NON_STYLES: 19,
  IS_DIRTY: 24,
} as const;

/** TSCH.ChartGridArchive. */
const ChartGrid = { ROW_NAME: 1, COLUMN_NAME: 2, GRID_ROW: 3, ID_MAP: 4 } as const;
/**
 * TSCH.ChartGridArchive.ChartGridRowColumnIdMap — a UUID per row and per
 * column, mapping to its index. The apps use it to follow a series across a
 * reorder, so it has to move with the grid.
 */
const IdMap = { ROW_IDS: 1, COLUMN_IDS: 2 } as const;
const IdMapEntry = { UNIQUE_ID: 1, INDEX: 2 } as const;
/** TSP.SparseReferenceArray: count = 1, entries = 2 { index = 1, reference = 2 }. */
const SparseArray = { COUNT: 1, ENTRIES: 2, ENTRY_INDEX: 1 } as const;
/** TSCH.GridRow / TSCH.GridValue. */
const GridRow = { VALUE: 1 } as const;
const GridValue = {
  NUMERIC: 1,
  DATE_1_0: 2,
  DURATION: 3,
  DATE: 4,
} as const;

/** TSCH.ChartType enum values. */
export const CHART_TYPE_NAMES: Readonly<Record<number, string>> = {
  0: "undefined",
  1: "column2D",
  2: "bar2D",
  3: "line2D",
  4: "area2D",
  5: "pie2D",
  6: "stackedColumn2D",
  7: "stackedBar2D",
  8: "stackedArea2D",
  9: "scatter2D",
  10: "mixed2D",
  11: "twoAxis2D",
  12: "column3D",
  13: "bar3D",
  14: "line3D",
  15: "area3D",
  16: "pie3D",
  17: "stackedColumn3D",
  18: "stackedBar3D",
  19: "stackedArea3D",
  20: "multiDataColumn2D",
  21: "multiDataBar2D",
};

/** One plotted value. Charts store numbers, dates and durations distinctly. */
export type ChartValue =
  | { type: "empty" }
  | { type: "number"; value: number }
  | { type: "date"; value: Date }
  | { type: "duration"; seconds: number };

/** Seconds between the Unix epoch and Apple's 2001-01-01 epoch. */
const APPLE_EPOCH_MS = Date.UTC(2001, 0, 1);

export class ChartModel {
  readonly store: ObjectStore;
  readonly object: IwaObject;

  constructor(store: ObjectStore, object: IwaObject) {
    this.store = store;
    this.object = object;
  }

  get id(): bigint {
    return this.object.identifier;
  }

  /** The TSCH.ChartArchive carried in the drawable's extension field. */
  private chart(): RawMessage | undefined {
    return this.object.message.getMessage(ChartDrawable.UNITY);
  }

  /** Numeric TSCH.ChartType value. */
  get chartTypeId(): number | undefined {
    return this.chart()?.getUint(Chart.CHART_TYPE);
  }

  /** Chart type as a readable name ("column2D", "pie2D", …). */
  get chartType(): string {
    const id = this.chartTypeId;
    return id === undefined ? "undefined" : (CHART_TYPE_NAMES[id] ?? `type ${id}`);
  }

  /** True when the chart still holds Apple's placeholder data. */
  get hasDefaultData(): boolean {
    return this.chart()?.getBool(Chart.CONTAINS_DEFAULT_DATA) ?? false;
  }

  private grid(): RawMessage | undefined {
    return this.chart()?.getMessage(Chart.GRID);
  }

  /** Series (row) names. */
  rowNames(): string[] {
    return this.grid()?.getStrings(ChartGrid.ROW_NAME) ?? [];
  }

  /** Category (column) names. */
  columnNames(): string[] {
    return this.grid()?.getStrings(ChartGrid.COLUMN_NAME) ?? [];
  }

  /** Plotted values, row-major: `data()[row][column]`. */
  data(): ChartValue[][] {
    const grid = this.grid();
    if (!grid) return [];
    return grid.getMessages(ChartGrid.GRID_ROW).map((row) =>
      row.getMessages(GridRow.VALUE).map((value) => decodeGridValue(value)),
    );
  }

  /** Convenience: rows as `{ name, values }`, pairing names with data. */
  series(): { name: string | undefined; values: ChartValue[] }[] {
    const names = this.rowNames();
    return this.data().map((values, i) => ({ name: names[i], values }));
  }

  /**
   * Whether grid rows are series or categories.
   *
   * Raw `series_direction`. Both corpus charts store 1 and lay their series
   * out as rows, which is the arrangement this module's row/series naming
   * assumes; a chart storing something else is read the same way and its
   * direction is exposed here so a caller can tell.
   */
  get seriesDirection(): number | undefined {
    return this.chart()?.getUint(Chart.SERIES_DIRECTION);
  }

  // ------------------------------------------------------------- data editing

  private requireGrid(): RawMessage {
    const grid = this.grid();
    if (!grid) throw new RangeError(`chart ${this.id} has no data grid`);
    return grid;
  }

  /**
   * Replace one plotted value.
   *
   * Nothing else in the archive is indexed by a value, so this is the safe
   * edit: series styling, axes and the id map all key off *positions*,
   * which do not move.
   */
  setValue(row: number, column: number, value: ChartValue): void {
    const grid = this.requireGrid();
    const rows = grid.getMessages(ChartGrid.GRID_ROW);
    const target = rows[row];
    if (!target) throw new RangeError(`chart ${this.id} has no series ${row}`);
    const values = target.getMessages(GridRow.VALUE);
    if (column < 0 || column >= values.length) {
      throw new RangeError(`series ${row} has no category ${column}`);
    }
    values[column] = encodeGridValue(value);
    target.setMessages(GridRow.VALUE, values);
    this.markDirty();
  }

  /**
   * Replace one series' values, keeping the number of categories.
   *
   * Charts are rectangular: every series must have a value for every
   * category, or the app plots a series shorter than its axis. Supplying a
   * different count is refused rather than padded, because padding with
   * zeroes and padding with gaps look identical in the data and completely
   * different on the page.
   */
  setSeriesValues(row: number, values: readonly ChartValue[]): void {
    const grid = this.requireGrid();
    const rows = grid.getMessages(ChartGrid.GRID_ROW);
    const target = rows[row];
    if (!target) throw new RangeError(`chart ${this.id} has no series ${row}`);
    const width = this.columnCount;
    if (values.length !== width) {
      throw new RangeError(
        `series ${row} has ${width} categories but ${values.length} values were given; use addCategory or removeCategory to change the count`,
      );
    }
    target.setMessages(GridRow.VALUE, values.map(encodeGridValue));
    this.markDirty();
  }

  /** Replace the whole grid, keeping its shape. */
  setData(data: readonly (readonly ChartValue[])[]): void {
    if (data.length !== this.rowCount) {
      throw new RangeError(
        `chart has ${this.rowCount} series but ${data.length} rows were given; use addSeries or removeSeries to change the count`,
      );
    }
    data.forEach((values, row) => this.setSeriesValues(row, values));
  }

  get rowCount(): number {
    return this.grid()?.getMessages(ChartGrid.GRID_ROW).length ?? 0;
  }

  get columnCount(): number {
    return this.grid()?.getMessages(ChartGrid.GRID_ROW)[0]?.getMessages(GridRow.VALUE).length ?? 0;
  }

  setRowName(row: number, name: string): void {
    const grid = this.requireGrid();
    const names = grid.getStrings(ChartGrid.ROW_NAME);
    if (row < 0 || row >= names.length) throw new RangeError(`chart has no series ${row}`);
    names[row] = name;
    setStrings(grid, ChartGrid.ROW_NAME, names);
    this.markDirty();
  }

  setColumnName(column: number, name: string): void {
    const grid = this.requireGrid();
    const names = grid.getStrings(ChartGrid.COLUMN_NAME);
    if (column < 0 || column >= names.length) {
      throw new RangeError(`chart has no category ${column}`);
    }
    names[column] = name;
    setStrings(grid, ChartGrid.COLUMN_NAME, names);
    this.markDirty();
  }

  /**
   * Append a series.
   *
   * Three things move together: the name list, the grid row, and the id
   * map — a UUID per series that the app uses to track one across a reorder.
   * The series' *styling* deliberately does not: theme styles are a
   * six-colour palette the app cycles, and per-series overrides live in a
   * sparse array where an absent entry means "use the theme". A new series
   * with no override is therefore correct, not incomplete.
   */
  addSeries(name: string, values: readonly ChartValue[]): number {
    const grid = this.requireGrid();
    const width = this.columnCount;
    if (values.length !== width) {
      throw new RangeError(`chart has ${width} categories but ${values.length} values were given`);
    }
    const index = this.rowCount;
    setStrings(grid, ChartGrid.ROW_NAME, [...grid.getStrings(ChartGrid.ROW_NAME), name]);

    const row = RawMessage.create();
    row.setMessages(GridRow.VALUE, values.map(encodeGridValue));
    grid.addMessage(ChartGrid.GRID_ROW, row);

    addIdMapEntry(grid, IdMap.ROW_IDS, index);
    this.markDirty();
    return index;
  }

  /**
   * Remove a series, and everything indexed by its position.
   *
   * The id map renumbers and the sparse style arrays shift down. Skipping
   * either leaves a chart whose styling has slid onto the wrong series —
   * a file that loads without complaint and is visibly wrong.
   */
  removeSeries(row: number): boolean {
    const grid = this.requireGrid();
    const rows = grid.getMessages(ChartGrid.GRID_ROW);
    if (row < 0 || row >= rows.length) return false;

    const names = grid.getStrings(ChartGrid.ROW_NAME);
    names.splice(row, 1);
    setStrings(grid, ChartGrid.ROW_NAME, names);
    rows.splice(row, 1);
    grid.setMessages(ChartGrid.GRID_ROW, rows);

    removeIdMapEntry(grid, IdMap.ROW_IDS, row);
    for (const field of [Chart.SERIES_PRIVATE_STYLES, Chart.SERIES_NON_STYLES]) {
      removeSparseEntry(this.chart()!.getMessage(field), row);
    }
    this.markDirty();
    return true;
  }

  /** Append a category, giving every series a value for it. */
  addCategory(name: string, values: readonly ChartValue[]): number {
    const grid = this.requireGrid();
    const rows = grid.getMessages(ChartGrid.GRID_ROW);
    if (values.length !== rows.length) {
      throw new RangeError(`chart has ${rows.length} series but ${values.length} values were given`);
    }
    const index = this.columnCount;
    setStrings(grid, ChartGrid.COLUMN_NAME, [...grid.getStrings(ChartGrid.COLUMN_NAME), name]);
    rows.forEach((row, i) => {
      row.setMessages(GridRow.VALUE, [
        ...row.getMessages(GridRow.VALUE),
        encodeGridValue(values[i]!),
      ]);
    });
    addIdMapEntry(grid, IdMap.COLUMN_IDS, index);
    this.markDirty();
    return index;
  }

  /** Remove a category from every series. */
  removeCategory(column: number): boolean {
    const grid = this.requireGrid();
    if (column < 0 || column >= this.columnCount) return false;

    const names = grid.getStrings(ChartGrid.COLUMN_NAME);
    names.splice(column, 1);
    setStrings(grid, ChartGrid.COLUMN_NAME, names);
    for (const row of grid.getMessages(ChartGrid.GRID_ROW)) {
      const values = row.getMessages(GridRow.VALUE);
      values.splice(column, 1);
      row.setMessages(GridRow.VALUE, values);
    }
    removeIdMapEntry(grid, IdMap.COLUMN_IDS, column);
    this.markDirty();
    return true;
  }

  /**
   * Mark the chart as changed, and no longer holding Apple's placeholder
   * data.
   *
   * `contains_default_data` is what makes the apps replace a template
   * chart's numbers wholesale the first time it is edited; leaving it set
   * on a chart we have filled in invites exactly that.
   */
  private markDirty(): void {
    const chart = this.chart();
    if (!chart) return;
    chart.setBool(Chart.IS_DIRTY, true);
    if (chart.getBool(Chart.CONTAINS_DEFAULT_DATA)) {
      chart.setBool(Chart.CONTAINS_DEFAULT_DATA, false);
    }
  }
}

/** Encode a {@link ChartValue} back into a `TSCH.GridValue`. */
export function encodeGridValue(value: ChartValue): RawMessage {
  const message = RawMessage.create();
  switch (value.type) {
    case "number":
      message.setDouble(GridValue.NUMERIC, value.value);
      break;
    case "date":
      message.setDouble(GridValue.DATE, (value.value.getTime() - APPLE_EPOCH_MS) / 1000);
      break;
    case "duration":
      message.setDouble(GridValue.DURATION, value.seconds);
      break;
    case "empty":
      // An empty message, which is how a gap reads back — distinct from a
      // zero, and plotted as a gap rather than a point on the axis.
      break;
  }
  return message;
}

/** Replace a repeated string field, preserving its position in the message. */
function setStrings(message: RawMessage, no: number, values: readonly string[]): void {
  const index = message.fields.findIndex((field) => field.no === no);
  message.remove(no);
  const inserted = values.map((value) => {
    const holder = RawMessage.create();
    holder.setString(no, value);
    return holder.fields[0]!;
  });
  if (index >= 0) message.fields.splice(index, 0, ...inserted);
  else message.fields.push(...inserted);
  message.markDirty();
}

/** Add an id-map entry for a newly appended row or column. */
function addIdMapEntry(grid: RawMessage, field: number, index: number): void {
  let idMap = grid.getMessage(ChartGrid.ID_MAP);
  if (!idMap) {
    idMap = RawMessage.create();
    grid.setMessage(ChartGrid.ID_MAP, idMap);
  }
  const entry = RawMessage.create();
  entry.setString(IdMapEntry.UNIQUE_ID, randomUuid());
  entry.setVarint(IdMapEntry.INDEX, index);
  idMap.addMessage(field, entry);
}

/** Drop an id-map entry and renumber everything above it. */
function removeIdMapEntry(grid: RawMessage, field: number, index: number): void {
  const idMap = grid.getMessage(ChartGrid.ID_MAP);
  if (!idMap) return;
  const kept: RawMessage[] = [];
  for (const entry of idMap.getMessages(field)) {
    const at = entry.getUint(IdMapEntry.INDEX) ?? 0;
    if (at === index) continue;
    if (at > index) entry.setVarint(IdMapEntry.INDEX, at - 1);
    kept.push(entry);
  }
  idMap.setMessages(field, kept);
}

/**
 * Drop a `TSP.SparseReferenceArray` entry and shift the rest down.
 *
 * `count` tracks the number of entries in every array examined, so it is
 * maintained that way — an array whose count outran its entries would be
 * a different structure than the corpus contains.
 */
function removeSparseEntry(array: RawMessage | undefined, index: number): void {
  if (!array) return;
  const kept: RawMessage[] = [];
  for (const entry of array.getMessages(SparseArray.ENTRIES)) {
    const at = entry.getUint(SparseArray.ENTRY_INDEX) ?? 0;
    if (at === index) continue;
    if (at > index) entry.setVarint(SparseArray.ENTRY_INDEX, at - 1);
    kept.push(entry);
  }
  array.setMessages(SparseArray.ENTRIES, kept);
  array.setVarint(SparseArray.COUNT, kept.length);
}

export function decodeGridValue(value: RawMessage): ChartValue {
  const numeric = value.getDouble(GridValue.NUMERIC);
  if (numeric !== undefined) return { type: "number", value: numeric };
  const date = value.getDouble(GridValue.DATE) ?? value.getDouble(GridValue.DATE_1_0);
  if (date !== undefined) return { type: "date", value: new Date(APPLE_EPOCH_MS + date * 1000) };
  const duration = value.getDouble(GridValue.DURATION);
  if (duration !== undefined) return { type: "duration", seconds: duration };
  return { type: "empty" };
}

/** Every chart in a document. */
export function chartsOf(store: ObjectStore): ChartModel[] {
  const out: ChartModel[] = [];
  for (const { obj } of store.allObjects()) {
    if (obj.type === TSCH_TYPE.CHART_DRAWABLE) out.push(new ChartModel(store, obj));
  }
  return out;
}
