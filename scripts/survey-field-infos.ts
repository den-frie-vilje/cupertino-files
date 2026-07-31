/**
 * What does Apple actually put in MessageInfo.field_infos?
 * Survey every archive in every fixture.
 */
import { readdirSync, readFileSync } from "node:fs";
import { IWorkDocument } from "/home/user/iwork-files/src/tsa/document.ts";

const DIR = "/home/user/iwork-files/fixtures/";

const MSG_FIELD_INFOS = 4, MSG_OBJECT_REFS = 5, MSG_TYPE = 1;
const FI_PATH = 1, FI_TYPE = 2, FI_UNKNOWN_RULE = 3, FI_OBJECT_REFS = 4, FI_DATA_REFS = 5,
      FI_KNOWN_RULE = 6, FI_KNOWN_VERSION = 7, FI_FEATURE = 8;
const FP_PATH = 1;

const pathLengths = new Map<number, number>();
const typeCounts = new Map<number, number>();
const unknownRuleCounts = new Map<number, number>();
const knownRuleCounts = new Map<number, number>();
const fiFieldsSeen = new Set<number>();
let archivesTotal = 0, withFieldInfos = 0, withObjRefs = 0, both = 0, objRefsNoFI = 0, fiNoObjRefs = 0;
let unionMatches = 0, unionMismatches = 0;
const mismatchExamples: string[] = [];
const featureIds = new Set<string>();
// type -> set of archive types that use it
const byArchiveType = new Map<number, Set<number>>();
let multiFieldInfo = 0;
const deepPaths: string[] = [];

const bump = (m: Map<number, number>, k: number) => m.set(k, (m.get(k) ?? 0) + 1);

for (const name of readdirSync(DIR)) {
  if (!/\.(numbers|pages|key)$/.test(name)) continue;
  let doc: any;
  try { doc = IWorkDocument.open(new Uint8Array(readFileSync(DIR + name))); }
  catch (e) { console.log("SKIP " + name + ": " + (e as Error).message); continue; }
  {
    for (const { obj } of doc.store.index.values()) {
      archivesTotal++;
      const infos = obj.messageInfos;
      const info = infos[0];
      if (!info) continue;
      const archiveType = info.getUint(MSG_TYPE) ?? 0;
      const fis = info.getMessages(MSG_FIELD_INFOS);
      const topRefs = info.getPackedVarints(MSG_OBJECT_REFS);
      if (fis.length) withFieldInfos++;
      if (topRefs.length) withObjRefs++;
      if (fis.length && topRefs.length) both++;
      if (topRefs.length && !fis.length) objRefsNoFI++;
      if (fis.length && !topRefs.length) fiNoObjRefs++;
      if (fis.length > 1) multiFieldInfo++;

      const union = new Set<bigint>();
      for (const fi of fis) {
        for (const f of fi.fields) fiFieldsSeen.add(f.no);
        const pathMsg = fi.getMessage(FI_PATH);
        const path = pathMsg ? pathMsg.getPackedVarints(FP_PATH).map(Number) : [];
        bump(pathLengths, path.length);
        if (path.length > 1) deepPaths.push(`${name} type${archiveType} path=[${path.join(",")}]`);
        const t = fi.getUint(FI_TYPE) ?? 0;
        bump(typeCounts, t);
        if (!byArchiveType.has(t)) byArchiveType.set(t, new Set());
        byArchiveType.get(t)!.add(archiveType);
        bump(unknownRuleCounts, fi.getUint(FI_UNKNOWN_RULE) ?? 0);
        const kr = fi.getUint(FI_KNOWN_RULE);
        if (kr !== undefined) bump(knownRuleCounts, kr);
        const feat = fi.getString?.(FI_FEATURE);
        if (feat) featureIds.add(feat);
        for (const id of fi.getPackedVarints(FI_OBJECT_REFS)) union.add(id);
      }
      if (fis.length) {
        const top = new Set(topRefs);
        const same = union.size === top.size && [...union].every((x) => top.has(x));
        if (same) unionMatches++;
        else {
          unionMismatches++;
          if (mismatchExamples.length < 6) {
            mismatchExamples.push(
              `${name} obj${obj.identifier} type${archiveType}\n    fi-union: [${[...union].join(",")}]\n    top:      [${topRefs.join(",")}]`);
          }
        }
      }
    }
  }
}

console.log(`archives scanned:        ${archivesTotal}`);
console.log(`  with field_infos:      ${withFieldInfos}`);
console.log(`  with object_refs:      ${withObjRefs}`);
console.log(`  with both:             ${both}`);
console.log(`  object_refs, NO fi:    ${objRefsNoFI}`);
console.log(`  fi, NO object_refs:    ${fiNoObjRefs}`);
console.log(`  >1 field_info:         ${multiFieldInfo}`);
console.log(`\nfi-union == top-level object_references?  yes ${unionMatches} / no ${unionMismatches}`);
for (const e of mismatchExamples) console.log("  " + e);
console.log(`\npath lengths:      ${JSON.stringify([...pathLengths].sort())}`);
console.log(`FieldInfo.type:    ${JSON.stringify([...typeCounts].sort())}   (0=Value 1=ObjRef 2=DataRef 3=Message)`);
console.log(`unknown_field_rule:${JSON.stringify([...unknownRuleCounts].sort())}`);
console.log(`known_field_rule:  ${JSON.stringify([...knownRuleCounts].sort())}`);
console.log(`FieldInfo fields present: ${JSON.stringify([...fiFieldsSeen].sort((a,b)=>a-b))}`);
console.log(`feature identifiers: ${JSON.stringify([...featureIds].slice(0, 12))}`);
console.log(`\ndeep paths (first 10): ${JSON.stringify(deepPaths.slice(0, 10), null, 1)}`);
for (const [t, set] of [...byArchiveType].sort()) {
  console.log(`  fi.type=${t} used by ${set.size} archive types: ${[...set].sort((a,b)=>a-b).slice(0,14).join(", ")}`);
}
