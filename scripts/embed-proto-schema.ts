/**
 * Carry the vendored `.proto` schemas into the library.
 *
 * `src/proto/fields.ts` explains why field numbers are looked up rather
 * than typed. This is the other half: the protos are 504 KiB across 41
 * files and parsing them costs 57 ms, which is not something a library may
 * do at import — and reading them from disk at all would put `node:fs` in
 * the core of a package that currently runs in a browser.
 *
 * So the numbers are extracted ahead of time into `src/proto/vendored.ts`,
 * a generated module that is checked in. It holds **only the archives the
 * code actually names**, found by scanning for `protoFields("…")` and
 * `measuredFields("…")` calls, which keeps it a few kilobytes rather than
 * the 237 KiB a full dump would be.
 *
 * The generated file is not the authority; `proto/` is. `--check`
 * regenerates and compares, so a refreshed dump that nobody re-embedded
 * fails the suite, and so does a hand-edit of the generated module.
 *
 * ## Merging 41 files
 *
 * A message can be declared in several files — `TSS.ThemeArchive` appears
 * in six, because each family `extend`s it. Merging is safe, and measured
 * to be: across every vendored file, no field *number* maps to two
 * different names, and exactly one field *name* maps to two different
 * numbers.
 *
 * That one is `extension`, the name protobuf convention gives every
 * extension field: `TSA`, `TSCH`, `TSD`, `TST` and `TSWP` each extend
 * `TSS.ThemeArchive` with a field called `extension`, at 210, 120, 100,
 * 200 and 110. The name carries no information and the type carries all of
 * it, so an extension field is keyed by its message type —
 * `TSWP.ThemePresetsArchive` rather than `extension`. Any *other* conflict
 * is an error rather than a silent last-writer-wins.
 *
 * Usage: `npm run proto:embed`, or `--check` to fail when stale.
 */
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { loadVendoredSchema, type VendoredFile } from "./proto-schema.ts";
import {
  SHARED_TYPES,
  PAGES_TYPES,
  KEYNOTE_TYPES,
  NUMBERS_TYPES,
} from "../src/tsp/registry.ts";
import type { ProtoSchema } from "../src/tsp/required.ts";
import { sha1 } from "../src/base/sha1.ts";
import { utf8Encode } from "../src/base/bytes.ts";

const hex = (bytes: Uint8Array): string =>
  [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");

const ROOT = new URL("../", import.meta.url);
const SRC_DIR = new URL("src/", ROOT);
const OUTPUT = new URL("src/proto/vendored.ts", ROOT);

/** Names given to any of the four declaration helpers, anywhere in src. */
function referencedArchives(): Set<string> {
  const out = new Set<string>();
  const walk = (dir: URL): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      // `src/proto/` is the mechanism, not a user of it: `fields.ts` shows
      // a worked example in its docblock, and matching that would embed an
      // archive nothing actually declares.
      if (entry.isDirectory()) {
        if (entry.name !== "proto") walk(new URL(`${entry.name}/`, dir));
      } else if (entry.name.endsWith(".ts")) {
        const text = readFileSync(new URL(entry.name, dir), "utf8");
        for (const m of text.matchAll(
          /\b(?:protoFields|measuredFields|protoEnum|measuredEnum)\(\s*"([^"]+)"/g,
        )) {
          out.add(m[1]!);
        }
      }
    }
  };
  walk(SRC_DIR);
  return out;
}

/**
 * The subset of the schema that `missingRequired` needs at runtime: every
 * message reachable from an archive the registry can name, keeping only
 * its `required` fields and its message-typed fields (the walker recurses
 * through whichever of those are present). Scalar optional and repeated
 * fields carry no validation signal and are dropped — that is what keeps
 * the embedded form a fraction of the 237 KiB full dump.
 */
function requiredSubset(detailed: ProtoSchema, referenced: Set<string>): ProtoSchema {
  // Rooted at every archive the registry can name plus everything the
  // writers declare: any object the session dirties gets validated, no
  // matter which path touched it. The size cost is accepted — this
  // library's primary target is server-side.
  const roots = new Set<string>(referenced);
  for (const table of [SHARED_TYPES, PAGES_TYPES, KEYNOTE_TYPES, NUMBERS_TYPES]) {
    for (const name of Object.values(table)) roots.add(name);
  }

  // A message whose whole reachable subgraph declares no `required` field
  // can never fail validation, so neither it nor the fields leading to it
  // need embedding. Fixpoint: a message matters if it has a required field
  // or any message-typed field reaching one that does.
  const matters = new Set<string>();
  let grew = true;
  while (grew) {
    grew = false;
    for (const [name, message] of detailed) {
      if (matters.has(name)) continue;
      for (const field of message.values()) {
        if (field.label === "required" || matters.has(field.type)) {
          matters.add(name);
          grew = true;
          break;
        }
      }
    }
  }

  const out: ProtoSchema = new Map();
  const queue = [...roots].filter((name) => detailed.has(name) && matters.has(name));
  while (queue.length > 0) {
    const name = queue.pop()!;
    if (out.has(name)) continue;
    const message = detailed.get(name);
    if (!message) continue;
    const kept = new Map<number, (typeof message extends Map<number, infer F> ? F : never)>();
    for (const [no, field] of message) {
      const follow = detailed.has(field.type) && matters.has(field.type);
      if (field.label !== "required" && !follow) continue;
      kept.set(no, field);
      if (follow && !out.has(field.type)) queue.push(field.type);
    }
    out.set(name, kept);
  }
  return out;
}

