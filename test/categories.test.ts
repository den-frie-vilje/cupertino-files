/**
 * Numbers categories — row grouping.
 *
 * The corpus is unusually good here: `numbers-parser-v26.0-categories.numbers`
 * carries eleven tables covering value grouping, nesting to four levels, and
 * every date bucketing the UI offers. That makes the central claim
 * checkable rather than merely plausible — a group says which rows it
 * contains, and the grouping column says what is in those rows, so the two
 * must agree for every group in every fixture.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "./harness.ts";
import { NumbersDocument } from "../src/index.ts";
import { refId } from "../src/tsp/schema.ts";
import { GroupByFields, GroupNodeFields } from "../src/tst/categories.ts";
import {
  ColumnRowUidMap,
  expandIndexSet,
  GroupingType,
  IWorkDocument,
  sameGroupValue,
  tablesOf,
  type TableModel,
} from "../src/index.ts";
import { RawMessage } from "../src/base/protobuf.ts";

const FIXTURES = new URL("../fixtures/", import.meta.url);
const open = (name: string) =>
  IWorkDocument.open(new Uint8Array(readFileSync(new URL(name, FIXTURES))));

const CATEGORIES = "numbers-parser-v26.0-categories.numbers";

function tableNamed(name: string): TableModel {
  const table = tablesOf(open(CATEGORIES).store).find((candidate) => candidate.name === name);
  if (!table) throw new Error(`${CATEGORIES} no longer has a table called ${name}`);
  return table;
}

/** Every fixture that carries at least one enabled category definition. */
function categorisedTables(): { file: string; table: TableModel }[] {
  const out: { file: string; table: TableModel }[] = [];
  for (const file of [CATEGORIES, "iwork-mcp-v14.5-earnings.numbers", "numbers-parser-v14.4-issue102.numbers"]) {
    for (const table of tablesOf(open(file).store)) {
      if (table.activeCategories()) out.push({ file, table });
    }
  }
  return out;
}

