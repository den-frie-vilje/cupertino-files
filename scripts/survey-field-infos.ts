#!/usr/bin/env node
/**
 * What does Apple actually put in `MessageInfo.field_infos`?
 *
 *   node scripts/survey-field-infos.ts [dir]     # defaults to fixtures/
 *
 * ## Why this exists
 *
 * `field_infos` looks like a finer-grained `object_references` — one entry
 * per field path, each carrying its own reference list — and the obvious
 * conclusion is that a writer should recompute it the same way. Reading a
 * single archive supports that reading: the one conditional-style set in
 * the corpus declares `path=[3], type=Message, object_references=[…]`,
 * matching its top-level list exactly.
 *
 * Surveying all of them says the opposite, and the decision recorded in
 * `docs/FORMAT.md` §5.2.1 rests on these numbers rather than on that one
 * archive. The headline figure is the count of archives that carry
 * `object_references` and **no** `field_infos` at all: while that number is
 * large, their absence cannot be an error, and generating them would be
 * inventing schema claims rather than restoring lost ones.
 *
 * Re-run it after adding fixtures. If the shape of the answer changes —
 * particularly if `object_refs, NO field_infos` collapses toward zero —
 * §5.2.1 needs revisiting.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { IWorkDocument } from "../src/tsa/document.ts";
import type { RawMessage } from "../src/base/protobuf.ts";

/** `TSP.MessageInfo` field numbers. */
const MSG_TYPE = 1;
const MSG_FIELD_INFOS = 4;
const MSG_OBJECT_REFERENCES = 5;
/** `TSP.FieldInfo` field numbers. */
const FI_PATH = 1;
const FI_TYPE = 2;
const FI_UNKNOWN_FIELD_RULE = 3;
const FI_OBJECT_REFERENCES = 4;
const FI_KNOWN_FIELD_RULE = 6;
const FI_FEATURE_IDENTIFIER = 8;
/** `TSP.FieldPath.path`. */
const FP_PATH = 1;

const TYPE_NAMES = ["Value", "ObjectReference", "DataReference", "Message"];

interface Tally {
  archives: number;
  withFieldInfos: number;
  withObjectRefs: number;
  both: number;
  /** The load-bearing number: references declared, no field_infos present. */
  objectRefsNoFieldInfos: number;
  fieldInfosNoObjectRefs: number;
  unionAgrees: number;
  unionDiffers: number;
  pathLengths: Map<number, number>;
  types: Map<number, number>;
  unknownFieldRules: Map<number, number>;
  knownFieldRules: Map<number, number>;
  featureIdentifiers: Set<string>;
  deepPaths: Set<string>;
}

const empty = (): Tally => ({
  archives: 0,
  withFieldInfos: 0,
  withObjectRefs: 0,
  both: 0,
  objectRefsNoFieldInfos: 0,
  fieldInfosNoObjectRefs: 0,
  unionAgrees: 0,
  unionDiffers: 0,
  pathLengths: new Map(),
  types: new Map(),
  unknownFieldRules: new Map(),
  knownFieldRules: new Map(),
  featureIdentifiers: new Set(),
  deepPaths: new Set(),
});

const bump = (counts: Map<number, number>, key: number): void => {
  counts.set(key, (counts.get(key) ?? 0) + 1);
};

const pathOf = (fieldInfo: RawMessage): number[] =>
  fieldInfo.getMessage(FI_PATH)?.getPackedVarints(FP_PATH).map(Number) ?? [];

/** The store is internal; this survey is precisely about internals. */
interface StoreView {
  store: { index: Map<bigint, { obj: { messageInfos: RawMessage[] } }> };
}

