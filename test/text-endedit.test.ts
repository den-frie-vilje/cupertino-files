/**
 * Edits that reach the end of the storage, and the offset-safety layer.
 *
 * The para-style table's entry at text.length is the style entry of the
 * final empty paragraph that exists exactly when the text ends with a
 * paragraph terminator — corpus-wide, 31 of 31 terminator-ending storages
 * carry it and 0 of 1270 others do. A final empty paragraph left without
 * its entry makes Pages drop styling for the whole body, which is
 * invisible to every offline reader; these tests pin the table shape the
 * biconditional demands, through the edits a field report showed writing
 * the wrong shape: deleting to the storage's end, emptying the final
 * paragraph, and rewriting it.
 */
import { describe, expect, it } from "./harness.ts";
import { PagesDocument } from "../src/index.ts";
import {
  ATTR_TABLE_ENTRIES,
  ENTRY_CHARACTER_INDEX,
  OBJECT_TABLE_FIELDS,
  PARA_ALIGNED_OBJECT_TABLES,
  Storage,
} from "../src/tswp/schema.ts";

/** A four-paragraph body in the donor's named styles, no trailing newline. */
function make(): PagesDocument {
  const doc = PagesDocument.blank();
  doc.appendParagraph("Masthead", "Title");
  doc.appendParagraph("Middle one", "Body");
  doc.appendParagraph("Middle two", "Body");
  doc.appendParagraph("Tail paragraph", "Heading");
  return doc;
}

function paraStyleEntryPositions(doc: PagesDocument): number[] {
  const table = doc.body.object.message.getMessage(Storage.TABLE_PARA_STYLE);
  return (table?.getMessages(ATTR_TABLE_ENTRIES) ?? []).map(
    (e) => e.getUint(ENTRY_CHARACTER_INDEX) ?? 0,
  );
}

/** The measured rule: one entry per paragraph start, plus one at text.length
 *  exactly when the text ends with a terminator — dense for the para-style
 *  table, and no sparse table may hold a position outside that set. */
function expectAligned(doc: PagesDocument): void {
  const text = doc.body.text;
  const starts = doc.body.paragraphStarts();
  const endsWithTerminator = text.length > 0 && text.endsWith("\n");
  const expected = endsWithTerminator ? [...starts, text.length] : starts;
  expect(paraStyleEntryPositions(doc).join(",")).toBe(expected.join(","));
  const allowed = new Set(expected);
  for (const field of PARA_ALIGNED_OBJECT_TABLES) {
    const table = doc.body.object.message.getMessage(field);
    for (const entry of table?.getMessages(ATTR_TABLE_ENTRIES) ?? []) {
      const position = entry.getUint(ENTRY_CHARACTER_INDEX) ?? 0;
      expect(`field ${field} entry at ${position} allowed: ${allowed.has(position)}`).toBe(
        `field ${field} entry at ${position} allowed: true`,
      );
    }
  }
}

function styleNames(doc: PagesDocument): (string | undefined)[] {
  return doc.paragraphs().map((p) => p.styleName);
}

describe("edits reaching the end of the storage", () => {
  it("deleting to the storage's end styles the final empty paragraph", () => {
    const doc = make();
    const paragraphs = doc.paragraphs();
    // Delete from the third paragraph's start to the very end.
    doc.range(paragraphs[2]!.start, doc.body.text.length).delete();

    // Text now ends with the terminator of "Middle one" — the final empty
    // paragraph needs its entry at text.length.
    expect(doc.body.text.endsWith("\n")).toBe(true);
    expectAligned(doc);

    const reloaded = PagesDocument.load(doc.save());
    expect(styleNames(reloaded).join("|")).toBe("Title|Body");
  });

  it("emptying the final paragraph keeps the masthead styled", () => {
    const doc = make();
    const last = doc.paragraphs().at(-1)!;
    doc.range(last.start, last.end).replaceWith("");

    expect(doc.body.text.endsWith("\n")).toBe(true);
    expectAligned(doc);

    const reloaded = PagesDocument.load(doc.save());
    expect(styleNames(reloaded)[0]).toBe("Title");
  });

  it("rewriting the final paragraph writes no end entry", () => {
    const doc = make();
    const last = doc.paragraphs().at(-1)!;
    doc.range(last.start, last.end).replaceWith("Signed");

    expect(doc.body.text.endsWith("\n")).toBe(false);
    expectAligned(doc);

    const reloaded = PagesDocument.load(doc.save());
    expect(styleNames(reloaded).join("|")).toBe("Title|Body|Body|Heading");
    expect(reloaded.paragraphs().at(-1)!.text).toBe("Signed");
  });

  it("removing a trailing terminator removes the end entry", () => {
    const doc = make();
    const len = doc.body.text.length;
    doc.body.replaceRange(len, len, "\n");
    expectAligned(doc); // entry at new text.length

    const withTerminator = doc.body.text.length;
    doc.body.replaceRange(withTerminator - 1, withTerminator, "");
    expect(doc.body.text.endsWith("\n")).toBe(false);
    expectAligned(doc); // and it is gone again
  });
});

