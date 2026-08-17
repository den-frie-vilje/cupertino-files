/**
 * The whole point of the library, in one file: **open, edit, save, reopen.**
 *
 * Everything else here tests a reader against a fixture or a writer against
 * a decoder. This tests the round trip a caller actually performs, for each
 * of the three apps, and asserts two things at once:
 *
 *  1. the edit is there when the document is read back, and
 *  2. **nothing else moved.** A writer that lands the edit and quietly
 *     drops a chart, a comment or an unknown archive has not worked. Every
 *     case below re-reads a census of the document and compares it to the
 *     census taken before the edit.
 *
 * The second half is the one that catches real regressions. It is easy to
 * write a cell; it is easy to write a cell and lose the table's formulas.
 *
 * These run offline and prove self-consistency — that we can read back what
 * we wrote. They cannot prove Apple's apps accept the result; that is what
 * `test/e2e/` is for, and it needs a Mac. The distinction is recorded in
 * docs/VERIFICATION.md and is not papered over here.
 */
import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "./harness.ts";
import {
  IWorkDocument,
  KeynoteDocument,
  NumbersDocument,
  PagesDocument,
  ShowMode,
  tablesOf,
} from "../src/index.ts";
import { chartsOf } from "../src/tsch/charts.ts";

const FIXTURES = new URL("../fixtures/", import.meta.url);
const bytes = (name: string) => new Uint8Array(readFileSync(new URL(name, FIXTURES)));

/**
 * A summary of everything a careless writer might destroy.
 *
 * Counting is deliberate rather than hashing: a hash tells you something
 * changed, a census tells you *what*, and the failure message is the whole
 * value of a test like this.
 */
interface Census {
  objects: number;
  components: number;
  textCharacters: number;
  paragraphs: number;
  tables: number;
  cells: number;
  formulas: number;
  merges: number;
  charts: number;
  styles: number;
  unknownTypes: number;
}

function census(document: IWorkDocument): Census {
  let objects = 0;
  let unknownTypes = 0;
  for (const { obj } of document.store.allObjects()) {
    objects++;
    if (document.store.typeNameOf(obj) === undefined) unknownTypes++;
  }
  let textCharacters = 0;
  let paragraphs = 0;
  for (const storage of document.textStorages()) {
    textCharacters += storage.text.length;
    paragraphs += storage.paragraphs().length;
  }
  const tables = tablesOf(document.store);
  return {
    objects,
    components: document.store.components.length,
    textCharacters,
    paragraphs,
    tables: tables.length,
    cells: tables.reduce((n, t) => n + t.cells().length, 0),
    formulas: tables.reduce((n, t) => n + t.formulas().length, 0),
    merges: tables.reduce((n, t) => n + t.merges().length, 0),
    charts: chartsOf(document.store).length,
    styles: document.stylesheets().reduce((n, s) => n + s.paragraphStyles().length, 0),
    unknownTypes,
  };
}

/** Field-by-field comparison, so a failure names the thing that moved. */
function expectCensus(after: Census, before: Census, allowed: Partial<Census> = {}): void {
  for (const key of Object.keys(before) as (keyof Census)[]) {
    const expected = before[key] + (allowed[key] ?? 0);
    expect(`${key}=${after[key]}`).toBe(`${key}=${expected}`);
  }
}

