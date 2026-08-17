/**
 * Self-describing demo documents — one file per feature area, every
 * write capability of the public API exercised in a document that
 * explains itself.
 *
 * Each check has a stable id (T-01, C-04, …), states what the library
 * did and what the app should therefore show, and leaves room for
 * feedback in the document itself: a "→ Feedback:" line in Pages, a
 * feedback column in Numbers, the presenter notes in Keynote. A check
 * whose render differs from its EXPECTED line is a finding, and often
 * the more useful outcome.
 *
 *   npm run demos -- <outDir>          (default: out)
 *
 * Files regenerate fresh on every run and self-check on write, so a
 * demo that no longer matches the API cannot be sent.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  BorderPosition,
  colorFill,
  DEFAULT_SHADOW,
  type DrawableStyle,
  KeynoteDocument,
  NumbersDocument,
  PagesDocument,
  ShadowType,
  solidStroke,
  TabAlignment,
} from "../src/index.ts";
import {
  CellRecordExpandedFields,
  CellRecordTileFields,
  FORMULA_OWNER_DEPENDENCIES,
  FormulaOwnerFields,
  OwnerKind,
  TiledDependenciesFields,
} from "../src/tsce/owners.ts";
import { blockPng } from "./png.ts";

const TERRACOTTA = { r: 0.753, g: 0.224, b: 0.169 };
const DARKBLUE = { r: 0.16, g: 0.29, b: 0.62 };
const SOFTGREEN = { r: 0.31, g: 0.60, b: 0.32 };
const SOFTYELLOW = { r: 1, g: 0.92, b: 0.55 };

// ---------------------------------------------------------------- helpers

/** Sequential check ids: T-01, T-02, … */
function counter(prefix: string): () => string {
  let n = 0;
  return () => `${prefix}-${String(++n).padStart(2, "0")}`;
}

/**
 * The layout law the checker's phone taught us: tables stay narrow
 * enough to read on a phone, prose wraps in a column built for it, and
 * value cells never wrap — their column is wide enough instead. Runs in
 * every Numbers demo's self-check so a rung cannot regress it.
 */
function assertPhoneLayout(doc: NumbersDocument, name: string, maxWidth = 560): void {
  for (const table of doc.tables()) {
    let total = 0;
    for (let c = 0; c < table.columnCount; c++) total += table.columnWidth(c);
    if (total > maxWidth) {
      throw new Error(`${name}: table ${table.name} is ${Math.round(total)} pt wide (max ${maxWidth})`);
    }
    // The header band is pinned while scrolling, on a phone too: a
    // sentence there rides along on every screen. One-word labels only.
    for (let r = 0; r < table.headerRowCount; r++) {
      for (let c = 0; c < table.columnCount; c++) {
        const text = table.cellText(r, c);
        if (text.length > 24) {
          throw new Error(`${name}: ${table.name} header r${r}c${c} is ${text.length} chars`);
        }
      }
    }
    const usedRows = new Set<number>();
    const usedColumns = new Set<number>();
    for (let r = 0; r < table.rowCount; r++) {
      for (let c = 0; c < table.columnCount; c++) {
        const value = table.cellValue(r, c);
        if (!value) continue;
        usedRows.add(r);
        usedColumns.add(c);
        const wrap = table.cellFormatting(r, c).textWrap === true;
        if (value.type === "text" && value.value.length > 40 && !wrap) {
          throw new Error(`${name}: ${table.name} r${r}c${c} holds long text without wrap`);
        }
        if ((value.type === "number" || value.type === "bool" || value.type === "date") && wrap) {
          throw new Error(`${name}: ${table.name} r${r}c${c} is a ${value.type} cell with wrap on`);
        }
      }
    }
    // A clone must be sized on purpose, never shipped as the donor's
    // husk: a reader opening a mostly-empty table sees a mistake.
    const lastRow = Math.max(-1, ...usedRows);
    const lastColumn = Math.max(-1, ...usedColumns);
    if (table.rowCount - 1 - lastRow > 3) {
      throw new Error(`${name}: ${table.name} has ${table.rowCount - 1 - lastRow} empty trailing rows`);
    }
    if (table.columnCount - 1 - lastColumn > 1) {
      throw new Error(
        `${name}: ${table.name} has ${table.columnCount - 1 - lastColumn} empty trailing columns`,
      );
    }
    if (usedRows.size > 0 && usedRows.size / table.rowCount < 0.5) {
      throw new Error(
        `${name}: ${table.name} uses ${usedRows.size} of ${table.rowCount} rows — a mostly empty table`,
      );
    }
  }
}

/**
 * A Pages check: one paragraph "«id» · what to look at", demo content in
 * between is appended by the caller, and `feedback()` closes it with the
 * line the reader answers on.
 */
function pagesCheck(doc: PagesDocument, id: string, expectation: string): void {
  const index = doc.appendParagraph(`${id} · ${expectation}`, "Body");
  const start = doc.body.paragraphStarts()[index]!;
  doc.applyCharacterFormatting(start, start + id.length, { bold: true });
}

function pagesFeedback(doc: PagesDocument): void {
  const index = doc.appendParagraph("→ Feedback: ", "Body");
  const paragraph = doc.paragraphs()[index]!;
  doc.applyCharacterFormatting(paragraph.start, paragraph.end, {
    italic: true,
    fontColor: { r: 0.45, g: 0.45, b: 0.45 },
  });
}

function pagesIntro(doc: PagesDocument, title: string, scope: string): void {
  doc.appendParagraph(title, "Title");
  doc.appendParagraph(
    `${scope} Each check has an id, a description of what the library did, and what the app should therefore show. Write what you see on the "→ Feedback:" line below the check (empty = as expected), or add a comment. Only the feedback lines are grey italic — all other body text must be black and upright; grey italic body text is itself a finding. When done, save and return the file.`,
    "Body",
  );
}

// ------------------------------------------------- demo 1: text & styles

