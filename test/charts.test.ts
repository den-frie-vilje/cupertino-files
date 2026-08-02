/**
 * Chart data editing.
 *
 * Changing numbers is easy to get right and easy to test. Changing the
 * *shape* is neither: a chart's id map and its per-series style arrays are
 * indexed by position, so removing a series without renumbering them leaves
 * a file that loads without complaint and has its styling on the wrong
 * series. Those invariants are what these tests are for.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "./harness.ts";
import {
  chartsOf,
  decodeGridValue,
  encodeGridValue,
  IWorkDocument,
  isUuidString,
  type ChartModel,
  type ChartValue,
} from "../src/index.ts";

const FIXTURES = new URL("../fixtures/", import.meta.url);
const bytes = (name: string) => new Uint8Array(readFileSync(new URL(name, FIXTURES)));

/** A 2×4 column chart: two series over four months. */
const CHART = "draftjs-v2.3-comments.pages";
/** A 5×1 pie chart from a 2013-era Numbers file, with real series styles. */
const PIE = "tika-testNumbers2013.numbers";

const n = (value: number): ChartValue => ({ type: "number", value });

function firstChart(file: string): { document: IWorkDocument; chart: ChartModel } {
  const document = IWorkDocument.open(bytes(file));
  const chart = chartsOf(document.store)[0];
  if (!chart) throw new Error(`${file} no longer contains a chart`);
  return { document, chart };
}

/** Numbers only, for compact comparison. */
const numbers = (chart: ChartModel): number[][] =>
  chart.data().map((row) => row.map((v) => (v.type === "number" ? v.value : NaN)));

