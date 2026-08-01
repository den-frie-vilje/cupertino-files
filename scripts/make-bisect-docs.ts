#!/usr/bin/env node
/**
 * One document per authoring feature, so "Numbers says it's damaged" can be
 * turned into "*this* is what Numbers rejects".
 *
 *   node scripts/make-bisect-docs.ts [outDir]
 *
 * `npm run verify:doc` writes everything into one file, which is the right
 * shape for confirming a suite of features works and the wrong shape for
 * finding out why one does not. This writes a ladder instead: each rung
 * makes exactly one kind of change to the same untouched fixture, so the
 * first rung that fails names the culprit with no further narrowing.
 *
 * Rung 0 is the control. It loads the fixture and saves it with **no edits
 * at all**, so if Numbers rejects that one, the fault is in the container
 * or the package layer and nothing above it matters. Every later rung
 * changes one thing more than the one before.
 *
 * "No edits" means every *archive* comes back identical, which is the
 * identity that matters. The container bytes do not: an IWA payload
 * re-compresses to different-but-equivalent Snappy output, and the zip
 * writer sets the UTF-8 filename flag where Apple leaves it clear. A
 * resaved document is never a byte-for-byte copy of its input, and no
 * conclusion should be drawn from that.
 *
 * Open them in order and stop at the first failure. Report that name.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { NumbersDocument } from "../src/numbers/document.ts";
import { chartsOf } from "../src/tsch/charts.ts";

const TEMPLATE = new URL("../fixtures/numbers-parser-v26.0-categories.numbers", import.meta.url);
/** A rung needing something the main template has not got: here, a chart. */
const CHART_TEMPLATE = new URL("../fixtures/tika-testNumbers2013.numbers", import.meta.url);

