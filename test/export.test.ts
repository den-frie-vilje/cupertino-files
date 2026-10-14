import { readFileSync } from "node:fs";
import { describe, expect, it } from "./harness.ts";
import { KeynoteDocument } from "../src/keynote/document.ts";
import { NumbersDocument } from "../src/numbers/document.ts";
import { PagesDocument } from "../src/pages/document.ts";
import { IWorkDocument } from "../src/tsa/document.ts";
import { refId } from "../src/tsp/schema.ts";
import { blockPng } from "../scripts/png.ts";
import { inlineText, parseMarkdown } from "../src/tsa/markdown-parser.ts";

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
    expect(again.startsWith("# Quarterly review\n\nAn opening paragraph with bold and a [link](https://example.org).\n\n## Highlights\n\n- Revenue up\n- Costs flat\n\n1. First step\n2. Second step\n\nRemember the caveat")).toBe(true);
  });

  it("gives Keynote a slide per heading with the body's lines and quoted notes", () => {
    const doc = KeynoteDocument.load(KeynoteDocument.fromMarkdown(SOURCE).save());
    const slides = doc.slides();
    expect(slides.map((s) => s.title)).toEqual(["Quarterly review", "Highlights", "Numbers"]);
    expect(slides[0]!.body).toBe("An opening paragraph with bold and a link.");
    expect(slides[1]!.body).toBe("Revenue up\nCosts flat\nFirst step\nSecond step");
    expect(slides[1]!.notes).toBe("Remember the caveat");
    expect(slides[2]!.body).toBe("");
    const table = doc.tables()[0]!;
    expect([doc.tables().length, table.cellText(1, 0), table.cellValue(2, 1)?.type]).toEqual([1, "Apples", "bool"]);
    expect(refId(table.infoObject!.message.getMessage(1), 2)).toBe(slides[2]!.id);
    expect(doc.masterSlides().find((m) => m.id === slides[1]!.masterId)?.name).toBe("Title & Bullets");
  });

  it("gives Numbers a sheet per top heading and a table per pipe table, named by the heading above", () => {
    const doc = NumbersDocument.load(NumbersDocument.fromMarkdown(SOURCE).save());
    expect(doc.sheets().map((s) => s.name)).toEqual(["Quarterly review"]);
    const tables = doc.tables();
    expect(tables.length).toBe(1);
    const table = tables[0]!;
    expect([table.name, table.rowCount, table.columnCount]).toEqual(["Numbers", 3, 2]);
    const two = NumbersDocument.load(NumbersDocument.fromMarkdown("# One\n\n| a |\n| --- |\n| 1 |\n\n# Two\n\n| b |\n| --- |\n| 2 |\n\n| c |\n| --- |\n| 3 |\n").save());
    expect(two.sheets().map((s) => s.name)).toEqual(["One", "Two"]);
    expect(two.tablesOnSheet(two.sheets()[1]!.id).map((t) => [t.name, t.cellText(0, 0)])).toEqual([["Table", "b"], ["Table 2", "c"]]);
    expect(table.cellText(0, 0)).toBe("Item");
    expect(table.cellValue(1, 1)).toEqual({ type: "number", value: 3, isFormula: false });
    expect(table.cellValue(2, 1)?.type).toBe("bool");
    expect(table.cellText(2, 0)).toBe("Pears, ripe");
  });
});

