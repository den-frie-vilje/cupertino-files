#!/usr/bin/env node
/**
 * Dump every predicate in a document, so the `predicate_type` enum can be
 * mapped from a document whose conditions are known.
 *
 *   node scripts/harvest-predicates.ts <file...> [--json] [--table]
 *
 * A predicate stores its condition twice: as a TSCE formula, and as
 * `predicate_type` plus operands (docs/FORMAT.md §14.7). The formula's
 * terminal node is the *documented* comparison enum, so it can be used to
 * pin down what a given `predicate_type` means — which is the one thing
 * standing between reading conditional-formatting rules and writing them.
 *
 * This does not guess. It reports each pairing it finds and marks the ones
 * already recorded in `PREDICATE_TYPE_OPERATORS`, so a run against a
 * purpose-built document (docs/MANUAL-WORK.md, protocol 4) shows exactly
 * which rows are new. Conditions with no simple operator — "text contains",
 * "between" — compile to function calls and are reported with their
 * operator blank rather than forced into the map.
 */
import { readFileSync } from "node:fs";
import { IWorkDocument } from "../src/tsa/document.ts";
import { tablesOf } from "../src/tst/tables.ts";
import { typeName } from "../src/tsp/registry.ts";
import { readPredicate, PREDICATE_TYPE_OPERATORS, type Predicate } from "../src/tst/predicates.ts";
import { ConditionalStyleSet } from "../src/tst/conditional.ts";

interface Row {
  file: string;
  source: "conditional" | "filter";
  table: string;
  /** Position within its rule set, which is authoring order. */
  rule: number;
  predicateType: number | undefined;
  qualifier1: number | undefined;
  qualifier2: number | undefined;
  /** From the formula AST — the authoritative reading. */
  operator: string | undefined;
  operands: string;
  condition: string;
  /** Already in PREDICATE_TYPE_OPERATORS with this operator. */
  known: boolean;
  /** Recorded with a *different* operator: a real conflict worth seeing. */
  conflict: boolean;
  unknownFunctions: number[];
}

function rowsFor(path: string): Row[] {
  const out: Row[] = [];
  const document = IWorkDocument.open(new Uint8Array(readFileSync(path)));
  const file = path.split("/").pop() ?? path;

  const push = (
    source: Row["source"],
    table: string,
    rule: number,
    predicate: Predicate | undefined,
  ): void => {
    if (!predicate) return;
    const recorded =
      predicate.predicateType === undefined
        ? undefined
        : PREDICATE_TYPE_OPERATORS.get(predicate.predicateType);
    out.push({
      file,
      source,
      table,
      rule,
      predicateType: predicate.predicateType,
      qualifier1: predicate.qualifier1,
      qualifier2: predicate.qualifier2,
      operator: predicate.operator,
      operands: predicate.operands
        .map((operand) =>
          operand.kind === "number"
            ? `number ${operand.number}`
            : operand.kind === "string"
              ? `string ${JSON.stringify(operand.string)}`
              : operand.kind,
        )
        .join(", "),
      condition: predicate.text,
      known: recorded !== undefined && recorded === predicate.operator,
      conflict: recorded !== undefined && predicate.operator !== undefined && recorded !== predicate.operator,
      unknownFunctions: predicate.formula.unknownFunctions,
    });
  };

  for (const table of tablesOf(document.store)) {
    for (const set of table.conditionalStyleSets().values()) {
      const label = table.name ?? `table ${table.object.identifier}`;
      for (const rule of set.rules()) push("conditional", label, rule.index, rule.predicate);
    }
    const { rows, columns } = table.filterSets();
    for (const set of [rows, columns]) {
      for (const rule of set?.rules() ?? []) {
        push("filter", table.name ?? `table ${table.object.identifier}`, rule.index, rule.predicate);
      }
    }
  }

  // Rule sets not reachable from a table still carry predicates worth
  // seeing — an orphan is a bug in the traversal, and silence would hide it.
  const reached = new Set(
    tablesOf(document.store).flatMap((table) => [...table.conditionalStyleSets().values()].map((s) => s.id)),
  );
  for (const { obj } of document.store.allObjects()) {
    if (!(typeName(obj.type, document.app) ?? "").endsWith("ConditionalStyleSetArchive")) continue;
    if (reached.has(obj.identifier)) continue;
    const set = new ConditionalStyleSet(document.store, obj, -1);
    for (const rule of set.rules()) push("conditional", `(orphan ${obj.identifier})`, rule.index, rule.predicate);
  }
  return out;
}

