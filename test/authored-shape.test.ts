/**
 * What does a *real* one have that ours does not?
 *
 * An authored archive can be wrong in three distinct ways, and different
 * checks catch them:
 *
 *  - a conditional rule missing two `required` fields — malformed protobuf,
 *    caught by `required-fields.test.ts` reading the schema;
 *  - a cell style missing `super` — same class, same checker;
 *  - a cell control missing its **format** — perfectly well-formed, all
 *    required fields present, and completely invisible in Numbers.
 *
 * Nothing static catches the third, because nothing about it is wrong: the
 * cell is a valid boolean cell that happens to carry a control spec. It is
 * only wrong by *omission*, relative to what Apple writes for the same
 * feature. Reading it back cannot show that, and neither can comparing the
 * bytes of a structure we already decided to emit — a byte comparison
 * confirms the parts you thought to write.
 *
 * So this asks the other question. For each authoring feature, it records
 * the flags a **real Apple cell** carries for that feature, and asserts our
 * output carries at least those. Absence is the thing being tested.
 *
 * ## About the numbers below
 *
 * They are measurements from borrowed documents, kept here as constants
 * because the files themselves are not redistributable — the same
 * discipline as `controls.test.ts`. Each entry names where it came from so
 * it can be re-measured. `min` is deliberately the *minimal* real example
 * rather than the richest: a checkbox in `test-format-save.numbers` has the
 * boolean format and no number format, which is what proves the number
 * format is optional and the boolean one is not.
 */
import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "./harness.ts";
import { IWorkDocument, NumbersDocument } from "../src/index.ts";
import { CellFlag } from "../src/tst/cellrecord.ts";
import { tablesOf, type TableModel } from "../src/tst/tables.ts";

const FIXTURES = new URL("../fixtures/", import.meta.url);
const TEMPLATE = new Uint8Array(
  readFileSync(new URL("numbers-parser-v26.0-categories.numbers", FIXTURES)),
);
const load = () => NumbersDocument.load(TEMPLATE);

type FlagName = keyof typeof CellFlag;

interface Shape {
  feature: string;
  /** Where the measurement came from, so it can be checked again. */
  source: string;
  /** `CellRecord.type` of the real cell. */
  cellType: number;
  /** Flags the real cell carries. Ours must carry all of them. */
  needs: FlagName[];
  build: (table: TableModel) => void;
  at: [row: number, column: number];
}

const SHAPES: Shape[] = [
  {
    feature: "checkbox",
    // The minimal real checkbox: control + boolean format, no number
    // format. That asymmetry is the whole finding.
    source: "test-format-save.numbers (0,0) — flags 0x41402",
    cellType: 6,
    needs: ["DOUBLE", "CONTROL_ID", "BOOL_FORMAT_ID"],
    build: (t) => t.setCellControl(1, 0, { widget: "checkbox", value: true }),
    at: [1, 0],
  },
  {
    feature: "star rating",
    source: "test-actions.numbers (1,0) and issue-10.numbers (14,1) — num format 267",
    cellType: 2,
    needs: ["CONTROL_ID", "NUM_FORMAT_ID"],
    build: (t) => t.setCellControl(1, 0, { widget: "starRating", value: 3 }),
    at: [1, 0],
  },
  {
    feature: "slider",
    source: "test-actions.numbers (2,0) — num format 256",
    cellType: 2,
    needs: ["CONTROL_ID", "NUM_FORMAT_ID"],
    build: (t) =>
      t.setCellControl(1, 0, { widget: "slider", minimum: 1, maximum: 50, increment: 0.1, value: 12.3 }),
    at: [1, 0],
  },
  {
    feature: "stepper",
    source: "test-actions.numbers (3,0) — num format 256",
    cellType: 2,
    needs: ["CONTROL_ID", "NUM_FORMAT_ID"],
    build: (t) =>
      t.setCellControl(1, 0, { widget: "stepper", minimum: 0, maximum: 10, increment: 1, value: 4 }),
    at: [1, 0],
  },
  {
    feature: "pop-up menu",
    // Two real popup cells, both carrying the text format: a populated one
    // (STRING_ID|CONTROL_ID|SUGGEST_ID|TEXT_FORMAT_ID) and an empty one
    // (CONTROL_ID|TEXT_FORMAT_ID). The empty one is why SUGGEST_ID is not
    // in `needs` — it is not universal, and the format is.
    source: "borrowed widget-demo document, populated and empty menu cells",
    cellType: 3,
    needs: ["CONTROL_ID", "TEXT_FORMAT_ID"],
    build: (t) => t.setCellControl(1, 0, { widget: "popupMenu", items: ["A", "B"], value: "A" }),
    at: [1, 0],
  },
  {
    feature: "conditional rule",
    source: "numbers-parser-v26.1-xlsx-lineage.numbers — a styled cell points at a rule set",
    cellType: 2,
    needs: ["COND_STYLE_ID"],
    build: (t) =>
      t.setConditionalRules(1, 0, [
        { operator: "<", value: 0, cell: { fill: { kind: "color", color: { r: 1, g: 0, b: 0 } } } },
      ]),
    at: [1, 0],
  },
];

/** Names of the flags a record actually carries. */
function flagsOn(table: TableModel, row: number, column: number): Set<FlagName> {
  // recordAt is internal; reaching for it is the point of this test.
  const record = (table as unknown as { recordAt: (r: number, c: number) => unknown }).recordAt(
    row,
    column,
  ) as { flags?: number } | undefined;
  const bits = record?.flags ?? 0;
  const out = new Set<FlagName>();
  for (const [name, bit] of Object.entries(CellFlag) as [FlagName, number][]) {
    if ((bits & bit) !== 0) out.add(name);
  }
  return out;
}

