/**
 * What does a *real* Pages style have that ours does not?
 *
 * The Numbers side of this question has its own file. This is the Pages
 * one, and it exists because of a bug found the first time a document this
 * library wrote was opened in Pages at all:
 *
 *   A character style carrying `bold` and `font_color` applied the bold and
 *   ignored the colour. The word rendered black.
 *
 * Nothing was malformed. `font_color` is a real field, at the right number,
 * holding the right colour, and reading the file back returned red. The
 * fault was omission: a recent Pages renders text colour from `tsd_fill`
 * (field 46), and a style with only `font_color` leaves the glyphs in the
 * inherited colour. Every colour-carrying character style written by a
 * current Pages holds both.
 *
 * That is the third appearance of this exact shape — valid,
 * round-trippable, invisible — so the guard is the same: compare what we
 * write against what Apple writes, and treat *absence* as the failure.
 */
import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "./harness.ts";
import { PagesDocument } from "../src/index.ts";
import { CharProps } from "../src/tswp/schema.ts";
import { readCharacterProperties } from "../src/tss/stylesheet.ts";
import type { RawMessage } from "../src/base/protobuf.ts";

const FIXTURES = new URL("../fixtures/", import.meta.url);
// The base the Pages ladder uses: fourteen paragraphs of plain notes, with
// `table_list_style` and `table_layout_style` each holding a single run over
// the whole text. A one-paragraph document cannot show a densifying rebuild.
const TEMPLATE = new Uint8Array(
  readFileSync(new URL("iwork-mcp-v14.5-sample.pages", FIXTURES)),
);

/** TSWP.CharacterStyleArchive, and the field holding its property bag. */
const CHARACTER_STYLE_TYPE = 2021;
const PROPERTIES = 11;
/** `table_char_style` in a TSWP storage. */
const TABLE_CHAR_STYLE = 8;

/**
 * The property bag of the style actually covering `at`.
 *
 * Deliberately not "every style in the document" — the template ships with
 * its own coloured styles, and asserting across all of them tests Apple's
 * output rather than ours.
 */
function propertiesAt(bytes: Uint8Array, at: number): RawMessage {
  const doc = PagesDocument.load(bytes);
  const id = doc.body.effectiveObjectAt(TABLE_CHAR_STYLE, at);
  if (id === undefined) throw new Error(`no character style covers offset ${at}`);
  const object = doc.store.resolve(id);
  if (!object) throw new Error(`character style ${id} does not resolve`);
  const props = object.message.getMessage(PROPERTIES);
  if (!props) throw new Error(`character style ${id} has no property bag`);
  return props;
}

/** Author one red, bold word and return the document bytes plus its offset. */
function authorRedWord(): { bytes: Uint8Array; at: number } {
  const doc = PagesDocument.load(TEMPLATE);
  doc.appendParagraph("the word RED should be red");
  const at = doc.body.text.lastIndexOf("RED");
  doc.applyCharacterFormatting(at, at + 3, {
    bold: true,
    fontColor: { r: 1, g: 0, b: 0, space: "srgb" },
  });
  return { bytes: doc.save(), at };
}

