/**
 * Generate `conformance/` — the language-neutral half of this project.
 *
 * The TypeScript library is one consumer of what this repository knows; a
 * C++ import filter or a Java text extractor cannot run it. What they *can*
 * run is a comparison against machine-readable expectations, which is what
 * this script emits:
 *
 * - `conformance/expected/<fixture>.json` — for every readable fixture, the
 *   text and structure a correct reader should produce. The import half.
 * - `conformance/profiles.json` — per archive type, what the corpus of
 *   Apple-written documents actually carries: field ubiquity and referrer
 *   sets. The export half: a writer in any language can audit its own
 *   output with the same three questions `shape:audit` asks of ours
 *   (absent fields, invented fields, unprecedented referrer sets).
 *
 * Both are generated from the fixtures by this library, which makes them
 * only as good as our own reading — that is the honest contract, stated in
 * conformance/README.md, and it is the same contract every expectation
 * suite has with its reference implementation.
 *
 * Determinism: fixtures are visited in sorted order, keys are emitted in
 * fixed order, shares are rounded, and object iteration follows document
 * order — so `--check` can diff bytes, exactly like `coverage:check`.
 *
 * Usage: `npm run conformance` — or `--check` to fail when what the
 * library reads no longer matches what `conformance/` promises.
 */
import { mkdirSync, readFileSync, readdirSync, writeFileSync, existsSync, rmSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  KeynoteDocument,
  NumbersDocument,
  PagesDocument,
  STORAGE_KIND,
  cellValueToString,
  sha1,
} from "../src/index.ts";
import type { IWorkDocument } from "../src/tsa/document.ts";
import { typeName } from "../src/tsp/registry.ts";
import type { ProtoSchema } from "../src/tsp/required.ts";
import { loadVendoredSchema } from "./proto-schema.ts";
import { corpusProfile } from "./audit-authored-shape.ts";

const FIXTURES = new URL("../fixtures/", import.meta.url);
const OUT = new URL("../conformance/", import.meta.url);

/** Cell sampling bounds — enough to verify a reader, small enough to review. */
const MAX_ROWS = 30;
const MAX_COLUMNS = 15;

const KIND_NAMES = new Map<number, string>(
  Object.entries(STORAGE_KIND).map(([name, value]) => [value, name]),
);

const bytesToHex = (b: Uint8Array): string =>
  [...b].map((x) => x.toString(16).padStart(2, "0")).join("");

/** One fixture's expectation document. Key order here is the file's key order. */
function expectation(name: string, bytes: Uint8Array, doc: IWorkDocument): object {
  const storages = doc.textStorages().map((s) => ({
    kind: KIND_NAMES.get(s.kind ?? -1) ?? String(s.kind),
    characters: s.text.length,
    text: s.text,
  }));

  const base: Record<string, unknown> = {
    file: name,
    sha1: bytesToHex(sha1(bytes)),
    app: doc.app,
    fileFormatVersion: doc.format.fileFormatVersion.join("."),
    objects: doc.stats().objectCount,
    components: doc.stats().components.map((c) => ({ name: c.name, objects: c.objects })),
    storages,
  };

  if (doc instanceof PagesDocument) {
    base.pages = {
      isPageLayout: doc.isPageLayout,
      sections: doc.sections().length,
      paragraphs: doc.bodyOrUndefined ? doc.paragraphs().length : 0,
    };
  } else if (doc instanceof NumbersDocument) {
    base.numbers = {
      sheets: doc.sheets().map((sheet) => ({
        name: sheet.name ?? null,
        tables: doc.tablesOnSheet(sheet.id).map((table) => {
          const rows = Math.min(table.rowCount, MAX_ROWS);
          const columns = Math.min(table.columnCount, MAX_COLUMNS);
          const cells: { r: number; c: number; v: string }[] = [];
          for (let r = 0; r < rows; r++) {
            for (let c = 0; c < columns; c++) {
              const value = table.cellValue(r, c);
              if (value === undefined) continue;
              const text = cellValueToString(value);
              if (text !== "") cells.push({ r, c, v: text });
            }
          }
          return {
            name: table.name ?? null,
            rows: table.rowCount,
            columns: table.columnCount,
            truncated: table.rowCount > MAX_ROWS || table.columnCount > MAX_COLUMNS,
            cells,
          };
        }),
      })),
    };
  } else if (doc instanceof KeynoteDocument) {
    const size = doc.slideSize();
    base.keynote = {
      size: size ? `${size.width}x${size.height}` : null,
      slides: doc.slides().map((s) => ({
        title: s.title ?? null,
        notes: s.notes,
        skipped: s.isSkipped,
        transition: s.transition()?.effect ?? null,
      })),
    };
  }
  return base;
}