describe("styling through replacements", () => {
  /** Format a span, return its anonymous character-style id. */
  function formatted(doc: PagesDocument, needle: string): { start: number; end: number; id: bigint } {
    const hit = doc.find(needle)[0]!;
    hit.format({ italic: true });
    const id = doc.body.characterStyleIdAt(hit.start)!;
    return { start: hit.start, end: hit.end, id };
  }

  it("an atomic replaceWith keeps the replaced span's character styling", () => {
    const doc = make();
    const span = formatted(doc, "Middle one");
    doc.range(span.start, span.end).replaceWith("Rewritten clause");

    // The replacement is ruled by the same character style…
    expect(doc.body.characterStyleIdAt(span.start)).toBe(span.id);
    // …and the run ends where the replacement ends: the next paragraph
    // is not italic.
    const after = doc.find("Middle two")[0]!;
    expect(doc.body.characterStyleIdAt(after.start)).toBe(undefined);
  });

  it("delete-then-insert inherits the boundary, not the deleted span — by contract", () => {
    // The deletion removes the span's style runs with it; the insert then
    // takes whatever rules the collapsed boundary. That is different from
    // replaceWith on purpose — each call is correct alone — and this pin
    // keeps the difference from drifting silently in either direction.
    const doc = make();
    const span = formatted(doc, "Middle one");
    doc.body.deleteRange(span.start, span.end);
    doc.body.insertText(span.start, "Rewritten clause");
    expect(doc.body.characterStyleIdAt(span.start)).toBe(undefined);
  });

  it("a replacement containing newlines styles every new paragraph like the span", () => {
    const doc = make();
    const tail = doc.paragraphs().at(-1)!; // "Tail paragraph", styled Heading
    doc.range(tail.start, tail.end).replaceWith("First bullet\nSecond bullet\nThird bullet");
    expectAligned(doc);

    const reloaded = PagesDocument.load(doc.save());
    const names = styleNames(reloaded);
    expect(names.slice(3).join("|")).toBe("Heading|Heading|Heading");
    expect(reloaded.paragraphs().length).toBe(6);
  });

  it("deleting the tail drops its fields without leaving entries past the end", () => {
    const doc = make();
    doc.appendParagraph("Visit example for details", "Body");
    const link = doc.find("example")[0]!;
    link.link("https://example.org");
    expect(doc.links().length).toBe(1);

    const paragraphs = doc.paragraphs();
    doc.range(paragraphs.at(-1)!.start, doc.body.text.length).delete();
    expect(doc.links().length).toBe(0);
    const length = doc.body.text.length;
    for (const field of OBJECT_TABLE_FIELDS) {
      const table = doc.body.object.message.getMessage(field);
      for (const entry of table?.getMessages(ATTR_TABLE_ENTRIES) ?? []) {
        const position = entry.getUint(ENTRY_CHARACTER_INDEX) ?? 0;
        expect(position <= length).toBe(true);
      }
    }
    expectAligned(doc);
  });
});

describe("offset safety", () => {
  it("refuses a range made stale by an earlier-offset edit", () => {
    const doc = make();
    const two = doc.find("Middle two")[0]!;
    doc.find("Middle one")[0]!.replaceWith("The first middle paragraph");
    expect(() => two.replaceWith("x")).toThrow(/stale TextRange/);
  });

  it("keeps the descending-order idiom working", () => {
    const doc = make();
    const one = doc.find("Middle one")[0]!;
    const two = doc.find("Middle two")[0]!;
    two.replaceWith("Second");
    one.replaceWith("First"); // edits after `one` all began at or after its end
    expect(doc.body.text.includes("First")).toBe(true);
    expect(doc.body.text.includes("Second")).toBe(true);
  });

  it("applyEdits takes any order from one snapshot and refuses overlap", () => {
    const doc = make();
    const paragraphs = doc.paragraphs();
    doc.applyEdits([
      { start: paragraphs[1]!.start, end: paragraphs[1]!.end, replacement: "En" },
      { start: paragraphs[2]!.start, end: paragraphs[2]!.end }, // delete the text
      { start: paragraphs[3]!.start, end: paragraphs[3]!.end, replacement: "Slut" },
    ]);
    expect(doc.paragraphs().map((p) => p.text).join("|")).toBe("Masthead|En||Slut");
    expectAligned(doc);

    expect(() => {
      doc.applyEdits([
        { start: 0, end: 5, replacement: "a" },
        { start: 4, end: 8, replacement: "b" },
      ]);
    }).toThrow(/overlapping/);
  });
});
