/**
 * Writing merged cell ranges.
 *
 * A merge is not a property of the cells. It is a formula owned by the calc
 * engine: `merge_owner.formula_store` holds `SUM(<rectangle>)` per merge,
 * and the covered cells are *deleted* — Apple leaves them with no record at
 * all, which is why they read back as `undefined` rather than as empty.
 *
 * The claim these tests make is unusually strong for an authoring feature,
 * and it is worth being precise about why. Everything else this library
 * writes is checked by reading it back, which proves self-consistency and
 * nothing more. A merge can do better: the corpus contains merges Apple
 * wrote, so a merge we build for the same rectangle can be compared
 * **byte for byte** against one the app produced. It is not proof that
 * Numbers opens the file, but it is a great deal more than "we can read our
 * own output".
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "./harness.ts";
import { NumbersDocument } from "../src/index.ts";
import { TableModelFields } from "../src/tst/tables.ts";
import type { RawMessage } from "../src/base/protobuf.ts";

const FIXTURES = new URL("../fixtures/", import.meta.url);
const bytes = (name: string) => new Uint8Array(readFileSync(new URL(name, FIXTURES)));
/** The one corpus document with merges Apple itself wrote. */
const MERGED = "iwork-mcp-v14.5-earnings.numbers";
const TABLE = "Key Metrics";

function load(): NumbersDocument {
  return NumbersDocument.load(bytes(MERGED));
}

const hex = (b: Uint8Array | undefined): string =>
  b === undefined ? "-" : [...b].map((x) => x.toString(16).padStart(2, "0")).join(" ");

/** Every AST node of every merge formula, as raw field bytes. */
function mergeNodes(table: { object: { message: RawMessage } }): string[] {
  const store = table.object.message.getMessage(TableModelFields.MERGE_OWNER)?.getMessage(2);
  const out: string[] = [];
  for (const pair of store?.getMessages(3) ?? []) {
    for (const node of pair.getMessage(2)?.getMessage(1)?.getMessages(1) ?? []) {
      out.push(
        `type=${node.getUint(1)} cross=[${hex(node.getBytes(28))}] ` +
          `sticky=[${hex(node.getBytes(33))}] tract=[${hex(node.getBytes(40))}]`,
      );
    }
  }
  return out;
}

