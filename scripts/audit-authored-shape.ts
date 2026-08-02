/**
 * What does Apple put in an archive of this type that we leave out?
 *
 * Every defect this project has found in the app rather than in a test has
 * had the same shape: the archive we wrote was **well-formed and
 * incomplete**. Nothing was malformed, no required field was missing,
 * `required:check` passed, the document round-tripped, and the feature did
 * not work — because Apple always writes something we never write.
 *
 *   * a cell control with no *format* — every field the schema demands,
 *     and the widget silently never drew;
 *   * a character style with `font_color` and no `tsd_fill` — the word
 *     rendered black;
 *   * a floating drawable in its page group and absent from the document's
 *     paint order — nothing appeared on the page at all.
 *
 * Each was found by hand, one round trip to a Mac at a time. This script
 * looks for the rest of them offline, by asking the corpus what an archive
 * of each type normally carries and comparing that against what the library
 * actually writes when it exercises a feature.
 *
 * Three questions, in rising order of how much they have cost:
 *
 * 1. **Absent fields.** A field present on ~every Apple instance of a type
 *    and on none of ours. This is the cell-control-format class.
 * 2. **Invented fields.** A field we write that no Apple instance carries.
 *    The rarer direction, and the one that produced a storage declaring its
 *    own stylesheet.
 * 3. **Absent referrers.** An object of a type that Apple's instances are
 *    always pointed at *by* some other type, where ours is pointed at by
 *    nothing of that type. This is the paint-order class, and it is the
 *    only one of the three that is invisible in the archive itself: our
 *    drawable was perfect, and no object mentioned it.
 *
 * The authoring side is the ladders — `make-pages-docs.ts` and
 * `make-bisect-docs.ts` — because those already enumerate every write the
 * library can perform, and because a rung added there should be audited
 * without having to be described twice.
 *
 * ## Reading the output
 *
 * A finding is a **candidate, not a bug**. The corpus is 37 documents; a
 * field can be universal in it and optional in fact, and a type we author
 * in an unusual place will legitimately lack a referrer that Apple's have.
 * Every finding needs the same treatment as the three above: a rung, a
 * Mac, and someone looking at the screen. What the script buys is the list
 * — the part that was previously found by accident.
 *
 * Usage: `npm run shape:audit` — or `--check` to fail when the finding
 * count grows.
 */
import { readFileSync, readdirSync } from "node:fs";
import { KeynoteDocument, NumbersDocument, PagesDocument } from "../src/index.ts";
import type { IWorkDocument } from "../src/tsa/document.ts";
import { typeName } from "../src/tsp/registry.ts";
import type { ProtoSchema } from "../src/tsp/required.ts";
import { loadVendoredSchema } from "./proto-schema.ts";
import { RUNGS as PAGES_RUNGS, BASES as PAGES_BASES } from "./make-pages-docs.ts";
import {
  RUNGS as NUMBERS_RUNGS,
  TEMPLATE as NUMBERS_TEMPLATE,
} from "./make-bisect-docs.ts";

const FIXTURES = new URL("../fixtures/", import.meta.url);

/**
 * How universal a field has to be in the corpus before its absence counts.
 *
 * Not 100%: `patrickomatic-termpaper` alone carries archives written by
 * three eras of Pages, and an older writer omitting a field added later
 * should not hide a field every current writer sets. 98% of at least 20
 * instances keeps single-fixture quirks out while still catching a field
 * that one legacy document predates.
 */
const UBIQUITY = 0.98;
const MIN_INSTANCES = 20;

interface TypeProfile {
  count: number;
  /** field number → how many instances carry it */
  fields: Map<number, number>;
  /**
   * The *whole* set of referrer types, as a sorted signature, counted.
   *
   * Per-instance rather than per-referrer, because a share is misleading
   * here. Every one of the 1360 chart series styles in these fixtures is
   * pointed at by a `TSCH.ChartStylePreset` — 100%, which reads as a rule
   * — and 18 of them are *also* pointed at by a `TSCH.ChartDrawableArchive`
   * and are the only ones that belong to a chart rather than a theme. A
   * threshold on "how often is this type referred to by that type" cannot
   * see that the 18 are a different animal. Asking instead whether our
   * referrer set has any precedent at all can.
   */
  referrerSets: Map<string, number>;
  /** instances pointed at by anything at all */
  referenced: number;
}

