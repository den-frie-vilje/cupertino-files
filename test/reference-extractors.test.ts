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
import { KeynoteDocument, NumbersDocument, PagesDocument } from "../src/index.ts";
import { typeName } from "../src/tsp/registry.ts";

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
    // Two instances of that container rule are already fixed — a storage
    // must not declare its stylesheet, a drawable must not declare its
    // parent — and both were found by exactly this comparison.
    const disagree = TALLY.covered - TALLY.agree - TALLY.threw;
    expect(`disagree<=231: ${disagree <= 231} (${disagree})`).toBe(
      `disagree<=231: true (${disagree})`,
    );
  });

  it("covers a meaningful share of the corpus", () => {
    // Guards the guard: if extractors stopped being registered, every count
    // above would pass trivially.
    expect(TALLY.covered > 10_000).toBe(true);
    expect(TALLY.agree > 10_000).toBe(true);
  });
});