describe("categories", () => {
  it("resolves the grouped column back to its position", () => {
    const table = tableNamed("Categories");
    const [column] = table.activeCategories()!.groupColumns();
    expect(column!.column).toBe(1);
    expect(table.cellText(0, 1)).toBe("Category");
    expect(column!.groupingType).toBe(GroupingType.BY_VALUE);
    expect(column!.hasFunctor).toBe(false);
  });

  it("reads groups with their values and rows", () => {
    const groups = tableNamed("Categories").activeCategories()!.groups();
    expect(groups.length).toBe(3);
    expect(groups.map((group) => group.label).sort()).toEqual(["Animal", "Fruit", "Transport"]);
    for (const group of groups) {
      expect(group.level).toBe(0);
      expect(group.rows.length).toBe(10);
      expect(group.children.length).toBe(0);
    }
  });

  it("every group's rows really hold that group's value", () => {
    // The claim the whole model rests on, checked against cell contents in
    // every categorised table in the corpus.
    let checked = 0;
    for (const { file, table } of categorisedTables()) {
      const stale = table.staleCategoryGroups();
      expect(`${file}:${table.name} ${stale.length} mismatched groups`).toBe(
        `${file}:${table.name} 0 mismatched groups`,
      );
      checked += table.activeCategories()!.flatGroups().length;
    }
    expect(checked).toBeGreaterThan(100);
  });

  it("groups partition the data rows exactly once", () => {
    for (const { table } of categorisedTables()) {
      const definition = table.activeCategories()!;
      const groups = definition.groups();
      if (groups.length === 0) continue;
      const rows = groups.flatMap((group) => group.rows);
      // No row in two top-level groups…
      expect(new Set(rows).size).toBe(rows.length);
      // …and no row outside the table.
      for (const row of rows) expect(row < table.rowCount).toBe(true);
    }
  });

  it("nests to the depth the definition declares", () => {
    const definition = tableNamed("Maximal Nesting").activeCategories()!;
    expect(definition.groupColumns().length).toBe(4);
    const deepest = Math.max(...definition.flatGroups().map((group) => group.level));
    expect(deepest).toBe(3);

    // A parent's rows are its children's rows, together.
    for (const group of definition.flatGroups()) {
      if (group.children.length === 0) continue;
      const fromChildren = group.children.flatMap((child) => child.rows).sort((a, b) => a - b);
      expect(fromChildren).toEqual([...group.rows].sort((a, b) => a - b));
    }
  });

  it("reads non-string group values with their types", () => {
    const numbers = tableNamed("Number Categories").activeCategories()!.groups();
    expect(numbers.every((group) => typeof group.value === "number")).toBe(true);

    const nested = tableNamed("Nested Categories").activeCategories()!.groups();
    expect(nested.every((group) => typeof group.value === "boolean")).toBe(true);
    // Rendered for display without pretending to be the cell's own text.
    expect(nested.map((group) => group.label).sort()).toEqual(["false", "true"]);

    const dates = tableNamed("Date Year-Month").activeCategories()!.groups();
    expect(dates.every((group) => group.value instanceof Date)).toBe(true);
  });

  it("marks bucketed groupings and skips verifying them", () => {
    const definition = tableNamed("Date Year-Month").activeCategories()!;
    const [column] = definition.groupColumns();
    expect(column!.groupingType).toBe(GroupingType.BY_YEAR_MONTH);
    expect(column!.hasFunctor).toBe(true);
    // Verification needs the bucketing formula evaluated, so it declines.
    expect(definition.verify(() => "anything")).toEqual([]);
  });

  it("names every date bucketing, confirmed by the dates it produces", () => {
    // Each code is checked against the shape of its groups, not the
    // fixture's table names — the names only say where to look.
    const shapes: Record<string, (dates: Date[]) => boolean> = {
      // Year: every bucket is 1 January.
      "Date Categories": (d) => d.every((x) => x.getUTCMonth() === 0 && x.getUTCDate() === 1),
      // Year and month: every bucket is the 1st, and months vary.
      "Date Year-Month": (d) =>
        d.every((x) => x.getUTCDate() === 1) && new Set(d.map((x) => x.getUTCMonth())).size > 1,
      // Quarter: only the four quarter-start months.
      "Date Year-Quarter": (d) =>
        d.every((x) => x.getUTCDate() === 1 && [0, 3, 6, 9].includes(x.getUTCMonth())),
      // Week: every bucket lands on the same weekday. Nothing else can.
      "Date Year-Week": (d) => new Set(d.map((x) => x.getUTCDay())).size === 1,
      // Weekday: at most seven buckets, all inside one reference week.
      "Date Weekday": (d) =>
        d.length <= 7 && new Set(d.map((x) => x.getUTCFullYear())).size === 1,
    };
    const expected: Record<string, number> = {
      "Date Categories": GroupingType.BY_YEAR,
      "Date Year-Month": GroupingType.BY_YEAR_MONTH,
      "Date Year-Quarter": GroupingType.BY_YEAR_QUARTER,
      "Date Year-Week": GroupingType.BY_YEAR_WEEK,
      "Date Weekday": GroupingType.BY_WEEKDAY,
    };
    for (const [name, shapeHolds] of Object.entries(shapes)) {
      const definition = tableNamed(name).activeCategories()!;
      const columns = definition.groupColumns();
      const last = columns[columns.length - 1]!;
      const dates = definition
        .flatGroups()
        .filter((group) => group.level === columns.length - 1)
        .map((group) => group.value)
        .filter((value): value is Date => value instanceof Date);

      expect(`${name} n=${dates.length > 0}`).toBe(`${name} n=true`);
      expect(`${name} type=${last.groupingType}`).toBe(`${name} type=${expected[name]}`);
      expect(`${name} shape=${shapeHolds(dates)}`).toBe(`${name} shape=true`);
      expect(last.groupingName).not.toBe(undefined);
    }
  });

  it("agrees on bucketing between the type code and the formula", () => {
    // Two independent signals: a non-zero grouping type and the presence of
    // a bucketing functor. A file where they disagree is one to look at.
    for (const { table } of categorisedTables()) {
      for (const column of table.activeCategories()!.groupColumns()) {
        expect(column.hasFunctor).toBe(column.groupingType !== GroupingType.BY_VALUE);
      }
    }
  });

  it("detects a tree gone stale after an edit", () => {
    const document = open(CATEGORIES);
    const table = tablesOf(document.store).find((t) => t.name === "Categories")!;
    expect(table.staleCategoryGroups().length).toBe(0);

    // Move one row out of its group without regrouping.
    const [group] = table.activeCategories()!.groups();
    const row = group!.rows[0]!;
    table.setCell(row, 1, { type: "text", value: "Mineral" });

    const stale = table.staleCategoryGroups();
    expect(stale.length).toBe(1);
    expect(stale[0]!.rows).toEqual([row]);
  });

  it("reports a table with no categories as having none", () => {
    const table = tablesOf(open("numbers-parser-v26.1-date-formats.numbers").store)[0]!;
    expect(table.activeCategories()).toBe(undefined);
    expect(table.staleCategoryGroups()).toEqual([]);
  });

  it("keeps disabled definitions readable and separate from the live one", () => {
    // The categories fixture keeps an untouched table whose definition
    // exists but is switched off.
    const table = tableNamed("Uncategorized");
    const all = table.categories();
    expect(all.length).toBeGreaterThan(0);
    expect(all.some((definition) => definition.enabled)).toBe(false);
    expect(table.activeCategories()).toBe(undefined);
  });

  it("toggles grouping through a save", () => {
    const document = open(CATEGORIES);
    const table = tablesOf(document.store).find((t) => t.name === "Categories")!;
    table.activeCategories()!.setEnabled(false);

    const reloaded = IWorkDocument.open(document.save());
    const reloadedTable = tablesOf(reloaded.store).find((t) => t.name === "Categories")!;
    expect(reloadedTable.activeCategories()).toBe(undefined);
    expect(reloadedTable.categories().length).toBeGreaterThan(0);
    // The tree is still there, just not applied.
    expect(reloadedTable.categories()[0]!.groups().length).toBe(3);
  });
});