/** Each rung: a name, and what it does to a freshly loaded fixture. */
const RUNGS: {
  name: string;
  note: string;
  build: (doc: NumbersDocument) => void;
  /** Defaults to {@link TEMPLATE}. */
  template?: URL;
}[] = [
  {
    name: "00-untouched",
    note: "loaded and saved with no edits; every archive is identical to the fixture's",
    build: () => {},
  },
  {
    name: "01-one-cell",
    note: "one text cell written",
    build: (doc) => doc.tables()[0]!.setCell(1, 0, "edited"),
  },
  {
    name: "02-cell-types",
    note: "text, number, boolean and date cells",
    build: (doc) => {
      const table = doc.tables()[0]!;
      table.setCell(1, 0, "text");
      table.setCell(2, 0, 1234.5);
      table.setCell(3, 0, true);
      table.setCell(4, 0, new Date(Date.UTC(2026, 0, 15)));
    },
  },
  {
    name: "03-formula-literal",
    note: "a formula with no references: =1+2*3",
    build: (doc) => doc.tables()[0]!.setFormula(5, 1, "=1+2*3", { value: 7 }),
  },
  {
    name: "04-formula-reference",
    note: "a formula referencing another cell",
    build: (doc) => {
      const table = doc.tables()[0]!;
      table.setCell(5, 1, 21);
      table.setFormula(5, 2, "=B6*2", { value: 42 });
    },
  },
  {
    name: "05-formula-range",
    note: "a formula over a range: =SUM(B7:D7)",
    build: (doc) => {
      const table = doc.tables()[0]!;
      table.setCell(6, 1, 1);
      table.setCell(6, 2, 2);
      table.setCell(6, 3, 3);
      table.setFormula(6, 4, "=SUM(B7:D7)", { value: 6 });
    },
  },
  {
    name: "06-merge",
    note: "three cells merged; the node is byte-identical to one Apple wrote",
    build: (doc) => {
      const table = doc.tables()[0]!;
      table.setCell(8, 1, "merged across B, C and D");
      table.mergeCells(8, 1, 1, 3);
    },
  },
  {
    name: "07-checkbox",
    note: "a checkbox — the control table exists but is empty in every fixture",
    build: (doc) => doc.tables()[0]!.setCellControl(1, 0, { widget: "checkbox", value: true }),
  },
  {
    name: "08-slider-stepper",
    note: "a slider and a stepper, which is also the slider/stepper enum test",
    build: (doc) => {
      const table = doc.tables()[0]!;
      table.setCellControl(1, 0, {
        widget: "slider",
        minimum: 1,
        maximum: 50,
        increment: 0.1,
        value: 12.3,
      });
      table.setCellControl(2, 0, {
        widget: "stepper",
        minimum: 0,
        maximum: 10,
        increment: 1,
        value: 4,
      });
    },
  },
  {
    name: "09-conditional-rule",
    note: "one conditional format, filling matches red; C should differ from B",
    build: (doc) => {
      const table = doc.tables()[0]!;
      table.setCell(1, 0, -10);
      table.setConditionalRules(1, 0, [
        { operator: "<", value: 0, cell: { fill: { kind: "color", color: { r: 1, g: 0.2, b: 0.2, space: "srgb" } } } },
      ]);
    },
  },
  {
    name: "10-blank-from",
    note: "blankFrom only, no edits — this one removes ten tables from the template",
    build: () => {},
  },
  {
    name: "11-regroup",
    note: "a categorised row moved to another group, and the group tree rebuilt to match",
    build: (doc) => {
      const table = doc.tables().find((t) => t.name === "Categories");
      if (!table) throw new Error("template has no Categories table");
      const categories = table.activeCategories();
      if (!categories) throw new Error("Categories table is not grouped");
      const column = categories.groupColumns()[0]?.column;
      if (column === undefined) throw new Error("grouping column does not resolve");
      const groups = categories.groups();
      const from = groups[0]!;
      const to = groups.find((g) => g.label !== from.label)!;
      table.setCell(from.rows[0]!, column, to.label);
      table.regroupCategories();
    },
  },
  {
    name: "12-chart-colour",
    note: "one chart series recoloured red; the only rung on the chart fixture",
    template: CHART_TEMPLATE,
    build: (doc) => {
      const chart = chartsOf(doc.store)[0];
      if (!chart) throw new Error("chart template has no chart");
      chart.setSeriesFill(0, { kind: "color", color: { r: 1, g: 0, b: 0, space: "srgb" } });
    },
  },
  {
    // Widget-per-rung, so "the controls document fails" narrows to one
    // widget rather than four. 07 and 08 cover checkbox and slider+stepper;
    // these two isolate the rest.
    name: "13-star-rating",
    note: "a star rating alone — the only widget whose format code rests on one document",
    build: (doc) => doc.tables()[0]!.setCellControl(1, 0, { widget: "starRating", value: 3 }),
  },
  {
    name: "14-stepper-only",
    note: "a stepper alone, separating it from the slider it shares a rung with",
    build: (doc) =>
      doc.tables()[0]!.setCellControl(1, 0, {
        widget: "stepper",
        minimum: 0,
        maximum: 10,
        increment: 1,
        value: 4,
      }),
  },
  {
    name: "15-all-four-widgets",
    note: "checkbox, star rating, slider and stepper in one table",
    build: (doc) => {
      const table = doc.tables()[0]!;
      table.setCellControl(1, 0, { widget: "checkbox", value: true });
      table.setCellControl(2, 0, { widget: "starRating", value: 3 });
      table.setCellControl(3, 0, { widget: "slider", minimum: 1, maximum: 50, increment: 0.1, value: 12.3 });
      table.setCellControl(4, 0, { widget: "stepper", minimum: 0, maximum: 10, increment: 1, value: 4 });
    },
  },
  {
    name: "16-popup-menu-text",
    note: "a three-choice text menu — the one widget never seen working",
    build: (doc) => {
      const table = doc.tables()[0]!;
      table.setCell(0, 0, "Pick a fruit");
      table.setCellControl(1, 0, {
        widget: "popupMenu",
        items: ["Apple", "Pear", "Quince"],
        value: "Pear",
      });
    },
  },
  {
    name: "17-popup-menu-numeric",
    note: "a numeric menu, which takes a number format where a text one takes text",
    build: (doc) => {
      const table = doc.tables()[0]!;
      table.setCell(0, 0, "Pick a size");
      table.setCellControl(1, 0, { widget: "popupMenu", items: [10, 20, 50], value: 20 });
    },
  },
  // 18-20 are one experiment, not three features. A plain three-item menu
  // shows only its last two in Numbers, so slot 0 of the model is not a
  // choice; these write the three candidate meanings for it and exactly one
  // should offer all three fruits.
  {
    name: "18-menu-start-flag-off",
    note: "hypothesis: chooser_control_start_w_first consumes the first item",
    build: (doc) => {
      const table = doc.tables()[0]!;
      table.setCell(0, 0, "Expect Apple, Pear, Quince");
      table.setCellControl(1, 0, {
        widget: "popupMenu",
        items: ["Apple", "Pear", "Quince"],
        value: "Pear",
        startsWithFirstItem: false,
      });
    },
  },
  {
    name: "19-menu-leading-nil",
    note: "hypothesis: slot 0 is the blank option a menu can start on",
    build: (doc) => {
      const table = doc.tables()[0]!;
      table.setCell(0, 0, "Expect Apple, Pear, Quince");
      table.setCellControl(1, 0, {
        widget: "popupMenu",
        items: ["Apple", "Pear", "Quince"],
        value: "Pear",
        leading: "nil",
      });
    },
  },
  {
    name: "20-menu-leading-selection",
    note: "hypothesis: slot 0 holds the current selection and choices follow",
    build: (doc) => {
      const table = doc.tables()[0]!;
      table.setCell(0, 0, "Expect Apple, Pear, Quince");
      table.setCellControl(1, 0, {
        widget: "popupMenu",
        items: ["Apple", "Pear", "Quince"],
        value: "Pear",
        leading: { value: "Pear" },
      });
    },
  },
];

function main(argv: string[]): number {
  const outDir = (argv[0] ?? ".").replace(/\/$/, "");
  const cache = new Map<string, Uint8Array>();
  const templateBytes = (url: URL): Uint8Array => {
    const key = url.href;
    let bytes = cache.get(key);
    if (!bytes) {
      bytes = new Uint8Array(readFileSync(url));
      cache.set(key, bytes);
    }
    return bytes;
  };

  for (const rung of RUNGS) {
    const bytes = templateBytes(rung.template ?? TEMPLATE);
    const doc =
      rung.name === "10-blank-from"
        ? NumbersDocument.blankFrom(bytes, { tableName: "Blank" })
        : NumbersDocument.load(bytes);
    rung.build(doc);
    const path = `${outDir}/${rung.name}.numbers`;
    writeFileSync(path, doc.save());
    console.log(`${rung.name.padEnd(22)} ${rung.note}`);
  }

  console.log("");
  console.log("Open these in order and stop at the first one Numbers refuses.");
  console.log("00-untouched failing means the container layer, not any feature.");
  console.log("Everything from 01 up changes exactly one thing more than the rung below.");
  return 0;
}

process.exitCode = main(process.argv.slice(2));
