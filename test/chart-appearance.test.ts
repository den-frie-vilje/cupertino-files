/**
 * Chart appearance — the TSCH style archives.
 *
 * The load-bearing test here is the copy-on-write one. Series style
 * archives live in the document stylesheet and templates hand the *same*
 * archive to several charts: in a borrowed document one archive was
 * referenced by ten charts, and nine of the eighteen present by more than
 * one. Setting a colour through the obvious route would recolour all of
 * them, and nothing in the resulting file would look wrong — the archive it
 * wrote is perfectly well-formed, it just belongs to more charts than the
 * caller meant.
 *
 * So `setSeriesFill` clones a shared archive before writing, repoints this
 * chart's slot at the clone, and fixes the reference declaration. The tests
 * below pin all three, plus the case that must *not* clone: an archive
 * already private to one chart is edited in place, or every recolour would
 * leak a new archive.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "./harness.ts";
import { IWorkDocument } from "../src/tsa/document.ts";
import { CHART_TYPE_NAMES, CHART_TYPE_IDS, chartsOf } from "../src/tsch/charts.ts";
import { ChartSeriesStyle } from "../src/tsch/appearance.ts";
import type { Fill } from "../src/tsd/style.ts";

const FIXTURES = new URL("../fixtures/", import.meta.url);
const bytes = (name: string) => new Uint8Array(readFileSync(new URL(name, FIXTURES)));

/** A Numbers pie chart whose six series styles are private to it. */
const CHARTED = "tika-testNumbers2013.numbers";
/** A Pages chart that keeps no private series styles at all. */
const UNSTYLED = "draftjs-v2.3-comments.pages";

const load = (name: string) => IWorkDocument.open(bytes(name));
const firstChart = (name: string) => {
  const doc = load(name);
  const chart = chartsOf(doc.store)[0];
  if (!chart) throw new Error(`${name} has no chart`);
  return { doc, chart };
};

const RED: Fill = { kind: "color", color: { r: 1, g: 0, b: 0, space: "srgb" } };
const rgb = (fill: Fill | undefined): string =>
  fill?.kind === "color"
    ? [fill.color.r, fill.color.g, fill.color.b].map((c) => Math.round(c * 255)).join(",")
    : String(fill?.kind);

describe("chart type enum", () => {
  it("names every value the shipped proto declares", () => {
    // The table used to stop at 21 while the enum runs to 27, which is why
    // two real charts read back as "type 22" and "type 25". Parsing the
    // proto rather than restating it means the next extension is caught by
    // this test rather than by a document.
    const proto = readFileSync(
      new URL("../proto/current/TSCHArchives_Common.proto", import.meta.url),
      "utf8",
    );
    const block = /enum ChartType \{([^}]*)\}/.exec(proto);
    expect(block !== null).toBe(true);
    const declared = [...block![1]!.matchAll(/(\w+)\s*=\s*(\d+);/g)].map(([, , id]) => Number(id));
    expect(declared.length > 0).toBe(true);
    const missing = declared.filter((id) => CHART_TYPE_NAMES[id] === undefined);
    expect(`missing: ${missing.join(",")}`).toBe("missing: ");
  });

  it("round-trips names to ids", () => {
    expect(CHART_TYPE_IDS.get("donut2D")).toBe(25);
    expect(CHART_TYPE_IDS.get("bubble2D")).toBe(22);
    expect(CHART_TYPE_NAMES[25]).toBe("donut2D");
  });
});

describe("chart type writing", () => {
  it("sets the type by name and reads it back after a save", () => {
    const { doc, chart } = firstChart(CHARTED);
    expect(chart.chartType).toBe("pie2D");
    chart.setChartType("donut2D");

    const after = chartsOf(IWorkDocument.open(doc.save()).store)[0]!;
    expect(after.chartType).toBe("donut2D");
    expect(after.chartTypeId).toBe(25);
  });

  it("accepts a raw enum value, for types this library has not named", () => {
    const { doc, chart } = firstChart(CHARTED);
    chart.setChartType(27);
    expect(chartsOf(IWorkDocument.open(doc.save()).store)[0]!.chartType).toBe("radar2D");
  });

  it("refuses a name it does not know rather than writing a guess", () => {
    const { chart } = firstChart(CHARTED);
    let message = "";
    try {
      chart.setChartType("waterfall2D");
    } catch (error) {
      message = (error as Error).message;
    }
    expect(message.includes("unknown chart type")).toBe(true);
    // The type is untouched, not half-written.
    expect(chart.chartType).toBe("pie2D");
  });
});

describe("reading series styles", () => {
  it("reads a fill per series from the style archives", () => {
    const { chart } = firstChart(CHARTED);
    const styles = chart.seriesStyles();
    expect(styles.length).toBe(6);
    // Distinct palette slots, in series order.
    expect(styles.map((s) => s.index).join(",")).toBe("0,1,2,3,4,5");
    const colours = styles.map((s) => rgb(s.fill()));
    expect(colours[0]).toBe("129,150,112");
    expect(new Set(colours).size > 1).toBe(true);
  });

  it("reports no private styles for a chart that inherits from its preset", () => {
    const { chart } = firstChart(UNSTYLED);
    expect(chart.seriesStyles().length).toBe(0);
    expect(chart.seriesStyle(0)).toBe(undefined);
  });

  it("refuses to colour a series that has no style archive to write into", () => {
    const { chart } = firstChart(UNSTYLED);
    let message = "";
    try {
      chart.setSeriesFill(0, RED);
    } catch (error) {
      message = (error as Error).message;
    }
    expect(message.includes("inherits")).toBe(true);
  });
});

