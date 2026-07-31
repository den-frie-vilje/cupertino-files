#!/usr/bin/env node
/**
 * Build one document exercising everything this library *authors*, so a Mac
 * can answer the question no offline test can.
 *
 *   node scripts/make-verification-doc.ts [outDir]
 *
 * ## What this is for
 *
 * The suite proves self-consistency — we read back what we wrote — and for
 * merges and conditional rules it proves more, because those come out
 * byte-identical to what Apple wrote for the same thing. None of that is
 * the app's opinion. Every authoring feature here has been checked against
 * Apple's bytes or against our own reader, and **not one has ever been
 * opened in Numbers**.
 *
 * So this writes a single spreadsheet containing one of each, laid out with
 * a label beside every case, and the answer is simply: does it open, and
 * does each row look like its label says?
 *
 * A failure here is worth more than a pass. "Numbers repaired the file" or
 * one row showing the wrong thing localises the problem immediately,
 * because each feature sits in its own row.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { NumbersDocument } from "../src/numbers/document.ts";

const TEMPLATE = new URL("../fixtures/numbers-parser-v26.0-categories.numbers", import.meta.url);

function main(argv: string[]): number {
  const outDir = argv[0] ?? ".";
  const doc = NumbersDocument.blankFrom(new Uint8Array(readFileSync(TEMPLATE)), {
    sheetName: "Verification",
    tableName: "Authored",
  });
  const table = doc.tables(doc.sheets()[0]!.id)[0]!;

  // Column A says what each row is meant to show; column B and beyond are
  // the thing itself. Anyone can check this without knowing the format.
  const rows: [label: string, build: (row: number) => void][] = [
    [
      "plain values: text, number, bool, date",
      (row) => {
        table.setCell(row, 1, "text");
        table.setCell(row, 2, 1234.5);
        table.setCell(row, 3, true);
        table.setCell(row, 4, new Date(Date.UTC(2026, 0, 15)));
      },
    ],
    [
      "formula: =1+2*3 should show 7",
      (row) => table.setFormula(row, 1, "=1+2*3", { value: 7 }),
    ],
    [
      "formula with a relative reference: =B2*2",
      (row) => {
        table.setCell(row, 1, 21);
        table.setFormula(row, 2, "=B" + (row + 1) + "*2", { value: 42 });
      },
    ],
    [
      "formula over a range: =SUM(B5:D5) should show 6",
      (row) => {
        table.setCell(row, 1, 1);
        table.setCell(row, 2, 2);
        table.setCell(row, 3, 3);
        table.setFormula(row, 4, `=SUM(B${row + 1}:D${row + 1})`, { value: 6 });
      },
    ],
    [
      "checkbox (ticked) and star rating (3 of 5)",
      (row) => {
        table.setCellControl(row, 1, { widget: "checkbox", value: true });
        table.setCellControl(row, 2, { widget: "starRating", value: 3 });
      },
    ],
    [
      "slider 1..50 step 0.1, stepper 0..10 step 1",
      (row) => {
        table.setCellControl(row, 1, {
          widget: "slider",
          minimum: 1,
          maximum: 50,
          increment: 0.1,
          value: 12.3,
        });
        table.setCellControl(row, 2, {
          widget: "stepper",
          minimum: 0,
          maximum: 10,
          increment: 1,
          value: 4,
        });
      },
    ],
    [
      "conditional format: negatives styled, so C should differ from B",
      (row) => {
        table.setCell(row, 1, 10);
        table.setCell(row, 2, -10);
        table.setConditionalRules({ row, column: 1, columnCount: 2 }, [
          { operator: "<", value: 0 },
        ]);
      },
    ],
    [
      "merged B..D on the row below this one",
      (row) => {
        table.setCell(row + 1, 1, "one merged cell across B, C and D");
        table.mergeCells(row + 1, 1, 1, 3);
      },
    ],
  ];

  let row = 0;
  for (const [label, build] of rows) {
    table.setCell(row, 0, label);
    build(row);
    row += 2; // a blank row between cases, so a failure is easy to point at
  }

  const path = `${outDir.replace(/\/$/, "")}/iwork-files-verification.numbers`;
  writeFileSync(path, doc.save());
  console.log(`wrote ${path}`);
  console.log("");
  console.log("Open it in Numbers and check each row against its label in column A.");
  console.log("What matters most, in order:");
  console.log("  1. does it open at all, without a 'repaired' or 'damaged' warning?");
  console.log("  2. do the formulas recompute when you edit a value they depend on?");
  console.log("  3. do the widgets draw as the label says — slider vs stepper especially?");
  console.log("  4. is the conditional format applied to the negative number and not the positive?");
  return 0;
}

process.exitCode = main(process.argv.slice(2));
