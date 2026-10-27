/**
 * The claims docs/VERIFICATION.md lists as needing a person at the app,
 * asked of the app by script instead: each probe writes a document with
 * the library, has the app open it, and reads the answer back through the
 * app's own scripting dictionary, its PDF export (rasterised or as text),
 * or a resave the library then reloads. A probe here is cited by the
 * `manualProof` block it settles in scripts/coverage-matrix.ts.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { describe, expect, it } from "../harness.ts";
import { KeynoteDocument, NumbersDocument, PagesDocument, colorFill } from "../../src/index.ts";
import { blockPng } from "../../scripts/png.ts";
import {
  busySkipReason,
  countPixels,
  E2ESession,
  exportDocument,
  osascript,
  pdfText,
  popplerSkipReason,
  posix,
  rasterize,
  withDocument,
  type IWorkApp,
} from "./applescript.ts";

const skip: Record<IWorkApp, string | null> = {
  Pages: busySkipReason("Pages"),
  Numbers: busySkipReason("Numbers"),
  Keynote: busySkipReason("Keynote"),
};
const poppler = popplerSkipReason();
const session = skip.Pages && skip.Numbers && skip.Keynote ? undefined : E2ESession.create();
process.on("exit", () => session?.cleanup());

const KEYNOTE_BASE = "zenodo-v26.1-hyperlinks-masks.key";
const KEYNOTE_SAVED = "olekristensen-v26.0-mac-authored.key";
const BUILDS_FIXTURE = "olekristensen-v26.3-mac-builds-effects.key";
const PAGES_BASE = "patrickomatic-pages26-sections-masks.pages";
const SECTIONS_BASE = "threatconnect-v11.1-headers-footers-sections.pages";
const CATEGORIES_TEMPLATE = "numbers-parser-v26.0-categories.numbers";
const FORMULA_FIXTURES = ["numbers-parser-v26.1-xlsx-lineage.numbers", "olekristensen-v26.3-demo06-formulas-returned.numbers"];

/** A number as the app prints it in the user's locale ("44,0" on a Danish Mac). */
const num = (text: string | undefined): number => Number.parseFloat((text ?? "").trim().replace(",", "."));

/** A 0-based column index as the app names it: A, B, …, Z, AA. */
const columnName = (index: number): string => (index >= 26 ? columnName(Math.floor(index / 26) - 1) : "") + String.fromCharCode(65 + (index % 26));

/** Open, run `body` against `theDoc`, close without saving. */
const ask = (app: IWorkApp, path: string, body: string): string => withDocument(app, path, body);

/** Open, run `script` (statements setting `theResult`, inside the app's tell block), close without saving. */
const inDocument = (app: IWorkApp, path: string, script: string): string =>
  osascript(
    `tell application "${app}"\n` +
      `  set theDoc to open ${posix(path)}\n` +
      `${script}\n` +
      `  close theDoc saving no\n` +
      `  return theResult\n` +
      `end tell`,
  );

/** Every drawable of a kind on a container, one line each: text@x,y#wxh. */
const describeItems = (kind: string, container: string): string =>
  `  set out to ""\n` +
  `  repeat with t in ${kind} of ${container}\n` +
  `    set p to position of t\n` +
  `    set out to out & (object text of t as text) & "@" & (item 1 of p as text) & "," & (item 2 of p as text) & "#" & (width of t as text) & "x" & (height of t as text) & linefeed\n` +
  `  end repeat\n` +
  `  set theResult to out`;

/** Open, let the app save the document in place, close; the library then reloads it. */
const resave = (app: IWorkApp, path: string): void => {
  withDocument(app, path, "name of theDoc", { save: true });
};

const exported = (app: IWorkApp, path: string): string => {
  const pdf = path.replace(/\.[a-z]+$/, ".pdf");
  exportDocument(app, path, pdf, "PDF");
  return pdf;
};

const load = (fixture: string): Uint8Array => readFileSync(session!.stageFixture(fixture));
const rendering = (app: IWorkApp): string | false => skip[app] ?? poppler ?? false;