describe("writing series fills", () => {
  it("edits in place when the archive belongs to this chart alone", () => {
    // The opposite failure to the sharing one: cloning unconditionally
    // would leak an archive on every recolour.
    const { doc, chart } = firstChart(CHARTED);
    const before = chart.seriesStyle(0)!.id;
    expect(doc.store.referrers(before).filter((id) => id !== chart.id).length).toBe(0);

    const written = chart.setSeriesFill(0, RED);
    expect(written.id).toBe(before);

    const after = chartsOf(IWorkDocument.open(doc.save()).store)[0]!;
    expect(rgb(after.seriesStyle(0)!.fill())).toBe("255,0,0");
    expect(after.seriesStyle(0)!.id).toBe(before);
  });

  it("writes the colour to every geometry, so the type can change later", () => {
    // A series carries a separate fill per geometry precisely so switching
    // a column chart to a pie keeps its colours. Writing only the one the
    // current type reads would strand the others on the old palette.
    const { doc, chart } = firstChart(CHARTED);
    chart.setSeriesFill(0, RED);
    const style = chartsOf(IWorkDocument.open(doc.save()).store)[0]!.seriesStyle(0)!;
    const fills = style.fills();
    for (const geometry of ["area", "bar", "column", "mixedArea", "mixedColumn", "pie"]) {
      expect(`${geometry}: ${rgb(fills[geometry])}`).toBe(`${geometry}: 255,0,0`);
    }
  });

  it("clones a shared archive instead of recolouring every chart using it", () => {
    const { doc, chart } = firstChart(CHARTED);
    const shared = chart.seriesStyle(0)!.id;
    const originalColour = rgb(chart.seriesStyle(0)!.fill());

    // Make the archive shared the way a template does — by having a second
    // object declare it. `referrers` reads exactly those declarations, so
    // this is the real trigger rather than a stand-in for it.
    const other = [...doc.store.allObjects()].find(
      ({ obj }) => obj.identifier !== chart.id && obj.identifier !== shared,
    )!.obj;
    other.setObjectReferences([...other.getObjectReferences(), shared]);
    expect(doc.store.referrers(shared).filter((id) => id !== chart.id).length).toBe(1);

    const written = chart.setSeriesFill(0, RED);
    expect(written.id === shared).toBe(false);

    const reloaded = IWorkDocument.open(doc.save());
    const after = chartsOf(reloaded.store)[0]!;
    // This chart moved to the clone and is red.
    expect(after.seriesStyle(0)!.id).toBe(written.id);
    expect(rgb(after.seriesStyle(0)!.fill())).toBe("255,0,0");

    // And the archive the other referrer points at still holds the colour
    // it had — which is the entire point of copying on write, and the one
    // thing a caller could not check for themselves.
    const original = reloaded.store.resolve(shared);
    expect(`original survives: ${original !== undefined}`).toBe("original survives: true");
    expect(
      rgb(new ChartSeriesStyle(reloaded.store, original!, 0).fill()),
    ).toBe(originalColour);
    expect(originalColour === "255,0,0").toBe(false);
  });

  it("declares the clone, and stops declaring what it no longer points at", () => {
    const { doc, chart } = firstChart(CHARTED);
    const shared = chart.seriesStyle(0)!.id;
    const other = [...doc.store.allObjects()].find(
      ({ obj }) => obj.identifier !== chart.id && obj.identifier !== shared,
    )!.obj;
    other.setObjectReferences([...other.getObjectReferences(), shared]);

    const written = chart.setSeriesFill(0, RED);
    const after = chartsOf(IWorkDocument.open(doc.save()).store)[0]!;
    const declared = after.object.getObjectReferences();
    expect(`declares clone: ${declared.includes(written.id)}`).toBe("declares clone: true");
    expect(`still declares old: ${declared.includes(shared)}`).toBe("still declares old: false");
  });
});

describe("series opacity", () => {
  it("refuses a value outside 0..1 rather than storing it", () => {
    const { chart } = firstChart(CHARTED);
    let message = "";
    try {
      chart.seriesStyle(0)!.setOpacity(1.5);
    } catch (error) {
      message = (error as Error).message;
    }
    expect(message.includes("between 0 and 1")).toBe(true);
  });

  it("round-trips a value it does accept", () => {
    const { doc, chart } = firstChart(CHARTED);
    chart.seriesStyle(0)!.setOpacity(0.5);
    const after = chartsOf(IWorkDocument.open(doc.save()).store)[0]!;
    expect(after.seriesStyle(0)!.opacity).toBe(0.5);
  });
});
