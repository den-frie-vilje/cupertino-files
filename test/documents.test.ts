import { readFileSync } from "node:fs";
import { describe, expect, it } from "./harness.ts";
import {
  buildZip,
  bytesEqual,
  detectApp,
  EncryptedDocumentError,
  IWorkContainer,
  IWorkDocument,
  KeynoteDocument,
  NumbersDocument,
  PagesDocument,
  ZipReader,
} from "../src/index.ts";

const FIXTURES = new URL("../fixtures/", import.meta.url);

function fixture(name: string): Uint8Array {
  return new Uint8Array(readFileSync(new URL(name, FIXTURES)));
}

const EELS = fixture("libetonyek-pages5-file.pages");
const TIKA2013 = fixture("tika-testPages2013.pages");
const NESTED = fixture("libetonyek-pages5-extra-dir.pages");

describe("loading real fixtures", () => {
  it("loads a flat-zip Pages 5 document", () => {
    const doc = PagesDocument.load(EELS);
    expect(doc.app).toBe("pages");
    expect(doc.bodyText).toContain("My hovercraft is full of eels.");
    expect(doc.paragraphs().length).toBe(3);
    expect(doc.paragraphs().map((p) => p.styleName)).toEqual(["Body", "Body", "Body"]);
    expect(doc.format.propertiesFileFormatVersion).toBe("1.5.0");
    expect(doc.format.buildHistory.join(" ")).toContain("M5.5.3");
    const setup = doc.pageSetup();
    expect(Math.round(setup.pageWidth!)).toBe(595); // A4 portrait
    expect(Math.round(setup.pageHeight!)).toBe(842);
    // A blank template has no drawables; the strict geometry matcher must
    // not produce false positives from style archives.
    expect(doc.drawables().length).toBe(0);
  });

  it("finds real drawables with correct geometry", () => {
    const doc = PagesDocument.load(NESTED);
    const drawables = doc.drawables();
    expect(drawables.length).toBeGreaterThan(0);
    const image = drawables.find((d) => d.typeName === "TSD.ImageArchive")!;
    expect(Math.round(image.geometry()!.width!)).toBe(514);
    const tika = PagesDocument.load(TIKA2013);
    const kinds = tika.drawables().map((d) => d.typeName);
    expect(kinds).toContain("TSWP.ShapeInfoArchive"); // the text box
    expect(kinds).toContain("TST.TableInfoArchive"); // the table
  });

  it("loads the Tika Pages 2013 document with sections and headers", () => {
    const doc = PagesDocument.load(TIKA2013);
    expect(doc.bodyText.length).toBe(1900);
    const sections = doc.sections();
    expect(sections.length).toBe(1);
    const templates = sections[0]!.templates();
    expect(templates.map((t) => t.role)).toEqual(["first", "even", "odd"]);
    expect(templates[0]!.headers.length).toBe(3);
    expect(templates[0]!.footers.length).toBe(3);
    const names = doc.paragraphStyles().map((s) => s.name);
    expect(names).toContain("Body");
    expect(names).toContain("Heading 5");
  });

  it("loads the nested Index.zip layout (wrapper directory)", () => {
    const doc = PagesDocument.load(NESTED);
    expect(doc.app).toBe("pages");
    expect(doc.container.prefix).toBe("Project Proposal.pages/");
    expect(doc.bodyText.length).toBeGreaterThan(0);
  });

  it("detects Numbers and Keynote and reads their storages", () => {
    const numbers = NumbersDocument.load(fixture("tika-testNumbers2013.numbers"));
    expect(numbers.app).toBe("numbers");
    expect(numbers.sheets().length).toBeGreaterThan(0);
    expect(typeof numbers.sheets()[0]!.name).toBe("string");

    const keynote = KeynoteDocument.load(fixture("tika-testKeynote2013.key"));
    expect(keynote.app).toBe("keynote");
    expect(keynote.slideCount()).toBeGreaterThan(0);
    expect(keynote.allText().length).toBeGreaterThan(0);

    // Generic open() auto-detects.
    expect(IWorkDocument.open(fixture("tika-testKeynote2018.key")).app).toBe("keynote");
    expect(detectApp(IWorkContainer.fromBytes(EELS))).toBe("pages");
  });

  it("rejects the iWork '09 XML format with a helpful error", () => {
    let error: Error | undefined;
    try {
      PagesDocument.load(fixture("tika-iwork09-testPages.pages"));
    } catch (e) {
      error = e as Error;
    }
    expect(error !== undefined).toBe(true);
    expect(String(error?.message)).toContain("iWork '09");
  });

  it("rejects password-protected documents", () => {
    const zip = buildZip([
      { name: ".iwph", data: new Uint8Array([1, 2, 3]) },
      { name: "Index/Document.iwa", data: new Uint8Array(0) },
    ]);
    let error: Error | undefined;
    try {
      IWorkContainer.fromBytes(zip);
    } catch (e) {
      error = e as Error;
    }
    expect(error instanceof EncryptedDocumentError).toBe(true);
  });
});

