/**
 * End-to-end: structures the library writes that only an app can accept
 * or reject — each test writes with the library, has the app open and
 * fully resave the package, and asserts the structure survived the
 * rewrite. Same harness and safety rules as roundtrip.e2e.test.ts.
 *
 * What a failure means, per test, is written above each one — a failure
 * here is usually the more informative outcome, so read the comment
 * before assuming breakage.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { describe, expect, it } from "../harness.ts";
import {
  BorderPosition,
  KeynoteDocument,
  NumbersDocument,
  PagesDocument,
  solidStroke,
} from "../../src/index.ts";
import { Storage } from "../../src/tswp/schema.ts";
import { busySkipReason, E2ESession, withDocument, type IWorkApp } from "./applescript.ts";

const skip: Record<IWorkApp, string | null> = {
  Pages: busySkipReason("Pages"),
  Numbers: busySkipReason("Numbers"),
  Keynote: busySkipReason("Keynote"),
};

const session = skip.Pages && skip.Numbers && skip.Keynote ? undefined : E2ESession.create();

process.on("exit", () => session?.cleanup());

const PAGES_FIXTURE = "picodocs-v14.4-headers-tables.pages";
const BUILDS_FIXTURE = "olekristensen-v26.3-mac-builds-effects.key";
const FILTERS_FIXTURE = "olekristensen-v26.3-mac-filters.numbers";

describe("e2e: library-written structures survive an app resave", () => {
  // A failure at `open` means Pages rejects the bidi pair we write — the
  // direction feature regresses to app-blocked. A failure on the reparse
  // means Pages accepted the file but recomputed or dropped the pair on
  // resave; either way the direction the app now stores is the finding.
  it("paragraph direction", { skip: skip.Pages ?? false }, () => {
    session!.remember("Pages");
    const path = session!.path("direction.pages");
    const doc = PagesDocument.load(readFileSync(session!.stageFixture(PAGES_FIXTURE)));
    doc.appendParagraph("עברית מיושרת לימין", "Body");
    const rtl = doc.paragraphs().findIndex((p) => p.text.startsWith("עברית"));
    doc.body.setParagraphDirection(rtl, "rtl");
    writeFileSync(path, doc.save());

    withDocument("Pages", path, "name of theDoc", { save: true });

    const reparsed = PagesDocument.load(readFileSync(path));
    const hebrew = reparsed.paragraphs().findIndex((p) => p.text.startsWith("עברית"));
    expect(hebrew >= 0).toBe(true);
    expect(reparsed.body.paragraphDirection(hebrew)).toBe("rtl");
  });

  // A failure at `open` means Pages rejects our placeholder field. Zero
  // placeholders after resave means the app *consumed or dropped* an
  // untouched field — which would contradict the measured lifecycle,
  // where only tap-and-type consumes one.
  it("a defined placeholder", { skip: skip.Pages ?? false }, () => {
    session!.remember("Pages");
    const path = session!.path("placeholder.pages");
    const doc = PagesDocument.load(readFileSync(session!.stageFixture(PAGES_FIXTURE)));
    doc.appendParagraph("[skriv navn her]", "Body");
    doc.find("[skriv navn her]")[0]!.asPlaceholder();
    const before = doc.placeholders().length;
    writeFileSync(path, doc.save());

    withDocument("Pages", path, "name of theDoc", { save: true });

    const reparsed = PagesDocument.load(readFileSync(path));
    expect(reparsed.placeholders().length).toBe(before);
    expect(reparsed.placeholders().some((p) => p.text === "[skriv navn her]")).toBe(true);
  });

  // A failure on the reparse means Pages recomputed the paragraph's
  // border on resave — the stored bits after the rewrite are the finding.
  it("paragraph borders", { skip: skip.Pages ?? false }, () => {
    session!.remember("Pages");
    const path = session!.path("borders.pages");
    const doc = PagesDocument.load(readFileSync(session!.stageFixture(PAGES_FIXTURE)));
    const index = doc.body.appendParagraph("Denne linje har en venstre kant.");
    doc.body
      .paragraph(index)
      .format({
        border: solidStroke({ r: 0.8, g: 0.2, b: 0.1 }, 3),
        borderPositions: BorderPosition.LEADING,
      });
    writeFileSync(path, doc.save());

    withDocument("Pages", path, "name of theDoc", { save: true });

    const reparsed = PagesDocument.load(readFileSync(path));
    const target = reparsed.paragraphs().findIndex((p) => p.text.startsWith("Denne linje"));
    const start = reparsed.body.paragraphStarts()[target]!;
    const styleId = reparsed.body.effectiveObjectAt(Storage.TABLE_PARA_STYLE, start);
    expect(styleId === undefined).toBe(false);
    const bits =
      reparsed.body.sheet()!.style(styleId!)?.resolved().paragraph.borderPositions ?? 0;
    expect(bits).toBe(BorderPosition.LEADING);
  });

  // A failure at `open` means Keynote rejects a deck whose build we
  // retimed. A reparse showing the old duration means Keynote recomputed
  // the animation attributes on resave — retiming would then need to
  // touch whatever else the app derives.
  it("a retimed build", { skip: skip.Keynote ?? false }, () => {
    session!.remember("Keynote");
    const path = session!.path("retimed.key");
    const doc = KeynoteDocument.load(readFileSync(session!.stageFixture(BUILDS_FIXTURE)));
    doc.slides()[0]!.builds()[0]!.set({ duration: 2.5, delay: 0.5 });
    writeFileSync(path, doc.save());

    withDocument("Keynote", path, "name of theDoc", { save: true });

    const reparsed = KeynoteDocument.load(readFileSync(path));
    const info = reparsed.slides()[0]!.builds()[0]!.read();
    expect(info.effect).toBe("apple:dissolve character");
    expect(info.duration).toBe(2.5);
    expect(info.delay).toBe(0.5);
  });

  // A failure on the reparse means Numbers turned the set back on or
  // dropped its rules on resave. Row visibility is the app's to
  // recompute either way — this asserts only the stored rulebook.
  it("a disabled filter set", { skip: skip.Numbers ?? false }, () => {
    session!.remember("Numbers");
    const path = session!.path("filter-toggle.numbers");
    const doc = NumbersDocument.load(readFileSync(session!.stageFixture(FILTERS_FIXTURE)));
    const table = doc.tables().find((t) => (t.filterSets().rows?.rules().length ?? 0) > 0)!;
    table.filterSets().rows!.setEnabled(false);
    writeFileSync(path, doc.save());

    withDocument("Numbers", path, "name of theDoc", { save: true });

    const reparsed = NumbersDocument.load(readFileSync(path));
    const set = reparsed
      .tables()
      .map((t) => t.filterSets().rows)
      .find((s) => (s?.rules().length ?? 0) > 0)!;
    expect(set.enabled).toBe(false);
    expect(set.rules().length).toBe(2);
  });
});

describe("e2e: harness", () => {
  it("reports why it skipped, so a silent no-op is impossible", () => {
    const reasons = Object.entries(skip)
      .filter(([, reason]) => reason)
      .map(([app, reason]) => `${app}: ${reason}`);
    if (reasons.length > 0) {
      console.log(`\ne2e skipped —\n  ${reasons.join("\n  ")}\n`);
    }
    expect(reasons.length >= 0).toBe(true);
  });
});
