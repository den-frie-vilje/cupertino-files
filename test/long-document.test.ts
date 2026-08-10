/**
 * Building a long document by appending to a template — the failure
 * modes that pass a text-and-style check and only show up in a render.
 *
 * Each of these is a way a document can come out wrong while every
 * assertion an author would naturally write still passes: a heading that
 * has silently left the table of contents, ninety paragraphs that became
 * list items without their style changing, a picture drawn outside the
 * column its paragraph sits in.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "./harness.ts";
import { PagesDocument } from "../src/index.ts";
import { findDrawableCore } from "../src/tsd/drawables.ts";
import { Drawable, ExteriorTextWrap, Geometry, TEXT_WRAP_IN_FLOW, TEXT_WRAP_ON_PAGE } from "../src/tsd/schema.ts";
import { RawMessage } from "../src/base/protobuf.ts";
import { ParaProps, Storage, StyleArchive } from "../src/tswp/schema.ts";

const FIXTURES = new URL("../fixtures/", import.meta.url);
const fixture = (name: string) => new Uint8Array(readFileSync(new URL(name, FIXTURES)));

/** A 100×50 PNG header — enough for the size reader, no pixels needed. */
const PNG = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0x0d, 0x49, 0x48, 0x44, 0x52,
  0, 0, 0, 0x64, 0, 0, 0, 0x32, 8, 6, 0, 0, 0,
]);

describe("direct formatting keeps the style's name", () => {
  it("a formatted heading still reads as its named style, before and after a save", () => {
    // The failure this pins: format() parents the paragraph on an
    // anonymous style, and a table of contents collects by named style.
    // A heading that reports no style is a heading that has left the TOC.
    const doc = PagesDocument.blank();
    const i = doc.appendParagraph("Chapter One", "Heading");
    expect(doc.paragraph(i).styleName).toBe("Heading");
    expect(doc.paragraph(i).hasDirectFormatting).toBe(false);

    doc.paragraph(i).format({ keepWithNext: true });
    expect(doc.paragraph(i).styleName).toBe("Heading");
    expect(doc.paragraph(i).hasDirectFormatting).toBe(true);

    const reloaded = PagesDocument.load(doc.save());
    expect(reloaded.paragraph(i).styleName).toBe("Heading");
    expect(reloaded.paragraph(i).hasDirectFormatting).toBe(true);
  });

  it("reads names in app-written documents, where anonymous styles are the norm", () => {
    // Every paragraph of this fixture sits on an anonymous style, so a
    // reader that stops at the applied object names nothing at all.
    const doc = PagesDocument.load(fixture("iwork-mcp-v14.5-sample.pages"));
    const named = doc.paragraphs().map((_, i) => doc.paragraph(i).styleName);
    expect(named.every((name) => name !== undefined)).toBe(true);
    expect(doc.paragraphs().every((_, i) => doc.paragraph(i).hasDirectFormatting)).toBe(true);
    expect(doc.paragraphStylesInUse().length).toBeGreaterThan(0);
  });

  it("lists the styles a template defines without the anonymous ones", () => {
    const doc = PagesDocument.load(fixture("picodocs-v14.4-headers-tables.pages"));
    const defined = doc.paragraphStyles();
    expect(defined.every((s) => (s.name ?? "").length > 0)).toBe(true);
    // What it uses is a much shorter list than what it defines, which is
    // the point of asking separately.
    const used = doc.paragraphStylesInUse();
    expect(used.length).toBeLessThan(defined.length);
    expect(used.map((u) => u.name).includes("Body")).toBe(true);
    // Most-used first.
    expect(used[0]!.count >= used[used.length - 1]!.count).toBe(true);
  });
});

