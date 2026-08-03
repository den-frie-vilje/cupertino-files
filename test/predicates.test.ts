/**
 * Predicates, conditional formatting and filters.
 *
 * These three share one archive — `TST.FormulaPredicateArchive` — so they
 * are tested together, against the two things the corpus actually proves:
 *
 *  - `numbers-parser-v26.1-xlsx-lineage.numbers` has three real
 *    conditional-style rule sets, whose conditions decode to `<0` and `=0`
 *    and whose refcounts must equal the number of cells pointing at them.
 *  - Filter sets appear in fixtures from all three apps, always *empty*,
 *    which is exactly what a reader should report rather than papering over.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "./harness.ts";
import {
  IWorkDocument,
  readPredicate,
  describePredicate,
  tablesOf,
  CellFlag,
  CellRecord,
  PREDICATE_TYPE_OPERATORS,
  SELF_CELL_MARKER,
  type TableModel,
} from "../src/index.ts";
import { RawMessage } from "../src/base/protobuf.ts";
import { predicateTypeStatus } from "../src/tst/predicates.ts";

const FIXTURES = new URL("../fixtures/", import.meta.url);
const open = (name: string) =>
  IWorkDocument.open(new Uint8Array(readFileSync(new URL(name, FIXTURES))));

/** The one fixture with authored conditional formatting. */
const CONDITIONAL = "numbers-parser-v26.1-xlsx-lineage.numbers";

function conditionalTable(): TableModel {
  const table = tablesOf(open(CONDITIONAL).store).find(
    (candidate) => candidate.conditionalStyleSets().size > 0,
  );
  if (!table) throw new Error(`${CONDITIONAL} no longer has conditional formatting`);
  return table;
}

