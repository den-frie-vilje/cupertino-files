/**
 * A ladder of Keynote presentations, one feature per file.
 *
 * **No document this library authored has ever been opened in Keynote.**
 * The Pages ladder closed that gap for Pages and found twelve
 * well-formed-but-wrong defects on the way; this is the same instrument
 * pointed at the third app. Every rung changes exactly one thing more than
 * the rung below, so whatever breaks names itself.
 *
 * Each slide carries its own pass criterion in its visible text — a
 * checker reads the slide and compares it with what they see, without
 * needing this script, the original deck, or the conversation that asked.
 *
 * ## What is deliberately absent
 *
 * A named transition effect. The corpus is unanimous that "no transition"
 * is the explicit string "none", and contains **zero** examples of any
 * other value — the effect identifier is Keynote-internal vocabulary this
 * project has never measured (research/keynote-slides.md). Writing
 * "dissolve" because it sounds right is precisely the well-formed-but-
 * wrong class. The transition rung therefore exercises the fields the
 * corpus does verify — automatic advance with a delay — and named effects
 * stay on the ledger until an effect string is measured off a real
 * document (the e2e suite harvests one when run on a Mac).
 *
 * Usage: `npm run keynote:docs -- ~/Desktop/keynote-rungs`
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { KeynoteDocument } from "../src/index.ts";

/**
 * Two bases, same reasoning as the Pages ladder: a rung proves something
 * about the era of the deck it was built on. Keynote upgrades an old
 * document on open, which is a different code path from loading a native
 * current one, so every rung is emitted against both.
 */
export const BASES: { tag: string; url: URL; note: string }[] = [
  {
    tag: "v26",
    url: new URL("../fixtures/zenodo-v26.1-hyperlinks-masks.key", import.meta.url),
    note: "file format 26.1.0, 4 slides — written by a current Keynote",
  },
  {
    tag: "v14",
    url: new URL("../fixtures/iwork-mcp-v14.5-sample.key", import.meta.url),
    note: "file format 14.4.1, 3 slides — an older deck Keynote upgrades on open",
  },
];

/**
 * Refuse a base a rung's change would be lost in. The Pages ladder learned
 * this the expensive way: its first base looked empty to every metric and
 * turned out to be a full-page diagram. For a deck, legibility is a small
 * slide count and slides that are not crowded.
 */
function assertLegibleBase(bytes: Uint8Array): KeynoteDocument {
  const doc = KeynoteDocument.load(bytes);
  const slides = doc.slides();
  if (slides.length > 6) {
    throw new Error(`base has ${slides.length} slides; a change should be findable at a glance`);
  }
  for (const [i, slide] of slides.entries()) {
    const drawables = slide.drawables().length;
    if (drawables > 8) {
      throw new Error(`base slide ${i + 1} carries ${drawables} drawables; too busy to read against`);
    }
    if (slide.placeholder("title") === undefined) {
      throw new Error(`base slide ${i + 1} has no title placeholder; rungs write their answers there`);
    }
  }
  return doc;
}