function render(
  files: readonly VendoredFile[],
  messages: Map<string, Map<string, number>>,
  enums: Map<string, Map<string, number>>,
  referenced: Set<string>,
  required: ProtoSchema,
): string {
  const wanted = [...referenced].sort();
  const present = wanted.filter((a) => (messages.get(a)?.size ?? 0) > 0);
  const wantedEnums = wanted.filter((a) => (enums.get(a)?.size ?? 0) > 0);
  const missing = wanted.filter(
    (a) => (messages.get(a)?.size ?? 0) === 0 && (enums.get(a)?.size ?? 0) === 0,
  );

  const lines: string[] = [];
  lines.push("/**");
  lines.push(" * GENERATED by `npm run proto:embed` — do not edit.");
  lines.push(" *");
  lines.push(" * Field numbers lifted from the vendored schemas in `proto/`, for the");
  lines.push(" * archives this library names. `src/proto/fields.ts` is what reads it and");
  lines.push(" * why; `proto/README.md` is where the schemas came from.");
  lines.push(" *");
  lines.push(" * An extension field is keyed by the message type it carries rather than");
  lines.push(' * by its declared name, which is always the useless "extension".');
  lines.push(" */");
  lines.push("");
  lines.push("/** Every vendored schema, with the digest this file was generated from. */");
  lines.push("export const VENDORED_SOURCES: readonly { path: string; sha1: string }[] = [");
  for (const file of files) {
    lines.push(`  { path: ${JSON.stringify(file.path)}, sha1: "${hex(sha1(utf8Encode(file.text)))}" },`);
  }
  lines.push("];");
  lines.push("");
  lines.push("/** Names the code uses that appear in no vendored dump. */");
  lines.push("export const ABSENT_ARCHIVES: readonly string[] = [");
  for (const archive of missing) lines.push(`  ${JSON.stringify(archive)},`);
  lines.push("];");
  lines.push("");
  lines.push("/** field name (or extension type) → field number, per archive. */");
  lines.push("export const MESSAGES: Readonly<Record<string, Readonly<Record<string, number>>>> = {");
  for (const archive of present) {
    const fields = [...messages.get(archive)!].sort((a, b) => a[1] - b[1]);
    lines.push(`  ${JSON.stringify(archive)}: {`);
    for (const [name, number] of fields) lines.push(`    ${JSON.stringify(name)}: ${number},`);
    lines.push("  },");
  }
  lines.push("};");
  lines.push("");
  lines.push("/** enum value name → number, per enum. */");
  lines.push("export const ENUMS: Readonly<Record<string, Readonly<Record<string, number>>>> = {");
  for (const name of wantedEnums) {
    const values = [...enums.get(name)!].sort((a, b) => a[1] - b[1]);
    lines.push(`  ${JSON.stringify(name)}: {`);
    for (const [value, number] of values) lines.push(`    ${JSON.stringify(value)}: ${number},`);
    lines.push("  },");
  }
  lines.push("};");
  lines.push("");
  lines.push("/**");
  lines.push(" * What save-time validation needs from the schema: per message, the");
  lines.push(" * `required` fields and the message-typed fields the required-walker");
  lines.push(" * recurses through. Tuples are [number, name, label, type] with label");
  lines.push(' * "r" | "o" | "p" for required | optional | repeated. The name is kept');
  lines.push(" * only where an error message would print it (required fields), and the");
  lines.push(" * type only where the walker follows it (message-typed fields) — both");
  lines.push(' * fall back to "" to keep the embedded form small.');
  lines.push(" */");
  lines.push(
    "export const REQUIRED_SCHEMA: Readonly<Record<string, readonly (readonly [number, string, string, string])[]>> = {",
  );
  const label = { required: "r", optional: "o", repeated: "p" } as const;
  for (const name of [...required.keys()].sort()) {
    const fields = [...required.get(name)!.values()].sort((a, b) => a.number - b.number);
    if (fields.length === 0) {
      lines.push(`  ${JSON.stringify(name)}: [],`);
      continue;
    }
    const tuples = fields
      .map((f) => {
        const fieldName = f.label === "required" ? f.name : "";
        const type = required.has(f.type) ? f.type : "";
        return `[${f.number}, ${JSON.stringify(fieldName)}, "${label[f.label]}", ${JSON.stringify(type)}]`;
      })
      .join(", ");
    lines.push(`  ${JSON.stringify(name)}: [${tuples}],`);
  }
  lines.push("};");
  lines.push("");
  return lines.join("\n");
}

export function generate(): { text: string; conflicts: string[]; archives: number } {
  const { files, messages, detailed, enums, conflicts } = loadVendoredSchema();
  const referenced = referencedArchives();
  return {
    text: render(files, messages, enums, referenced, requiredSubset(detailed, referenced)),
    conflicts,
    archives: referenced.size,
  };
}

function main(argv: string[]): number {
  const { text, conflicts, archives } = generate();
  if (conflicts.length > 0) {
    console.log(`${conflicts.length} genuine schema conflict(s) — merging is not safe:`);
    for (const c of conflicts.slice(0, 20)) console.log(`  ${c}`);
    return 1;
  }

  const path = fileURLToPath(OUTPUT);
  let current: string;
  try {
    current = readFileSync(path, "utf8");
  } catch {
    current = "";
  }

  if (argv.includes("--check")) {
    if (current === text) {
      console.log(`src/proto/vendored.ts is current (${archives} archives).`);
      return 0;
    }
    console.log("src/proto/vendored.ts is stale — run `npm run proto:embed`.");
    return 1;
  }

  writeFileSync(path, text);
  console.log(`wrote src/proto/vendored.ts (${archives} archives)`);
  return 0;
}

// Importable: `test/proto-drift.test.ts` asserts the checked-in copy is current.
if (import.meta.filename === process.argv[1]) process.exitCode = main(process.argv.slice(2));
