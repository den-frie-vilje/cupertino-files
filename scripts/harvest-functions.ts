#!/usr/bin/env node
/**
 * Discover the TSCE function-index → name mapping by having Numbers
 * author the formulas.
 *
 *   node scripts/harvest-functions.ts --emit-sheet out.tsv # anywhere
 *   node scripts/harvest-functions.ts --drive              # macOS + Numbers
 *   node scripts/harvest-functions.ts --ingest doc.numbers # anywhere
 *   node scripts/harvest-functions.ts --check              # staleness gate
 *
 * ## Why this exists
 *
 * `AST_function_node_index` is an index into a list that lives inside
 * Apple's binaries and appears in no schema, public or dumped. It cannot
 * be derived from a document, because a document records the index and
 * never the name. The only authority is Numbers itself.
 *
 * ## The trick that makes it cheap
 *
 * **A formula that fails to evaluate still stores its function node.**
 * `=ABS()` is a valid parse with a wrong argument count: Numbers keeps the
 * AST and shows an error in the cell. So the harvest needs no per-function
 * argument knowledge — it writes several argument shapes per candidate and
 * keeps whichever one parsed.
 *
 * ## The two paths
 *
 * Both produce the same artifact. `--drive` does the whole thing on a Mac
 * with no human involvement. When that is not possible — no Mac to hand,
 * automation refused, a Numbers version whose scripting dictionary will not
 * set a formula — `--emit-sheet` produces a file Numbers can *open directly*,
 * turning the manual step into "open, save, run one command". The full
 * procedure is in docs/BLOCKERS.md.
 *
 * Wrong candidate names cost nothing: Numbers stores them as an
 * UNKNOWN_FUNCTION node carrying the literal text, and the ingest lists
 * them so the candidate file can be corrected.
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { IWorkDocument } from "../src/tsa/document.ts";
import { refId } from "../src/tsp/schema.ts";
import { AstNodeFields, AstNodeType } from "../src/tst/formulas.ts";
import type { RawMessage } from "../src/base/protobuf.ts";

const CANDIDATES = new URL("../data/numbers-function-candidates.txt", import.meta.url);
const INDEX_JSON = new URL("../data/function-index.json", import.meta.url);
const GENERATED_TS = new URL("../src/tst/function-names.ts", import.meta.url);

/**
 * Argument shapes tried per candidate.
 *
 * Ordered cheapest-first only for readability; every variant is written and
 * the ingest keeps whichever produced a function node. `$E$1:$G$1` points
 * at the sample data the sheet carries in its first row.
 */
const VARIANTS: readonly { label: string; args: string }[] = [
  { label: "none", args: "" },
  { label: "num", args: "1" },
  { label: "num2", args: "1,2" },
  { label: "num3", args: "1,2,3" },
  { label: "range", args: "$E$1:$G$1" },
  { label: "text", args: '"a"' },
  { label: "text2", args: '"a","b"' },
];

interface Harvested {
  /** index → name, only where every observation agreed. */
  functions: Record<string, string>;
  /** Candidate names Numbers did not recognise as functions. */
  unrecognised: string[];
  /** Names that produced conflicting indexes — never trusted. */
  conflicts: { name: string; indexes: number[] }[];
  provenance: {
    /** e.g. "Numbers 26.1 (7048.0.3)". Free text; recorded, not parsed. */
    app: string;
    /** ISO date the harvest ran. */
    harvestedAt: string;
    source: string;
    candidates: number;
  };
}

function candidateNames(): string[] {
  const text = readFileSync(CANDIDATES, "utf8");
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith("#"));
}

/**
 * Build the probe sheet as **tab**-separated text.
 *
 * Numbers opens a delimited text file directly and evaluates cells
 * beginning with `=` exactly as if they had been typed, which is what lets
 * the manual path be "open this file, save it" rather than hours of
 * copy-paste.
 *
 * Tabs rather than commas on purpose: half these formulas contain commas
 * between arguments, and a comma-delimited file would have to quote them —
 * at which point it is anyone's guess whether Numbers treats a quoted
 * `"=SUM(1,2)"` as a formula or as text. With tabs the question never
 * arises.
 *
 * Layout: column A the candidate name, B the variant label, C the formula,
 * and E1:G1 numeric sample data for the range variant. The name sits beside
 * its formula rather than being inferred from row order, so a Numbers
 * version that drops or reorders a row cannot silently misattribute an id.
 */
function buildProbeSheet(names: readonly string[]): string {
  const rows: string[] = ["name\tvariant\tformula\t\t1\t2\t3"];
  for (const name of names) {
    for (const variant of VARIANTS) {
      rows.push(`${name}\t${variant.label}\t=${name}(${variant.args})`);
    }
  }
  return `${rows.join("\n")}\n`;
}

