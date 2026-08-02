/**
 * Read the vendored `.proto` schemas — with a real protobuf parser.
 *
 * This used to be two hand-written regex parsers, one in `src/tsp/required.ts`
 * and a second in `check-proto-drift.ts`, each tracking brace depth and a
 * name stack well enough for the files in `proto/` and no further. They
 * agreed with `protobufjs` on 1468 of 1469 messages and every one of the 163
 * enums, so they were not *wrong* — but "not wrong on the inputs we happen to
 * have" is the standing of a parser nobody should have to maintain, in a
 * project whose whole premise is that unverified assumptions are the enemy.
 *
 * `protobufjs` is the canonical reader and does the job properly. It is a
 * **devDependency**: nothing under `src/` imports it, the library keeps its
 * zero-runtime-dependency promise, and the schemas reach the runtime through
 * `src/proto/vendored.ts`, which this module's callers generate.
 *
 * ## What the real parser gets right that the regex one did not
 *
 * **Extensions.** Five families each `extend .TSS.ThemeArchive` with a field
 * that protobuf convention names `extension`, at 100, 110, 120, 200 and 210.
 * The regex parser flattened all five to the bare name and needed a
 * hand-written special case to tell them apart; protobufjs qualifies each by
 * its declaring scope (`.TSWP.ThemePresetsArchive.extension`) and the
 * ambiguity never arises. The key used here is the carried message type,
 * which is what a caller actually means by "the paragraph-style preset list".
 *
 * **Duplicate namespaces.** `TNArchives.sos.proto` and `TNArchives_sos.proto`
 * are different files declaring the same `TNSOS` message names. Parsing them
 * into one root is an error — correctly — so each file gets its own root and
 * the merge below is where disagreement is detected, deliberately, rather
 * than resolved by whichever file was read last.
 */
import { readFileSync, readdirSync } from "node:fs";
import protobuf from "protobufjs";
import type { ProtoField, ProtoSchema } from "../src/tsp/required.ts";

export type ProtoEnums = Map<string, Map<string, number>>;

const PROTO_DIR = new URL("../proto/", import.meta.url);

export interface VendoredFile {
  /** Repo-relative, e.g. `proto/current/TSWPArchives.proto`. */
  path: string;
  text: string;
}

/** Every vendored `.proto`, in a stable order. */
export function vendoredFiles(): VendoredFile[] {
  const out: VendoredFile[] = [];
  const walk = (dir: URL, prefix: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true }).sort((a, b) =>
      a.name.localeCompare(b.name),
    )) {
      if (entry.isDirectory()) walk(new URL(`${entry.name}/`, dir), `${prefix}${entry.name}/`);
      else if (entry.name.endsWith(".proto")) {
        out.push({
          path: `proto/${prefix}${entry.name}`,
          text: readFileSync(new URL(entry.name, dir), "utf8"),
        });
      }
    }
  };
  walk(PROTO_DIR, "");
  return out;
}

/**
 * The key a field is addressed by.
 *
 * protobufjs qualifies an extension field by its declaring scope, so the
 * five that extend `TSS.ThemeArchive` arrive as
 * `.TSWP.ThemePresetsArchive.extension` rather than colliding on
 * `extension`. That is the right disambiguation and the wrong ergonomics:
 * what a caller means is "the archive of presets this theme carries".
 *
 * So a field literally named `extension` is keyed by the message type it
 * carries, and everything else by its plain name. The distinction matters —
 * `TSCH.ChartArchive` is extended by fields called `upgraded_to_ui_state`
 * and `supports_rounded_corners`, whose types are `bool`; keying *those* by
 * type would file half a dozen unrelated fields under `bool`.
 */
function keyOf(field: protobuf.Field): string {
  const simple = field.name.slice(field.name.lastIndexOf(".") + 1);
  const type = field.type.replace(/^\./, "");
  return simple === "extension" && type.includes(".") ? type : simple;
}

/**
 * `field.rule`, not `field.required`.
 *
 * protobufjs exposes `required`/`repeated`/`optional` booleans, and they are
 * all wrong until `resolve()` has run: a `required` field reports
 * `required === false` and `optional === true` straight after parsing. The
 * `rule` string is what the parser actually recorded, and this whole
 * mechanism exists to catch a missing `required` field, so reading the
 * lazily-populated version would have quietly disabled it.
 */
const label = (field: protobuf.Field): ProtoField["label"] =>
  field.rule === "repeated" ? "repeated" : field.rule === "required" ? "required" : "optional";

/** A root with no filesystem resolver — these files import nothing. */
function newRoot(): protobuf.Root {
  const root = new protobuf.Root();
  root.resolvePath = () => null;
  return root;
}

