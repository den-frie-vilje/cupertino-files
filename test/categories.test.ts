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
import { AccumulatorFields, GroupByFields, GroupNodeFields, BUCKET_FUNCTORS, bucketStart, type ColumnAggregate } from "../src/tst/categories.ts";
import { readUid, uidKey } from "../src/tst/uidmap.ts";
import { CellFlag, CellRecord } from "../src/tst/cellrecord.ts";
import { TileFields, TileRowInfo } from "../src/tst/tables.ts";
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
    // The inline copy and the referenced tree name each group by one uid.
    const inlineRoot = gb.getMessage(GroupByFields.GROUP_NODE_ROOT)!;
    const uid = (node: RawMessage): string => Buffer.from(node.getMessage(GroupNodeFields.GROUP_UID)!.toBytes()).toString("hex");
    expect(uid(inlineRoot)).toBe(uid(root));
    expect(uid(inlineRoot.getMessages(GroupNodeFields.CHILD)[0]!)).toBe(uid(leaf));
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

describe("bucketing a date column", () => {
  it("writes the app's own functor for the kind and buckets the dates as it would", () => {
    const doc = NumbersDocument.blank();
    const table = doc.tables()[0]!;
    const dates = ["2024-03-05", "2024-01-20", "2024-03-28", "2023-12-31"];
    dates.forEach((iso, i) => {
      table.setCell(i + 1, 0, `row ${i + 1}`);
      table.setCell(i + 1, 1, { type: "date", value: new Date(`${iso}T00:00:00Z`) });
    });
    table.deleteRows(dates.length + 1, table.rowCount - dates.length - 1);
    table.addCategory([{ column: 1, bucket: "yearAndMonth" }]);

    const reloaded = NumbersDocument.load(doc.save()).tables()[0]!;
    const category = reloaded.activeCategories()!;
    expect(category.groupColumns().map((c) => c.groupingName)).toEqual(["year and month"]);
    const groups = category.groups();
    expect(groups.map((g) => (g.value as Date).toISOString().slice(0, 10))).toEqual(["2023-12-01", "2024-01-01", "2024-03-01"]);
    expect(groups.map((g) => g.rows)).toEqual([[4], [2], [1, 3]]);
    expect(reloaded.staleCategoryGroups()).toEqual([]);

    // The functor is the fixture's, byte for byte, and the group value
    // carries the kind's pattern.
    const fixture = IWorkDocument.open(new Uint8Array(readFileSync(new URL("numbers-parser-v26.0-categories.numbers", FIXTURES))));
    const monthTable = tablesOf(fixture.store).find((t) => t.name === "Date Year-Month")!;
    const theirs = monthTable.categories()[0]!.object.message.getMessages(GroupByFields.GROUP_COLUMN)[0]!.getMessage(3)!.toBytes();
    const ours = category.object.message.getMessages(GroupByFields.GROUP_COLUMN)[0]!.getMessage(3)!.toBytes();
    expect(Buffer.compare(Buffer.from(ours), Buffer.from(theirs))).toBe(0);
    const root = reloaded.store.resolve(refId(category.object.message, GroupByFields.GROUP_NODE_ROOT_REF))!.message;
    const leaf = reloaded.store.resolve(root.getMessages(GroupNodeFields.CHILD_REF)[0]!.getVarint(1))!.message;
    expect(leaf.getMessage(GroupNodeFields.GROUP_CELL_VALUE)!.getMessage(3)!.getMessage(2)!.getString(14)).toBe("LLLL yyyy");
  });

  it("computes every kind's bucket the way the fixture's groups show", () => {
    const fixture = IWorkDocument.open(new Uint8Array(readFileSync(new URL("numbers-parser-v26.0-categories.numbers", FIXTURES))));
    let checked = 0;
    for (const table of tablesOf(fixture.store)) {
      const category = table.activeCategories();
      const first = category?.groupColumns()[0];
      if (!category || !first || first.groupingType === GroupingType.BY_VALUE) continue;
      expect(BUCKET_FUNCTORS.get(first.groupingType)).toBe(
        Buffer.from(category.object.message.getMessages(GroupByFields.GROUP_COLUMN)[0]!.getMessage(3)!.toBytes()).toString("hex"),
      );
      for (const group of category.groups()) {
        for (const row of group.rows) {
          const cell = table.cellValue(row, first.column!);
          const date = cell && typeof cell === "object" && "value" in cell && cell.value instanceof Date ? cell.value : undefined;
          expect(date && bucketStart(first.groupingType, date).getTime()).toBe((group.value as Date).getTime());
          checked++;
        }
      }
    }
    expect(checked > 100).toBe(true);
  });
});

