import { readFileSync } from "node:fs";
import { describe, expect, it } from "./harness.ts";
import { MASTER_ONLY_FIELDS, Slide } from "../src/keynote/schema.ts";
import { refId } from "../src/tsp/schema.ts";
import { bytesEqual, KeynoteDocument, PlaceholderKind, ShowMode } from "../src/index.ts";
import { RawMessage } from "../src/base/protobuf.ts";
import { Drawable, ExteriorTextWrap, Image } from "../src/tsd/schema.ts";
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
    doc.slides()[0]!.setTransition({ effect: "apple:ca-push", duration: 2.5, direction: 14, automatic: true });
    doc.slides()[1]!.notes = "Rewritten speaker note.";

    const reloaded = KeynoteDocument.load(doc.save());
    const first = reloaded.slides()[0]!.transition()!;
    expect(first.effect).toBe("apple:ca-push");
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
    // Reading must not dirty: after touching every accessor, an app-written
    // deck still saves to Apple's exact bytes (the corpus-wide version of
    // this claim lives in byte-identity.test.ts). The tika deck is the
    // exception that proves the rule — a re-zipped wrapper bundle whose
    // deflate this library does not clone, so its content survives but its
    // container bytes differ.
    const identicalAfterReading = (name: string): boolean => {
      const original = fixture(name);
      const doc = KeynoteDocument.load(original);
      for (const s of doc.slides()) {
        const touched = [s.title, s.notes, s.transition(), s.drawables()];
        expect(touched.length).toBe(4);
      }
      expect(KeynoteDocument.load(doc.save()).slideCount()).toBe(doc.slideCount());
      return bytesEqual(doc.save(), original);
    };
    expect(identicalAfterReading("iwork-mcp-v14.5-sample.key")).toBe(true);
    expect(identicalAfterReading("tika-testKeynote2018.key")).toBe(false);
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
    doc.slides()[0]!.setTransition({ effect: "apple:ca-push", duration: 1.5, direction: 14 });
    const reloaded = KeynoteDocument.load(doc.save());
    expect(reloaded.slideCount()).toBe(slideCount);
    const transition = reloaded.slides()[0]!.transition()!;
    expect(transition.effect).toBe("apple:ca-push");
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
      // Same layout, no inherited content. The paint order is allowed to
      // list the copy's own placeholders — on decks that paint from it,
      // unlisting them showed an entirely empty slide in Keynote — but
      // nothing else may survive.
      expect(added.masterId).toBe(source.masterId);
      const phIds = new Set(
        [5, 6, 30, 20]
          .map((f) => added.object.message.getMessage(f)?.getVarint(1))
          .filter((id) => id !== undefined),
      );
      const strangers = added.drawables().filter((d) => !phIds.has(d.object.identifier));
      expect(strangers.length).toBe(0);
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

  it("gives a copied slide a component of its own in a per-slide deck", () => {
    // A Keynote-saved deck keeps each slide in a `Slide-<id>` component,
    // and a copy squatting in its donor's component makes the deck
    // unsaveable in Keynote (opens, renders, autosave fails). The copy
    // must arrive in a fresh component whose info mirrors the donor's.
    const doc = KeynoteDocument.load(fixture("olekristensen-v26.3-mac-builds-effects.key"));
    const source = doc.slides()[1]!;
    const donorLocator = `Slide-${source.id}`;
    expect(doc.store.components.some((c) => c.locator === donorLocator)).toBe(true);

    const copy = doc.duplicateSlide(1);
    const reloaded = KeynoteDocument.load(doc.save());
    const locator = `Slide-${copy.id}`;
    const component = reloaded.store.components.find((c) => c.locator === locator);
    expect(component !== undefined).toBe(true);
    // The whole clone set lives there — same census as the app's own
    // slide components — and none of it stayed behind in the donor's.
    expect(component!.byId.has(copy.id)).toBe(true);
    expect(component!.objects.length).toBe(20);
    const donor = reloaded.store.components.find((c) => c.locator === donorLocator)!;
    expect(donor.byId.has(copy.id)).toBe(false);

    const pkg = reloaded.store.object(2n)!;
    const infos = pkg.message.getMessages(3);
    const info = infos.find((ci) => ci.getString(3) === locator)!;
    const donorInfo = infos.find((ci) => ci.getString(3) === donorLocator)!;
    expect(info.getVarint(1)).toBe(copy.id);
    expect(info.getString(2)).toBe("Slide");
    // Versions, save token and the external references mirror the donor
    // — the copy shares its master and styles. The master is the root
    // object of its own component, and a reference to a component's root
    // is recorded as the component-level row the donor already carries
    // (every such reference in the corpus is), so the save pass adds
    // nothing.
    expect(info.getVarint(12)).toBe(donorInfo.getVarint(12));
    const row = (er: RawMessage) => `${er.getVarint(1)}:${er.getVarint(2) ?? "-"}`;
    const donorRows = new Set(donorInfo.getMessages(6).map(row));
    const extras = info.getMessages(6).map(row).filter((r) => !donorRows.has(r));
    expect(extras).toEqual([]);
    expect(info.getMessages(6).length).toBe(donorInfo.getMessages(6).length);
    const documentInfo = infos.find((ci) => ci.getString(2) === "Document" && !ci.has(3))!;
    const reciprocal = documentInfo
      .getMessages(6)
      .some((er) => er.getVarint(1) === copy.id && er.getVarint(2) === undefined);
    expect(reciprocal).toBe(true);
    expect(reloaded.audit()).toEqual([]);
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

  it("declares an added slide's node from the show", () => {
    // The slide list is INLINE on KN.ShowArchive, so inserting a node
    // dirties the show — and until the show had an extractor, its stale
    // object_references left the new node referenced by the payload and
    // declared by nothing. An undeclared reference into another component
    // is how an app decides a document is damaged; the Keynote ladder's
    // first offline audit caught exactly this.
    const doc = KeynoteDocument.load(fixture("zenodo-v26.1-hyperlinks-masks.key"));
    const added = doc.addSlide({ copyOf: 0 });
    const reloaded = KeynoteDocument.load(doc.save());
    const show = [...reloaded.store.allObjects()].find(({ obj }) => obj.type === 2)!.obj;
    expect(show.getObjectReferences().includes(added.node.identifier)).toBe(true);
  });

  it("orphans nothing when adding a slide, with or without content", () => {
    // addSlide once cloned the source's note and drawables and then
    // unlinked them: perfectly well-formed orphans no corpus document
    // holds. Content the copy will not keep must never be cloned at all.
    for (const withContent of [false, true]) {
      const doc = KeynoteDocument.load(fixture("zenodo-v26.1-hyperlinks-masks.key"));
      const before = new Set([...doc.store.allObjects()].map(({ obj }) => obj.identifier));
      doc.addSlide({ copyOf: 0, withContent });
      const reloaded = KeynoteDocument.load(doc.save());
      const referenced = new Set<bigint>();
      for (const { obj } of reloaded.store.allObjects()) {
        for (const id of obj.getObjectReferences()) referenced.add(id);
      }
      const orphans = [...reloaded.store.allObjects()]
        .filter(({ obj }) => !before.has(obj.identifier) && !referenced.has(obj.identifier))
        .map(({ obj }) => `${obj.type}:${obj.identifier}`);
      expect(`new orphans (withContent=${withContent}): ${orphans.join(" ")}`).toBe(
        `new orphans (withContent=${withContent}): `,
      );
    }
  });

  it("keeps a fresh slide's note storage, emptied", () => {
    // Every corpus slide carries a note archive, empty notes included
    // (49 of 49; empty ones with hasNote false) — stripping it left
    // `notes =` on the new slide with nothing to write into.
    const doc = KeynoteDocument.load(fixture("olekristensen-v26.3-mac-builds-effects.key"));
    const added = doc.addSlide({ copyOf: 0, withContent: false });
    expect(added.notesStorage() !== undefined).toBe(true);
    expect(added.notes).toBe("");
    expect(added.node.message.getBool(8)).toBe(false);
    added.notes = "written into the fresh slide";
    const reloaded = KeynoteDocument.load(doc.save());
    expect(reloaded.slides()[added.index]!.notes).toBe("written into the fresh slide");
  });

  it("answers style() for a text box, whose reference sits on the embedded super", () => {
    // A TSWP.ShapeInfoArchive keeps its style on the ShapeArchive super
    // at field 1, one level below the top-level scan — style() answered
    // undefined for every text box until the scan descended.
    const doc = KeynoteDocument.load(fixture("olekristensen-v26.3-mac-builds-effects.key"));
    const shapeInfos = doc
      .slides()
      .flatMap((s) => s.drawables())
      .filter((d) => doc.store.typeNameOf(d.object) === "TSWP.ShapeInfoArchive");
    expect(shapeInfos.length).toBeGreaterThan(0);
    for (const drawable of shapeInfos) {
      const style = drawable.style();
      expect(style !== undefined).toBe(true);
      expect(typeof style!.read()).toBe("object");
    }
  });

  it("puts a picture on a slide in the measured shape", () => {
    // Unanimous across the corpus's 22 slide images: parent is the
    // slide, wrap {type 4, direction 2, fit 1, margin 12, alpha 0.5,
    // html false}, aspect locked, stand-ins with hidden flags stated,
    // the theme's image-0-imageStyle, the slide's own component.
    const PNG = new Uint8Array([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0x0d, 0x49, 0x48, 0x44, 0x52,
      0, 0, 0, 0x64, 0, 0, 0, 0x32, 8, 6, 0, 0, 0,
    ]);
    const doc = KeynoteDocument.blank();
    const { imageId } = doc.addImage(0, PNG, { fileName: "figure.png" });

    const reloaded = KeynoteDocument.load(doc.save());
    const slide = reloaded.slides()[0]!;
    const image = slide
      .drawables()
      .find((d) => reloaded.store.typeNameOf(d.object) === "TSD.ImageArchive")!;
    expect(image.object.identifier).toBe(imageId);

    // Centered on the 16:9 canvas at the intrinsic 100×50.
    const geometry = image.geometry()!;
    expect(geometry.width).toBe(100);
    expect(geometry.height).toBe(50);
    expect(geometry.x).toBe((reloaded.slideSize()!.width - 100) / 2);

    const drawable = image.object.message.getMessage(Image.SUPER)!;
    const wrap = drawable.getMessage(Drawable.EXTERIOR_TEXT_WRAP)!;
    expect(wrap.getUint(ExteriorTextWrap.TYPE)).toBe(4);
    expect(wrap.getFloat(ExteriorTextWrap.MARGIN)).toBe(12);
    expect(wrap.getFloat(ExteriorTextWrap.ALPHA_THRESHOLD)).toBe(0.5);
    const parent = drawable.getMessage(Drawable.PARENT)?.getVarint(1);
    expect(parent).toBe(slide.id);
    expect(drawable.getBool(Drawable.ASPECT_RATIO_LOCKED)).toBe(true);

    const style = image.style();
    expect(reloaded.store.typeNameOf(style!.object)).toBe("TSD.MediaStyleArchive");
    expect(
      reloaded.store.componentOf(imageId)?.locator,
    ).toBe(reloaded.store.componentOf(slide.id)?.locator);
    expect(reloaded.audit()).toEqual([]);
  });

  it("rewrites a text box's rectangular path beside its frame", () => {
    // A shape's path renders scaled from the path source's naturalSize
    // to the frame, text included — resizing the frame alone shrinks or
    // clips the text against the donor's path. The explicit pairing:
    // setGeometry for the frame, setPathRectangle for the text's space.
    const doc = KeynoteDocument.blank();
    const box = doc
      .slides()[0]!
      .drawables()
      .find((d) => doc.store.typeNameOf(d.object) === "TSWP.ShapeInfoArchive")!;
    box.setGeometry({ width: 600, height: 80 });
    box.setPathRectangle(600, 80);

    const reloaded = KeynoteDocument.load(doc.save());
    const again = reloaded
      .slides()[0]!
      .drawables()
      .find((d) => d.object.identifier === box.object.identifier)!;
    expect(again.geometry()!.width).toBe(600);
    const bezier = again.object.message.getMessage(1)!.getMessage(3)!.getMessage(5)!;
    expect(bezier.getMessage(2)!.getFloat(1)).toBe(600);
    expect(bezier.getMessage(2)!.getFloat(2)).toBe(80);
    expect(reloaded.audit()).toEqual([]);

    // A path that is not a plain rectangle is refused, not flattened.
    // No corpus deck carries a non-rectangle text-shape path, so the
    // case is built: the same box with its path rewritten to a line.
    const lineDoc = KeynoteDocument.blank();
    const lineBox = lineDoc
      .slides()[0]!
      .drawables()
      .find((d) => lineDoc.store.typeNameOf(d.object) === "TSWP.ShapeInfoArchive")!;
    const lineBezier = lineBox.object.message.getMessage(1)!.getMessage(3)!.getMessage(5)!;
    const linePath = RawMessage.create();
    for (const [x, y] of [
      [0, 0],
      [100, 100],
    ]) {
      const el = RawMessage.create();
      el.setVarint(1, x === 0 ? 1 : 2); // moveTo, lineTo
      const point = RawMessage.create();
      point.setFloat(1, x!);
      point.setFloat(2, y!);
      el.setMessage(2, point);
      linePath.addMessage(1, el);
    }
    lineBezier.setMessage(3, linePath);
    let threw = false;
    try {
      lineBox.setPathRectangle(100, 100);
    } catch {
      threw = true;
    }
    expect(threw).toBe(true);
  });

  it("keeps a cloned placeholder from declaring the slide that holds it", () => {
    // The container rule at Keynote-local type ids: 546/546 corpus
    // placeholders carry their slide as the drawable parent three supers
    // down, and none declare it. A cloned placeholder reaches the generic
    // scan as a created object, so without the subtraction the copy
    // declared its slide — a referrer set no corpus instance has.
    const doc = KeynoteDocument.load(fixture("zenodo-v26.1-hyperlinks-masks.key"));
    const added = doc.addSlide({ copyOf: 0, withContent: true });
    const reloaded = KeynoteDocument.load(doc.save());
    const offenders: string[] = [];
    for (const { obj } of reloaded.store.allObjects()) {
      if (obj.type !== 7 && obj.type !== 12) continue;
      if (obj.getObjectReferences().includes(added.id)) offenders.push(String(obj.identifier));
    }
    expect(`placeholders declaring the added slide: ${offenders.join(" ")}`).toBe(
      "placeholders declaring the added slide: ",
    );
  });

  it("keeps a cloned placeholder in the paint order its source used", () => {
    // In this deck the source slide lists its placeholders in
    // owned_drawables and drawables_z_order. The add-without-content path
    // once removed both lists wholesale, and Keynote — which paints from
    // them here — showed the added slide entirely empty, written title and
    // all. The copy must keep the kept placeholders' clones listed, and
    // nothing else.
    const doc = KeynoteDocument.load(fixture("zenodo-v26.1-hyperlinks-masks.key"));
    const source = doc.slides()[0]!;
    const sourceListed = new Set(
      source.object.message.getMessages(7).map((r) => r.getVarint(1)),
    );
    expect(sourceListed.size).toBeGreaterThan(0);

    const added = doc.addSlide({ copyOf: 0 });
    const reloaded = KeynoteDocument.load(doc.save());
    const slide = reloaded.slides().find((s) => s.id === added.id)!;
    const phIds = new Set(
      [5, 6, 30, 20]
        .map((f) => slide.object.message.getMessage(f)?.getVarint(1))
        .filter((id) => id !== undefined),
    );
    for (const field of [7, 42]) {
      const listed = slide.object.message.getMessages(field).map((r) => r.getVarint(1));
      expect(`field ${field} listed: ${listed.length > 0}`).toBe(`field ${field} listed: true`);
      const strangers = listed.filter((id) => id === undefined || !phIds.has(id));
      expect(`field ${field} non-placeholder entries: ${strangers.length}`).toBe(
        `field ${field} non-placeholder entries: 0`,
      );
    }
  });

  it("fills an empty placeholder without inventing an end-of-text entry", () => {
    // The base's empty subtitle storage carries one paragraph entry at 0,
    // and `0 === 0` once misread it as a trailing terminator — so filling
    // the placeholder produced `@0→Subtitle @54 @111(end)` and Keynote
    // dropped the subtitle styling for the whole box. The entries must be
    // exactly the paragraph starts, styled from the first entry onward.
    const doc = KeynoteDocument.load(fixture("zenodo-v26.1-hyperlinks-masks.key"));
    const storage = doc.slides()[0]!.placeholder("body")!;
    const styleBefore = storage.paragraphs()[0]!.styleId;
    storage.setText("one\ntwo");
    const table = storage.object.message.getMessage(5)!;
    const entries = table.getMessages(1).map((e) => Number(e.getVarint(1) ?? 0n));
    expect(entries.join(",")).toBe("0,4");
    for (const p of storage.paragraphs()) {
      expect(p.styleId).toBe(styleBefore);
    }
  });

  it("round-trips a skipped slide and keeps the node's hasNote hint", () => {
    const doc = KeynoteDocument.load(fixture("zenodo-v26.1-hyperlinks-masks.key"));
    doc.slides()[1]!.isSkipped = true;
    const reloaded = KeynoteDocument.load(doc.save());
    expect(reloaded.slides()[1]!.isSkipped).toBe(true);
    expect(reloaded.presentedSlides().length).toBe(reloaded.slideCount() - 1);

    // The denormalized hint every corpus node carries must survive an
    // add-without-content as an explicit false, not a removed field.
    const bare = KeynoteDocument.load(fixture("zenodo-v26.1-hyperlinks-masks.key"));
    const added = bare.addSlide({ copyOf: 0 });
    expect(added.node.message.getBool(8)).toBe(false);
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
    expect(() => { slide.setPlaceholderText(30, "object", "x"); }).toThrow();
  });
});