describe("Pages: open, edit, save, reopen", () => {
  const FIXTURE = "gomap-v26.1-newest-writer.pages";

  it("edits body text and preserves everything else", () => {
    const before = census(IWorkDocument.open(bytes(FIXTURE)));

    const doc = PagesDocument.load(bytes(FIXTURE));
    const storage = doc.textStorages().find((s) => s.text.length > 20)!;
    const original = storage.text;
    // Insert rather than replace: insertion is what exercises the
    // attribute-table fixup, which is where text editing goes wrong.
    storage.insertText(5, "INSERTED");
    const saved = doc.save();

    const reread = PagesDocument.load(saved);
    const edited = reread.textStorages().find((s) => s.text.includes("INSERTED"));
    expect(edited !== undefined).toBe(true);
    expect(edited!.text).toBe(`${original.slice(0, 5)}INSERTED${original.slice(5)}`);

    expectCensus(census(IWorkDocument.open(saved)), before, { textCharacters: 8 });
  });

  it("survives a second edit cycle on its own output", () => {
    // Re-editing our own output is the case a one-shot test misses: the
    // first save may leave the document in a state only we can read.
    let current: Uint8Array = bytes(FIXTURE);
    for (let round = 0; round < 3; round++) {
      const doc = PagesDocument.load(current);
      doc.textStorages().find((s) => s.text.length > 20)!.insertText(0, `R${round} `);
      current = new Uint8Array(doc.save());
    }
    const text = PagesDocument.load(current).textStorages().map((s) => s.text).join("\n");
    expect(text.includes("R2 R1 R0 ")).toBe(true);
  });
});

describe("Numbers: open, edit, save, reopen", () => {
  const FIXTURE = "numbers-parser-v26.0-categories.numbers";

  it("writes cells of every value type and preserves everything else", () => {
    const before = census(IWorkDocument.open(bytes(FIXTURE)));

    const doc = NumbersDocument.load(bytes(FIXTURE));
    const table = doc.tables().find((t) => t.storageGeneration === "v5" && t.rowCount > 3)!;
    const name = table.name;
    table.setCell(1, 0, "edited text");
    table.setCell(2, 0, 1234.5);
    table.setCell(3, 0, true);
    const saved = doc.save();

    const reread = NumbersDocument.load(saved);
    const after = reread.tables().find((t) => t.name === name)!;
    expect(after.cellText(1, 0)).toBe("edited text");
    expect(after.cellValue(2, 0)?.type).toBe("number");
    expect(after.cellText(2, 0)).toBe("1234.5");
    expect(after.cellValue(3, 0)?.type).toBe("bool");

    // Cell count may rise if a written cell was previously empty; nothing
    // else may move at all.
    const now = census(IWorkDocument.open(saved));
    expect(now.cells >= before.cells).toBe(true);
    expectCensus({ ...now, cells: before.cells }, before);
  });

  it("clears the written cell's formula and no other", () => {
    // Writing a literal over a formula removes that formula — documented,
    // and what a spreadsheet does. The regression worth guarding is the
    // one next door: rebuilding a row's storage must not drop the formula
    // ids of cells nobody touched. Asserting "exactly one disappeared, and
    // it is the one written" tests both halves at once.
    const doc = NumbersDocument.load(bytes(FIXTURE));
    const index = doc.tables().findIndex((t) => t.formulas().length > 10);
    const table = doc.tables()[index]!;
    const key = (f: { row: number; column: number; formula: string }) =>
      `${f.row},${f.column}=${f.formula}`;
    const before = table.formulas().map(key);
    const target = table.formulas()[0]!;
    table.setCell(target.row, target.column, "literal now");

    const reread = NumbersDocument.load(doc.save());
    const after = reread.tables()[index]!.formulas().map(key);
    expect(after.length).toBe(before.length - 1);
    expect(before.filter((f) => !after.includes(f))).toEqual([key(target)]);
    expect(after.filter((f) => !before.includes(f))).toEqual([]);
    expect(reread.tables()[index]!.cellText(target.row, target.column)).toBe("literal now");
  });

  it("writes a duration, which has no plain form", () => {
    // Every other type has an unambiguous bare value; a duration does not,
    // because a bare number means the number. The tagged form is the only
    // way to say it, so it has to keep working.
    const doc = NumbersDocument.load(bytes(FIXTURE));
    const table = doc.tables()[0]!;
    table.setCell(1, 0, { type: "duration", seconds: 5400 });
    const reread = NumbersDocument.load(doc.save());
    const value = reread.tables()[0]!.cellValue(1, 0);
    expect(value?.type).toBe("duration");
    if (value?.type === "duration") expect(value.seconds).toBe(5400);
  });

  it("adds a sheet and a table, and finds them again", () => {
    const doc = NumbersDocument.load(bytes(FIXTURE));
    const sheetsBefore = doc.sheets().length;
    doc.addSheet({ name: "Added Sheet" });
    expect(doc.sheets().length).toBe(sheetsBefore + 1);

    const reread = NumbersDocument.load(doc.save());
    expect(reread.sheets().length).toBe(sheetsBefore + 1);
    expect(reread.sheets().some((s) => s.name === "Added Sheet")).toBe(true);
  });
});