describe("round-trip fidelity", () => {
  it("save without edits keeps every entry byte-identical", () => {
    for (const original of [EELS, TIKA2013, NESTED]) {
      const doc = PagesDocument.load(original);
      // Exercise read paths first — reading must never dirty anything.
      doc.paragraphs();
      doc.sections().forEach((s) => s.templates());
      doc.paragraphStyles();
      doc.drawables().forEach((d) => d.geometry());
      const saved = doc.save();

      const before = ZipReader.parse(original);
      const after = ZipReader.parse(saved);
      const beforeNames = before.names().filter((n) => !n.endsWith("/"));
      const afterNames = after.names().filter((n) => !n.endsWith("/"));
      expect(afterNames).toEqual(beforeNames);
      for (const name of beforeNames) {
        if (name.toLowerCase().endsWith("index.zip")) {
          // Nested zips are re-encoded; compare their member bytes instead.
          const b = ZipReader.parse(before.read(name));
          const a = ZipReader.parse(after.read(name));
          for (const inner of b.names().filter((n) => !n.endsWith("/"))) {
            expect(bytesEqual(a.read(inner), b.read(inner))).toBe(true);
          }
        } else {
          expect(bytesEqual(after.read(name), before.read(name))).toBe(true);
        }
      }
    }
  });

  it("edited documents reload with all invariants intact", () => {
    const doc = PagesDocument.load(EELS);
    const originalParaCount = doc.paragraphs().length;

    expect(doc.replaceText("hovercraft", "airship")).toBe(1);
    const charStyleId = doc.applyCharacterFormatting(0, 2, { bold: true, fontSize: 18 });
    const newParaIndex = doc.appendParagraph("Appended paragraph.", "Heading 2");
    doc.setPageSetup({ topMargin: 72 });
    const created = doc.createParagraphStyle({
      name: "My Custom Style",
      basedOn: "Body",
      character: { italic: true },
      paragraph: { alignment: 2, spaceBefore: 12 },
    });
    doc.setParagraphStyle(1, "My Custom Style");

    const saved = doc.save();
    const doc2 = PagesDocument.load(saved);

    // Text and paragraphs.
    expect(doc2.bodyText).toContain("My airship is full of eels.");
    expect(doc2.paragraphs().length).toBe(originalParaCount + 1);
    expect(doc2.paragraphs()[newParaIndex]!.styleName).toBe("Heading 2");
    expect(doc2.paragraphs()[1]!.styleName).toBe("My Custom Style");
    expect(doc2.paragraphs()[0]!.styleName).toBe("Body");

    // Character formatting run.
    const runs = doc2.body.characterStyleRuns();
    expect(runs[0]!.start).toBe(0);
    expect(runs[0]!.end).toBe(2);
    expect(runs[0]!.objectId).toBe(charStyleId);
    expect(runs[1]!.objectId).toBe(undefined);

    // Page setup.
    expect(doc2.pageSetup().topMargin).toBe(72);

    // Object-reference invariants.
    const bodyRefs = doc2.body.object.getObjectReferences();
    expect(bodyRefs.includes(charStyleId)).toBe(true);
    const sheetRefs = doc2.stylesheet.object.getObjectReferences();
    expect(sheetRefs.includes(created)).toBe(true);
    expect(sheetRefs.includes(charStyleId)).toBe(true);

    // ID allocation recorded in PackageMetadata.
    const last = doc2.store.packageMetadata.message.getVarint(1)!;
    expect(last >= 1_000_000n).toBe(true);

    // Cross-component external reference: body (Document.iwa) → style
    // (DocumentStylesheet.iwa).
    const styleComponent = doc2.store.componentOf(charStyleId)!;
    expect(styleComponent.name).toBe("Index/DocumentStylesheet.iwa");
    const docComponent = doc2.store.componentOf(doc2.body.id)!;
    const info = doc2.store.componentInfo(docComponent)!;
    const sheetComponentId = doc2.store.componentInfo(styleComponent)!.getVarint(1)!;
    const found = info
      .getMessages(6)
      .some((er) => er.getVarint(1) === sheetComponentId && er.getVarint(2) === charStyleId);
    expect(found).toBe(true);

    // New style resolvable by name, with correct parent chain.
    const custom = doc2.stylesheet.findByName("My Custom Style", 2022)!;
    expect(custom.parentId).toBe(doc2.stylesheet.findByName("Body", 2022)!.id);

    // Save again — the double round-trip must be stable.
    const doc3 = PagesDocument.load(doc2.save());
    expect(doc3.bodyText).toBe(doc2.bodyText);
  });

  it("keeps attachment anchors aligned across edits (Tika 2013)", () => {
    const doc = PagesDocument.load(TIKA2013);
    const body = doc.body;
    const attachmentTable = () =>
      body.object.message
        .getMessage(9)!
        .getMessages(1)
        .map((e) => e.getUint(1)!);
    const beforeIdx = attachmentTable();
    expect(beforeIdx.length).toBe(1);
    const anchor = beforeIdx[0]!;
    expect(doc.bodyText.charCodeAt(anchor)).toBe(0xfffc); // object replacement char

    // Insert before the anchor: it must shift by the insertion length.
    doc.body.insertText(0, "PREFIX ");
    const doc2 = PagesDocument.load(doc.save());
    const shifted = doc2.body.object.message.getMessage(9)!.getMessages(1)[0]!.getUint(1)!;
    expect(shifted).toBe(anchor + "PREFIX ".length);
    expect(doc2.bodyText.charCodeAt(shifted)).toBe(0xfffc);
  });

  it("merges and splits paragraphs with style tables intact", () => {
    const doc = PagesDocument.load(EELS);
    const body = doc.body;
    const p = doc.paragraphs();
    // Split paragraph 0 by inserting a newline mid-way.
    body.insertText(10, "X\nY");
    expect(doc.paragraphs().length).toBe(4);
    expect(doc.paragraphs().every((q) => q.styleId !== undefined)).toBe(true);

    // Merge: delete across the paragraph boundary we created.
    const t = body.text;
    const nl = t.indexOf("\n");
    body.deleteRange(nl, nl + 1);
    expect(doc.paragraphs().length).toBe(3);

    const saved = PagesDocument.load(doc.save());
    expect(saved.paragraphs().length).toBe(3);
    expect(saved.paragraphs().map((q) => q.styleName)).toEqual(["Body", "Body", "Body"]);
    expect(p.length).toBe(3);
  });

  it("edits section headers and footers", () => {
    const doc = PagesDocument.load(TIKA2013);
    const section = doc.sections()[0]!;
    section.setHeaderText("Confidential", 1);
    section.setFooterText("Page footer", 1);
    section.name = "Renamed Section";
    section.pageNumberStart = 5;

    const doc2 = PagesDocument.load(doc.save());
    const s2 = doc2.sections()[0]!;
    expect(s2.headerText(1)).toBe("Confidential");
    expect(s2.footerText(1)).toBe("Page footer");
    expect(s2.name).toBe("Renamed Section");
    expect(s2.pageNumberStart).toBe(5);
  });

  it("moves drawables", () => {
    const doc = PagesDocument.load(TIKA2013);
    const drawable = doc.drawables().find((d) => d.geometry()?.x !== undefined)!;
    const g = drawable.geometry()!;
    drawable.setGeometry({ x: (g.x ?? 0) + 10, y: (g.y ?? 0) + 20 });
    const id = drawable.id;
    const doc2 = PagesDocument.load(doc.save());
    const moved = doc2.drawables().find((d) => d.id === id)!.geometry()!;
    expect(Math.round(moved.x! - g.x!)).toBe(10);
    expect(Math.round(moved.y! - g.y!)).toBe(20);
  });

  it("numbers and keynote documents survive text edits", () => {
    const numbers = NumbersDocument.load(fixture("tika-testNumbers2013.numbers"));
    const storage = numbers.textStorages().find((s) => s.text.length > 5);
    if (storage) {
      const before = storage.text;
      storage.replaceRange(0, 1, before[0]!.toUpperCase());
    }
    const reloaded = NumbersDocument.load(numbers.save());
    expect(reloaded.sheets().length).toBe(numbers.sheets().length);

    const keynote = KeynoteDocument.load(fixture("tika-testKeynote2018.key"));
    const slides = keynote.slideCount();
    const saved = KeynoteDocument.load(keynote.save());
    expect(saved.slideCount()).toBe(slides);
  });
});
