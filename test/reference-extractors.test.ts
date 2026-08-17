/**
 * Do our reference extractors agree with Apple's own bookkeeping?
 *
 * Every archive carries `ArchiveInfo.message_info.object_references`: the
 * list of objects its payload points at. When this library edits an archive
 * it recomputes that list with a {@link ReferenceExtractor}, replacing what
 * Apple wrote.
 *
 * That makes the extractors checkable against ground truth, and nobody
 * checked. An unmodified Apple archive already carries the right answer, so
 * running our extractor over it and comparing is a complete test — no app
 * required. When it was finally run, **10381 of 11253 covered archives
 * disagreed**.
 *
 * The one that mattered: a `TSWP.StorageArchive` declares its stylesheet in
 * field 2, and Apple never lists that in `object_references` — 2676
 * storages in these fixtures carry the field, zero declare it. We did.
 * Pages responds by opening the document, keeping every character of text,
 * and rendering the entire body unstyled.
 *
 * Nothing about it is malformed. The reference is real, the target exists,
 * the schema is satisfied, the file round-trips, and `required:check`
 * passes. It also fires on *any* edit, because the list is recomputed
 * whenever an archive is re-serialized — a one-character replacement breaks
 * a document exactly as thoroughly as appending a paragraph. Six rounds in
 * the app went into finding it; this test would have taken one run.
 *
 * The remaining disagreements are recorded as a budget rather than hidden:
 * they are real, they are not yet understood, and the number must not grow.
 */
import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "./harness.ts";
import {
  IWorkDocument,
  KeynoteDocument,
  NumbersDocument,
  PagesDocument,
  deepCloneObject,
} from "../src/index.ts";
import { typeName } from "../src/tsp/registry.ts";
import { drawableParent } from "../src/tsd/schema.ts";

const FIXTURES = new URL("../fixtures/", import.meta.url);

interface Tally {
  covered: number;
  agree: number;
  threw: number;
  byType: Map<number, number>;
}

function audit(): Tally {
  const out: Tally = { covered: 0, agree: 0, threw: 0, byType: new Map() };
  for (const name of readdirSync(FIXTURES)) {
    const Doc = name.endsWith(".pages")
      ? PagesDocument
      : name.endsWith(".numbers")
        ? NumbersDocument
        : name.endsWith(".key")
          ? KeynoteDocument
          : undefined;
    if (!Doc) continue;
    let doc: PagesDocument | NumbersDocument | KeynoteDocument;
    try {
      doc = (Doc as typeof PagesDocument).load(
        new Uint8Array(readFileSync(new URL(name, FIXTURES))),
      );
    } catch {
      continue; // unreadable fixtures are another test's problem
    }
    const store = doc.store as unknown as {
      refExtractors: Map<number, (m: unknown) => bigint[]>;
    };
    for (const { obj } of doc.store.allObjects()) {
      const extract = store.refExtractors.get(obj.type);
      if (!extract) continue;
      out.covered++;
      let ours: string;
      try {
        ours = [...new Set(extract(obj.message).map(String))].sort().join(",");
      } catch {
        // An extractor that throws on a real archive is its own bug, but a
        // separate one; counted so it cannot hide here.
        out.threw++;
        continue;
      }
      const theirs = [...new Set(obj.getObjectReferences().map(String))].sort().join(",");
      if (ours === theirs) out.agree++;
      else out.byType.set(obj.type, (out.byType.get(obj.type) ?? 0) + 1);
    }
  }
  return out;
}

const TALLY = audit();

describe("reference extractors agree with Apple", () => {
  it("a text storage never declares its own stylesheet", () => {
    // The specific defect, pinned on its own so a regression names itself
    // rather than nudging a budget.
    let withField = 0;
    let declaring = 0;
    let oursDeclaring = 0;
    for (const name of readdirSync(FIXTURES)) {
      if (!name.endsWith(".pages")) continue;
      let doc: PagesDocument;
      try {
        doc = PagesDocument.load(new Uint8Array(readFileSync(new URL(name, FIXTURES))));
      } catch {
        continue;
      }
      const store = doc.store as unknown as {
        refExtractors: Map<number, (m: unknown) => bigint[]>;
      };
      const extract = store.refExtractors.get(2001);
      if (!extract) continue;
      for (const { obj } of doc.store.allObjects()) {
        if (obj.type !== 2001) continue;
        const sheet = obj.message.getMessage(2)?.getUint(1);
        if (sheet === undefined) continue;
        withField++;
        if (obj.getObjectReferences().some((r) => r === BigInt(sheet))) declaring++;
        if (extract(obj.message).some((r) => r === BigInt(sheet))) oursDeclaring++;
      }
    }
    expect(withField > 100).toBe(true);
    expect(`apple declares it in ${declaring} of ${withField}`).toBe(
      `apple declares it in 0 of ${withField}`,
    );
    expect(`we declare it in ${oursDeclaring} of ${withField}`).toBe(
      `we declare it in 0 of ${withField}`,
    );
  });

  it("storages and text styles reproduce Apple's list exactly", () => {
    // The four types the Pages ladder actually exercises.
    const EXACT = [2001, 2021, 2022, 2024];
    const failing = EXACT.filter((t) => (TALLY.byType.get(t) ?? 0) > 0).map(
      (t) => `${typeName(t) ?? t}=${TALLY.byType.get(t)}`,
    );
    expect(`disagreeing: ${failing.join(" ")}`).toBe("disagreeing: ");
  });

  it("does not let the overall disagreement count grow", () => {
    // A budget, not an endorsement, and it only goes down. What remains,
    // characterised:
    //
    //   * Keynote type 5 (148) — we OMIT references Apple declares, to
    //     guide storages and text styles. Omission is the worse direction:
    //     an undeclared cross-component reference is what makes an app call
    //     a document damaged.
    //   * TSWP.SectionPlaceholderArchive (47) — we omit one each.
    //   * TSS.StylesheetArchive (36) — we ADD hundreds, declaring the styles
    //     the sheet contains. This is the container rule again and it is on
    //     a live path: creating a character style dirties the stylesheet.
    //
    // Two instances of that container rule hold elsewhere — a storage must
    // not declare its stylesheet, a drawable must not declare its parent —
    // and this comparison is exactly what catches a violation of either.
    const disagree = TALLY.covered - TALLY.agree - TALLY.threw;
    expect(`disagree<=233: ${disagree <= 233} (${disagree})`).toBe(
      `disagree<=233: true (${disagree})`,
    );
  });

  it("covers a meaningful share of the corpus", () => {
    // Guards the guard: if extractors stopped being registered, every count
    // above would pass trivially.
    expect(TALLY.covered > 10_000).toBe(true);
    expect(TALLY.agree > 10_000).toBe(true);
  });
});