function demoText(): Uint8Array {
  const doc = PagesDocument.blank();
  const check = counter("T");
  pagesIntro(doc, "DEMO 1 · Text and typography", "Character and paragraph formatting, named styles, lists, indents, borders and writing direction.");

  pagesCheck(doc, check(), "The words below must appear bold, italic and underlined — one word each.");
  const t1 = doc.appendParagraph("This word is bold, this one is italic, and this one is underlined.", "Body");
  {
    const p = doc.paragraphs()[t1]!;
    const at = (word: string) => p.start + p.text.indexOf(word);
    doc.applyCharacterFormatting(at("bold"), at("bold") + 4, { bold: true });
    doc.applyCharacterFormatting(at("italic"), at("italic") + 6, { italic: true });
    doc.applyCharacterFormatting(at("underlined"), at("underlined") + 10, { underline: 1 });
  }
  pagesFeedback(doc);

  pagesCheck(doc, check(), "One phrase in 21 pt terracotta, one word with a yellow highlight, one word struck through, and one word in Courier.");
  const t2 = doc.appendParagraph("Big and red · highlighted · struck through · typewriter.", "Body");
  {
    const p = doc.paragraphs()[t2]!;
    const at = (word: string) => p.start + p.text.indexOf(word);
    doc.applyCharacterFormatting(at("Big and red"), at("Big and red") + 11, { fontSize: 21, fontColor: TERRACOTTA });
    doc.applyCharacterFormatting(at("highlighted"), at("highlighted") + 11, { backgroundColor: SOFTYELLOW });
    doc.applyCharacterFormatting(at("struck through"), at("struck through") + 14, { strikethru: 1 });
    doc.applyCharacterFormatting(at("typewriter"), at("typewriter") + 10, { fontName: "Courier" });
  }
  pagesFeedback(doc);

  pagesCheck(doc, check(), "\"varnished\" in small caps, \"x2\" with the 2 in superscript, \"H2O\" with the 2 in subscript.");
  const t3 = doc.appendParagraph("The word varnished · x2 · H2O.", "Body");
  {
    const p = doc.paragraphs()[t3]!;
    const at = (s: string) => p.start + p.text.indexOf(s);
    doc.applyCharacterFormatting(at("varnished"), at("varnished") + 9, { capitalization: 2 });
    doc.applyCharacterFormatting(at("x2") + 1, at("x2") + 2, { superscript: 1 });
    doc.applyCharacterFormatting(at("H2O") + 1, at("H2O") + 2, { superscript: 2 });
  }
  pagesFeedback(doc);

  pagesCheck(doc, check(), "The link below must be clickable and point to den frie vilje's website.");
  const t4 = doc.appendParagraph("Visit den frie vilje to read more.", "Body");
  {
    const p = doc.paragraphs()[t4]!;
    const at = p.start + p.text.indexOf("den frie vilje");
    doc.insertLink(at, at + 14, "https://denfrievilje.dk");
  }
  pagesFeedback(doc);

  pagesCheck(doc, check(), "A new style \"Demo Emphasis\" (italic, terracotta) has been created and used on the line below — and it must appear in the styles panel.");
  doc.createParagraphStyle({
    name: "Demo Emphasis",
    basedOn: "Body",
    character: { italic: true, fontColor: TERRACOTTA },
  });
  doc.appendParagraph("This line uses the Demo Emphasis style.", "Demo Emphasis");
  pagesFeedback(doc);

  pagesCheck(doc, check(), "The \"Heading 2\" style has been edited to dark blue — so BOTH headings below must be blue.");
  doc.stylesheet.style("Heading 2")?.setCharacter({ fontColor: DARKBLUE });
  doc.appendParagraph("First subheading", "Heading 2");
  doc.appendParagraph("Second subheading", "Heading 2");
  pagesFeedback(doc);

  pagesCheck(doc, check(), "Three lines: left-aligned, centered, right-aligned.");
  const align = [
    ["This line is left-aligned.", 0],
    ["This line is centered.", 2],
    ["This line is right-aligned.", 1],
  ] as const;
  for (const [text, alignment] of align) {
    const i = doc.appendParagraph(text, "Body");
    doc.paragraph(i).format({ alignment });
  }
  pagesFeedback(doc);

  pagesCheck(doc, check(), "Two bullet items, two numbered ones (1., 2.) — and then plain body text WITHOUT a bullet.");
  doc.appendParagraph("First bullet item", "Body", "Bullet");
  doc.appendParagraph("Second bullet item", "Body", "Bullet");
  doc.appendParagraph("First numbered item", "Body", "Numbered");
  doc.appendParagraph("Second numbered item", "Body", "Numbered");
  doc.appendParagraph("This body text must not have been given a bullet.", "Body");
  pagesFeedback(doc);

  pagesCheck(doc, check(), "A block-indented line (60 pt) and a hanging indent (first line further out than the rest).");
  const ind1 = doc.appendParagraph("This line is block-indented 60 pt from the margin.", "Body");
  doc.paragraph(ind1).format({ leftIndent: 60 });
  const ind2 = doc.appendParagraph(
    "Hanging indent: the first line starts here, and the following lines of the same paragraph sit further in — write enough text, and the wrapping shows it. This sentence is only here to force a line break in the paragraph.",
    "Body",
  );
  doc.paragraph(ind2).format({ leftIndent: 60, firstLineIndent: 20 });
  pagesFeedback(doc);

  pagesCheck(doc, check(), "Paragraph borders: a line with a rule above and below; a line with a red rule on the left side only; a line with a blue rule on the right side only.");
  const b1 = doc.appendParagraph("A rule above and below this paragraph.", "Body");
  doc.paragraph(b1).format({ border: solidStroke({ r: 0.2, g: 0.2, b: 0.2 }, 1), borderPositions: BorderPosition.TOP_AND_BOTTOM });
  const b2 = doc.appendParagraph("A red rule on the left side.", "Body");
  doc.paragraph(b2).format({ border: solidStroke(TERRACOTTA, 3), borderPositions: BorderPosition.LEADING });
  const b3 = doc.appendParagraph("A blue rule on the right side.", "Body");
  doc.paragraph(b3).format({ border: solidStroke(DARKBLUE, 3), borderPositions: BorderPosition.TRAILING });
  pagesFeedback(doc);

  pagesCheck(doc, check(), "A paragraph with a light yellow background color.");
  const bg = doc.appendParagraph("This paragraph has its own background color.", "Body");
  doc.paragraph(bg).format({ backgroundColor: SOFTYELLOW });
  pagesFeedback(doc);

  pagesCheck(doc, check(), "The Hebrew line below must align right on its own (right-to-left writing direction).");
  const rtl = doc.appendParagraph("עברית מיושרת לימין", "Body");
  doc.paragraph(rtl).setDirection("rtl");
  pagesFeedback(doc);

  pagesCheck(doc, check(), "Double line spacing and 18 pt of space before/after in the paragraph below — it must look clearly airier than the rest.");
  const sp = doc.appendParagraph(
    "This paragraph has double line spacing. This second sentence is here so the paragraph wraps across several lines and the spacing can be seen.",
    "Body",
  );
  doc.paragraph(sp).format({ lineSpacing: 2, spaceBefore: 18, spaceAfter: 18 });
  pagesFeedback(doc);

  pagesCheck(doc, check(), "Decimal tab at 200 pt: the two amounts below must have their commas exactly aligned, one under the other.");
  for (const line of ["Netto\t1.234,56", "Moms\t308,64"]) {
    const i = doc.appendParagraph(line, "Body");
    doc.paragraph(i).format({ tabs: [{ position: 200, alignment: TabAlignment.DECIMAL }], decimalTab: "," });
  }
  pagesFeedback(doc);

  pagesCheck(doc, check(), "Rule offset: the line below has rules above and below with the offset set to +12. The distance between text and rules must be clearly larger than in T-10. (Measured in the previous round: negative pulls the rules into the text, 0 is the default distance.)");
  const off = doc.appendParagraph("A rule above and below, with an explicit rule offset.", "Body");
  doc.paragraph(off).format({
    border: solidStroke({ r: 0.2, g: 0.2, b: 0.2 }, 1),
    borderPositions: BorderPosition.TOP_AND_BOTTOM,
    ruleOffset: 12,
  });
  pagesFeedback(doc);

  doc.appendParagraph("Thanks! Save (⌘S) and return the file.", "Heading 3");
  return doc.save();
}

// -------------------------------------------- demo 2: structure & fields

function demoFields(): Uint8Array {
  // blank()'s minimal donor lists no section objects, so this demo builds
  // on a corpus document with real sections: everything but three
  // structural paragraphs is deleted, and the checks are appended into
  // its second section.
  const doc = PagesDocument.load(
    new Uint8Array(readFileSync(new URL("../fixtures/picodocs-v14.4-headers-tables.pages", import.meta.url))),
  );
  const check = counter("S");
  const boundary = doc.body.text.indexOf("\u0004");
  const boundaryPara = doc.paragraphs().findIndex((p) => p.start <= boundary && p.end >= boundary);
  for (let i = doc.paragraphs().length - 1; i >= 1; i--) {
    if (i === boundaryPara || i === boundaryPara + 1) continue;
    doc.paragraph(i).delete();
  }
  doc.paragraph(0).text =
    "DEMO 2 · Structure and fields — sections, headers and footers, page numbers, date fields, bookmarks, footnotes, comments and placeholders. (The base document comes from the test corpus; the rest of its content was deleted by the library.) Write what you see on the \"→ Feedback:\" line below each check — empty = as expected — or add a comment. When done, save and return the file.";
  doc.paragraph(0).setStyle("Title");
  doc.paragraph(1).text = "This is section 1's last paragraph — section 2 begins on the next page.";
  doc.paragraph(2).text = "Section 2 begins here; all the checks below belong to it.";
  doc.paragraph(2).setStyle("Heading");

  pagesCheck(doc, check(), "Section 1's header says \"Section 1\" — centered, because the field's style centers. Section 2's says \"Section 2 · header\" — left-aligned, because that style left-aligns: the header is one page-wide field, and the text follows the field's own paragraph style. Section 2's footer shows \"Page N of M\" with real numbers (live fields).");
  pagesFeedback(doc);

  pagesCheck(doc, check(), "The date field in the line below is a live field — click it, and Pages shows the date picker.");
  const dateLine = doc.appendParagraph("The document was built: ", "Body");
  pagesFeedback(doc);

  pagesCheck(doc, check(), "The word \"anchor\" below carries a bookmark named \"Demo bookmark\" — it must appear in the list when you insert a link and choose bookmark.");
  const bm = doc.appendParagraph("This paragraph contains an anchor for the bookmark.", "Body");
  pagesFeedback(doc);

  pagesCheck(doc, check(), "The word \"footnote\" below has a note mark, and the note itself sits at the bottom of the page.");
  const fn = doc.appendParagraph("This sentence has a footnote after the word footnote.", "Body");
  pagesFeedback(doc);

  pagesCheck(doc, check(), "The sentence below carries a comment (author \"cupertino-files\") — feel free to answer it as feedback.");
  const cm = doc.appendParagraph("This sentence has a comment attached to it.", "Body");
  pagesFeedback(doc);

  pagesCheck(doc, check(), "Line A below is a placeholder: a single click must select the WHOLE span, and what you type replaces all of it. Line B was a placeholder that the library itself filled in — it must behave like completely ordinary text.");
  doc.appendParagraph("A: «TYPE CUSTOMER NAME HERE»", "Body");
  const filled = doc.appendParagraph("B: Filled in by the library — was a placeholder.", "Body");
  pagesFeedback(doc);

  pagesCheck(doc, check(), "Below, SECTION 3 begins, created by the library with its own cloned page masters: it starts on a new page, and its header says \"Section 3\" — independent of section 2's.");
  const s3 = doc.appendParagraph("Section 3 begins with this paragraph.", "Heading");
  pagesFeedback(doc);
  doc.appendParagraph("Thanks! Save (⌘S) and return the file.", "Heading 2");

  // Fields and marks, after all text is in place (offsets are stable now).
  {
    const p = doc.paragraphs()[dateLine]!;
    doc.body.insertDateField(p.end, "August 9, 2026");
  }
  {
    const p = doc.paragraphs()[bm]!;
    const at = p.start + p.text.indexOf("anchor");
    doc.body.addBookmark(at, at + 6, "Demo bookmark");
  }
  {
    const p = doc.paragraphs()[fn]!;
    const at = p.start + p.text.indexOf("footnote.") + "footnote".length;
    doc.body.addFootnote(at, "The footnote was written by the library, in the document's own footnote style.");
  }
  {
    const p = doc.paragraphs()[cm]!;
    doc.body.addComment(p.start, p.end, "Hi! This comment was written by the library. Feel free to answer it as feedback.");
  }
  doc.find("«TYPE CUSTOMER NAME HERE»")[0]!.asPlaceholder();
  {
    const p = doc.paragraphs()[filled]!;
    const start = p.start + "B: ".length;
    doc.defineAsPlaceholder(start, p.end);
    doc.body.fillPlaceholder({ start, end: p.end }, "Filled in by the library — was a placeholder.");
  }

  const sectionThree = doc.insertSectionBreak(s3, { name: "Demo section" });
  sectionThree.setHeaderText("Section 3");
  const [one, two] = doc.sections();
  one!.setHeaderText("Section 1");
  two!.setHeaderText("Section 2 · header");
  for (const template of two!.templates()) {
    const filled = template.footers.find((f) => f.text.length > 0);
    for (const footer of template.footers) {
      const wasEmpty = footer.text.length === 0;
      footer.setText("Page  of ");
      footer.insertPageNumber(5);
      footer.insertPageCount(footer.text.length);
      if (wasEmpty && filled && filled !== footer) footer.copyShapeFrom(filled);
    }
  }
  return doc.save();
}