describe("appended paragraphs state their own list membership", () => {
  it("a bullet does not turn the rest of the document into a list", () => {
    // The reported failure: one bulleted paragraph, then every later
    // append is a list item too — invisibly, because membership lives in
    // the list table and the paragraph style still reads "Body".
    const doc = PagesDocument.blank();
    doc.appendParagraph("Introduction paragraph.", "Body");
    const bullet = doc.appendParagraph("A bulleted item", "Body", "Bullet");
    const after = [
      doc.appendParagraph("Plain body after the bullet", "Body"),
      doc.appendParagraph("Another plain body", "Body"),
      doc.appendParagraph("Chapter Two", "Heading"),
    ];

    expect(doc.paragraph(bullet).listStyleName).toBe("Bullet");
    for (const i of after) {
      expect(`¶${i}: ${String(doc.paragraph(i).listStyleName)}`).toBe(`¶${i}: None`);
    }
    // And the style each paragraph was asked for is untouched.
    expect(doc.paragraph(after[2]!).styleName).toBe("Heading");

    const reloaded = PagesDocument.load(doc.save());
    expect(reloaded.paragraph(bullet).listStyleName).toBe("Bullet");
    expect(reloaded.paragraph(after[0]!).listStyleName).toBe("None");
  });

  it("holds across a long build, which is where the fault was found", () => {
    const doc = PagesDocument.blank();
    doc.appendParagraph("Manual", "Title");
    const listItems: number[] = [];
    for (let chapter = 0; chapter < 10; chapter++) {
      doc.appendParagraph(`Chapter ${chapter + 1}`, "Heading");
      doc.appendParagraph("Body text for this chapter.", "Body");
      listItems.push(doc.appendParagraph(`Step ${chapter + 1}`, "Body", "Bullet"));
      doc.appendParagraph("Closing body text.", "Body");
    }
    const bulleted = doc
      .paragraphs()
      .map((_, i) => i)
      .filter((i) => doc.paragraph(i).listStyleName === "Bullet");
    expect(bulleted.join(",")).toBe(listItems.join(","));
  });

  it("says whether the app will draw an empty paragraph at the end", () => {
    const doc = PagesDocument.blank();
    doc.appendParagraph("Only paragraph", "Body");
    expect(doc.body.endsWithEmptyParagraph).toBe(false);
    // A template whose body ends with a terminator keeps that convention,
    // and the app draws one more paragraph than paragraphs() lists.
    doc.body.setText("One\nTwo\n");
    expect(doc.body.endsWithEmptyParagraph).toBe(true);
    expect(doc.paragraphs().length).toBe(2);
  });
});

describe("sections survive edits at their first character", () => {
  it("rewriting paragraph 0 of a sectioned document keeps its section list", () => {
    // The section table's entry marks where a section begins — 25 of 25
    // sectioned corpus bodies keep their first entry at 0 — so an edit
    // landing there must not take the entry with it. Treating the table
    // as point-anchored made rewriting paragraph 0 destroy pagination.
    const doc = PagesDocument.load(fixture("picodocs-v14.4-headers-tables.pages"));
    expect(doc.sections().length).toBe(2);
    doc.paragraph(0).text = "A rewritten opening paragraph.";
    expect(doc.sections().length).toBe(2);
    const reloaded = PagesDocument.load(doc.save());
    expect(reloaded.sections().length).toBe(2);
    expect(reloaded.bodyText.startsWith("A rewritten opening paragraph.")).toBe(true);
  });

  it("deleting a whole section's text merges it away", () => {
    // Removing every character from the section start through its
    // boundary terminator collapses the two entries onto one position,
    // where the later entry wins — one section remains.
    const doc = PagesDocument.load(fixture("picodocs-v14.4-headers-tables.pages"));
    const boundary = doc.body.text.indexOf("\u0004");
    doc.body.deleteRange(0, boundary + 1);
    expect(doc.sections().length).toBe(1);
    expect(PagesDocument.load(doc.save()).sections().length).toBe(1);
  });
});

describe("a left indent is written as the pair Apple writes", () => {
  it("adds the matching first line, so the paragraph indents in the app", () => {
    // A style setting left_indent alone reads back correctly and does not
    // indent in Pages. Of 8647 corpus styles setting it, 8645 set
    // first_line_indent beside it.
    const doc = PagesDocument.blank();
    const i = doc.appendParagraph("Indented paragraph.", "Body");
    doc.paragraph(i).format({ leftIndent: 113.4 });

    const reloaded = PagesDocument.load(doc.save());
    const styleId = reloaded.body.effectiveObjectAt(
      Storage.TABLE_PARA_STYLE,
      reloaded.body.paragraphStarts()[i]!,
    )!;
    const bag = reloaded.store.object(styleId)!.message.getMessage(StyleArchive.PARA_PROPERTIES)!;
    expect(bag.getFloat(ParaProps.LEFT_INDENT)).toBe(113.4000015258789);
    expect(bag.getFloat(ParaProps.FIRST_LINE_INDENT)).toBe(113.4000015258789);
  });

  it("leaves a hanging indent alone when the caller states both", () => {
    const doc = PagesDocument.blank();
    const i = doc.appendParagraph("Hanging paragraph.", "Body");
    doc.paragraph(i).format({ leftIndent: 81, firstLineIndent: 54 });

    const resolved = doc.body
      .sheet()!
      .style(doc.body.effectiveObjectAt(Storage.TABLE_PARA_STYLE, doc.body.paragraphStarts()[i]!)!)!
      .resolved().paragraph;
    expect(resolved.leftIndent).toBe(81);
    expect(resolved.firstLineIndent).toBe(54);
  });
});

