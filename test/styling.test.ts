/**
 * Styling: the shared TSD value vocabulary (fills, gradients, strokes,
 * shadows, padding) and the text styling built on top of it.
 *
 * The value codecs are checked against real archives wherever the corpus
 * has them, so these tests fail if our field numbers drift from Apple's.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "./harness.ts";
import {
  BorderPosition,
  Capitalization,
  hexColor,
  linearGradient,
  PagesDocument,
  readColor,
  readFill,
  readShadow,
  readStroke,
  ScriptPosition,
  solidStroke,
  StrikethruType,
  TabAlignment,
  UnderlineType,
  writeColor,
  writeFill,
  writeShadow,
  writeStroke,
  type Stroke,
} from "../src/index.ts";
import { RawMessage } from "../src/base/protobuf.ts";
import { ParaProps, StyleArchive, TSWP_TYPE } from "../src/tswp/schema.ts";

const FIXTURES = new URL("../fixtures/", import.meta.url);
const fixture = (name: string) => new Uint8Array(readFileSync(new URL(name, FIXTURES)));

describe("style value codecs", () => {
  it("round-trips colours including the display-P3 space", () => {
    // 26.x documents tag essentially every colour with an explicit rgbspace.
    // Dropping it on write would silently shift a P3 colour to sRGB.
    for (const color of [
      { r: 1, g: 0, b: 0 },
      { r: 0.2, g: 0.4, b: 0.6, a: 0.5 },
      { r: 0.1, g: 0.2, b: 0.3, space: "p3" as const },
      { r: 0, g: 0, b: 0, space: "srgb" as const },
    ]) {
      const back = readColor(RawMessage.parse(writeColor(color).toBytes()))!;
      expect(back.r).toBeCloseTo(color.r, 5);
      expect(back.g).toBeCloseTo(color.g, 5);
      expect(back.b).toBeCloseTo(color.b, 5);
      expect(back.space).toBe(color.space);
    }
  });

  it("parses hex colours in all three lengths", () => {
    expect(hexColor("#f00")).toEqual({ r: 1, g: 0, b: 0 });
    expect(hexColor("ffffff")).toEqual({ r: 1, g: 1, b: 1 });
    const translucent = hexColor("#00000080");
    expect(translucent.a).toBeCloseTo(0.502, 3);
    let message = "";
    try {
      hexColor("#zz");
    } catch (e) {
      message = String((e as Error).message);
    }
    expect(message).toContain("invalid hex colour");
  });

  it("round-trips gradients with their stops", () => {
    const fill = linearGradient({ r: 1, g: 1, b: 1 }, { r: 0, g: 0, b: 1 }, 0.8);
    const back = readFill(RawMessage.parse(writeFill(fill).toBytes()))!;
    expect(back.kind).toBe("gradient");
    if (back.kind !== "gradient") return;
    expect(back.gradient.type).toBe("linear");
    expect(back.gradient.stops.length).toBe(2);
    expect(back.gradient.stops[0]!.fraction).toBe(0);
    expect(back.gradient.stops[1]!.fraction).toBe(1);
    // Apple writes an explicit midpoint on every stop.
    expect(back.gradient.stops[0]!.inflection).toBe(0.5);
    expect(back.gradient.opacity).toBeCloseTo(0.8, 5);
  });

  it("round-trips dashed strokes as repeated floats, not varints", () => {
    // StrokePatternArchive.pattern is `repeated float`; encoding it as a
    // packed varint list would produce a stroke the apps cannot read.
    const dashed: Stroke = { color: { r: 0, g: 0, b: 0 }, width: 1, pattern: [4, 2, 1, 2] };
    const back = readStroke(RawMessage.parse(writeStroke(dashed).toBytes()))!;
    expect(back.pattern).toEqual([4, 2, 1, 2]);
    expect(back.width).toBe(1);

    for (const pattern of ["solid", "none"] as const) {
      const round = readStroke(RawMessage.parse(writeStroke({ pattern }).toBytes()))!;
      expect(round.pattern).toBe(pattern);
    }
  });

  it("round-trips shadows", () => {
    const shadow = {
      color: { r: 0, g: 0, b: 0, a: 0.35 },
      angle: 315,
      offset: 4,
      radius: 3,
      opacity: 0.5,
      enabled: true,
    };
    const back = readShadow(RawMessage.parse(writeShadow(shadow).toBytes()))!;
    expect(back.angle).toBe(315);
    expect(back.offset).toBe(4);
    expect(back.radius).toBe(3);
    expect(back.enabled).toBe(true);
    expect(back.color!.a).toBeCloseTo(0.35, 5);
  });

  it("reads the paragraph rules Apple's own templates ship", () => {
    // Heading/title styles in the stock templates carry a real
    // TSD.StrokeArchive plus a border_positions value; if our field
    // numbers were wrong these would come back empty.
    const doc = PagesDocument.load(fixture("gomap-v26.1-newest-writer.pages"));
    const withRule = doc.stylesheets().flatMap((sheet) =>
      sheet
        .paragraphStyles()
        .map((info) => sheet.style(info.id)!)
        .filter((handle) => handle.paragraph().border !== undefined),
    );
    expect(withRule.length).toBeGreaterThan(0);
    const paragraph = withRule[0]!.paragraph();
    expect(paragraph.border!.width! > 0).toBe(true);
    expect(paragraph.borderPositions !== undefined).toBe(true);
  });

  it("reads the tab stops Apple's own templates ship", () => {
    const doc = PagesDocument.load(fixture("iwork-mcp-v14.5-sample.pages"));
    const tabs = doc
      .stylesheets()
      .flatMap((sheet) =>
        sheet.paragraphStyles().flatMap((info) => sheet.style(info.id)!.paragraph().tabs ?? []),
      );
    expect(tabs.length).toBeGreaterThan(0);
    expect(tabs.every((t) => Number.isFinite(t.position))).toBe(true);
    // Right- and centre-aligned stops with leaders exist in the corpus.
    expect(tabs.some((t) => t.alignment === TabAlignment.RIGHT)).toBe(true);
  });
});

describe("character and paragraph formatting", () => {
  it("writes and reads back the full character surface", () => {
    const doc = PagesDocument.load(fixture("picodocs-v14.4-headers-tables.pages"));
    const sheet = doc.stylesheets()[0]!;
    const id = sheet.createCharacterStyle({
      name: "Full character test",
      character: {
        bold: true,
        italic: true,
        fontSize: 13.5,
        fontName: "Helvetica-Bold",
        fontColor: { r: 1, g: 0, b: 0 },
        backgroundColor: { r: 1, g: 1, b: 0 },
        underline: UnderlineType.DOUBLE,
        underlineColor: { r: 0, g: 0, b: 1 },
        underlineWidth: 1.5,
        wordUnderline: true,
        strikethru: StrikethruType.SINGLE,
        strikethruColor: { r: 0.5, g: 0, b: 0 },
        strikethruWidth: 0.75,
        capitalization: Capitalization.SMALL_CAPS,
        ligatures: 2,
        superscript: ScriptPosition.SUPERSCRIPT,
        tracking: 0.05,
        kerning: 0.1,
        baselineShift: 2,
        outline: 0.5,
        outlineColor: { r: 0, g: 1, b: 0 },
        shadow: { color: { r: 0, g: 0, b: 0 }, angle: 315, offset: 2, radius: 1, enabled: true },
        language: "en-GB",
      },
    });

    const reloaded = PagesDocument.load(doc.save());
    const style = reloaded
      .stylesheets()
      .map((s) => s.style(id))
      .find((s) => s !== undefined)!;
    const character = style.character();
    expect(character.bold).toBe(true);
    expect(character.fontSize).toBe(13.5);
    expect(character.fontName).toBe("Helvetica-Bold");
    expect(character.backgroundColor!.g).toBe(1);
    expect(character.underline).toBe(UnderlineType.DOUBLE);
    expect(character.underlineWidth).toBe(1.5);
    expect(character.wordUnderline).toBe(true);
    expect(character.strikethruWidth).toBe(0.75);
    expect(character.capitalization).toBe(Capitalization.SMALL_CAPS);
    expect(character.superscript).toBe(ScriptPosition.SUPERSCRIPT);
    expect(character.kerning).toBeCloseTo(0.1, 5);
    expect(character.outline).toBe(0.5);
    expect(character.shadow!.offset).toBe(2);
    expect(character.language).toBe("en-GB");
  });

  it("writes and reads back the full paragraph surface", () => {
    const doc = PagesDocument.load(fixture("picodocs-v14.4-headers-tables.pages"));
    const sheet = doc.stylesheets()[0]!;
    const id = sheet.createParagraphStyle({
      name: "Full paragraph test",
      paragraph: {
        alignment: 3,
        spaceBefore: 12,
        spaceAfter: 6,
        firstLineIndent: 18,
        leftIndent: 36,
        rightIndent: 12,
        lineSpacing: 1.5,
        keepLinesTogether: true,
        keepWithNext: true,
        pageBreakBefore: false,
        widowControl: true,
        hyphenate: false,
        outlineLevel: 2,
        showInToc: true,
        backgroundColor: { r: 0.95, g: 0.95, b: 0.9 },
        border: solidStroke({ r: 0.2, g: 0.2, b: 0.2 }, 1.5),
        borderPositions: BorderPosition.TOP_AND_BOTTOM,
        roundedCorners: false,
        ruleWidth: 1.5,
        defaultTabStops: 36,
        decimalTab: ",",
        tabs: [
          { position: 72, alignment: TabAlignment.LEFT },
          { position: 216, alignment: TabAlignment.DECIMAL, leader: "." },
          { position: 432, alignment: TabAlignment.RIGHT },
        ],
      },
    });

    const reloaded = PagesDocument.load(doc.save());
    const style = reloaded
      .stylesheets()
      .map((s) => s.style(id))
      .find((s) => s !== undefined)!;
    const paragraph = style.paragraph();
    expect(paragraph.alignment).toBe(3);
    expect(paragraph.spaceBefore).toBe(12);
    expect(paragraph.lineSpacing).toBe(1.5);
    expect(paragraph.keepWithNext).toBe(true);
    expect(paragraph.hyphenate).toBe(false);
    expect(paragraph.outlineLevel).toBe(2);
    expect(paragraph.backgroundColor!.r).toBeCloseTo(0.95, 5);
    expect(paragraph.border!.width).toBe(1.5);
    expect(paragraph.borderPositions).toBe(BorderPosition.TOP_AND_BOTTOM);
    expect(paragraph.ruleWidth).toBe(1.5);
    expect(paragraph.defaultTabStops).toBe(36);
    expect(paragraph.decimalTab).toBe(",");
    expect(paragraph.tabs!.length).toBe(3);
    expect(paragraph.tabs![1]!.alignment).toBe(TabAlignment.DECIMAL);
    expect(paragraph.tabs![1]!.leader).toBe(".");
    expect(paragraph.tabs![2]!.position).toBe(432);
  });

  it("clears a nullable property with its paired null flag", () => {
    // "Inherit the parent's font" and "explicitly no font" are different
    // states; passing undefined must produce the second, not the first.
    const doc = PagesDocument.load(fixture("picodocs-v14.4-headers-tables.pages"));
    const sheet = doc.stylesheets()[0]!;
    const id = sheet.createCharacterStyle({ character: { fontName: "Helvetica" } });
    const style = sheet.style(id)!;
    expect(style.character().fontName).toBe("Helvetica");

    style.setCharacter({ fontName: undefined });
    const props = style.object.message.getMessage(StyleArchive.CHAR_PROPERTIES)!;
    expect(props.has(5)).toBe(false); // font_name gone
    expect(props.getBool(4)).toBe(true); // font_name_null set
  });

  it("preserves properties it does not model when editing a style", () => {
    // Real styles carry properties this library has no name for. Editing
    // one must merge, not rebuild.
    const doc = PagesDocument.load(fixture("gomap-v26.1-newest-writer.pages"));
    const sheet = doc.stylesheets().find((s) => s.paragraphStyles().length > 0)!;
    const info = sheet.paragraphStyles().find((s) => s.name === "Body") ?? sheet.paragraphStyles()[0]!;
    const style = sheet.style(info.id)!;
    const before = style.object.message
      .getMessage(StyleArchive.PARA_PROPERTIES)!
      .fields.map((f) => f.no);

    style.setParagraph({ spaceAfter: 99 });
    const after = style.object.message
      .getMessage(StyleArchive.PARA_PROPERTIES)!
      .fields.map((f) => f.no);
    for (const field of before) expect(after.includes(field)).toBe(true);
    expect(style.paragraph().spaceAfter).toBe(99);
  });

  it("folds inherited values down the parent chain", () => {
    const doc = PagesDocument.load(fixture("picodocs-v14.4-headers-tables.pages"));
    const sheet = doc.stylesheets()[0]!;
    const baseId = sheet.createParagraphStyle({
      name: "Chain base",
      character: { fontSize: 11, fontName: "Helvetica" },
      paragraph: { spaceAfter: 8, alignment: 0 },
    });
    const derivedId = sheet.createParagraphStyle({
      name: "Chain derived",
      basedOn: baseId,
      character: { fontSize: 24 },
      paragraph: { alignment: 2 },
    });

    const derived = sheet.style(derivedId)!;
    // Own overrides only.
    expect(derived.character().fontName).toBe(undefined);
    // Resolved through the parent.
    const resolved = derived.resolved();
    expect(resolved.character.fontSize).toBe(24);
    expect(resolved.character.fontName).toBe("Helvetica");
    expect(resolved.paragraph.spaceAfter).toBe(8);
    expect(resolved.paragraph.alignment).toBe(2);
  });

  it("refuses paragraph properties on a character style", () => {
    const doc = PagesDocument.load(fixture("picodocs-v14.4-headers-tables.pages"));
    const sheet = doc.stylesheets()[0]!;
    const id = sheet.createCharacterStyle({ character: { bold: true } });
    let message = "";
    try {
      sheet.style(id)!.setParagraph({ alignment: 1 });
    } catch (e) {
      message = String((e as Error).message);
    }
    expect(message).toContain("character style");
  });
});

describe("direct formatting through the fluent API", () => {
  it("applies character formatting to a range and survives a save", () => {
    const doc = PagesDocument.load(fixture("picodocs-v14.4-headers-tables.pages"));
    const storage = doc.body;
    const marker = "styled span";
    storage.appendParagraph(marker);
    const found = storage.find(marker)[0]!;
    found
      .format({ fontSize: 21, fontColor: { r: 0.9, g: 0.1, b: 0.1 } })
      .highlight({ r: 1, g: 1, b: 0.6 })
      .strikethrough();

    const reloaded = PagesDocument.load(doc.save());
    expect(reloaded.bodyText).toContain(marker);
    const range = reloaded.body.find(marker)[0]!;
    const styleId = range.storage.effectiveObjectAt(8 /* table_char_style */, range.start)!;
    const style = reloaded
      .stylesheets()
      .map((s) => s.style(styleId))
      .find((s) => s !== undefined)!;
    const resolved = style.resolved().character;
    expect(resolved.strikethru).toBe(StrikethruType.SINGLE);
    expect(resolved.backgroundColor!.b).toBeCloseTo(0.6, 4);
  });

  it("applies paragraph formatting to a paragraph", () => {
    const doc = PagesDocument.load(fixture("picodocs-v14.4-headers-tables.pages"));
    const storage = doc.body;
    const index = storage.appendParagraph("indented and ruled");
    storage
      .paragraph(index)
      .format({ leftIndent: 48, border: solidStroke({ r: 0, g: 0, b: 0 }, 1), borderPositions: BorderPosition.BOTTOM });

    const reloaded = PagesDocument.load(doc.save());
    const target = reloaded
      .body
      .paragraphs()
      .find((p: { text: string }) => p.text === "indented and ruled")!;
    const style = reloaded
      .stylesheets()
      .map((s) => s.style(target.styleId!))
      .find((s) => s !== undefined)!;
    const paragraph = style.paragraph();
    expect(paragraph.leftIndent).toBe(48);
    expect(paragraph.borderPositions).toBe(BorderPosition.BOTTOM);
    expect(paragraph.border!.width).toBe(1);
  });

  it("keeps every fixture's styles readable", () => {
    // A blanket sanity check: reading the full formatting of every
    // paragraph style in the corpus must not throw on any archive.
    for (const name of [
      "gomap-v26.1-newest-writer.pages",
      "patrickomatic-pages26-sections-masks.pages",
      "tika-testPages2013.pages",
      "libetonyek-pages5-file.pages",
    ]) {
      const doc = PagesDocument.load(fixture(name));
      let seen = 0;
      for (const sheet of doc.stylesheets()) {
        for (const info of sheet.styles()) {
          if (info.type !== TSWP_TYPE.PARAGRAPH_STYLE && info.type !== TSWP_TYPE.CHARACTER_STYLE) {
            continue;
          }
          const handle = sheet.style(info.id)!;
          handle.character();
          if (info.type === TSWP_TYPE.PARAGRAPH_STYLE) handle.paragraph();
          seen++;
        }
      }
      expect(seen).toBeGreaterThan(0);
    }
  });

  it("keeps ParaProps field numbers aligned with the proto", () => {
    // Cheap guard against a transposition when the constants are edited.
    expect(ParaProps.STROKE).toBe(32);
    expect(ParaProps.BORDER_POSITIONS).toBe(45);
    expect(ParaProps.TABS).toBe(25);
    expect(ParaProps.FILL).toBe(6);
  });
});