// ------------------------------------------------------- demo 3: media

function demoMedia(): Uint8Array {
  const doc = PagesDocument.blank();
  const check = counter("M");
  pagesIntro(doc, "DEMO 3 · Images and objects", "Inserted images (in the text column and at the page margin), floating copies, object style, cropping.");

  // Build all paragraphs first; insert images after (appended empty
  // paragraphs are invisible to paragraphs() until they get content).
  pagesCheck(doc, check(), "The photo below (Earthrise, NASA) and the line above it are BOTH indented 80 pt — the photo's left edge must line up with the text's.");
  const ref1 = doc.appendParagraph("This line is indented 80 pt, like the photo below it.", "Body");
  const img1 = doc.appendParagraph(" ", "Body");
  pagesFeedback(doc);

  pagesCheck(doc, check(), "Hokusai's Great Wave below is set with the \"beside\" arrangement: it must start out at the page's left MARGIN — to the left of the line above — and the text after it may flow beside it; that is the point of the arrangement.");
  const img2 = doc.appendParagraph(" ", "Body");
  pagesFeedback(doc);

  pagesCheck(doc, check(), "Another copy of the wave woodcut, inserted in the TEXT FLOW and cropped by the library to the middle cut: Fuji in the center, the great wave's claw cropped AWAY. Expected for an image \"inline with text\": the crop IS DRAWN, \"reset mask\" works, but double-click does NOT open the mask editor — that is the app's behavior for inline images, not a bug. If the editor opens anyway, write that.");
  const img3 = doc.appendParagraph(" ", "Body");
  pagesFeedback(doc);

  pagesCheck(doc, check(), "The same crop on a FLOATING copy of the wave, placed to the right below — the arrangement the app's own cropping itself produces. Here double-click MUST open the mask editor (slider and handles). If it does not open here, the obstacle is not the text wrap, and that is an important finding.");
  pagesFeedback(doc);

  pagesCheck(doc, check(), "A FLOATING copy of the Earthrise photo sits at the top right of page 1 (60 % transparency, dark border and drop shadow). Text must flow around it.");
  pagesFeedback(doc);

  pagesCheck(doc, check(), "The graphic below is a PDF (vector, a scientific pipeline figure): zoom in close — the lines and text in the figure must stay razor-sharp, not pixelated.");
  const img5 = doc.appendParagraph(" ", "Body");
  pagesFeedback(doc);

  doc.appendParagraph("Thanks! Save (⌘S) and return the file.", "Heading 3");

  const indent = { leftIndent: 80 };
  for (const i of [ref1, img1, img2, img3]) doc.paragraph(i).format(indent);

  const assets = new URL("./assets/", import.meta.url);
  const earthrise = new Uint8Array(readFileSync(new URL("earthrise.jpg", assets)));
  const wave = new Uint8Array(readFileSync(new URL("great-wave.jpg", assets)));
  const pipeline = new Uint8Array(readFileSync(new URL("pipeline.pdf", assets)));
  const { imageId } = doc.insertInlineImage(doc.body.paragraphStarts()[img1]!, earthrise, {
    fileName: "earthrise.jpg",
    maxWidth: 200,
  });
  doc.insertInlineImage(doc.body.paragraphStarts()[img2]!, wave, {
    fileName: "great-wave.jpg",
    maxWidth: 260,
    wrap: "page",
  });
  const { imageId: croppedId } = doc.insertInlineImage(doc.body.paragraphStarts()[img3]!, wave, {
    fileName: "great-wave.jpg",
    maxWidth: 260,
  });
  doc.insertInlineImage(doc.body.paragraphStarts()[img5]!, pipeline, {
    fileName: "pipeline.pdf",
    maxWidth: 220,
  });
  const cropped = doc.images().find((image) => image.object.identifier === croppedId);
  // The crop window lives in the image's drawn space: this copy is 260 pt
  // wide (960 px scaled), so the centre half is x 65, width 130.
  cropped?.setCrop({ x: 65, y: 0, width: 130, height: 260 * (645 / 960) });

  const floating = doc.floatingDrawables(0, { create: true });
  const source = doc.store.object(imageId);
  if (floating && source) {
    const copy = floating.addCopyOf(source, { x: 400, y: 90 });
    copy.setGeometry({ width: 140, height: 70 });
    copy.style()?.set({ opacity: 0.6, stroke: solidStroke({ r: 0.15, g: 0.15, b: 0.15 }, 2) });
    copy.style()?.setShadowEnabled(true);
  }
  // The floating cropped wave: the arrangement the app's own crop flow
  // produces (the crop-delta seed converted to floating when the person
  // cropped), so the mask editor is expected to engage here where the
  // in-flow copy above only renders.
  const croppedSource = doc.store.object(croppedId);
  if (floating && croppedSource) {
    const floatCrop = floating.addCopyOf(croppedSource, { x: 330, y: 420 });
    const model = doc.images().find((image) => image.object.identifier === floatCrop.object.identifier);
    model?.setCrop({ x: 65, y: 0, width: 130, height: 260 * (645 / 960) });
  }
  return doc.save();
}

// ------------------------------------------------------- demo 4: chart

