/**
 * Formula authoring is proven by bytes, not by re-rendering.
 *
 * For every formula in the corpus whose rendered text the parser accepts,
 * compiling that text back must reproduce Apple's stored AST **exactly**.
 * Round-tripping through the renderer would hide too much — a wrong
 * encoding that renders the same is precisely the well-formed-but-wrong
 * class — so the yardstick is `formulaArchiveAt`, the unrendered truth.
 *
 * Three defects were caught this way on the first corpus-wide run, each
 * invisible to a render round-trip:
 *
 *   - an omitted argument is a TOKEN node with `AST_token_node_boolean`,
 *     not an EMPTY_ARGUMENT node;
 *   - a number's duplicate decimal128 is *plain* (30 = 30·10⁰), never
 *     normalized the way a cell record's decimal is (3·10¹);
 *   - a `C3:K6` range is a *relative* tract — signed 64-bit offsets from
 *     the using cell, inclusive — where only `$`-pinned axes are absolute.
 */
import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "./harness.ts";
import { IWorkDocument } from "../src/tsa/document.ts";
import { NumbersDocument } from "../src/index.ts";
import { DataStoreFields, tablesOf, type TableModel } from "../src/tst/tables.ts";
import { buildFormula, parseFormula } from "../src/tst/formula-builder.ts";
import { FormulaOwnerRegistry } from "../src/tsce/owners.ts";
import { bytesEqual } from "../src/base/bytes.ts";

const FIXTURES = new URL("../fixtures/", import.meta.url);

describe("every parseable corpus formula rebuilds byte-identically", () => {
  it("matches Apple's AST for all of them, with measured floors", () => {
    let total = 0;
    let rebuilt = 0;
    let identical = 0;
    const mismatches: string[] = [];

    for (const name of readdirSync(FIXTURES).sort()) {
      if (!/\.(pages|numbers|key)$/.test(name)) continue;
      let doc: IWorkDocument;
      try {
        doc = IWorkDocument.open(new Uint8Array(readFileSync(new URL(name, FIXTURES))));
      } catch {
        continue;
      }
      const registry = new FormulaOwnerRegistry(doc.store);
      const options = { tableUid: (name: string) => registry.tableUid(name) };
      for (const table of tablesOf(doc.store)) {
        for (const { row, column } of table.formulas()) {
          total++;
          const detail = table.cellFormulaDetail(row, column);
          if (!detail?.text || detail.unknownFunctions.length > 0) continue;
          const apple = table.formulaArchiveAt(row, column)?.getMessage(1);
          if (!apple) continue;
          let ours: Uint8Array;
          try {
            ours = buildFormula(parseFormula(detail.text), { row, column }, options).toBytes();
          } catch {
            continue; // the two deliberate #REF! refusals, pinned below
          }
          rebuilt++;
          const theirs = apple.toBytes();
          const same =
            ours.length === theirs.length && ours.every((b, i) => b === theirs[i]);
          if (same) identical++;
          else if (mismatches.length < 5) {
            mismatches.push(`${name} ${table.name} r${row}c${column} ${detail.text}`);
          }
        }
      }
    }

    // Every rebuilt formula must match — zero tolerance, named offenders.
    expect(`mismatches: ${mismatches.join(" | ")}`).toBe("mismatches: ");
    expect(identical).toBe(rebuilt);
    // Floors guard the guard: coverage must not silently shrink. 1244
    // formulas and 1242 rebuilds measured 2026-08-02 (219 before
    // cross-table references and whole-column spans landed); the entire
    // remaining gap is two #REF! errors, which stay unauthorable on
    // purpose — writing a lost reference is not a feature.
    expect(total >= 1244).toBe(true);
    expect(rebuilt >= 1242).toBe(true);
  });
});

const STAR_FIXTURE = "numbers-parser-v26.0-issue102.numbers";

/**
 * Every formula-table entry's refcount against the cells that actually
 * name its key — Apple's convention, measured at 39/39 across the corpus.
 * Read through the privates: the invariant is exactly the thing the
 * public surface is supposed to keep invisible.
 */
function refcountLedger(table: TableModel): { key: number; refcount: number; cells: number }[] {
  const t = table as unknown as {
    store: {
      resolve(ref: unknown): { message: RawList } | undefined;
    };
    dataStore(): { getMessage(field: number): unknown } | undefined;
  };
  interface RawList {
    getMessages(field: number): { getUint(field: number): number | undefined }[];
  }
  const ref = t.dataStore()?.getMessage(DataStoreFields.FORMULA_TABLE);
  const list = ref ? t.store.resolve(ref) : undefined;
  const out: { key: number; refcount: number; cells: number }[] = [];
  for (const entry of list?.message.getMessages(3) ?? []) {
    const key = entry.getUint(1);
    if (key === undefined) continue;
    let cells = 0;
    for (let r = 0; r < table.rowCount; r++) {
      for (let c = 0; c < table.columnCount; c++) {
        if (table.formulaId(r, c) === key) cells++;
      }
    }
    out.push({ key, refcount: entry.getUint(2) ?? 0, cells });
  }
  return out;
}

describe("replacing a formula with its own text is a byte-level no-op", () => {
  // The strongest proof available: not that the write looks right, but
  // that it is indistinguishable from never having happened. The touched
  // components are re-serialized by this library and re-compressed by its
  // Snappy port, and the container is rebuilt around them — and the whole
  // file must still equal Apple's original, byte for byte.
  it("saves the whole document byte-identical to Apple's file", () => {
    const original = new Uint8Array(readFileSync(new URL(STAR_FIXTURE, FIXTURES)));
    const doc = NumbersDocument.load(original);
    const table = doc.tables().find((t) => t.cellFormula(6, 2) !== undefined);
    expect(table?.name).toBe("Cats");
    const text = table!.cellFormula(6, 2);
    expect(text).toBe("=SUM(C3:K6)");

    table!.setFormula(6, 2, text!);
    const saved = doc.save();
    expect(saved.length).toBe(original.length);
    expect(bytesEqual(saved, original)).toBe(true);
  });

  it("keeps the refcount ledger balanced through replace, clear and overwrite", () => {
    const original = new Uint8Array(readFileSync(new URL(STAR_FIXTURE, FIXTURES)));
    const doc = NumbersDocument.load(original);
    const table = doc.tables().find((t) => t.name === "Cats")!;
    const balanced = (ledger: { key: number; refcount: number; cells: number }[]) =>
      ledger.every((e) => e.refcount === e.cells);
    expect(balanced(refcountLedger(table))).toBe(true);
    const entriesBefore = refcountLedger(table).length;

    // Same text → same entry, same count.
    table.setFormula(6, 2, "=SUM(C3:K6)");
    expect(refcountLedger(table).length).toBe(entriesBefore);
    expect(balanced(refcountLedger(table))).toBe(true);

    // Different text → old entry's reference released, one new entry.
    table.setFormula(6, 2, "=SUM(C3:K5)");
    expect(balanced(refcountLedger(table))).toBe(true);

    // A literal over a formula cell releases its entry.
    table.setCell(6, 2, 42);
    expect(balanced(refcountLedger(table))).toBe(true);
    expect(table.cellFormula(6, 2)).toBe(undefined);

    // clearFormula releases too, and the ledger still balances after a
    // save/load round trip — the bytes carry the same story.
    table.setFormula(6, 2, "=SUM(C3:K6)", { value: 0 });
    expect(table.clearFormula(6, 2)).toBe(true);
    const reread = NumbersDocument.load(doc.save())
      .tables()
      .find((t) => t.name === "Cats")!;
    expect(balanced(refcountLedger(reread))).toBe(true);
  });
});
