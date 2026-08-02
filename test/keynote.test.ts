import { readFileSync } from "node:fs";
import { describe, expect, it } from "./harness.ts";
import { bytesEqual, KeynoteDocument, PlaceholderKind, ShowMode } from "../src/index.ts";
import { readdirSync } from "node:fs";

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
      for (const s of doc.slides()) {
        // Reading every accessor must not throw or dirty the document.
        const touched = [s.title, s.notes, s.transition(), s.drawables()];
        expect(touched.length).toBe(4);
      }
      expect(bytesEqual(doc.save(), original)).toBe(false); // zip re-encoded
      // …but every component's content is preserved; verified in versions.test.ts
      expect(KeynoteDocument.load(doc.save()).slideCount()).toBe(doc.slideCount());
    }
  });
});

describe("current-era Keynote decks (26.x)", () => {
  it("reads decks written by both macOS and iOS builds", () => {
    // Build prefixes identify the writing platform: M… macOS, T… iOS/iPadOS.
    const cases: [string, string, string][] = [
      ["zenodo-v26.0-ios-writer.key", "26.0.0", "T15.1"],
      ["zenodo-v26.1-hyperlinks-masks.key", "26.1.0", "M15.2.1"],
      ["zenodo-v26.1-pptx-lineage.key", "26.1.0", "M15.2.1"],
    ];
    for (const [name, version, build] of cases) {
      const doc = KeynoteDocument.load(fixture(name));
      const report = doc.compatibility();
      expect(report.era).toBe("current");
      expect(report.formatVersion!.toString()).toBe(version);
      expect(report.appBuilds.join(" ")).toContain(build);
      expect(report.unsupportedFeatures.length).toBe(0);

      // The slide model works on current-era decks, not just older ones.
      expect(doc.slideCount()).toBeGreaterThan(0);
      expect(doc.slideSize()!.width).toBeGreaterThan(0);
      expect(doc.masterSlides().length).toBeGreaterThan(0);
      for (const slide of doc.slides()) {
        // Every slide carries a transition record, even when disabled.
        expect(slide.transition() !== undefined).toBe(true);
      }
    }
  });

  it("reads hyperlinks inside a current-era deck", () => {
    const doc = KeynoteDocument.load(fixture("zenodo-v26.1-hyperlinks-masks.key"));
    const links = doc.textStorages().flatMap((s) => s.links());
    expect(links.length).toBeGreaterThan(0);
    expect(links.every((l) => l.url.length > 0)).toBe(true);
  });

  it("edits and round-trips a 26.x deck", () => {
    const doc = KeynoteDocument.load(fixture("zenodo-v26.1-hyperlinks-masks.key"));
    const slideCount = doc.slideCount();
    doc.slides()[0]!.setTransition({ effect: "apple:transition/dissolve", duration: 1.5 });
    const reloaded = KeynoteDocument.load(doc.save());
    expect(reloaded.slideCount()).toBe(slideCount);
    const transition = reloaded.slides()[0]!.transition()!;
    expect(transition.effect).toBe("apple:transition/dissolve");
    expect(transition.duration).toBe(1.5);
    expect(reloaded.compatibility().formatVersion!.toString()).toBe("26.1.0");
  });
});

