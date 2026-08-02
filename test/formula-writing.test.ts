/**
 * Authoring formulas: infix text in, a working cell out.
 *
 * This became possible only once `AST_function_node_index` was known —
 * before the harvest, writing `SUM` meant writing an integer nobody had
 * measured. 271 functions are authorable now.
 *
 * The check that matters most here is the **round trip through a different
 * piece of code**: text is parsed and compiled by the writer, then read
 * back by the renderer, which shares no logic with it. Agreement between
 * two independent directions is much better evidence than either alone.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "./harness.ts";
import { NumbersDocument } from "../src/index.ts";
import { authorableFunctions, parseFormula } from "../src/tst/formula-builder.ts";

const FIXTURES = new URL("../fixtures/", import.meta.url);
const bytes = (name: string) => new Uint8Array(readFileSync(new URL(name, FIXTURES)));
const FIXTURE = "numbers-parser-v26.0-categories.numbers";

/** Write a formula at a cell, save, reopen, and render it back. */
function roundTrip(formula: string, row = 4, column = 1): string | undefined {
  const doc = NumbersDocument.load(bytes(FIXTURE));
  doc.tables()[0]!.setFormula(row, column, formula);
  const reread = NumbersDocument.load(doc.save());
  return reread.tables()[0]!.cellFormulaDetail(row, column)?.text;
}

describe("compiling formulas", () => {
  it("round-trips arithmetic, comparison and text operators", () => {
    // The renderer re-derives the text from the AST, so each of these is
    // agreement between two independent directions rather than a tautology.
    const cases: [input: string, expected: string][] = [
      ["=1+2", "=1+2"],
      ["=10-4", "=10-4"],
      ["=6*7", "=6*7"],
      ["=8/2", "=8/2"],
      ["=2^10", "=2^10"],
      ['="a"&"b"', '="a"&"b"'],
      ["=1=2", "=1=2"],
      ["=1<>2", "=1<>2"],
      ["=1<2", "=1<2"],
      ["=1<=2", "=1<=2"],
      ["=1>2", "=1>2"],
      ["=1>=2", "=1>=2"],
    ];
    for (const [input, expected] of cases) {
      expect(`${input} → ${roundTrip(input)}`).toBe(`${input} → ${expected}`);
    }
  });

  it("keeps precedence and parentheses", () => {
    expect(roundTrip("=1+2*3")).toBe("=1+2*3");
    expect(roundTrip("=(1+2)*3")).toBe("=(1+2)*3");
    expect(roundTrip("=2^3^2")).toBe("=2^3^2");
    expect(roundTrip("=1+2=3")).toBe("=1+2=3");
  });

  it("writes a reference as an offset, so it means the cell you named", () => {
    // The bug this guards is quiet: storing the *index* where an offset
    // belongs makes `=A1` written in B5 read back as `=B5`, a
    // self-reference that looks entirely plausible.
    expect(roundTrip("=A1", 4, 1)).toBe("=A1");
    expect(roundTrip("=A1*B1", 4, 1)).toBe("=A1*B1");
    expect(roundTrip("=A1", 2, 3)).toBe("=A1");
    // An anchored reference stays put and says so.
    expect(roundTrip("=$B$2")).toBe("=$B$2");
    expect(roundTrip("=$B2")).toBe("=$B2");
    expect(roundTrip("=B$2")).toBe("=B$2");
  });

  it("writes unary operators", () => {
    expect(roundTrip("=-A1")).toBe("=-A1");
    expect(roundTrip("=-5")).toBe("=-5");
    expect(roundTrip("=50%")).toBe("=50%");
  });

  it("writes function calls, including nested ones", () => {
    expect(roundTrip("=SUM(A1:A5)")).toBe("=SUM(A1:A5)"); // as typed — relative tract
    expect(roundTrip("=SUM($A$1:$A$5)")).toBe("=SUM($A$1:$A$5)"); // pinned stays pinned
    expect(roundTrip("=ABS(-3)")).toBe("=ABS(-3)");
    expect(roundTrip("=MAX(MIN(1,2),3)")).toBe("=MAX(MIN(1,2),3)");
    expect(roundTrip("=COUNT()")).toBe("=COUNT()");
  });

  it("writes strings, booleans and an omitted argument", () => {
    expect(roundTrip('="hello"')).toBe('="hello"');
    expect(roundTrip('="say ""hi"""')).toBe('="say ""hi"""');
    expect(roundTrip("=TRUE")).toBe("=TRUE");
    // DURATION(,,8,22,11,500) is in the corpus — the omitted arguments are
    // nodes, not absences, and rendering them as TRUE was a real bug once.
    expect(roundTrip("=DURATION(,,8,22,11,500)")).toBe("=DURATION(,,8,22,11,500)");
  });

  it("refuses a function it has no index for", () => {
    // Inventing an index produces a document that loads and computes
    // something else, which is the worst outcome available.
    let message = "";
    try {
      roundTrip("=NOTAFUNCTION(1)");
    } catch (error) {
      message = (error as Error).message;
    }
    expect(message).toContain("no index is known for the function");
  });

  it("reports where the text went wrong", () => {
    const rejected = (text: string): string => {
      try {
        parseFormula(text);
        return "accepted";
      } catch (error) {
        return (error as Error).message;
      }
    };
    expect(rejected("=1+")).toContain("expression expected");
    expect(rejected("=(1+2")).toContain("')' expected");
    expect(rejected('="unterminated')).toContain("unterminated string");
    expect(rejected("=1 2")).toContain("unexpected trailing input");
    // Every message names the position, because "syntax error" is useless
    // in a long argument list.
    expect(rejected("=1+")).toContain("position 2");
    // Not an error: a trailing comma is an omitted argument, which is legal
    // — DURATION(,,8,22,11,500) in the corpus is exactly that.
    expect(rejected("=SUM(1,)")).toBe("accepted");
  });

  it("knows the functions it says it knows", () => {
    const names = authorableFunctions();
    expect(names.length).toBe(271);
    expect(names.includes("SUM")).toBe(true);
    expect(names.includes("DURATION")).toBe(true);
    // Sorted, and free of duplicates — it is an inverted map, and a
    // duplicate name would mean two indexes claiming one function.
    expect([...new Set(names)].length).toBe(names.length);
    expect([...names].sort()).toEqual(names);
  });
});

