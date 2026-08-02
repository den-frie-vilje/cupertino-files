/**
 * What is still hand-typed, and does it contradict the schema?
 *
 * Most field numbers no longer live here to be checked: they are resolved
 * from the vendored schemas at module load by `src/proto/fields.ts`, so
 * they cannot disagree with Apple in the first place. This script covers
 * the residue — the constants that could not move — and its output is
 * mostly a to-do list rather than a verdict.
 *
 * Two kinds remain, both legitimate:
 *
 *   * **Archive type ids.** `TSWP_TYPE.STORAGE = 2001` is the app's own
 *     object-type registry and appears in no `.proto`. No schema will ever
 *     supply it; the corpus is the only authority.
 *   * **Numbers the dumps predate.** The shared families are Numbers 14.4
 *     and the Pages-specific ones are Pages 5.0 from 2013.
 *
 * A `mismatch` finding is still a real bug and the suite fails on one. The
 * other three categories are informational: they say how much is not being
 * checked, which is the number to drive down.
 *
 * `test/proto-drift.test.ts` runs this, so it can no longer sit red
 * unnoticed — which it did, over a constant named `ITEM` that matched a
 * deprecated `item = 1` when it meant `tsce_item = 2`.
 *
 * Usage: `npm run proto:check`.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { loadVendoredSchema } from "./proto-schema.ts";

const SRC_DIR = fileURLToPath(new URL("../src/", import.meta.url));

/** message name (unqualified) → field name → number, across every schema. */
type ProtoIndex = Map<string, Map<string, number>>;



/**
 * Index the vendored schemas by message name — bare *and* qualified.
 *
 * The docblocks in `src/` name an archive whichever way reads better
 * (`TileRowInfo` in one place, `TST.TileStorage.Tile` in another), so both
 * spellings resolve. Where two dumps define a message the union of their
 * fields is what a constant should be checked against.
 */
function loadProtos(): { index: ProtoIndex; messages: number } {
  const merged: ProtoIndex = new Map();
  const add = (name: string, fields: Map<string, number>): void => {
    let existing = merged.get(name);
    if (!existing) merged.set(name, (existing = new Map()));
    for (const [field, number] of fields) if (!existing.has(field)) existing.set(field, number);
  };
  const schema = loadVendoredSchema().messages;
  for (const [qualified, fields] of schema) {
    add(qualified, fields);
    add(qualified.slice(qualified.lastIndexOf(".") + 1), fields);
    // `Outer.Inner` as well as `TSP.Outer.Inner`, for the same reason.
    const parts = qualified.split(".");
    if (parts.length > 2) add(parts.slice(-2).join("."), fields);
  }
  return { index: merged, messages: schema.size };
}

interface Constant {
  file: string;
  name: string;
  /** Archive named in the docblock, e.g. "TST.DataStore". */
  archive: string | undefined;
  entries: { key: string; value: number }[];
}

/** Every `const XxxFields = { KEY: n, … }` in src/, with its docblock. */
function collectConstants(): Constant[] {
  const out: Constant[] = [];
  const walk = (dir: string): void => {
    for (const name of readdirSync(dir)) {
      const path = `${dir}/${name}`;
      if (statSync(path).isDirectory()) {
        walk(path);
        continue;
      }
      if (!name.endsWith(".ts")) continue;
      const lines = readFileSync(path, "utf8").split("\n");
      for (let i = 0; i < lines.length; i++) {
        const declaration = /^\s*(?:export\s+)?const\s+([A-Za-z0-9_]+)\s*=\s*\{\s*$/.exec(lines[i]!);
        if (!declaration) continue;

        const entries: { key: string; value: number }[] = [];
        let j = i + 1;
        for (; j < lines.length && !/^\s*\}/.test(lines[j]!); j++) {
          const entry = /^\s*([A-Z][A-Z0-9_]*)\s*:\s*(\d+)\s*,?\s*(?:\/\/.*)?$/.exec(lines[j]!);
          if (entry) entries.push({ key: entry[1]!, value: Number(entry[2]) });
        }
        if (entries.length === 0) continue;

        out.push({
          file: path.slice(SRC_DIR.length),
          name: declaration[1]!,
          archive: archiveAbove(lines, i),
          entries,
        });
        i = j;
      }
    }
  };
  walk(SRC_DIR);
  return out;
}

/** The archive named in the comment block immediately above a declaration. */
function archiveAbove(lines: readonly string[], at: number): string | undefined {
  for (let i = at - 1; i >= 0 && i >= at - 30; i--) {
    const line = lines[i]!;
    const match = /\b((?:TSP|TSK|TSS|TSD|TSWP|TSA|TSCH|TST|TSCK|TSCE|KN|TN|TP)\.[A-Za-z0-9_.]+)/.exec(
      line,
    );
    if (match) return match[1]!.replace(/\.$/, "");
    // Stop at the top of the comment block, so a constant with no docblock
    // does not inherit the previous one's archive.
    if (/^\s*\/\*\*/.test(line)) return undefined;
    if (line.trim().length === 0) return undefined;
  }
  return undefined;
}

