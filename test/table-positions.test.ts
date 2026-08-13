/**
 * Where may an attribute-table entry sit?
 *
 * Measured across every storage in the corpus: no table carries an entry
 * past `text.length`; the character-content tables (character styles,
 * smart fields, anchors, language runs) never carry one at `text.length`
 * either — a run reaching the end of the text is left open — while the
 * paragraph-family tables carry one there exactly when a final empty
 * paragraph exists to describe: empty text, or text ending with a
 * terminator. A boundary stranded at the length is a state no app file
 * exhibits, and Pages answers attribute-table states it never writes
 * with document-wide style repair — far from the edit that caused it,
 * which is what makes the class worth refusing at save.
 */
import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "./harness.ts";
import { IWorkDocument, PagesDocument } from "../src/index.ts";
import { RawMessage } from "../src/base/protobuf.ts";

const FIXTURES = new URL("../fixtures/", import.meta.url);
const TABLE_CHAR_STYLE = 8;
const TABLE_SMARTFIELD = 11;

const tablePositions = (doc: PagesDocument, field: number): number[] =>
  (doc.store.resolve(doc.body.id)?.message.getMessage(field)?.getMessages(1) ?? []).map(
    (entry) => entry.getUint(1) ?? 0,
  );

/** The report's letterhead: styled titles, a grey placeholder tail. */
function letterhead(): { doc: PagesDocument; last: number } {
  const doc = PagesDocument.blank();
  doc.createParagraphStyle({
    name: "Brevtitel",
    copyOf: "Title",
    character: { fontName: "Avenir Next", fontSize: 28 },
  });
  doc.appendParagraph("Bestyrelsens beretning", "Brevtitel");
  doc.appendParagraph("Årsregnskab 2026", "Brevtitel");
  const last = doc.appendParagraph("Skriv brevets emne her", "Body");
  doc.body.insertText(doc.body.text.length, "\n");
  const paragraph = doc.paragraphs()[last]!;
  doc.applyCharacterFormatting(paragraph.start, paragraph.end, {
    fontColor: { r: 0.6, g: 0.6, b: 0.6 },
  });
  doc.body.defineAsPlaceholder(paragraph.start, paragraph.end);
  return { doc, last };
}

describe("attribute-table entry positions", () => {
  it("every corpus storage is lawful under the same rule the writer enforces", () => {
    let storages = 0;
    for (const name of readdirSync(FIXTURES)) {
      if (!/\.(pages|numbers|key)$/.test(name)) continue;
      let doc: IWorkDocument;
      try {
        doc = IWorkDocument.open(new Uint8Array(readFileSync(new URL(name, FIXTURES))));
      } catch {
        continue; // pre-IWA files are another test's problem
      }
      for (const storage of doc.textStorages()) {
        storages++;
        const violation = storage.tablePositionViolation();
        const label = violation ? `${violation.table} at ${violation.position}` : "lawful";
        expect(`${name} storage ${storage.id}: ${label}`).toBe(
          `${name} storage ${storage.id}: lawful`,
        );
      }
    }
    expect(storages).toBeGreaterThan(2900);
  });

  it("deleting the final terminator does not strand run boundaries at the length", () => {
    // The field report's sequence, verbatim: a last paragraph carrying a
    // character-style run and a placeholder field, restyled, then the
    // trailing terminator deleted and the document saved.
    const { doc, last } = letterhead();
    doc.paragraph(last).setStyle("Body");
    const length = doc.body.text.length;
    doc.body.deleteRange(length - 1, length);

    const reread = PagesDocument.load(doc.save());
    const textLength = reread.body.text.length;
    for (const field of [TABLE_CHAR_STYLE, TABLE_SMARTFIELD]) {
      for (const position of tablePositions(reread, field)) {
        expect(position).toBeLessThan(textLength);
      }
    }
    // The runs themselves survive, open at the text end: the grey span
    // still reads grey, the placeholder still lists, and the titles kept
    // their style's font — the report's symptom was exactly these
    // resolutions shifting.
    expect(reread.body.placeholders().length).toBe(1);
    const title = reread.paragraphs()[0]!;
    expect(reread.body.characterFormattingAt(title.start).fontName).toBe("Avenir Next");
    expect(reread.paragraphs()[0]!.styleName).toBe("Brevtitel");
  });

  it("clearing a styled storage with setText strands nothing at position zero", () => {
    const doc = PagesDocument.blank();
    doc.appendParagraph("Farvet linje", "Body");
    doc.applyCharacterFormatting(0, 7, { fontColor: { r: 1, g: 0, b: 0 } });
    doc.body.setText("");
    const positions = tablePositions(doc, TABLE_CHAR_STYLE);
    expect(positions.length).toBe(0);
    doc.save();
  });

  it("save refuses a hand-mangled table instead of persisting it", () => {
    const doc = PagesDocument.blank();
    doc.appendParagraph("Tekst", "Body");
    doc.applyCharacterFormatting(0, 5, { bold: true });
    const storageMessage = doc.store.resolve(doc.body.id)!.message;
    const entry = RawMessage.create();
    entry.setVarint(1, doc.body.text.length);
    storageMessage.getMessage(TABLE_CHAR_STYLE)!.addMessage(1, entry);
    expect(() => doc.save()).toThrow(/table_char_style entry at position/);
  });
});

describe("normalizeTail", () => {
  it("drops the trailing terminator and the phantom paragraph with it", () => {
    const doc = PagesDocument.blank();
    doc.appendParagraph("Første", "Body");
    doc.appendParagraph("Sidste", "Body");
    doc.body.insertText(doc.body.text.length, "\n");
    expect(doc.body.endsWithEmptyParagraph).toBe(true);

    expect(doc.body.normalizeTail()).toBe(true);
    expect(doc.body.endsWithEmptyParagraph).toBe(false);
    expect(doc.paragraphs().map((p) => p.text)).toEqual(["Første", "Sidste"]);
    // Idempotent, and a no-op on the bare tail it just produced.
    expect(doc.body.normalizeTail()).toBe(false);
    PagesDocument.load(doc.save());
  });

  it("is the safe form of the tail edit over a placeholder", () => {
    const { doc } = letterhead();
    expect(doc.body.normalizeTail()).toBe(true);
    const reread = PagesDocument.load(doc.save());
    expect(reread.body.tablePositionViolation()).toBe(undefined);
    expect(reread.body.placeholders().length).toBe(1);
  });

  it("leaves a section break alone", () => {
    const doc = PagesDocument.blank();
    doc.appendParagraph("Tekst", "Body");
    doc.body.insertText(doc.body.text.length, "\u0004");
    expect(doc.body.normalizeTail()).toBe(false);
    expect(doc.body.text.endsWith("\u0004")).toBe(true);
  });
});