describe("Keynote: open, edit, save, reopen", () => {
  const FIXTURE = "zenodo-v26.1-hyperlinks-masks.key";

  it("edits a slide's text and preserves everything else", () => {
    const before = census(IWorkDocument.open(bytes(FIXTURE)));

    const doc = KeynoteDocument.load(bytes(FIXTURE));
    const slide = doc.slides()[0]!;
    const storage = slide.textStorages().find((s) => s.text.length > 0);
    expect(storage !== undefined).toBe(true);
    const original = storage!.text;
    storage!.insertText(0, "KN ");
    const saved = doc.save();

    const reread = KeynoteDocument.load(saved);
    const text = reread.slides()[0]!.textStorages().map((s) => s.text);
    expect(text.some((t) => t === `KN ${original}`)).toBe(true);

    expectCensus(census(IWorkDocument.open(saved)), before, { textCharacters: 3 });
  });

  it("adds and removes a slide, ending where it started", () => {
    const doc = KeynoteDocument.load(bytes(FIXTURE));
    const count = doc.slides().length;
    doc.addSlide();
    expect(doc.slides().length).toBe(count + 1);

    const withSlide = KeynoteDocument.load(doc.save());
    expect(withSlide.slides().length).toBe(count + 1);
    withSlide.removeSlide(withSlide.slides().length - 1);

    const back = KeynoteDocument.load(withSlide.save());
    expect(back.slides().length).toBe(count);
  });
});

describe("every fixture survives an edit cycle", () => {
  /**
   * The broad version: edit *every* document in the corpus and re-read it.
   *
   * Individually-chosen fixtures test the happy path. This catches the
   * document whose text storage is empty, whose tables are pre-BNC, whose
   * package nests its Index in a zip, or whose components use a codec we
   * cannot re-encode — the shapes that only turn up when you stop
   * choosing. Every app, every format era, one loop.
   */
  const documents = readdirSync(FIXTURES).filter((n) => /\.(pages|numbers|key)$/.test(n));

  it("edits text in every document that has any, losing nothing", () => {
    const skipped: string[] = [];
    let edited = 0;
    for (const name of documents) {
      let before: Census;
      try {
        before = census(IWorkDocument.open(bytes(name)));
      } catch {
        skipped.push(name); // iWork '09 XML, rejected on purpose
        continue;
      }
      const doc = IWorkDocument.open(bytes(name));
      const storage = doc.textStorages().find((s) => s.text.length > 0);
      if (!storage) {
        skipped.push(name);
        continue;
      }
      storage.insertText(0, "x");
      const saved = doc.save();
      const reopened = IWorkDocument.open(saved);
      // The edit is there...
      expect(`${name}: ${reopened.textStorages().some((s) => s.text.startsWith("x"))}`).toBe(
        `${name}: true`,
      );
      // ...and nothing else moved. Naming the file in the assertion is the
      // difference between a fixable failure and a hunt.
      const after = census(reopened);
      for (const key of Object.keys(before) as (keyof Census)[]) {
        const allowance = key === "textCharacters" ? 1 : 0;
        expect(`${name} ${key}=${after[key]}`).toBe(`${name} ${key}=${before[key] + allowance}`);
      }
      edited++;
    }
    // Every modern document in the corpus: 26 Pages, 15 Numbers, 9 Keynote.
    // The one skip is the iWork '09 XML file, which is rejected by design.
    // Exact numbers on purpose — "more than thirty" would hide a fixture
    // quietly becoming uneditable.
    expect(edited).toBe(55);
    expect(skipped).toEqual(["tika-iwork09-testPages.pages"]);
  });

  it("writes a cell in every table it can, losing nothing", () => {
    let written = 0;
    for (const name of documents) {
      let doc: IWorkDocument;
      try {
        doc = IWorkDocument.open(bytes(name));
      } catch {
        continue;
      }
      const before = census(IWorkDocument.open(bytes(name)));
      let touched = false;
      for (const table of tablesOf(doc.store)) {
        // Pre-BNC storage reads but does not write, by design.
        if (table.storageGeneration !== "v5") continue;
        if (table.rowCount < 2 || table.columnCount < 1) continue;
        try {
          table.setCell(table.rowCount - 1, table.columnCount - 1, "edited");
        } catch {
          // A covered cell or an unmaterialised row — both refuse loudly
          // and neither is a failure of the writer.
          continue;
        }
        touched = true;
        break;
      }
      if (!touched) continue;
      const after = census(IWorkDocument.open(doc.save()));
      for (const key of ["objects", "components", "tables", "charts", "unknownTypes"] as const) {
        expect(`${name} ${key}=${after[key]}`).toBe(`${name} ${key}=${before[key]}`);
      }
      written++;
    }
    // 24 of the 55 carry a writable v5 table; the rest have no tables at
    // all, or only pre-BNC storage, which reads but does not write.
    expect(written).toBe(24);
  });
});

