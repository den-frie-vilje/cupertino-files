/**
 * Seed documents for manual blockers — the file carries its own
 * instructions.
 *
 * An open question in docs/BLOCKERS.md that needs a person in an app gets
 * a document staged as far as the library can take it: the data already
 * in place, and the remaining clicks written *inside* the document — as
 * cells beside the data, as presenter notes on the slide they concern, as
 * Pages comments anchored to the exact paragraph. Open, follow, save, run
 * the one command the file names. A refusal or a surprising result is a
 * finding, not a failure; every seed says so.
 *
 * The registry below is empty when nothing needs a person. To stage a new
 * question, add an entry:
 *
 *   const seeds: Seed[] = [
 *     {
 *       name: "seed-something.pages",
 *       bytes: buildSomethingSeed(),   // library-authored, instructions embedded
 *       check: (bytes) => { ... },     // reload and assert the instructions landed
 *     },
 *   ];
 *
 * Keep to the CLAUDE.md rules: regenerate fresh for every request, one
 * question per file where cheap, the expected result written into the
 * document, and name the probe/harvest command the checker should run.
 * A returned file gets probed, banked, and — when it settles something —
 * added to `fixtures/` with an ATTRIBUTION.md entry.
 *
 *   npm run seeds -- <outDir>
 *
 * The script reloads each file it wrote and asserts the instructions
 * landed, so a broken seed cannot be sent.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { KeynoteDocument, NumbersDocument, PagesDocument } from "../src/index.ts";
import { Slide } from "../src/keynote/schema.ts";
import { refId } from "../src/tsp/schema.ts";
import { Storage } from "../src/tswp/schema.ts";
import type { TableModel } from "../src/tst/tables.ts";
import { blockPng } from "./png.ts";

interface Seed {
  name: string;
  bytes: Uint8Array;
  check: (bytes: Uint8Array) => void;
}

const outDir = process.argv[2] ?? "out";

/**
 * A long instruction goes in the first content row, wrapped and sized,
 * never in the table's name or its header row: the app shows the name on
 * one unwrapped line and pins the header on every screen.
 */
function instructionRow(table: TableModel, text: string, cells: Record<number, string | number> = {}): void {
  table.insertRows(1, 1);
  table.setCell(1, 0, text);
  table.setCellFormatting(1, 0, { textWrap: true });
  table.setColumnWidth(0, 260);
  // shortcut: the height is estimated from the width at the donor's text size, until the app's fit is measured
  table.setRowHeight(1, Math.ceil(text.length / 48) * 13 + 8);
  for (const [column, value] of Object.entries(cells)) table.setCell(1, Number(column), value);
}

// ------------------------------------------------------------ inline image

function seedInlineImage(): Uint8Array {
  // An inline picture used to be drawn from the page margin rather than
  // the text column, because the drawable carried no exterior_text_wrap.
  // It now carries the in-the-text-flow one. Only the app can say whether
  // that is what the field means, and an indented body is what makes the
  // difference visible: at the page margin the picture starts to the left
  // of the words above it.
  const doc = PagesDocument.blank();
  const png = blockPng(240, 120);

  doc.appendParagraph(
    "SEED · indrykket billede (docs/BLOCKERS.md). Brødteksten herunder er rykket 113 pt ind fra sidens margen. Spørgsmålet er, hvor de to billeder starter.",
  );

  // Every paragraph first, images after: an empty paragraph appended at
  // the very end is not one paragraphs() lists, so an image placed by
  // that index lands in the paragraph before it.
  const indent = { leftIndent: 113.4 };
  const first = doc.appendParagraph(
    "FORVENTET: billedet herunder starter i SAMME lodrette linje som denne sætnings første bogstav — altså langt inde på siden, ikke ude ved sidens venstre margen. Hele denne tekst skal også stå indrykket.",
    "Body",
  );
  const firstImage = doc.appendParagraph(" ", "Body");
  const second = doc.appendParagraph(
    "FORVENTET: billedet herunder starter derimod ude ved sidens venstre margen, ikke i tekstspalten — det er skrevet med den anden tilstand, så de to billeder skal stå forskellige steder.",
    "Body",
  );
  const secondImage = doc.appendParagraph(" ", "Body");
  const last = doc.appendParagraph(
    "Kig på de to billeders venstre kant. Forskellige = begge tilstande virker. Ens = kun den ene bliver brugt, uanset hvad filen siger. Står teksten heller ikke indrykket, er dét fundet i stedet. Send filen retur uden at ændre noget.",
    "Body",
  );
  for (const index of [first, firstImage, second, secondImage, last]) {
    doc.paragraph(index).format(indent);
  }

  doc.insertInlineImage(doc.body.paragraphStarts()[firstImage]!, png, {
    fileName: "i-tekstspalten.png",
    width: 200,
    height: 100,
  });
  doc.insertInlineImage(doc.body.paragraphStarts()[secondImage]!, png, {
    fileName: "ved-sidemargenen.png",
    width: 200,
    height: 100,
    wrap: "page",
  });
  return doc.save();
}

