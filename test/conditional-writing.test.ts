/**
 * Authoring conditional-formatting rules.
 *
 * A predicate is stored twice over — as a TSCE formula the engine
 * evaluates, and as a template the condition editor round-trips — plus a
 * second copy of the whole rule in the pre-2016 encoding. All three must
 * agree, which is why the builder derives them from one condition rather
 * than taking them separately.
 *
 * The validation is the strong kind. The corpus contains a rule Apple
 * wrote — `THIS_CELL < 0` — so a rule built for the same condition can be
 * compared **byte for byte**. It matches exactly, and getting there took
 * four corrections that reading-back would never have surfaced:
 *
 *  - the pre-pivot list holds rules directly at field 2, while the modern
 *    list wraps them in a container at field 3. The asymmetry is Apple's.
 *  - a number node carries a decimal128 beside its double.
 *  - the predicate's cell reference wants a `TSP.UUID` (two uint64s) where
 *    the AST node wants a `CFUUIDArchive` (four uint32s) — same 128 bits.
 *  - `preserve_row`/`preserve_column` belong to the argument, not to the
 *    reference inside it.
 *
 * Every one of those reads back correctly when written wrongly.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "./harness.ts";
import { NumbersDocument } from "../src/index.ts";
import type { CellFormatting } from "../src/tst/styles.ts";

const FIXTURES = new URL("../fixtures/", import.meta.url);
const bytes = (name: string) => new Uint8Array(readFileSync(new URL(name, FIXTURES)));
/** The one corpus document with a conditional rule Apple wrote. */
const FIXTURE = "numbers-parser-v26.1-xlsx-lineage.numbers";

const load = () => NumbersDocument.load(bytes(FIXTURE));

/**
 * The formatting a rule applies, for tests about the *predicate*.
 *
 * Not decoration: `cell_style` and `text_style` are `required`, so a rule
 * has to format something to be a well-formed message at all.
 */
const RED: CellFormatting = { fill: { kind: "color", color: { r: 1, g: 0, b: 0, space: "srgb" } } };
const hex = (b: Uint8Array): string => [...b].map((x) => x.toString(16).padStart(2, "0")).join(" ");

/** Apple's own `THIS_CELL < 0` set, with the styles it points at. */
function applesSet(): { bytes: string; cellStyleId?: bigint; textStyleId?: bigint } {
  const doc = load();
  for (const table of doc.tables()) {
    for (const [, set] of table.conditionalStyleSets()) {
      const rule = set.rules()[0]!;
      return {
        bytes: hex(set.object.message.toBytes()),
        cellStyleId: rule.cellStyleId,
        textStyleId: rule.textStyleId,
      };
    }
  }
  throw new Error("fixture has no conditional style set");
}

