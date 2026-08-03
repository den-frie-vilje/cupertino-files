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
 * Chart *appearance* — colours, opacity — lives in the parallel style
 * archives; see `appearance.ts`. The chart **type** is here, because it is a
 * field of the `ChartArchive` itself rather than of any style.
 */
import type { IwaObject } from "../tsp/iwa.ts";
import type { ObjectStore } from "../tsp/store.ts";
import { RawMessage } from "../base/protobuf.ts";
import { randomUuid } from "../base/uuid.ts";
import { APPLE_EPOCH_MS } from "../base/bytes.ts";
import {
  ChartAxisStyle,
  ChartLegendStyle,
  ChartSeriesStyle,
  ChartStyleArchive,
  REFERENCE_IDENTIFIER,
  SparseEntry,
  sparseRefs,
  type AxisKind,
} from "./appearance.ts";
import type { Fill } from "../tsd/style.ts";

export const TSCH_TYPE = {
  CHART_DRAWABLE: 5021,
  PREUFF_CHART_INFO: 5000,
  CHART_STYLE: 5022,
  LEGEND_STYLE: 5024,
  AXIS_STYLE: 5026,
  SERIES_STYLE: 5028,
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
  LEGEND_STYLE: 11,
  VALUE_AXIS_STYLES: 13,
  CATEGORY_AXIS_STYLES: 15,
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

/**
 * TSCH.ChartType enum values, complete against `TSCHArchives_Common.proto`.
 *
 * Completeness matters: types 22 (`bubble2D`) and 25 (`donut2D`) occur in
 * real documents, and any id the table lacks renders as its bare number,
 * `"type 22"`.
 */
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
  22: "bubble2D",
  23: "multiDataScatter2D",
  24: "multiDataBubble2D",
  25: "donut2D",
  26: "donut3D",
  27: "radar2D",
};

/** {@link CHART_TYPE_NAMES} inverted, for {@link ChartModel.setChartType}. */
export const CHART_TYPE_IDS: ReadonlyMap<string, number> = new Map(
  Object.entries(CHART_TYPE_NAMES).map(([id, name]) => [name, Number(id)]),
);

