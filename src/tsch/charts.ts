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
 * Read-only: writing chart data additionally requires updating the chart's
 * mediator/series styles, which is not modeled yet.
 */
import type { IwaObject } from "../tsp/iwa.ts";
import type { ObjectStore } from "../tsp/store.ts";
import type { RawMessage } from "../base/protobuf.ts";

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
} as const;

/** TSCH.ChartGridArchive. */
const ChartGrid = { ROW_NAME: 1, COLUMN_NAME: 2, GRID_ROW: 3 } as const;
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