const label = (type: number): string => typeName(type) ?? `type ${type}`;

/** A referrer set, as a stable string: sorted type ids. */
const signature = (types: Iterable<number>): string =>
  [...new Set(types)].sort((a, b) => a - b).join(",");

const describeSignature = (sig: string): string =>
  sig === "" ? "nothing" : sig.split(",").map((t) => label(Number(t))).join(" + ");

/**
 * `field 24` says nothing; `field 24 (footnote_container)` says everything.
 *
 * The vendored schema is already parsed for `required:check`, so naming the
 * field costs one more read of the same directory, and a finding nobody can
 * interpret is a finding nobody acts on.
 */
function fieldNamer(): (type: number, field: number) => string {
  // Every vendored dump, not just the shared families. The Pages-specific
  // `TP*` schemas live in `pages-2013/`, and reading only `current/`
  // reported `TP.SectionArchive.name` as a bare "field 26" — the one
  // finding nobody could act on without going to the corpus by hand.
  let schema: ProtoSchema | undefined;
  try {
    schema = loadVendoredSchema().detailed;
  } catch {
    schema = undefined;
  }
  return (type, field) => {
    const name = typeName(type);
    const found = name ? schema?.get(name)?.get(field) : undefined;
    return found ? `field ${field} (${found.name}: ${found.label} ${found.type})` : `field ${field}`;
  };
}

/** Distinct top-level field numbers of an archive's payload. */
function fieldsOf(object: { message: { fields: { no: number }[] } }): Set<number> {
  return new Set(object.message.fields.map((f) => f.no));
}

/**
 * Fold one document into the profile map.
 *
 * References come from `object_references`, which for an unmodified Apple
 * archive is Apple's own bookkeeping — the same ground truth
 * `reference-extractors.test.ts` audits the extractors against.
 */
function profile(doc: IWorkDocument, into: Map<number, TypeProfile>): void {
  const typeOf = new Map<bigint, number>();
  for (const { obj } of doc.store.allObjects()) typeOf.set(obj.identifier, obj.type);

  const referrersOf = new Map<bigint, Set<number>>();
  for (const { obj } of doc.store.allObjects()) {
    for (const target of new Set(obj.getObjectReferences())) {
      if (target === obj.identifier) continue; // self-reference is not a referrer
      let set = referrersOf.get(target);
      if (!set) referrersOf.set(target, (set = new Set()));
      set.add(obj.type);
    }
  }

  for (const { obj } of doc.store.allObjects()) {
    let p = into.get(obj.type);
    if (!p) {
      into.set(obj.type, (p = { count: 0, fields: new Map(), referrerSets: new Map(), referenced: 0 }));
    }
    p.count++;
    for (const no of fieldsOf(obj)) p.fields.set(no, (p.fields.get(no) ?? 0) + 1);
    const referrers = referrersOf.get(obj.identifier);
    if (referrers?.size) {
      p.referenced++;
      const sig = signature(referrers);
      p.referrerSets.set(sig, (p.referrerSets.get(sig) ?? 0) + 1);
    }
  }
}

function corpusProfile(): Map<number, TypeProfile> {
  const out = new Map<number, TypeProfile>();
  for (const name of readdirSync(FIXTURES)) {
    const Doc = name.endsWith(".pages")
      ? PagesDocument
      : name.endsWith(".numbers")
        ? NumbersDocument
        : name.endsWith(".key")
          ? KeynoteDocument
          : undefined;
    if (!Doc) continue;
    try {
      profile(
        (Doc as typeof PagesDocument).load(new Uint8Array(readFileSync(new URL(name, FIXTURES)))),
        out,
      );
    } catch {
      // unreadable fixtures are another test's problem
    }
  }
  return out;
}

export interface Finding {
  kind: "absent-field" | "invented-field" | "absent-referrer";
  type: number;
  /** field number, or referrer type, depending on `kind` */
  what: number;
  /** the rungs that produced an object with this defect */
  rungs: Set<string>;
  /** how universal the thing is in the corpus */
  share: number;
  instances: number;
  /**
   * For a referrer finding, every referrer type the corpus shows for this
   * archive type, commonest first.
   *
   * A referrer at 100% reads as damning until you notice the corpus holds
   * only one *kind* of that archive. Chart series styles are the case:
   * every one in these fixtures is a theme preset, so of course a preset
   * points at it — which says nothing about a series style belonging to a
   * single chart. Printing the whole distribution makes that visible
   * instead of leaving it to be re-derived.
   */
  context?: string;
}