function render(rows: Row[]): string {
  const header = ["type", "q1", "q2", "operator", "operands", "condition", "source", "table", "#"];
  const body = rows.map((row) => [
    String(row.predicateType ?? "—") + (row.conflict ? " ⚠" : row.known ? " ✓" : ""),
    String(row.qualifier1 ?? "—"),
    String(row.qualifier2 ?? "—"),
    row.operator ?? "(not a comparison)",
    row.operands || "—",
    row.condition || "—",
    row.source,
    row.table,
    String(row.rule),
  ]);
  const widths = header.map((_, i) =>
    Math.max(header[i]!.length, ...body.map((cells) => cells[i]!.length)),
  );
  const line = (cells: string[]): string =>
    cells.map((cell, i) => cell.padEnd(widths[i]!)).join("  ").trimEnd();
  return [line(header), line(widths.map((w) => "-".repeat(w))), ...body.map(line)].join("\n");
}

/** The block to paste into PREDICATE_TYPE_OPERATORS, newly-learned pairs only. */
function suggest(rows: Row[]): string[] {
  const learned = new Map<number, string>();
  for (const row of rows) {
    if (row.predicateType === undefined || row.operator === undefined) continue;
    if (PREDICATE_TYPE_OPERATORS.has(row.predicateType)) continue;
    learned.set(row.predicateType, row.operator);
  }
  return [...learned]
    .sort((a, b) => a[0] - b[0])
    .map(([type, operator]) => `  [${type}, "${operator}"],`);
}

function main(argv: string[]): number {
  const files = argv.filter((arg) => !arg.startsWith("--"));
  if (files.length === 0) {
    console.error("usage: node scripts/harvest-predicates.ts <file...> [--json]");
    return 2;
  }
  const rows = files.flatMap(rowsFor);

  if (argv.includes("--json")) {
    console.log(JSON.stringify(rows, null, 2));
    return 0;
  }

  if (rows.length === 0) {
    console.log("no predicates found — the document has no conditional formatting or filter rules");
    return 0;
  }
  console.log(render(rows));

  const conflicts = rows.filter((row) => row.conflict);
  if (conflicts.length > 0) {
    console.log(`\n⚠ ${conflicts.length} predicate(s) contradict PREDICATE_TYPE_OPERATORS.`);
    console.log("  The formula is authoritative — the shipped map needs correcting, not the file.");
    for (const row of conflicts) {
      console.log(
        `    type ${row.predicateType}: file says ${row.operator}, map says ${PREDICATE_TYPE_OPERATORS.get(row.predicateType!)}`,
      );
    }
  }

  const unnamed = [...new Set(rows.flatMap((row) => row.unknownFunctions))];
  if (unnamed.length > 0) {
    console.log(
      `\nConditions compiled to unnamed functions: ${unnamed.join(", ")} — harvest these with scripts/harvest-functions.ts.`,
    );
  }

  const additions = suggest(rows);
  console.log(
    additions.length === 0
      ? "\nNothing new: every comparison here is already recorded."
      : `\nNew pairings for PREDICATE_TYPE_OPERATORS in src/tst/predicates.ts:\n${additions.join("\n")}`,
  );
  return conflicts.length > 0 ? 1 : 0;
}

process.exitCode = main(process.argv.slice(2));