describe("writing conditional rules", () => {
  it("builds a rule byte-identical to the one Apple wrote", () => {
    const apple = applesSet();
    const doc = load();
    const table = doc.tables()[0]!;
    const key = table.setConditionalRules(1, 0, [
      {
        operator: "<",
        value: 0,
        cellStyleId: apple.cellStyleId,
        textStyleId: apple.textStyleId,
      },
    ]);
    const ours = hex(table.conditionalStyleSets().get(key)!.object.message.toBytes());
    expect(ours).toBe(apple.bytes);
  });

  it("applies one set across a range, as the app does", () => {
    // A rule is authored once and pointed at by every cell it covers —
    // three sets cover 1921 cells in this document.
    const doc = load();
    const table = doc.tables()[0]!;
    const key = table.setConditionalRules(1, 0, [{ operator: "=", value: 42, cell: RED }], {
      rowCount: 3,
      columnCount: 2,
    });

    const after = NumbersDocument.load(doc.save()).tables()[0]!;
    for (let row = 1; row <= 3; row++) {
      for (let column = 0; column <= 1; column++) {
        expect(`${row},${column}: ${after.conditionalStyleKey(row, column)}`).toBe(
          `${row},${column}: ${key}`,
        );
      }
    }
  });

  it("renders the condition back against the cell it is asked about", () => {
    // The operand has no address — one rule covers a range — so it reads
    // as whichever cell the caller names.
    const doc = load();
    const table = doc.tables()[0]!;
    table.setConditionalRules(2, 1, [{ operator: "<=", value: -1.5, cell: RED }]);

    const after = NumbersDocument.load(doc.save()).tables()[0]!;
    const rules = after.conditionalRules(2, 1);
    expect(rules.length).toBe(1);
    expect(rules[0]!.predicate?.text).toBe("B3<=-1.5");
    expect(rules[0]!.predicate?.operator).toBe("<=");
  });

  it("writes each comparison whose code has been observed", () => {
    for (const operator of ["=", "<>", "<", "<="] as const) {
      const doc = load();
      const table = doc.tables()[0]!;
      table.setConditionalRules(1, 0, [{ operator, value: 7, cell: RED }]);
      const after = NumbersDocument.load(doc.save()).tables()[0]!;
      expect(`${operator}: ${after.conditionalRules(1, 0)[0]?.predicate?.operator}`).toBe(
        `${operator}: ${operator}`,
      );
    }
  });

  it("refuses a comparison whose code is only predicted", () => {
    // `>` and `>=` are predicted to be 7 and 8. A rule stored under a wrong
    // code is one the condition editor shows as a different condition while
    // the formula states the truth — very hard to notice, so it is refused.
    const table = load().tables()[0]!;
    for (const operator of [">", ">="] as const) {
      let message = "";
      try {
        table.setConditionalRules(1, 0, [{ operator, value: 0, cell: RED }]);
      } catch (error) {
        message = (error as Error).message;
      }
      expect(`${operator}: ${message.includes("no predicate_type is confirmed")}`).toBe(
        `${operator}: true`,
      );
    }
  });

  it("writes several rules into one set, in order", () => {
    const doc = load();
    const table = doc.tables()[0]!;
    table.setConditionalRules(1, 0, [
      { operator: "<", value: 0, cell: RED },
      { operator: "=", value: 0, cell: RED },
      { operator: "<>", value: 99, cell: RED },
    ]);
    const rules = NumbersDocument.load(doc.save()).tables()[0]!.conditionalRules(1, 0);
    expect(rules.map((r) => r.predicate?.operator)).toEqual(["<", "=", "<>"]);
  });

  it("refuses a rule that formats nothing, rather than writing a malformed message", () => {
    // TST.ConditionalStyleRule declares cell_style and text_style as
    // `required`. A rule without them is not a rule that formats less — it
    // is a message Numbers cannot parse, and it rejects the whole document.
    // This shipped once: the byte-identity test could not catch it, because
    // the only rule Apple wrote to compare against has both styles and
    // there is no such thing as an unstyled one to compare with.
    const table = load().tables()[0]!;
    let message = "";
    try {
      table.setConditionalRules(1, 0, [{ operator: "<", value: 0 }]);
    } catch (error) {
      message = (error as Error).message;
    }
    expect(message.includes("must format something")).toBe(true);
  });

  it("defaults the text style to the table's own, so text is left alone", () => {
    const doc = load();
    const table = doc.tables()[0]!;
    const expected = table.bandTextStyle("body")!.object.identifier;
    table.setConditionalRules(1, 0, [{ operator: "<", value: 0, cell: RED }]);

    const after = NumbersDocument.load(doc.save()).tables()[0]!;
    const rule = after.conditionalRules(1, 0)[0]!;
    expect(rule.textStyleId).toBe(expected);
    // And the cell style is a new archive carrying the fill we asked for.
    expect(rule.cellStyleId !== undefined).toBe(true);
    expect(rule.cellStyleId === expected).toBe(false);
  });

  it("refuses an empty rule set", () => {
    const table = load().tables()[0]!;
    let message = "";
    try {
      table.setConditionalRules(1, 0, []);
    } catch (error) {
      message = (error as Error).message;
    }
    expect(message).toContain("needs a rule");
  });
});