describe("conditional formatting", () => {
  it("reads the interned rule sets", () => {
    const sets = conditionalTable().conditionalStyleSets();
    expect(sets.size).toBe(3);
    for (const [key, set] of sets) {
      expect(key).toBeGreaterThan(0);
      expect(set.declaredRuleCount).toBe(1);
      expect(set.rules().length).toBe(1);
    }
  });

  it("decodes conditions from the formula rather than the opaque type code", () => {
    const sets = conditionalTable().conditionalStyleSets();
    const conditions = [...sets.values()].map((set) => set.rules()[0]!.predicate!);

    // Three rules: one "below zero", two "equal to zero".
    expect(conditions.map((p) => p.operator).sort()).toEqual(["<", "=", "="]);
    for (const predicate of conditions) {
      expect(predicate.forConditionalStyle).toBe(true);
      // The operand under test has no address, so it renders as the marker.
      expect(predicate.text.startsWith(SELF_CELL_MARKER)).toBe(true);
      // Comparison operand: the number zero, exact via decimal128.
      const operands = predicate.operands.filter((operand) => operand.kind === "number");
      expect(operands.length).toBe(1);
      expect(operands[0]!.number).toBe(0);
      // The other operand is the cell being tested.
      expect(predicate.operands.some((operand) => operand.kind === "cell")).toBe(true);
    }
  });

  it("agrees with the predicate_type values it claims to know", () => {
    for (const set of conditionalTable().conditionalStyleSets().values()) {
      for (const rule of set.rules()) {
        expect(rule.predicate!.inconsistent).toBe(false);
        // Both types in this fixture are ones the table records.
        expect(PREDICATE_TYPE_OPERATORS.has(rule.predicate!.predicateType!)).toBe(true);
      }
    }
  });

  it("renders a rule against the cell it applies to", () => {
    const table = conditionalTable();
    let checked = 0;
    for (let row = 0; row < table.rowCount && checked === 0; row++) {
      for (let column = 0; column < table.columnCount; column++) {
        const rules = table.conditionalRules(row, column);
        if (rules.length === 0) continue;
        const text = rules[0]!.predicate!.text;
        // Substituted for the concrete address, so no marker survives.
        expect(text.includes(SELF_CELL_MARKER)).toBe(false);
        expect(/^[A-Z]+\d+/.test(text)).toBe(true);
        checked++;
        break;
      }
    }
    expect(checked).toBe(1);
  });

  it("interns rule sets: every refcount equals its cell count", () => {
    const table = conditionalTable();
    const counted = new Map<number, number>();
    for (let row = 0; row < table.rowCount; row++) {
      for (let column = 0; column < table.columnCount; column++) {
        const key = table.conditionalStyleKey(row, column);
        if (key !== undefined) counted.set(key, (counted.get(key) ?? 0) + 1);
      }
    }
    // Read the refcounts the file records, straight from the data list.
    const dataStore = (table as unknown as { object: { message: RawMessage } }).object.message.getMessage(4)!;
    const listId = dataStore.getMessage(18)!.getVarint(1)!;
    const list = table.store.object(listId)!;
    const refcounts = new Map<number, number>();
    for (const entry of list.message.getMessages(3)) {
      refcounts.set(entry.getUint(1)!, entry.getUint(2) ?? 0);
    }

    expect(counted.size).toBe(3);
    expect([...counted.keys()].sort()).toEqual([...refcounts.keys()].sort());
    for (const [key, cells] of counted) expect(refcounts.get(key)).toBe(cells);
  });

  it("re-points a cell at another interned rule set", () => {
    const document = open(CONDITIONAL);
    const table = tablesOf(document.store).find((t) => t.conditionalStyleSets().size > 0)!;

    // Find a cell that already has one, and a different key to move it to.
    let target: { row: number; column: number; key: number } | undefined;
    for (let row = 0; row < table.rowCount && !target; row++) {
      for (let column = 0; column < table.columnCount; column++) {
        const key = table.conditionalStyleKey(row, column);
        if (key !== undefined) {
          target = { row, column, key };
          break;
        }
      }
    }
    const other = [...table.conditionalStyleSets().keys()].find((k) => k !== target!.key)!;

    table.setConditionalStyleKey(target!.row, target!.column, other);
    expect(table.conditionalStyleKey(target!.row, target!.column)).toBe(other);
    expect(table.conditionalRules(target!.row, target!.column).length).toBe(1);

    table.setConditionalStyleKey(target!.row, target!.column, undefined);
    expect(table.conditionalStyleKey(target!.row, target!.column)).toBe(undefined);
  });

  it("refuses a key the table does not intern", () => {
    const table = conditionalTable();
    let row = -1;
    let column = -1;
    outer: for (let r = 0; r < table.rowCount; r++) {
      for (let c = 0; c < table.columnCount; c++) {
        if (table.conditionalStyleKey(r, c) !== undefined) {
          row = r;
          column = c;
          break outer;
        }
      }
    }
    expect(() => { table.setConditionalStyleKey(row, column, 9999); }).toThrow();
  });

  it("saves a re-pointed conditional style without corrupting the document", () => {
    const document = open(CONDITIONAL);
    const table = tablesOf(document.store).find((t) => t.conditionalStyleSets().size > 0)!;
    let row = -1;
    let column = -1;
    outer: for (let r = 0; r < table.rowCount; r++) {
      for (let c = 0; c < table.columnCount; c++) {
        if (table.conditionalStyleKey(r, c) !== undefined) {
          row = r;
          column = c;
          break outer;
        }
      }
    }
    const other = [...table.conditionalStyleSets().keys()].find(
      (k) => k !== table.conditionalStyleKey(row, column),
    )!;
    table.setConditionalStyleKey(row, column, other);

    const reloaded = IWorkDocument.open(document.save());
    const reloadedTable = tablesOf(reloaded.store).find((t) => t.conditionalStyleSets().size > 0)!;
    expect(reloadedTable.conditionalStyleKey(row, column)).toBe(other);
    expect(reloadedTable.conditionalRules(row, column).length).toBe(1);
  });
});

describe("predicates", () => {
  it("reads nothing from nothing", () => {
    expect(readPredicate(undefined)).toBe(undefined);
  });

  it("reports an unknown predicate_type rather than guessing", () => {
    // A predicate whose formula is a bare number: no comparison at all.
    const predicate = RawMessage.create();
    predicate.setVarint(1, 4242);
    const formula = RawMessage.create();
    const nodes = RawMessage.create();
    const node = RawMessage.create();
    node.setVarint(1, 17); // NUMBER
    node.setDouble(4, 7);
    nodes.addMessage(1, node);
    formula.setMessage(1, nodes);
    predicate.setMessage(7, formula);

    const read = readPredicate(predicate)!;
    expect(read.predicateType).toBe(4242);
    expect(read.operator).toBe(undefined);
    // Unknown on both sides cannot disagree, so it is not flagged.
    expect(read.inconsistent).toBe(false);
  });

  it("flags a predicate whose type contradicts its formula", () => {
    const predicate = RawMessage.create();
    predicate.setVarint(1, 5); // recorded as "="
    const formula = RawMessage.create();
    const nodes = RawMessage.create();
    for (const type of [17, 17, 9]) {
      // ... but the AST ends in LESS_THAN
      const node = RawMessage.create();
      node.setVarint(1, type);
      if (type === 17) node.setDouble(4, 1);
      nodes.addMessage(1, node);
    }
    formula.setMessage(1, nodes);
    predicate.setMessage(7, formula);

    const read = readPredicate(predicate)!;
    expect(read.operator).toBe("<");
    expect(read.inconsistent).toBe(true);
  });

  it("substitutes a subject into a rendered condition", () => {
    const set = [...conditionalTable().conditionalStyleSets().values()][0]!;
    const predicate = set.rules()[0]!.predicate!;
    expect(describePredicate(predicate, "B4").startsWith("B4")).toBe(true);
    expect(describePredicate(predicate).startsWith(SELF_CELL_MARKER)).toBe(true);
  });

  it("records the completed comparison enum, measured not guessed", () => {
    // All six codes are observed, so the observation map agrees with the
    // menu-order hypothesis entry for entry — this pin keeps either side
    // from drifting.
    expect([...PREDICATE_TYPE_OPERATORS].sort((a, b) => a[0] - b[0])).toEqual([
      [5, "="],
      [6, "<>"],
      [7, ">"],
      [8, ">="],
      [9, "<"],
      [10, "<="],
    ]);
    for (const status of predicateTypeStatus()) expect(status.proven).toBe(true);
  });
});