/**
 * Parse into as few roots as possible, because `extend` only resolves
 * within one.
 *
 * A field extending `TSS.ThemeArchive` is declared in `TSWPArchives.proto`
 * and attaches to a type defined in `TSSArchives.proto`; parsed
 * file-by-file it attaches to nothing. So everything goes into one root —
 * except the files protobuf legitimately refuses to merge.
 * `TNArchives.sos.proto` and `TNArchives_sos.proto` are different files
 * declaring the same `TNSOS` names, and each gets a root of its own rather
 * than one of them being silently dropped.
 *
 * Deliberately no `resolveAll()`. Extension fields attach to the extended
 * type as each file is added, which is all that is needed here, and full
 * resolution would fail anyway: these dumps carry no `import` statements
 * and reference each other's types by name, so a `.TSDSOS.SpecFillArchive`
 * that lives in a file this root skipped is unresolvable by construction.
 * Everything read below — id, name, label, declared type — comes straight
 * from the parse.
 */
function roots(files: readonly VendoredFile[]): protobuf.Root[] {
  const main = newRoot();
  const separate: protobuf.Root[] = [];
  for (const file of files) {
    try {
      protobuf.parse(file.text, main, { keepCase: true });
    } catch {
      const own = newRoot();
      protobuf.parse(file.text, own, { keepCase: true });
      separate.push(own);
    }
  }
  return [main, ...separate];
}

/**
 * One `.proto` source, parsed on its own.
 *
 * For tests and for callers with a snippet rather than the vendored set;
 * {@link loadVendoredSchema} is what production paths use. Extensions of a
 * type declared elsewhere will not attach, which is inherent to parsing one
 * file in isolation and is why the real loader does not.
 */
export function parseProtoText(text: string): ProtoSchema {
  const root = newRoot();
  protobuf.parse(text, root, { keepCase: true });
  return messagesOf(root);
}

/** Messages of one resolved root, as `{ message → number → field }`. */
function messagesOf(root: protobuf.Root): ProtoSchema {
  const out: ProtoSchema = new Map();
  const visit = (namespace: protobuf.NamespaceBase): void => {
    for (const nested of namespace.nestedArray) {
      if (nested instanceof protobuf.Type) {
        const fields = new Map<number, ProtoField>();
        for (const field of nested.fieldsArray) {
          fields.set(field.id, {
            name: keyOf(field),
            number: field.id,
            label: label(field),
            type: field.type.replace(/^\./, ""),
          });
        }
        out.set(nested.fullName.replace(/^\./, ""), fields);
        visit(nested);
      } else if (nested instanceof protobuf.Namespace) {
        visit(nested);
      }
    }
  };
  visit(root);
  return out;
}

/** Enums of one resolved root, as `{ enum → value name → number }`. */
function enumsOf(root: protobuf.Root): ProtoEnums {
  const out: ProtoEnums = new Map();
  const visit = (namespace: protobuf.NamespaceBase): void => {
    for (const nested of namespace.nestedArray) {
      if (nested instanceof protobuf.Enum) {
        out.set(nested.fullName.replace(/^\./, ""), new Map(Object.entries(nested.values)));
      } else if (nested instanceof protobuf.Namespace) {
        visit(nested);
      }
    }
  };
  visit(root);
  return out;
}

export interface VendoredSchema {
  files: VendoredFile[];
  /** archive → field key → number, merged across every file. */
  messages: Map<string, Map<string, number>>;
  /** Full field records, for the `required` walker. */
  detailed: ProtoSchema;
  enums: ProtoEnums;
  /** Same key, two numbers, in two files — never silently resolved. */
  conflicts: string[];
}

/**
 * Every vendored schema, merged.
 *
 * Merging is safe and that is measured rather than assumed: across all 41
 * files no field *number* maps to two names, and the only field *name* that
 * mapped to two numbers was `extension`, which {@link keyOf} disambiguates.
 * Anything else is reported as a conflict instead of being merged.
 */
export function loadVendoredSchema(): VendoredSchema {
  const files = vendoredFiles();
  const messages = new Map<string, Map<string, number>>();
  const detailed: ProtoSchema = new Map();
  const enums: ProtoEnums = new Map();
  const conflicts: string[] = [];

  for (const root of roots(files)) {
    for (const [archive, fields] of messagesOf(root)) {
      let merged = messages.get(archive);
      if (!merged) messages.set(archive, (merged = new Map()));
      let mergedDetail = detailed.get(archive);
      if (!mergedDetail) detailed.set(archive, (mergedDetail = new Map()));
      for (const [number, field] of fields) {
        const existing = merged.get(field.name);
        if (existing !== undefined && existing !== number) {
          conflicts.push(`${archive}.${field.name} is ${existing} in one root and ${number} in another`);
          continue;
        }
        merged.set(field.name, number);
        mergedDetail.set(number, field);
      }
    }
    for (const [name, values] of enumsOf(root)) {
      let merged = enums.get(name);
      if (!merged) enums.set(name, (merged = new Map()));
      for (const [value, number] of values) merged.set(value, number);
    }
  }

  return { files, messages, detailed, enums, conflicts };
}
