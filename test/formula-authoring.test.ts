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
import { tablesOf } from "../src/tst/tables.ts";
import { buildFormula, parseFormula } from "../src/tst/formula-builder.ts";

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
      for (const table of tablesOf(doc.store)) {
        for (const { row, column } of table.formulas()) {
          total++;
          const detail = table.cellFormulaDetail(row, column);
          if (!detail?.text || detail.unknownFunctions.length > 0) continue;
          const apple = table.formulaArchiveAt(row, column)?.getMessage(1);
          if (!apple) continue;
          let ours: Uint8Array;
          try {
            ours = buildFormula(parseFormula(detail.text), { row, column }).toBytes();
          } catch {
            continue; // parser gaps (cross-table, whole-column) are tracked below
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
    // formulas and 219 rebuilds measured 2026-08-02; the gap is the
    // parser's (cross-table references and whole-column tracts, tracked
    // in docs/BLOCKERS.md), and closing it should only raise this floor.
    expect(total >= 1244).toBe(true);
    expect(rebuilt >= 219).toBe(true);
  });
});
