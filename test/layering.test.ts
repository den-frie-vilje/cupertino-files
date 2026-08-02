/**
 * The layer order is measured and enforced, not aspirational.
 *
 * `src/` mirrors Apple's framework stack, and the dependency order below is
 * the one the code actually has — checked by building the import graph,
 * not by reading directory names:
 *
 *   base < proto < tsp < tsd < tss < tswp < tsce < tst < tsch < tsa < apps
 *
 * Two of those placements look wrong until measured. `tsd` sits *below*
 * `tss` because style values (colors, fills, strokes) are TSD types that
 * stylesheet property bags consume; `tsce` sits below `tst` because the
 * calc engine is what table formulas are made of. Both match Apple's own
 * super chains.
 *
 * One exception, stated rather than smuggled: a family's `schema.ts` — the
 * field tables and reference extractors — is a **leaf**, importable from
 * any layer. `tss/stylesheet.ts` legitimately writes
 * `TSWP.CharacterStylePropertiesArchive` fields, and making it import
 * `tswp/schema.ts` is better than duplicating the numbers. The exception
 * holds only because leaves stay leaves: a `schema.ts` may import nothing
 * above `tsp`, and this file checks that too.
 *
 * The rule exists because it was broken twice in one week, both times by a
 * fix: `tsp/store.ts` imported `drawableParent` from `tsd` (now injected
 * via `loadStore`), and `tsp/extractors.ts` composed family extractor maps
 * (now `tsa/extractors.ts`). Nothing failed — upward imports work fine
 * right up until they become a cycle or an unbundleable core.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "./harness.ts";

const SRC = fileURLToPath(new URL("../src", import.meta.url));
const ORDER = [
  "base",
  "proto",
  "tsp",
  "tsd",
  "tss",
  "tswp",
  "tsce",
  "tst",
  "tsch",
  "tsa",
  "pages",
  "numbers",
  "keynote",
];
const rank = new Map(ORDER.map((d, i) => [d, i]));

interface Edge {
  fromFile: string;
  fromDir: string;
  toDir: string;
  toFile: string;
}

function edges(): Edge[] {
  const out: Edge[] = [];
  const walk = (dir: string): void => {
    for (const name of readdirSync(dir)) {
      const path = `${dir}/${name}`;
      if (statSync(path).isDirectory()) {
        walk(path);
        continue;
      }
      if (!name.endsWith(".ts")) continue;
      const rel = path.slice(SRC.length + 1);
      const fromDir = rel.includes("/") ? rel.split("/")[0]! : ".";
      for (const m of readFileSync(path, "utf8").matchAll(/from "(\.[^"]+)"/g)) {
        const target = new URL(m[1]!, `file://${path}/../`).pathname;
        if (!target.startsWith(SRC)) continue;
        const targetRel = target.slice(SRC.length + 1);
        const toDir = targetRel.includes("/") ? targetRel.split("/")[0]! : ".";
        if (fromDir === toDir || fromDir === "." || toDir === ".") continue;
        out.push({ fromFile: rel, fromDir, toDir, toFile: targetRel });
      }
    }
  };
  walk(SRC);
  return out;
}

const ALL = edges();

describe("src/ keeps its layer order", () => {
  it("has no upward import outside the schema-leaf exception", () => {
    const upward = ALL.filter((e) => {
      const from = rank.get(e.fromDir);
      const to = rank.get(e.toDir);
      if (from === undefined || to === undefined) return false;
      if (to <= from) return false;
      // The stated exception: anyone may import a family's schema leaf.
      return !/\/schema\.ts$/.test(e.toFile);
    });
    const lines = [...new Set(upward.map((e) => `${e.fromFile} -> ${e.toFile}`))];
    expect(`upward imports: ${lines.join(" | ")}`).toBe("upward imports: ");
  });

  it("keeps every schema leaf a leaf", () => {
    // The exception above is safe only while schema files import nothing
    // above tsp. A schema that grows a model import would quietly turn
    // "anyone may read the field tables" into "anyone may reach any layer".
    const CEILING = rank.get("tsp")!;
    const bad = ALL.filter(
      (e) =>
        /\/schema\.ts$/.test(e.fromFile) &&
        (rank.get(e.toDir) ?? -1) > CEILING &&
        !/\/schema\.ts$/.test(e.toFile),
    ).map((e) => `${e.fromFile} -> ${e.toFile}`);
    expect(`schema leaves importing models: ${[...new Set(bad)].join(" | ")}`).toBe(
      "schema leaves importing models: ",
    );
  });

  it("covers every directory, so a new one cannot dodge the order", () => {
    const dirs = readdirSync(SRC).filter((n) => statSync(`${SRC}/${n}`).isDirectory());
    const unknown = dirs.filter((d) => !rank.has(d));
    expect(`directories outside ORDER: ${unknown.join(",")}`).toBe("directories outside ORDER: ");
  });
});