const key = (f: Pick<Finding, "kind" | "type" | "what">) => `${f.kind}:${f.type}:${f.what}`;

/**
 * Run one rung and describe every archive it created or rewrote.
 *
 * "Created or rewrote" rather than "created": the interesting object is
 * sometimes one that already existed. A drawable copied onto a page is new,
 * the paint order that must list it is not.
 */
function authoredObjects(
  before: Uint8Array,
  build: (doc: never) => void,
  Doc: typeof PagesDocument | typeof NumbersDocument,
): { saved: IWorkDocument; touched: Set<bigint> } | undefined {
  const original = Doc.load(before);
  const originalBytes = new Map<bigint, string>();
  for (const { obj } of original.store.allObjects()) {
    originalBytes.set(obj.identifier, Buffer.from(obj.message.toBytes()).toString("base64"));
  }

  const doc = Doc.load(before);
  try {
    build(doc as never);
  } catch {
    return undefined; // a rung that cannot build is the ladder's problem, not ours
  }
  const saved = Doc.load(doc.save());

  const touched = new Set<bigint>();
  for (const { obj } of saved.store.allObjects()) {
    const was = originalBytes.get(obj.identifier);
    const now = Buffer.from(obj.message.toBytes()).toString("base64");
    if (was !== now) touched.add(obj.identifier);
  }
  return { saved, touched };
}

/** Compare one rung's output against the corpus profile. */
function inspect(
  rung: string,
  saved: IWorkDocument,
  touched: Set<bigint>,
  corpus: Map<number, TypeProfile>,
  findings: Map<string, Finding>,
): void {
  const referrersOf = new Map<bigint, Set<number>>();
  for (const { obj } of saved.store.allObjects()) {
    for (const target of new Set(obj.getObjectReferences())) {
      if (target === obj.identifier) continue;
      let set = referrersOf.get(target);
      if (!set) referrersOf.set(target, (set = new Set()));
      set.add(obj.type);
    }
  }

  const add = (f: Omit<Finding, "rungs">): void => {
    const existing = findings.get(key(f));
    if (existing) existing.rungs.add(rung);
    else findings.set(key(f), { ...f, rungs: new Set([rung]) });
  };

  for (const { obj } of saved.store.allObjects()) {
    if (!touched.has(obj.identifier)) continue;
    const p = corpus.get(obj.type);
    if (!p || p.count < MIN_INSTANCES) continue;
    const ours = fieldsOf(obj);

    for (const [no, seen] of p.fields) {
      const share = seen / p.count;
      if (share >= UBIQUITY && !ours.has(no)) {
        add({ kind: "absent-field", type: obj.type, what: no, share, instances: p.count });
      }
    }
    for (const no of ours) {
      if ((p.fields.get(no) ?? 0) === 0) {
        add({ kind: "invented-field", type: obj.type, what: no, share: 0, instances: p.count });
      }
    }

    // Referrers, for objects of a type Apple's documents normally point at.
    // The question is not "which referrer is missing" but "has this whole
    // pattern of being pointed at ever been seen", because an archive can
    // legitimately be reached in more than one way.
    if (p.referenced >= MIN_INSTANCES) {
      const mine = referrersOf.get(obj.identifier) ?? new Set<number>();
      const sig = signature(mine);
      if (!p.referrerSets.has(sig)) {
        const known = [...p.referrerSets]
          .sort((a, b) => b[1] - a[1])
          .slice(0, 3)
          .map(([s, c]) => `${describeSignature(s)} ×${c}`)
          .join("; ");
        add({
          kind: "absent-referrer",
          type: obj.type,
          what: 0,
          share: 1,
          instances: p.referenced,
          context: `ours: ${describeSignature(sig)} — corpus: ${known}`,
        });
      }
    }
  }
}