describe("row and column identities", () => {
  it("maps column uids to positions in both directions", () => {
    const table = tableNamed("Categories");
    const map = table.uidMap();
    expect(map.columnCount).toBe(table.columnCount);
    expect(map.rowCount).toBe(table.rowCount);
    for (let column = 0; column < table.columnCount; column++) {
      const uid = map.columnUid(column);
      expect(uid).not.toBe(undefined);
      expect(map.columnIndex(uid)).toBe(column);
    }
    for (let row = 0; row < table.rowCount; row++) {
      expect(map.rowIndex(map.rowUid(row))).toBe(row);
    }
  });

  it("does not assume identities are unique across a document", () => {
    // They are not. Tables duplicated from one another keep their source's
    // row and column UIDs, so a UID identifies a row *within* a table and
    // is not a document-wide key — which is why the map is per-table.
    const source = tableNamed("Uncategorized").uidMap();
    const copy = tableNamed("Categories").uidMap();
    expect(copy.rowIndex(source.rowUid(0))).toBe(0);
  });

  it("survives a table with no identity map", () => {
    const map = new ColumnRowUidMap(undefined);
    expect(map.columnCount).toBe(0);
    expect(map.columnIndex({ lower: 1n, upper: 2n })).toBe(undefined);
    expect(map.rowUid(0)).toBe(undefined);
  });
});

describe("index sets", () => {
  it("expands ranges and singletons", () => {
    const set = RawMessage.create();
    for (const [begin, end] of [[4, undefined], [8, 11], [30, 30]] as const) {
      const entry = RawMessage.create();
      entry.setVarint(1, begin);
      if (end !== undefined) entry.setVarint(2, end);
      set.addMessage(1, entry);
    }
    expect(expandIndexSet(set)).toEqual([4, 8, 9, 10, 11, 30]);
  });

  it("reads nothing from nothing", () => {
    expect(expandIndexSet(undefined)).toEqual([]);
  });
});

describe("group value comparison", () => {
  it("compares dates by instant, not identity", () => {
    expect(sameGroupValue(new Date(1000), new Date(1000))).toBe(true);
    expect(sameGroupValue(new Date(1000), new Date(2000))).toBe(false);
  });

  it("tolerates decimal128-to-double rounding", () => {
    expect(sameGroupValue(0.1 + 0.2, 0.3)).toBe(true);
    expect(sameGroupValue(0.3, 0.30001)).toBe(false);
  });

  it("does not conflate types", () => {
    expect(sameGroupValue(0, false)).toBe(false);
    expect(sameGroupValue("1", 1)).toBe(false);
    expect(sameGroupValue(undefined, "")).toBe(false);
  });
});