describe("an inline image rides the text", () => {
  const wrapOf = (doc: PagesDocument): RawMessage | undefined => {
    for (const storage of doc.textStorages()) {
      for (const attachment of storage.attachments()) {
        if (attachment.drawableId === undefined) continue;
        const object = doc.store.object(attachment.drawableId);
        const core = object ? findDrawableCore(object.message) : undefined;
        const wrap = core?.getMessage(Drawable.EXTERIOR_TEXT_WRAP);
        if (wrap) return wrap;
      }
    }
    return undefined;
  };

  it("writes the in-the-text-flow wrap the corpus shows, so an indented column carries it", () => {
    // Without this archive the app places the picture against the page
    // margin: it does not line up with an indented body, and the next
    // paragraph flows up beside it. Geometry cannot move it — the
    // position field is a cache the app recomputes.
    const doc = PagesDocument.blank();
    doc.appendParagraph("Before the picture.", "Body");
    doc.insertInlineImage(doc.body.text.length, PNG, { fileName: "screenshot.png" });

    const reloaded = PagesDocument.load(doc.save());
    const wrap = wrapOf(reloaded)!;
    expect(wrap.getUint(ExteriorTextWrap.TYPE)).toBe(TEXT_WRAP_IN_FLOW);
    // The rest of the bag, as measured on all 56 in-flow corpus images.
    expect(wrap.getUint(ExteriorTextWrap.DIRECTION)).toBe(2);
    expect(wrap.getUint(ExteriorTextWrap.FIT_TYPE)).toBe(1);
    expect(wrap.getFloat(ExteriorTextWrap.MARGIN)).toBe(12);
    expect(wrap.getFloat(ExteriorTextWrap.ALPHA_THRESHOLD)).toBe(0.5);
    expect(wrap.getBool(ExteriorTextWrap.IS_HTML_WRAP)).toBe(false);
  });

  it("places against the page when asked", () => {
    const doc = PagesDocument.blank();
    doc.appendParagraph("Before the picture.", "Body");
    doc.insertInlineImage(doc.body.text.length, PNG, { fileName: "wide.png", wrap: "page" });
    expect(wrapOf(PagesDocument.load(doc.save()))!.getUint(ExteriorTextWrap.TYPE)).toBe(
      TEXT_WRAP_ON_PAGE,
    );
  });

  it("carries the geometry flags and storage back-pointer every corpus image has", () => {
    const doc = PagesDocument.blank();
    doc.appendParagraph("Text.", "Body");
    const { imageId } = doc.insertInlineImage(doc.body.text.length, PNG, { fileName: "s.png" });

    const reloaded = PagesDocument.load(doc.save());
    const core = findDrawableCore(reloaded.store.object(imageId)!.message)!;
    const geometry = core.getMessage(Drawable.GEOMETRY)!;
    expect(geometry.getUint(Geometry.FLAGS)).toBe(3);
    expect(geometry.getFloat(Geometry.ANGLE)).toBe(0);
    // parent resolves to the storage the image is anchored in.
    const parentId = core.getMessage(Drawable.PARENT)?.getVarint(1);
    expect(parentId).toBe(reloaded.body.id);
  });

  it("reclaims the archives of an image whose anchor is gone", () => {
    const doc = PagesDocument.blank();
    doc.appendParagraph("Text.", "Body");
    const { imageId } = doc.insertInlineImage(doc.body.text.length, PNG, { fileName: "s.png" });
    const attachmentId = doc.body.attachments()[0]!.objectId;

    expect(doc.body.removeAttachment(attachmentId)).toBe(true);
    expect(doc.store.object(imageId) !== undefined).toBe(true);
    expect(doc.compact()).toBe(2);
    expect(doc.store.object(imageId)).toBe(undefined);
    expect(PagesDocument.load(doc.save()).images().length).toBe(0);
  });
});