describe("chart data", () => {
  it("reads the grid with its names", () => {
    const { chart } = firstChart(CHART);
    expect(chart.rowCount).toBe(2);
    expect(chart.columnCount).toBe(4);
    expect(chart.rowNames()).toEqual(["Region 1", "Region 2"]);
    expect(chart.columnNames()).toEqual(["April", "May", "June", "July"]);
    expect(numbers(chart)).toEqual([
      [17, 26, 53, 96],
      [55, 43, 70, 58],
    ]);
  });

  it("changes a value without disturbing its neighbours", () => {
    const { document, chart } = firstChart(CHART);
    chart.setValue(0, 2, n(99));

    const reloaded = chartsOf(IWorkDocument.open(document.save()).store)[0]!;
    expect(numbers(reloaded)).toEqual([
      [17, 26, 99, 96],
      [55, 43, 70, 58],
    ]);
    expect(reloaded.rowNames()).toEqual(["Region 1", "Region 2"]);
  });

  it("round-trips every value type", () => {
    const date = new Date("2023-06-15T00:00:00Z");
    const cases: ChartValue[] = [
      n(-1234.5),
      { type: "date", value: date },
      { type: "duration", seconds: 3600 },
      { type: "empty" },
    ];
    for (const value of cases) {
      const decoded = decodeGridValue(encodeGridValue(value));
      expect(decoded.type).toBe(value.type);
      if (value.type === "number" && decoded.type === "number") {
        expect(decoded.value).toBe(value.value);
      }
      if (value.type === "date" && decoded.type === "date") {
        expect(decoded.value.getTime()).toBe(date.getTime());
      }
      if (value.type === "duration" && decoded.type === "duration") {
        expect(decoded.seconds).toBe(3600);
      }
    }
  });

  it("replaces a whole series and the whole grid", () => {
    const { document, chart } = firstChart(CHART);
    chart.setSeriesValues(1, [n(1), n(2), n(3), n(4)]);
    chart.setData([
      [n(10), n(20), n(30), n(40)],
      [n(50), n(60), n(70), n(80)],
    ]);

    const reloaded = chartsOf(IWorkDocument.open(document.save()).store)[0]!;
    expect(numbers(reloaded)).toEqual([
      [10, 20, 30, 40],
      [50, 60, 70, 80],
    ]);
  });

  it("refuses a series of the wrong width rather than padding it", () => {
    const { chart } = firstChart(CHART);
    // Padding with zeroes and padding with gaps look identical in the data
    // and completely different on the page, so neither is chosen for you.
    expect(() => chart.setSeriesValues(0, [n(1), n(2)])).toThrow();
    expect(() => chart.setData([[n(1), n(2), n(3), n(4)]])).toThrow();
    expect(() => chart.setValue(0, 9, n(1))).toThrow();
    expect(() => chart.setValue(9, 0, n(1))).toThrow();
  });

  it("renames series and categories", () => {
    const { document, chart } = firstChart(CHART);
    chart.setRowName(0, "North");
    chart.setColumnName(3, "Q3");

    const reloaded = chartsOf(IWorkDocument.open(document.save()).store)[0]!;
    expect(reloaded.rowNames()).toEqual(["North", "Region 2"]);
    expect(reloaded.columnNames()).toEqual(["April", "May", "June", "Q3"]);
    expect(() => chart.setRowName(9, "x")).toThrow();
    expect(() => chart.setColumnName(9, "x")).toThrow();
  });

  it("adds a series with an id-map entry of its own", () => {
    const { document, chart } = firstChart(CHART);
    const index = chart.addSeries("Region 3", [n(1), n(2), n(3), n(4)]);
    expect(index).toBe(2);

    const reloaded = chartsOf(IWorkDocument.open(document.save()).store)[0]!;
    expect(reloaded.rowCount).toBe(3);
    expect(reloaded.rowNames()[2]).toBe("Region 3");
    expect(numbers(reloaded)[2]).toEqual([1, 2, 3, 4]);
    expect(idMap(reloaded, 1).map((e) => e.index)).toEqual([0, 1, 2]);
    // The new series' identity must be a real UUID, like the others'.
    expect(idMap(reloaded, 1).every((e) => isUuidString(e.id))).toBe(true);
    expect(new Set(idMap(reloaded, 1).map((e) => e.id)).size).toBe(3);
  });

  it("adds a category to every series at once", () => {
    const { document, chart } = firstChart(CHART);
    chart.addCategory("August", [n(7), n(8)]);

    const reloaded = chartsOf(IWorkDocument.open(document.save()).store)[0]!;
    expect(reloaded.columnNames()).toEqual(["April", "May", "June", "July", "August"]);
    expect(numbers(reloaded)).toEqual([
      [17, 26, 53, 96, 7],
      [55, 43, 70, 58, 8],
    ]);
    expect(idMap(reloaded, 2).map((e) => e.index)).toEqual([0, 1, 2, 3, 4]);
    // A chart whose rows are shorter than its axis plots a truncated series.
    for (const row of reloaded.data()) expect(row.length).toBe(5);
    expect(() => chart.addCategory("Bad", [n(1)])).toThrow();
    expect(() => chart.addSeries("Bad", [n(1)])).toThrow();
  });

  it("renumbers the id map when a series is removed", () => {
    const { document, chart } = firstChart(CHART);
    const before = idMap(chart, 1);
    expect(chart.removeSeries(0)).toBe(true);

    expect(chart.rowCount).toBe(1);
    expect(chart.rowNames()).toEqual(["Region 2"]);
    expect(numbers(chart)).toEqual([[55, 43, 70, 58]]);
    const after = idMap(chart, 1);
    // The survivor keeps its identity but moves to index 0.
    expect(after.map((e) => e.index)).toEqual([0]);
    expect(after[0]!.id).toBe(before[1]!.id);

    const reloaded = chartsOf(IWorkDocument.open(document.save()).store)[0]!;
    expect(reloaded.rowCount).toBe(1);
    expect(chart.removeSeries(9)).toBe(false);
  });

  it("shifts per-series styles down when a series is removed", () => {
    // The pie chart has real per-series style overrides, indexed by
    // position. Removing series 1 must move every later override down, or
    // the styling lands on the wrong slice.
    const { chart } = firstChart(PIE);
    const before = sparse(chart, 19);
    expect(before.length).toBeGreaterThan(2);
    const survivingIds = before.filter((e) => e.index !== 1).map((e) => e.ref);

    expect(chart.removeSeries(1)).toBe(true);
    const after = sparse(chart, 19);
    expect(after.length).toBe(before.length - 1);
    expect(after.map((e) => e.index)).toEqual(after.map((_, i) => i));
    // Same style objects, in the same order, now one position lower.
    expect(after.map((e) => e.ref)).toEqual(survivingIds);
    // `count` tracks the entries, as it does in every array examined.
    expect(sparseCount(chart, 19)).toBe(after.length);
  });

  it("removes a category from every series", () => {
    const { document, chart } = firstChart(CHART);
    expect(chart.removeCategory(1)).toBe(true);
    expect(chart.columnNames()).toEqual(["April", "June", "July"]);
    expect(numbers(chart)).toEqual([
      [17, 53, 96],
      [55, 70, 58],
    ]);
    expect(idMap(chart, 2).map((e) => e.index)).toEqual([0, 1, 2]);
    expect(chart.removeCategory(9)).toBe(false);

    const reloaded = chartsOf(IWorkDocument.open(document.save()).store)[0]!;
    expect(reloaded.columnCount).toBe(3);
  });

  it("clears the placeholder-data flag once real data is written", () => {
    // A chart still marked as holding Apple's default data gets its numbers
    // replaced wholesale the first time the app touches it.
    const { document, chart } = firstChart(PIE);
    expect(chart.hasDefaultData).toBe(true);
    chart.setValue(0, 0, n(42));
    expect(chart.hasDefaultData).toBe(false);

    const reloaded = chartsOf(IWorkDocument.open(document.save()).store)[0]!;
    expect(reloaded.hasDefaultData).toBe(false);
  });

  it("does not dirty anything when only reading", () => {
    // Whole-document round-trip fidelity is covered in documents.test.ts;
    // what matters here is that the chart accessors are pure, since a
    // reader that marks its object dirty silently rewrites it on save.
    const { chart } = firstChart(CHART);
    chart.data();
    chart.series();
    chart.rowNames();
    chart.columnNames();
    void chart.chartType;
    void chart.hasDefaultData;
    void chart.seriesDirection;
    void chart.rowCount;
    void chart.columnCount;
    expect(chart.object.isDirty).toBe(false);
  });

  it("dirties the chart's object when data changes", () => {
    const { chart } = firstChart(CHART);
    chart.setValue(0, 0, n(1));
    expect(chart.object.isDirty).toBe(true);
  });
});

/** Id-map entries for rows (field 1) or columns (field 2). */
function idMap(chart: ChartModel, field: number): { id: string; index: number }[] {
  const grid = chart.object.message.getMessage(10000)!.getMessage(7)!;
  return (grid.getMessage(4)?.getMessages(field) ?? []).map((entry) => ({
    id: entry.getString(1) ?? "",
    index: entry.getUint(2) ?? 0,
  }));
}

function sparse(chart: ChartModel, field: number): { index: number; ref: bigint }[] {
  const array = chart.object.message.getMessage(10000)!.getMessage(field);
  return (array?.getMessages(2) ?? []).map((entry) => ({
    index: entry.getUint(1) ?? 0,
    ref: entry.getMessage(2)?.getVarint(1) ?? 0n,
  }));
}

function sparseCount(chart: ChartModel, field: number): number {
  return chart.object.message.getMessage(10000)!.getMessage(field)?.getUint(1) ?? 0;
}
