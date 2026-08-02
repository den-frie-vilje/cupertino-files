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
export const BASES: { tag: string; url: URL; note: string }[] = [
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

/**
 * A rung may name its own base when the shared ones cannot express it.
 *
 * Both ladder bases are deliberately plain, which makes them useless for
 * testing drawable placement — there is nothing on the page to copy. Rather
 * than make the bases busier and every other rung harder to read, the one
 * rung that needs a drawable brings its own document.
 */
export const RUNGS: {
  name: string;
  note: string;
  base?: URL;
  build: (doc: PagesDocument) => void;
}[] = [
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
      doc.appendParagraph(
        "P04: the words APPLE SITE should be a link to apple.com, and should look like one — underlined, in the document's Link style.",
      );
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
      const section = doc.insertSectionBreak(second);
      // The name is the half a reader would otherwise have to know to look
      // for: it was being stripped, and a blank entry in the page-thumbnail
      // sidebar looks like a section that was simply never named.
      doc.appendParagraph(
        `In the page-thumbnail sidebar, this new section should be named "${section.name ?? ""}" — not blank.`,
      );
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
      doc.appendParagraph(
        "At the foot of the page the note should be small — the document's Footnote style — not body-sized.",
      );
      doc.appendParagraph(
        "The mark at the end of the first sentence should be a small raised number, not a full-size character.",
      );
      const starts = doc.body.paragraphStarts();
      const at = doc.body.text.indexOf("\n", starts[starts.length - 2]);
      doc.body.addFootnote(at, "This footnote was written by iwork-files.");
    },
  },
  {
    name: "P10-page-setup",
    note: "A4 landscape — the page dimensions carry the geometry, the flag is metadata",
    build: (doc) => {
      doc.appendParagraph(
        "P10: this page should be A4 landscape — noticeably wider than it is tall.",
      );
      doc.appendParagraph(
        "A portrait page, or a US Letter shape, means the page-size fields are not what Pages lays out from.",
      );
      // Measured: every corpus document stores its real geometry in the
      // width/height fields — the one wide document is 2880x2304 with
      // orientation 1 — so a landscape rung must swap the dimensions, not
      // just set the flag. The first version set only the flag and margins,
      // and nothing visibly changed. A4 values are corpus-exact doubles.
      doc.setPageSetup({
        pageWidth: 841.8900146484375,
        pageHeight: 595.280029296875,
        orientation: 1,
      });
    },
  },
  {
    name: "P12-bulleted-list",
    note: "three paragraphs turned into a bulleted list",
    build: (doc) => {
      const bullet = doc.listStyles().find((s) => /^bullet$/i.test(s.name ?? ""));
      if (!bullet) throw new Error("template has no Bullet list style");
      for (const line of ["P12: first bullet", "P12: second bullet", "P12: third bullet"]) {
        doc.setListStyle(doc.appendParagraph(line), bullet.name ?? bullet.id);
      }
    },
  },
  {
    name: "P13-replace-existing-text",
    note: "an edit to text that was already there, rather than an append",
    build: (doc) => {
      // Every other rung adds at the end. This one changes the document's
      // own words, which is the edit shape a real caller performs most.
      // Pick a word the base actually contains: the two bases share no
      // vocabulary, and a rung that silently replaces nothing proves nothing.
      const word = ["Geology", "Attendees", "the"].find((w) => doc.body.text.includes(w));
      if (!word) throw new Error("no anchor word found in this base");
      const n = doc.replaceText(word, `[${word.toUpperCase()}]`);
      if (n === 0) throw new Error("nothing replaced");
    },
  },
  {
    name: "P14-delete-a-range",
    note: "a word removed from the middle of a line that states its own expected result",
    build: (doc) => {
      // A deletion leaves no trace, so the rung has to carry its own answer:
      // the line above says what the line below should say. Checking it
      // needs nothing but the file. The first version said "the word
      // DELETEME should not appear anywhere", which is unverifiable without
      // the original — absence looks the same as never-having-been-there.
      doc.appendParagraph("P14: the line below should read exactly — alpha gamma");
      const target = doc.appendParagraph("alpha beta gamma");
      const starts = doc.body.paragraphStarts();
      const at = doc.body.text.indexOf(" beta", starts[target]);
      if (at < 0) throw new Error("target line not found");
      doc.deleteRange(at, at + " beta".length);
    },
  },
  // ---------------------------------------------------------------- P15
  //
  // Three rungs, because three attempts at one rung have failed.
  //
  // A created style applies correctly — the line is large and blue — and
  // does not appear in the paragraph styles panel. Pages knows its name,
  // and prefills it when you go to add the style by hand, so the style is
  // named, identified and mapped; it is only the *listing* that fails.
  //
  // Each fix so far was inferred from what listed styles have and ours did
  // not: an identifier and a map entry, then both property bags, then an
  // entry in `TSWP.ThemePresetsArchive.paragraph_style_presets`. All three
  // are now written and the panel is unchanged, which means one of the
  // inferences is about the wrong object. These rungs stop inferring:
  //
  //   P15a removes a style Pages certainly does list, and nothing else.
  //   P15b adds one that is a full copy of a listed style.
  //   P15c is what the library ships today, for contrast.
  //
  // a alone says whether the list is even the panel's source. b against c
  // says whether a sparse property bag is what disqualifies ours.
  {
    name: "P15a-unlist-a-listed-style",
    note: "removes one built-in style from the panel list — the control for whether that list is what the panel reads",
    build: (doc) => {
      const listed = doc.listedParagraphStyles();
      // Any of these is present in both bases; the first that is gets used,
      // and the document says which so the file carries its own answer.
      const victim = listed.find((s) => ["Footnote", "Caption", "Header & Footer"].includes(s.name ?? ""));
      if (!victim) throw new Error(`no removable style among: ${listed.map((s) => s.name).join(", ")}`);
      const rest = listed.filter((s) => s.id !== victim.id).map((s) => s.name);
      doc.appendParagraph(
        `P15a: open the paragraph styles panel. "${victim.name}" should NOT be in it.`,
      );
      doc.appendParagraph(`These ${rest.length} should still be, and nothing else: ${rest.join(", ")}.`);
      doc.appendParagraph(
        `If "${victim.name}" is still listed, the panel does not read the list this rung edited.`,
      );
      if (!doc.unlistParagraphStyle(victim.id)) throw new Error("unlist did nothing");
    },
  },
  {
    name: "P15b-style-copied-from-a-listed-one",
    note: "a new style whose property bags are a full copy of Body's — dense, the way Apple writes them",
    build: (doc) => {
      const index = doc.appendParagraph("P15b: this line should be large and blue.");
      doc.appendParagraph(
        'Open the paragraph styles panel: "P15 Copied" should be listed, below the built-in styles.',
      );
      doc.appendParagraph(
        "If the line is styled but the panel has no such entry, a complete property bag is not what the panel wants.",
      );
      const base = doc.listedParagraphStyles().find((s) => s.name === "Body") ??
        doc.listedParagraphStyles()[0];
      if (!base) throw new Error("no listed style to copy");
      const id = doc.createParagraphStyle({
        name: "P15 Copied",
        copyOf: base.id,
        character: { fontSize: 24, fontColor: { r: 0, g: 0.3, b: 0.9, space: "srgb" } },
      });
      doc.setParagraphStyle(index, id);
    },
  },
  {
    name: "P15c-style-built-from-nothing",
    note: "the same style with only the properties asked for — what the library writes today",
    build: (doc) => {
      const index = doc.appendParagraph("P15c: this line should be large and blue.");
      doc.appendParagraph(
        'Open the paragraph styles panel: "P15 Custom" should be listed, below the built-in styles.',
      );
      doc.appendParagraph(
        "This rung differs from P15b in one way only: its style sets three properties instead of copying all of Body's.",
      );
      const id = doc.createParagraphStyle({
        name: "P15 Custom",
        character: { fontSize: 24, fontColor: { r: 0, g: 0.3, b: 0.9, space: "srgb" } },
      });
      doc.setParagraphStyle(index, id);
    },
  },
  {
    name: "P16-date-field",
    note: "a live date field",
    build: (doc) => {
      doc.appendParagraph("P16: a live date follows here: ");
      // A date field spans visible text, unlike a page number, so it takes
      // the string it should display.
      doc.body.insertDateField(doc.body.text.length, "1 January 2026");
    },
  },
  {
    name: "P17-page-count",
    note: "a live page count — the 'of N' half of a page number",
    build: (doc) => {
      doc.appendParagraph("P17: this document has this many pages: ");
      doc.body.insertPageCount(doc.body.text.length);
    },
  },
  {
    name: "P18-bookmark",
    note: "a bookmark over a phrase, which Pages lists in its bookmark pane",
    build: (doc) => {
      doc.appendParagraph("P18: the words BOOKMARK HERE should be bookmarked.");
      const at = doc.body.text.lastIndexOf("BOOKMARK HERE");
      doc.body.addBookmark(at, at + "BOOKMARK HERE".length, "P18 bookmark");
    },
  },
  {
    name: "P19a-copy-same-page",
    base: new URL("../fixtures/patrickomatic-pages26-sections-masks.pages", import.meta.url),
    note: "a drawable copied into the page group it already belongs to — no new group",
    build: (doc) => {
      // Half of the placement question. This one reuses an existing page
      // group, so a failure here is about copying a drawable; a failure only
      // in P19b is about creating the group.
      doc.appendParagraph(
        "P19a: the page-1 graphic should appear TWICE on page 1, the copy shifted right.",
      );
      const page = doc.floatingDrawablePages()[0];
      if (page === undefined) throw new Error("base has no floating drawables");
      const container = doc.floatingDrawables(page)!;
      const source = container.drawables()[0];
      if (!source) throw new Error("no drawable to copy");
      // Shifted sideways only: the group is 396x612 on a 792-tall page, so
      // any vertical offset pushes most of it off the bottom.
      container.addCopyOf(source, { x: 150, y: 0 });
    },
  },
  {
    name: "P19b-copy-new-page-group",
    base: new URL("../fixtures/patrickomatic-pages26-sections-masks.pages", import.meta.url),
    note: "the same copy onto the next page, which needs a page group created",
    build: (doc) => {
      doc.appendParagraph(
        "P19b: the page-1 graphic should also appear on page 2, in the same position.",
      );
      const page = doc.floatingDrawablePages()[0];
      if (page === undefined) throw new Error("base has no floating drawables");
      const source = doc.floatingDrawables(page)!.drawables()[0];
      if (!source) throw new Error("no drawable to copy");
      // The adjacent page, and the same geometry as the original, so the
      // only variable is which page it is on.
      const target = doc.floatingDrawables(page + 1, { create: true });
      if (!target) throw new Error("no container for the target page");
      target.addCopyOf(source, { x: 0, y: 0 });
    },
  },
  {
    name: "P11-inline-image",
    note: "a 1x1 red PNG inserted inline and scaled up — the experimental one",
    build: (doc) => {
      doc.appendParagraph(
        "P11: a red square one inch across should appear at the end of the next line.",
      );
      doc.appendParagraph("Here it comes: ");
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
      // A rung with its own base is emitted once, not per base.
      if (rung.base && base !== BASES[0]) continue;
      const path = `${outDir}/${base.tag}-${rung.name}.pages`;
      try {
        const doc = PagesDocument.load(rung.base ? new Uint8Array(readFileSync(rung.base)) : bytes);
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

// Importable: the shape audit runs these same rungs and inspects what each
// one wrote, so a rung added here is audited without being listed twice.
if (import.meta.filename === process.argv[1]) process.exit(main(process.argv.slice(2)));