describe("editing text keeps the run tables in Apple's shape", () => {
  /** Decode a run table to `index:objectId` pairs, for comparison. */
  const runTable = (doc: PagesDocument, field: number): string => {
    const table = doc.store.resolve(doc.body.id)?.message.getMessage(field);
    if (!table) return "(absent)";
    return table
      .getMessages(1)
      .map((e) => `${e.getUint(1) ?? 0}:${e.getMessage(2)?.getUint(1) ?? "none"}`)
      .join(" ");
  };
  const entryIndexes = (doc: PagesDocument, field: number): Set<number> =>
    new Set(
      (doc.store.resolve(doc.body.id)?.message.getMessage(field)?.getMessages(1) ?? []).map(
        (e) => e.getUint(1) ?? 0,
      ),
    );

  const BASES = ["patrickomatic-termpaper-footers-masks.pages", "iwork-mcp-v14.5-sample.pages"];
  const load = (base: string) =>
    PagesDocument.load(new Uint8Array(readFileSync(new URL(base, FIXTURES))));
  const appended = (base: string) => {
    const doc = load(base);
    doc.appendParagraph("appended");
    return PagesDocument.load(doc.save());
  };

  it("gives every paragraph an entry in table_para_style", () => {
    // The rule, measured: across the fixtures all 2060 paragraph starts
    // carry an entry, in 19 of 19 documents. A paragraph without one makes
    // Pages drop the styling for the whole body — which is exactly what an
    // appended line used to produce, while the rung that also called
    // setParagraphStyle rendered correctly.
    for (const base of BASES) {
      const doc = appended(base);
      const at = entryIndexes(doc, 5);
      const uncovered = doc.body.paragraphStarts().filter((s) => !at.has(s));
      expect(`${base} uncovered: ${uncovered.join(",")}`).toBe(`${base} uncovered: `);
    }
  });

  it("leaves the list and layout tables sparse", () => {
    // The other half of the same rule. Those tables carry 216 and 20 entries
    // for the same 2060 paragraphs, so densifying them is equally wrong —
    // and was the first thing tried.
    for (const base of BASES) {
      const before = runTable(load(base), 7);
      const after = runTable(appended(base), 7);
      expect(`${base} list: ${after}`).toBe(`${base} list: ${before}`);
      const beforeLayout = runTable(load(base), 12);
      const afterLayout = runTable(appended(base), 12);
      expect(`${base} layout: ${afterLayout}`).toBe(`${base} layout: ${beforeLayout}`);
    }
  });

  it("keeps every pre-existing paragraph pointing at the style it had", () => {
    // Density alone is not enough: the entries have to carry the same
    // effective values, or the text is styled but styled wrongly.
    for (const base of BASES) {
      const before = load(base);
      const after = appended(base);
      const originals = before.body.paragraphStarts();
      const effective = (doc: PagesDocument, at: number) => doc.body.effectiveObjectAt(5, at);
      const drift = originals.filter((at) => effective(before, at) !== effective(after, at));
      expect(`${base} drifted: ${drift.join(",")}`).toBe(`${base} drifted: `);
    }
  });

  it("still lets a deliberate paragraph-style change through", () => {
    const doc = load(BASES[1]!);
    const index = doc.appendParagraph("styled line");
    const title = doc.paragraphStyles().find((s) => /title|heading/i.test(s.name ?? ""));
    expect(title !== undefined).toBe(true);
    doc.setParagraphStyle(index, title!.name ?? title!.id);

    const reopened = PagesDocument.load(doc.save());
    const starts = reopened.body.paragraphStarts();
    const at = starts[starts.length - 1]!;
    expect(reopened.body.effectiveObjectAt(5, at) !== undefined).toBe(true);
  });
});

