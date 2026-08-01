/**
 * A ladder of Pages documents, one feature per file.
 *
 * The Numbers ladder found three bugs that nothing offline could see, and
 * the reason it worked is that each rung changes exactly one thing more
 * than the rung below: whatever breaks names itself, without a second round
 * trip to narrow it down.
 *
 * Pages has had no such ladder, and that is the largest single gap in what
 * this library can claim. Every rung of the Numbers ladder is a `.numbers`
 * file; **no document this library authored has ever been opened in Pages**,
 * despite Pages being the app with the most fixtures here and the most
 * write-capable surface. Thirteen unverified claims touch it, three of them
 * high risk.
 *
 * ## Choosing the base
 *
 * The base is `iwork-mcp-v14.5-sample.pages`: a page of plain notes with no
 * floating drawables, no tables and no text boxes, so a rung's change is
 * the only thing to look at.
 *
 * It replaced `iwork-mcp-v14.5-sample.pages`, which was picked for being
 * the newest writer in the corpus and "effectively empty" — one paragraph,
 * zero body characters. That reading came from counting paragraphs and text
 * length, which is not what a reader sees. The document holds **51 floating
 * drawables**: a full-page diagram with the body text wrapping between its
 * boxes. Every rung was legible only to a parser.
 *
 * Hence {@link assertPlainBase}. A ladder whose whole value is "look at the
 * page and see one difference" should refuse a base that buries the
 * difference, and the check is cheap enough to run every time.
 *
 * The trade is a v14.5 writer rather than v26.1. No document in the corpus
 * is both current-era and visually plain, and legibility matters more here:
 * the container layer is already covered by P00 either way, and Pages
 * upgrades an older document on open.
 *
 * Usage: `npm run pages:docs -- ~/Desktop/pages-rungs`
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { PagesDocument } from "../src/index.ts";

/**
 * Two bases, deliberately.
 *
 * A rung proves something about the *era* of document it was built on. The
 * ladder ran for six rounds on a Pages 14.4 file before anyone asked whether
 * that was current — it was not, and Pages upgrades such a document on open,
 * which is a different path from loading a native one. So every rung is now
 * emitted twice.
 *
 * `file_format_version` is the app that wrote the document;
 * `read_version`/`write_version` are the minimum reader and writer it needs,
 * which stay low when a document uses no newer feature. The 26.1.0 base below
 * is genuinely current and happens to also be plain.
 */
const BASES: { tag: string; url: URL; note: string }[] = [
  {
    tag: "v26",
    url: new URL("../fixtures/patrickomatic-termpaper-footers-masks.pages", import.meta.url),
    note: "file format 26.1.0 — written by a current Pages",
  },
  {
    tag: "v14",
    url: new URL("../fixtures/iwork-mcp-v14.5-sample.pages", import.meta.url),
    note: "file format 14.4.1 — an older document Pages upgrades on open",
  },
];

/**
 * Refuse a base whose page is too busy to read a one-line change against.
 *
 * Not a correctness check — a legibility one. The first base looked empty
 * by every number this script had to hand and turned out to be a full-page
 * diagram.
 */
function assertPlainBase(bytes: Uint8Array): void {
  const doc = PagesDocument.load(bytes);
  let floating = 0;
  for (const page of doc.floatingDrawablePages()) {
    floating += doc.floatingDrawables(page)?.drawables().length ?? 0;
  }
  const boxes = doc.textBoxes().length;
  if (floating > 0 || boxes > 0) {
    throw new Error(
      `template is not visually plain: ${floating} floating drawable(s), ${boxes} text box(es). ` +
        "Pick a base whose page is mostly body text, or a rung's change will be lost in it.",
    );
  }
}

/** A 1×1 red PNG, for the rung that inserts an image. */
const RED_DOT = Uint8Array.from(
  atob(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  ),
  (c) => c.charCodeAt(0),
);