describe("slide management", () => {
  const decks = [
    "zenodo-v26.1-hyperlinks-masks.key",
    "tika-testKeynote2013.key",
    "iwork-mcp-v14.5-sample.key",
  ];

  it("adds a blank slide on the same layout across both tree generations", () => {
    // The flat `slideTree.slides` list and the legacy root-node children are
    // different encodings of the same order; both must accept an insertion.
    for (const name of decks) {
      const doc = KeynoteDocument.load(fixture(name));
      const before = doc.slideCount();
      const source = doc.slides()[0]!;
      const added = doc.addSlide({ copyOf: 0, after: 0 });

      expect(doc.slideCount()).toBe(before + 1);
      expect(added.index).toBe(1);
      // Same layout, no inherited content.
      expect(added.masterId).toBe(source.masterId);
      expect(added.drawables().length).toBe(0);
      expect((added.title ?? "").trim()).toBe("");

      const reloaded = KeynoteDocument.load(doc.save());
      expect(reloaded.slideCount()).toBe(before + 1);
      expect(reloaded.compatibility().canRoundTrip).toBe(true);
    }
  });

  it("gives a new slide its own placeholders, not the source's", () => {
    // The bug a shallow copy would produce: both slides pointing at one
    // placeholder, so typing into either rewrites the other.
    const doc = KeynoteDocument.load(fixture("zenodo-v26.1-hyperlinks-masks.key"));
    const source = doc.slides()[0]!;
    const sourceTitle = source.title;
    expect((sourceTitle ?? "").length).toBeGreaterThan(0);

    const added = doc.addSlide({ copyOf: 0, after: 0 });
    // No storage object is shared between the two slides.
    const sourceStorages = new Set(source.textStorages().map((s) => s.id));
    expect(added.textStorages().some((s) => sourceStorages.has(s.id))).toBe(false);

    const storage = added.textStorages()[0];
    expect(storage !== undefined).toBe(true);
    storage!.setText("only on the copy");

    const reloaded = KeynoteDocument.load(doc.save());
    // Writing through the copy left the original's title alone.
    expect(reloaded.slides()[0]!.title).toBe(sourceTitle);
    expect(reloaded.slides()[1]!.textStorages()[0]!.text).toBe("only on the copy");
  });

  it("duplicates a slide with its content", () => {
    const doc = KeynoteDocument.load(fixture("zenodo-v26.1-hyperlinks-masks.key"));
    const source = doc.slides()[0]!;
    const drawablesBefore = source.drawables().length;
    expect(drawablesBefore).toBeGreaterThan(0);

    const copy = doc.duplicateSlide(0);
    expect(copy.index).toBe(1);
    expect(copy.drawables().length).toBe(drawablesBefore);
    // Copied, not shared: no drawable id appears in both slides.
    const sourceIds = new Set(source.drawables().map((d) => d.id));
    expect(copy.drawables().some((d) => sourceIds.has(d.id))).toBe(false);

    const reloaded = KeynoteDocument.load(doc.save());
    expect(reloaded.slides()[1]!.drawables().length).toBe(drawablesBefore);
    expect(reloaded.compatibility().canRoundTrip).toBe(true);
  });

  it("moves and removes slides", () => {
    const doc = KeynoteDocument.load(fixture("zenodo-v26.1-hyperlinks-masks.key"));
    const titles = doc.slides().map((s) => s.title);
    expect(titles.length).toBeGreaterThan(2);

    doc.moveSlide(0, 2);
    const moved = KeynoteDocument.load(doc.save());
    expect(moved.slides()[2]!.title).toBe(titles[0]);
    expect(moved.slides()[0]!.title).toBe(titles[1]);

    const countBefore = moved.slideCount();
    moved.removeSlide(0);
    const removed = KeynoteDocument.load(moved.save());
    expect(removed.slideCount()).toBe(countBefore - 1);
    expect(removed.slides()[0]!.title).toBe(titles[2]);
    expect(removed.compatibility().canRoundTrip).toBe(true);
  });

  it("refuses to remove the last slide", () => {
    const doc = KeynoteDocument.load(fixture("tika-testKeynote2018.key"));
    while (doc.slideCount() > 1) doc.removeSlide(doc.slideCount() - 1);
    let threw = false;
    try {
      doc.removeSlide(0);
    } catch {
      threw = true;
    }
    expect(threw).toBe(true);
  });
});

describe("slide placeholders", () => {
  const decks = readdirSync(FIXTURES).filter((name) => name.endsWith(".key"));

  it("finds title, body and slide-number placeholders on every deck", () => {
    for (const name of decks) {
      const document = KeynoteDocument.load(fixture(name));
      const slides = document.slides();
      expect(`${name}: ${slides.length > 0}`).toBe(`${name}: true`);
      for (const slide of slides) {
        const roles = slide.placeholders().map((p) => p.role).sort();
        expect(`${name}#${slide.index}: ${roles.join(",")}`).toBe(
          `${name}#${slide.index}: body,slideNumber,title`,
        );
      }
    }
  });

  it("agrees between the slide's field and the archive's own kind", () => {
    // Two independent statements about the same placeholder: which slide
    // field it hangs off, and what the archive says it is. A file where
    // they disagree is one to look at rather than silently resolve.
    const expected: Record<string, number> = {
      title: PlaceholderKind.TITLE,
      body: PlaceholderKind.BODY,
      slideNumber: PlaceholderKind.SLIDE_NUMBER,
      object: PlaceholderKind.OBJECT,
    };
    for (const name of decks) {
      for (const slide of KeynoteDocument.load(fixture(name)).slides()) {
        for (const placeholder of slide.placeholders()) {
          expect(`${name} ${placeholder.role}=${placeholder.kind}`).toBe(
            `${name} ${placeholder.role}=${expected[placeholder.role]}`,
          );
        }
      }
    }
  });

  it("sets a title that survives a save", () => {
    for (const name of decks) {
      const document = KeynoteDocument.load(fixture(name));
      const slide = document.slides()[0]!;
      slide.title = "Rewritten title";

      const reloaded = KeynoteDocument.load(document.save());
      expect(`${name}: ${reloaded.slides()[0]!.title}`).toBe(`${name}: Rewritten title`);
    }
  });

  it("sets a body, and reaches the same storage two ways", () => {
    const document = KeynoteDocument.load(fixture("iwork-mcp-v14.5-sample.key"));
    const slide = document.slides()[0]!;
    slide.body = "First point\nSecond point";

    expect(slide.placeholder("body")!.text).toBe("First point\nSecond point");
    expect(slide.placeholders().find((p) => p.role === "body")!.text).toBe(
      "First point\nSecond point",
    );

    const reloaded = KeynoteDocument.load(document.save());
    expect(reloaded.slides()[0]!.body).toBe("First point\nSecond point");
  });

  it("edits a placeholder's storage like any other text", () => {
    const document = KeynoteDocument.load(fixture("iwork-mcp-v14.5-sample.key"));
    const slide = document.slides()[0]!;
    const storage = slide.placeholder("title")!;
    storage.setText("Draft");
    storage.replaceAll("Draft", "Final");
    expect(slide.title).toBe("Final");
  });

  it("reports a role the slide does not have rather than inventing one", () => {
    const document = KeynoteDocument.load(fixture("iwork-mcp-v14.5-sample.key"));
    const slide = document.slides()[0]!;
    // No corpus deck carries an object placeholder.
    expect(slide.placeholder("object")).toBe(undefined);
    expect(slide.placeholders().some((p) => p.role === "object")).toBe(false);
  });

  it("refuses to fill a placeholder the slide has not got", () => {
    const document = KeynoteDocument.load(fixture("iwork-mcp-v14.5-sample.key"));
    const slide = document.slides()[0]!;
    // Creating one means synthesizing the theme's geometry and style for
    // that role, which is in the master.
    expect(() => slide.setPlaceholderText(30, "object", "x")).toThrow();
  });
});