describe("proofs: Keynote", () => {
  it("a slide made from a layout is on that layout, to Keynote", { skip: skip.Keynote ?? false }, () => {
    session!.remember("Keynote");
    const path = session!.path("from-layout.key");
    const doc = KeynoteDocument.load(load(KEYNOTE_BASE));
    const layout = doc.masterSlides().find((m) => /bullet/i.test(m.name ?? "")) ?? doc.masterSlides()[1]!;
    const added = doc.addSlide({ master: layout.id, after: doc.slideCount() - 1 });
    added.title = "From a layout";
    writeFileSync(path, doc.save());

    const reported = ask("Keynote", path, "(name of base layout of last slide of theDoc) & \"|\" & (object text of default title item of last slide of theDoc)");
    expect(reported).toBe(`${layout.name}|From a layout`);
  });

  it("a slide moved to another layout is on that layout, to Keynote", { skip: skip.Keynote ?? false }, () => {
    session!.remember("Keynote");
    const path = session!.path("set-layout.key");
    const doc = KeynoteDocument.load(load(KEYNOTE_BASE));
    const slide = doc.slides()[0]!;
    slide.title = "Moved";
    slide.setLayout("Title & Bullets");
    slide.body = "A bullet";
    writeFileSync(path, doc.save());

    const reported = ask(
      "Keynote",
      path,
      "(name of base layout of slide 1 of theDoc) & \"|\" & (object text of default title item of slide 1 of theDoc) & \"|\" & (object text of default body item of slide 1 of theDoc)",
    );
    expect(reported).toBe("Title & Bullets|Moved|A bullet");
  });

  it("a background we set is the colour Keynote draws", { skip: rendering("Keynote") }, () => {
    session!.remember("Keynote");
    const path = session!.path("background.key");
    const doc = KeynoteDocument.blank();
    doc.slides()[0]!.setBackground({ kind: "color", color: { r: 0.1, g: 0.23, b: 0.16, space: "srgb" } });
    writeFileSync(path, doc.save());

    const page = rasterize(exported("Keynote", path), 1, 18);
    // The whole slide but a margin for the title box: the fill is most of it.
    const green = countPixels(page, [26, 59, 41], 20);
    expect(green).toBeGreaterThan(page.width * page.height * 0.5);
  });

  it("a picture added to a slide sits where asked, at the size asked", { skip: skip.Keynote ?? false }, () => {
    session!.remember("Keynote");
    const path = session!.path("picture.key");
    const doc = KeynoteDocument.blank();
    doc.addImage(0, blockPng(80, 40), { fileName: "block.png", x: 100, y: 200, width: 300, height: 150 });
    writeFileSync(path, doc.save());

    const reported = inDocument(
      "Keynote",
      path,
      `  tell slide 1 of theDoc\n` +
        `    set p to position of image 1\n` +
        `    set theResult to ((count of images) as text) & "|" & (item 1 of p as text) & "," & (item 2 of p as text) & "|" & (width of image 1 as text) & "|" & (height of image 1 as text)\n` +
        `  end tell`,
    );
    const [count, position, width, height] = reported.split("|");
    expect(count).toBe("1");
    expect(position!.split(",").map(num)).toEqual([100, 200]);
    expect(num(width)).toBe(300);
    expect(num(height)).toBe(150);
  });

  it("a table on a slide is a table to Keynote, and survives its resave", { skip: skip.Keynote ?? false }, () => {
    session!.remember("Keynote");
    const path = session!.path("slide-table.key");
    const doc = KeynoteDocument.load(load(KEYNOTE_BASE));
    doc.slides()[0]!.addTable({ rows: [["Item", "Count"], ["Apples", "3"], ["Pears", "5"]], x: 300, y: 500 });
    writeFileSync(path, doc.save());

    const reported = withDocument(
      "Keynote",
      path,
      "((count of tables of slide 1 of theDoc) as text) & \"|\" & (value of cell \"A3\" of table 1 of slide 1 of theDoc as text) & \"|\" & (value of cell \"B3\" of table 1 of slide 1 of theDoc as text)",
      { save: true },
    );
    const [count, a3, b3] = reported.split("|");
    expect([count, a3, num(b3)]).toEqual(["1", "Pears", 5]);
    const reparsed = KeynoteDocument.load(readFileSync(path));
    expect(reparsed.tables()[0]?.cellText(2, 0)).toBe("Pears");
  });

  it("a text box on a slide reads back where placed", { skip: skip.Keynote ?? false }, () => {
    session!.remember("Keynote");
    const path = session!.path("slide-text-box.key");
    const doc = KeynoteDocument.load(load(KEYNOTE_BASE));
    doc.slides()[0]!.addTextBox("Written by cupertino-files", { x: 300, y: 650, width: 1300, height: 120 });
    writeFileSync(path, doc.save());

    const reported = inDocument("Keynote", path, describeItems("text items", "slide 1 of theDoc"));
    const line = reported.split("\n").find((l) => l.startsWith("Written by cupertino-files@"));
    const [, x, y, w, h] = /@(.+),(.+)#(.+)x(.+)$/.exec(line ?? "") ?? [];
    expect([x, y, w, h].map(num)).toEqual([300, 650, 1300, 120]);
    if (!poppler) expect(pdfText(exported("Keynote", path))[0] ?? "").toContain("Written by cupertino-files");
  });

  it("a build we added survives Keynote's resave", { skip: skip.Keynote ?? false }, () => {
    session!.remember("Keynote");
    const path = session!.path("added-build.key");
    const doc = KeynoteDocument.load(load(BUILDS_FIXTURE));
    const slide = doc.slides()[0]!;
    const before = slide.builds().length;
    const drawable = slide.drawables().find((d) => !slide.builds().some((b) => b.read().drawableId === d.id)) ?? slide.drawables()[0]!;
    slide.addBuild({ drawableId: drawable.id, effect: "apple:dissolve", duration: 1 });
    writeFileSync(path, doc.save());

    resave("Keynote", path);

    const builds = KeynoteDocument.load(readFileSync(path)).slides()[0]!.builds();
    expect(builds.length).toBe(before + 1);
    expect(builds.map((b) => b.read().effect)).toContain("apple:dissolve");
  });

  it("Keynote saves a deck we added and duplicated slides in", { skip: skip.Keynote ?? false }, () => {
    session!.remember("Keynote");
    const path = session!.path("per-slide-components.key");
    const doc = KeynoteDocument.load(load(KEYNOTE_SAVED));
    const before = doc.slideCount();
    doc.duplicateSlide(0);
    doc.addSlide({ copyOf: 0, after: 1 });
    writeFileSync(path, doc.save());

    // `save` is the claim: a deck Keynote opens but refuses to save throws here.
    const reported = withDocument("Keynote", path, "count of slides of theDoc", { save: true });
    expect(Number(reported)).toBe(before + 2);
    expect(KeynoteDocument.load(readFileSync(path)).slideCount()).toBe(before + 2);
  });
});