const PROBE_COLUMN = { NAME: 0, VARIANT: 1, FORMULA: 2 } as const;

/** The variant labels a genuine probe row carries in column B. */
const VARIANT_LABELS = new Set(VARIANTS.map((v) => v.label));

/**
 * Cheap sanity filter on a harvested name.
 *
 * Spreadsheet function names are upper-case letters and digits. Rejecting
 * anything else is a second line of defence behind the variant-label check
 * — a row labelled like a probe but carrying "TOTAL:" is a misread, not a
 * discovery.
 */
function isPlausibleFunctionName(name: string): boolean {
  return /^[A-Z][A-Z0-9.]*$/.test(name);
}

/**
 * One function call, written out as text: `NAME(` and nothing else like it.
 *
 * Used to recognise the *other* useful sheet layout — one where a column
 * spells a formula out as a string beside a column that actually computes
 * it. Any test or documentation spreadsheet built to demonstrate functions
 * tends to look like this, which makes such a document a harvest source
 * without anyone having to author the probe sheet.
 */
const FUNCTION_CALL_IN_TEXT = /\b([A-Z][A-Z0-9.]*)\s*\(/g;

/**
 * Harvest from a "name as text beside the live formula" sheet.
 *
 * The pairing is only accepted when the text names **exactly one** function
 * and the neighbouring formula's AST holds **exactly one** function node.
 * That is deliberately strict: with one of each there is nothing to line up
 * and no ordering to get wrong, whereas a nested call would need the text's
 * outside-in order reconciled against the AST's inside-out order for no
 * extra coverage — a sheet demonstrating `SUM(IF(…))` almost always
 * demonstrates `SUM` and `IF` on their own rows too.
 *
 * Every candidate still goes through the same conflict check as the probe
 * sheet, so an index claimed by two names is dropped rather than guessed.
 */
function collectPairedColumns(
  table: ReturnType<IWorkDocument["tables"]>[number],
  formulaTable: ReturnType<typeof formulaTableOf>,
  observations: Map<string, Set<number>>,
): number {
  let paired = 0;
  for (let column = 0; column + 1 < table.columnCount; column++) {
    for (let row = 0; row < table.rowCount; row++) {
      // The text cell must not itself be a formula: a cell computing
      // `="SUM("&…` is not a label.
      if (table.formulaId(row, column) !== undefined) continue;
      const text = table.cellText(row, column).trim();
      if (text.length === 0) continue;
      const names = [...text.matchAll(FUNCTION_CALL_IN_TEXT)].map((m) => m[1]!);
      if (names.length !== 1) continue;
      const name = names[0]!;
      if (!isPlausibleFunctionName(name)) continue;

      const formulaId = table.formulaId(row, column + 1);
      if (formulaId === undefined) continue;
      const indexes = astNodes(formulaTable.get(formulaId))
        .filter((node) => node.getUint(AstNodeFields.TYPE) === AstNodeType.FUNCTION)
        .map((node) => node.getUint(AstNodeFields.FUNCTION_INDEX))
        .filter((index): index is number => index !== undefined);
      if (indexes.length !== 1) continue;

      const seen = observations.get(name) ?? new Set<number>();
      seen.add(indexes[0]!);
      observations.set(name, seen);
      paired++;
    }
  }
  return paired;
}

/**
 * Read harvested documents back into a mapping.
 *
 * Two layouts are understood. In the probe sheet this script emits, column
 * A gives the name we asked for, column B carries a variant label proving
 * the row is ours, and column C holds the formula Numbers built. In the
 * paired-column layout, a text column spells a call out beside a column
 * that computes it — see {@link collectPairedColumns}.
 *
 * Walking a formula's AST for a FUNCTION node yields the index; an
 * UNKNOWN_FUNCTION node means Numbers did not recognise the name.
 */
function ingest(paths: readonly string[], appLabel: string): Harvested {
  const observations = new Map<string, Set<number>>();
  const unrecognised = new Set<string>();
  const skipped: string[] = [];
  let tablesSeen = 0;

  for (const path of paths) {
    let doc: IWorkDocument;
    try {
      doc = IWorkDocument.open(new Uint8Array(readFileSync(path)));
    } catch (error) {
      // Harvesting a directory of documents should not stop at the first
      // one that will not open. Say which, and carry on: a run over
      // twenty sheets is worth more than an exact exit code.
      skipped.push(`${path}: ${error instanceof Error ? error.message : String(error)}`);
      continue;
    }
    for (const table of doc.tables()) {
      if (table.storageGeneration !== "v5") continue;
      tablesSeen++;
      const formulaTable = formulaTableOf(doc, table.object.message);
      if (formulaTable.size === 0) continue;

      for (let row = 0; row < table.rowCount; row++) {
        const name = table.cellText(row, PROBE_COLUMN.NAME).trim();
        // Column B must hold one of our variant labels. Without this guard a
        // harvest run against a document containing any other table happily
        // attributes that table's formulas to whatever text sits in its first
        // column — which is how an early run recorded 168 as "TOTAL:".
        const variant = table.cellText(row, PROBE_COLUMN.VARIANT).trim();
        if (!VARIANT_LABELS.has(variant)) continue;
        if (!isPlausibleFunctionName(name)) continue;
        const formulaId = table.formulaId(row, PROBE_COLUMN.FORMULA);
        if (formulaId === undefined) continue;
        const nodes = astNodes(formulaTable.get(formulaId));
        for (const node of nodes) {
          const type = node.getUint(AstNodeFields.TYPE);
          if (type === AstNodeType.FUNCTION) {
            const index = node.getUint(AstNodeFields.FUNCTION_INDEX);
            if (index === undefined) continue;
            const seen = observations.get(name) ?? new Set<number>();
            seen.add(Number(index));
            observations.set(name, seen);
          } else if (type === AstNodeType.UNKNOWN_FUNCTION) {
            unrecognised.add(name);
          }
        }
      }

      collectPairedColumns(table, formulaTable, observations);
    }
  }

  if (tablesSeen === 0) {
    throw new Error(
      `no readable tables in ${paths.length} document(s) — was the sheet saved from Numbers ` +
        `after opening it?${skipped.length ? `\n  skipped: ${skipped.join("\n  skipped: ")}` : ""}`,
    );
  }
  for (const note of skipped) console.error(`  skipped ${note}`);

  const functions: Record<string, string> = {};
  const conflicts: { name: string; indexes: number[] }[] = [];
  const byIndex = new Map<number, string>();
  for (const [name, indexes] of observations) {
    if (indexes.size !== 1) {
      conflicts.push({ name, indexes: [...indexes].sort((a, b) => a - b) });
      continue;
    }
    const index = [...indexes][0]!;
    const existing = byIndex.get(index);
    if (existing !== undefined && existing !== name) {
      // Two names claiming one index means one of them is an alias Numbers
      // rewrote, or the sheet was misread. Trust neither.
      conflicts.push({ name: `${existing}/${name}`, indexes: [index] });
      delete functions[String(index)];
      continue;
    }
    byIndex.set(index, name);
    functions[String(index)] = name;
  }

  return {
    functions: Object.fromEntries(
      Object.entries(functions).sort(([a], [b]) => Number(a) - Number(b)),
    ),
    unrecognised: [...unrecognised].filter((name) => !observations.has(name)).sort(),
    conflicts: conflicts.sort((a, b) => a.name.localeCompare(b.name)),
    provenance: {
      app: appLabel,
      harvestedAt: new Date().toISOString().slice(0, 10),
      source: "scripts/harvest-functions.ts",
      candidates: candidateNames().length,
    },
  };
}

function formulaTableOf(doc: IWorkDocument, tableModel: RawMessage): Map<number, RawMessage> {
  const out = new Map<number, RawMessage>();
  const list = doc.store.resolve(refId(tableModel.getMessage(4), 6));
  for (const entry of list?.message.getMessages(3) ?? []) {
    const key = entry.getUint(1);
    const formula = entry.getMessage(5);
    if (key !== undefined && formula) out.set(key, formula);
  }
  return out;
}

function astNodes(formula: RawMessage | undefined): RawMessage[] {
  return formula?.getMessage(1)?.getMessages(1) ?? [];
}

/**
 * Is the index consistent with alphabetical ordering?
 *
 * Worth asking: if Apple assigns indexes alphabetically over its full
 * function list, a partial harvest predicts the rest and the gaps become
 * checkable rather than unknown. Reported, never assumed — extrapolating
 * from a correlation is exactly the guessing this tooling exists to avoid.
 */
function alphabeticalReport(functions: Record<string, string>): string {
  const pairs = Object.entries(functions)
    .map(([index, name]) => ({ index: Number(index), name }))
    .sort((a, b) => a.index - b.index);
  if (pairs.length < 3) return "too few mappings to test the alphabetical hypothesis";
  let ascending = 0;
  for (let i = 1; i < pairs.length; i++) {
    if (pairs[i]!.name.localeCompare(pairs[i - 1]!.name) > 0) ascending++;
  }
  const ratio = ascending / (pairs.length - 1);
  const verdict =
    ratio > 0.95
      ? "consistent with a single alphabetical list — worth verifying, still not proof"
      : ratio > 0.6
        ? "partly ordered; likely alphabetical within categories"
        : "not alphabetical";
  return `alphabetical ordering: ${(ratio * 100).toFixed(0)}% of adjacent pairs ascend — ${verdict}`;
}

/** Emit the checked-in TS table the library actually reads. */
function generateTypeScript(harvested: Harvested): string {
  const entries = Object.entries(harvested.functions).sort(([a], [b]) => Number(a) - Number(b));
  const lines: string[] = [];
  lines.push("/**");
  lines.push(" * TSCE function-index → name, measured from a real Numbers install.");
  lines.push(" *");
  lines.push(" * GENERATED — do not edit by hand. Regenerate with:");
  lines.push(" *   node scripts/harvest-functions.ts --ingest <doc.numbers>");
  lines.push(" *");
  lines.push(" * This mapping exists in no schema; it can only be measured by having");
  lines.push(" * Numbers author the formulas. See docs/BLOCKERS.md for the procedure");
  lines.push(" * and the ledger of who ran it against which version.");
  lines.push(" *");
  if (entries.length === 0) {
    lines.push(" * Harvested: not yet run — the table below is empty by design. The one");
    lines.push(" * mapping in effect (168 = SUM) is proven by the fixture corpus and lives");
    lines.push(" * in BUILTIN_FUNCTIONS, not here.");
  } else {
    lines.push(` * Harvested: ${harvested.provenance.harvestedAt} from ${harvested.provenance.app}`);
  }
  lines.push(` * Coverage:  ${entries.length} of ${harvested.provenance.candidates} candidates`);
  lines.push(" */");
  lines.push("export const HARVESTED_FUNCTIONS: ReadonlyMap<number, string> = new Map([");
  for (const [index, name] of entries) lines.push(`  [${index}, ${JSON.stringify(name)}],`);
  lines.push("]);");
  lines.push("");
  lines.push("/** Provenance of the table above, surfaced for diagnostics. */");
  lines.push("export const HARVEST_PROVENANCE = {");
  lines.push(`  app: ${JSON.stringify(harvested.provenance.app)},`);
  lines.push(`  harvestedAt: ${JSON.stringify(harvested.provenance.harvestedAt)},`);
  lines.push(`  functions: ${entries.length},`);
  lines.push(`  candidates: ${harvested.provenance.candidates},`);
  lines.push("} as const;");
  lines.push("");
  return lines.join("\n");
}

function write(harvested: Harvested): void {
  mkdirSync(dirname(fileURLToPath(INDEX_JSON)), { recursive: true });
  writeFileSync(INDEX_JSON, `${JSON.stringify(harvested, null, 2)}\n`);
  writeFileSync(GENERATED_TS, generateTypeScript(harvested));
  console.log(`wrote ${fileURLToPath(INDEX_JSON)}`);
  console.log(`wrote ${fileURLToPath(GENERATED_TS)}`);
}

function osascript(script: string): string {
  return execFileSync("osascript", ["-e", script], {
    encoding: "utf8",
    timeout: 600_000,
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

/** Full automation: build the sheet, let Numbers convert it, ingest the result. */
function drive(): void {
  if (process.platform !== "darwin") {
    console.error(
      `--drive requires macOS (running on ${process.platform}).\n` +
        "Use --emit-sheet and follow docs/BLOCKERS.md instead.",
    );
    process.exit(1);
  }
  const probePath = "/tmp/iwork-function-harvest.tsv";
  const docPath = "/tmp/iwork-function-harvest.numbers";
  writeFileSync(probePath, buildProbeSheet(candidateNames()));
  console.log(
    `wrote ${probePath} (${candidateNames().length} candidates × ${VARIANTS.length} variants)`,
  );

  const version = osascript('tell application "Numbers" to return version');
  // Let the extension pick the format rather than naming a save enumerator,
  // whose spelling has varied across Numbers versions.
  osascript(
    `tell application "Numbers"\n` +
      `  set theDoc to open POSIX file ${JSON.stringify(probePath)}\n` +
      `  save theDoc in POSIX file ${JSON.stringify(docPath)}\n` +
      `  close theDoc saving no\n` +
      `end tell`,
  );
  report(ingest([docPath], `Numbers ${version}`));
}

function report(harvested: Harvested): void {
  const count = Object.keys(harvested.functions).length;
  console.log(`\nresolved:     ${count} function indexes`);
  console.log(`unrecognised: ${harvested.unrecognised.length} candidate names`);
  console.log(`conflicts:    ${harvested.conflicts.length}`);
  console.log(alphabeticalReport(harvested.functions));
  if (harvested.unrecognised.length > 0) {
    console.log(`\nnot recognised by Numbers (fix or drop in data/numbers-function-candidates.txt):`);
    console.log(`  ${harvested.unrecognised.join(", ")}`);
  }
  for (const conflict of harvested.conflicts) {
    console.log(`  CONFLICT ${conflict.name} → ${conflict.indexes.join(", ")}`);
  }
  write(harvested);
}

function main(): void {
  const args = process.argv.slice(2);
  const valueFor = (flag: string): string | undefined => {
    const i = args.indexOf(flag);
    return i >= 0 ? args[i + 1] : undefined;
  };

  if (args.includes("--drive")) {
    drive();
    return;
  }

  const sheetOut = valueFor("--emit-sheet");
  if (sheetOut !== undefined) {
    const names = candidateNames();
    writeFileSync(sheetOut, buildProbeSheet(names));
    console.log(
      `wrote ${sheetOut}: ${names.length} candidates × ${VARIANTS.length} variants ` +
        `= ${names.length * VARIANTS.length} probe rows`,
    );
    console.log(
      "Next: open it in Numbers, save as .numbers, then run --ingest. See docs/BLOCKERS.md.",
    );
    return;
  }

  const ingestPath = valueFor("--ingest");
  if (ingestPath !== undefined) {
    // Everything after --ingest that is not a flag is another document.
    // Function coverage comes from many small sheets more often than one
    // big one, and merging them in a single pass is what makes the
    // conflict check meaningful across sources.
    // Contiguous only: stop at the next flag, so `--ingest a b --app X`
    // does not swallow X as a third document.
    const after = args.slice(args.indexOf("--ingest") + 2);
    const extra: string[] = [];
    for (const arg of after) {
      if (arg.startsWith("--")) break;
      extra.push(arg);
    }
    const paths = [ingestPath, ...extra];
    const missing = paths.filter((p) => !existsSync(p));
    if (missing.length > 0) {
      console.error(`no such file: ${missing.join(", ")}`);
      process.exit(1);
    }
    const harvested = ingest(paths, valueFor("--app") ?? "unknown Numbers version");
    if (args.includes("--dry-run")) {
      // Machine-readable and side-effect free, so the ingest can be
      // exercised by the test suite without a Mac and without touching
      // the checked-in table.
      console.log(JSON.stringify(harvested, null, 2));
      return;
    }
    report(harvested);
    return;
  }

  if (args.includes("--regenerate")) {
    // Rewrite the generated table from the recorded harvest — for when the
    // JSON is edited directly (provenance, a corrected name) without a
    // fresh run.
    const recorded = JSON.parse(readFileSync(INDEX_JSON, "utf8")) as Harvested;
    writeFileSync(GENERATED_TS, generateTypeScript(recorded));
    console.log(`wrote ${fileURLToPath(GENERATED_TS)}`);
    return;
  }

  if (args.includes("--check")) {
    // The generated table must match the recorded harvest, so a hand-edit
    // to either one is caught rather than quietly diverging.
    if (!existsSync(fileURLToPath(INDEX_JSON))) {
      console.log("checked");
      return;
    }
    const recorded = JSON.parse(readFileSync(INDEX_JSON, "utf8")) as Harvested;
    const expected = generateTypeScript(recorded);
    const actual = existsSync(fileURLToPath(GENERATED_TS))
      ? readFileSync(GENERATED_TS, "utf8")
      : "";
    if (expected !== actual) {
      console.error(
        "src/tst/function-names.ts is out of date with data/function-index.json.\n" +
          "Run: node scripts/harvest-functions.ts --ingest <doc.numbers>",
      );
      process.exit(1);
    }
    console.log("checked");
    return;
  }

  console.log(
    [
      "Discover the TSCE function-index → name mapping.",
      "",
      "  --emit-sheet <path>    build the probe sheet, tab-separated (works anywhere)",
      "  --drive                run the whole harvest via Numbers (macOS only)",
      "  --ingest <doc.numbers> read a harvested document back",
      "  --dry-run              with --ingest: print JSON, write nothing",
      "  --app <label>          record which Numbers version produced it",
      "  --check                verify the generated table matches the recorded harvest",
      "  --regenerate           rewrite the generated table from the recorded harvest",
      "",
      "See docs/BLOCKERS.md for the manual procedure.",
    ].join("\n"),
  );
}

main();