export const RUNGS: {
  name: string;
  note: string;
  build: (doc: KeynoteDocument) => void;
}[] = [
  {
    name: "K00-untouched",
    note: "loaded and saved with no edit at all — isolates the container layer",
    build: () => {},
  },
  {
    name: "K01-title",
    note: "one slide title rewritten through the title placeholder",
    build: (doc) => {
      doc.slides()[0]!.title = "K01: this title was written by iwork-files.";
    },
  },
  {
    name: "K02-body",
    note: "one slide body rewritten through the body placeholder",
    build: (doc) => {
      const slide = doc.slides()[0]!;
      slide.title = "K02: the body below was written by iwork-files.";
      slide.body =
        "This body text replaced the slide's original content.\n" +
        "It should read as normal body text on the slide's layout.";
    },
  },
  {
    name: "K03-presenter-notes",
    note: "presenter notes rewritten (View ▸ Show Presenter Notes)",
    build: (doc) => {
      const slide = doc.slides()[0]!;
      slide.title = "K03: presenter notes for THIS slide should read: “KEYNOTE LADDER NOTE.”";
      slide.notes = "KEYNOTE LADDER NOTE.";
    },
  },
  {
    name: "K04-add-slide",
    note: "a new slide appended (fresh placeholders on the same layout)",
    build: (doc) => {
      const added = doc.addSlide({ copyOf: 0, after: doc.slideCount() - 1 });
      added.title = `K04: this LAST slide was added by iwork-files — the deck should have ${doc.slideCount()} slides.`;
    },
  },
  {
    name: "K05-duplicate-slide",
    note: "slide 1 duplicated, content and all",
    build: (doc) => {
      doc.slides()[0]!.title = "K05: this slide should appear TWICE in a row, identical.";
      doc.duplicateSlide(0);
    },
  },
  {
    name: "K06-remove-slide",
    note: "the last slide removed",
    build: (doc) => {
      doc.removeSlide(doc.slideCount() - 1);
      doc.slides()[0]!.title = `K06: the last slide was removed — the deck should have exactly ${doc.slideCount()} slides.`;
    },
  },
  {
    name: "K07-reorder",
    note: "the first slide moved to the end",
    build: (doc) => {
      doc.slides()[0]!.title = "K07: this slide should be LAST in the deck.";
      doc.moveSlide(0, doc.slideCount() - 1);
    },
  },
  {
    name: "K08-auto-advance",
    note: "slide 1 advances by itself after ~2 seconds when playing",
    build: (doc) => {
      const slide = doc.slides()[0]!;
      slide.title = "K08: when PLAYING, this slide should advance BY ITSELF after about 2 seconds.";
      slide.setTransition({ automatic: true, delay: 2 });
    },
  },
  {
    name: "K09-skip-slide",
    note: "slide 2 marked skipped — kept in the navigator, not presented",
    build: (doc) => {
      doc.slides()[0]!.title =
        "K09: the NEXT slide is marked skipped — it stays in the slide navigator (collapsed) and is NOT shown when playing.";
      doc.slides()[1]!.isSkipped = true;
    },
  },
  {
    name: "K10-slide-size",
    note: "deck resized from 16:9 to 4:3 (1024×768)",
    build: (doc) => {
      doc.slides()[0]!.title = "K10: this deck should be 4:3 (1024×768) — squarer than widescreen.";
      doc.setSlideSize(1024, 768);
    },
  },
];

function main(argv: string[]): number {
  const outDir = (argv[0] ?? ".").replace(/\/$/, "");
  mkdirSync(outDir, { recursive: true });

  let failed = 0;
  for (const base of BASES) {
    const bytes = new Uint8Array(readFileSync(base.url));
    assertLegibleBase(bytes);
    console.log(`\n=== ${base.tag}: ${base.note} ===`);
    for (const rung of RUNGS) {
      const path = `${outDir}/${base.tag}-${rung.name}.key`;
      try {
        const doc = KeynoteDocument.load(bytes);
        rung.build(doc);
        writeFileSync(path, doc.save());
        console.log(`${(base.tag + "-" + rung.name).padEnd(28)} ${rung.note}`);
      } catch (error) {
        failed++;
        console.log(
          `${(base.tag + "-" + rung.name).padEnd(28)} COULD NOT BUILD: ${(error as Error).message}`,
        );
      }
    }
  }

  console.log("");
  console.log("Open these in order and stop at the first one Keynote refuses.");
  console.log("K00-untouched failing means the container layer, not any feature.");
  console.log("Everything from K01 up changes exactly one thing more than the rung below.");
  console.log("Check the v26 set first: it is the current format, v14 is the upgrade path.");
  if (failed) console.log(`\n${failed} rung(s) could not be built — see above.`);
  return 0;
}

// Importable: the shape audit runs these same rungs and inspects what each
// one wrote, so a rung added here is audited without being listed twice.
if (import.meta.filename === process.argv[1]) process.exit(main(process.argv.slice(2)));