describe("proofs: Pages", () => {
  it("a text box on a page reads back where placed", { skip: skip.Pages ?? false }, () => {
    session!.remember("Pages");
    const path = session!.path("page-text-box.pages");
    const doc = PagesDocument.load(load(PAGES_BASE));
    doc.addTextBox(0, "Written by cupertino-files", { x: 360, y: 560, width: 220, height: 60 });
    writeFileSync(path, doc.save());

    const reported = inDocument("Pages", path, describeItems("text items", "theDoc"));
    const line = reported.split("\n").find((l) => l.startsWith("Written by cupertino-files@"));
    const [, x, y, w, h] = /@(.+),(.+)#(.+)x(.+)$/.exec(line ?? "") ?? [];
    expect([x, y, w, h].map(num)).toEqual([360, 560, 220, 60]);
  });

  it("a drawable moved to the section master shows on every page of its section", { skip: rendering("Pages") }, () => {
    session!.remember("Pages");
    const before = session!.stageFixture(SECTIONS_BASE);
    const after = session!.path("section-master.pages");
    // The base's first section runs sixteen pages and carries one floating
    // graphic on its first; the second section starts on page 17. Body text
    // already inks the graphic's rectangle, so each page is read against
    // the untouched document's export of the same page.
    const doc = PagesDocument.load(readFileSync(before));
    const drawable = doc.floatingDrawables(0)!.drawables()[0]!;
    const g = drawable.geometry()!;
    const rect = { x: g.x ?? 0, y: g.y ?? 0, width: g.width ?? 0, height: g.height ?? 0 };
    doc.sections()[0]!.moveToSectionMaster(drawable.id);
    writeFileSync(after, doc.save());

    const ink = (pdf: string, page: number): number => {
      const raster = rasterize(pdf, page, 18);
      const area = Math.ceil(rect.width / raster.scale) * Math.ceil(rect.height / raster.scale);
      return 1 - countPixels(raster, [255, 255, 255], 6, rect) / area;
    };
    const plain = exported("Pages", before);
    const moved = exported("Pages", after);
    const gained = [2, 3, 8, 16, 17].map((page) => ink(moved, page) - ink(plain, page) > 0.08);
    expect(gained).toEqual([true, true, true, true, false]);
  });

  it("a table appended to the body is a table to Pages", { skip: skip.Pages ?? false }, () => {
    session!.remember("Pages");
    const path = session!.path("body-table.pages");
    const doc = PagesDocument.blank();
    doc.appendParagraph("A table follows.");
    doc.appendTable([["Item", "Count"], ["Apples", "3"], ["Pears", "5"]]);
    writeFileSync(path, doc.save());

    const reported = ask("Pages", path, "((count of tables of theDoc) as text) & \"|\" & (value of cell \"A3\" of table 1 of theDoc as text) & \"|\" & (value of cell \"B3\" of table 1 of theDoc as text)");
    const [count, a3, b3] = reported.split("|");
    expect([count, a3, num(b3)]).toEqual(["1", "Pears", 5]);
  });

  it("a page break starts a new page", { skip: skip.Pages ?? false }, () => {
    session!.remember("Pages");
    const path = session!.path("page-break.pages");
    const doc = PagesDocument.blank();
    doc.appendParagraph("Page one.");
    doc.appendParagraph("Page two.");
    doc.insertPageBreak(doc.body.paragraphs().length - 2);
    writeFileSync(path, doc.save());

    expect(ask("Pages", path, "count of pages of theDoc")).toBe("2");
  });
});