function demoChart(): Uint8Array {
  // The corpus's Pages document with a column chart; its body text is
  // replaced whole by this demo's instructions, the chart stays.
  const doc = PagesDocument.load(
    new Uint8Array(readFileSync(new URL("../fixtures/draftjs-v2.3-comments.pages", import.meta.url))),
  );
  const chart = doc.charts()[0]!;
  const n = (value: number) => ({ type: "number", value }) as const;
  chart.setData([
    [n(12), n(19), n(31), n(24)],
    [n(28), n(14), n(22), n(17)],
  ]);
  chart.setRowName(0, "Series 2025");
  chart.setRowName(1, "Series 2026");
  chart.setColumnName(0, "North");
  chart.setColumnName(1, "South");
  chart.setColumnName(2, "East");
  chart.setColumnName(3, "West");
  chart.setAxisMajorGridlines("value", false);

  // The donor anchors its chart in the body text (old-era file: no page
  // groups, so the text anchor is the only thing that renders it), and
  // wiping the text severed it — the returned round one reported no
  // chart at all. Keep the chart's attachment object and re-anchor it
  // after the rewrite.
  const chartAttachment = doc.body
    .attachments()
    .find((a) => a.drawableId !== undefined && doc.store.typeNameOf(doc.store.object(a.drawableId)!) === "TSCH.ChartDrawableArchive")?.objectId;
  doc.body.setText("");
  const check = counter("D");
  pagesIntro(doc, "DEMO 4 · Chart", "Chart data and appearance, edited in an existing document's column chart (this document comes from the test corpus).");
  pagesCheck(doc, check(), "The chart must show four categories — North (12/28), South (19/14), East (31/22), West (24/17) — two columns per category, and the series are named \"Series 2025\" and \"Series 2026\".");
  pagesFeedback(doc);
  pagesCheck(doc, check(), "The value axis's horizontal gridlines are TURNED OFF by the library — the chart must stand without horizontal lines behind the columns.");
  pagesFeedback(doc);
  const anchor = doc.appendParagraph(" ", "Body");
  doc.appendParagraph("Thanks! Save (⌘S) and return the file.", "Heading 3");
  if (chartAttachment !== undefined) {
    doc.body.insertAttachment(doc.body.paragraphStarts()[anchor]!, chartAttachment);
  }
  return doc.save();
}

// ---------------------------------------------------- demo 11: shadows

function demoShadows(): Uint8Array {
  const doc = PagesDocument.blank();
  const check = counter("S");
  pagesIntro(
    doc,
    "DEMO 11 · Shadows, blur and reflections",
    "The drop shadow's parameters (direction, distance, blur, opacity, color), the enabled flag, the three shadow types and reflection — eleven colored squares, one change per square. The squares float on the right side of pages 1 and 2 in check order, and each check names its square's color; at the bottom sits a row of color swatches in the same order. The inspector: Format → Style → Shadow (Formatér → Stil → Skygge).",
  );

  // One delta per rung against S-01's stated baseline (the app-verified
  // default: stored angle 45 = inspector 315°, offset 5, blur 1, black,
  // full opacity, enabled).
  const rungs: { rgb: [number, number, number]; text: string; style: DrawableStyle }[] = [
    {
      rgb: [192, 57, 43],
      text:
        "The reference: the TERRACOTTA square has the app's own default shadow — the one the \"Drop Shadow\" (Slagskygge) pop-up itself sets: black, STRAIGHT DOWN (the inspector shows 270°), close (offset 2 pt), slightly softened (blur 5 pt), 50 % opacity. The next checks each change one thing relative to this one.",
      style: { shadow: { ...DEFAULT_SHADOW } },
    },
    {
      rgb: [41, 74, 158],
      text: "Direction: the BLUE square's shadow points DOWN TO THE RIGHT (the inspector shows 315°), the classic direction.",
      style: { shadow: { ...DEFAULT_SHADOW, angle: 45 } },
    },
    {
      rgb: [79, 153, 82],
      text:
        "Direction again: the GREEN square's shadow points LEFT (the inspector shows 180°). If it points another way, write which — the direction scale is exactly what this check measures.",
      style: { shadow: { ...DEFAULT_SHADOW, angle: 180 } },
    },
    {
      rgb: [230, 185, 50],
      text: "Distance: the YELLOW square's shadow is moved 25 pt away — clearly separated from the square, same direction as the reference.",
      style: { shadow: { ...DEFAULT_SHADOW, offset: 25 } },
    },
    {
      rgb: [125, 60, 152],
      text: "Blur: the PURPLE square's shadow is very soft (blur 20 pt) — a smeared cloud rather than a sharp edge.",
      style: { shadow: { ...DEFAULT_SHADOW, radius: 20 } },
    },
    {
      rgb: [230, 126, 34],
      text: "Opacity: the ORANGE square's shadow is nearly full (90 %) — clearly darker than the reference's 50 %.",
      style: { shadow: { ...DEFAULT_SHADOW, opacity: 0.9 } },
    },
    {
      rgb: [150, 150, 150],
      text: "Color: the GREY square's shadow is TERRACOTTA-colored, not black.",
      style: { shadow: { ...DEFAULT_SHADOW, color: { r: 0.753, g: 0.224, b: 0.169, a: 1 } } },
    },
    {
      rgb: [30, 30, 30],
      text:
        "Turned off: the BLACK square has a configured but TURNED OFF shadow — NO shadow may be drawn, and the inspector's shadow field should read as off. Then turn the shadow ON via the pop-up (choose Drop Shadow): the app must survive the switch and draw the shadow. This file was rebuilt after exactly that switch made Pages crash; a new crash is therefore an important finding, and \"the switch worked\" is exactly what this check measures.",
      style: { shadow: { ...DEFAULT_SHADOW, enabled: false } },
    },
    {
      rgb: [26, 188, 156],
      text: "Type: the TURQUOISE square has a CONTACT shadow (the \"Contact\" (Kontakt) pop-up item) with 40 pt blur — the shadow gathers softly under the square's foot, as if it stands on a surface.",
      style: { shadow: { ...DEFAULT_SHADOW, type: ShadowType.CONTACT, radius: 40 } },
    },
    {
      rgb: [121, 85, 61],
      text: "Type: the BROWN square has a CURVED shadow (the \"Curved\" (Buet) pop-up item).",
      style: { shadow: { ...DEFAULT_SHADOW, type: ShadowType.CURVED } },
    },
    {
      rgb: [24, 38, 74],
      text: "Reflection: the DARK BLUE square has NO shadow but a REFLECTION (50 %) — the square mirrors below itself and fades out. The inspector: Reflection turned on with the slider at 50 %.",
      style: { reflection: 0.5 },
    },
  ];

  for (const [index, rung] of rungs.entries()) {
    pagesCheck(doc, check(), rung.text);
    pagesFeedback(doc);
    // A page break after the sixth check puts S-07..S-11 beside their
    // squares on page 2.
    if (index === 5) doc.body.insertText(doc.body.text.length, "\f");
  }
  doc.appendParagraph("Thanks! Save (⌘S) and return the file.", "Heading 3");
  const legend = doc.appendParagraph("Color swatches in the order S-01…S-11: ", "Body");

  // The legend chips are the sources; each floating square is a copy
  // carrying its rung's one-delta style.
  const sources: bigint[] = [];
  for (const [index, rung] of rungs.entries()) {
    const { imageId } = doc.insertInlineImage(doc.body.text.length, blockPng(40, 40, rung.rgb), {
      fileName: `demo-skygge-${String(index + 1).padStart(2, "0")}.png`,
      maxWidth: 14,
    });
    sources.push(imageId);
  }
  void legend;

  for (const [index, rung] of rungs.entries()) {
    const page = index < 6 ? 0 : 1;
    const floating = doc.floatingDrawables(page, { create: true });
    const source = doc.store.object(sources[index]!);
    if (!floating || !source) throw new Error(`skygger: source ${index} missing`);
    const slot = index < 6 ? index : index - 6;
    const copy = floating.addCopyOf(source, { x: 452, y: 92 + slot * 112, width: 72, height: 72 });
    copy.style()?.set(rung.style);
  }
  return doc.save();
}

// ------------------------------------------------------- demo 5: cells