describe("a drawable declares what it resolves through, not what holds it", () => {
  // The container rule, measured per type rather than assumed uniform.
  // Assuming it was uniform would have dropped the 36 references a
  // connection line legitimately makes to its parent — the omission
  // direction, which is what makes an app call a document damaged.
  const EXPECTED = new Map([
    ["TSWP.ShapeInfoArchive", 0],
    ["TSD.ImageArchive", 0],
    ["TSD.MaskArchive", 0],
    ["TSD.GroupArchive", 0],
    ["TSD.MovieArchive", 0],
  ]);

  it("matches the corpus for every drawable type the store subtracts", () => {
    const tally = new Map<number, { carry: number; declare: number }>();
    for (const name of readdirSync(FIXTURES)) {
      const Doc = name.endsWith(".pages")
        ? PagesDocument
        : name.endsWith(".numbers")
          ? NumbersDocument
          : name.endsWith(".key")
            ? KeynoteDocument
            : undefined;
      if (!Doc) continue;
      let doc: PagesDocument | NumbersDocument | KeynoteDocument;
      try {
        doc = (Doc as typeof PagesDocument).load(
          new Uint8Array(readFileSync(new URL(name, FIXTURES))),
        );
      } catch {
        continue;
      }
      for (const { obj } of doc.store.allObjects()) {
        const parent = drawableParent(obj.type, obj.message);
        if (parent === undefined) continue;
        let t = tally.get(obj.type);
        if (!t) tally.set(obj.type, (t = { carry: 0, declare: 0 }));
        t.carry++;
        if (obj.getObjectReferences().includes(parent)) t.declare++;
      }
    }

    const wrong: string[] = [];
    for (const [type, t] of tally) {
      const name = typeName(type) ?? String(type);
      const expected = EXPECTED.get(name);
      // A type in the store's subtraction map but not in the table above is
      // as much a failure as a wrong count: it means the rule was extended
      // to a type nobody measured.
      if (expected === undefined) wrong.push(`${name} unmeasured (${t.carry})`);
      else if (t.declare !== expected) wrong.push(`${name} declares ${t.declare}/${t.carry}`);
    }
    expect(`disagreeing with the measured rule: ${wrong.join(" ")}`).toBe(
      "disagreeing with the measured rule: ",
    );
    // Guards the guard: an empty map would pass trivially.
    expect(tally.size).toBe(EXPECTED.size);
  });

  it("holds through IWorkDocument.open, not only the app loaders", () => {
    // `open()` builds its ObjectStore at a different call site from the
    // subclasses' `loadStore`, and for a while that site simply omitted the
    // `containerParentOf` injection. Nothing failed: the rule only acts when
    // a *clone* of a parented drawable is re-declared at save time, and no
    // test exercised that path through `open()`. This one does, so the two
    // construction sites cannot drift again.
    //
    // The clone must be of a type with no extractor (mask, group, shape,
    // shape-info) — an extractor never emits the parent in the first place,
    // so cloning an image would pass even with the injection missing.
    const EXTRACTORLESS_PARENTED = new Set([2011, 3004, 3006, 3007, 3008]);
    let exercised = 0;
    for (const name of readdirSync(FIXTURES)) {
      if (!/\.(pages|numbers|key)$/.test(name)) continue;
      let doc: IWorkDocument;
      try {
        doc = IWorkDocument.open(new Uint8Array(readFileSync(new URL(name, FIXTURES))));
      } catch {
        continue;
      }
      const source = [...doc.store.allObjects()].find(
        ({ obj }) =>
          EXTRACTORLESS_PARENTED.has(obj.type) &&
          drawableParent(obj.type, obj.message) !== undefined,
      );
      if (!source) continue;
      const { clone } = deepCloneObject(doc.store, source.obj, { follow: () => false });
      doc.save();
      const parent = drawableParent(clone.type, clone.message)!;
      const refs = clone.getObjectReferences();
      // Guards the guard: a clone whose scan produced nothing at all would
      // "exclude" its parent trivially.
      expect(refs.length > 0).toBe(true);
      expect(refs.includes(parent)).toBe(false);
      exercised++;
      if (exercised >= 3) break;
    }
    expect(exercised > 0).toBe(true);
  });
});
