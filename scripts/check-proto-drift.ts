#!/usr/bin/env node
/**
 * Verify every hand-written field constant against the vendored `.proto`.
 *
 *   node scripts/check-proto-drift.ts          # report
 *   node scripts/check-proto-drift.ts --check  # non-zero exit on any drift
 *
 * ## Why the schemas are vendored but not compiled
 *
 * `proto/` holds 41 schema files — 1296 messages — dumped from the iWork
 * binaries by three independent projects, with provenance in
 * `proto/README.md`. They are the authority for every field number in
 * `src/`, and each schema module cites the message it came from.
 *
 * They are *not* compiled into generated classes, and that is deliberate.
 * This library's central guarantee is that a document round-trips byte for
 * byte, including fields no schema names and fields whose wire type
 * disagrees with the schema — both of which occur in real documents. A
 * generated decoder normalises: it re-encodes canonically, reorders, drops
 * or relocates what it does not recognise. `RawMessage` keeps bytes exactly
 * where Apple put them and re-serialises only along mutated paths, which is
 * what makes 37 of 37 fixtures come back identical.
 *
 * The cost of that choice is a hand-written field number beside every proto
 * field, and hand-written numbers drift. This script is the answer: the
 * constants are checked against the schemas rather than trusted.
 *
 * ## The bug this script found first was its own
 *
 * `DocumentArchive` is defined in five of these families. Matching on the
 * bare message name made `TP.DocumentArchive` answer with `TSK`'s fields,
 * and the script confidently reported three drifts in Pages that did not
 * exist — the 2013 TP dump agrees with the code exactly. Messages are
 * therefore indexed by their `package`, and any future matching shortcut
 * should remember how convincing that wrong answer looked.
 *
 * ## How a constant is matched to a message
 *
 * By the docblock above it. Every schema constant in this repository is
 * introduced by a comment naming its archive — `/** TST.DataStore. *​/` —
 * so the mapping needs no separate registry to fall out of date. A constant
 * with no such comment is reported as unverifiable rather than skipped
 * silently: not being checked is worth knowing about.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";

const PROTO_DIR = fileURLToPath(new URL("../proto/", import.meta.url));
const SRC_DIR = fileURLToPath(new URL("../src/", import.meta.url));

/** message name (unqualified) → field name → number, across every schema. */
type ProtoIndex = Map<string, Map<string, number>>;



/**
 * Parse the field numbers out of a `.proto`.
 *
 * A regex parser rather than a real one, and that is proportionate: the
 * only thing needed is `name = number` inside `message Name { … }`. Nested
 * messages are indexed under both their bare name and `Outer.Inner`,
 * because the docblocks in `src/` use whichever reads better.
 */
function parseProto(text: string): ProtoIndex {
  const index: ProtoIndex = new Map();
  const stack: string[] = [];
  let current: Map<string, number> | undefined;
  // Qualifying by package is not optional: `DocumentArchive` is defined in
  // five of these families, and matching on the bare name made
  // TP.DocumentArchive answer with TSK's fields — three confident,
  // completely wrong "drift" reports.
  const pkg = /^package\s+([A-Za-z0-9_.]+)\s*;/m.exec(text)?.[1] ?? "";

  for (const raw of text.split("\n")) {
    const line = raw.replace(/\/\/.*$/, "").trim();
    if (line.length === 0) continue;

    const message = /^message\s+([A-Za-z0-9_]+)/.exec(line);
    if (message) {
      stack.push(message[1]!);
      current = new Map();
      const qualified = pkg ? `${pkg}.${stack.join(".")}` : stack.join(".");
      index.set(qualified, current);
      continue;
    }
    if (/^enum\s+/.test(line)) {
      stack.push("<enum>");
      continue;
    }
    if (line.startsWith("}")) {
      stack.pop();
      const enclosing = stack.join(".");
      current = enclosing.length > 0 ? index.get(pkg ? `${pkg}.${enclosing}` : enclosing) : undefined;
      continue;
    }
    if (!current) continue;

    const field = /^(?:optional|required|repeated)\s+[.A-Za-z0-9_]+\s+([A-Za-z0-9_]+)\s*=\s*(\d+)/.exec(
      line,
    );
    if (field) current.set(field[1]!, Number(field[2]));
  }
  return index;
}

function loadProtos(): ProtoIndex {
  const merged: ProtoIndex = new Map();
  const walk = (dir: string): void => {
    for (const name of readdirSync(dir)) {
      const path = `${dir}/${name}`;
      if (statSync(path).isDirectory()) {
        walk(path);
        continue;
      }
      if (!name.endsWith(".proto")) continue;
      for (const [message, fields] of parseProto(readFileSync(path, "utf8"))) {
        const existing = merged.get(message);
        if (!existing) {
          merged.set(message, fields);
          continue;
        }
        // Several dumps define the same message; they agree, and where a
        // newer dump adds a field the union is what we want to check
        // against.
        for (const [field, number] of fields) {
          if (!existing.has(field)) existing.set(field, number);
        }
      }
    }
  };
  walk(PROTO_DIR);
  return merged;
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

function main(argv: string[]): number {
  const protos = loadProtos();
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

  const drift = findings.filter((f) => f.kind === "mismatch");
  console.log(
    `${protos.size} messages across the vendored schemas; ` +
      `${checkedConstants}/${constants.length} constants matched to one; ` +
      `${checkedFields} field numbers verified.`,
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

process.exitCode = main(process.argv.slice(2));
