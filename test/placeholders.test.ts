/**
 * Placeholder text (`TSWP.PlaceholderSmartFieldArchive`) and the
 * resolved-formatting readers.
 *
 * The corpus carries 73 placeholder fields across five Pages documents;
 * `patrickomatic-pages26-sections-masks.pages` alone anchors 18 of them.
 * Writing is pinned against the measured shape: the smart-field super
 * with a fresh UUID and one varint = 1.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "./harness.ts";
import { PagesDocument } from "../src/index.ts";

const FIXTURES = new URL("../fixtures/", import.meta.url);
const TEMPLATE = "patrickomatic-pages26-sections-masks.pages";

const load = () =>
  PagesDocument.load(new Uint8Array(readFileSync(new URL(TEMPLATE, FIXTURES))));

describe("reading placeholders", () => {
  it("lists the fixture's placeholder spans with their text", () => {
    const doc = load();
    const total = doc
      .textStorages()
      .reduce((n, storage) => n + storage.placeholders().length, 0);
    expect(total).toBe(18);

    const body = doc.placeholders();
    expect(body.length).toBeGreaterThan(0);
    for (const placeholder of body) {
      expect(placeholder.text.length).toBeGreaterThan(0);
      expect(placeholder.end).toBeGreaterThan(placeholder.start);
    }
  });

  it("an image placeholder is the field over the object-replacement character", () => {
    const doc = PagesDocument.load(
      new Uint8Array(readFileSync(new URL("olekristensen-v14.4-placeholders-image.pages", FIXTURES))),
    );
    const all = doc
      .textStorages()
      .flatMap((storage) => storage.placeholders().map((ph) => ({ storage, ph })));
    expect(all.length).toBe(9);
    expect(doc.placeholders().length).toBe(7);
    const images = all.filter(
      ({ storage, ph }) => storage.text.slice(ph.start, ph.end) === "￼",
    );
    expect(images.length).toBe(1);
  });

  it("a consumed placeholder leaves no field behind", () => {
    const cases: [string, string][] = [
      ["olekristensen-v26.3-ios-placeholder-consumed.pages", "Jeg har selv skrevet"],
      ["olekristensen-v26.3-mac-placeholder-consumed.pages", "Jeg skriver noget"],
    ];
    for (const [name, typed] of cases) {
      const doc = PagesDocument.load(
        new Uint8Array(readFileSync(new URL(name, FIXTURES))),
      );
      const total = doc
        .textStorages()
        .reduce((n, storage) => n + storage.placeholders().length, 0);
      expect(`${name}: ${total}`).toBe(`${name}: 0`);
      expect(doc.bodyText.includes(typed)).toBe(true);
    }
  });
});

describe("filling placeholders", () => {
  it("puts real text in, sheds the marking, keeps the styling", () => {
    const doc = load();
    const before = doc.placeholders();
    const target = before[0]!;
    const styleBefore = doc.body.characterStyleIdAt(target.start);

    const filled = doc.fillPlaceholder(0, "Acme Corporation");
    expect(filled.text).toBe("Acme Corporation");
    expect(doc.placeholders().length).toBe(before.length - 1);
    // The span is no longer any smart field…
    expect(
      doc.smartFields().some((f) => f.start <= filled.start && filled.start < f.end),
    ).toBe(false);
    // …and it kept the ghost text's styling, which is the template's
    // intended look for the final content.
    expect(doc.body.characterStyleIdAt(filled.start)).toBe(styleBefore);

    const reloaded = PagesDocument.load(doc.save());
    expect(reloaded.placeholders().length).toBe(before.length - 1);
    expect(reloaded.bodyText.includes("Acme Corporation")).toBe(true);
  });
});

describe("defining placeholders", () => {
  it("marks a span, matching the measured field shape, and round-trips", () => {
    const doc = PagesDocument.blank();
    doc.appendParagraph("Dear [client name], welcome aboard.", "Body");
    const token = doc.find("[client name]")[0]!;
    token.asPlaceholder();

    const placeholders = doc.placeholders();
    expect(placeholders.length).toBe(1);
    expect(placeholders[0]!.text).toBe("[client name]");

    // The written archive is byte-shaped like the corpus's 64: the
    // smart-field super carrying a UUID, and one varint = 1.
    const field = doc.store.object(placeholders[0]!.fieldId)!;
    const fieldNumbers = field.message.fields
      .map((f) => f.no)
      .filter((no, i, all) => all.indexOf(no) === i)
      .sort((a, b) => a - b);
    expect(fieldNumbers.join(",")).toBe("1,2");
    expect(field.message.getVarint(2)).toBe(1n);
    expect((field.message.getMessage(1)?.getString(1) ?? "").length).toBeGreaterThan(0);

    const reloaded = PagesDocument.load(doc.save());
    expect(reloaded.placeholders().length).toBe(1);
    expect(reloaded.placeholders()[0]!.text).toBe("[client name]");

    // And the full cycle: filling the defined placeholder unmarks it.
    reloaded.fillPlaceholder(0, "Ms. Jensen");
    expect(reloaded.placeholders().length).toBe(0);
    expect(reloaded.bodyText.includes("Dear Ms. Jensen, welcome")).toBe(true);
  });
});

describe("resolved formatting readers", () => {
  it("characterFormattingAt folds paragraph base and character overlay", () => {
    const doc = PagesDocument.blank();
    doc.appendParagraph("Plain then styled words here.", "Body");
    const span = doc.find("styled words")[0]!;
    span.format({ italic: true });

    const inside = doc.characterFormattingAt(span.start);
    expect(inside.italic).toBe(true);
    // The paragraph style's base shows through the overlay: the donor's
    // Body face.
    expect(inside.fontName).toBe("Palatino-Roman");

    const outside = doc.characterFormattingAt(0);
    expect(outside.italic === true).toBe(false);
    expect(outside.fontName).toBe("Palatino-Roman");
  });

  it("characterStyleRuns yields the sweep the per-position walk cost", () => {
    const doc = PagesDocument.blank();
    doc.appendParagraph("Plain then styled words here.", "Body");
    const span = doc.find("styled words")[0]!;
    span.format({ italic: true });

    const runs = doc.body.characterStyleRuns();
    const styledRun = runs.find((run) => run.objectId !== undefined)!;
    expect(styledRun.start).toBe(span.start);
    expect(styledRun.end).toBe(span.end);
    expect(styledRun.objectId).toBe(doc.body.characterStyleIdAt(span.start));
  });
});
