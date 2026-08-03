/**
 * The identity map moves with the grid.
 *
 * Numbers renders a table at its identity map's size, not its grid's —
 * measured 2026-08-03, when a seed document's freshly inserted C and D
 * columns were simply invisible in the app: the grid said four columns,
 * `base_column_row_uids` still said two, and the app believed the map.
 *
 * The contract pinned here: every row/column insert and delete keeps the
 * map in lockstep, surviving positions keep their identities (that is
 * the map's whole purpose — categories and calc dependencies address by
 * UID), fresh positions get fresh distinct identities, and the sorted
 * arrays keep Apple's measured order — ascending by (upper, lower), as
 * issue102's "Cats" columns establish.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "./harness.ts";
import { NumbersDocument } from "../src/index.ts";
import { refId } from "../src/tsp/schema.ts";

const FIXTURES = new URL("../fixtures/", import.meta.url);

function sortedColumnUidsAscend(doc: NumbersDocument): boolean {
  const table = doc.tables()[0]!;
  const target = doc.store.resolve(refId(table.object.message, 46))!;
  const uids = target.message
    .getMessages(1)
    .map((u) => ({ lower: u.getVarint(1) ?? 0n, upper: u.getVarint(2) ?? 0n }));
  return uids.every(
    (u, i) =>
      i === 0 ||
      uids[i - 1]!.upper < u.upper ||
      (uids[i - 1]!.upper === u.upper && uids[i - 1]!.lower <= u.lower),
  );
}

describe("the identity map moves with the grid", () => {
  it("inserts mint identities, deletes retire them, survivors keep theirs", () => {
    const doc = NumbersDocument.blank();
    const table = doc.tables()[0]!;
    const originalCol0 = table.uidMap().columnUid(0)!;
    const originalRow0 = table.uidMap().rowUid(0)!;

    table.insertColumns(2, 2);
    table.insertRows(11, 2);
    table.setCell(1, 2, "C exists");

    const re = NumbersDocument.load(doc.save());
    const rt = re.tables()[0]!;
    const map = rt.uidMap();
    expect(map.columnCount).toBe(rt.columnCount);
    expect(map.rowCount).toBe(rt.rowCount);
    expect(map.columnUid(0)!.lower === originalCol0.lower).toBe(true);
    expect(map.columnUid(0)!.upper === originalCol0.upper).toBe(true);
    expect(map.rowUid(0)!.lower === originalRow0.lower).toBe(true);
    const c = map.columnUid(2)!;
    const d = map.columnUid(3)!;
    expect(c.lower !== d.lower || c.upper !== d.upper).toBe(true);
    expect(sortedColumnUidsAscend(re)).toBe(true);
    expect(rt.cellText(1, 2)).toBe("C exists");

    rt.deleteColumns(2, 2);
    rt.deleteRows(11, 2);
    const again = NumbersDocument.load(re.save());
    const map2 = again.tables()[0]!.uidMap();
    expect(map2.columnCount).toBe(2);
    expect(map2.rowCount).toBe(11);
    expect(map2.columnUid(0)!.lower === originalCol0.lower).toBe(true);
  });

  it("keeps a fixture's existing identities across an insert", () => {
    const doc = NumbersDocument.load(
      new Uint8Array(readFileSync(new URL("numbers-parser-v26.0-issue102.numbers", FIXTURES))),
    );
    const table = doc.tables().find((t) => t.name === "Cats")!;
    const before = Array.from({ length: table.columnCount }, (_, i) => table.uidMap().columnUid(i)!);

    table.insertColumns(1, 1);
    const re = NumbersDocument.load(doc.save());
    const rt = re.tables().find((t) => t.name === "Cats")!;
    const map = rt.uidMap();
    expect(map.columnCount).toBe(before.length + 1);
    // Every pre-existing column keeps its identity, shifted where inserted.
    expect(map.columnUid(0)!.lower === before[0]!.lower).toBe(true);
    for (let i = 1; i < before.length; i++) {
      expect(map.columnUid(i + 1)!.lower === before[i]!.lower).toBe(true);
    }
    expect(sortedColumnUidsAscend(re)).toBe(true);
  });
});
