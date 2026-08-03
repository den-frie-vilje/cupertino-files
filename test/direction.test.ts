/**
 * Paragraph base direction — the storage's bidi table.
 *
 * The pair an app-flipped paragraph carries is (1, 0): first slot the
 * direction (0 LTR, 1 RTL, 65535 natural), second slot 0, or 65535 when
 * the first is natural; the paragraph style is untouched. These pins keep
 * the writer on that exact shape — one wrong slot renders LTR.
 */
import { describe, expect, it } from "./harness.ts";
import { PagesDocument } from "../src/index.ts";
import {
  ATTR_TABLE_ENTRIES,
  ENTRY_CHARACTER_INDEX,
  ENTRY_PARA_FIRST,
  ENTRY_PARA_SECOND,
  Storage,
} from "../src/tswp/schema.ts";

function make(): PagesDocument {
  const doc = PagesDocument.blank();
  doc.appendParagraph("First paragraph.", "Body");
  doc.appendParagraph("עברית מיושרת לימין", "Body");
  doc.appendParagraph("Last paragraph.", "Body");
  return doc;
}

function bidiEntries(doc: PagesDocument): { start: number; first: number; second: number }[] {
  const table = doc.body.object.message.getMessage(Storage.TABLE_PARA_BIDI);
  return (table?.getMessages(ATTR_TABLE_ENTRIES) ?? []).map((entry) => ({
    start: entry.getUint(ENTRY_CHARACTER_INDEX) ?? 0,
    first: Number(entry.getVarint(ENTRY_PARA_FIRST) ?? 65535n),
    second: Number(entry.getVarint(ENTRY_PARA_SECOND) ?? 65535n),
  }));
}

describe("paragraph direction", () => {
  it("writes the measured (1, 0) pair and reads it back through a save", () => {
    const doc = make();
    const rtl = doc.paragraphs().findIndex((p) => p.text.startsWith("עברית"));
    doc.body.setParagraphDirection(rtl, "rtl");
    expect(doc.body.paragraphDirection(rtl)).toBe("rtl");

    const reloaded = PagesDocument.load(doc.save());
    expect(reloaded.body.paragraphDirection(rtl)).toBe("rtl");
    const start = reloaded.body.paragraphStarts()[rtl]!;
    const entry = bidiEntries(reloaded).find((e) => e.start === start)!;
    expect(`${entry.first},${entry.second}`).toBe("1,0");
    // Neighbours keep their own entries, so no run bleeds.
    expect(reloaded.body.paragraphDirection(rtl - 1)).not.toBe("rtl");
    expect(reloaded.body.paragraphDirection(rtl + 1)).not.toBe("rtl");
  });

  it("round-trips ltr and natural through the handle sugar", () => {
    const doc = make();
    doc.paragraph(0).setDirection("ltr");
    doc.paragraph(2).setDirection("natural");
    const reloaded = PagesDocument.load(doc.save());
    expect(reloaded.paragraph(0).direction).toBe("ltr");
    expect(reloaded.paragraph(2).direction).toBe("natural");
    const entries = bidiEntries(reloaded);
    const starts = reloaded.body.paragraphStarts();
    expect(entries.find((e) => e.start === starts[0])!.first).toBe(0);
    expect(`${entries.find((e) => e.start === starts[2])!.first},${entries.find((e) => e.start === starts[2])!.second}`).toBe(
      "65535,65535",
    );
  });

  it("keeps direction attached to its paragraph through earlier edits", () => {
    const doc = make();
    const rtl = doc.paragraphs().findIndex((p) => p.text.startsWith("עברית"));
    doc.body.setParagraphDirection(rtl, "rtl");
    doc.find("First paragraph.")[0]!.replaceWith("A much longer first paragraph than before.");
    expect(doc.body.paragraphDirection(rtl)).toBe("rtl");
    const start = doc.body.paragraphStarts()[rtl]!;
    expect(bidiEntries(doc).find((e) => e.start === start)!.first).toBe(1);
  });
});
