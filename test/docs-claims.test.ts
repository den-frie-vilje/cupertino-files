/**
 * Prose documentation, re-measured.
 *
 * The generated pages cannot drift — `coverage:check`, `tooldocs:check`,
 * `conformance:check`, `blanks:check` and the proto embeds all gate their
 * artifacts in CI, and the API reference is rebuilt from the docblocks on
 * every site deploy. Hand-written pages state measured numbers too, and
 * the corpus grows: a count that was true at writing quietly stops being
 * true when a fixture lands. Every such claim is registered here and
 * re-measured against the live fixtures, so the corpus outgrowing the
 * prose is a test failure naming the file and both numbers instead of a
 * reader's discovery.
 *
 * The boundary: numbers in README/FORMAT.md/SKILL.md belong in this
 * registry; numbers in code docblocks are evidence beside the code and
 * are pinned by the invariant tests that re-measure them (the
 * paragraph-boundaries and table-positions files are the pattern).
 */
import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "./harness.ts";
import { IWorkDocument } from "../src/index.ts";
import { Storage, TSWP_TYPE } from "../src/tswp/schema.ts";
import { STORAGE_KIND } from "../src/tswp/textstorage.ts";

const ROOT = new URL("../", import.meta.url);
const FIXTURES = new URL("fixtures/", ROOT);

/** One sweep of the corpus collects every number the docs state. */
function measure(): {
  iwaPagesFixtures: number;
  storages: number;
  styleSheetCarriers: number;
  styleSheetDeclarers: number;
  sixFieldCarriers: number;
  bodies: number;
  bareBodies: number;
  terminatorBodies: number;
  emptyBodies: number;
} {
  const six = [
    Storage.TABLE_PARA_STYLE,
    Storage.TABLE_PARA_DATA,
    Storage.TABLE_LIST_STYLE,
    Storage.IN_DOCUMENT,
    Storage.TABLE_PARA_STARTS,
    Storage.TABLE_PARA_BIDI,
  ];
  const out = {
    iwaPagesFixtures: 0,
    storages: 0,
    styleSheetCarriers: 0,
    styleSheetDeclarers: 0,
    sixFieldCarriers: 0,
    bodies: 0,
    bareBodies: 0,
    terminatorBodies: 0,
    emptyBodies: 0,
  };
  for (const name of readdirSync(FIXTURES).sort()) {
    if (!/\.(pages|numbers|key)$/.test(name)) continue;
    let doc: IWorkDocument;
    try {
      doc = IWorkDocument.open(new Uint8Array(readFileSync(new URL(name, FIXTURES))));
    } catch {
      continue; // the pre-IWA .pages file, another test's subject
    }
    if (name.endsWith(".pages")) out.iwaPagesFixtures++;
    for (const { obj } of doc.store.allObjects()) {
      if (obj.type !== TSWP_TYPE.STORAGE) continue;
      out.storages++;
      if (obj.message.has(Storage.STYLE_SHEET)) {
        out.styleSheetCarriers++;
        const target = obj.message.getMessage(Storage.STYLE_SHEET)?.getVarint(1);
        if (target !== undefined && obj.getObjectReferences().includes(target)) {
          out.styleSheetDeclarers++;
        }
      }
      if (six.every((field) => obj.message.has(field))) out.sixFieldCarriers++;
    }
    for (const storage of doc.textStorages()) {
      if (storage.kind !== STORAGE_KIND.BODY) continue;
      out.bodies++;
      const text = storage.text;
      if (text.length === 0) out.emptyBodies++;
      else if (text.endsWith("\n")) out.terminatorBodies++;
      else out.bareBodies++;
    }
  }
  return out;
}

interface Claim {
  file: string;
  /** What the sentence asserts, for the failure message. */
  about: string;
  /** Must match the document; every capture group is a stated number. */
  stem: RegExp;
  /** The numbers the corpus measures, in capture order. */
  expected: (m: ReturnType<typeof measure>) => number[];
}

const CLAIMS: Claim[] = [
  {
    file: "docs/FORMAT.md",
    about: "the paragraph-style preset list is on every IWA Pages fixture",
    stem: /in all (\d+) IWA-format Pages fixtures/,
    expected: (m) => [m.iwaPagesFixtures],
  },
  {
    file: "docs/FORMAT.md",
    about: "every storage carries style_sheet and none declares it",
    stem: /(\d+) storages carry the field and \*\*zero\*\* declare it/,
    expected: (m) => [m.styleSheetCarriers],
  },
  {
    file: "docs/FORMAT.md",
    about: "the reference-discipline table's style_sheet row",
    stem: /\| `TSWP\.StorageArchive` \| `style_sheet` \| (\d+) \| \*\*0\*\* \|/,
    expected: (m) => [m.styleSheetCarriers],
  },
  {
    file: "docs/FORMAT.md",
    about: "the six storage fields every corpus storage carries",
    stem: /(\d+) of (\d+) storages carry `table_para_style`/,
    expected: (m) => [m.sixFieldCarriers, m.storages],
  },
  {
    file: "skills/cupertino-files/SKILL.md",
    about: "the body-tail split (bare / terminator / empty)",
    stem: /of the corpus's (\d+) body storages, (\d+) end bare[\s\S]*?(\d+) end with the terminator, (\d+) are empty/,
    expected: (m) => [m.bodies, m.bareBodies, m.terminatorBodies, m.emptyBodies],
  },
];

describe("prose docs match the corpus they cite", () => {
  const measured = measure();

  it("the zero-claims still measure zero", () => {
    // "Zero declare it" is the load-bearing half of the style_sheet rule;
    // a fixture arriving with a declaration would change the rule itself,
    // not just a count.
    expect(measured.styleSheetDeclarers).toBe(0);
    expect(measured.storages).toBeGreaterThan(2900);
  });

  for (const claim of CLAIMS) {
    it(`${claim.file}: ${claim.about}`, () => {
      const text = readFileSync(new URL(claim.file, ROOT), "utf8");
      const match = claim.stem.exec(text);
      expect(
        match ? "stated" : `sentence not found — rewritten? update this registry entry`,
      ).toBe("stated");
      const stated = match!.slice(1).map(Number);
      const expected = claim.expected(measured);
      expect(`${claim.file} states ${stated.join(", ")}`).toBe(
        `${claim.file} states ${expected.join(", ")}`,
      );
    });
  }
});