describe("an authored cell has what a real one has", () => {
  for (const shape of SHAPES) {
    it(`${shape.feature}: carries every flag Apple's does`, () => {
      const doc = load();
      const table = doc.tables()[0]!;
      // A conditional rule needs a value under it to be meaningful.
      if (shape.feature === "conditional rule") table.setCell(1, 0, -10);
      shape.build(table);

      const after = NumbersDocument.load(doc.save()).tables()[0]!;
      const present = flagsOn(after, ...shape.at);
      const missing = shape.needs.filter((name) => !present.has(name));

      expect(`${shape.feature} missing: ${missing.join(", ")}`).toBe(`${shape.feature} missing: `);
    });
  }

  it("checks something for every widget the library can write", () => {
    // The guard that matters: a widget added without an entry here gets no
    // shape check at all, and that is how the control bug survived.
    const covered = new Set(SHAPES.map((s) => s.feature));
    for (const widget of ["checkbox", "star rating", "slider", "stepper", "pop-up menu"]) {
      expect(`${widget} covered: ${covered.has(widget)}`).toBe(`${widget} covered: true`);
    }
  });

  it("would fail if a control lost its format again", () => {
    // Pins the regression directly rather than only through the table
    // above: strip the format and the shape check must notice.
    const doc = load();
    const table = doc.tables()[0]!;
    table.setCellControl(1, 0, { widget: "checkbox", value: true });
    expect(flagsOn(table, 1, 0).has("BOOL_FORMAT_ID")).toBe(true);
    expect(table.cellFormat(1, 0)?.kind).toBe("checkbox");

    // A plain boolean carries the *boolean* format (every app-typed bool
    // in the corpus does), so presence alone cannot distinguish the two —
    // the archive can: the widget draws only through the checkbox format,
    // and a control cell left on the plain boolean one is the
    // widget-never-draws fault again.
    const plain = load();
    plain.tables()[0]!.setCell(1, 0, true);
    expect(plain.tables()[0]!.cellFormat(1, 0)?.kind).toBe("boolean");
  });

  it("gives every plain value the format its type always carries", () => {
    // The fourth of the omission class: every plain value cell in the
    // corpus states its type's format — none missing across numbers,
    // texts, dates and booleans — and a number without one rendered
    // left-aligned in Numbers until manually re-entered, while the
    // inspector insisted its alignment was automatic.
    const doc = load();
    const table = doc.tables()[0]!;
    table.setCell(1, 0, 42);
    table.setCell(1, 1, "text");
    table.setCell(1, 2, true);
    table.setCell(1, 3, { type: "date", value: new Date("2026-08-14T00:00:00Z") });

    const after = NumbersDocument.load(doc.save()).tables()[0]!;
    expect(after.cellFormat(1, 0)?.kind).toBe("number");
    expect(after.cellFormat(1, 1)?.kind).toBe("text");
    expect(after.cellFormat(1, 2)?.kind).toBe("boolean");
    expect(after.cellFormat(1, 3)?.kind).toBe("date");
    // The number's is the app's automatic default, not an invention.
    const format = after.cellFormat(1, 0);
    expect(format?.kind === "number" && format.decimals).toBe("auto");
    // A caller's explicit choice survives a value rewrite.
    table.setCellFormat(1, 0, { kind: "number", decimals: 2 });
    table.setCell(1, 0, 43);
    const kept = table.cellFormat(1, 0);
    expect(kept?.kind === "number" && kept.decimals).toBe(2);
  });

  it("finds no plain value cell without its type's format, in any fixture", () => {
    // The corpus law the stamp exists to satisfy, held as a ratchet:
    // a writer path that forgets the stamp reintroduces cells no app
    // ever writes, and this sweep names the file.
    const names = readdirSync(FIXTURES).filter((n) => /\.(pages|numbers|key)$/.test(n));
    const FORMAT_FLAG_FOR: Record<number, number> = {
      2: CellFlag.NUM_FORMAT_ID,
      3: CellFlag.TEXT_FORMAT_ID,
      5: CellFlag.DATE_FORMAT_ID,
      6: CellFlag.BOOL_FORMAT_ID,
      9: CellFlag.TEXT_FORMAT_ID,
    };
    let checked = 0;
    for (const name of names) {
      let doc: IWorkDocument;
      try {
        doc = IWorkDocument.open(new Uint8Array(readFileSync(new URL(name, FIXTURES))));
      } catch {
        continue;
      }
      for (const table of tablesOf(doc.store)) {
        if (table.storageGeneration !== "v5") continue;
        for (let r = 0; r < table.rowCount; r++) {
          for (let c = 0; c < table.columnCount; c++) {
            const record = (
              table as unknown as {
                recordAt(r: number, c: number): { flags: number; encode(): Uint8Array } | undefined;
              }
            ).recordAt(r, c);
            if (!record) continue;
            const flag = FORMAT_FLAG_FOR[record.encode()[1]!];
            if (flag === undefined) continue;
            if (record.flags & (CellFlag.FORMULA_ID | CellFlag.CONTROL_ID)) continue;
            checked++;
            expect(`${name} ${r},${c} formatted: ${(record.flags & flag) !== 0}`).toBe(
              `${name} ${r},${c} formatted: true`,
            );
          }
        }
      }
    }
    expect(checked).toBeGreaterThan(1500);
  });
});