// ---------------------------------------------------------- category

function seedCategory(): Uint8Array {
  // Every categorised table in the corpus was grouped by the app. This
  // one is grouped by the library from nothing, in the same shape; the
  // app's drawing it is the only proof that shape is enough.
  const doc = NumbersDocument.blank();
  const table = doc.tables()[0]!;
  table.name = "Category";
  table.setCell(0, 0, "Item");
  table.setCell(0, 1, "Kind");
  const rows: [string, string][] = [
    ["Pear", "Fruit"],
    ["Cat", "Animal"],
    ["Apple", "Fruit"],
    ["Bicycle", "Transport"],
    ["Dog", "Animal"],
    ["Train", "Transport"],
  ];
  rows.forEach(([item, kind], i) => {
    table.setCell(i + 1, 0, item);
    table.setCell(i + 1, 1, kind);
  });
  table.deleteRows(rows.length + 1, table.rowCount - rows.length - 1);
  instructionRow(
    table,
    "Expected: four groups, Animal, Fruit, Note and Transport, each with its rows beneath it (this row is the Note group). Flat rows or a refusal to open is the finding; comment on any cell.",
    { 1: "Note" },
  );
  table.addCategory(1);
  return doc.save();
}

// ---------------------------------------------------------- build

function seedBuild(): Uint8Array {
  // The corpus deck's builds were authored by Keynote. This one is
  // written from nothing in the same shape; only the app can say it plays.
  const doc = KeynoteDocument.blank();
  const slide = doc.slides()[0]!;
  slide.title =
    "Expected: this title dissolves in on the first click. Already there with no animation, or a refusal to open, is the finding; comment on the slide.";
  const title = refId(slide.object.message, Slide.TITLE_PLACEHOLDER);
  if (title === undefined) throw new Error("build seed: blank deck has no title placeholder");
  slide.addBuild({ drawableId: title, effect: "apple:dissolve", duration: 1 });
  return doc.save();
}

// ---------------------------------------------------------- tables

const TABLE_ROWS = [
  ["Item", "Count"],
  ["Apples", "3"],
  ["Pears", "5"],
];

function seedTablePages(): Uint8Array {
  // The neutral donor is Numbers-born; the shape audit lists seven ways
  // its archives are wired that no Pages table in the corpus shares, all
  // at the level of declared references and style listing. Only the app
  // can say whether any of them matters.
  const doc = PagesDocument.blank();
  doc.appendParagraph(
    "Expected: a 3×2 table below this line, headed Item / Count, with Apples 3 and Pears 5. No table, an empty one, or a refusal to open, is the finding; comment on this line.",
    "Body",
  );
  doc.appendTable(TABLE_ROWS);
  return doc.save();
}