function demoCells(): Uint8Array {
  const doc = NumbersDocument.blank();
  const table = doc.tables()[0]!;
  const check = counter("C");
  if (table.columnCount < 5) table.insertColumns(table.columnCount, 5 - table.columnCount);
  const need = 25;
  if (table.rowCount < need) table.insertRows(table.rowCount, need - table.rowCount);
  table.setColumnWidth(0, 60);
  table.setColumnWidth(1, 330);
  table.setColumnWidth(2, 120);
  table.setColumnWidth(3, 120);
  table.setColumnWidth(4, 170);

  let row = 0;
  const head = (id: string, text: string): void => {
    table.setCell(row, 0, id);
    table.setCell(row, 1, text);
    table.setCellFormatting(row, 1, { textWrap: true });
    row++;
  };
  // Header rows stay pinned while scrolling, so row 0 holds nothing but
  // one-word headers; the intro is an ordinary content row that scrolls.
  table.setCell(row, 0, "ID");
  table.setCell(row, 1, "Check");
  table.setCell(row, 4, "Feedback");
  row++;
  table.setCell(row, 0, "DEMO 5");
  table.setCell(row, 1, "Cells and formats — write feedback in column E next to each check (empty = as expected). Save and return.");
  table.setCellFormatting(row, 1, { textWrap: true });
  row += 2;

  head(check(), "Cell types — C: text, D: number. The row below: C: date (must show a date), D: duration (must show 1h 30m — on a Danish system 1t 30m).");
  table.setCell(row - 1, 2, "some text");
  table.setCell(row - 1, 3, 1234.5);
  table.setCell(row, 2, { type: "date", value: new Date(Date.UTC(2026, 7, 9, 12, 0, 0)) });
  table.setCell(row, 3, { type: "duration", seconds: 5400 });
  row += 2;

  head(check(), "Formats — C: currency (kr., two decimals), D: percentage. The row below: C: checkbox (true = check mark), D: number with 3 decimals.");
  table.setCell(row - 1, 2, 1234.5);
  table.setCellFormat(row - 1, 2, { kind: "currency", code: "DKK", decimals: 2 });
  table.setCell(row - 1, 3, 0.125);
  table.setCellFormat(row - 1, 3, { kind: "percentage", decimals: 1 });
  table.setCell(row, 2, true);
  table.setCellFormat(row, 2, { kind: "checkbox" });
  table.setCell(row, 3, 3.14159);
  table.setCellFormat(row, 3, { kind: "number", decimals: 3 });
  row += 2;

  head(check(), "Merged cells: C and D in the row below are merged into one wide cell with CENTERED text.");
  table.mergeCells(row, 2, 1, 2);
  table.setCell(row, 2, "merged C+D");
  table.setCellFormatting(row, 2, { verticalAlignment: 1, horizontalAlignment: "center" });
  row += 2;

  head(check(), "Cell style: C below has a dark blue fill, padding and a terracotta border all the way around.");
  table.setCell(row, 2, "styled cell");
  table.setCellFormatting(row, 2, {
    fill: colorFill(DARKBLUE.r, DARKBLUE.g, DARKBLUE.b),
    padding: { left: 8, right: 8, top: 6, bottom: 6 },
    borders: {
      top: solidStroke(TERRACOTTA, 2),
      bottom: solidStroke(TERRACOTTA, 2),
      left: solidStroke(TERRACOTTA, 2),
      right: solidStroke(TERRACOTTA, 2),
    },
  });
  row += 2;

  head(check(), "Column C is set narrow (120 pt) and E wide (170 pt); the row below is 40 pt tall.");
  table.setRowHeight(row, 40);
  table.setCell(row, 2, "tall row");
  row += 2;

  head(check(), "The table has been given alternating row colors (banded rows) — every other data row lightly tinted.");
  table.tableStyle()?.setTable({ bandedRows: true });
  row += 2;

  head(check(), "Wrapping: C below wraps its long text inside the cell; D clips it.");
  table.setCell(row, 2, "this text is too long for the cell and must wrap across several lines");
  table.setCellFormatting(row, 2, { textWrap: true });
  table.setCell(row, 3, "this text is also too long, but must not wrap");
  table.setCellFormatting(row, 3, { textWrap: false });
  row += 2;

  head(check(), "The structure itself: this table had its rows inserted by the library (24 in total), and the table is named \"Demo Table\" — the name must be VISIBLE above the table.");
  table.name = "Demo Table";
  table.nameVisible = true;
  row += 2;

  return doc.save();
}

// ---------------------------------------------------- demo 6: formulas

function demoFormulas(): Uint8Array {
  const doc = NumbersDocument.blank();
  const data = doc.tables()[0]!;
  const check = counter("F");

  if (data.columnCount < 5) data.insertColumns(data.columnCount, 5 - data.columnCount);
  if (data.rowCount < 23) data.insertRows(data.rowCount, 23 - data.rowCount);
  data.setColumnWidth(0, 44);
  data.setColumnWidth(1, 250);
  data.setColumnWidth(2, 75);
  data.setColumnWidth(3, 75);
  data.setColumnWidth(4, 100);

  let row = 0;
  data.setCell(row, 0, "ID");
  data.setCell(row, 1, "Check");
  data.setCell(row, 4, "Notes");
  row++;
  data.setCell(row, 0, "DEMO 6");
  data.setCell(row, 1, "Formulas — all written as AST by the library; Numbers computes them itself on open. If a cell shows an error or nothing, that is the finding. Notes in column E.");
  data.setCellFormatting(row, 1, { textWrap: true });
  row += 2;

  const head = (id: string, text: string): void => {
    data.setCell(row, 0, id);
    data.setCell(row, 1, text);
    data.setCellFormatting(row, 1, { textWrap: true });
    row++;
  };

  head(check(), "Base data: C=7, D=3. The row below: C must show 10 (sum), D must show 21 (product).");
  data.setCell(row - 1, 2, 7);
  data.setCell(row - 1, 3, 3);
  const base = row - 1;
  data.setFormula(row, 2, `=C${base + 1}+D${base + 1}`, { value: 10 });
  data.setFormula(row, 3, `=C${base + 1}*D${base + 1}`, { value: 21 });
  row += 2;

  head(check(), "Number series in C (2, 4, 6, 8) — D next to each: SUM=20, AVERAGE=5, MAX=8, ROUND(3.7)=4 — in that order.");
  const firstNum = row;
  for (const [i, v] of [2, 4, 6, 8].entries()) data.setCell(row + i, 2, v);
  data.setFormula(firstNum, 3, `=SUM(C${firstNum + 1}:C${firstNum + 4})`, { value: 20 });
  data.setFormula(firstNum + 1, 3, `=AVERAGE(C${firstNum + 1}:C${firstNum + 4})`, { value: 5 });
  data.setFormula(firstNum + 2, 3, `=MAX(C${firstNum + 1}:C${firstNum + 4})`, { value: 8 });
  data.setFormula(firstNum + 3, 3, "=ROUND(3.7,0)", { value: 4 });
  row += 5;

  head(check(), "Cross-references both ways: C below fetches 5 from the \"CrossCheck\" table at the bottom of the sheet. CrossCheck's top row conversely fetches 7 from here, and its SUM over the whole of column B must show 30.");
  const crossRow = row;
  row += 2;

  // The comparative slots: the checker authors the same constructions
  // with the app, right under ours, and the returned file carries
  // Apple's formula bytes next to this library's for the same ask.
  head(
    check(),
    `YOUR TURN — formula: type =SUM(C${row + 2}:C${row + 3}) yourself in the yellow D cell next to the numbers below (must show 9). Then the app's formula can be compared with the library's, field by field.`,
  );
  data.setCell(row, 2, 4);
  data.setCell(row + 1, 2, 5);
  data.setCellFormatting(row, 3, { fill: colorFill(SOFTYELLOW.r, SOFTYELLOW.g, SOFTYELLOW.b) });
  row += 3;

  head(check(), "YOUR TURN — cross-reference: type =CrossCheck::B4 yourself in the yellow C cell below (must show 10).");
  data.setCellFormatting(row, 2, { fill: colorFill(SOFTYELLOW.r, SOFTYELLOW.g, SOFTYELLOW.b) });
  row += 2;
  if (data.rowCount > row) data.deleteRows(row, data.rowCount - row);

  // A clean second table: the cross-table reference each way, and a
  // whole-column span. Column B holds only the three numbers the span
  // sums, and both formulas sit in column C — a formula inside the
  // column it spans would be a circular reference.
  // A clone is a structure donor, nothing more: size, widths and
  // formatting are all chosen here, or the donor's leak through and a
  // reader opens a mostly-empty husk with someone else's styling.
  const sheet = doc.sheets()[0]!;
  const second = doc.addTable(sheet.id, { name: "CrossCheck", x: 40, y: 700, withContent: false });
  if (second.rowCount > 7) second.deleteRows(7, second.rowCount - 7);
  if (second.rowCount < 7) second.insertRows(second.rowCount, 7 - second.rowCount);
  if (second.columnCount > 3) second.deleteColumns(3, second.columnCount - 3);
  second.setColumnWidth(0, 220);
  second.setColumnWidth(1, 75);
  second.setColumnWidth(2, 75);
  const dataName = data.name ?? "Table 1";
  second.setCell(0, 0, "Check");
  second.setCell(0, 1, "Data");
  second.setCell(0, 2, "Result");
  second.setCell(1, 0, "Fetched from the main table (must show 7):");
  second.setCellFormatting(1, 0, { textWrap: true });
  second.setFormula(1, 2, `=${dataName}::C${base + 1}`, { value: 7 });
  second.setCell(2, 0, "Its own numbers in B: 5, 10 and 15");
  second.setCellFormatting(2, 0, { textWrap: true });
  second.setCell(2, 1, 5);
  second.setCell(3, 1, 10);
  second.setCell(4, 1, 15);
  // The clone inherits the donor's wrapped prose styles cell by cell;
  // value cells must not keep them.
  for (const r of [2, 3, 4]) second.setCellFormatting(r, 1, { textWrap: false });
  second.setCell(5, 0, "SUM over the whole of column B (must show 30):");
  second.setCellFormatting(5, 0, { textWrap: true });
  second.setFormula(5, 2, "=SUM(B)", { value: 30 });
  data.setFormula(crossRow, 2, "=CrossCheck::B3", { value: 5 });

  return doc.save();
}

