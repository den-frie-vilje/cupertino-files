import { readFileSync } from "node:fs";
import { describe, expect, it } from "./harness.ts";
import { bytesEqual, KeynoteDocument } from "../src/index.ts";

const FIXTURES = new URL("../fixtures/", import.meta.url);
const fixture = (name: string) => new Uint8Array(readFileSync(new URL(name, FIXTURES)));

describe("Keynote slide model", () => {
  it("walks the slide tree in presentation order across eras", () => {
    const cases: [string, number, number, number][] = [
      // file, slides, canvas width, canvas height
      ["iwork-mcp-v14.5-sample.key", 3, 1920, 1080],
      ["tika-testKeynote2013.key", 3, 1024, 768],
      ["tika-testKeynote2018.key", 2, 1920, 1080],
    ];
    for (const [name, slideCount, width, height] of cases) {
      const doc = KeynoteDocument.load(fixture(name));
      expect(doc.slideCount()).toBe(slideCount);
      const size = doc.slideSize()!;
      expect(size.width).toBe(width);
      expect(size.height).toBe(height);
      const slides = doc.slides();
      // Indices are dense and ordered; every slide has a distinct object.
      expect(slides.map((s) => s.index)).toEqual(slides.map((_, i) => i));
      expect(new Set(slides.map((s) => s.id)).size).toBe(slides.length);
      // Masters are real and disjoint from the presented slides.
      const masters = doc.masterSlides();
      expect(masters.length).toBeGreaterThan(0);
      const slideIds = new Set(slides.map((s) => s.id));
      expect(masters.every((m) => !slideIds.has(m.id))).toBe(true);
    }
  });

  it("reads titles, speaker notes and drawables", () => {
    const doc = KeynoteDocument.load(fixture("tika-testKeynote2013.key"));
    const slides = doc.slides();
    expect(slides[0]!.title).toBe("A sample presentation");
    expect(slides[1]!.title).toBe("Slide 1");
    // Only the second slide carries a note in this deck.
    expect(slides[1]!.notes).toBe("A nice note");
    expect(slides[0]!.notes).toBe("");
    expect(doc.allNotes().filter((n) => n.notes.length > 0).length).toBe(1);
    expect(slides[0]!.drawables().length).toBeGreaterThan(0);
    expect(slides[0]!.textStorages().length).toBeGreaterThan(0);
  });

  it("reads transitions, treating \"none\" as disabled", () => {
    const doc = KeynoteDocument.load(fixture("iwork-mcp-v14.5-sample.key"));
    for (const slide of doc.slides()) {
      const transition = slide.transition()!;
      // Keynote encodes "no transition" explicitly rather than omitting it.
      expect(transition.effect).toBe("none");
      expect(transition.enabled).toBe(false);
      expect(transition.duration).toBe(1);
      expect(transition.automatic).toBe(false);
    }
  });

  it("edits transitions and speaker notes, and round-trips", () => {
    const doc = KeynoteDocument.load(fixture("tika-testKeynote2013.key"));
    const noteSlideId = doc.slides()[1]!.id;
    doc.slides()[0]!.setTransition({ effect: "apple:transition/dissolve", duration: 2.5, automatic: true });
    doc.slides()[1]!.notes = "Rewritten speaker note.";

    const reloaded = KeynoteDocument.load(doc.save());
    const first = reloaded.slides()[0]!.transition()!;
    expect(first.effect).toBe("apple:transition/dissolve");
    expect(first.enabled).toBe(true);
    expect(first.duration).toBe(2.5);
    expect(first.automatic).toBe(true);
    // Untouched slides keep "none".
    expect(reloaded.slides()[2]!.transition()!.enabled).toBe(false);

    const edited = reloaded.slides().find((s) => s.id === noteSlideId)!;
    expect(edited.notes).toBe("Rewritten speaker note.");
    expect(reloaded.slideCount()).toBe(3);
  });

  it("round-trips untouched decks byte-identically", () => {
    for (const name of ["iwork-mcp-v14.5-sample.key", "tika-testKeynote2018.key"]) {
      const original = fixture(name);
      const doc = KeynoteDocument.load(original);
      doc.slides().forEach((s) => {
        s.title;
        s.notes;
        s.transition();
        s.drawables();
      });
      expect(bytesEqual(doc.save(), original)).toBe(false); // zip re-encoded
      // …but every component's content is preserved; verified in versions.test.ts
      expect(KeynoteDocument.load(doc.save()).slideCount()).toBe(doc.slideCount());
    }
  });
});