function seedTableKeynote(): Uint8Array {
  const doc = KeynoteDocument.blank();
  const slide = doc.slides()[0]!;
  slide.title =
    "Expected: a 3×2 table on this slide, headed Item / Count, with Apples 3 and Pears 5. No table, an empty one, or a refusal to open, is the finding; comment on the slide.";
  slide.addTable({ rows: TABLE_ROWS, x: 300, y: 500 });
  return doc.save();
}

// ---------------------------------------------------------- authored twins

// Three documents that ask for nothing of this library's writing: each
// names constructs no corpus document carries app-written, and asks the
// checker to build them with the app's own controls. The returned file is
// the fixture that settles the row.

function seedAuthoredNumbers(): Uint8Array {
  const doc = NumbersDocument.blank();
  const table = doc.tables()[0]!;
  table.name = "Authored";
  table.insertColumns(2, 1);
  table.setCell(0, 0, "Item");
  table.setCell(0, 1, "Kind");
  table.setCell(0, 2, "Amount");
  const rows: [string, string, number][] = [["Pear", "Fruit", 12], ["Cat", "Animal", 3], ["Apple", "Fruit", 7], ["Train", "Transport", 40], ["Dog", "Animal", 10], ["Bicycle", "Transport", 2]];
  rows.forEach(([item, kind, amount], i) => {
    table.setCell(i + 1, 0, item);
    table.setCell(i + 1, 1, kind);
    table.setCell(i + 1, 2, amount);
  });
  table.deleteRows(rows.length + 1, table.rowCount - rows.length - 1);
  instructionRow(
    table,
    "Please build these with Numbers' own controls, then send the file back: 1) a filter rule on Item that is not a comparison, for example 'starts with' or 'is blank' (Organise > Filter / Organiser > Filter); 2) a category on Kind (Organise > Categories / Kategorier) and then a summary in one of its group rows, such as Count or Sum of Amount; 3) a second table with Insert > Table (Indsaet > Tabel); 4) a comment on any cell. Nothing here is expected to look any particular way; what you build is the measurement.",
    { 1: "Note", 2: 0 },
  );
  return doc.save();
}

function seedAuthoredPages(): Uint8Array {
  const doc = PagesDocument.blank();
  doc.appendParagraph("Please build each of these with Pages' own controls, right below its line, then send the file back. Nothing here is expected to look any particular way; what you build is the measurement.", "Body");
  doc.appendParagraph("1) Insert > Table (Indsaet > Tabel), here:", "Body");
  doc.appendParagraph("", "Body");
  doc.appendParagraph("2) Insert > Text Box (Tekstfelt), anywhere on this page.", "Body");
  doc.appendParagraph("3) Draw a shape, then Arrange > Section Masters > Move Object to Section Master (Arranger > Sektionsmastere > Flyt objekt til sektionsmaster), so it repeats on every page.", "Body");
  doc.appendParagraph("4) Insert > Page Break (Sideskift), right after this line.", "Body");
  doc.appendParagraph("5) Select the word twin in this line and add a comment on it: the twin.", "Body");
  return doc.save();
}

function seedAuthoredKeynote(): Uint8Array {
  const doc = KeynoteDocument.blank();
  const first = doc.slides()[0]!;
  first.title = "Please build each of these with Keynote's own controls, on the slide that asks, then send the deck back.";
  first.body = "Nothing here is expected to look any particular way; what you build is the measurement.";
  const asks = [
    "2) Change this slide's layout to Title & Bullets: Format > Slide Layout (Format > Layout).",
    "3) Insert > Table (Indsaet > Tabel) on this slide.",
    "4) Insert > Text Box (Tekstfelt) on this slide, and give the slide a background colour: Format > Slide Background (Baggrund).",
    "5) Animate this title: Animate > Build In > Dissolve (Animer > Byg ind).",
  ];
  for (const ask of asks) {
    const slide = doc.addSlide({ copyOf: 0, after: doc.slideCount() - 1 });
    slide.title = ask;
  }
  return doc.save();
}

// ---------------------------------------------------------- text box