// ------------------------------- demo 7: conditional rules & controls

function demoRules(): Uint8Array {
  const doc = NumbersDocument.blank();
  const table = doc.tables()[0]!;
  const check = counter("R");

  if (table.rowCount < 33) table.insertRows(table.rowCount, 33 - table.rowCount);
  if (table.columnCount < 4) table.insertColumns(table.columnCount, 4 - table.columnCount);
  table.setColumnWidth(0, 44);
  table.setColumnWidth(1, 270);
  table.setColumnWidth(2, 80);
  table.setColumnWidth(3, 120);

  let row = 0;
  table.setCell(row, 0, "ID");
  table.setCell(row, 1, "Check");
  table.setCell(row, 2, "Value");
  table.setCell(row, 3, "Verdict");
  row++;
  table.setCell(row, 0, "DEMO 7");
  table.setCell(row, 1, "Conditional formatting and controls — answer with the pop-up menu in column D next to each check, and feel free to write notes in free D cells.");
  table.setCellFormatting(row, 1, { textWrap: true });
  row += 2;

  const verdictRows: number[] = [];
  const head = (id: string, text: string): void => {
    table.setCell(row, 0, id);
    table.setCell(row, 1, text);
    table.setCellFormatting(row, 1, { textWrap: true });
    verdictRows.push(row);
    row++;
  };

  head(check(), "Conditional rule \"> 5\" with green fill on the C cells below: 3 (unmarked), 7 (green), 9 (green).");
  for (const [i, v] of [3, 7, 9].entries()) table.setCell(row + i, 2, v);
  table.setConditionalRules(row, 2, [{ operator: ">", value: 5, cell: { fill: colorFill(SOFTGREEN.r, SOFTGREEN.g, SOFTGREEN.b) } }], { rowCount: 3 });
  row += 4;

  head(check(), "Rule \"= 4\" yellow and \"<> 4\" blue in C: 4 (yellow), 5 (blue).");
  table.setCell(row, 2, 4);
  table.setConditionalRules(row, 2, [{ operator: "=", value: 4, cell: { fill: colorFill(SOFTYELLOW.r, SOFTYELLOW.g, SOFTYELLOW.b) } }]);
  table.setCell(row + 1, 2, 5);
  table.setConditionalRules(row + 1, 2, [{ operator: "<>", value: 4, cell: { fill: colorFill(0.62, 0.76, 0.95) } }]);
  row += 3;

  head(check(), "The same rule set reused: the rule from the first check (>5 green) is also applied to the two C cells below: 6 (green), 2 (unmarked).");
  table.setCell(row, 2, 6);
  table.setCell(row + 1, 2, 2);
  const key = table.conditionalStyleKey(verdictRows[0]! + 1, 2);
  if (key !== undefined) {
    table.setConditionalStyleKey(row, 2, key);
    table.setConditionalStyleKey(row + 1, 2, key);
  }
  row += 3;

  head(check(), "Controls in C below: checkbox (checked), star rating (4 of 5), slider (60 of 0–100), stepper (25, step 5).");
  table.setCell(row, 2, true);
  table.setCellControl(row, 2, { widget: "checkbox", value: true });
  table.setCell(row + 1, 2, 4);
  table.setCellControl(row + 1, 2, { widget: "starRating", value: 4 });
  table.setCell(row + 2, 2, 60);
  table.setCellControl(row + 2, 2, { widget: "slider", minimum: 0, maximum: 100, increment: 5, value: 60 });
  table.setCell(row + 3, 2, 25);
  table.setCellControl(row + 3, 2, { widget: "stepper", minimum: 0, maximum: 100, increment: 5, value: 25 });
  row += 5;

  // The comparative slots: the same feature authored by the app, right
  // under this library's, so the returned file carries both archives.
  head(check(), "YOUR TURN — rule: apply the rule \"greater than 5 → green fill\" yourself to the three C cells below with Conditional Highlighting (Betinget fremhævning). Then the app's rule can be compared with the library's, field by field.");
  for (const [i, v] of [3, 7, 9].entries()) table.setCell(row + i, 2, v);
  row += 4;

  head(check(), "YOUR TURN — pop-up menu: give the yellow C cell below a pop-up menu yourself with the items Red, Green and Blue, via Format → Cell → Pop-Up Menu (Formatér → Celle → Lokalmenu).");
  table.setCellFormatting(row, 2, { fill: colorFill(SOFTYELLOW.r, SOFTYELLOW.g, SOFTYELLOW.b) });
  row += 2;

  head(check(), "The colors from the checks above must be there ALREADY when the document opens, and the numbers in C must be RIGHT-ALIGNED immediately — including 3, 2, 60 and 25 — without you touching any cell. Otherwise: write which cells were affected.");
  head(check(), "The pop-up menus in column D were themselves written by the library — choose \"OK\", \"Deviation\" or \"Not sure\" next to each check.");
  row += 1;

  for (const r of verdictRows) {
    table.setCell(r, 3, "— choose —");
    table.setCellControl(r, 3, {
      widget: "popupMenu",
      items: ["— choose —", "OK", "Deviation", "Not sure"],
      value: "— choose —",
    });
  }
  if (table.rowCount > row) table.deleteRows(row, table.rowCount - row);
  return doc.save();
}

// -------------------------------------- demo 8: sheets, tables, filter

function demoStructure(): Uint8Array {
  const doc = NumbersDocument.load(
    new Uint8Array(
      readFileSync(new URL("../fixtures/olekristensen-v26.3-mac-filters.numbers", import.meta.url)),
    ),
  );
  const check = counter("N");

  // The read-me sheet, moved first. Its table comes with the cloned
  // sheet and is renamed, so the two tables never share a name.
  const readme = doc.addSheet({ name: "READ ME" });
  const table = doc.tablesOnSheet(readme.id)[0] ?? doc.addTable(readme.id, { name: "Instructions" });
  table.name = "Instructions";
  table.clearAllCells();
  if (table.rowCount < 13) table.insertRows(table.rowCount, 13 - table.rowCount);
  table.setColumnWidth(0, 44);
  table.setColumnWidth(1, 300);
  table.setColumnWidth(2, 120);
  let row = 0;
  table.setCell(row, 0, "ID");
  table.setCell(row, 1, "Check");
  table.setCell(row, 2, "Notes");
  row++;
  table.setCell(row, 0, "DEMO 8");
  table.setCell(row, 1, "Sheets, tables and filters — this is your own filter document from the measurements, edited by the library. Notes in column C.");
  table.setCellFormatting(row, 1, { textWrap: true });
  row += 2;
  const head = (id: string, text: string): void => {
    table.setCell(row, 0, id);
    table.setCell(row, 1, text);
    table.setCellFormatting(row, 1, { textWrap: true });
    row++;
  };
  head(check(), "The document must OPEN on this tab (\"READ ME\"), which the library created and moved first in the sheet order. If it opened on another tab, the stored tab selection did not take — write which tab opened.");
  head(check(), "The sheet with the data has been renamed to \"Data (renamed)\", and its table renamed from \"Table 1\" to \"Measurements\". This table here is named \"Instructions\". If you still see an old name, the rename did not go through.");
  head(check(), "The data table's filter (B > 10 AND C contains \"ko\") is TURNED OFF by the library — all 10 data rows must therefore be visible.");
  head(check(), "Column A in \"Measurements\" has been rewritten by the library. If it still says \"SEED · filter rules\" up there, the rewrite did not go through.");
  head(check(), "YOUR TURN — sheet: create a new sheet yourself with ⊕, rename it to \"Your sheet\", and LEAVE IT AS THE ACTIVE sheet when you save. Then the file shows how the app itself writes a sheet and remembers the selected tab.");
  head(check(), "YOUR TURN — filter: turn the filter in \"Measurements\" back ON via Organize → Filter (Organisér → Filtrér) before you save — only the koral, koks and kobolt rows should be visible. Then the file shows the app's own enabled filter state.");
  if (table.rowCount > row + 1) table.deleteRows(row + 1, table.rowCount - row - 1);

  const dataSheetIndex = doc.sheets().findIndex((s) => s.id !== readme.id);
  doc.renameSheet(dataSheetIndex, "Data (renamed)");
  const dataTable = doc.tablesOnSheet(doc.sheets()[dataSheetIndex]!.id)[0]!;
  dataTable.name = "Measurements";
  // The seed-era instructions once needed a very wide A column; the
  // rewritten notes do not, and the table has to read on a phone.
  dataTable.setColumnWidth(0, 280);
  dataTable.setColumnWidth(1, 70);
  dataTable.setColumnWidth(2, 90);
  // The seed's send-back instructions are long gone; say what the column
  // means now instead of letting them sit stale next to the data.
  dataTable.setCell(0, 0, "notes");
  dataTable.setCell(1, 0, "B and C are your own values from the measurements, untouched.");
  dataTable.setCell(2, 0, "The filter (B > 10 and C contains \"ko\") is turned off.");
  dataTable.setCell(3, 0, "With the filter on: only the koral, koks and kobolt rows.");
  for (let r = 4; r <= 8; r++) dataTable.setCell(r, 0, "");
  for (const r of [1, 2, 3]) dataTable.setCellFormatting(r, 0, { textWrap: true });

  doc.moveSheet(doc.sheets().findIndex((s) => s.id === readme.id), 0);
  doc.setActiveSheet(0);

  for (const sheet of doc.sheets()) {
    for (const t of doc.tablesOnSheet(sheet.id)) {
      const rows = t.filterSets().rows;
      if (rows && rows.rules().length > 0) rows.setEnabled(false);
    }
  }
  return doc.save();
}