describe("builds", () => {
  it("reads effect, timing and delivery from an app-authored deck", () => {
    const doc = KeynoteDocument.load(fixture("olekristensen-v26.3-mac-builds-effects.key"));
    const builds = doc.slides().flatMap((slide) => slide.builds().map((b) => b.read()));
    expect(builds.length).toBe(3);
    // Both effect-identifier schemes.
    expect(builds.map((b) => b.effect)).toEqual([
      "apple:dissolve character",
      "apple:move in character",
      "com.apple.iWork.Keynote.BUKAnvil",
    ]);
    expect(builds.every((b) => b.animationType === "In")).toBe(true);
    expect(builds.map((b) => b.duration)).toEqual([1, 1, 1.75]);
    expect(builds.map((b) => b.delay)).toEqual([0, 0, 0]);
    expect(builds.map((b) => b.delivery)).toEqual([
      "All at Once",
      "All at Once",
      "By Paragraph",
    ]);
    // Staged delivery carries per-stage chunks with their own timing.
    const staged = builds[2]!;
    expect(staged.chunks.length).toBe(2);
    expect(
      staged.chunks.every((c) => c.delay === 1 && c.duration === 1.75 && c.automatic === true),
    ).toBe(true);
  });

  it("retimes a modern build inside its animation attributes", () => {
    const doc = KeynoteDocument.load(fixture("olekristensen-v26.3-mac-builds-effects.key"));
    doc.slides()[0]!.builds()[0]!.set({ duration: 2.5, delay: 0.5 });
    const reloaded = KeynoteDocument.load(doc.save());
    const info = reloaded.slides()[0]!.builds()[0]!.read();
    expect(info.duration).toBe(2.5);
    expect(info.delay).toBe(0.5);
    expect(info.effect).toBe("apple:dissolve character");
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

describe("creating a build", () => {
  it("animates a picture in the shape the app's own builds have", () => {
    const PNG = new Uint8Array([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0x0d, 0x49, 0x48, 0x44, 0x52,
      0, 0, 0, 0x64, 0, 0, 0, 0x32, 8, 6, 0, 0, 0,
    ]);
    const doc = KeynoteDocument.blank();
    const { imageId } = doc.addImage(0, PNG, { fileName: "figure.png" });
    const created = doc.slides()[0]!.addBuild({ drawableId: imageId, effect: "apple:dissolve", duration: 1.5 });
    expect(created.read().effect).toBe("apple:dissolve");

    const reloaded = KeynoteDocument.load(doc.save());
    const slide = reloaded.slides()[0]!;
    const builds = slide.builds();
    expect(builds.length).toBe(1);
    const info = builds[0]!.read();
    expect(info.effect).toBe("apple:dissolve");
    expect(info.duration).toBe(1.5);
    expect(info.delay).toBe(0);
    expect(info.delivery).toBe("All at Once");
    expect(info.chunks.map((c) => [c.delay, c.duration, c.automatic])).toEqual([[0, 1.5, false]]);

    // Field for field, the corpus deck's all-at-once build and its chunk.
    const m = builds[0]!.object.message;
    expect([1, 2, 3, 4, 5].filter((f) => m.has(f))).toEqual([1, 2, 3, 4, 5]);
    const attributes = m.getMessage(4)!;
    expect([...Array(40).keys()].filter((f) => f > 0 && attributes.has(f))).toEqual([4, 17, 18, 20, 21]);
    const animation = attributes.getMessage(18)!;
    expect([...Array(30).keys()].filter((f) => f > 0 && animation.has(f))).toEqual([1, 2, 3, 5, 11, 16]);
    const chunkId = slide.object.message.getMessages(Slide.BUILD_CHUNKS)[0]!.getVarint(1);
    const chunk = reloaded.store.resolve(chunkId)!.message;
    expect([1, 2, 3, 4, 5, 6, 7, 8].filter((f) => chunk.has(f))).toEqual([1, 3, 4, 5, 6, 7, 8]);
    expect(chunk.getMessage(1)!.getVarint(1)).toBe(builds[0]!.id);
    expect(slide.object.getObjectReferences().includes(builds[0]!.id)).toBe(true);
  });
});

describe("a build delivered by paragraph", () => {
  it("has one chunk per paragraph of its target and omits the text-delivery pair", () => {
    const doc = KeynoteDocument.blank();
    const slide = doc.slides()[0]!;
    slide.body = "First point\nSecond point";
    const body = refId(slide.object.message, Slide.BODY_PLACEHOLDER)!;
    slide.addBuild({ drawableId: body, effect: "com.apple.iWork.Keynote.BUKAnvil", duration: 1.75, delivery: "byParagraph" });

    const reloaded = KeynoteDocument.load(doc.save());
    const build = reloaded.slides()[0]!.builds()[0]!;
    const info = build.read();
    expect(info.delivery).toBe("By Paragraph");
    expect(info.chunks.map((c) => [c.delay, c.duration, c.automatic])).toEqual([[0, 1.75, false], [0, 1.75, false]]);
    expect(build.object.message.getUint(5)).toBe(2);
    // The corpus's by-paragraph build states event trigger, chart rotation
    // and animation attributes, and nothing else.
    const attributes = build.object.message.getMessage(4)!;
    expect([...Array(40).keys()].filter((f) => f > 0 && attributes.has(f))).toEqual([4, 17, 18]);
    const chunkRefs = reloaded.slides()[0]!.object.message.getMessages(Slide.BUILD_CHUNKS);
    const ids = chunkRefs.map((r) => reloaded.store.resolve(r.getVarint(1))!.message.getMessage(7)!.getUint(2));
    expect(ids).toEqual([1, 2]);
  });
});

describe("a text box added to a slide", () => {
  it("is a deep copy of the deck's own box, owned by the slide, saying the text", () => {
    const doc = KeynoteDocument.blank();
    const slide = doc.slides()[0]!;
    const before = slide.container().ids().length;
    const donorStorages = new Set(slide.textStorages().map((s) => s.id));
    const box = slide.addTextBox("Written by the library", { x: 300, y: 500, width: 900, height: 120 });
    const reloaded = KeynoteDocument.load(doc.save());
    const again = reloaded.slides()[0]!;
    expect(again.container().ids().length).toBe(before + 1);
    expect(again.container().ids().includes(box.id)).toBe(true);
    const placed = again.drawables().find((d) => d.id === box.id)!;
    expect(placed.object.type).toBe(2011);
    const geometry = placed.geometry()!;
    expect([geometry.x, geometry.y, geometry.width, geometry.height]).toEqual([300, 500, 900, 120]);
    const text = again.textStorages().find((s) => s.text === "Written by the library");
    expect(text !== undefined).toBe(true);
    // Its storage is its own, and its parent is the slide.
    const storageId = refId(placed.object.message, 4)!;
    expect(reloaded.store.object(storageId)?.type).toBe(2001);
    expect(refId(placed.object.message.getMessage(1)!.getMessage(1), 2)).toBe(again.id);
    // The parent is never among a drawable's declared references.
    expect(placed.object.getObjectReferences().includes(again.id)).toBe(false);
    expect(donorStorages.has(storageId)).toBe(false);
  });
});

describe("a slide instantiated from a layout", () => {
  const CORPUS_SLIDE_FIELDS = [1, 4, 5, 6, 7, 17, 19, 20, 27, 28, 36];
  const fieldsOf = (m: RawMessage): number[] => {
    const out: number[] = [];
    for (let n = 1; n <= 40; n++) if (m.has(n)) out.push(n);
    return out;
  };

  it("carries what a content slide carries and nothing a master keeps for itself", () => {
    const doc = KeynoteDocument.blank();
    const layout = doc.masterSlides().find((m) => m.name === "Title & Bullets")!;
    const added = doc.addSlide({ master: "title & bullets", after: 0 });
    const reloaded = KeynoteDocument.load(doc.save());
    const slide = reloaded.slides()[1]!;
    expect(slide.id).toBe(added.id);
    expect(slide.masterId).toBe(layout.id);
    expect(slide.name).toBe(undefined);
    expect(fieldsOf(slide.object.message)).toEqual(CORPUS_SLIDE_FIELDS);
    for (const field of MASTER_ONLY_FIELDS) expect(slide.object.message.has(field)).toBe(false);
    expect(slide.placeholders().map((p) => [p.role, p.text])).toEqual([
      ["title", ""],
      ["body", ""],
      ["slideNumber", "\uFFFC"],
    ]);
    // Its placeholders are its own, not the layout's.
    const master = reloaded.store.object(layout.id)!;
    for (const field of [Slide.TITLE_PLACEHOLDER, Slide.BODY_PLACEHOLDER, Slide.SLIDE_NUMBER_PLACEHOLDER]) {
      expect(refId(slide.object.message, field)).not.toBe(refId(master.message, field));
    }
    expect(slide.notes).toBe("");
    expect(reloaded.store.componentOf(slide.id)?.locator).toBe(`Slide-${slide.id}`);
    slide.title = "Set after";
    expect(slide.title).toBe("Set after");
  });

  it("writes the slide-number attachment the corpus decks carry, byte for byte", () => {
    const deck = KeynoteDocument.load(fixture("zenodo-v26.1-hyperlinks-masks.key"));
    const corpus = deck.slides()[0]!.placeholders().find((p) => p.role === "slideNumber")!;
    const corpusAttachment = corpus.storage!.attachments()[0]!;
    const doc = KeynoteDocument.blank();
    const added = doc.addSlide({ master: "Title & Bullets" });
    const ours = added.placeholders().find((p) => p.role === "slideNumber")!.storage!.attachments()[0]!;
    expect(ours.kind).toBe(corpusAttachment.kind);
    expect(doc.store.object(ours.objectId)!.message.toBytes()).toEqual(
      deck.store.object(corpusAttachment.objectId)!.message.toBytes(),
    );
  });

  it("names the deck's layouts when asked for one it lacks", () => {
    const doc = KeynoteDocument.blank();
    expect(() => doc.addSlide({ master: "No such layout" })).toThrow(/Title & Bullets/);
  });
});

describe("a slide background of its own", () => {
  it("is a variation style under the master's, read back and replaced in place", () => {
    const doc = KeynoteDocument.blank();
    const slide = doc.slides()[0]!;
    const masterStyle = refId(doc.store.object(slide.masterId!)!.message, Slide.STYLE)!;
    expect(refId(slide.object.message, Slide.STYLE)).toBe(masterStyle);
    const green = { r: 0.125, g: 0.25, b: 0.1875, space: "srgb" as const };
    slide.setBackground({ kind: "color", color: green });
    const reloaded = KeynoteDocument.load(doc.save());
    const again = reloaded.slides()[0]!;
    const styleId = refId(again.object.message, Slide.STYLE)!;
    expect(styleId).not.toBe(masterStyle);
    const style = reloaded.store.object(styleId)!;
    expect(style.type).toBe(9);
    const head = style.message.getMessage(1)!;
    expect([head.has(1), head.has(2), refId(head, 3), head.getBool(4), refId(head, 5)]).toEqual([
      false,
      false,
      masterStyle,
      true,
      refId(reloaded.store.object(masterStyle)!.message.getMessage(1), 5),
    ]);
    expect(style.message.getUint(10)).toBe(1);
    expect(again.background()).toEqual({ kind: "color", color: green });
    // The master's style is untouched, and the slide alone refers to the new one.
    expect(reloaded.store.object(masterStyle)!.message.toBytes()).toEqual(doc.store.object(masterStyle)!.message.toBytes());
    expect(reloaded.store.referrers(styleId)).toEqual([again.id]);
    expect(reloaded.store.componentOf(styleId)).toBe(reloaded.store.componentOf(masterStyle));
    // A second colour replaces the fill in the same variation.
    again.setBackground({ kind: "color", color: { r: 1, g: 0, b: 0, space: "srgb" } });
    expect(refId(again.object.message, Slide.STYLE)).toBe(styleId);
    const red = again.background();
    expect(red?.kind === "color" ? red.color.r : undefined).toBe(1);
  });

  it("reads the corpus deck's per-slide backgrounds through the same chain", () => {
    const deck = KeynoteDocument.load(fixture("zenodo-v26.1-pptx-lineage.key"));
    const own = deck.slides().filter((s) => refId(s.object.message, Slide.STYLE) !== refId(deck.store.object(s.masterId!)!.message, Slide.STYLE));
    expect(own.length).toBe(11);
    const fill = own[0]!.background();
    expect(fill?.kind).toBe("color");
    expect(fill?.kind === "color" && fill.color.r < 0.2).toBe(true);
    // A slide sharing its master's style reads the master's fill.
    const shared = KeynoteDocument.load(fixture("zenodo-v26.1-hyperlinks-masks.key")).slides()[0]!;
    expect(refId(shared.object.message, Slide.STYLE)).toBe(refId(shared.document.store.object(shared.masterId!)!.message, Slide.STYLE));
    expect(shared.background()?.kind).toBe("image");
  });
});

describe("a table added to a slide", () => {
  it("is the neutral donor grafted under the slide, listed, filled and named", () => {
    const doc = KeynoteDocument.blank();
    const slide = doc.slides()[0]!;
    const before = slide.container().ids().length;
    const table = slide.addTable({ rows: [["Item", "Count"], ["Apples", "3"]], x: 300, y: 500 });
    expect(table.name).toBe("Table");
    const reloaded = KeynoteDocument.load(doc.save());
    const again = reloaded.slides()[0]!;
    expect(again.container().ids().length).toBe(before + 1);
    const info = again.drawables().find((d) => d.object.type === 6000)!;
    expect(refId(info.object.message.getMessage(1), 2)).toBe(again.id);
    expect(again.object.message.getMessages(Slide.OWNED_DRAWABLES).some((m) => m.getVarint(1) === info.id)).toBe(true);
    const placed = reloaded.tables().find((t) => t.infoObject?.identifier === info.id)!;
    expect([placed.rowCount, placed.columnCount, placed.cellText(0, 0), placed.cellValue(1, 1)?.type]).toEqual([2, 2, "Item", "number"]);
    expect(info.geometry()?.x).toBe(300);
    expect(again.addTable({}).name).toBe("Table 2");
  });
});