describe("a named paragraph style is one the app will list", () => {
  const BASE = new Uint8Array(
    readFileSync(new URL("patrickomatic-termpaper-footers-masks.pages", FIXTURES)),
  );
  const STYLESHEET = 401;
  const PARAGRAPH_STYLE = 2022;
  const IDENTIFIER_TO_STYLE_MAP = 2; // TSS.StylesheetArchive.identifier_to_style_map
  const SUPER = 1;

  /** identifier-map entries, keyed by the style they point at. */
  const identifierMap = (doc: PagesDocument): Map<string, string> => {
    const out = new Map<string, string>();
    for (const { obj } of doc.store.allObjects()) {
      if (obj.type !== STYLESHEET) continue;
      for (const e of obj.message.getMessages(IDENTIFIER_TO_STYLE_MAP)) {
        const id = e.getMessage(2)?.getUint(1);
        if (id !== undefined) out.set(String(id), e.getString(1) ?? "");
      }
    }
    return out;
  };
  const findByName = (doc: PagesDocument, name: string) => {
    for (const { obj } of doc.store.allObjects()) {
      if (obj.type !== PARAGRAPH_STYLE) continue;
      if (obj.message.getMessage(SUPER)?.getString(1) === name) return obj;
    }
    return undefined;
  };

  it("registers a name with a matching identifier, as Apple does", () => {
    // Measured: of 146 paragraph styles in this base, 23 carry a name and
    // 21 of those are in identifier_to_style_map under a key equal to their
    // own super.identifier. A style with a name and neither renders fine
    // wherever it is applied and never appears in the style list — which is
    // what naming a style is for.
    const doc = PagesDocument.load(BASE);
    const at = doc.appendParagraph("styled");
    doc.setParagraphStyle(at, doc.createParagraphStyle({ name: "Test Style" }));
    const saved = PagesDocument.load(doc.save());

    const style = findByName(saved, "Test Style");
    expect(style !== undefined).toBe(true);
    const identifier = style!.message.getMessage(SUPER)?.getString(2);
    const key = identifierMap(saved).get(String(style!.identifier));
    expect(`identifier=${identifier}`).toBe(`identifier=${key}`);
    expect(identifier !== undefined && identifier.length > 0).toBe(true);
  });

  it("follows Apple's identifier shape", () => {
    const doc = PagesDocument.load(BASE);
    doc.createParagraphStyle({ name: "Shape Check" });
    const saved = PagesDocument.load(doc.save());
    const style = findByName(saved, "Shape Check")!;
    const identifier = style.message.getMessage(SUPER)?.getString(2) ?? "";
    // <origin>-<n>-paragraphstyle-<Name>; a document's own styles use "text".
    expect(/^text-\d+-paragraphstyle-Shape Check$/.test(identifier)).toBe(true);
  });

  it("does not collide with an identifier the document already uses", () => {
    const doc = PagesDocument.load(BASE);
    doc.createParagraphStyle({ name: "One" });
    doc.createParagraphStyle({ name: "Two" });
    const saved = PagesDocument.load(doc.save());
    const keys = [...identifierMap(saved).values()];
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("leaves an unnamed style anonymous", () => {
    // An override created for one range is not a style anyone should see in
    // the panel, so it must not acquire an identifier.
    const doc = PagesDocument.load(BASE);
    const before = identifierMap(PagesDocument.load(BASE)).size;
    doc.createParagraphStyle({ name: undefined as unknown as string });
    const after = identifierMap(PagesDocument.load(doc.save())).size;
    expect(`identifier entries: ${after}`).toBe(`identifier entries: ${before}`);
  });
});

describe("a character style we author has what Apple's has", () => {
  it("writes the fill as well as font_color, because only the fill renders", () => {
    const { bytes, at } = authorRedWord();
    const props = propertiesAt(bytes, at);

    // Both. font_color alone is what shipped, and it rendered black.
    expect(props.has(CharProps.FONT_COLOR)).toBe(true);
    expect(props.has(CharProps.TSD_FILL)).toBe(true);

    // And the fill is a solid red, not an empty message that merely exists.
    const color = props.getMessage(CharProps.TSD_FILL)?.getMessage(1);
    expect(color?.getFloat(3)).toBe(1);
    expect(color?.getFloat(4)).toBe(0);
    expect(color?.getFloat(5)).toBe(0);
  });

  it("keeps the bold that did work", () => {
    const { bytes, at } = authorRedWord();
    expect(readCharacterProperties(propertiesAt(bytes, at)).bold).toBe(true);
  });

  it("reads a colour carried only as a fill", () => {
    // An importer, or an older writer, may set the fill without
    // font_color. The reader should report the colour either way rather
    // than returning nothing for text that is plainly coloured.
    const { bytes, at } = authorRedWord();
    const props = propertiesAt(bytes, at);
    const stripped = props.clone();
    stripped.remove(CharProps.FONT_COLOR);
    expect(stripped.has(CharProps.FONT_COLOR)).toBe(false);

    const read = readCharacterProperties(stripped);
    expect(read.fontColor?.r).toBe(1);
    expect(read.fontColor?.g).toBe(0);
  });

  it("agrees with what real Pages documents do", () => {
    // Not a claim about our output — a check that the rule enforced above
    // is still the rule Apple follows. If a future Pages stops writing
    // tsd_fill, this fails and the guard needs revisiting.
    let both = 0;
    let colorOnly = 0;
    for (const name of readdirSync(FIXTURES)) {
      if (!name.endsWith(".pages")) continue;
      let doc: PagesDocument;
      try {
        doc = PagesDocument.load(new Uint8Array(readFileSync(new URL(name, FIXTURES))));
      } catch {
        continue;
      }
      for (const { obj } of doc.store.allObjects()) {
        if (obj.type !== CHARACTER_STYLE_TYPE) continue;
        const props = obj.message.getMessage(PROPERTIES);
        if (!props?.has(CharProps.FONT_COLOR)) continue;
        if (props.has(CharProps.TSD_FILL)) both++;
        else colorOnly++;
      }
    }
    // Both shapes exist — older writers set only font_color — but the
    // pairing has to be the common case or the premise is wrong.
    expect(`paired=${both} colour-only=${colorOnly} → ${both > colorOnly}`).toBe(
      `paired=${both} colour-only=${colorOnly} → true`,
    );
  });
});