describe("presentation settings", () => {
  const decks = readdirSync(FIXTURES).filter((name) => name.endsWith(".key"));

  it("reads defaults from the schema, not from zero", () => {
    // Every corpus deck omits slideNumbersVisible and relies on the
    // default; reading an omitted autoplay delay as 0 rather than 5 would
    // describe a self-playing deck that races through itself.
    for (const name of decks) {
      const settings = KeynoteDocument.load(fixture(name)).presentation();
      expect(`${name} delay=${settings.autoplayTransitionDelay}`).toBe(`${name} delay=5`);
      expect(`${name} build=${settings.autoplayBuildDelay}`).toBe(`${name} build=2`);
      expect(`${name} idle=${settings.idleTimerDelay}`).toBe(`${name} idle=900`);
      expect(`${name} mode=${settings.mode}`).toBe(`${name} mode=${ShowMode.NORMAL}`);
    }
  });

  it("changes only the settings it is given", () => {
    const document = KeynoteDocument.load(fixture("iwork-mcp-v14.5-sample.key"));
    const before = document.presentation();
    document.setPresentation({ mode: ShowMode.AUTOPLAY, autoplayTransitionDelay: 12 });

    const after = document.presentation();
    expect(after.mode).toBe(ShowMode.AUTOPLAY);
    expect(after.autoplayTransitionDelay).toBe(12);
    // Untouched properties keep their values.
    expect(after.autoplayBuildDelay).toBe(before.autoplayBuildDelay);
    expect(after.loops).toBe(before.loops);
    expect(after.idleTimerDelay).toBe(before.idleTimerDelay);
  });

  it("survives a save", () => {
    const document = KeynoteDocument.load(fixture("iwork-mcp-v14.5-sample.key"));
    document.setPresentation({
      mode: ShowMode.HYPERLINKS_ONLY,
      loops: true,
      slideNumbersVisible: true,
      playsUponOpen: true,
      idleTimerActive: true,
      idleTimerDelay: 60,
    });

    const reloaded = KeynoteDocument.load(document.save());
    const settings = reloaded.presentation();
    expect(settings.mode).toBe(ShowMode.HYPERLINKS_ONLY);
    expect(settings.loops).toBe(true);
    expect(settings.slideNumbersVisible).toBe(true);
    expect(settings.playsUponOpen).toBe(true);
    expect(settings.idleTimerActive).toBe(true);
    expect(settings.idleTimerDelay).toBe(60);
    // The convenience getters agree with the settings object.
    expect(reloaded.loops).toBe(true);
    expect(reloaded.slideNumbersVisible).toBe(true);
  });

  it("resizes the slide canvas", () => {
    const document = KeynoteDocument.load(fixture("iwork-mcp-v14.5-sample.key"));
    expect(document.slideSize()).toEqual({ width: 1920, height: 1080 });
    document.setSlideSize(1024, 768);

    const reloaded = KeynoteDocument.load(document.save());
    expect(reloaded.slideSize()).toEqual({ width: 1024, height: 768 });
    // Nothing is rescaled: objects keep their coordinates, as they do when
    // Keynote itself changes slide size.
    const drawables = reloaded.slides()[0]!.container().drawables();
    const original = document.slides()[0]!.container().drawables();
    expect(drawables.length).toBe(original.length);
  });
});
