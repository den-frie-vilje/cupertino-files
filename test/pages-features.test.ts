import { readFileSync } from "node:fs";
import { describe, expect, it } from "./harness.ts";
import { PagesDocument } from "../src/index.ts";

const FIXTURES = new URL("../fixtures/", import.meta.url);
const fixture = (name: string) => new Uint8Array(readFileSync(new URL(name, FIXTURES)));

/**
 * Feature coverage against REAL Apple-written documents. Each case asserts
 * behavior that was previously only spec-derived, so these are the tests
 * that prove the model matches what the apps actually write.
 */
describe("Pages features on real documents", () => {
  it("reads image filters written by Apple", () => {
    // saturation -1 is full desaturation — the Black & White adjustment.
    const doc = PagesDocument.load(fixture("vertx-v2.2-image-filters.pages"));
    const filtered = doc.images().filter((i) => i.hasFilters);
    expect(filtered.length).toBe(1);
    const filters = filtered[0]!.filters();
    expect(filters.saturation).toBe(-1);
    expect(filters.exposure).toBe(1);
    expect(filters.enhance).toBe(false);
    // Untouched adjustments stay absent rather than defaulting to 0.
    expect(filters.gamma).toBe(undefined);
    expect(filtered[0]!.isMaterialized).toBe(true);
    expect(filtered[0]!.data()!.length).toBeGreaterThan(1000);
  });

  it("reads filters and masks together", () => {
    const doc = PagesDocument.load(fixture("rougier-v13.1-image-filters-masks.pages"));
    const images = doc.images();
    expect(images.length).toBeGreaterThan(10);
    expect(images.filter((i) => i.hasMask).length).toBeGreaterThan(5);
    const both = images.find((i) => i.hasMask && i.hasFilters)!;
    expect(both.filters().saturation).toBe(-1);
  });

  it("edits filters on a real document and round-trips", () => {
    const doc = PagesDocument.load(fixture("vertx-v2.2-image-filters.pages"));
    const id = doc.images().find((i) => i.hasFilters)!.id;
    doc.images().find((i) => i.id === id)!.setFilters({ saturation: 0.5, contrast: 0.2 });
    const reloaded = PagesDocument.load(doc.save());
    const filters = reloaded.images().find((i) => i.id === id)!.filters();
    expect(Math.fround(0.5)).toBe(filters.saturation);
    expect(Math.fround(0.2)).toBe(filters.contrast);
    // Pre-existing exposure survives a partial update.
    expect(filters.exposure).toBe(1);
  });

  it("reads header and footer text across multiple sections", () => {
    const doc = PagesDocument.load(fixture("threatconnect-v11.1-headers-footers-sections.pages"));
    const sections = doc.sections();
    expect(sections.length).toBe(3);
    for (const section of sections) {
      expect(section.headerText()).toBe("Expressions");
      // The footer contains a page-number field, anchored at U+FFFC.
      expect(section.footerText().startsWith("Page")).toBe(true);
      expect(section.footerText()).toContain("￼");
    }
    // Section ranges tile the body without gaps.
    expect(sections[0]!.start).toBe(0);
    for (let i = 1; i < sections.length; i++) {
      expect(sections[i]!.start).toBe(sections[i - 1]!.end);
    }
    expect(sections[sections.length - 1]!.end).toBe(doc.bodyText.length);
  });

  it("edits header text on a real multi-section document", () => {
    const doc = PagesDocument.load(fixture("threatconnect-v11.1-headers-footers-sections.pages"));
    doc.sections()[1]!.setHeaderText("Rewritten Header");
    const reloaded = PagesDocument.load(doc.save());
    expect(reloaded.sections()[1]!.headerText()).toBe("Rewritten Header");
    expect(reloaded.sections().length).toBe(3);
  });

  it("reads many sections and real footnotes", () => {
    const doc = PagesDocument.load(fixture("picopalette-v3.2-multisection-footnotes.pages"));
    expect(doc.sections().length).toBe(14);
    const footnotes = doc.footnotes();
    expect(footnotes.length).toBe(8);
    // Footnote references are anchored at U+000E (SHIFT OUT) — NOT the
    // U+FFFC object-replacement character, which marks drawable and TOC
    // attachments. Confirmed against this document's 8 real footnotes.
    for (const footnote of footnotes) {
      expect(doc.bodyText.charCodeAt(footnote.anchorIndex)).toBe(0x000e);
      expect(footnote.storage.text.length).toBeGreaterThan(5);
    }
    // U+FFFC is used by the separate attachment table, and the counts agree.
    const attachmentChars = (doc.bodyText.match(/\uFFFC/g) ?? []).length;
    expect(attachmentChars).toBe(doc.attachments().length);
    expect(footnotes.some((f) => f.storage.text.includes("Phishing"))).toBe(true);
    // Anchors are in ascending document order.
    const anchors = footnotes.map((f) => f.anchorIndex);
    expect(anchors).toEqual([...anchors].sort((a, b) => a - b));
  });

  it("reads comments with their anchor ranges", () => {
    const doc = PagesDocument.load(fixture("draftjs-v2.3-comments.pages"));
    const comments = doc.comments();
    expect(comments.length).toBe(3);
    for (const comment of comments) {
      expect(comment.end).toBeGreaterThan(comment.start);
      expect(comment.text.length).toBeGreaterThan(0);
    }
  });

  it("reads hyperlinks of several schemes", () => {
    const doc = PagesDocument.load(fixture("draftjs-v2.3-comments.pages"));
    const urls = doc.links().map((l) => l.url);
    expect(urls.length).toBeGreaterThan(0);
    expect(urls.some((u) => u.startsWith("http://"))).toBe(true);
    expect(urls.some((u) => u.startsWith("mailto:"))).toBe(true);
    // Every link range maps to real text.
    for (const link of doc.links()) {
      expect(link.end).toBeGreaterThan(link.start);
      expect(doc.bodyText.slice(link.start, link.end).length).toBeGreaterThan(0);
    }
  });

  it("preserves change-tracking data through an edit", () => {
    const doc = PagesDocument.load(fixture("ndpi-v10.0-change-tracking.pages"));
    const body = doc.body.object.message;
    expect(body.has(21)).toBe(true); // table_insertion
    expect(body.has(22)).toBe(true); // table_deletion
    const insertionsBefore = body.getMessage(21)!.getMessages(1).length;

    expect(doc.links().length).toBeGreaterThan(0);
    expect(doc.bookmarks().length).toBe(2);
    expect(doc.sections()[0]!.headerText()).toContain("nDPI");

    // An append must not disturb the change-tracking tables.
    doc.appendParagraph("Appended by iwork-files.");
    const reloaded = PagesDocument.load(doc.save());
    const reloadedBody = reloaded.body.object.message;
    expect(reloadedBody.getMessage(21)!.getMessages(1).length).toBe(insertionsBefore);
    // The document ends with a paragraph terminator, and appendParagraph
    // preserves that convention rather than dropping the trailing newline.
    expect(reloaded.paragraphs().at(-1)!.text).toBe("Appended by iwork-files.");
  });

  it("handles page-layout documents", () => {
    // Page-layout documents are marked by TP.SettingsArchive.body = false,
    // NOT by a missing body storage: they still carry an (empty) body flow,
    // with the real content in text boxes.
    for (const name of ["vertx-v2.2-image-filters.pages", "rougier-v13.1-image-filters-masks.pages"]) {
      const doc = PagesDocument.load(fixture(name));
      expect(doc.isPageLayout).toBe(true);
      expect(doc.bodyText).toBe("");
      expect(doc.bodyOrUndefined !== undefined).toBe(true);
      expect(doc.links().length).toBe(0);
      // Text is reachable through text boxes instead.
      expect(doc.textBoxes().length).toBeGreaterThan(0);
      expect(doc.textBoxes().some((t) => t.storage.text.trim().length > 0)).toBe(true);
    }
  });

  it("reads tables and headers together in a modern document", () => {
    const doc = PagesDocument.load(fixture("picodocs-v14.4-headers-tables.pages"));
    expect(doc.compatibility().era).toBe("modern");
    expect(doc.sections().length).toBe(2);
    expect(doc.sections()[0]!.headerText().length).toBeGreaterThan(0);
    const tables = doc.tables();
    expect(tables.length).toBe(3);
    for (const table of tables) {
      expect(table.storageGeneration).toBe("v5");
      expect(table.cells().length).toBeGreaterThan(0);
    }
  });
});