/** One plotted value. Charts store numbers, dates and durations distinctly. */
export type ChartValue =
  | { type: "empty" }
  | { type: "number"; value: number }
  | { type: "date"; value: Date }
  | { type: "duration"; seconds: number };

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

  /**
   * Change the chart type, by name or by raw enum value.
   *
   * This sets one field. It does **not** rebuild the style archives, and
   * that is a real limitation rather than an omission: a pie chart's axis
   * styles are meaningless and a scatter chart wants two value axes, so
   * switching between distant geometries leaves styling the previous type
   * chose. Within a family — column ⇄ bar ⇄ stacked, pie ⇄ donut — the same
   * archives apply and the switch is clean, which is why every series
   * carries a fill per geometry (see `appearance.ts`).
   *
   * Numbers redraws from the type, so a mismatch shows up as styling that
   * looks untouched, not as a damaged document.
   */
  setChartType(type: string | number): void {
    const id = typeof type === "number" ? type : CHART_TYPE_IDS.get(type);
    if (id === undefined) {
      throw new RangeError(
        `unknown chart type ${JSON.stringify(type)}; expected one of ` +
          `${[...CHART_TYPE_IDS.keys()].join(", ")}, or a raw enum value`,
      );
    }
    const chart = this.chart();
    if (!chart) throw new RangeError(`chart ${this.id} has no TSCH.ChartArchive`);
    chart.setVarint(Chart.CHART_TYPE, id);
    this.object.message.markDirty();
  }

  /**
   * Per-series styles, in series order.
   *
   * Sparse by design — a chart styles the series the template gave a colour
   * to and leaves the rest inheriting — so the returned entries carry their
   * own {@link ChartSeriesStyle.index} and there may be fewer than
   * {@link rowCount}.
   */
  seriesStyles(): ChartSeriesStyle[] {
    const array = this.chart()?.getMessage(Chart.SERIES_PRIVATE_STYLES);
    const out: ChartSeriesStyle[] = [];
    for (const { index, id } of sparseRefs(array)) {
      const object = this.store.resolve(id);
      if (object) out.push(new ChartSeriesStyle(this.store, object, index));
    }
    return out.sort((a, b) => a.index - b.index);
  }

  /** The style of one series, if it has its own rather than inheriting. */
  seriesStyle(index: number): ChartSeriesStyle | undefined {
    return this.seriesStyles().find((style) => style.index === index);
  }

  /** The legend's style archive, if the chart has one of its own. */
  legendStyle(): ChartLegendStyle | undefined {
    const id = this.chart()?.getMessage(Chart.LEGEND_STYLE)?.getVarint(REFERENCE_IDENTIFIER);
    const object = id === undefined ? undefined : this.store.resolve(id);
    return object ? new ChartLegendStyle(this.store, object) : undefined;
  }

  /**
   * Axis styles, category axes first.
   *
   * The chart keeps the two kinds in separate repeated fields, so nothing
   * has to be inferred — which matters, because an axis archive populates
   * only its own family of properties and reading a value axis as a
   * category one would silently return `undefined` for everything.
   */
  axisStyles(): ChartAxisStyle[] {
    const out: ChartAxisStyle[] = [];
    for (const [field, kind] of [
      [Chart.CATEGORY_AXIS_STYLES, "category"],
      [Chart.VALUE_AXIS_STYLES, "value"],
    ] as const) {
      const references = this.chart()?.getMessages(field) ?? [];
      references.forEach((reference, index) => {
        const object = this.store.resolve(reference.getVarint(REFERENCE_IDENTIFIER));
        if (object) out.push(new ChartAxisStyle(this.store, object, kind, index));
      });
    }
    return out;
  }

  /** The first axis style of a kind, which is the only one most charts have. */
  axisStyle(kind: AxisKind, index = 0): ChartAxisStyle | undefined {
    return this.axisStyles().find((axis) => axis.kind === kind && axis.index === index);
  }

  /**
   * Give this chart its own copy of an axis or legend style, if it shares one.
   *
   * The same hazard as {@link setSeriesFill} — these archives live in the
   * document stylesheet and a template hands one to every chart using it —
   * but the reference is a plain `TSP.Reference` in a repeated field rather
   * than a sparse-array entry, so the repointing differs and the sharing
   * check does not.
   *
   * Returns the archive to write to, which is the clone when one was made.
   */
  privatiseStyle(style: ChartStyleArchive, field: number, index = 0): IwaObject {
    const others = this.store.referrers(style.id).filter((id) => id !== this.id);
    if (others.length === 0) return style.object;

    const component = this.store.componentOf(style.id);
    if (!component) throw new RangeError(`chart style ${style.id} has no component`);
    const clone = this.store.createObject(style.object.type, component, {
      cloneFrom: style.object,
    });

    const chart = this.chart();
    if (!chart) throw new RangeError(`chart ${this.id} has no TSCH.ChartArchive`);
    // A repeated field holds one reference per axis; a singular one holds
    // exactly the one. `index` picks within the repeated case.
    const references = chart.getMessages(field);
    const reference = references.length > 1 ? references[index] : references[0];
    if (!reference) throw new RangeError(`chart ${this.id} has no style reference at field ${field}`);
    reference.setVarint(REFERENCE_IDENTIFIER, clone.identifier);

    this.object.message.markDirty();
    this.store.retargetReference(this.object, style.id, clone.identifier);
    return clone;
  }

  /**
   * Show or hide an axis's major gridlines, copying on write.
   *
   * The convenience wrapper for the common axis edit; anything else goes
   * through {@link privatiseStyle} and the {@link ChartAxisStyle} setters.
   */
  setAxisMajorGridlines(kind: AxisKind, visible: boolean, index = 0): ChartAxisStyle {
    const axis = this.axisStyle(kind, index);
    if (!axis) throw new RangeError(`chart ${this.id} has no ${kind} axis style at ${index}`);
    const field = kind === "category" ? Chart.CATEGORY_AXIS_STYLES : Chart.VALUE_AXIS_STYLES;
    const target = new ChartAxisStyle(this.store, this.privatiseStyle(axis, field, index), kind, index);
    target.setShowMajorGridlines(visible);
    return target;
  }

  /**
   * Set the colour of one series — the safe way.
   *
   * **Series style archives are shared.** They live in the document
   * stylesheet, and a template hands the same archive to every chart that
   * uses that palette slot: in one borrowed document a single
   * `ChartSeriesStyleArchive` is referenced by ten different charts, and
   * nine of the eighteen present are used by more than one. Reaching for
   * {@link ChartSeriesStyle.setFill} directly on such an archive recolours
   * every chart sharing it, with nothing in the result to suggest anything
   * unusual happened.
   *
   * So this copies on write. If the archive is referenced by anything other
   * than this chart it is cloned, this chart's slot is repointed at the
   * clone, and the clone is what gets the new colour. An archive already
   * private to this chart is edited in place.
   *
   * Returns the style that was actually written, which is the clone when
   * one was made.
   */
  setSeriesFill(index: number, fill: Fill): ChartSeriesStyle {
    const style = this.seriesStyle(index);
    if (!style) {
      throw new RangeError(
        `chart ${this.id} has no private style for series ${index}; it inherits ` +
          "from the chart's preset, and this library does not synthesise style archives",
      );
    }
    const target = this.privatiseSeriesStyle(style);
    target.setFill(fill);
    return target;
  }

  /**
   * Give this chart its own copy of a series style, if it is sharing one.
   *
   * Split out because the sharing check and the repointing are the
   * interesting part; the colour is not.
   */
  private privatiseSeriesStyle(style: ChartSeriesStyle): ChartSeriesStyle {
    const others = this.store.referrers(style.id).filter((id) => id !== this.id);
    if (others.length === 0) return style;

    const component = this.store.componentOf(style.id);
    if (!component) throw new RangeError(`chart style ${style.id} has no component`);
    // Cloned into the stylesheet beside the archive it copies, which is
    // where every other chart style lives and where the chart already has
    // an external reference pointing.
    const clone = this.store.createObject(style.object.type, component, {
      cloneFrom: style.object,
    });

    const array = this.chart()?.getMessage(Chart.SERIES_PRIVATE_STYLES);
    if (!array) throw new RangeError(`chart ${this.id} has no series style array`);
    let repointed = false;
    for (const entry of array.getMessages(SparseArray.ENTRIES)) {
      if ((entry.getUint(SparseArray.ENTRY_INDEX) ?? 0) !== style.index) continue;
      const reference = entry.getMessage(SparseEntry.REFERENCE);
      if (!reference) continue;
      reference.setVarint(REFERENCE_IDENTIFIER, clone.identifier);
      repointed = true;
    }
    if (!repointed) {
      throw new RangeError(`chart ${this.id} has no style slot at series ${style.index}`);
    }

    this.object.message.markDirty();
    this.store.retargetReference(this.object, style.id, clone.identifier);
    return new ChartSeriesStyle(this.store, clone, style.index);
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
    data.forEach((values, row) => { this.setSeriesValues(row, values); });
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
