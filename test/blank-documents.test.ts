/**
 * Making a new document, and reclaiming what a deletion left behind.
 *
 * ## Why there is no `new PagesDocument()`
 *
 * An iWork document is dozens of interlinked archives — theme, stylesheet,
 * masters, calc-engine owners, table styles — and every one of them carries
 * identities the apps validate. Synthesising that graph is possible to
 * *write*; what is impossible is checking it, because nothing offline can
 * say whether Apple accepts an invention. This project's whole discipline
 * is not to ship unverifiable inventions.
 *
 * What is verifiable is **emptying a real document**. Every identity,
 * style and master stays exactly as an Apple app wrote it; only content
 * goes. That is what `blankFrom` does, and it is what "create a new
 * spreadsheet" means in practice — including in Numbers, where every new
 * document starts from a template.
 *
 * `blank()` is the same idea with the donor shipped in the package: a
 * corpus fixture emptied by `blankFrom` at build time (A4, 16:9 — see
 * scripts/make-blanks.ts), so "new document" needs no template file at
 * all. The app-acceptance half of that claim lives in
 * test/e2e/authoring.e2e.test.ts.
 *
 * ## The other half: compaction
 *
 * `compact()` drops archives nothing can reach. Getting it right took two
 * corrections worth remembering. The first scan read only the *first*
 * occurrence of each repeated field, so a data list looked like it held one
 * entry — it would have deleted 2050 live objects out of 2561. The second
 * wanted to delete selection archives, which nothing points at because they
 * are view state rather than content.
 *
 * What it collects today is: very little. Removing a sheet unlinks it from
 * the document tree, but the calc engine keeps references to every table it
 * ever knew, so those archives remain genuinely reachable. That is a gap in
 * *removal*, not in the collector, and the tests below say so rather than
 * papering over it.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "./harness.ts";
import { IWorkDocument, KeynoteDocument, NumbersDocument, PagesDocument } from "../src/index.ts";

const FIXTURES = new URL("../fixtures/", import.meta.url);
const bytes = (name: string) => new Uint8Array(readFileSync(new URL(name, FIXTURES)));

const NUMBERS = "numbers-parser-v26.0-categories.numbers";
const PAGES = "gomap-v26.1-newest-writer.pages";
const KEYNOTE = "zenodo-v26.1-hyperlinks-masks.key";
/** Four sheets — the one document where removing sheets has anything to reclaim. */
const MULTI_SHEET = "iwork-mcp-v14.5-earnings.numbers";

describe("blank documents", () => {
  it("Numbers: one sheet, one empty table, ready to fill", () => {
    const doc = NumbersDocument.blankFrom(bytes(NUMBERS), {
      sheetName: "Budget",
      tableName: "Items",
    });
    expect(doc.sheets().length).toBe(1);
    expect(doc.sheets()[0]!.name).toBe("Budget");

    const sheetTables = doc.tables(doc.sheets()[0]!.id);
    expect(sheetTables.length).toBe(1);
    expect(sheetTables[0]!.name).toBe("Items");
    expect(sheetTables[0]!.cells().length).toBe(0);
    // No merges left over from the template, which would make cells
    // unwritable for reasons the caller never chose.
    expect(sheetTables[0]!.merges()).toEqual([]);
  });

  it("Numbers: a blank document takes content and reads it back", () => {
    // The point of the whole exercise. Values, then a formula over them.
    const doc = NumbersDocument.blankFrom(bytes(NUMBERS), { tableName: "Items" });
    const table = doc.tables(doc.sheets()[0]!.id)[0]!;
    table.setCell(0, 0, "Item");
    table.setCell(0, 1, "Cost");
    table.setCell(1, 0, "Widget");
    table.setCell(1, 1, 9.99);
    table.setCell(2, 0, "Gadget");
    table.setCell(2, 1, 24.5);
    table.setFormula(3, 1, "=SUM(B2:B3)", { value: 34.49 });

    const reread = NumbersDocument.load(doc.save());
    const after = reread.tables(reread.sheets()[0]!.id)[0]!;
    expect(after.cellText(0, 0)).toBe("Item");
    expect(after.cellText(1, 0)).toBe("Widget");
    expect(after.cellText(1, 1)).toBe("9.99");
    expect(after.cellText(2, 1)).toBe("24.5");
    // Reads back as typed: an unpinned range is a relative tract, the
    // encoding Apple uses — the old $-anchored readback was the writer
    // emitting absolute bounds for everything, fixed by measurement.
    expect(after.cellFormulaDetail(3, 1)?.text).toBe("=SUM(B2:B3)");
    expect(after.cellText(3, 1)).toBe("34.49");
  });

  it("Pages: an empty body in the template's design", () => {
    const doc = PagesDocument.blankFrom(bytes(PAGES));
    expect(doc.bodyOrUndefined?.text).toBe("");
    // The stylesheet survives — that is the whole reason to start from a
    // real document rather than from nothing.
    expect(doc.paragraphStyles().length).toBeGreaterThan(0);

    doc.bodyOrUndefined!.setText("A fresh document.");
    const reread = PagesDocument.load(doc.save());
    expect(reread.bodyOrUndefined?.text).toBe("A fresh document.");
    expect(reread.paragraphStyles().length).toBe(doc.paragraphStyles().length);
  });

  it("Keynote: one slide, emptied, masters intact", () => {
    const doc = KeynoteDocument.blankFrom(bytes(KEYNOTE));
    expect(doc.slides().length).toBe(1);
    expect(doc.slides()[0]!.textStorages().every((s) => s.text === "")).toBe(true);
    expect(doc.masterSlides().length).toBeGreaterThan(0);

    const reread = KeynoteDocument.load(doc.save());
    expect(reread.slides().length).toBe(1);
    expect(reread.masterSlides().length).toBe(doc.masterSlides().length);
  });

  it("refuses a template that has nothing to blank", () => {
    // A Numbers file is not a deck; saying so beats producing an empty one.
    let message = "";
    try {
      KeynoteDocument.blankFrom(bytes(NUMBERS));
    } catch (error) {
      message = (error as Error).message;
    }
    expect(message.length).toBeGreaterThan(0);
  });
});