function seedTextBox(): Uint8Array {
  // A text box is a deep copy of one the document already carries, with
  // its own storage, its parent repointed and the text replaced. Whether
  // the app draws a box it did not author is the question.
  const doc = KeynoteDocument.blank();
  const slide = doc.slides()[0]!;
  slide.title =
    "Expected: a second text box saying 'Written by cupertino-files' in the lower half of this slide. No box, a box without the words, or a refusal to open, is the finding; comment on the slide.";
  slide.addTextBox("Written by cupertino-files", { x: 300, y: 650, width: 1300, height: 120 });
  return doc.save();
}

// ---------------------------------------------------------- filter

function seedFilter(): Uint8Array {
  // The corpus's one populated filter set was authored by Numbers. This
  // rule is written from nothing, byte for byte as that one; whether the
  // app hides the rows for a rule it did not author is the question.
  const doc = NumbersDocument.blank();
  const table = doc.tables()[0]!;
  // The rule sits on column C on purpose: the app's rules count their
  // column from a host column, and every measured rule sat on column 1 or
  // 2. A rule the app applies to C confirms the host is column 1; one it
  // applies to D, or to nothing, says the host is the first rule's own
  // column instead.
  table.name = "Filter";
  table.insertColumns(2, 2);
  table.setCell(0, 0, "Item");
  table.setCell(0, 1, "Colour");
  table.setCell(0, 2, "Amount");
  table.setCell(0, 3, "Note");
  const rows: [string, string, number, string][] = [["Pear", "green", 12, "a"], ["Cat", "grey", 3, "b"], ["Apple", "red", 7, "c"], ["Train", "blue", 40, "d"], ["Dog", "brown", 10, "e"]];
  rows.forEach(([item, colour, amount, note], i) => {
    table.setCell(i + 1, 0, item);
    table.setCell(i + 1, 1, colour);
    table.setCell(i + 1, 2, amount);
    table.setCell(i + 1, 3, note);
  });
  table.deleteRows(rows.length + 1, table.rowCount - rows.length - 1);
  instructionRow(
    table,
    "Expected: only the rows with Amount above 10 show (this row at 11, Pear 12 and Train 40), filter on in the panel. All rows showing, column D filtered instead, or a refusal to open, is the finding; comment on any cell.",
    { 1: "note", 2: 11, 3: "-" },
  );
  table.addFilterRule(2, { operator: ">", value: 10 });
  return doc.save();
}

