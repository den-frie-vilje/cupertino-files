/**
 * Page numbers and inline attachments.
 *
 * A page number is not text — no digits live in the storage, because the
 * value comes from pagination. It is a U+FFFC placeholder plus an archive
 * that renders it, which is why inserting one is not `insertText("1")` and
 * why nothing here claims to know what number will appear.
 */
import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "./harness.ts";
import {
  AttachmentKind,
  buildNumberAttachment,
  IWorkDocument,
  OBJECT_REPLACEMENT_CHARACTER,
  PagesDocument,
  PAGE_NUMBER_FORMATS,
  readNumberAttachment,
  type TextStorage,
} from "../src/index.ts";

const FIXTURES = new URL("../fixtures/", import.meta.url);
const fixtureNames = readdirSync(FIXTURES).filter((name) => /\.(pages|numbers|key)$/.test(name));
const bytes = (name: string) => new Uint8Array(readFileSync(new URL(name, FIXTURES)));

/** A Pages fixture whose footer already carries a page number. */
const WITH_PAGE_NUMBER = "threatconnect-v11.1-headers-footers-sections.pages";

function storageWithPageNumber(document: PagesDocument): TextStorage {
  const found = document
    .textStorages()
    .find((storage) => storage.pageNumberFields().length > 0);
  if (!found) throw new Error(`${WITH_PAGE_NUMBER} no longer has a page-number field`);
  return found;
}