describe("proofs: Numbers", () => {
  it("bands, a row height and a column width take effect", { skip: skip.Numbers ?? false }, () => {
    session!.remember("Numbers");
    const path = session!.path("structure.numbers");
    const doc = NumbersDocument.blank();
    const table = doc.tables()[0]!;
    table.setBands({ headerRows: 2, footerRows: 1 });
    table.setRowHeight(2, 44);
    table.setColumnWidth(1, 180);
    writeFileSync(path, doc.save());

    const reported = inDocument(
      "Numbers",
      path,
      `  tell table 1 of sheet 1 of theDoc\n` +
        `    set theResult to (header row count as text) & "|" & (footer row count as text) & "|" & (height of row 3 as text) & "|" & (width of column 2 as text)\n` +
        `  end tell`,
    );
    expect(reported.split("|").map(num)).toEqual([2, 1, 44, 180]);
  });

  it("a formula referring to a cloned table computes on first open", { skip: skip.Numbers ?? false }, () => {
    session!.remember("Numbers");
    const path = session!.path("clone-reference.numbers");
    const doc = NumbersDocument.blank();
    const sheet = doc.sheets()[0]!;
    const table = doc.tables()[0]!;
    const copy = doc.addTable(sheet.id, { copyOf: table.infoObject!.identifier, name: "Copy" });
    copy.setCell(1, 1, 35);
    table.setFormula(1, 1, "=Copy::B2*2", { value: 0 });
    table.setFormula(2, 1, "=B2+1", { value: 0 });
    writeFileSync(path, doc.save());

    const reported = inDocument(
      "Numbers",
      path,
      `  tell table "${table.name}" of sheet 1 of theDoc\n` +
        `    set theResult to (value of cell "B2" as text) & "|" & (value of cell "B3" as text)\n` +
        `  end tell`,
    );
    expect(reported.split("|").map(num)).toEqual([70, 71]);
  });

  it("a duration we type shows as a duration, not a number", { skip: skip.Numbers ?? false }, () => {
    session!.remember("Numbers");
    const path = session!.path("duration.numbers");
    const doc = NumbersDocument.blank();
    doc.tables()[0]!.setCell(1, 0, { type: "duration", seconds: 5400 });
    writeFileSync(path, doc.save());

    // Short style, hours and minutes, in the UI's locale: "1h 30m", "1t 30m".
    const shown = ask("Numbers", path, `formatted value of cell "A2" of table 1 of sheet 1 of theDoc as text`);
    expect(/^1\p{L}{1,3} 30\p{L}{1,3}$/u.test(shown) ? "duration" : shown).toBe("duration");
  });

  it("a conditional fill draws, and draws again on a cell re-pointed to its rule set", { skip: rendering("Numbers") }, () => {
    session!.remember("Numbers");
    const one = session!.path("conditional-one.numbers");
    const two = session!.path("conditional-two.numbers");
    const doc = NumbersDocument.load(load(CATEGORIES_TEMPLATE));
    const table = doc.tables()[0]!;
    table.setCell(1, 0, -10);
    const key = table.setConditionalRules(1, 0, [{ operator: "<", value: 0, cell: { fill: colorFill(1, 0.2, 0.2) } }]);
    writeFileSync(one, doc.save());
    table.setCell(2, 0, -5);
    table.setConditionalStyleKey(2, 0, key);
    writeFileSync(two, doc.save());

    const red = (path: string) => countPixels(rasterize(exported("Numbers", path), 1, 36), [255, 51, 51], 24);
    const first = red(one);
    const second = red(two);
    expect(first).toBeGreaterThan(20);
    expect(second / first).toBeGreaterThan(1.6);
    expect(second / first).toBeLessThan(2.6);
  });

  it("banded rows draw in the band fill", { skip: rendering("Numbers") }, () => {
    session!.remember("Numbers");
    const path = session!.path("banded.numbers");
    const doc = NumbersDocument.blank();
    doc.tables()[0]!.tableStyle()!.setTable({ bandedRows: true, bandedFill: colorFill(0.6, 0.8, 1) });
    writeFileSync(path, doc.save());

    expect(countPixels(rasterize(exported("Numbers", path), 1, 36), [153, 204, 255], 16)).toBeGreaterThan(50);
  });

  it("a filter rule we wrote hides the rows it should", { skip: rendering("Numbers") }, () => {
    session!.remember("Numbers");
    const path = session!.path("filter-rule.numbers");
    const doc = NumbersDocument.blank();
    const table = doc.tables()[0]!;
    ["alpha", "beta", "gamma", "delta"].forEach((word, i) => {
      table.setCell(i + 1, 0, word);
      table.setCell(i + 1, 1, (i + 1) * 5);
    });
    table.addFilterRule(1, { operator: ">", value: 10 });
    writeFileSync(path, doc.save());

    const text = pdfText(exported("Numbers", path)).join("\n");
    expect(text).toContain("gamma");
    expect(text).toContain("delta");
    expect(/alpha|beta/.test(text)).toBe(false);
  });

  it("a category we defined survives Numbers' resave", { skip: skip.Numbers ?? false }, () => {
    session!.remember("Numbers");
    const path = session!.path("category.numbers");
    const doc = NumbersDocument.load(load(CATEGORIES_TEMPLATE));
    const table = doc.tables()[0]!;
    const kinds = ["Fruit", "Animal", "Fruit", "Transport", "Animal"];
    kinds.forEach((kind, i) => {
      table.setCell(i + 1, 0, kind);
    });
    if (table.rowCount > kinds.length + 1) table.deleteRows(kinds.length + 1, table.rowCount - kinds.length - 1);
    table.addCategory(0);
    writeFileSync(path, doc.save());

    resave("Numbers", path);

    const reparsed = NumbersDocument.load(readFileSync(path)).tables()[0]!;
    expect(reparsed.activeCategories()?.groups().map((g) => g.value)).toEqual(["Animal", "Fruit", "Transport"]);
    expect(reparsed.staleCategoryGroups().length).toBe(0);
  });

  it("formula text matches what Numbers shows", { skip: skip.Numbers ?? false }, () => {
    session!.remember("Numbers");
    // The app prints in the UI locale: a true minus, × for *, ; between arguments.
    const normalise = (f: string) =>
      f.replace(/^=/, "").replace(/\s+/g, "").replace(/\u2212/g, "-").replace(/\u00d7/g, "*").replace(/\u00f7/g, "/").replace(/;/g, ",").toUpperCase();
    const mismatches: string[] = [];
    let compared = 0;
    for (const fixture of FORMULA_FIXTURES) {
      const path = session!.stageFixture(fixture);
      const doc = NumbersDocument.load(readFileSync(path));
      doc.sheets().forEach((sheet, s) => {
        doc.tablesOnSheet(sheet.id).forEach((table, t) => {
          const cells: { name: string; formula: string }[] = [];
          for (let r = 0; r < table.rowCount; r++) {
            for (let c = 0; c < table.columnCount; c++) {
              const formula = table.cellFormula(r, c);
              if (formula) cells.push({ name: `${columnName(c)}${r + 1}`, formula });
            }
          }
          if (cells.length === 0) return;
          const theirs = inDocument(
            "Numbers",
            path,
            `  set out to ""\n` +
              `  tell table ${t + 1} of sheet ${s + 1} of theDoc\n` +
              cells.map((cell) => `    set out to out & (formula of cell "${cell.name}" as text) & linefeed\n`).join("") +
              `  end tell\n` +
              `  set theResult to out`,
          ).split("\n");
          cells.forEach((cell, i) => {
            // The formula bar speaks the UI's language: function names and
            // decimal literals are the locale's, so only references, ranges
            // and operators are compared; a target the library cannot name
            // is one the app cannot either.
            if (/[A-Za-z]\(|\d\.\d|OTHER_TABLE/.test(cell.formula)) return;
            compared++;
            if (normalise(cell.formula) !== normalise(theirs[i] ?? "")) mismatches.push(`${fixture} ${table.name} ${cell.name}: ${cell.formula} vs ${theirs[i]}`);
          });
        });
      });
    }
    expect(compared).toBeGreaterThan(10);
    expect(mismatches.join("\n")).toBe("");
  });
});
