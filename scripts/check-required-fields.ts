#!/usr/bin/env node
/**
 * Does every archive carry the `required` fields its schema declares?
 *
 *   node scripts/check-required-fields.ts [file|dir ...]   # defaults to fixtures/
 *   node scripts/check-required-fields.ts --authored       # what this library writes
 *
 * ## Why
 *
 * A message missing a proto2 `required` field is not a smaller message — it
 * is one no conforming parser accepts, and Numbers refuses the document
 * that contains it. This library shipped exactly that bug: conditional
 * rules written with neither of the two `required` style references. Every
 * reader here read them back correctly, the suite passed, and a
 * byte-comparison against a rule Apple wrote passed too, because Apple only
 * ever writes the styled case. The app was the first thing to object.
 *
 * `--authored` is the mode that matters, and it is the one the test suite
 * runs: it exercises each authoring path and checks the result, so the next
 * writer that forgets a required field fails here rather than on a Mac.
 *
 * Fixtures are checked too, but a violation there means the *schema* is
 * wrong for that file's era, not the file — Apple's own documents are by
 * definition well-formed. Treat those as a note about the vendored protos.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { IWorkDocument } from "../src/tsa/document.ts";
import { NumbersDocument } from "../src/numbers/document.ts";
import { typeName } from "../src/tsp/registry.ts";
import { chartsOf } from "../src/tsch/charts.ts";
import { missingRequired, type MissingRequired, type ProtoSchema } from "../src/tsp/required.ts";
import { loadVendoredSchema } from "./proto-schema.ts";

const PROTO_DIR = new URL("../proto/current/", import.meta.url);
const FIXTURES = new URL("../fixtures/", import.meta.url);
const TEMPLATE = new URL("../fixtures/numbers-parser-v26.0-categories.numbers", import.meta.url);
const CHART_TEMPLATE = new URL("../fixtures/tika-testNumbers2013.numbers", import.meta.url);

const RED = { fill: { kind: "color", color: { r: 1, g: 0.2, b: 0.2, space: "srgb" } } } as const;

export function loadSchema(): ProtoSchema {
  return loadVendoredSchema().detailed;
}

/** Check every archive in a document. */
export function checkDocument(bytes: Uint8Array, schema: ProtoSchema): MissingRequired[] {
  const store = (
    IWorkDocument.open(bytes) as unknown as {
      store: { index: Map<bigint, { obj: { type: number; message: import("../src/base/protobuf.ts").RawMessage; identifier: bigint } }> };
    }
  ).store;
  const out: MissingRequired[] = [];
  for (const { obj } of store.index.values()) {
    const name = typeName(obj.type);
    if (!name || !schema.has(name)) continue;
    for (const problem of missingRequired(obj.message, name, schema)) {
      out.push({ ...problem, path: `obj ${obj.identifier} ${problem.path}` });
    }
  }
  return out;
}

/**
 * One document per authoring path, so a writer that forgets a required
 * field is named by the case that produced it.
 */