describe("page number fields", () => {
  it("reads page numbers across the corpus", () => {
    let total = 0;
    const formats = new Set<string>();
    for (const name of fixtureNames) {
      let document: IWorkDocument;
      try {
        document = IWorkDocument.open(bytes(name));
      } catch {
        continue;
      }
      for (const storage of document.textStorages()) {
        for (const field of storage.pageNumberFields()) {
          total++;
          if (field.formatName !== undefined) formats.add(field.formatName);
        }
      }
    }
    expect(total).toBeGreaterThan(50);
    // Only the two formats the corpus contains, which is what we write.
    expect([...formats].sort()).toEqual(["decimal", "lower-roman"]);
  });

  it("sits at a placeholder character, not at digits", () => {
    const storage = storageWithPageNumber(PagesDocument.load(bytes(WITH_PAGE_NUMBER)));
    const field = storage.pageNumberFields()[0]!;
    expect(storage.text[field.index]).toBe(OBJECT_REPLACEMENT_CHARACTER);
    // "Page ￼" — the label is text, the number is not.
    expect(storage.text.includes("Page")).toBe(true);
    expect(/\d/.test(storage.text)).toBe(false);
  });

  it("distinguishes a page count from a page number", () => {
    let counts = 0;
    let numbers = 0;
    for (const name of fixtureNames) {
      let document: IWorkDocument;
      try {
        document = IWorkDocument.open(bytes(name));
      } catch {
        continue;
      }
      for (const storage of document.textStorages()) {
        for (const field of storage.pageNumberFields()) {
          if (field.isPageCount) counts++;
          else numbers++;
        }
      }
    }
    expect(counts).toBeGreaterThan(0);
    expect(numbers).toBeGreaterThan(counts);
  });

  it("inserts a page number that survives a save", () => {
    const document = PagesDocument.load(bytes(WITH_PAGE_NUMBER));
    const storage = document.textStorages().find((s) => s.text === "Expressions")!;
    const before = storage.text;
    const id = storage.insertPageNumber(before.length);

    expect(storage.text).toBe(`${before}${OBJECT_REPLACEMENT_CHARACTER}`);
    expect(storage.pageNumberFields().length).toBe(1);

    const reloaded = PagesDocument.load(document.save());
    const again = reloaded.textStorages().find((s) => s.id === storage.id)!;
    const field = again.pageNumberFields()[0]!;
    expect(field.objectId).toBe(id);
    expect(field.index).toBe(before.length);
    expect(field.isPageCount).toBe(false);
    expect(field.formatName).toBe("decimal");
    // Nothing pretends to know the page it will land on.
    expect(field.cachedValue).toBe(undefined);
  });

  it("anchors the attachment at the placeholder it inserted, not one short", () => {
    // The failure this guards against: adding the table entry before the
    // text shifts leaves every index off by one.
    const document = PagesDocument.load(bytes(WITH_PAGE_NUMBER));
    const storage = document.textStorages().find((s) => s.text === "Expressions")!;
    storage.insertPageNumber(4); // mid-word, so an off-by-one is visible
    const field = storage.pageNumberFields()[0]!;
    expect(field.index).toBe(4);
    expect(storage.text[field.index]).toBe(OBJECT_REPLACEMENT_CHARACTER);
    expect(storage.text).toBe(`Expr${OBJECT_REPLACEMENT_CHARACTER}essions`);
  });

  it("keeps existing attachments correct when one is inserted before them", () => {
    const document = PagesDocument.load(bytes(WITH_PAGE_NUMBER));
    const storage = storageWithPageNumber(document);
    const original = storage.pageNumberFields()[0]!;
    storage.insertPageNumber(0);

    const fields = storage.pageNumberFields().sort((a, b) => a.index - b.index);
    expect(fields.length).toBe(2);
    expect(fields[0]!.index).toBe(0);
    // The one that was already there moved along with the text.
    const moved = fields.find((f) => f.objectId === original.objectId)!;
    expect(moved.index).toBe(original.index + 1);
    expect(storage.text[moved.index]).toBe(OBJECT_REPLACEMENT_CHARACTER);
  });

  it("inserts a page count", () => {
    const document = PagesDocument.load(bytes(WITH_PAGE_NUMBER));
    const storage = document.textStorages().find((s) => s.text === "Expressions")!;
    storage.insertPageCount(0);
    const field = storage.pageNumberFields()[0]!;
    expect(field.isPageCount).toBe(true);
    expect(field.kind).toBe(AttachmentKind.PAGE_COUNT);
  });

  it("writes a roman-numeral page number", () => {
    const document = PagesDocument.load(bytes(WITH_PAGE_NUMBER));
    const storage = document.textStorages().find((s) => s.text === "Expressions")!;
    storage.insertPageNumber(0, { format: "lower-roman" });

    const reloaded = PagesDocument.load(document.save());
    const again = reloaded.textStorages().find((s) => s.id === storage.id)!;
    const field = again.pageNumberFields()[0]!;
    expect(field.formatName).toBe("lower-roman");
    expect(field.formatCode).toBe(PAGE_NUMBER_FORMATS["lower-roman"].code);
  });

  it("removes a page number and its placeholder together", () => {
    const document = PagesDocument.load(bytes(WITH_PAGE_NUMBER));
    const storage = storageWithPageNumber(document);
    const field = storage.pageNumberFields()[0]!;
    const before = storage.text;

    expect(storage.removeAttachment(field.objectId)).toBe(true);
    expect(storage.pageNumberFields().length).toBe(0);
    expect(storage.text.length).toBe(before.length - 1);
    expect(storage.text.includes(OBJECT_REPLACEMENT_CHARACTER)).toBe(false);
    expect(storage.removeAttachment(field.objectId)).toBe(false);

    const reloaded = PagesDocument.load(document.save());
    const again = reloaded.textStorages().find((s) => s.id === storage.id)!;
    expect(again.pageNumberFields().length).toBe(0);
  });

  it("refuses a format it cannot write correctly", () => {
    const document = PagesDocument.load(bytes(WITH_PAGE_NUMBER));
    const storage = document.textStorages()[0]!;
    // Not one of the two the corpus proves.
    expect(() =>
      storage.insertPageNumber(0, { format: "upper-roman" as "decimal" }),
    ).toThrow();
    // A code without its name, or vice versa, would make the file
    // self-contradictory.
    expect(() => storage.insertPageNumber(0, { formatCode: 4 })).toThrow();
    expect(() => storage.insertPageNumber(0, { formatName: "alpha" })).toThrow();
  });

  it("writes a harvested format when both halves are given", () => {
    const document = PagesDocument.load(bytes(WITH_PAGE_NUMBER));
    const storage = document.textStorages().find((s) => s.text === "Expressions")!;
    storage.insertPageNumber(0, { formatCode: 4, formatName: "upper-roman" });
    const field = storage.pageNumberFields()[0]!;
    expect(field.formatCode).toBe(4);
    expect(field.formatName).toBe("upper-roman");
  });

  it("rejects a position outside the text", () => {
    const document = PagesDocument.load(bytes(WITH_PAGE_NUMBER));
    const storage = document.textStorages().find((s) => s.text === "Expressions")!;
    expect(() => storage.insertPageNumber(9999)).toThrow();
    expect(() => storage.insertPageNumber(-1)).toThrow();
  });

  it("drops an anchor when its character is deleted, not just when text shifts", () => {
    // Regression: an entry at exactly the start of a deleted range is a run
    // boundary in a run table (it survives) but an anchor in an attachment
    // table (it must go). Treating both alike left attachments pointing at
    // whatever character moved into the gap.
    const document = PagesDocument.load(bytes(WITH_PAGE_NUMBER));
    const storage = document.textStorages().find((s) => s.text === "Expressions")!;
    storage.insertPageNumber(3);
    expect(storage.pageNumberFields().length).toBe(1);

    // Delete starting exactly at the placeholder.
    storage.deleteRange(3, 5);
    expect(storage.pageNumberFields().length).toBe(0);
    expect(storage.text.includes(OBJECT_REPLACEMENT_CHARACTER)).toBe(false);
  });

  it("keeps an anchor when the deletion ends where it starts", () => {
    const document = PagesDocument.load(bytes(WITH_PAGE_NUMBER));
    const storage = document.textStorages().find((s) => s.text === "Expressions")!;
    storage.insertPageNumber(5);
    storage.deleteRange(1, 3); // entirely before the anchor
    const field = storage.pageNumberFields()[0]!;
    expect(field.index).toBe(3);
    expect(storage.text[field.index]).toBe(OBJECT_REPLACEMENT_CHARACTER);
  });

  it("keeps run boundaries that sit at a deletion's start", () => {
    // The other half of the same distinction: character-run tables must
    // still keep their boundary entry, or formatting collapses on delete.
    const document = PagesDocument.load(bytes(WITH_PAGE_NUMBER));
    const storage = document.textStorages().find((s) => s.text === "Expressions")!;
    storage.insertLink(2, 8, "https://example.com");
    expect(storage.links().length).toBe(1);
    storage.deleteRange(2, 4);
    // The link is shorter but still there — its start entry survived.
    const link = storage.links()[0]!;
    expect(link.start).toBe(2);
    expect(link.url).toBe("https://example.com");
  });

  it("builds the archive Apple writes", () => {
    const document = PagesDocument.load(bytes(WITH_PAGE_NUMBER));
    const existing = storageWithPageNumber(document).pageNumberFields()[0]!;
    const original = document.store.object(existing.objectId)!;
    const component = document.store.componentOf(original.identifier)!;
    const built = buildNumberAttachment(document.store, component, {});

    const info = readNumberAttachment(built)!;
    const reference = readNumberAttachment(original)!;
    expect(info.kind).toBe(reference.kind);
    expect(info.formatCode).toBe(reference.formatCode);
    expect(info.formatName).toBe(reference.formatName);
  });
});