// ------------------------------------------------------ demo 9: slides

function demoSlides(): Uint8Array {
  const doc = KeynoteDocument.blank();
  const check = counter("K");
  // Slide 5 is genuinely created second and moved last at the end, so its
  // note tells the truth about its own history.
  while (doc.slideCount() < 4) doc.addSlide({ copyOf: 0, withContent: true });
  doc.duplicateSlide(2);
  const ids: string[] = [check(), check(), check(), check(), check()];
  const slides = doc.slides();
  const content: { title: string; body: string; notes: string }[] = [
    {
      title: "DEMO 9 · Slides",
      body: "Five slides, all built by the library.\nThe instructions are in the presenter notes — write your feedback there.",
      notes: `${ids[0]} · This slide's title and body text were set by the library, on a slide deep-copied from the layout. EXPECTED: a title + two lines of body text, in the theme's typography. Write feedback here in the notes.`,
    },
    {
      title: "Slide 2 · copied content",
      body: "This slide and the next are built identically.",
      notes: `${ids[1]} · Slide 3 is a DUPLICATE of this slide, made with duplicateSlide — the two must look identical (apart from the titles, which were edited afterwards). EXPECTED: no visible difference in layout.`,
    },
    {
      title: "Slide 3 · the duplicate",
      body: "This slide and the previous one are built identically.",
      notes: `${ids[2]} · This duplicate had its title edited after the copy. EXPECTED: identical to slide 2 apart from the title.`,
    },
    {
      title: "Slide 4 · skipped",
      body: "This slide is marked as skipped.",
      notes: `${ids[3]} · Slide 4 is marked as skipped: in the navigator it must appear collapsed/struck through, and it must NOT be shown when you play the show.`,
    },
    {
      title: "Slide 5 · moved here",
      body: "This slide was created as number 2 and moved last with moveSlide.",
      notes: `${ids[4]} · This slide was created as number 2 and moved last by the library. EXPECTED: exactly this order — the demo title slide first, this slide last. Thanks! Save and return the file.`,
    },
  ];
  // Authoring order: [title slide, slide5(!), slide2, slide3=duplicate of slide2, slide4].
  const order = [0, 4, 1, 2, 3];
  for (const [at, slide] of slides.entries()) {
    const c = content[order[at]!]!;
    slide.title = c.title;
    slide.body = c.body;
    slide.notes = c.notes;
  }
  doc.moveSlide(1, 4); // the promised move: created second, shown last
  doc.slides()[3]!.isSkipped = true;
  return doc.save();
}

// ------------------------------------------------- demo 10: animations

function demoBuilds(): Uint8Array {
  const doc = KeynoteDocument.load(
    new Uint8Array(
      readFileSync(new URL("../fixtures/olekristensen-v26.3-mac-builds-effects.key", import.meta.url)),
    ),
  );
  const check = counter("B");
  const slides = doc.slides();

  const build = slides[0]!.builds()[0]!;
  build.set({ duration: 3, delay: 1 });
  slides[0]!.notes =
    `${check()} · This is your own animation document from the measurements. The library has RETIMED this slide's Dissolve (Opløs) build: duration 3 s, delay 1 s (before: 1 s / 0 s). EXPECTED: the Animate panel shows the new numbers, and playback feels slower.`;

  const second = slides[1]!;
  const removed = second.builds()[0];
  if (removed) second.removeBuild(removed.id);
  second.notes =
    `${check()} · The library has REMOVED this slide's Move In (Flyt ind) build. EXPECTED: the text is still there, but the Animate panel shows no effect, and it appears without animation when you play.`;

  slides[2]!.notes =
    `${check()} · This slide is untouched (Anvil (Ambolt), by paragraph, two steps). EXPECTED: everything as you built it. Thanks! Save and return the file.`;
  return doc.save();
}

// ------------------------------------------------------ write + verify

interface Demo {
  name: string;
  bytes: Uint8Array;
  check: (bytes: Uint8Array) => void;
}

/** The feedback line's grey-italic style must rule nothing past its own paragraph. */
function assertNoFeedbackBleed(d: PagesDocument): void {
  for (const p of d.paragraphs()) {
    if (!p.text.startsWith("→ Feedback:")) continue;
    const styleId = d.body.characterStyleIdAt(p.start);
    if (styleId === undefined) throw new Error("feedback line lost its styling");
    for (const run of d.body.characterStyleRuns()) {
      if (run.objectId === styleId && run.start >= p.end) {
        throw new Error(`feedback style bleeds to ${run.start}`);
      }
    }
  }
}

const outDir = process.argv[2] ?? "out";
mkdirSync(outDir, { recursive: true });

