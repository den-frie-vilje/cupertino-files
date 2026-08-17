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
import {
  CellRecordExpandedFields,
  CellRecordTileFields,
  ExpandedEdgesFields,
  FORMULA_OWNER_DEPENDENCIES,
  FormulaOwnerFields,
  OwnerKind,
  TiledDependenciesFields,
} from "../src/tsce/owners.ts";

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

  it("writes all six comparisons, every code observed", () => {
    // A rule stored under a wrong code is one the condition editor shows
    // as a different condition while the formula states the truth — which
    // is why only observed codes are writable, and why this loop covers
    // exactly the observed set.
    for (const operator of ["=", "<>", ">", ">=", "<", "<="] as const) {
      const doc = load();
      const table = doc.tables()[0]!;
      table.setConditionalRules(1, 0, [{ operator, value: 7, cell: RED }]);
      const after = NumbersDocument.load(doc.save()).tables()[0]!;
      expect(`${operator}: ${after.conditionalRules(1, 0)[0]?.predicate?.operator}`).toBe(
        `${operator}: ${operator}`,
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

/**
 * A rule is a formula, and the engine only evaluates formulas its
 * dependency ledger lists. A cell whose record is missing shows the rule
 * in the inspector and never draws its fill: `demo07-rules-returned` is a
 * document written that way, opened on a Mac, and its rules sat inert
 * until cells were deleted and re-typed — at which point the app
 * registered exactly those cells and their rules began to evaluate.
 */
describe("the engine's dependency ledger for rules", () => {
  /** Registered (row, column) pairs under a document's kind-3 owners, with shape checks. */
  function registrations(doc: NumbersDocument): Map<string, { edgeRow: number; edgeColumn: number; edgeOwner: number }> {
    const out = new Map<string, { edgeRow: number; edgeColumn: number; edgeOwner: number }>();
    for (const { obj } of doc.store.allObjects()) {
      if (obj.type !== FORMULA_OWNER_DEPENDENCIES) continue;
      if (obj.message.getUint(FormulaOwnerFields.OWNER_KIND) !== OwnerKind.CONDITIONAL_STYLE) {
        continue;
      }
      const tiled = obj.message.getMessage(FormulaOwnerFields.TILED_CELL_DEPENDENCIES);
      for (const ref of tiled?.getMessages(TiledDependenciesFields.TILES) ?? []) {
        const tile = doc.store.resolve(ref)!;
        const begin = tile.message.getUint(CellRecordTileFields.TILE_COLUMN_BEGIN)!;
        expect(begin % 32).toBe(0);
        for (const record of tile.message.getMessages(CellRecordTileFields.CELL_RECORDS)) {
          const row = record.getUint(CellRecordExpandedFields.ROW)!;
          const column = record.getUint(CellRecordExpandedFields.COLUMN)!;
          expect(column >= begin && column < begin + 32).toBe(true);
          const edges = record.getMessage(CellRecordExpandedFields.EXPANDED_EDGES)!;
          out.set(`${row},${column}`, {
            edgeRow: edges.getUint(ExpandedEdgesFields.EDGE_WITH_OWNER_ROWS)!,
            edgeColumn: edges.getUint(ExpandedEdgesFields.EDGE_WITH_OWNER_COLUMNS)!,
            edgeOwner: edges.getUint(ExpandedEdgesFields.INTERNAL_OWNER_ID_FOR_EDGE)!,
          });
        }
      }
    }
    return out;
  }

  /** Every rule-keyed (row, column) across a document's tables. */
  function keyedCells(doc: NumbersDocument): Set<string> {
    const out = new Set<string>();
    for (const table of doc.tables()) {
      for (let row = 0; row < table.rowCount; row++) {
        for (let column = 0; column < table.columnCount; column++) {
          if (table.conditionalStyleKey(row, column) !== undefined) out.add(`${row},${column}`);
        }
      }
    }
    return out;
  }

  it("registers every covered cell in the Mac-authored rules fixture", () => {
    const doc = NumbersDocument.load(bytes("olekristensen-v26.3-mac-conditional-rules.numbers"));
    const registered = registrations(doc);
    const keyed = keyedCells(doc);
    expect(registered.size).toBe(30);
    for (const cell of keyed) expect(registered.has(cell)).toBe(true);
    // Every edge names the very cell the rule styles, in the table's own
    // kind-1 owner (internal id 8 in this document).
    for (const [cell, edge] of registered) {
      expect(cell).toBe(`${edge.edgeRow},${edge.edgeColumn}`);
      expect(edge.edgeOwner).toBe(8);
    }
  });

  it("matches the app's own after-the-fact registration in the returned demo", () => {
    // The reviewer re-typed five of the seven rule cells; the app
    // registered exactly those five. Partial ledgers are app-real —
    // registration happens on commit, not on load.
    const doc = NumbersDocument.load(bytes("olekristensen-v26.3-demo07-rules-returned.numbers"));
    const registered = registrations(doc);
    const keyed = keyedCells(doc);
    expect(registered.size).toBe(5);
    for (const cell of registered.keys()) expect(keyed.has(cell)).toBe(true);
    for (const [cell, edge] of registered) {
      expect(cell).toBe(`${edge.edgeRow},${edge.edgeColumn}`);
    }
  });

  it("shows automatic alignment as the absence of the cell's text style", () => {
    // The round-three file: the reviewer set three number cells to
    // automatic alignment in the inspector, and the app's write removed
    // their per-cell text style ids — while an untouched library cell
    // one screen up still carries the template's do-nothing style. The
    // same file holds the reviewer's app-authored rule on those rows.
    const doc = NumbersDocument.load(bytes("olekristensen-v26.3-demo07-rules-round3.numbers"));
    const table = doc.tables()[0]!;
    for (const row of [22, 23, 24]) {
      expect(`r${row} style: ${table.textStyleId(row, 2)}`).toBe(`r${row} style: undefined`);
      expect(table.conditionalStyleKey(row, 2) !== undefined).toBe(true);
    }
    expect(table.textStyleId(3, 2) !== undefined).toBe(true);
  });

  it("registers a cloned table's rules through its minted owner family", () => {
    // Before the mint, a clone had no kind-3 owner to hang records on,
    // so rules on cloned tables silently skipped the engine ledger.
    const doc = NumbersDocument.blank();
    const sheet = doc.sheets()[0]!;
    const copy = doc.addTable(sheet.id, { name: "CloneRules", withContent: false });
    if (copy.rowCount < 4) copy.insertRows(copy.rowCount, 4 - copy.rowCount);
    copy.setCell(1, 1, 9);
    copy.setConditionalRules(1, 1, [
      { operator: ">", value: 5, cell: { fill: { kind: "color", color: { r: 0, g: 1, b: 0 } } } },
    ]);
    const after = NumbersDocument.load(doc.save());
    const registered = registrations(after);
    expect(registered.has("1,1")).toBe(true);
  });

  it("keeps library-written registrations through the app's own save", () => {
    // The round-two file: seven cells registered by this library, rules
    // drawing on open, and the app's save preserving all seven records —
    // the end-to-end confirmation that written registration is what the
    // engine evaluates from.
    const doc = NumbersDocument.load(bytes("olekristensen-v26.3-demo07-rules-round2.numbers"));
    const registered = registrations(doc);
    const keyed = keyedCells(doc);
    expect(registered.size).toBe(7);
    expect([...registered.keys()].sort().join(" ")).toBe([...keyed].sort().join(" "));
    for (const [cell, edge] of registered) {
      expect(cell).toBe(`${edge.edgeRow},${edge.edgeColumn}`);
    }
  });

  it("registers what it writes, the shape the corpus is unanimous on", () => {
    const doc = NumbersDocument.blank();
    const table = doc.tables()[0]!;
    if (table.rowCount < 8) table.insertRows(table.rowCount, 8 - table.rowCount);
    table.setConditionalRules(2, 1, [{ operator: ">", value: 5, cell: RED }], { rowCount: 3 });

    const after = NumbersDocument.load(doc.save());
    const registered = registrations(after);
    const keyed = keyedCells(after);
    expect([...registered.keys()].sort().join(" ")).toBe([...keyed].sort().join(" "));
    expect(registered.size).toBe(3);
    for (const [cell, edge] of registered) {
      expect(cell).toBe(`${edge.edgeRow},${edge.edgeColumn}`);
    }
  });

  it("splits tiles at column 32, where the xlsx-lineage document splits its own", () => {
    const doc = NumbersDocument.blank();
    const table = doc.tables()[0]!;
    if (table.columnCount < 36) table.insertColumns(table.columnCount, 36 - table.columnCount);
    table.setConditionalRules(1, 30, [{ operator: "=", value: 1, cell: RED }], {
      columnCount: 5,
    });
    const registered = registrations(NumbersDocument.load(doc.save()));
    expect([...registered.keys()].sort().join(" ")).toBe(
      ["1,30", "1,31", "1,32", "1,33", "1,34"].sort().join(" "),
    );
  });

  it("drops the record with the key, and re-applies without duplicating", () => {
    const doc = NumbersDocument.blank();
    const table = doc.tables()[0]!;
    const key = table.setConditionalRules(1, 1, [{ operator: "<", value: 0, cell: RED }]);
    table.setConditionalStyleKey(1, 1, key);
    expect(registrations(doc).size).toBe(1);
    table.setConditionalStyleKey(1, 1, undefined);
    expect(registrations(doc).size).toBe(0);
  });
});