export function audit(): Finding[] {
  const corpus = corpusProfile();
  const findings = new Map<string, Finding>();

  const pagesBase = new Uint8Array(readFileSync(PAGES_BASES[0]!.url));
  for (const rung of PAGES_RUNGS) {
    const bytes = rung.base ? new Uint8Array(readFileSync(rung.base)) : pagesBase;
    const run = authoredObjects(bytes, rung.build, PagesDocument);
    if (run) inspect(`pages/${rung.name}`, run.saved, run.touched, corpus, findings);
  }

  const numbersCache = new Map<string, Uint8Array>();
  for (const rung of NUMBERS_RUNGS) {
    const url = rung.template ?? NUMBERS_TEMPLATE;
    let bytes = numbersCache.get(url.href);
    if (!bytes) numbersCache.set(url.href, (bytes = new Uint8Array(readFileSync(url))));
    const run = authoredObjects(bytes, rung.build, NumbersDocument);
    if (run) inspect(`numbers/${rung.name}`, run.saved, run.touched, corpus, findings);
  }

  return [...findings.values()].sort(
    (a, b) => b.share - a.share || b.instances - a.instances || a.type - b.type,
  );
}

function report(findings: Finding[]): void {
  const nameField = fieldNamer();
  const groups: [Finding["kind"], string][] = [
    ["absent-referrer", "Nothing points at it — the paint-order class"],
    ["absent-field", "Apple always writes this field; we never do"],
    ["invented-field", "We write this field; Apple never does"],
  ];
  for (const [kind, heading] of groups) {
    const rows = findings.filter((f) => f.kind === kind);
    console.log(`\n## ${heading} (${rows.length})\n`);
    if (!rows.length) {
      console.log("  nothing");
      continue;
    }
    for (const f of rows) {
      const what =
        kind === "absent-referrer"
          ? "reached in a way no corpus instance is"
          : nameField(f.type, f.what);
      const evidence =
        kind === "invented-field"
          ? `0 of ${f.instances} Apple instances`
          : kind === "absent-referrer"
            ? `0 of ${f.instances} referenced instances match`
            : `${Math.round(f.share * 100)}% of ${f.instances}`;
      const rungs = [...f.rungs].sort();
      console.log(`  ${label(f.type).padEnd(38)} ${what}`);
      console.log(`  ${" ".repeat(38)} ${evidence} · ${rungs.slice(0, 4).join(" ")}${rungs.length > 4 ? ` +${rungs.length - 4}` : ""}`);
      if (f.context) console.log(`  ${" ".repeat(38)} ${f.context}`);
    }
  }
}

/**
 * A budget, in the same spirit as `reference-extractors.test.ts`.
 *
 * Findings are candidates, so the number cannot go to zero by being
 * correct — some of them are explained rather than fixed. What must not
 * happen is a new one appearing unnoticed.
 *
 * The first run produced 17 and named four real defects, none of which any
 * other check could see:
 *
 *   * a footnote's new storage had **none** of the six attribute tables
 *     that all 2676 corpus storages carry, `table_para_style` among them —
 *     the same omission that rendered a whole document unstyled once;
 *   * an inserted image had no `style`, where all 83 corpus images point at
 *     the theme's `image-0-imageStyle`, and no `naturalSize`;
 *   * its attachment had none of the four offset fields all 101 corpus
 *     attachments carry;
 *   * an inserted section had its `name` actively stripped, where all 47
 *     corpus sections have one.
 *
 * Plus the container rule one type over: a copied mask declared the image
 * it masks and copied shapes declared their group, because a clone reaches
 * `ObjectStore.save`'s generic scan carrying a `parent` the original never
 * declared.
 *
 * The two that remain are both "our stylesheet declares a style Apple's
 * does not", on paths that are confirmed working in the app — character
 * formatting in Pages and a conditional rule in Numbers. They are the same
 * open question `reference-extractors.test.ts` tracks as 36 stylesheet
 * disagreements, and guessing at a fourth stylesheet rule to close them is
 * how the last four rounds of the style-panel bug went.
 */
export const BUDGET = 2;

function main(argv: string[]): number {
  const findings = audit();
  report(findings);
  console.log(`\n${findings.length} candidate(s); budget ${BUDGET}.`);
  console.log("Each is a candidate, not a bug: confirm in the app before believing it.");
  if (argv.includes("--check") && findings.length > BUDGET) {
    console.log(`\nFAIL: ${findings.length} > ${BUDGET}. Explain the new one or fix it.`);
    return 1;
  }
  return 0;
}

if (import.meta.filename === process.argv[1]) process.exitCode = main(process.argv.slice(2));