/**
 * SCREAMING_SNAKE for a proto field name, the convention used throughout.
 *
 * Apple's dumps mix conventions inside one message — `slide_tree` beside
 * `slideNumbersVisible`, `custom_textDelivery` — so a plain upper-case is
 * not enough: it turns `slideTree` into SLIDETREE and reports a false
 * mismatch against SLIDE_TREE. Splitting camel humps first fixes 200 of
 * those.
 */
function screamingSnake(field: string): string {
  return field
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1_$2")
    .toUpperCase();
}

interface Finding {
  kind: "mismatch" | "unknown-field" | "unknown-archive" | "unverifiable";
  constant: string;
  file: string;
  detail: string;
}

export interface DriftReport {
  /** Messages found across the vendored dumps. */
  messages: number;
  /** Constant groups whose docblock named an archive we could resolve. */
  matchedConstants: number;
  totalConstants: number;
  /** Individual field numbers compared against the schema. */
  checkedFields: number;
  findings: Finding[];
}

/**
 * The whole check, as data.
 *
 * Exported so the test suite can assert on it. `npm run proto:check` was
 * red for an unknown length of time — one constant named `ITEM` matching
 * `item = 1` when it meant `tsce_item = 2` — and nothing noticed, because
 * the one check that compares our field numbers against Apple's schema was
 * the only one not wired into `npm test`.
 */
export function driftReport(): DriftReport {
  const { index: protos, messages } = loadProtos();
  const constants = collectConstants();
  const findings: Finding[] = [];
  let checkedFields = 0;
  let checkedConstants = 0;

  for (const constant of constants) {
    if (!constant.archive) {
      findings.push({
        kind: "unverifiable",
        constant: constant.name,
        file: constant.file,
        detail: "no archive named in the docblock above it",
      });
      continue;
    }
    const fields = protos.get(constant.archive);
    if (!fields) {
      findings.push({
        kind: "unknown-archive",
        constant: constant.name,
        file: constant.file,
        detail: `${constant.archive} is in no vendored .proto`,
      });
      continue;
    }
    checkedConstants++;

    const byNumber = new Map<number, string[]>();
    for (const [field, number] of fields) {
      if (!byNumber.has(number)) byNumber.set(number, []);
      byNumber.get(number)!.push(field);
    }

    for (const { key, value } of constant.entries) {
      const named = [...fields].find(([field]) => screamingSnake(field) === key);
      if (named) {
        checkedFields++;
        if (named[1] !== value) {
          findings.push({
            kind: "mismatch",
            constant: constant.name,
            file: constant.file,
            detail: `${key} = ${value}, but ${constant.archive}.${named[0]} = ${named[1]}`,
          });
        }
        continue;
      }
      // The name does not match, but the *number* may still be a real
      // field under a different spelling — which is fine, and worth
      // showing so the constant can be renamed to match.
      const occupant = byNumber.get(value);
      findings.push({
        kind: "unknown-field",
        constant: constant.name,
        file: constant.file,
        detail: occupant
          ? `${key} = ${value} is ${constant.archive}.${occupant.join("/")} under another name`
          : `${key} = ${value} names no field of ${constant.archive}`,
      });
    }
  }

  return {
    messages,
    matchedConstants: checkedConstants,
    totalConstants: constants.length,
    checkedFields,
    findings,
  };
}

function main(argv: string[]): number {
  const report = driftReport();
  const { findings } = report;
  const drift = findings.filter((f) => f.kind === "mismatch");
  console.log(
    `${report.messages} messages across the vendored schemas; ` +
      `${report.matchedConstants}/${report.totalConstants} constants matched to one; ` +
      `${report.checkedFields} field numbers verified.`,
  );

  const groups: Finding["kind"][] = ["mismatch", "unknown-field", "unknown-archive", "unverifiable"];
  const titles: Record<Finding["kind"], string> = {
    mismatch: "DRIFT — a constant disagrees with a current schema",
    "unknown-field": "not in the schema by that name (rename, or a field the dump predates)",
    "unknown-archive": "archive not in any vendored dump (newer than 14.4, or app-specific)",
    unverifiable: "no archive named in the docblock, so nothing checks it",
  };
  for (const kind of groups) {
    const group = findings.filter((f) => f.kind === kind);
    if (group.length === 0) continue;
    console.log(`\n${titles[kind]} — ${group.length}`);
    for (const finding of group.slice(0, kind === "mismatch" ? 100 : 25)) {
      console.log(`  ${finding.file} ${finding.constant}: ${finding.detail}`);
    }
    if (group.length > 25 && kind !== "mismatch") console.log(`  … and ${group.length - 25} more`);
  }

  if (drift.length === 0) console.log("\nNo constant contradicts a vendored schema.");
  return argv.includes("--check") && drift.length > 0 ? 1 : 0;
}

// Importable: `test/proto-drift.test.ts` asserts on {@link driftReport}.
if (import.meta.filename === process.argv[1]) process.exitCode = main(process.argv.slice(2));
