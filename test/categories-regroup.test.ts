/**
 * Regrouping a categorised table.
 *
 * The strong test here is the byte-identity one. Regrouping data that has
 * not changed must put every row back where Apple put it and rewrite the
 * archive to *exactly* the same bytes. That check covers far more than "the
 * rows come back": it pins how an index set is encoded — consecutive rows
 * collapsed into one range, a single row written with `range_begin` and no
 * `range_end` — and both of those read back correctly when written the
 * other way, so nothing short of a byte comparison would notice.
 *
 * The fixture has one table per grouping the UI offers, which is what makes
 * this worth doing across all of them rather than one: text, number,
 * boolean and date groups take different `CellValueArchive` branches, and a
 * comparison done on rendered text instead of values would report every
 * boolean and date table as stale.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "./harness.ts";
import { NumbersDocument } from "../src/index.ts";
import { writeIndexSet, expandIndexSet } from "../src/tst/categories.ts";

const FIXTURES = new URL("../fixtures/", import.meta.url);
const FIXTURE = "numbers-parser-v26.0-categories.numbers";
const bytes = new Uint8Array(readFileSync(new URL(FIXTURE, FIXTURES)));
const load = () => NumbersDocument.load(bytes);

const hex = (b: Uint8Array): string => [...b].map((x) => x.toString(16).padStart(2, "0")).join(" ");

/** Tables in the fixture whose outermost grouping is by value. */
const byValueTables = () =>
  load()
    .tables()
    .filter((table) => {
      const active = table.activeCategories();
      const [first] = active?.groupColumns() ?? [];
      return active !== undefined && first?.groupingType === 0 && first.column !== undefined;
    });

describe("index set encoding", () => {
  it("round-trips through expand", () => {
    for (const input of [[], [4], [1, 2, 3], [1, 3, 5], [0, 1, 2, 7, 9, 10]]) {
      expect(expandIndexSet(writeIndexSet(input)).join(",")).toBe(input.join(","));
    }
  });

  it("collapses runs and writes a lone index with no end", () => {
    // Apple's root node covers rows 1–30 as one entry with an end; a group
    // of scattered rows is one entry each, without one.
    const run = writeIndexSet([1, 2, 3]).getMessages(1);
    expect(run.length).toBe(1);
    expect(`${run[0]!.getUint(1)}..${run[0]!.getUint(2)}`).toBe("1..3");

    const scattered = writeIndexSet([4, 9]).getMessages(1);
    expect(scattered.length).toBe(2);
    expect(scattered[0]!.getUint(2)).toBe(undefined);
  });

  it("sorts and de-duplicates, so caller order cannot corrupt a set", () => {
    expect(expandIndexSet(writeIndexSet([5, 1, 5, 3, 1])).join(",")).toBe("1,3,5");
  });
});

describe("regrouping unchanged data", () => {
  it("moves nothing and reproduces Apple's bytes exactly", () => {
    let checked = 0;
    for (const table of byValueTables()) {
      const categories = table.activeCategories()!;
      const before = hex(categories.object.message.toBytes());
      const moved = table.regroupCategories();
      const after = hex(categories.object.message.toBytes());

      expect(`${table.name}: moved ${moved}`).toBe(`${table.name}: moved 0`);
      expect(`${table.name}: ${after}`).toBe(`${table.name}: ${before}`);
      checked++;
    }
    // Guard against the whole suite passing because nothing was examined.
    expect(checked > 0).toBe(true);
  });

  it("writes nothing at all, so the save is unchanged by regrouping", () => {
    // Not just "the same groups come back": a regroup that rewrote every
    // index set to the same value would still dirty the component and
    // rebuild it. Nothing moved, so nothing should be touched.
    //
    // Compared against a plain resave rather than against the fixture,
    // because a resave is never byte-identical to its input at the
    // container level — the IWA payloads re-compress to different but
    // equivalent bytes. Both sides here go through the same writer, so any
    // difference is regrouping's doing and nothing else's.
    const untouched = load().save();

    const doc = load();
    for (const table of doc.tables()) {
      if (!table.activeCategories()) continue;
      try {
        table.regroupCategories();
      } catch {
        // Bucketed groupings are refused; that is a different test.
      }
    }
    const regrouped = doc.save();
    expect(`${regrouped.length} bytes`).toBe(`${untouched.length} bytes`);
    expect(hex(regrouped)).toBe(hex(untouched));
  });
});