export function authoredDocuments(): { name: string; bytes: Uint8Array }[] {
  const template = new Uint8Array(readFileSync(TEMPLATE));
  const cases: { name: string; build: (doc: NumbersDocument) => void }[] = [
    { name: "cells", build: (d) => {
      const t = d.tables()[0]!;
      t.setCell(1, 0, "text"); t.setCell(2, 0, 12.5); t.setCell(3, 0, true);
      t.setCell(4, 0, new Date(Date.UTC(2026, 0, 15)));
    } },
    { name: "formula", build: (d) => d.tables()[0]!.setFormula(5, 1, "=1+2*3", { value: 7 }) },
    { name: "formula-range", build: (d) => {
      const t = d.tables()[0]!;
      t.setCell(6, 1, 1); t.setCell(6, 2, 2); t.setCell(6, 3, 3);
      t.setFormula(6, 4, "=SUM(B7:D7)", { value: 6 });
    } },
    { name: "merge", build: (d) => {
      const t = d.tables()[0]!;
      t.setCell(8, 1, "merged"); t.mergeCells(8, 1, 1, 3);
    } },
    { name: "checkbox", build: (d) =>
      d.tables()[0]!.setCellControl(1, 0, { widget: "checkbox", value: true }) },
    { name: "slider-stepper", build: (d) => {
      const t = d.tables()[0]!;
      t.setCellControl(1, 0, { widget: "slider", minimum: 1, maximum: 50, increment: 0.1, value: 12.3 });
      t.setCellControl(2, 0, { widget: "stepper", minimum: 0, maximum: 10, increment: 1, value: 4 });
    } },
    { name: "conditional-rule", build: (d) => {
      const t = d.tables()[0]!;
      t.setCell(1, 0, -10);
      t.setConditionalRules(1, 0, [{ operator: "<", value: 0, cell: RED }]);
    } },
    { name: "cell-formatting", build: (d) => d.tables()[0]!.setCellFormatting(1, 0, RED) },
    { name: "regroup", build: (d) => {
      const t = d.tables().find((x) => x.name === "Categories")!;
      const categories = t.activeCategories()!;
      const column = categories.groupColumns()[0]!.column!;
      const groups = categories.groups();
      const to = groups.find((g) => g.label !== groups[0]!.label)!;
      t.setCell(groups[0]!.rows[0]!, column, to.label);
      t.regroupCategories();
    } },
    { name: "insert-rows", build: (d) => d.tables()[0]!.insertRows(2, 2) },
  ];

  const out = cases.map(({ name, build }) => {
    const doc = NumbersDocument.load(template);
    build(doc);
    return { name, bytes: doc.save() };
  });

  out.push({ name: "untouched", bytes: NumbersDocument.load(template).save() });
  out.push({
    name: "blankFrom",
    bytes: NumbersDocument.blankFrom(template, { tableName: "Blank" }).save(),
  });

  const chartDoc = NumbersDocument.load(new Uint8Array(readFileSync(CHART_TEMPLATE)));
  const chart = chartsOf((chartDoc as unknown as { store: never }).store)[0];
  if (chart) {
    chart.setSeriesFill(0, { kind: "color", color: { r: 1, g: 0, b: 0, space: "srgb" } });
    chart.setChartType("donut2D");
    out.push({ name: "chart-appearance", bytes: chartDoc.save() });
  }
  return out;
}

function report(label: string, problems: MissingRequired[]): boolean {
  if (problems.length === 0) {
    console.log(`  ok    ${label}`);
    return true;
  }
  console.log(`  FAIL  ${label} — ${problems.length} missing required field(s)`);
  const seen = new Set<string>();
  for (const problem of problems) {
    const key = `${problem.message}.${problem.field}`;
    if (seen.has(key)) continue;
    seen.add(key);
    console.log(`          ${problem.message}.${problem.field} (field ${problem.number})`);
    console.log(`          at ${problem.path}`);
  }
  return false;
}

function main(argv: string[]): number {
  const schema = loadSchema();
  const required = [...schema.values()].reduce(
    (n, message) => n + [...message.values()].filter((f) => f.label === "required").length,
    0,
  );
  console.log(`schema: ${schema.size} messages, ${required} required fields\n`);

  let ok = true;
  const authoredOnly = argv.includes("--authored");

  console.log("documents this library authors:");
  for (const { name, bytes } of authoredDocuments()) {
    ok = report(name, checkDocument(bytes, schema)) && ok;
  }

  if (!authoredOnly) {
    console.log("\nfixtures (a failure here means the vendored schema, not the file):");
    const targets = argv.filter((a) => !a.startsWith("--"));
    const files: string[] = [];
    for (const target of targets.length ? targets : [FIXTURES.pathname]) {
      if (statSync(target).isDirectory()) {
        for (const name of readdirSync(target).sort()) {
          if (/\.(numbers|pages|key)$/.test(name)) files.push(join(target, name));
        }
      } else files.push(target);
    }
    for (const file of files) {
      let bytes: Uint8Array;
      try {
        bytes = new Uint8Array(readFileSync(file));
      } catch {
        continue;
      }
      try {
        report(file.split("/").pop()!, checkDocument(bytes, schema));
      } catch (error) {
        console.log(`  skip  ${file.split("/").pop()} — ${(error as Error).message}`);
      }
    }
  }

  console.log("");
  console.log(ok ? "every authored archive carries its required fields." : "AUTHORED OUTPUT IS MALFORMED — see above.");
  return ok ? 0 : 1;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  process.exitCode = main(process.argv.slice(2));
}