const RUNGS: { name: string; note: string; build: (doc: PagesDocument) => void }[] = [
  {
    name: "P00-untouched",
    note: "loaded and saved with no edit at all — isolates the container layer",
    build: () => {},
  },
  {
    name: "P01-one-paragraph",
    note: "a single appended paragraph",
    build: (doc) => {
      doc.appendParagraph("P01: this paragraph was appended by iwork-files.");
    },
  },
  {
    name: "P02-character-formatting",
    note: "one word bold and red inside an otherwise plain paragraph",
    build: (doc) => {
      const text = "P02: the word RED should be bold and red.";
      doc.appendParagraph(text);
      const body = doc.body;
      const at = body.text.lastIndexOf("RED");
      doc.applyCharacterFormatting(at, at + 3, {
        bold: true,
        fontColor: { r: 1, g: 0, b: 0, space: "srgb" },
      });
    },
  },
  {
    name: "P03-paragraph-style",
    note: "a paragraph given a named style that already exists in the document",
    build: (doc) => {
      const index = doc.appendParagraph("P03: this line should be styled as a heading.");
      const heading = doc
        .paragraphStyles()
        .find((s) => /heading|title/i.test(s.name ?? ""));
      if (!heading) throw new Error("template has no heading-like paragraph style");
      doc.setParagraphStyle(index, heading.name ?? heading.id);
    },
  },
  {
    name: "P04-hyperlink",
    note: "a live hyperlink on part of a paragraph",
    build: (doc) => {
      doc.appendParagraph("P04: the words APPLE SITE should be a link to apple.com.");
      const at = doc.body.text.lastIndexOf("APPLE SITE");
      doc.insertLink(at, at + "APPLE SITE".length, "https://www.apple.com/");
    },
  },
  {
    name: "P05-header-footer",
    note: "header and footer text in the centre column",
    build: (doc) => {
      doc.appendParagraph("P05: check the header and footer of this page.");
      // Headers live on the section, not the document — each section owns
      // its own first/even/odd page masters.
      const section = doc.sections()[0];
      if (!section) throw new Error("template has no sections");
      section.setHeaderText("P05 HEADER", 1);
      section.setFooterText("P05 FOOTER", 1);
    },
  },
  {
    name: "P06-page-number",
    note: "a live page-number field appended to the body",
    build: (doc) => {
      doc.appendParagraph("P06: a live page number follows here: ");
      doc.body.insertPageNumber(doc.body.text.length);
    },
  },
  {
    name: "P07-section-break",
    note: "a second section, inserted after the first paragraph",
    build: (doc) => {
      doc.appendParagraph("P07: this is section one.");
      const second = doc.appendParagraph("P07: this should be section two, on a new page.");
      // Takes a paragraph index, not a character offset, and refuses index 0.
      doc.insertSectionBreak(second);
    },
  },
  {
    name: "P08-comment",
    note: "a comment anchored to a phrase",
    build: (doc) => {
      doc.appendParagraph("P08: the words COMMENT HERE should carry a comment.");
      const at = doc.body.text.lastIndexOf("COMMENT HERE");
      doc.body.addComment(at, at + "COMMENT HERE".length, "This comment was written by iwork-files.");
    },
  },
  {
    name: "P09-footnote",
    note: "a footnote anchored at the end of a sentence",
    build: (doc) => {
      doc.appendParagraph("P09: this sentence should carry a footnote.");
      doc.body.addFootnote(doc.body.text.length, "This footnote was written by iwork-files.");
    },
  },
  {
    name: "P10-page-setup",
    note: "landscape orientation with wide margins",
    build: (doc) => {
      doc.appendParagraph("P10: this page should be landscape with wide margins.");
      // 0 portrait, 1 landscape.
      doc.setPageSetup({ orientation: 1, leftMargin: 144, rightMargin: 144 });
    },
  },
  {
    name: "P11-inline-image",
    note: "a 1x1 red PNG inserted inline and scaled up — the experimental one",
    build: (doc) => {
      doc.appendParagraph("P11: a small red square should appear after this text: ");
      doc.insertInlineImage(doc.body.text.length, RED_DOT, {
        fileName: "red-dot.png",
        width: 72,
        height: 72,
      });
    },
  },
];

function main(argv: string[]): number {
  const outDir = (argv[0] ?? ".").replace(/\/$/, "");
  mkdirSync(outDir, { recursive: true });

  let failed = 0;
  for (const base of BASES) {
    const bytes = new Uint8Array(readFileSync(base.url));
    assertPlainBase(bytes);
    console.log(`\n=== ${base.tag}: ${base.note} ===`);
    for (const rung of RUNGS) {
      const path = `${outDir}/${base.tag}-${rung.name}.pages`;
      try {
        const doc = PagesDocument.load(bytes);
        rung.build(doc);
        writeFileSync(path, doc.save());
        console.log(`${(base.tag + "-" + rung.name).padEnd(28)} ${rung.note}`);
      } catch (error) {
        failed++;
        console.log(`${(base.tag + "-" + rung.name).padEnd(28)} COULD NOT BUILD: ${(error as Error).message}`);
      }
    }
  }

  console.log("");
  console.log("Open these in order and stop at the first one Pages refuses.");
  console.log("P00-untouched failing means the container layer, not any feature.");
  console.log("Everything from P01 up changes exactly one thing more than the rung below.");
  console.log("Check the v26 set first: it is the current format, v14 is the upgrade path.");
  if (failed) console.log(`\n${failed} rung(s) could not be built — see above.`);
  return 0;
}

process.exit(main(process.argv.slice(2)));