describe("thematic breaks", () => {
  it("start a new untitled slide in Keynote and are ignored elsewhere", () => {
    const md = "# One\n\nfirst\n\n---\n\nsecond\n\n* * *\n\n## Three\n";
    const deck = KeynoteDocument.load(KeynoteDocument.fromMarkdown(md).save());
    expect(deck.slides().map((s) => [s.title ?? "", s.body ?? ""])).toEqual([
      ["One", "first"],
      ["", "second"],
      ["Three", ""],
    ]);
    expect(PagesDocument.fromMarkdown(md).body.paragraphs().map((p) => p.text)).toEqual(["One", "first", "second", "Three"]);
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

describe("images in Markdown", () => {
  const SOURCE = "# Pictures\n\nA line.\n\n![a block](pics/block.png)\n\n## Next\n\n![missing](nowhere.png)\n\n![web](https://example.org/x.png)\n";
  const images = (src: string): Uint8Array | undefined => (src === "pics/block.png" ? blockPng(40, 30) : undefined);

  it("parses an image on a line of its own as a block", () => {
    const blocks = parseMarkdown(SOURCE).flatMap((b) => (b.kind === "image" ? [[b.alt, b.src]] : []));
    expect(blocks).toEqual([
      ["a block", "pics/block.png"],
      ["missing", "nowhere.png"],
      ["web", "https://example.org/x.png"],
    ]);
  });

  it("inlines the pictures the resolver supplies and skips the rest", () => {
    const pages = PagesDocument.load(PagesDocument.fromMarkdown(SOURCE, { images }).save());
    expect(pages.images().length).toBe(1);
    expect(pages.body.text.split("\uFFFC").length).toBe(2);
    const deck = KeynoteDocument.load(KeynoteDocument.fromMarkdown(SOURCE, { images }).save());
    expect(deck.slides()[0]!.drawables().filter((d) => d.object.type === 3005).length).toBe(1);
    expect(deck.slides()[1]!.drawables().filter((d) => d.object.type === 3005).length).toBe(0);
  });
});

describe("pictures and anchored tables in the export", () => {
  it("renders a Pages body's inline table and picture where they sit, and writes the picture through the sink", () => {
    const doc = PagesDocument.blank();
    doc.appendParagraph("Before.", "Body");
    doc.appendTable([["k", "v"], ["a", "1"]], "Facts");
    doc.appendParagraph("Between.", "Body");
    doc.insertInlineImage(doc.bodyText.length, blockPng(20, 10), { fileName: "dot.png" });
    const written: string[] = [];
    const md = PagesDocument.load(doc.save()).toMarkdown({
      images: ({ fileName, data }) => {
        written.push(`${fileName}:${data.length}`);
        return `assets/${fileName}`;
      },
    });
    const order = ["Before.", "### Facts", "| k | v |", "Between.", "![dot.png](assets/dot.png)"].map((s) => md.indexOf(s));
    expect(order.every((i, n) => i >= 0 && (n === 0 || i > order[n - 1]!))).toBe(true);
    expect(written).toEqual([`dot.png:${blockPng(20, 10).length}`]);
    expect(PagesDocument.load(doc.save()).toMarkdown().includes("![")).toBe(false);
  });

  it("puts a slide's picture and table under its heading", () => {
    const doc = KeynoteDocument.blank();
    doc.slides()[0]!.title = "First";
    const second = doc.addSlide({ master: "Title & Bullets" });
    second.title = "Second";
    second.addTable({ rows: [["x"], ["9"]], name: "Nums" });
    doc.addImage(1, blockPng(20, 10), { fileName: "dot.png", x: 10, y: 10 });
    const md = KeynoteDocument.load(doc.save()).toMarkdown({ images: ({ fileName }) => fileName });
    const first = md.indexOf("## 1. First");
    const secondAt = md.indexOf("## 2. Second");
    expect(first >= 0 && secondAt > first).toBe(true);
    expect(md.indexOf("![dot.png](dot.png)") > secondAt).toBe(true);
    expect(md.indexOf("### Nums") > secondAt).toBe(true);
  });
});

describe("links and footnotes", () => {
  it("lifts links and references out of a run by offset", () => {
    const run = inlineText("  See **the** [docs](https://x.org/d) now[^a] and ![pic](p.png).");
    expect(run.text).toBe("See the docs now and pic.");
    expect(run.links).toEqual([{ start: 8, end: 12, url: "https://x.org/d" }]);
    expect(run.footnotes).toEqual([{ index: 16, label: "a" }]);
  });

  it("round-trip through Pages as hyperlinks and footnotes", () => {
    const md = "# Notes\n\nSee [the site](https://example.org/a) for more[^1]. Then [again](https://example.org/b).\n\n- an [item link](https://example.org/c)\n\n[^1]: The note text.\n";
    const doc = PagesDocument.load(PagesDocument.fromMarkdown(md).save());
    expect(doc.body.links().map((l) => [doc.body.text.slice(l.start, l.end), l.url])).toEqual([
      ["the site", "https://example.org/a"],
      ["again", "https://example.org/b"],
      ["item link", "https://example.org/c"],
    ]);
    const notes = doc.footnotes();
    expect(notes.length).toBe(1);
    expect(notes[0]!.storage.text.trim().endsWith("The note text.")).toBe(true);
    expect(doc.body.text.slice(notes[0]!.anchorIndex - 4, notes[0]!.anchorIndex)).toBe("more");
    expect(doc.toMarkdown()).toBe(
      "# Notes\n\nSee [the site](https://example.org/a) for more[^1]. Then [again](https://example.org/b).\n\n- an [item link](https://example.org/c)\n\n[^1]: The note text.",
    );
  });
});
