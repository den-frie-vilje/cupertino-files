/**
 * Styling: the shared TSD value vocabulary (fills, gradients, strokes,
 * shadows, padding) and the text styling built on top of it.
 *
 * The value codecs are checked against real archives wherever the corpus
 * has them, so these tests fail if our field numbers drift from Apple's.
 */
import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "./harness.ts";
import {
  BorderPosition,
  colorFill,
  drawableStylesOf,
  IWorkDocument,
  KeynoteDocument,
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
import {
  deprecatedBorders,
  ParaProps,
  Storage,
  StyleArchive,
  TSWP_TYPE,
} from "../src/tswp/schema.ts";
import { applyParagraphProperties, readParagraphProperties } from "../src/tss/stylesheet.ts";
import { readCellFormatting, readTableFormatting } from "../src/tst/styles.ts";
import { messageAt } from "../src/tsp/schema.ts";

const FIXTURES = new URL("../fixtures/", import.meta.url);
const fixture = (name: string) => new Uint8Array(readFileSync(new URL(name, FIXTURES)));

describe("style value codecs", () => {
  it("round-trips colours including the display-P3 space", () => {
    // From iWork 19 on the apps name a space on every colour they write,
    // so a space-less colour is stamped sRGB rather than left bare; an
    // explicit space is kept as given.
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
      expect(back.space).toBe(color.space ?? "srgb");
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
      message = (e as Error).message;
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

  it("completes a gradient to the app's fresh shape", () => {
    // The app's own gradients state opacity, the advanced flag and a
    // direction on every fresh one; a written gradient gets the same
    // shape — full opacity, simple mode, 3π/2 (top to bottom).
    const fill = linearGradient({ r: 1, g: 1, b: 1 }, { r: 0, g: 0, b: 1 });
    const back = readFill(RawMessage.parse(writeFill(fill).toBytes()))!;
    if (back.kind !== "gradient") throw new Error("expected a gradient");
    expect(back.gradient.opacity).toBe(1);
    expect(back.gradient.advanced).toBe(false);
    expect(back.gradient.angle).toBeCloseTo((3 * Math.PI) / 2, 5);

    // A caller's own direction and mode are kept.
    const steep = writeFill({
      kind: "gradient",
      gradient: { type: "linear", stops: fill.kind === "gradient" ? fill.gradient.stops : [], angle: Math.PI / 2 },
    });
    const steepBack = readFill(RawMessage.parse(steep.toBytes()))!;
    if (steepBack.kind !== "gradient") throw new Error("expected a gradient");
    expect(steepBack.gradient.angle).toBeCloseTo(Math.PI / 2, 5);
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

    // On the wire a dashed pattern has the app's whole shape: phase 0,
    // the run count, and the float list padded to six.
    const m = RawMessage.parse(writeStroke(dashed).toBytes());
    const pattern = m.getMessage(6)!;
    expect(pattern.getUint(1)).toBe(0); // TSDPattern
    expect(pattern.getFloat(2)).toBe(0); // phase
    expect(pattern.getUint(3)).toBe(4); // count
    expect(pattern.getFloats(4)).toEqual([4, 2, 1, 2, 0, 0]);
  });

  it("writes the complete stroke the apps write, not just the type", () => {
    // A solid stroke stating only its pattern type renders as no border:
    // the app shows "None" for the stroke and zeroes border_positions on
    // resave. Every corpus paragraph border states cap, join, miter 4 and
    // the full pattern message — phase, count and six floats.
    const m = RawMessage.parse(writeStroke(solidStroke({ r: 1, g: 0, b: 0 }, 3)).toBytes());
    expect(m.getUint(3)).toBe(0); // cap, stated
    expect(m.getUint(4)).toBe(0); // join, stated
    expect(m.getFloat(5)).toBe(4); // miter limit
    const pattern = m.getMessage(6)!;
    expect(pattern.getUint(1)).toBe(1); // solid
    expect(pattern.getFloat(2)).toBe(0); // phase
    expect(pattern.getUint(3)).toBe(0); // count
    expect(pattern.getFloats(4)).toEqual([0, 0, 0, 0, 0, 0]);
  });

  it("writes line spacing the way the app does: amount only", () => {
    // Every multiple-spacing archive the corpus's apps wrote states just
    // the amount, leaving the mode to its proto default; an explicit
    // mode appears only on the rare exact-height spacings.
    const bag = RawMessage.create();
    applyParagraphProperties(bag, { lineSpacing: 1.5 });
    const spacing = bag.getMessage(ParaProps.LINE_SPACING)!;
    expect(spacing.getFloat(2)).toBe(1.5);
    expect(spacing.getUint(1)).toBe(undefined);
    expect(readParagraphProperties(bag).lineSpacing).toBe(1.5);
  });

  it("reads a corpus dashed border as its dash pattern, not the padding", () => {
    // An app-written dashed table stroke stores count 2 with six floats
    // [2,2,0,0,0,0]; only the counted prefix is the pattern.
    const doc = PagesDocument.load(fixture("draftjs-v2.3-comments.pages"));
    const style = doc.store.object(3308n)!;
    const stroke = readTableFormatting(messageAt(style.message, 11)).bodyHorizontalStroke!;
    expect(stroke.width).toBe(0.5);
    expect(stroke.pattern).toEqual([2, 2]);
  });

  it("reads an empty reflection archive as the 0.5 the app renders", () => {
    // The app's usual reflection is the empty archive — presence means
    // on, opacity from the proto default. Styles with no archive still
    // read as no reflection.
    const doc = IWorkDocument.open(fixture("numbers-parser-v26.1-custom-formats.numbers"));
    let empty = 0;
    let absent = 0;
    for (const handle of drawableStylesOf(doc.store)) {
      if (handle.object.type !== 3015 && handle.object.type !== 3016) continue;
      const field = handle.object.type === 3016 ? 4 : 5;
      const archive = handle.object.message.getMessage(11)?.getMessage(field);
      if (archive && archive.fields.length === 0) {
        expect(handle.read().reflection).toBe(0.5);
        empty++;
      } else if (!archive) {
        expect(handle.read().reflection).toBe(undefined);
        absent++;
      }
    }
    expect(empty).toBeGreaterThan(0);
    expect(absent).toBeGreaterThan(0);
  });

  it("finds a space on every current-era cell-fill colour", () => {
    // The measurement behind writeColor's sRGB stamping: colours the
    // current-era app writes always name their space.
    const doc = IWorkDocument.open(fixture("numbers-parser-v26.1-custom-formats.numbers"));
    let fills = 0;
    for (const { obj } of doc.store.allObjects()) {
      if (obj.type !== 6004) continue;
      const fill = readCellFormatting(messageAt(obj.message, 11)).fill;
      if (fill?.kind !== "color") continue;
      expect(typeof fill.color.space).toBe("string");
      fills++;
    }
    expect(fills).toBeGreaterThan(0);
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

  it("alignment accepts the name and rejects garbage at the call", () => {
    // A string where the enum belongs used to surface as a BigInt
    // conversion error deep inside save — the field report's "writes
    // nothing" experience. Names resolve; anything else fails naming
    // the parameter.
    const doc = PagesDocument.blank();
    const sheet = doc.stylesheets()[0]!;
    const id = sheet.createParagraphStyle({ name: "Centreret", paragraph: { alignment: "center" } });
    const reloaded = PagesDocument.load(doc.save());
    const style = reloaded
      .stylesheets()
      .map((s) => s.style(id))
      .find((s) => s !== undefined)!;
    expect(style.paragraph().alignment).toBe(2);
    expect(() =>
      sheet.createParagraphStyle({ name: "X", paragraph: { alignment: "centre" as never } }),
    ).toThrow(/unknown alignment/);
    expect(() =>
      sheet.createParagraphStyle({ name: "Y", paragraph: { alignment: 9 as never } }),
    ).toThrow(/not a TextAlignment/);
  });

  it("border_positions is the measured bitmask, not the refuted enum", () => {
    // 1 top, 2 bottom, 4 leading, 8 trailing — unions literal. The side
    // bits are logical: they swap visual sides in an RTL paragraph, so
    // LEFT/RIGHT alias LEADING/TRAILING for the LTR case. This pin keeps
    // the model from drifting.
    expect(BorderPosition.TOP | BorderPosition.BOTTOM).toBe(BorderPosition.TOP_AND_BOTTOM);
    expect(BorderPosition.LEADING).toBe(4);
    expect(BorderPosition.TRAILING).toBe(8);
    expect(BorderPosition.LEFT).toBe(BorderPosition.LEADING);
    expect(BorderPosition.RIGHT).toBe(BorderPosition.TRAILING);
    expect(BorderPosition.ALL).toBe(15);
    expect(
      BorderPosition.TOP |
        BorderPosition.BOTTOM |
        BorderPosition.LEFT |
        BorderPosition.RIGHT,
    ).toBe(BorderPosition.ALL);

    // And the writer round-trips the full mask through a real document.
    const doc = PagesDocument.load(fixture("picodocs-v14.4-headers-tables.pages"));
    const sheet = doc.stylesheets()[0]!;
    const id = sheet.createParagraphStyle({
      name: "Boxed",
      paragraph: {
        border: solidStroke({ r: 0.8, g: 0.4, b: 0.2 }, 2),
        borderPositions: BorderPosition.ALL,
      },
    });
    const reloaded = PagesDocument.load(doc.save());
    const style = reloaded
      .stylesheets()
      .map((s) => s.style(id))
      .find((s) => s !== undefined)!;
    expect(style.paragraph().borderPositions).toBe(15);
  });

  it("writes the historical border value the inspector keys on", () => {
    // border_positions alone leaves the position toggles unselected and
    // draws nothing; the app writes deprecated_borders beside it on all
    // 17 corpus styles with non-zero positions. Measured pairs 1·1, 2·2,
    // 4·8, 8·16; 3 and 15 follow the enum's own structure.
    const doc = PagesDocument.load(fixture("picodocs-v14.4-headers-tables.pages"));
    const sheet = doc.stylesheets()[0]!;
    for (const [positions, historical] of [
      [1, 1],
      [2, 2],
      [3, 3],
      [4, 8],
      [8, 16],
      [15, 4],
    ] as const) {
      const id = sheet.createParagraphStyle({
        paragraph: { border: solidStroke({ r: 0, g: 0, b: 0 }, 1), borderPositions: positions },
      });
      const props = sheet.style(id)!.object.message.getMessage(StyleArchive.PARA_PROPERTIES)!;
      expect(`${positions}·${props.getUint(ParaProps.DEPRECATED_BORDERS)}`).toBe(`${positions}·${historical}`);
    }
    // Leading beside trailing short of all four has no historical value.
    const both = sheet.createParagraphStyle({
      paragraph: { border: solidStroke({ r: 0, g: 0, b: 0 }, 1), borderPositions: 12 },
    });
    const props = sheet.style(both)!.object.message.getMessage(StyleArchive.PARA_PROPERTIES)!;
    expect(props.getUint(ParaProps.DEPRECATED_BORDERS)).toBe(undefined);
  });

  it("round-trips the rule offset, scalar and pair alike", () => {
    // A number states both TSP.Point slots — they agree in 8637 of the
    // corpus's 8638 instances — and a pair states them separately.
    const doc = PagesDocument.load(fixture("picodocs-v14.4-headers-tables.pages"));
    const sheet = doc.stylesheets()[0]!;
    const scalar = sheet.createParagraphStyle({ paragraph: { ruleOffset: -12 } });
    const props = sheet.style(scalar)!.object.message.getMessage(StyleArchive.PARA_PROPERTIES)!;
    const point = props.getMessage(ParaProps.HISTORICAL_RULE_OFFSET)!;
    expect(point.getFloat(1)).toBe(-12);
    expect(point.getFloat(2)).toBe(-12);
    expect(sheet.style(scalar)!.paragraph().ruleOffset).toBe(-12);

    const pair = sheet.createParagraphStyle({ paragraph: { ruleOffset: { x: -5.5, y: -6 } } });
    expect(sheet.style(pair)!.paragraph().ruleOffset).toEqual({ x: -5.5, y: -6 });

    sheet.style(scalar)!.setParagraph({ ruleOffset: undefined });
    const cleared = sheet.style(scalar)!.object.message.getMessage(StyleArchive.PARA_PROPERTIES)!;
    expect(cleared.getMessage(ParaProps.HISTORICAL_RULE_OFFSET)).toBe(undefined);
  });

  it("reads the offsets Apple's own templates ship", () => {
    // gomap's headings state the stock −3; picodocs' Title carries the
    // corpus's one unequal pair, which is why the reader keeps both slots.
    const gomap = PagesDocument.load(fixture("gomap-v26.1-newest-writer.pages"));
    const heading = gomap
      .stylesheets()
      .flatMap((s) => s.paragraphStyles().map((i) => ({ s, i })))
      .find(({ i }) => i.name === "Heading 2")!;
    expect(heading.s.style(heading.i.id)!.paragraph().ruleOffset).toBe(-3);

    const pico = PagesDocument.load(fixture("picodocs-v14.4-headers-tables.pages"));
    const title = pico
      .stylesheets()
      .flatMap((s) => s.paragraphStyles().map((i) => ({ s, i })))
      .find(({ i }) => i.name === "Title")!;
    expect(title.s.style(title.i.id)!.paragraph().ruleOffset).toEqual({ x: -5.5, y: -6 });
  });

  it("reads positions from the historical value when the bitmask is absent", () => {
    for (const [historical, positions] of [
      [1, 1],
      [4, 15],
      [8, 4],
      [16, 8],
      [19, 11],
    ] as const) {
      const m = RawMessage.create();
      m.setVarint(ParaProps.DEPRECATED_BORDERS, historical);
      expect(readParagraphProperties(m).borderPositions).toBe(positions);
    }
  });

  it("border styles in app files carry the pair, which is what makes them draw", () => {
    const doc = PagesDocument.load(fixture("olekristensen-v26.3-mac-borders-logical.pages"));
    let bordered = 0;
    for (const { obj } of doc.store.allObjects()) {
      if (obj.type !== TSWP_TYPE.PARAGRAPH_STYLE) continue;
      const props = obj.message.getMessage(StyleArchive.PARA_PROPERTIES);
      const positions = props?.getUint(ParaProps.BORDER_POSITIONS);
      if (positions === undefined || positions === 0) continue;
      bordered++;
      const historical = props!.getUint(ParaProps.DEPRECATED_BORDERS);
      expect(`${positions}·${historical}`).toBe(`${positions}·${deprecatedBorders(positions)}`);
    }
    expect(bordered).toBeGreaterThan(0);
  });

  it("side bits are logical: an RTL paragraph's visual-left edge stores trailing", () => {
    // Visual-left on LTR is 4, visual-right on LTR is 8, visual-left on
    // RTL is 8: the bit names the logical side. Both writers agree.
    for (const name of [
      "olekristensen-v26.3-ios-borders-logical.pages",
      "olekristensen-v26.3-mac-borders-logical.pages",
    ]) {
      const doc = PagesDocument.load(fixture(name));
      const sheet = doc.body.sheet()!;
      const bitsOf = (start: number): number => {
        const id = doc.body.effectiveObjectAt(Storage.TABLE_PARA_STYLE, start);
        if (id === undefined) return 0;
        return sheet.style(id)?.resolved().paragraph.borderPositions ?? 0;
      };
      const starts = doc.body.paragraphStarts();
      const used = starts.map(bitsOf).filter((bits) => bits !== 0).sort((a, b) => a - b);
      expect(`${name}: ${used.join(",")}`).toBe(`${name}: 4,8,8`);

      const paragraphs = doc.paragraphs();
      const hebrew = paragraphs.findIndex((p) => /[֐-׿]/.test(p.text));
      expect(doc.body.paragraphDirection(hebrew)).toBe("rtl");
      expect(bitsOf(starts[hebrew]!)).toBe(BorderPosition.TRAILING);
    }
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
      message = (e as Error).message;
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

describe("drawable styling", () => {
  it("reads the shadows Apple's own templates ship", () => {
    // Shadows do not exist on cell or table styles — the format has no such
    // field. They live on the drawable's TSD.ShapeStyleArchive or
    // MediaStyleArchive, which is what this walks.
    const doc = KeynoteDocument.load(fixture("zenodo-v26.1-hyperlinks-masks.key"));
    const styles = drawableStylesOf(doc.store);
    expect(styles.length).toBeGreaterThan(0);

    const shadows = styles.map((s) => s.read().shadow).filter((s) => s !== undefined);
    expect(shadows.length).toBeGreaterThan(0);
    // Apple writes a full parameter set even when the shadow is switched
    // off, so "has a shadow archive" and "shows a shadow" differ.
    const enabled = shadows.filter((s) => s!.enabled);
    expect(enabled.length).toBeGreaterThan(0);
    for (const shadow of enabled) {
      expect(Number.isFinite(shadow!.angle!)).toBe(true);
      expect(shadow!.offset! >= 0).toBe(true);
    }
  });

  it("distinguishes shape and media property layouts", () => {
    // Media bags omit `fill`, so every later field is numbered one lower.
    // Reading a media style with shape numbering would report the stroke as
    // a fill and the opacity as a stroke.
    const doc = KeynoteDocument.load(fixture("zenodo-v26.1-hyperlinks-masks.key"));
    const styles = drawableStylesOf(doc.store);
    const media = styles.filter((s) => s.isMedia);
    const shapes = styles.filter((s) => !s.isMedia);
    expect(media.length).toBeGreaterThan(0);
    expect(shapes.length).toBeGreaterThan(0);
    // A media style has no fill to report, whatever its bag contains.
    for (const style of media) expect(style.read().fill).toBe(undefined);
  });

  it("writes a shadow the library reads back after a save", () => {
    const doc = KeynoteDocument.load(fixture("zenodo-v26.1-hyperlinks-masks.key"));
    const target = drawableStylesOf(doc.store).find((s) => !s.isMedia)!;
    target.set({
      shadow: { color: { r: 0, g: 0, b: 0, a: 0.5 }, angle: 90, offset: 10, radius: 20, opacity: 0.7, enabled: true },
      opacity: 0.75,
    });

    const reloaded = KeynoteDocument.load(doc.save());
    const style = drawableStylesOf(reloaded.store).find((s) => s.id === target.id)!.read();
    expect(style.shadow!.angle).toBe(90);
    expect(style.shadow!.offset).toBe(10);
    expect(style.shadow!.radius).toBe(20);
    expect(style.shadow!.enabled).toBe(true);
    expect(style.opacity).toBeCloseTo(0.75, 5);
    expect(reloaded.compatibility().canRoundTrip).toBe(true);
  });

  it("every corpus shadow is written whole, and so is ours", () => {
    // All 929 parameter-carrying shadow archives in the corpus — 687
    // disabled, 242 enabled — state all seven fields; the only other
    // app-written state is the empty archive. A six-field shadow
    // renders, but the app's shadow popup aborts the whole app over it
    // (demo-11's S-08, re-enabled in the inspector).
    let carrying = 0;
    for (const name of readdirSync(FIXTURES)) {
      if (!/\.(pages|numbers|key)$/.test(name)) continue;
      let doc: IWorkDocument;
      try {
        doc = IWorkDocument.open(fixture(name));
      } catch {
        continue;
      }
      for (const handle of drawableStylesOf(doc.store)) {
        const shadow = handle.read().shadow;
        if (!shadow || Object.keys(shadow).length === 0) continue;
        carrying++;
        const label = (missing: string) => `${name} style ${handle.id}: ${missing}`;
        for (const key of ["color", "angle", "offset", "radius", "opacity", "enabled", "type"] as const) {
          expect(shadow[key] === undefined ? label(`no ${key}`) : "whole").toBe("whole");
        }
      }
    }
    expect(carrying).toBeGreaterThan(900);

    // The writer completes a partial shadow to the same shape, and its
    // colour names its space — every current-era shadow colour does
    // (822 of 822); the 107 without one all live in five 2013-class
    // old-era files.
    const written = readShadow(writeShadow({ enabled: false }))!;
    for (const key of ["color", "angle", "offset", "radius", "opacity", "enabled", "type"] as const) {
      expect(written[key] !== undefined).toBe(true);
    }
    expect(written.color?.space).toBe("srgb");
    expect(written.enabled).toBe(false);
  });

  it("reads the app's own shadow states from the returned demo round", () => {
    // The returned demo-11 carries three app-written shadow states over
    // this library's archives: the popup's fresh drop preset written
    // where the disabled shadow stood, a contact shadow with its
    // sub-archive, and the corpus's first curvedShadow sub-archive —
    // the inspector's inward curve, a negative float.
    const doc = PagesDocument.load(fixture("olekristensen-v26.3-demo11-shadows-returned.pages"));
    const floats = [0, 1].flatMap((page) => doc.floatingDrawables(page)?.drawables() ?? []);
    const shadows = floats.map((f) => {
      const style = f.style()!;
      const raw = (() => {
        let node = style.object.message;
        let props = node.getMessage(11);
        for (let depth = 0; depth < 4; depth++) {
          const child = node.getMessage(1);
          const childProps = child?.getMessage(11);
          if (!child || !childProps) break;
          node = child;
          props = childProps;
        }
        return props?.getMessage(style.isMedia ? 3 : 4);
      })();
      return { read: style.read().shadow, raw };
    });

    // The popup preset: stored angle 90 = inspector 270°, offset 2,
    // blur 5, half opacity — enabled over what was the disabled rung.
    // (The half opacity is what tells it from the round's angle rung.)
    const preset = shadows.find(
      (s) =>
        s.read?.enabled === true &&
        s.read.type === 0 &&
        s.read.opacity !== undefined &&
        Math.abs(s.read.opacity - 0.5) < 1e-6,
    )!;
    expect(preset.read!.angle).toBe(90);
    expect(preset.read!.offset).toBe(2);
    expect(preset.read!.radius).toBe(5);

    const contact = shadows.find((s) => s.read?.type === 1)!;
    expect(contact.read!.radius).toBe(40);
    const contactSub = contact.raw!.getMessage(9)!;
    expect(contactSub.getFloat(2)! > 0).toBe(true);

    const curved = shadows.find((s) => s.read?.type === 2)!;
    const curvedSub = curved.raw!.getMessage(10)!;
    expect(curvedSub.getFloat(1)! < 0).toBe(true);
  });

  it("re-parameterising a shadow keeps its per-type sub-archive", () => {
    // The sub-archive holds what the inspector's type-specific knobs
    // wrote — dropping it on a rewrite would silently discard the
    // user's curve. A type change drops it, the corpus shape.
    const doc = PagesDocument.load(fixture("olekristensen-v26.3-demo11-shadows-returned.pages"));
    const floats = [0, 1].flatMap((page) => doc.floatingDrawables(page)?.drawables() ?? []);
    const curved = floats.find((f) => f.style()!.read().shadow?.type === 2)!;
    const style = curved.style()!;
    const rawShadow = (handle: typeof style) => {
      let node = handle.object.message;
      let props = node.getMessage(11);
      for (let depth = 0; depth < 4; depth++) {
        const child = node.getMessage(1);
        const childProps = child?.getMessage(11);
        if (!child || !childProps) break;
        node = child;
        props = childProps;
      }
      return props?.getMessage(handle.isMedia ? 3 : 4);
    };
    const before = rawShadow(style)!.getMessage(10)!.getFloat(1);

    style.set({ shadow: { ...style.read().shadow!, radius: 12 } });
    expect(rawShadow(style)!.getMessage(10)!.getFloat(1)).toBe(before);
    expect(style.read().shadow!.radius).toBe(12);

    style.set({ shadow: { ...style.read().shadow!, type: 0 } });
    expect(rawShadow(style)!.getMessage(10)).toBe(undefined);
  });

  it("no two identified styles in any fixture share an identifier", () => {
    // 18554 identified styles across the corpus, zero collisions — an
    // identifier names exactly one style, and a clone keeping its
    // source's would put two behind one: the corrupt-stylesheet state.
    for (const name of readdirSync(FIXTURES)) {
      if (!/\.(pages|numbers|key)$/.test(name)) continue;
      let doc: IWorkDocument;
      try {
        doc = IWorkDocument.open(fixture(name));
      } catch {
        continue;
      }
      const seen = new Map<string, bigint>();
      for (const { obj } of doc.store.allObjects()) {
        if (!/StyleArchive$/.test(doc.store.typeNameOf(obj) ?? "")) continue;
        const identifier = obj.message.getMessage(1)?.getString(2);
        if (identifier === undefined || identifier.length === 0) continue;
        const holder = seen.get(identifier);
        expect(
          holder === undefined
            ? "unique"
            : `${name}: ${identifier} on both ${holder} and ${obj.identifier}`,
        ).toBe("unique");
        seen.set(identifier, obj.identifier);
      }
    }
  });

  it("styling one drawable never restyles the others sharing its archive", () => {
    // Style archives are routinely shared — the theme lists one, and a
    // deep copy shares its source's — so a write through a shared archive
    // used to restyle every drawable holding it: eleven squares given
    // eleven different shadows ended with five. The write now goes to a
    // private clone with this drawable's reference repointed, the app's
    // own behaviour.
    const png = new Uint8Array([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0x0d, 0x49, 0x48, 0x44, 0x52,
      0, 0, 0, 0x64, 0, 0, 0, 0x32, 8, 6, 0, 0, 0,
    ]);
    const doc = PagesDocument.blank();
    doc.appendParagraph("Tekst.", "Body");
    const { imageId } = doc.insertInlineImage(doc.body.text.length, png, { fileName: "s.png" });
    const floating = doc.floatingDrawables(0, { create: true })!;
    const source = doc.store.object(imageId)!;
    const a = floating.addCopyOf(source, { x: 100, y: 100 });
    const b = floating.addCopyOf(source, { x: 100, y: 220 });
    const sharedId = a.style()!.id;
    const baseline = a.style()!.read();

    a.style()!.set({ shadow: { angle: 90, offset: 25, radius: 3, opacity: 1, enabled: true } });
    b.style()!.set({ opacity: 0.4 });

    const reloaded = PagesDocument.load(doc.save());
    const styles = reloaded
      .floatingDrawables(0)!
      .drawables()
      .map((f) => f.style()!);
    expect(styles[0]!.id === styles[1]!.id).toBe(false);
    expect(styles.some((s) => s.id === sharedId)).toBe(false);
    expect(styles[0]!.read().shadow?.offset).toBe(25);
    expect(styles[1]!.read().shadow?.offset).toBe(baseline.shadow?.offset);
    expect(styles[1]!.read().opacity).toBeCloseTo(0.4, 5);
    // The archive they shared — the inline source's — is untouched.
    const shared = drawableStylesOf(reloaded.store).find((s) => s.id === sharedId)!;
    expect(shared.read()).toEqual(baseline);
    // The clones take the app's override shape whole: anonymous — a kept
    // identifier would put two styles behind one, and no two of the
    // corpus's 18554 identified styles share one — parented on the
    // source, and listed in the stylesheet with the reference declared.
    for (const style of styles) {
      const sup = style.object.message.getMessage(1)!;
      expect(sup.getString(2)).toBe(undefined);
      expect(sup.getMessage(3)?.getVarint(1)).toBe(sharedId);
      const sheetId = sup.getMessage(5)!.getVarint(1)!;
      const sheet = reloaded.store.object(sheetId)!;
      const listed = sheet.message
        .getMessages(1)
        .some((ref) => ref.getVarint(1) === style.id);
      expect(listed).toBe(true);
      expect(sheet.getObjectReferences().includes(style.id)).toBe(true);
    }
  });

  it("distinguishes disabling a shadow from removing it", () => {
    // Two different states: the apps keep a full parameter set with
    // is_enabled false, which is how the inspector remembers your settings
    // after you untick the box.
    const doc = KeynoteDocument.load(fixture("zenodo-v26.1-hyperlinks-masks.key"));
    const style = drawableStylesOf(doc.store).find((s) => s.read().shadow?.enabled)!;
    const before = style.read().shadow!;

    style.setShadowEnabled(false);
    const disabled = style.read().shadow!;
    expect(disabled.enabled).toBe(false);
    expect(disabled.offset).toBe(before.offset);
    expect(disabled.angle).toBe(before.angle);

    style.set({ shadow: null });
    expect(style.read().shadow).toBe(undefined);
  });

  it("refuses a fill on a media style", () => {
    const doc = KeynoteDocument.load(fixture("zenodo-v26.1-hyperlinks-masks.key"));
    const media = drawableStylesOf(doc.store).find((s) => s.isMedia)!;
    let message = "";
    try {
      media.set({ fill: colorFill(1, 0, 0) });
    } catch (e) {
      message = (e as Error).message;
    }
    expect(message).toContain("no fill");
  });

  it("keeps every drawable style in the corpus readable", () => {
    let seen = 0;
    let shadows = 0;
    for (const name of [
      "zenodo-v26.1-hyperlinks-masks.key",
      "gomap-v26.1-newest-writer.pages",
      "tika-testKeynote2013.key",
      "libetonyek-pages5-file.pages",
    ]) {
      // Mixed apps, so use the generic loader rather than a typed one.
      const doc = IWorkDocument.open(fixture(name));
      for (const style of drawableStylesOf(doc.store)) {
        const read = style.read();
        if (read.shadow) shadows++;
        seen++;
      }
    }
    expect(seen).toBeGreaterThan(100);
    expect(shadows).toBeGreaterThan(0);
  });
});