describe("defining a category", () => {
  it("groups a blank table's rows by a column, in the corpus shape", () => {
    const doc = NumbersDocument.blank();
    const table = doc.tables()[0]!;
    const values = ["Fruit", "Animal", "Fruit", "Transport", "Animal"];
    values.forEach((value, i) => {
      table.setCell(i + 1, 0, `row ${i + 1}`);
      table.setCell(i + 1, 1, value);
    });
    table.deleteRows(values.length + 1, table.rowCount - values.length - 1);
    const defined = table.addCategory(1);
    expect(defined.enabled).toBe(true);

    const reloaded = NumbersDocument.load(doc.save()).tables()[0]!;
    const category = reloaded.activeCategories()!;
    expect(category.groupColumns().map((c) => c.column)).toEqual([1]);
    const groups = category.groups();
    expect(groups.map((g) => g.value)).toEqual(["Animal", "Fruit", "Transport"]);
    expect(groups.map((g) => g.rows)).toEqual([[2, 5], [1, 3], [4]]);
    expect(reloaded.staleCategoryGroups()).toEqual([]);

    // The shapes every categorised corpus table has: a referenced root with
    // no value of its own, leaves carrying value, format manager and rows,
    // and the inline copy of the tree beside the reference.
    const gb = category.object.message;
    expect([2, 3, 6, 15, 18].every((f) => gb.has(f))).toBe(true);
    const root = reloaded.store.resolve(refId(gb, GroupByFields.GROUP_NODE_ROOT_REF))!.message;
    expect([1, 3, 4, 5, 6, 7, 8, 9, 10].filter((f) => root.has(f))).toEqual([1, 6, 9, 10]);
    const leaf = reloaded.store.resolve(root.getMessages(GroupNodeFields.CHILD_REF)[0]!.getVarint(1))!.message;
    expect([1, 3, 4, 5, 6, 7, 8, 9, 10].filter((f) => leaf.has(f))).toEqual([1, 6, 7, 9]);
    expect([1, 2, 3, 4].filter((f) => leaf.getMessage(GroupNodeFields.FORMAT_MANAGER)!.has(f))).toEqual([1, 2, 4]);
    expect(gb.getMessage(GroupByFields.GROUP_NODE_ROOT)!.getMessages(GroupNodeFields.CHILD).length).toBe(3);
  });

  it("refuses a second definition and an empty grouping cell", () => {
    const doc = NumbersDocument.blank();
    const table = doc.tables()[0]!;
    table.setCell(1, 1, "a");
    table.setCell(2, 1, "b");
    table.deleteRows(3, table.rowCount - 3);
    table.addCategory(1);
    expect(() => table.addCategory(1)).toThrow(/already categorised/);
    const other = NumbersDocument.blank().tables()[0]!;
    other.setCell(1, 1, "a");
    // Row 2 is left empty on purpose.
    other.deleteRows(3, other.rowCount - 3);
    expect(() => other.addCategory(1)).toThrow(/no value/);
  });
});

describe("nesting a category", () => {
  it("groups by two columns in the corpus's two-level shape", () => {
    const doc = NumbersDocument.blank();
    const table = doc.tables()[0]!;
    const rows: [string, boolean][] = [
      ["Fruit", true],
      ["Animal", false],
      ["Fruit", false],
      ["Animal", true],
      ["Animal", false],
    ];
    rows.forEach(([kind, flag], i) => {
      table.setCell(i + 1, 0, kind);
      table.setCell(i + 1, 1, flag);
    });
    table.deleteRows(rows.length + 1, table.rowCount - rows.length - 1);
    table.addCategory([0, 1]);

    const reloaded = NumbersDocument.load(doc.save()).tables()[0]!;
    const category = reloaded.activeCategories()!;
    expect(category.groupColumns().map((c) => c.column)).toEqual([0, 1]);
    const top = category.groups();
    expect(top.map((g) => g.value)).toEqual(["Animal", "Fruit"]);
    expect(top.map((g) => g.rows)).toEqual([[2, 4, 5], [1, 3]]);
    expect(top.map((g) => g.children.map((c) => [c.value, c.rows]))).toEqual([
      [[false, [2, 5]], [true, [4]]],
      [[false, [3]], [true, [1]]],
    ]);
    expect(reloaded.staleCategoryGroups()).toEqual([]);

    // Measured at every level of the corpus's nested tables: a string
    // parent carries value, format manager with formats and lookup sets,
    // rows and children; a boolean leaf carries its format manager with
    // the value alone.
    const gb = category.object.message;
    const root = reloaded.store.resolve(refId(gb, GroupByFields.GROUP_NODE_ROOT_REF))!.message;
    const parent = reloaded.store.resolve(root.getMessages(GroupNodeFields.CHILD_REF)[0]!.getVarint(1))!.message;
    expect([1, 3, 4, 5, 6, 7, 8, 9, 10].filter((f) => parent.has(f))).toEqual([1, 6, 7, 9, 10]);
    expect([1, 2, 3, 4].filter((f) => parent.getMessage(GroupNodeFields.FORMAT_MANAGER)!.has(f))).toEqual([1, 2, 4]);
    const leaf = reloaded.store.resolve(parent.getMessages(GroupNodeFields.CHILD_REF)[0]!.getVarint(1))!.message;
    expect([1, 3, 4, 5, 6, 7, 8, 9, 10].filter((f) => leaf.has(f))).toEqual([1, 6, 7, 9]);
    expect([1, 2, 3, 4].filter((f) => leaf.getMessage(GroupNodeFields.FORMAT_MANAGER)!.has(f))).toEqual([1]);
    const inlineTop = gb.getMessage(GroupByFields.GROUP_NODE_ROOT)!.getMessages(GroupNodeFields.CHILD);
    expect(inlineTop.map((n) => n.getMessages(GroupNodeFields.CHILD).length)).toEqual([2, 2]);
  });
});