describe("a per-group summary written from nothing", () => {
  const TWIN = "olekristensen-v26.0-mac-authored.numbers";
  const SEED = "olekristensen-v26.0-mac-summaries-seed.numbers";
  const fieldNumbers = (m: RawMessage | undefined): number[] => m?.fields.map((f) => f.no) ?? [];
  const load = (name: string) => NumbersDocument.load(new Uint8Array(readFileSync(new URL(name, FIXTURES)))).tables()[0]!;
  /** The twin's table, as the library built it before the checker summarised Kind. */
  const build = () => {
    const doc = NumbersDocument.blank();
    const table = doc.tables()[0]!;
    table.insertColumns(2, 1);
    ["Item", "Kind", "Amount"].forEach((label, c) => { table.setCell(0, c, label); });
    const rows: [string, string, number][] = [
      ["Pear", "Fruit", 12], ["Cat", "Animal", 3], ["Apple", "Fruit", 7],
      ["Train", "Transport", 40], ["Dog", "Animal", 10], ["Bicycle", "Transport", 2],
    ];
    rows.forEach(([item, kind, amount], i) => {
      table.setCell(i + 1, 0, item);
      table.setCell(i + 1, 1, kind);
      table.setCell(i + 1, 2, amount);
    });
    table.deleteRows(rows.length + 1, table.rowCount - rows.length - 1);
    table.addCategory(1);
    return { doc, table };
  };
  /** The inline aggregator; the referenced one at field 17 is checked to match it. */
  const aggregatorOf = (table: TableModel, index = 0): RawMessage => {
    const category = table.activeCategories()!;
    const inline = category.object.message.getMessages(GroupByFields.AGGREGATOR)[index]!;
    const referenced = category.store.resolve(category.object.message.getMessages(GroupByFields.AGGREGATOR_REF)[index]!.getVarint(1))!;
    expect(Buffer.from(referenced.message.toBytes()).toString("hex")).toBe(Buffer.from(inline.toBytes()).toString("hex"));
    return inline;
  };
  /** Field numbers of an aggregator's root node, its accumulator, and the distinct shapes of its children. */
  const nodeShape = (aggregator: RawMessage): unknown => {
    const root = aggregator.getMessage(2)!;
    const children = root.getMessages(3).map((c) => JSON.stringify([fieldNumbers(c), fieldNumbers(c.getMessage(2))]));
    return [fieldNumbers(aggregator), [...new Set(fieldNumbers(root))], fieldNumbers(root.getMessage(2)), [...new Set(children)]];
  };
  const coordinates = (aggregator: RawMessage): number[] => {
    const root = aggregator.getMessage(2)!;
    return [...root.getMessages(3), root].map((n) => Number(n.getMessage(1)!.getVarint(2)));
  };
  const summaryFormulas = (table: TableModel): RawMessage[] => {
    const summary = table.summaryModel()!;
    const list = summary.store.resolve(refId(summary.object.message.getMessage(2)!, 6))!;
    return list.message.getMessages(3).map((e) => e.getMessage(5)!.getMessage(1)!.getMessages(1)[0]!);
  };
  const vendorEntries = (table: TableModel): RawMessage[] => {
    const summary = table.summaryModel()!;
    return summary.store.resolve(refId(summary.object.message, 5))!.message.getMessages(2);
  };
  const firstRecord = (table: TableModel, row: number): CellRecord => {
    const summary = table.summaryModel()!;
    const tiles = summary.object.message.getMessage(2)!.getMessage(3)!;
    const tile = summary.store.resolve(refId(tiles.getMessages(1)[0]!, 2))!;
    return CellRecord.decode(tile.message.getMessages(TileFields.ROW_INFOS)[row]!.getBytes(TileRowInfo.CELL_STORAGE_BUFFER)!);
  };

  it("writes the Count the twin's checker built: entry, aggregator cache, node coordinates, summary cells and vendor template, field for field", () => {
    const { doc, table } = build();
    table.addCategorySummary(1, "count");
    const twin = load(TWIN);
    const strip = (a: ColumnAggregate) => [a.column, a.level, a.aggType, a.aggregate, a.showAsType];
    expect(table.activeCategories()!.aggregates().map(strip)).toEqual(twin.activeCategories()!.aggregates().map(strip));

    const ours = aggregatorOf(table);
    const theirs = aggregatorOf(twin);
    expect(nodeShape(ours)).toEqual(nodeShape(theirs));
    expect(coordinates(ours)).toEqual(coordinates(theirs));
    expect(coordinates(ours)).toEqual([8, 9, 10, 11]);
    const counts = (aggregator: RawMessage) => {
      const root = aggregator.getMessage(2)!;
      return [root, ...root.getMessages(3)].map((n) => [Number(n.getMessage(2)!.getVarint(AccumulatorFields.STRING_COUNT)), n.getMessage(2)!.getMessage(AccumulatorFields.MIN)!.getMessage(5)!.getString(1), n.getMessage(2)!.getMessage(AccumulatorFields.MAX)!.getMessage(5)!.getString(1)]);
    };
    expect(counts(ours)).toEqual(counts(theirs));
    expect(counts(ours)).toEqual([[6, "Animal", "Transport"], [2, "Animal", "Animal"], [2, "Fruit", "Fruit"], [2, "Transport", "Transport"]]);
    // Every group node, inline and referenced, names its aggregator node's coordinate.
    const category = table.activeCategories()!;
    const inlineRoot = category.object.message.getMessage(GroupByFields.GROUP_NODE_ROOT)!;
    const referencedRoot = category.store.resolve(refId(category.object.message, GroupByFields.GROUP_NODE_ROOT_REF))!;
    const coordsOf = (node: RawMessage) => node.getMessages(GroupNodeFields.AGG_FORMULA_COORDS).map((c) => Number(c.getVarint(2)));
    expect([inlineRoot, ...inlineRoot.getMessages(GroupNodeFields.CHILD)].map(coordsOf)).toEqual([[11], [8], [9], [10]]);
    expect([referencedRoot, ...referencedRoot.getObjectReferences().map((id) => category.store.resolve(id)!)].map((o) => coordsOf(o.message))).toEqual([[11], [8], [9], [10]]);

    const cells = (t: TableModel) => t.summaryModel()!.cells().map((c) => [c.row, c.column, c.value.type === "number" ? c.value.value : c.value.type, (c.value as { isFormula?: boolean }).isFormula]);
    expect(cells(table)).toEqual(cells(twin));
    expect(table.summaryModel()!.cellFormulaDetail(0, 2)?.unknownNodeTypes).toEqual([66]);
    // The summary's identity map: a fresh column before the host's, and a row per group under the group's uid.
    const summary = table.summaryModel()!;
    const map = new ColumnRowUidMap(summary.store.resolve(refId(summary.object.message, 3))!.message);
    expect(map.columnUidList().slice(1).map((u) => uidKey(u!))).toEqual(table.uidMap().columnUidList().map((u) => uidKey(u!)));
    expect(map.rowUidList().map((u) => uidKey(u!))).toEqual(category.flatGroups().map((_, i) => uidKey(readUid(referencedRoot.getObjectReferences().map((id) => category.store.resolve(id)!)[i]!.message.getMessage(GroupNodeFields.GROUP_UID))!)));

    const refShape = (node: RawMessage) => {
      const ref = node.getMessage(39)!.getMessage(1)!;
      return [fieldNumbers(node), fieldNumbers(ref), Number(ref.getVarint(3)), Number(ref.getVarint(4)), fieldNumbers(ref.getMessage(7)), Number(ref.getVarint(13))];
    };
    expect(summaryFormulas(table).map(refShape)).toEqual(summaryFormulas(twin).map(refShape));
    expect(summaryFormulas(table).map((n) => uidKey(readUid(n.getMessage(39)!.getMessage(1)!.getMessage(10))!))).toEqual(map.rowUidList().map((u) => uidKey(u!)));
    for (const row of [0, 1, 2]) {
      const record = firstRecord(table, row);
      const measured = firstRecord(twin, row);
      expect([record.type, record.flags, record.extras, record.id(CellFlag.SUGGEST_ID), record.id(CellFlag.NUM_FORMAT_ID)]).toEqual([measured.type, measured.flags, measured.extras, measured.id(CellFlag.SUGGEST_ID), measured.id(CellFlag.NUM_FORMAT_ID)]);
    }
    const vendorShape = (entry: RawMessage) => {
      const cell = entry.getMessage(3)!;
      const spec = cell.getMessage(28)!;
      return [fieldNumbers(entry), fieldNumbers(cell), fieldNumbers(spec), Number(spec.getVarint(1)), refShape(spec.getMessage(2)!.getMessage(1)!.getMessages(1)[0]!)];
    };
    expect(vendorEntries(table).map(vendorShape)).toEqual(vendorEntries(twin).map(vendorShape));

    const reloaded = NumbersDocument.load(doc.save()).tables()[0]!;
    expect(reloaded.activeCategories()!.aggregates()[0]!.aggregate).toBe("count");
    expect(cells(reloaded)).toEqual(cells(twin));
  });

  it("writes a Sum over numbers with the record the app caches for one, and the sums as the cached values", () => {
    const { table } = build();
    table.addCategorySummary(2, "sum");
    const seed = load(SEED);
    expect(nodeShape(aggregatorOf(table))).toEqual(nodeShape(aggregatorOf(seed)));
    const root = aggregatorOf(table).getMessage(2)!.getMessage(2)!;
    const number = (field: number) => root.getMessage(field)!.getMessage(4)!.getDouble(1);
    expect([Number(root.getVarint(AccumulatorFields.NUMBER_COUNT)), number(AccumulatorFields.MIN), number(AccumulatorFields.MAX), number(AccumulatorFields.SUM), root.getDouble(AccumulatorFields.SECONDS), number(AccumulatorFields.PRODUCT)]).toEqual([6, 2, 40, 74, 74, 201600]);
    expect(table.summaryModel()!.cells().map((c) => [c.row, c.column, c.value.type === "number" ? c.value.value : c.value.type])).toEqual([[0, 3, 13], [1, 3, 19], [2, 3, 42]]);
    expect(table.activeCategories()!.aggregates().map((a) => [a.column, a.aggregate])).toEqual([[2, "sum"]]);
  });

  it("stacks a second summary after the first: the next coordinates, the next summary column, both vendor templates", () => {
    const { table } = build();
    table.addCategorySummary(1, "count");
    table.addCategorySummary(2, "average");
    expect(coordinates(aggregatorOf(table, 1))).toEqual([12, 13, 14, 15]);
    expect(table.summaryModel()!.cells().map((c) => [c.row, c.column, c.value.type === "number" ? c.value.value : c.value.type])).toEqual([[0, 2, 2], [0, 3, 6.5], [1, 2, 2], [1, 3, 9.5], [2, 2, 2], [2, 3, 21]]);
    expect(vendorEntries(table).length).toBe(2);
  });

  it("refuses what it cannot measure: an uncategorised table, a second summary on a column, a sum of text, a blank in the column", () => {
    const blank = NumbersDocument.blank().tables()[0]!;
    expect(() => blank.addCategorySummary(0, "count")).toThrow(/not categorised/);
    const { table } = build();
    table.addCategorySummary(1, "count");
    expect(() => table.addCategorySummary(1, "sum")).toThrow(/already has a summary/);
    expect(() => table.addCategorySummary(0, "sum")).toThrow(/needs a column of numbers/);
    table.setCell(3, 2, { type: "empty" });
    expect(() => table.addCategorySummary(2, "sum")).toThrow(/every data row needs one/);
  });
});
