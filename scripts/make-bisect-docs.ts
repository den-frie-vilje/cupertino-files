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
 * at all** — the bytes come back identical, so if Numbers rejects that one,
 * the fault is in the container or the package layer and nothing above it
 * matters. Every later rung changes one thing more than the one before.
 *
 * Open them in order and stop at the first failure. Report that name.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { NumbersDocument } from "../src/numbers/document.ts";

const TEMPLATE = new URL("../fixtures/numbers-parser-v26.0-categories.numbers", import.meta.url);

/** Each rung: a name, and what it does to a freshly loaded fixture. */
const RUNGS: { name: string; note: string; build: (doc: NumbersDocument) => void }[] = [
  {
    name: "00-untouched",
    note: "loaded and saved with no edits; bytes are identical to the fixture",
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
    note: "one conditional format; the archive is byte-identical to Apple's",
    build: (doc) => {
      const table = doc.tables()[0]!;
      table.setCell(1, 0, -10);
      table.setConditionalRules(1, 0, [{ operator: "<", value: 0 }]);
    },
  },
  {
    name: "10-blank-from",
    note: "blankFrom only, no edits — this one removes ten tables from the template",
    build: () => {},
  },
];

function main(argv: string[]): number {
  const outDir = (argv[0] ?? ".").replace(/\/$/, "");
  const template = new Uint8Array(readFileSync(TEMPLATE));

  for (const rung of RUNGS) {
    const doc =
      rung.name === "10-blank-from"
        ? NumbersDocument.blankFrom(template, { tableName: "Blank" })
        : NumbersDocument.load(template);
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