describe("regrouping after an edit", () => {
  it("moves a row whose value changed into the group it now belongs to", () => {
    const doc = load();
    const table = doc.tables().find((t) => t.name === "Categories")!;
    const categories = table.activeCategories()!;
    const column = categories.groupColumns()[0]!.column!;

    const groups = categories.groups();
    const from = groups[0]!;
    const to = groups.find((g) => g.label !== from.label)!;
    const row = from.rows[0]!;

    table.setCell(row, column, to.label);
    expect(table.staleCategoryGroups().length > 0).toBe(true);

    expect(table.regroupCategories()).toBe(1);
    expect(table.staleCategoryGroups().length).toBe(0);

    const after = NumbersDocument.load(doc.save())
      .tables()
      .find((t) => t.name === "Categories")!
      .activeCategories()!
      .groups();
    const movedTo = after.find((g) => g.label === to.label)!;
    const movedFrom = after.find((g) => g.label === from.label)!;
    expect(movedTo.rows.includes(row)).toBe(true);
    expect(movedFrom.rows.includes(row)).toBe(false);
    // Nothing else shifted.
    expect(movedTo.rows.length).toBe(to.rows.length + 1);
    expect(movedFrom.rows.length).toBe(from.rows.length - 1);
  });

  it("keeps every row accounted for", () => {
    const doc = load();
    const table = doc.tables().find((t) => t.name === "Categories")!;
    const categories = table.activeCategories()!;
    const column = categories.groupColumns()[0]!.column!;
    const before = categories.groups().flatMap((g) => g.rows).sort((a, b) => a - b);

    const target = categories.groups()[1]!.label;
    for (const row of categories.groups()[0]!.rows.slice(0, 3)) {
      table.setCell(row, column, target);
    }
    table.regroupCategories();

    const after = categories.groups().flatMap((g) => g.rows).sort((a, b) => a - b);
    expect(after.join(",")).toBe(before.join(","));
  });
});

describe("what regrouping refuses", () => {
  it("will not invent a group for a value that has none", () => {
    const doc = load();
    const table = doc.tables().find((t) => t.name === "Categories")!;
    const column = table.activeCategories()!.groupColumns()[0]!.column!;
    table.setCell(1, column, "Mineral");

    let message = "";
    try {
      table.regroupCategories();
    } catch (error) {
      message = (error as Error).message;
    }
    expect(message.includes("Mineral")).toBe(true);
    expect(message.includes("will not create one")).toBe(true);
  });

  it("leaves the tree untouched when it refuses", () => {
    const doc = load();
    const table = doc.tables().find((t) => t.name === "Categories")!;
    const categories = table.activeCategories()!;
    const column = categories.groupColumns()[0]!.column!;
    const before = hex(categories.object.message.toBytes());

    table.setCell(1, column, "Mineral");
    try {
      table.regroupCategories();
    } catch {
      // expected
    }
    expect(hex(categories.object.message.toBytes())).toBe(before);
  });

  it("refuses a bucketed grouping rather than guessing the bucket", () => {
    const doc = load();
    const bucketed = doc
      .tables()
      .find((t) => (t.activeCategories()?.groupColumns()[0]?.groupingType ?? 0) !== 0);
    if (!bucketed) throw new Error("fixture has no bucketed grouping");

    let message = "";
    try {
      bucketed.regroupCategories();
    } catch (error) {
      message = (error as Error).message;
    }
    expect(message.includes("not by value")).toBe(true);
  });
});