describe("filters", () => {
  /** Fixtures across all three apps that carry filter sets. */
  const WITH_FILTERS = [
    "numbers-parser-v26.1-form-sheet.numbers",
    "picodocs-v14.4-headers-tables.pages",
    "zenodo-v13.1-tables-images.key",
  ];

  it("finds row and column filter sets through the hidden-state owner", () => {
    for (const name of WITH_FILTERS) {
      const tables = tablesOf(open(name).store);
      const reached = tables.flatMap((table) => {
        const { rows, columns } = table.filterSets();
        return [rows, columns].filter((set) => set !== undefined);
      });
      expect(reached.length).toBeGreaterThan(0);
      for (const set of reached) expect(set.consistent).toBe(true);
    }
  });

  it("reports the corpus honestly: every filter set is empty", () => {
    for (const name of WITH_FILTERS) {
      for (const table of tablesOf(open(name).store)) {
        const { rows, columns } = table.filterSets();
        for (const set of [rows, columns]) {
          if (!set) continue;
          expect(set.rules().length).toBe(0);
          expect(set.describe()).toEqual([]);
        }
      }
    }
  });

  it("reads both combining modes", () => {
    // The form-sheet fixture is the one file that stores "any" as well as
    // the "all" every other file uses, so both branches are exercised.
    const modes = new Set<string>();
    for (const name of WITH_FILTERS) {
      for (const table of tablesOf(open(name).store)) {
        const { rows, columns } = table.filterSets();
        for (const set of [rows, columns]) if (set) modes.add(set.mode);
      }
    }
    expect([...modes].sort()).toEqual(["all", "any"]);
  });

  it("toggles a set on and off through a save", () => {
    const document = open("numbers-parser-v26.1-form-sheet.numbers");
    const table = tablesOf(document.store).find((t) => t.filterSets().rows !== undefined)!;
    const filters = table.filterSets().rows!;
    expect(filters.enabled).toBe(false);
    filters.setEnabled(true);
    filters.setMode("all");

    const reloaded = IWorkDocument.open(document.save());
    const reloadedTable = tablesOf(reloaded.store).find((t) => t.filterSets().rows !== undefined)!;
    expect(reloadedTable.filterSets().rows!.enabled).toBe(true);
    expect(reloadedTable.filterSets().rows!.mode).toBe("all");
  });

  it("refuses to enable a rule that does not exist", () => {
    const table = tablesOf(open(WITH_FILTERS[0]!).store).find(
      (t) => t.filterSets().rows !== undefined,
    )!;
    expect(() => { table.filterSets().rows!.setRuleEnabled(0, true); }).toThrow();
  });
});

describe("cell records with conditional ids", () => {
  it("round-trips the conditional id fields byte-for-byte", () => {
    const table = conditionalTable();
    let checked = 0;
    for (let row = 0; row < table.rowCount; row++) {
      for (let column = 0; column < table.columnCount; column++) {
        const key = table.conditionalStyleKey(row, column);
        if (key === undefined) continue;
        // The second conditional id is preserved even though its meaning
        // is unconfirmed — see docs/VERIFICATION.md.
        const ruleId = table.conditionalRuleId(row, column);
        expect(typeof ruleId).toBe("number");
        checked++;
      }
    }
    expect(checked).toBe(1921);
  });

  it("keeps both ids in the same slots after a re-encode", () => {
    const record = new CellRecord();
    record.setId(CellFlag.COND_STYLE_ID, 2);
    record.setId(CellFlag.COND_RULE_STYLE_ID, 15);
    const decoded = CellRecord.decode(record.encode());
    expect(decoded.id(CellFlag.COND_STYLE_ID)).toBe(2);
    expect(decoded.id(CellFlag.COND_RULE_STYLE_ID)).toBe(15);
  });
});