function survey(tally: Tally, bytes: Uint8Array): void {
  const { store } = IWorkDocument.open(bytes) as unknown as StoreView;
  for (const { obj } of store.index.values()) {
    tally.archives++;
    const info = obj.messageInfos[0];
    if (!info) continue;
    const archiveType = info.getUint(MSG_TYPE) ?? 0;
    const fieldInfos = info.getMessages(MSG_FIELD_INFOS);
    const topLevel = info.getPackedVarints(MSG_OBJECT_REFERENCES);

    if (fieldInfos.length) tally.withFieldInfos++;
    if (topLevel.length) tally.withObjectRefs++;
    if (fieldInfos.length && topLevel.length) tally.both++;
    if (topLevel.length && !fieldInfos.length) tally.objectRefsNoFieldInfos++;
    if (fieldInfos.length && !topLevel.length) tally.fieldInfosNoObjectRefs++;

    const union = new Set<bigint>();
    for (const fieldInfo of fieldInfos) {
      const path = pathOf(fieldInfo);
      bump(tally.pathLengths, path.length);
      if (path.length > 1) tally.deepPaths.add(`type ${archiveType} path [${path.join(",")}]`);
      bump(tally.types, fieldInfo.getUint(FI_TYPE) ?? 0);
      bump(tally.unknownFieldRules, fieldInfo.getUint(FI_UNKNOWN_FIELD_RULE) ?? 0);
      const known = fieldInfo.getUint(FI_KNOWN_FIELD_RULE);
      if (known !== undefined) bump(tally.knownFieldRules, known);
      const feature = fieldInfo.getString(FI_FEATURE_IDENTIFIER);
      if (feature) tally.featureIdentifiers.add(feature);
      for (const id of fieldInfo.getPackedVarints(FI_OBJECT_REFERENCES)) union.add(id);
    }

    if (!fieldInfos.length) continue;
    const top = new Set(topLevel);
    const agrees = union.size === top.size && [...union].every((id) => top.has(id));
    if (agrees) tally.unionAgrees++;
    else tally.unionDiffers++;
  }
}

const histogram = (counts: Map<number, number>, name?: (key: number) => string): string =>
  [...counts]
    .sort((a, b) => a[0] - b[0])
    .map(([key, n]) => `${name ? `${name(key)}(${key})` : key}=${n}`)
    .join("  ");

function main(argv: string[]): number {
  const dir = argv[0] ?? new URL("../fixtures/", import.meta.url).pathname;
  const tally = empty();
  let opened = 0;
  const skipped: string[] = [];

  for (const name of readdirSync(dir).sort()) {
    const path = join(dir, name);
    if (!statSync(path).isFile() || !/\.(numbers|pages|key)$/.test(name)) continue;
    try {
      survey(tally, new Uint8Array(readFileSync(path)));
      opened++;
    } catch (error) {
      skipped.push(`${name}: ${(error as Error).message}`);
    }
  }

  console.log(`documents opened: ${opened}${skipped.length ? `, skipped ${skipped.length}` : ""}`);
  for (const note of skipped) console.log(`  skip ${note}`);
  console.log("");
  console.log(`archives scanned:              ${tally.archives}`);
  console.log(`  with field_infos:            ${tally.withFieldInfos}`);
  console.log(`  with object_references:      ${tally.withObjectRefs}`);
  console.log(`  with both:                   ${tally.both}`);
  console.log(`  object_refs, NO field_infos: ${tally.objectRefsNoFieldInfos}   <- the load-bearing one`);
  console.log(`  field_infos, no object_refs: ${tally.fieldInfosNoObjectRefs}`);
  console.log("");
  console.log("per-field union vs top-level object_references:");
  console.log(`  agrees:  ${tally.unionAgrees}`);
  console.log(`  differs: ${tally.unionDiffers}`);
  console.log("");
  console.log(`path lengths:       ${histogram(tally.pathLengths)}`);
  console.log(`FieldInfo.type:     ${histogram(tally.types, (key) => TYPE_NAMES[key] ?? "?")}`);
  console.log(`unknown_field_rule: ${histogram(tally.unknownFieldRules)}`);
  console.log(`known_field_rule:   ${histogram(tally.knownFieldRules) || "(none present)"}`);
  console.log(
    `feature identifiers: ${
      tally.featureIdentifiers.size ? [...tally.featureIdentifiers].join(", ") : "(none present)"
    }`,
  );
  console.log(`nested paths (sample): ${[...tally.deepPaths].slice(0, 8).join(" | ")}`);
  console.log("");
  console.log(
    tally.objectRefsNoFieldInfos > 0
      ? "field_infos is optional even where references exist: preserving is right (FORMAT.md §5.2.1)."
      : "NO archive declares references without field_infos — §5.2.1 needs revisiting.",
  );
  return 0;
}

process.exitCode = main(process.argv.slice(2));