/**
 * The corpus shape profiles, with names resolved so a consumer never has to
 * join against the registry or the schema dumps to read a finding.
 */
function profilesDocument(): object {
  let schema: ProtoSchema | undefined;
  try {
    schema = loadVendoredSchema().detailed;
  } catch {
    schema = undefined;
  }
  const fieldName = (type: number, no: number): string | null => {
    const archive = typeName(type);
    return (archive ? schema?.get(archive)?.get(no)?.name : undefined) ?? null;
  };
  const label = (type: number): string => typeName(type) ?? `type ${type}`;

  const profiles: Record<string, unknown> = {};
  const entries = [...corpusProfile()].sort((a, b) => label(a[0]).localeCompare(label(b[0])));
  for (const [type, p] of entries) {
    const fields: Record<string, unknown> = {};
    for (const [no, seen] of [...p.fields].sort((a, b) => a[0] - b[0])) {
      fields[String(no)] = {
        name: fieldName(type, no),
        share: Math.round((seen / p.count) * 10000) / 10000,
      };
    }
    const referrerSets: Record<string, number> = {};
    for (const [sig, count] of [...p.referrerSets].sort((a, b) => a[0].localeCompare(b[0]))) {
      const names =
        sig === "" ? "(nothing)" : sig.split(",").map((t) => label(Number(t))).join(" + ");
      referrerSets[names] = count;
    }
    profiles[label(type)] = { count: p.count, referenced: p.referenced, fields, referrerSets };
  }

  return {
    what: "Per archive type: how many instances the corpus holds, which top-level fields they carry (share of instances), and the sets of archive types that point at them.",
    contract:
      "A writer should treat a field at share ≥ 0.98 with ≥ 20 instances as load-bearing until an app proves otherwise, and treat writing a field with no corpus precedent — or leaving an object reachable in a way no corpus instance is — as a defect candidate. These are the three questions that found every well-formed-but-wrong defect in this project.",
    corpus: readdirSync(fileURLToPath(FIXTURES))
      .filter((n) => /\.(pages|numbers|key)$/.test(n))
      .sort(),
    profiles,
  };
}

export function generate(): Map<string, string> {
  const files = new Map<string, string>();

  for (const name of readdirSync(fileURLToPath(FIXTURES)).sort()) {
    if (!/\.(pages|numbers|key)$/.test(name)) continue;
    const Doc = name.endsWith(".pages")
      ? PagesDocument
      : name.endsWith(".numbers")
        ? NumbersDocument
        : KeynoteDocument;
    const bytes = new Uint8Array(readFileSync(new URL(name, FIXTURES)));
    let doc: IWorkDocument;
    try {
      doc = (Doc as typeof PagesDocument).load(bytes);
    } catch {
      continue; // pre-IWA-era files are out of scope, same as everywhere else
    }
    files.set(`expected/${name}.json`, JSON.stringify(expectation(name, bytes, doc), null, 2) + "\n");
  }

  files.set("profiles.json", JSON.stringify(profilesDocument(), null, 2) + "\n");
  return files;
}

function main(argv: string[]): number {
  const files = generate();

  if (argv.includes("--check")) {
    const problems: string[] = [];
    for (const [rel, text] of files) {
      const path = new URL(rel, OUT);
      let current: string | undefined;
      try {
        current = readFileSync(path, "utf8");
      } catch {
        current = undefined;
      }
      if (current !== text) problems.push(rel);
    }
    // Stale files that the generator no longer produces are drift too.
    const expectedDir = fileURLToPath(new URL("expected/", OUT));
    if (existsSync(expectedDir)) {
      for (const name of readdirSync(expectedDir)) {
        if (!files.has(`expected/${name}`)) problems.push(`expected/${name} (stale)`);
      }
    }
    if (problems.length) {
      console.error(`conformance/ is out of date (${problems.length} file(s)):`);
      for (const p of problems.slice(0, 10)) console.error(`  ${p}`);
      console.error("Run `npm run conformance` and commit the result.");
      return 1;
    }
    console.log(`conformance/ is current (${files.size} generated files).`);
    return 0;
  }

  const expectedDir = fileURLToPath(new URL("expected/", OUT));
  if (existsSync(expectedDir)) rmSync(expectedDir, { recursive: true });
  mkdirSync(expectedDir, { recursive: true });
  for (const [rel, text] of files) {
    writeFileSync(new URL(rel, OUT), text);
  }
  console.log(`wrote ${files.size} files under conformance/`);
  return 0;
}

if (import.meta.filename === process.argv[1]) process.exit(main(process.argv.slice(2)));
