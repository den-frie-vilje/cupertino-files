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
import { parseProtoEnums, parseProtoSchema, type ProtoField } from "../src/tsp/required.ts";
import { sha1 } from "../src/base/sha1.ts";
import { utf8Encode } from "../src/base/bytes.ts";

const hex = (bytes: Uint8Array): string =>
  [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");

const ROOT = new URL("../", import.meta.url);
const PROTO_DIR = new URL("proto/", ROOT);
const SRC_DIR = new URL("src/", ROOT);
const OUTPUT = new URL("src/proto/vendored.ts", ROOT);

/** Every vendored `.proto`, repo-relative, in a stable order. */
function protoFiles(): { path: string; text: string }[] {
  const out: { path: string; text: string }[] = [];
  const walk = (dir: URL, prefix: string): void => {
    for (const name of readdirSync(dir, { withFileTypes: true }).sort((a, b) =>
      a.name.localeCompare(b.name),
    )) {
      if (name.isDirectory()) walk(new URL(`${name.name}/`, dir), `${prefix}${name.name}/`);
      else if (name.name.endsWith(".proto")) {
        out.push({
          path: `proto/${prefix}${name.name}`,
          text: readFileSync(new URL(name.name, dir), "utf8"),
        });
      }
    }
  };
  walk(PROTO_DIR, "");
  return out;
}

/** The key a field is addressed by: its name, or its type when an extension. */
function keyOf(field: ProtoField): string {
  return field.name === "extension" ? field.type.replace(/^\./, "") : field.name;
}

/** Merge every file's messages, refusing any genuine disagreement. */
function mergeSchemas(files: { path: string; text: string }[]): {
  messages: Map<string, Map<string, number>>;
  conflicts: string[];
} {
  const messages = new Map<string, Map<string, number>>();
  const source = new Map<string, string>();
  const conflicts: string[] = [];

  for (const file of files) {
    for (const [archive, fields] of parseProtoSchema([file.text])) {
      let merged = messages.get(archive);
      if (!merged) messages.set(archive, (merged = new Map()));
      for (const [number, field] of fields) {
        const key = keyOf(field);
        const existing = merged.get(key);
        const where = `${archive}.${key}`;
        if (existing !== undefined && existing !== number) {
          conflicts.push(`${where} = ${existing} in ${source.get(where)}, ${number} in ${file.path}`);
          continue;
        }
        merged.set(key, number);
        source.set(where, file.path);
      }
    }
  }
  return { messages, conflicts };
}

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

function render(
  files: { path: string; text: string }[],
  messages: Map<string, Map<string, number>>,
  enums: Map<string, Map<string, number>>,
  referenced: Set<string>,
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
  return lines.join("\n");
}

export function generate(): { text: string; conflicts: string[]; archives: number } {
  const files = protoFiles();
  const { messages, conflicts } = mergeSchemas(files);
  const enums = parseProtoEnums(files.map((f) => f.text));
  const referenced = referencedArchives();
  return {
    text: render(files, messages, enums, referenced),
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
  let current = "";
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