describe("drawable lookup is a search, not an assertion", () => {
  it("returns undefined for an archive that is not a drawable", () => {
    // An attachment table lists footnote marks and smart fields beside
    // drawables, and their field 1 is not a `super` message. A search
    // that throws there takes a whole survey down with it.
    const notADrawable = RawMessage.create();
    notADrawable.setVarint(1, 42);
    expect(findDrawableCore(notADrawable)).toBe(undefined);

    const alsoNot = RawMessage.create();
    alsoNot.setString(1, "text");
    expect(findDrawableCore(alsoNot)).toBe(undefined);
  });
});

describe("character styling ends where the range ends", () => {
  it("a paragraph styled to the end of the text does not rule what is appended after it", () => {
    // The failure this pins: styling [start, end) where end is the end of
    // the text writes no closing entry, so the run stays open and every
    // later append lands inside it — a grey-italic note turns the rest of
    // the document grey and italic.
    const doc = PagesDocument.blank();
    doc.appendParagraph("Brødtekst før noten.", "Body");
    const note = doc.paragraph(doc.appendParagraph("→ Feedback: skriv her.", "Body")).range();
    expect(note.end).toBe(doc.body.text.length);
    const styleId = doc.applyCharacterFormatting(note.start, note.end, { italic: true });
    expect(doc.body.characterStyleIdAt(note.start)).toBe(styleId);

    const after = doc.paragraph(doc.appendParagraph("Brødtekst efter noten.", "Body")).range();
    expect(doc.body.characterStyleIdAt(after.start)).toBe(undefined);
    expect(doc.body.characterStyleIdAt(after.end - 1)).toBe(undefined);
    // The note keeps its styling; the run closed instead of moving.
    expect(doc.body.characterStyleIdAt(note.start)).toBe(styleId);

    const reloaded = PagesDocument.load(doc.save());
    expect(reloaded.body.characterStyleIdAt(after.start)).toBe(undefined);
    expect(reloaded.body.characterFormattingAt(after.start).italic ?? false).toBe(false);
  });

  it("closes the run with an objectless entry, the corpus run-end shape", () => {
    const doc = PagesDocument.blank();
    const first = doc.paragraph(doc.appendParagraph("Styled til enden", "Body")).range();
    doc.applyCharacterFormatting(first.start, doc.body.text.length, { bold: true });
    const boundary = doc.body.text.length;
    doc.appendParagraph("Næste afsnit", "Body");

    const runs = doc.body.characterStyleRuns();
    const closing = runs.find((r) => r.start === boundary);
    expect(closing !== undefined).toBe(true);
    expect(closing!.objectId).toBe(undefined);
  });

  it("appending over no open run leaves the table alone", () => {
    const doc = PagesDocument.blank();
    doc.appendParagraph("Første", "Body");
    const before = doc.body.characterStyleRuns().length;
    doc.appendParagraph("Andet", "Body");
    expect(doc.body.characterStyleRuns().length).toBe(before);
  });

  it("a mid-text range still resumes the surrounding style at its end", () => {
    const doc = PagesDocument.blank();
    const p = doc.paragraph(doc.appendParagraph("Et ord i midten fremhævet.", "Body")).range();
    const at = doc.body.text.indexOf("midten");
    const styleId = doc.applyCharacterFormatting(at, at + "midten".length, { bold: true });
    expect(doc.body.characterStyleIdAt(at)).toBe(styleId);
    expect(doc.body.characterStyleIdAt(at + "midten".length)).toBe(undefined);
    expect(doc.body.characterStyleIdAt(p.end - 1)).toBe(undefined);
  });

  it("rejects a non-integer bound instead of writing it", () => {
    // undefined and NaN pass every < comparison; without the integer
    // check they die as a BigInt conversion deep in the wire layer.
    const doc = PagesDocument.blank();
    doc.appendParagraph("Tekst", "Body");
    expect(() => {
      doc.body.setCharacterStyleRange(Number.NaN, 3, undefined);
    }).toThrow(/invalid range/);
    expect(() => {
      doc.body.setCharacterStyleRange(0, Number.NaN, undefined);
    }).toThrow(/invalid range/);
  });
});