describe("formulas on a cell", () => {
  it("caches a value alongside the formula when given one", () => {
    // Nothing here evaluates. The apps display the cached result until the
    // engine recalculates, so a formula written with no cache shows
    // whatever the cell held before.
    const doc = NumbersDocument.load(bytes(FIXTURE));
    const table = doc.tables()[0]!;
    table.setFormula(4, 1, "=1+2", { value: 3 });

    const after = NumbersDocument.load(doc.save()).tables()[0]!;
    expect(after.cellFormulaDetail(4, 1)?.text).toBe("=1+2");
    expect(after.cellText(4, 1)).toBe("3");
    const value = after.cellValue(4, 1);
    expect(value?.type === "empty" ? false : (value?.isFormula ?? false)).toBe(true);
  });

  it("clears a formula but keeps the value it cached", () => {
    const doc = NumbersDocument.load(bytes(FIXTURE));
    const table = doc.tables()[0]!;
    table.setFormula(4, 1, "=6*7", { value: 42 });
    expect(table.clearFormula(4, 1)).toBe(true);
    expect(table.clearFormula(4, 1)).toBe(false);

    const after = NumbersDocument.load(doc.save()).tables()[0]!;
    expect(after.cellFormulaDetail(4, 1)).toBe(undefined);
    expect(after.cellText(4, 1)).toBe("42");
  });

  it("leaves other cells' formulas alone", () => {
    const doc = NumbersDocument.load(bytes(FIXTURE));
    const index = doc.tables().findIndex((t) => t.formulas().length > 10);
    const table = doc.tables()[index]!;
    const before = table.formulas().length;
    // A cell with no formula of its own, in a table full of them.
    const free = table.formulas().map((f) => `${f.row},${f.column}`);
    let row = -1;
    let column = -1;
    outer: for (let r = 0; r < table.rowCount; r++) {
      for (let c = 0; c < table.columnCount; c++) {
        if (!free.includes(`${r},${c}`)) {
          row = r;
          column = c;
          break outer;
        }
      }
    }
    expect(row).toBeGreaterThan(-1);
    table.setFormula(row, column, "=1+1", { value: 2 });

    const after = NumbersDocument.load(doc.save()).tables()[index]!;
    expect(after.formulas().length).toBe(before + 1);
  });

  it("refuses coordinates outside the table", () => {
    const doc = NumbersDocument.load(bytes(FIXTURE));
    const table = doc.tables()[0]!;
    let message = "";
    try {
      table.setFormula(9999, 0, "=1");
    } catch (error) {
      message = (error as Error).message;
    }
    expect(message).toContain("outside the table");
  });
});