const demos: Demo[] = [
  {
    name: "demo-01-tekst.pages",
    bytes: demoText(),
    check: (bytes) => {
      const d = PagesDocument.load(bytes);
      assertNoFeedbackBleed(d);
      if (!d.bodyText.includes("T-15")) throw new Error("tekst: checks missing");
      const offIndex = d.paragraphs().findIndex((p) => p.text.startsWith("A rule above and below, with an explicit"));
      const offStyle = d.body.sheet()!.style(d.paragraph(offIndex).styleId!)!;
      if (offStyle.resolved().paragraph.ruleOffset !== 12) throw new Error("tekst: ruleOffset missing");
      if (d.paragraphStyles().every((s) => s.name !== "Demo Emphasis")) throw new Error("tekst: created style missing");
      const rtl = d.paragraphs().findIndex((p) => /[֐-׿]/.test(p.text));
      if (d.body.paragraphDirection(rtl) !== "rtl") throw new Error("tekst: rtl missing");
      const rtlCount = d.paragraphs().filter((_, i) => d.body.paragraphDirection(i) === "rtl").length;
      if (rtlCount !== 1) throw new Error(`tekst: rtl rules ${rtlCount} paragraphs, expected 1`);
    },
  },
  {
    name: "demo-02-felter.pages",
    bytes: demoFields(),
    check: (bytes) => {
      const d = PagesDocument.load(bytes);
      assertNoFeedbackBleed(d);
      if (d.sections().length !== 3) throw new Error("felter: expected 3 sections");
      if (d.placeholders().length !== 1) throw new Error("felter: expected 1 live placeholder");
      if (d.footnotes().length !== 1) throw new Error("felter: expected a footnote");
      if (d.comments().length !== 1) throw new Error("felter: expected a comment");
      if (d.bookmarks().length !== 1) throw new Error("felter: expected a bookmark");
      if (d.body.dateFields().length !== 1) throw new Error("felter: expected a date field");
    },
  },
  {
    name: "demo-03-billeder.pages",
    bytes: demoMedia(),
    check: (bytes) => {
      const d = PagesDocument.load(bytes);
      assertNoFeedbackBleed(d);
      if (d.images().length < 5) throw new Error(`billeder: expected 5 images, got ${d.images().length}`);
      if (!d.images().some((i) => i.hasMask)) throw new Error("billeder: crop missing");
      if (!d.images().some((i) => i.fileName?.endsWith(".pdf"))) throw new Error("billeder: pdf missing");
      const withImage = d.paragraphs().filter((p) => p.text.includes("￼"));
      if (withImage.some((p) => p.text.trim() !== "￼")) throw new Error("billeder: image shares a paragraph with text");
    },
  },
  {
    name: "demo-04-diagram.pages",
    bytes: demoChart(),
    check: (bytes) => {
      const d = PagesDocument.load(bytes);
      assertNoFeedbackBleed(d);
      const chart = d.charts()[0];
      if (!chart) throw new Error("diagram: chart missing");
      if (chart.rowNames()[0] !== "Series 2025") throw new Error("diagram: data edit missing");
      if (!d.bodyText.includes("D-01")) throw new Error("diagram: checks missing");
    },
  },
  {
    name: "demo-05-celler.numbers",
    bytes: demoCells(),
    check: (bytes) => {
      const d = NumbersDocument.load(bytes);
      const t = d.tables()[0]!;
      if (t.merges().length !== 1) throw new Error("celler: merge missing");
      if (!t.cellText(1, 0).includes("DEMO 5")) throw new Error("celler: intro missing");
    },
  },
  {
    name: "demo-06-formler.numbers",
    bytes: demoFormulas(),
    check: (bytes) => {
      const d = NumbersDocument.load(bytes);
      assertPhoneLayout(d, "formler");
      const formulas = d.tables().flatMap((t) => t.formulas().map((f) => ({ table: t, ...f })));
      if (formulas.length < 8) throw new Error(`formler: expected 8+, got ${formulas.length}`);
      const cross = formulas.filter((f) => f.formula.includes("::"));
      if (cross.length !== 2) throw new Error(`formler: expected 2 cross-table references, got ${cross.length}`);
      // A whole-column span from inside its own column is circular; the
      // returned first round showed exactly that as #ERROR.
      for (const f of formulas) {
        const span = /\(([A-Z])\)/.exec(f.formula);
        if (span && f.column === span[1]!.charCodeAt(0) - 65) {
          throw new Error(`formler: ${f.formula} sits inside its own span column`);
        }
      }
      // The second table is built clean, not as a content copy.
      const crossCheck = d.tables().find((t) => t.name === "CrossCheck");
      if (!crossCheck) throw new Error("formler: CrossCheck missing");
      for (const cell of crossCheck.cells()) {
        if (crossCheck.cellText(cell.row, cell.column).includes("F-0")) {
          throw new Error("formler: CrossCheck carries copied check texts");
        }
      }
    },
  },
  {
    name: "demo-07-regler.numbers",
    bytes: demoRules(),
    check: (bytes) => {
      const d = NumbersDocument.load(bytes);
      assertPhoneLayout(d, "regler");
      const t = d.tables()[0]!;
      if (t.conditionalStyleSets().size < 3) throw new Error("regler: conditional sets missing");
      if (t.controls().size < 4) throw new Error("regler: controls missing");
      // Every rule-keyed cell must be in the engine's dependency ledger,
      // or the app shows the rule but never evaluates it (round one).
      const keyed = new Set<string>();
      for (let r = 0; r < t.rowCount; r++) {
        for (let c = 0; c < t.columnCount; c++) {
          if (t.conditionalStyleKey(r, c) !== undefined) keyed.add(`${r},${c}`);
        }
      }
      const registered = new Set<string>();
      for (const { obj } of d.store.allObjects()) {
        if (obj.type !== FORMULA_OWNER_DEPENDENCIES) continue;
        if (obj.message.getUint(FormulaOwnerFields.OWNER_KIND) !== OwnerKind.CONDITIONAL_STYLE) continue;
        const tiled = obj.message.getMessage(FormulaOwnerFields.TILED_CELL_DEPENDENCIES);
        for (const ref of tiled?.getMessages(TiledDependenciesFields.TILES) ?? []) {
          const tile = d.store.resolve(ref);
          for (const rec of tile?.message.getMessages(CellRecordTileFields.CELL_RECORDS) ?? []) {
            registered.add(
              `${rec.getUint(CellRecordExpandedFields.ROW)},${rec.getUint(CellRecordExpandedFields.COLUMN)}`,
            );
          }
        }
      }
      for (const cell of keyed) {
        if (!registered.has(cell)) throw new Error(`regler: rule cell ${cell} not in engine ledger`);
      }
    },
  },
  {
    name: "demo-08-struktur.numbers",
    bytes: demoStructure(),
    check: (bytes) => {
      const d = NumbersDocument.load(bytes);
      assertPhoneLayout(d, "struktur");
      if (d.sheets()[0]!.name !== "READ ME") throw new Error("struktur: readme sheet not first");
      const anyEnabled = d
        .tables()
        .some((t) => (t.filterSets().rows?.rules().length ?? 0) > 0 && t.filterSets().rows!.enabled);
      if (anyEnabled) throw new Error("struktur: filter still enabled");
      const names = d.tables().map((t) => t.name);
      if (new Set(names).size !== names.length) {
        throw new Error(`struktur: table names not distinct: ${names.join(", ")}`);
      }
      if (!names.includes("Measurements") || !names.includes("Instructions")) {
        throw new Error(`struktur: expected renamed tables, got ${names.join(", ")}`);
      }
      const data = d.tables().find((t) => t.name === "Measurements")!;
      for (let r = 0; r < data.rowCount; r++) {
        if (data.cellText(r, 0).includes("SEED")) throw new Error("struktur: stale seed text");
      }
      const readmeId = d.sheets()[0]!.id;
      for (const { obj } of d.store.allObjects()) {
        if (d.store.typeNameOf(obj) !== "TN.SheetSelectionArchive") continue;
        const ref = obj.message.getMessage(1)?.getVarint(1);
        if (ref !== readmeId) throw new Error("struktur: a sheet selection still names another sheet");
      }
    },
  },
  {
    name: "demo-09-lysbilleder.key",
    bytes: demoSlides(),
    check: (bytes) => {
      const d = KeynoteDocument.load(bytes);
      if (d.slideCount() !== 5) throw new Error("lysbilleder: expected 5 slides");
      if (!d.slides()[3]!.isSkipped) throw new Error("lysbilleder: skip flag missing");
      if (!d.allNotes().every((n) => n.notes.length > 0)) throw new Error("lysbilleder: notes missing");
    },
  },
  {
    name: "demo-10-animationer.key",
    bytes: demoBuilds(),
    check: (bytes) => {
      const d = KeynoteDocument.load(bytes);
      const info = d.slides()[0]!.builds()[0]!.read();
      if (info.duration !== 3 || info.delay !== 1) throw new Error("animationer: retime missing");
      if (d.slides()[1]!.builds().length !== 0) throw new Error("animationer: removal missing");
    },
  },
  {
    name: "demo-11-skygger.pages",
    bytes: demoShadows(),
    check: (bytes) => {
      const d = PagesDocument.load(bytes);
      assertNoFeedbackBleed(d);
      if (!d.bodyText.includes("S-11")) throw new Error("skygger: checks missing");
      if (d.images().length !== 22) throw new Error(`skygger: expected 22 images, got ${d.images().length}`);
      // The floats' own styles — the theme's presets carry shadows too.
      const handles = [0, 1].flatMap(
        (page) => d.floatingDrawables(page)?.drawables().map((f) => f.style()!) ?? [],
      );
      const styles = handles.map((h) => h.read());
      if (styles.length !== 11) throw new Error(`skygger: expected 11 floats, got ${styles.length}`);
      const enabled = styles.filter((s) => s.shadow?.enabled === true).length;
      if (enabled !== 9) throw new Error(`skygger: expected 9 enabled shadows, got ${enabled}`);
      if (!styles.some((s) => s.shadow?.enabled === false)) throw new Error("skygger: disabled shadow missing");
      if (!styles.some((s) => s.shadow?.type === ShadowType.CONTACT)) throw new Error("skygger: contact type missing");
      if (!styles.some((s) => s.shadow?.type === ShadowType.CURVED)) throw new Error("skygger: curved type missing");
      if (!styles.some((s) => s.reflection === 0.5)) throw new Error("skygger: reflection missing");
      // The crash laws: every shadow written whole, every override style
      // anonymous and parented — the app aborts over anything less when
      // its inspector edits one.
      for (const s of styles) {
        if (!s.shadow) continue;
        for (const key of ["color", "angle", "offset", "radius", "opacity", "enabled", "type"] as const) {
          if (s.shadow[key] === undefined) throw new Error(`skygger: shadow missing ${key}`);
        }
        if (s.shadow.color?.space === undefined) throw new Error("skygger: shadow colour names no space");
      }
      for (const h of handles) {
        const sup = h.object.message.getMessage(1);
        if (sup?.getString(2) !== undefined) throw new Error("skygger: override style kept an identifier");
        if (sup?.getMessage(3) === undefined) throw new Error("skygger: override style has no parent");
      }
    },
  },
];

for (const demo of demos) {
  const path = join(outDir, demo.name);
  writeFileSync(path, demo.bytes);
  demo.check(new Uint8Array(readFileSync(path)));
  console.log(`${demo.name}: ${demo.bytes.length} bytes, self-check passed`);
}
