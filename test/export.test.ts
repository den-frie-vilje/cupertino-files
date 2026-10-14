import { readFileSync } from "node:fs";
import { describe, expect, it } from "./harness.ts";
import { KeynoteDocument } from "../src/keynote/document.ts";
import { NumbersDocument } from "../src/numbers/document.ts";
import { PagesDocument } from "../src/pages/document.ts";
import { IWorkDocument } from "../src/tsa/document.ts";

const FIXTURES = new URL("../fixtures/", import.meta.url);
const fixture = (name: string) => new Uint8Array(readFileSync(new URL(name, FIXTURES)));

describe("Markdown export", () => {
  it("renders a Pages body with its title as a heading and its paragraphs", () => {
    const md = PagesDocument.load(fixture("patrickomatic-pages26-sections-masks.pages")).toMarkdown();
    expect(md.includes("# Eternal Shine")).toBe(true);
    expect(md.includes("Author Name")).toBe(true);
    expect(/\n{3,}/.test(md)).toBe(false);
  });

  it("renders Numbers sheets as sections and tables as pipe tables", () => {
    const doc = NumbersDocument.blank();
    const table = doc.tables()[0]!;
    table.setCell(1, 1, "a | b");
    table.setCell(2, 1, 42);
    const md = doc.toMarkdown();
    const sheet = doc.sheets()[0]!;
    expect(md.startsWith(`## ${sheet.name}`)).toBe(true);
    expect(md.includes(`### ${table.name}`)).toBe(true);
    expect(md.includes("a \\| b")).toBe(true);
    expect(md.includes("| 42 |")).toBe(true);
    const lines = md.split("\n");
    const header = lines.findIndex((l) => l.startsWith("| ---"));
    expect(header > 0 && lines[header - 1]!.startsWith("|")).toBe(true);
  });

  it("renders a Keynote deck slide by slide with list bodies and quoted notes", () => {
    const doc = KeynoteDocument.blank();
    const slide = doc.slides()[0]!;
    slide.title = "Hello";
    slide.body = "First\nSecond";
    slide.notes = "Say hi\nthen pause";
    const md = doc.toMarkdown();
    expect(md.startsWith("## 1. Hello")).toBe(true);
    expect(md.includes("First")).toBe(true);
    expect(md.includes("> Say hi\n> then pause")).toBe(true);
  });

  it("opens any kind through IWorkDocument and renders every corpus document without throwing", () => {
    for (const name of ["iwork-mcp-v14.5-sample.pages", "zenodo-v26.0-ios-writer.key", "numbers-parser-v26.0-categories.numbers"]) {
      const md = IWorkDocument.open(fixture(name)).toMarkdown();
      expect(md.length > 0).toBe(true);
    }
  });
});

describe("CSV export", () => {
  it("quotes fields holding commas, quotes or line breaks and leaves the rest bare", () => {
    const doc = NumbersDocument.blank();
    const table = doc.tables()[0]!;
    table.setCell(1, 0, "plain");
    table.setCell(1, 1, "a, b");
    table.setCell(2, 0, 'say "hi"');
    table.setCell(2, 1, "two\nlines");
    table.setCell(3, 0, 3.5);
    const lines = table.toCsv().split("\n");
    expect(lines[1]).toBe('plain,"a, b"');
    expect(lines[2]).toBe('"say ""hi""","two');
    expect(lines[3]).toBe('lines"');
    expect(lines[4]!.startsWith("3.5,")).toBe(true);
    expect(lines.length).toBe(table.rowCount + 1);
  });
});

describe("building from Markdown", () => {
  const SOURCE = [
    "# Quarterly review",
    "",
    "An opening paragraph with **bold** and a [link](https://example.org).",
    "",
    "## Highlights",
    "",
    "- Revenue up",
    "- Costs flat",
    "",
    "1. First step",
    "2. Second step",
    "",
    "> Remember the caveat",
    "",
    "## Numbers",
    "",
    "| Item | Count |",
    "| --- | --- |",
    "| Apples | 3 |",
    "| Pears, ripe | TRUE |",
    "",
  ].join("\n");

  it("gives Pages the template's heading, body and list styles, and survives a round trip", () => {
    const doc = PagesDocument.fromMarkdown(SOURCE);
    const styles = doc.body.paragraphs().map((p) => {
      const h = doc.body.paragraph(p.index);
      return `${h.styleName}/${h.listStyleName}`;
    });
    expect(styles.slice(0, 8)).toEqual([
      "Title/None",
      "Body/None",
      "Heading/None",
      "Body/Bullet",
      "Body/Bullet",
      "Body/Numbered",
      "Body/Numbered",
      "Body/None",
    ]);
    expect(doc.body.paragraphs()[1]!.text).toBe("An opening paragraph with bold and a link.");
    const again = PagesDocument.load(doc.save()).toMarkdown();
    expect(again.startsWith("# Quarterly review\n\nAn opening paragraph with bold and a link.\n\n## Highlights\n\n- Revenue up\n- Costs flat\n\n1. First step\n2. Second step\n\nRemember the caveat")).toBe(true);
  });

  it("gives Keynote a slide per heading with the body's lines and quoted notes", () => {
    const doc = KeynoteDocument.load(KeynoteDocument.fromMarkdown(SOURCE).save());
    const slides = doc.slides();
    expect(slides.map((s) => s.title)).toEqual(["Quarterly review", "Highlights", "Numbers"]);
    expect(slides[0]!.body).toBe("An opening paragraph with bold and a link.");
    expect(slides[1]!.body).toBe("Revenue up\nCosts flat\nFirst step\nSecond step");
    expect(slides[1]!.notes).toBe("Remember the caveat");
    expect(slides[2]!.body).toBe("Item\tCount\nApples\t3\nPears, ripe\tTRUE");
    expect(doc.masterSlides().find((m) => m.id === slides[1]!.masterId)?.name).toBe("Title & Bullets");
  });

  it("gives Numbers a table per pipe table, named by the heading above and sized to its rows", () => {
    const doc = NumbersDocument.load(NumbersDocument.fromMarkdown(SOURCE).save());
    const tables = doc.tables();
    expect(tables.length).toBe(1);
    const table = tables[0]!;
    expect([table.name, table.rowCount, table.columnCount]).toEqual(["Numbers", 3, 2]);
    expect(table.cellText(0, 0)).toBe("Item");
    expect(table.cellValue(1, 1)).toEqual({ type: "number", value: 3, isFormula: false });
    expect(table.cellValue(2, 1)?.type).toBe("bool");
    expect(table.cellText(2, 0)).toBe("Pears, ripe");
  });
});

describe("building from CSV", () => {
  it("reads quoted fields and round-trips through toCsv", () => {
    const csv = 'Name,Note,Score\nAda,"says ""hi""",9.5\n"Lin, Bo","two\nlines",7\n';
    const doc = NumbersDocument.load(NumbersDocument.fromCsv(csv, "Scores").save());
    const table = doc.tables()[0]!;
    expect([table.name, table.rowCount, table.columnCount]).toEqual(["Scores", 3, 3]);
    expect(table.cellText(1, 1)).toBe('says "hi"');
    expect(table.cellText(2, 0)).toBe("Lin, Bo");
    expect(table.toCsv()).toBe(csv.trimEnd());
  });
});