describe("writing merges", () => {
  it("recreates a deleted merge byte-identically — the whole file", () => {
    // The strongest form available, same instrument as the formula star:
    // stage the document as it stood before Apple's last merge existed —
    // drop the pair at index 11, wind next_formula_index back to 11 —
    // then make the same merge through the public API and require the
    // *saved file* to equal Apple's original byte for byte. Everything
    // participates: pair bytes and position, the wound-back counter, the
    // covered cells' absence, the untouched dependency ledger, the
    // re-compressed component, the container.
    const original = new Uint8Array(
      readFileSync(new URL("numbers-parser-v26.0-issue102.numbers", FIXTURES)),
    );
    const doc = NumbersDocument.load(original);
    const cats = doc.tables().find((t) => t.name === "Cats")!;
    const owner = (
      cats as unknown as { object: { message: RawMessage } }
    ).object.message.getMessage(TableModelFields.MERGE_OWNER)!;
    const store = owner.getMessage(2)!;
    const pairs = store.getMessages(3);
    expect(pairs.map((p) => p.getUint(1)).join(",")).toBe("0,2,10,11");
    store.setMessages(
      3,
      pairs.filter((p) => p.getUint(1) !== 11),
    );
    store.setVarint(2, 11);
    expect(cats.merges().length).toBe(3);

    cats.mergeCells(6, 2, 1, 9);

    const saved = doc.save();
    expect(saved.length).toBe(original.length);
    expect(saved.every((b, i) => b === original[i])).toBe(true);
  });

  it("builds a node byte-identical to the one Apple wrote", () => {
    // Both of Apple's merges are removed first, so nothing is left to copy
    // and the node has to be reconstructed from the object graph: the
    // table's own formula-owner UUID out of the calc-engine registry, the
    // sticky bits, the tract, and the SUM node that wraps it. Then the
    // *same rectangle* is merged again and the bytes compared.
    const original = load().tables().find((t) => t.name === TABLE)!;
    const applesSecond = mergeNodes(original).slice(2); // the 1,0 1×4 merge

    const doc = load();
    const table = doc.tables().find((t) => t.name === TABLE)!;
    expect(table.unmergeCells(0, 0)).toBe(true);
    expect(table.unmergeCells(1, 0)).toBe(true);
    expect(mergeNodes(table)).toEqual([]);

    table.mergeCells(1, 0, 1, 4);
    expect(mergeNodes(table)).toEqual(applesSecond);
  });

  it("omits the range end for a single row, as Apple does", () => {
    // A one-row merge writes only `begin`; the reader treats an absent end
    // as "same as begin". Writing it anyway would round-trip but would not
    // match the app's bytes, and this is the assertion that notices.
    const doc = load();
    const table = doc.tables().find((t) => t.name === TABLE)!;
    table.unmergeCells(0, 0);
    table.unmergeCells(1, 0);
    table.mergeCells(2, 0, 1, 2);
    // tract = absolute_column {begin 0, end 1}, absolute_row {begin 2}
    expect(mergeNodes(table)[0]).toContain("tract=[1a 04 08 00 10 01 22 02 08 02 28 01]");
  });

  it("creates, persists and removes a merge", () => {
    const doc = load();
    const table = doc.tables().find((t) => t.name === TABLE)!;
    const before = table.merges().length;
    table.mergeCells(3, 1, 1, 3);

    const reread = NumbersDocument.load(doc.save());
    const after = reread.tables().find((t) => t.name === TABLE)!;
    expect(after.merges().length).toBe(before + 1);
    expect(after.merges().some((m) => m.row === 3 && m.column === 1 && m.columnCount === 3)).toBe(
      true,
    );

    expect(after.unmergeCells(3, 1)).toBe(true);
    const back = NumbersDocument.load(reread.save()).tables().find((t) => t.name === TABLE)!;
    expect(back.merges().length).toBe(before);
  });

  it("deletes the covered cells and keeps the anchor", () => {
    const doc = load();
    const table = doc.tables().find((t) => t.name === TABLE)!;
    const anchor = table.cellText(3, 1);
    expect(anchor.length).toBeGreaterThan(0);
    expect(table.cellText(3, 2).length).toBeGreaterThan(0);

    table.mergeCells(3, 1, 1, 3);
    const after = NumbersDocument.load(doc.save()).tables().find((t) => t.name === TABLE)!;
    expect(after.cellText(3, 1)).toBe(anchor);
    // Not "empty" — no record at all, which is what Apple leaves behind.
    expect(after.cellValue(3, 2)).toBe(undefined);
    expect(after.cellValue(3, 3)).toBe(undefined);
  });

  it("refuses a merge that overlaps another", () => {
    // The format cannot express it: the shared cells would belong to two
    // rectangles at once.
    const doc = load();
    const table = doc.tables().find((t) => t.name === TABLE)!;
    let message = "";
    try {
      table.mergeCells(0, 2, 2, 2); // crosses both of Apple's merges
    } catch (error) {
      message = (error as Error).message;
    }
    expect(message).toContain("overlaps the existing merge");
    expect(table.merges().length).toBe(2);
  });

  it("refuses a merge that is not a merge, or does not fit", () => {
    const doc = load();
    const table = doc.tables().find((t) => t.name === TABLE)!;
    const rejected = (fn: () => void): string => {
      try {
        fn();
        return "accepted";
      } catch (error) {
        return (error as Error).message;
      }
    };
    expect(rejected(() => table.mergeCells(5, 0, 1, 1))).toContain("1×1 merge is not a merge");
    expect(rejected(() => table.mergeCells(5, 0, 1, 0))).toContain("at least one cell");
    expect(rejected(() => table.mergeCells(5, 0, 99, 2))).toContain("outside the table");
    expect(rejected(() => table.mergeCells(-1, 0, 2, 2))).toContain("outside the table");
  });

  it("reports no merge to remove rather than pretending", () => {
    const doc = load();
    const table = doc.tables().find((t) => t.name === TABLE)!;
    expect(table.unmergeCells(9, 9)).toBe(false);
    // Anchored at its top-left: asking at a covered cell is not the anchor.
    expect(table.unmergeCells(0, 1)).toBe(false);
    expect(table.unmergeCells(0, 0)).toBe(true);
  });

  it("survives round-tripping through a table that had no merges", () => {
    // The formula store is absent on most tables; merging has to create it
    // rather than assume it.
    const doc = NumbersDocument.load(bytes("numbers-parser-v26.0-categories.numbers"));
    const table = doc.tables().find((t) => t.merges().length === 0 && t.rowCount > 4)!;
    const name = table.name;
    table.mergeCells(2, 0, 2, 2);

    const after = NumbersDocument.load(doc.save()).tables().find((t) => t.name === name)!;
    expect(after.merges()).toEqual([{ row: 2, column: 0, rowCount: 2, columnCount: 2 }]);
  });

  it("keeps the dependency ledger in step with the formula store", () => {
    // The calc engine lists each merge in the kind-5 owner's tiled ledger
    // as (row 0, column = formula_index) with empty edges — measured on
    // both merge-bearing fixtures, 8 records of 8. Creating a merge on a
    // table that never had one must mint the tile object too, and
    // unmerging releases the record while the tile stays, like the
    // high-water index.
    const ledgerIndexes = (table: unknown): number[] => {
      // Reach through the same private resolver production uses rather
      // than duplicating the UUID arithmetic here; the assertion is about
      // the ledger's contents, not about finding it twice.
      const t = table as {
        store: { resolve(ref: unknown): { message: RawMessage } | undefined };
        mergeDependenciesOwner(): { message: RawMessage } | undefined;
      };
      const owner = t.mergeDependenciesOwner();
      const out: number[] = [];
      const tiled = owner?.message.getMessage(13);
      for (const ref of tiled?.getMessages(1) ?? []) {
        const tile = t.store.resolve(ref);
        for (const record of tile?.message.getMessages(4) ?? []) {
          out.push(record.getUint(1) ?? -1);
        }
      }
      return out.sort((a, b) => a - b);
    };

    // Existing-tile path: earnings' Key Metrics ledger holds {0, 1}.
    const doc = load();
    const table = doc.tables().find((t) => t.name === TABLE)!;
    expect(ledgerIndexes(table)).toEqual([0, 1]);
    table.mergeCells(3, 1, 1, 3); // next free index is 2
    expect(ledgerIndexes(table)).toEqual([0, 1, 2]);
    expect(table.unmergeCells(3, 1)).toBe(true);
    expect(ledgerIndexes(table)).toEqual([0, 1]);

    // Fresh-tile path: a categories table has never had a merge, so the
    // tile object itself must be created — and survive a save/reload.
    const doc2 = NumbersDocument.load(bytes("numbers-parser-v26.0-categories.numbers"));
    const t2 = doc2.tables().find((t) => t.merges().length === 0 && t.rowCount > 4)!;
    const name = t2.name;
    expect(ledgerIndexes(t2)).toEqual([]);
    t2.mergeCells(2, 0, 2, 2);
    expect(ledgerIndexes(t2)).toEqual([0]);
    const after = NumbersDocument.load(doc2.save()).tables().find((t) => t.name === name)!;
    expect(ledgerIndexes(after)).toEqual([0]);
  });
});
