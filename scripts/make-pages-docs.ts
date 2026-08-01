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
 * The base is `gomap-v26.1-newest-writer.pages`: effectively empty, and
 * written by the newest Pages in the corpus, so a rung's change is the only
 * thing on the page and nothing has to be untangled from existing content.
 *
 * Usage: `npm run pages:docs -- ~/Desktop/pages-rungs`
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { PagesDocument } from "../src/index.ts";

const TEMPLATE = new URL("../fixtures/gomap-v26.1-newest-writer.pages", import.meta.url);

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
  const bytes = new Uint8Array(readFileSync(TEMPLATE));

  let failed = 0;
  for (const rung of RUNGS) {
    const path = `${outDir}/${rung.name}.pages`;
    try {
      const doc = PagesDocument.load(bytes);
      rung.build(doc);
      writeFileSync(path, doc.save());
      console.log(`${rung.name.padEnd(24)} ${rung.note}`);
    } catch (error) {
      failed++;
      console.log(`${rung.name.padEnd(24)} COULD NOT BUILD: ${(error as Error).message}`);
    }
  }

  console.log("");
  console.log("Open these in order and stop at the first one Pages refuses.");
  console.log("P00-untouched failing means the container layer, not any feature.");
  console.log("Everything from P01 up changes exactly one thing more than the rung below.");
  if (failed) console.log(`\n${failed} rung(s) could not be built — see above.`);
  return 0;
}

process.exit(main(process.argv.slice(2)));
