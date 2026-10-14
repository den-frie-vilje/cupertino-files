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