const seeds: Seed[] = [
  {
    name: "seed-filter.numbers",
    bytes: seedFilter(),
    check: (bytes) => {
      const set = NumbersDocument.load(bytes).tables()[0]!.filterSets().rows;
      const rules = set?.rules() ?? [];
      if (!set?.enabled || rules.length !== 1 || rules[0]!.predicate?.operator !== ">") throw new Error("filter seed: expected one enabled > rule");
    },
  },
  {
    name: "seed-build.key",
    bytes: seedBuild(),
    check: (bytes) => {
      const slide = KeynoteDocument.load(bytes).slides()[0]!;
      const builds = slide.builds();
      if (builds.length !== 1 || builds[0]!.read().effect !== "apple:dissolve") throw new Error("build seed: expected one dissolve build");
      if (!slide.title?.includes("Expected")) throw new Error("build seed: expectations missing");
    },
  },
  {
    name: "seed-table.pages",
    bytes: seedTablePages(),
    check: (bytes) => {
      const doc = PagesDocument.load(bytes);
      const table = doc.tables()[0];
      if (!table || table.cellText(2, 0) !== "Pears") throw new Error("table seed (pages): the table or its rows are missing");
      if (!doc.bodyText.includes("Expected")) throw new Error("table seed (pages): expectations missing");
    },
  },
  {
    name: "seed-table.key",
    bytes: seedTableKeynote(),
    check: (bytes) => {
      const doc = KeynoteDocument.load(bytes);
      const table = doc.tables()[0];
      if (!table || table.cellText(2, 0) !== "Pears") throw new Error("table seed (keynote): the table or its rows are missing");
      if (!doc.slides()[0]!.title?.includes("Expected")) throw new Error("table seed (keynote): expectations missing");
    },
  },
  {
    name: "seed-authored.numbers",
    bytes: seedAuthoredNumbers(),
    check: (bytes) => {
      const doc = NumbersDocument.load(bytes);
      if (!JSON.stringify(doc.tables()[0]?.cellValue(1, 0)).includes("Please build")) throw new Error("authored seed (numbers): instructions missing");
    },
  },
  {
    name: "seed-authored.pages",
    bytes: seedAuthoredPages(),
    check: (bytes) => {
      const doc = PagesDocument.load(bytes);
      if (!doc.bodyText.includes("Please build") || !doc.bodyText.includes("5)")) throw new Error("authored seed (pages): instructions missing");
    },
  },
  {
    name: "seed-authored.key",
    bytes: seedAuthoredKeynote(),
    check: (bytes) => {
      const doc = KeynoteDocument.load(bytes);
      if (doc.slideCount() !== 5 || !doc.slides()[4]!.title?.includes("Dissolve")) throw new Error("authored seed (keynote): slides missing");
    },
  },
  {
    name: "seed-text-box.key",
    bytes: seedTextBox(),
    check: (bytes) => {
      const slide = KeynoteDocument.load(bytes).slides()[0]!;
      if (!slide.textStorages().some((s) => s.text === "Written by cupertino-files")) throw new Error("text box seed: the box's text is missing");
      if (!slide.title?.includes("Expected")) throw new Error("text box seed: expectations missing");
    },
  },
  {
    name: "seed-category.numbers",
    bytes: seedCategory(),
    check: (bytes) => {
      const table = NumbersDocument.load(bytes).tables()[0]!;
      const groups = table.activeCategories()?.groups() ?? [];
      if (groups.map((g) => g.value).join() !== "Animal,Fruit,Note,Transport") {
        throw new Error("category seed: expected four groups in text order");
      }
      if (table.staleCategoryGroups().length !== 0) throw new Error("category seed: tree disagrees with cells");
    },
  },
  {
    name: "seed-inline-image.pages",
    bytes: seedInlineImage(),
    check: (bytes) => {
      const d = PagesDocument.load(bytes);
      if (d.images().length !== 2) throw new Error("inline image: expected 2 images");
      if (!d.bodyText.includes("FORVENTET")) throw new Error("inline image: expectations missing");
      if (!d.bodyText.includes("Send filen retur")) throw new Error("inline image: return ask missing");
      // Each picture alone in its paragraph, and every paragraph but the
      // first indented — the precondition the whole check rests on.
      const paragraphs = d.paragraphs();
      const withImage = paragraphs.filter((p) => p.text.includes("￼"));
      if (withImage.length !== 2) throw new Error("inline image: pictures not in their own paragraphs");
      if (withImage.some((p) => p.text.trim() !== "￼")) {
        throw new Error("inline image: a picture shares its paragraph with text");
      }
      const sheet = d.body.sheet();
      const starts = d.body.paragraphStarts();
      const indents = starts.map((start) => {
        const id = d.body.effectiveObjectAt(Storage.TABLE_PARA_STYLE, start);
        return id === undefined ? 0 : (sheet?.style(id)?.resolved().paragraph.leftIndent ?? 0);
      });
      if (indents.slice(1).some((v) => Math.round(v) !== 113)) {
        throw new Error(`inline image: paragraphs not indented (${indents.join(", ")})`);
      }
    },
  },
];

if (seeds.length === 0) {
  console.log("no open blocker needs a seed — nothing to write");
} else {
  mkdirSync(outDir, { recursive: true });
  for (const seed of seeds) {
    const path = join(outDir, seed.name);
    writeFileSync(path, seed.bytes);
    seed.check(new Uint8Array(readFileSync(path)));
    console.log(`${seed.name}: ${seed.bytes.length} bytes, instructions verified`);
  }
}