describe("app-specific edits survive the cycle", () => {
  /**
   * Text and cells are the shared model; these are the parts that only
   * exist in one app. An edit path that works in memory but does not
   * persist is the failure mode here, and it is invisible to any test that
   * never saves.
   */
  it("Pages: header, footer, page setup and a new paragraph", () => {
    const doc = PagesDocument.load(bytes("gomap-v26.1-newest-writer.pages"));
    const section = doc.sections()[0]!;
    section.setHeaderText("HDR");
    section.setFooterText("FTR");
    doc.setPageSetup({ leftMargin: 55 });
    const body = doc.textStorages().find((s) => s.text.length > 20)!;
    const paragraphsBefore = body.paragraphs().length;
    body.insertText(body.text.length, "\nAppended paragraph");

    const reread = PagesDocument.load(doc.save());
    expect(reread.sections()[0]!.headerText()).toBe("HDR");
    expect(reread.sections()[0]!.footerText()).toBe("FTR");
    expect(reread.pageSetup().leftMargin).toBe(55);
    const rebody = reread.textStorages().find((s) => s.text.includes("Appended paragraph"))!;
    expect(rebody.paragraphs().length).toBe(paragraphsBefore + 1);
  });

  it("Numbers: sheet rename, table rename, cell format and cell styling", () => {
    const doc = NumbersDocument.load(bytes("numbers-parser-v26.0-categories.numbers"));
    doc.renameSheet(0, "Renamed Sheet");
    const table = doc.tables()[0]!;
    table.name = "Renamed Table";
    table.setCell(1, 1, 0.256);
    table.setCellFormat(1, 1, { kind: "percentage", decimals: 1 });

    const reread = NumbersDocument.load(doc.save());
    expect(reread.sheets()[0]!.name).toBe("Renamed Sheet");
    expect(reread.tables()[0]!.name).toBe("Renamed Table");
    const format = reread.tables()[0]!.cellFormat(1, 1);
    expect(format?.kind).toBe("percentage");
    if (format?.kind === "percentage") expect(format.decimals).toBe(1);
  });

  it("Keynote: slide notes, transition and presentation settings", () => {
    const doc = KeynoteDocument.load(bytes("zenodo-v26.1-hyperlinks-masks.key"));
    const slide = doc.slides()[0]!;
    const notes = slide.notesStorage();
    if (notes) notes.setText("Speaker notes here");
    slide.setTransition({ duration: 1.75 });
    doc.setPresentation({ mode: ShowMode.AUTOPLAY });

    const reread = KeynoteDocument.load(doc.save());
    const back = reread.slides()[0]!;
    if (notes) expect(back.notesStorage()?.text).toBe("Speaker notes here");
    expect(back.transition()?.duration).toBe(1.75);
    expect(reread.presentation().mode).toBe(ShowMode.AUTOPLAY);
  });
});
