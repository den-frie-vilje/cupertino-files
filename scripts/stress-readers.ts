#!/usr/bin/env node
/**
 * Run every reader over every document in a directory and report what breaks.
 *
 *   node scripts/stress-readers.ts <dir>       # defaults to fixtures/
 *
 * ## Why this is separate from the test suite
 *
 * The suite runs against `fixtures/` — documents this repository may keep.
 * That is a small, curated corpus, and a reader that survives it has only
 * been shown to survive it. Real iWork files are far more varied: fields
 * turn up with the wrong wire type, tables carry storage generations that
 * no longer exist, offsets point past the end of a buffer.
 *
 * The cheapest way to find those is to point this at a directory of files
 * gathered from anywhere — a parser project's test data, a folder of
 * documents on disk — and see what throws. Nothing is committed; the files
 * are read, the failures are fixed, the files are deleted. Two real bugs
 * came out of the first such run:
 *
 *  - `readPredicate` assumed field 7 was length-delimited. A document in
 *    the wild puts a varint there, which crashed the reader outright.
 *  - the control-spec reader dropped every checkbox, because a checkbox's
 *    whole archive is one varint and the entry-unwrapping heuristic
 *    skipped exactly that shape.
 *
 * ## What "passing" means
 *
 * Only that nothing threw. A reader can survive a document and still
 * misread it — that is what `scripts/probe-unknowns.ts` and the corpus
 * tests are for. This answers the narrower question of robustness, which
 * is the one a library gets asked in production.
 *
 * Failures are grouped by message rather than by file, because one bad
 * assumption usually shows up in dozens of documents at once and a list of
 * dozens hides how few real problems there are.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { IWorkDocument } from "../src/tsa/document.ts";
import { groupValueOf, tablesOf } from "../src/tst/tables.ts";
import { drawableStylesOf } from "../src/tsd/drawables.ts";
import { tablesOfContents } from "../src/tswp/toc.ts";
import { FormulaOwnerRegistry } from "../src/tsce/owners.ts";
import { chartsOf } from "../src/tsch/charts.ts";

/** Cap per table so a 10,000-row document does not dominate the run. */
const CELL_PROBE_LIMIT = 8;

interface Outcome {
  opened: number;
  unopenable: { file: string; reason: string }[];
  failures: Map<string, string[]>;
}

function stress(paths: readonly string[]): Outcome {
  const out: Outcome = { opened: 0, unopenable: [], failures: new Map() };
  const note = (what: string, file: string, error: unknown): void => {
    const key = `${what}: ${error instanceof Error ? error.message : String(error)}`;
    if (!out.failures.has(key)) out.failures.set(key, []);
    out.failures.get(key)!.push(file);
  };

  for (const path of paths) {
    const file = path.split("/").pop() ?? path;
    let document: IWorkDocument;
    try {
      document = IWorkDocument.open(new Uint8Array(readFileSync(path)));
    } catch (error) {
      // Not a failure: deliberately corrupt files and iWork '09 XML are
      // both rejected on purpose, and both belong in a corpus like this.
      out.unopenable.push({
        file,
        reason: error instanceof Error ? error.message : String(error),
      });
      continue;
    }
    out.opened++;

    const run = (what: string, fn: () => void): void => {
      try {
        fn();
      } catch (error) {
        note(what, file, error);
      }
    };

    run("textStorages", () => {
      for (const storage of document.textStorages()) {
        void storage.text;
        storage.paragraphs();
      }
    });
    run("stylesheets", () => {
      for (const sheet of document.stylesheets()) {
        for (const info of sheet.paragraphStyles()) void sheet.style(info.id)?.paragraph();
        for (const info of sheet.characterStyles()) void sheet.style(info.id)?.character();
      }
    });
    run("drawables", () => void drawableStylesOf(document.store).length);
    run("tablesOfContents", () => void tablesOfContents(document.store).length);
    run("owners", () => {
      const registry = new FormulaOwnerRegistry(document.store);
      registry.all();
      registry.unresolved();
    });
    run("charts", () => {
      for (const chart of chartsOf(document.store)) {
        chart.rowNames();
        chart.columnNames();
        chart.data();
        chart.series();
      }
    });

    for (const table of tablesOf(document.store)) {
      run("cells", () => void table.cells().length);
      run("grid", () => void table.grid().length);
      run("formulas", () => void table.formulas().length);
      run("merges", () => void table.merges().length);
      run("conditionalStyles", () => {
        for (const set of table.conditionalStyleSets().values()) set.rules();
      });
      run("filters", () => {
        const { rows, columns } = table.filterSets();
        table.filterRules(rows);
        table.filterRules(columns);
      });
      run("categories", () => {
        for (const categories of table.categories()) {
          categories.groups();
          categories.flatGroups();
          // verify() needs the table's own values to compare against, which
          // is the whole point of it — a stale group tree is invisible
          // otherwise.
          categories.verify((row, column) => groupValueOf(table.cellValue(row, column)));
        }
      });
      run("controls", () => void table.controls().size);
      run("uidMap", () => void table.uidMap());
      const rows = Math.min(table.rowCount, CELL_PROBE_LIMIT);
      const columns = Math.min(table.columnCount, CELL_PROBE_LIMIT);
      run("cellFormatting", () => {
        for (let row = 0; row < rows; row++) {
          for (let column = 0; column < columns; column++) table.cellFormatting(row, column);
        }
      });
      run("conditionalRules", () => {
        for (let row = 0; row < rows; row++) {
          for (let column = 0; column < columns; column++) table.conditionalRules(row, column);
        }
      });
    }
  }
  return out;
}

function main(argv: string[]): number {
  const dir = argv.find((a) => !a.startsWith("--")) ?? "fixtures";
  let names: string[];
  try {
    names = statSync(dir).isDirectory() ? readdirSync(dir) : [];
  } catch {
    console.error(`no such directory: ${dir}`);
    return 2;
  }
  const paths = names
    .filter((name) => /\.(pages|numbers|key)$/.test(name))
    .map((name) => `${dir}/${name}`);
  if (paths.length === 0) {
    console.error(`no iWork documents in ${dir}`);
    return 2;
  }

  const outcome = stress(paths);
  console.log(
    `opened ${outcome.opened}, rejected ${outcome.unopenable.length}, ` +
      `distinct failures ${outcome.failures.size}`,
  );
  if (outcome.unopenable.length > 0 && argv.includes("--verbose")) {
    console.log("\nrejected (expected for corrupt files and iWork '09):");
    for (const { file, reason } of outcome.unopenable) console.log(`  ${file}: ${reason}`);
  }
  if (outcome.failures.size === 0) {
    console.log("\nEvery reader survived every document.");
    return 0;
  }
  console.log("");
  for (const [message, files] of [...outcome.failures].sort((a, b) => b[1].length - a[1].length)) {
    console.log(`× ${message}`);
    console.log(`    ${files.length} file(s): ${files.slice(0, 5).join(", ")}`);
  }
  return 1;
}

process.exitCode = main(process.argv.slice(2));