describe("blank() from the embedded donors", () => {
  it("makes an empty A4 Pages document that survives an edit cycle", () => {
    const doc = PagesDocument.blank();
    expect(doc.bodyText.trim()).toBe("");
    const setup = doc.pageSetup();
    expect(setup.paperId).toBe("iso-a4");
    expect(setup.pageWidth).toBe(595.280029296875);
    expect(setup.pageHeight).toBe(841.8900146484375);
    // The house typography: Palatino body, Helvetica Neue display.
    expect(doc.stylesheet.style("Body")!.resolved().character?.fontName).toBe("Palatino-Roman");
    expect(
      doc.stylesheet.style("Title")!.resolved().character?.fontName?.startsWith("HelveticaNeue"),
    ).toBe(true);
    doc.appendParagraph("first words");
    const re = PagesDocument.load(doc.save());
    expect(re.bodyText).toContain("first words");
    expect(re.pageSetup().paperId).toBe("iso-a4");
    expect(re.compatibility().canRoundTrip).toBe(true);
  });

  it("makes an empty A4 Numbers spreadsheet with one writable table", () => {
    const doc = NumbersDocument.blank();
    expect(doc.sheets().length).toBe(1);
    const table = doc.tables()[0]!;
    expect(table.cells().length).toBe(0);
    // TN.DocumentArchive.paper_id, the field the print dialog reads.
    expect(doc.object(1n)!.message.getString(11)).toBe("iso-a4");
    table.setCell(1, 0, "hello");
    table.setCell(1, 1, 42);
    const re = NumbersDocument.load(doc.save());
    expect(re.tables()[0]!.cellText(1, 0)).toBe("hello");
    expect(re.tables()[0]!.cellText(1, 1)).toBe("42");
    expect(re.compatibility().canRoundTrip).toBe(true);
  });

  it("makes an empty 16:9 Keynote deck with one editable slide", () => {
    const doc = KeynoteDocument.blank();
    expect(doc.slides().length).toBe(1);
    const size = doc.slideSize();
    expect(size?.width).toBe(1920);
    expect(size?.height).toBe(1080);
    // The house typography reaches the deck's theme too.
    expect(doc.stylesheets()[0]!.style("Body")!.resolved().character?.fontName).toBe(
      "Palatino-Roman",
    );
    doc.slides()[0]!.notes = "spoken";
    const re = KeynoteDocument.load(doc.save());
    expect(re.slides()[0]!.notes.trim()).toBe("spoken");
    expect(re.compatibility().canRoundTrip).toBe(true);
  });

  it("hands each caller independent documents", () => {
    const first = PagesDocument.blank();
    first.appendParagraph("mine");
    const second = PagesDocument.blank();
    expect(second.bodyText.includes("mine")).toBe(false);
  });
});

describe("compaction", () => {
  it("collects nothing after a sheet removal, because nothing is orphaned", () => {
    // This is not the result the feature was written for, and it is the
    // honest one. Removing a sheet unlinks it from the document tree, but
    // the calc engine keeps its own references to every table it ever knew
    // — so those archives stay *reachable* and compaction correctly leaves
    // them alone.
    //
    // The gap is on the removal side, not the collector's: unregistering a
    // table's formula owners is calc-engine surgery this library does not
    // do yet. Asserting the real behaviour means the day removal starts
    // unlinking properly, this test fails and says so.
    const doc = NumbersDocument.load(bytes(MULTI_SHEET));
    expect(doc.sheets().length).toBe(4);
    for (let index = doc.sheets().length - 1; index > 0; index--) doc.removeSheet(index);
    expect(doc.sheets().length).toBe(1);
    expect(doc.compact()).toBe(0);
  });

  it("collects an object once the last reference to it goes", () => {
    // The collector itself, proven on a case with no calc engine involved:
    // a brand-new object nobody points at.
    const doc = NumbersDocument.load(bytes(MULTI_SHEET));
    const before = [...doc.store.allObjects()].length;
    const component = doc.store.components.find((c) => !c.isOpaque && c.objects.length > 0)!;
    doc.store.createObject(6005, component);
    expect([...doc.store.allObjects()].length).toBe(before + 1);
    expect(doc.compact()).toBe(1);
    expect([...doc.store.allObjects()].length).toBe(before);
  });

  it("removes nothing from a document nobody edited", () => {
    // Compacting an untouched document must be a no-op. If the scan were
    // too eager this is where it would show, by throwing away objects the
    // app put there on purpose.
    for (const name of [NUMBERS, PAGES, KEYNOTE]) {
      const doc = IWorkDocument.open(bytes(name));
      expect(`${name}: ${doc.compact()}`).toBe(`${name}: 0`);
    }
  });

  it("leaves a compacted document readable and re-editable", () => {
    const doc = NumbersDocument.load(bytes(MULTI_SHEET));
    for (let index = doc.sheets().length - 1; index > 0; index--) doc.removeSheet(index);
    doc.compact();

    const reread = NumbersDocument.load(doc.save());
    const table = reread.tables(reread.sheets()[0]!.id)[0]!;
    expect(table.cells().length).toBeGreaterThan(0);
    table.setCell(1, 0, "still writable");
    const again = NumbersDocument.load(reread.save());
    expect(again.tables(again.sheets()[0]!.id)[0]!.cellText(1, 0)).toBe("still writable");
  });
});
