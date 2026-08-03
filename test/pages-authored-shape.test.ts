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
import { drawableParent } from "../src/tsd/schema.ts";

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
    // Pages drop the styling for the whole body, while the same document
    // with the entry declared renders correctly.
    for (const base of BASES) {
      const doc = appended(base);
      const at = entryIndexes(doc, 5);
      const uncovered = doc.body.paragraphStarts().filter((s) => !at.has(s));
      expect(`${base} uncovered: ${uncovered.join(",")}`).toBe(`${base} uncovered: `);
    }
  });

  it("leaves the list and layout tables sparse", () => {
    // The other half of the same rule. Those tables carry 216 and 20 entries
    // for the same 2060 paragraphs, so densifying them is equally wrong.
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

describe("a floating drawable has to be in the paint order to be drawn", () => {
  const BASE = new Uint8Array(
    readFileSync(new URL("patrickomatic-pages26-sections-masks.pages", FIXTURES)),
  );
  const ZORDER = 10015; // TP.DrawablesZOrderArchive

  const paintOrder = (doc: PagesDocument): string[] => {
    for (const { obj } of doc.store.allObjects()) {
      if (obj.type !== ZORDER) continue;
      return obj.message.getMessages(1).map((e) => String(e.getUint(1) ?? 0));
    }
    return [];
  };
  const placedIds = (doc: PagesDocument): string[] => {
    const out: string[] = [];
    for (const page of doc.floatingDrawablePages()) {
      for (const d of doc.floatingDrawables(page)?.drawables() ?? []) {
        out.push(String((d as unknown as { object: { identifier: bigint } }).object.identifier));
      }
    }
    return out;
  };

  it("adds a copy to the z-order, on the same page and on a new one", () => {
    // A page group says which page a drawable belongs to. It does not say
    // the document draws it: that is TP.DrawablesZOrderArchive, one per
    // document. A drawable placed but missing from it does not appear at
    // all, which is why copying onto the drawable's own page failed exactly
    // as completely as copying onto a fresh page.
    for (const offset of [0, 1]) {
      const doc = PagesDocument.load(BASE);
      const page = doc.floatingDrawablePages()[0]!;
      const source = doc.floatingDrawables(page)!.drawables()[0]!;
      doc.floatingDrawables(page + offset, { create: true })!.addCopyOf(source, { x: 20, y: 0 });

      const saved = PagesDocument.load(doc.save());
      const order = paintOrder(saved);
      const missing = placedIds(saved).filter((id) => !order.includes(id));
      expect(`offset ${offset} placed-but-unpainted: ${missing.join(",")}`).toBe(
        `offset ${offset} placed-but-unpainted: `,
      );
    }
  });

  it("keeps what was already in the paint order, and appends", () => {
    const before = paintOrder(PagesDocument.load(BASE));
    expect(before.length > 0).toBe(true);
    const doc = PagesDocument.load(BASE);
    const page = doc.floatingDrawablePages()[0]!;
    doc.floatingDrawables(page)!.addCopyOf(doc.floatingDrawables(page)!.drawables()[0]!, {});
    const after = paintOrder(PagesDocument.load(doc.save()));
    expect(after.slice(0, before.length).join(",")).toBe(before.join(","));
    expect(after.length).toBe(before.length + 1);
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
  const CHAR_PROPERTIES = 11;
  const PARA_PROPERTIES = 12;

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

  it("carries both property bags, as every Apple paragraph style does", () => {
    // 3130 of 3130 paragraph styles across the fixtures have exactly
    // [1,10,11,12] — super, override_count, char_properties,
    // para_properties — with no exception and empty bags included. Ours
    // omitted the paragraph bag when the caller set only character
    // formatting, and the style then applied correctly while staying out of
    // the app's style list.
    const corpus = new Map<string, number>();
    for (const name of readdirSync(FIXTURES)) {
      if (!name.endsWith(".pages")) continue;
      let doc: PagesDocument;
      try {
        doc = PagesDocument.load(new Uint8Array(readFileSync(new URL(name, FIXTURES))));
      } catch {
        continue;
      }
      for (const { obj } of doc.store.allObjects()) {
        if (obj.type !== PARAGRAPH_STYLE) continue;
        const key = [...new Set(obj.message.fields.map((f) => f.no))].sort((a, b) => a - b).join(",");
        corpus.set(key, (corpus.get(key) ?? 0) + 1);
      }
    }
    // The premise: Apple is uniform here. If a future fixture is not, this
    // fails and the rule below needs revisiting rather than enforcing.
    expect(`apple shapes: ${[...corpus.keys()].join(" | ")}`).toBe("apple shapes: 1,10,11,12");

    for (const options of [
      { name: "Char Only", character: { fontSize: 20 } },
      { name: "Para Only", paragraph: {} },
      { name: "Neither" },
    ]) {
      const doc = PagesDocument.load(BASE);
      doc.createParagraphStyle(options);
      const style = findByName(PagesDocument.load(doc.save()), options.name)!;
      const shape = [...new Set(style.message.fields.map((f) => f.no))]
        .sort((a, b) => a - b)
        .join(",");
      expect(`${options.name}: ${shape}`).toBe(`${options.name}: 1,10,11,12`);
    }
  });

  it("joins the theme's style list, which the panel reads", () => {
    // TP.ThemeArchive.super.110.7 is present in all 19 Pages fixtures and
    // holds exactly the names the app shows. Confirmed in Pages: with this
    // entry (plus name, identifier map entry, and both property bags) a
    // created style appears in the paragraph styles panel; without it, the
    // same style applies correctly and never lists. This test pins that
    // the entry is written and the existing ones survive.
    const THEME = 10001;
    const themeList = (doc: PagesDocument): string[] => {
      for (const { obj } of doc.store.allObjects()) {
        if (obj.type !== THEME) continue;
        const list = obj.message.getMessage(1)?.getMessage(110);
        return (list?.getMessages(7) ?? []).map((r) => {
          const id = r.getUint(1);
          if (id === undefined) return "?";
          return doc.store.resolve(BigInt(id))?.message.getMessage(SUPER)?.getString(1) ?? "?";
        });
      }
      return [];
    };

    const before = themeList(PagesDocument.load(BASE));
    expect(before.length > 0).toBe(true);

    const doc = PagesDocument.load(BASE);
    doc.createParagraphStyle({ name: "Panel Style" });
    const after = themeList(PagesDocument.load(doc.save()));
    expect(`${after.length}: ${after.includes("Panel Style")}`).toBe(
      `${before.length + 1}: true`,
    );
    // Appended, not replacing: the document's own styles must survive.
    expect(after.slice(0, before.length).join(",")).toBe(before.join(","));
  });

  it("declares the style so the theme's reference is not dangling", () => {
    // The theme lives in Document.iwa and the style in
    // DocumentStylesheet.iwa, so this is a cross-component reference and
    // has to be declared. An undeclared one is how an app decides a
    // document is damaged.
    const doc = PagesDocument.load(BASE);
    const id = doc.createParagraphStyle({ name: "Declared Style" });
    const saved = PagesDocument.load(doc.save());
    for (const { obj } of saved.store.allObjects()) {
      if (obj.type !== 10001) continue;
      const declared = obj.getObjectReferences().map(String);
      const style = findByName(saved, "Declared Style")!;
      expect(`theme declares the style: ${declared.includes(String(style.identifier))}`).toBe(
        "theme declares the style: true",
      );
    }
    expect(id > 0n).toBe(true);
  });

  it("reads the list back, and can take a style out of it", () => {
    // The control for the rung above. Adding an entry and seeing nothing
    // change in the app is ambiguous — it says either the list is not what
    // the panel reads or the entry is malformed. Removing a name the app
    // certainly shows separates the two, so removal has to work as exactly
    // as addition does.
    const doc = PagesDocument.load(BASE);
    const before = doc.listedParagraphStyles();
    expect(before.length > 0).toBe(true);
    // The panel list is a strict subset of the stylesheet's styles: 12
    // against 146 in this base. A reader that conflated them would show
    // every anonymous override.
    expect(before.length < doc.paragraphStyles().length).toBe(true);

    const victim = before.find((s) => s.name === "Caption") ?? before[0]!;
    expect(doc.unlistParagraphStyle(victim.id)).toBe(true);
    // Idempotent: a second removal is a no-op, not a corruption.
    expect(doc.unlistParagraphStyle(victim.id)).toBe(false);

    const after = PagesDocument.load(doc.save()).listedParagraphStyles();
    expect(`${after.length} without ${victim.name}: ${!after.some((s) => s.id === victim.id)}`).toBe(
      `${before.length - 1} without ${victim.name}: true`,
    );
    // Every other entry survives, in order — a rebuilt list that reorders
    // the panel would be a worse bug than the one being chased.
    expect(after.map((s) => s.name).join(",")).toBe(
      before.filter((s) => s.id !== victim.id).map((s) => s.name).join(","),
    );
  });

  it("can copy a listed style's property bags instead of starting empty", () => {
    // Every style the panel lists is dense — 27-28 paragraph properties and
    // 30-31 character ones, in the Word-imported fixture as much as in
    // Apple's own — and a style this library creates sets only what it was
    // asked for. `copyOf` closes that gap so the two can be compared in the
    // app; whether density is what the panel wants is still open.
    const doc = PagesDocument.load(BASE);
    const body = doc.listedParagraphStyles().find((s) => s.name === "Body")!;
    const source = doc.store.resolve(body.id)!;
    const dense = (obj: { message: RawMessage }, field: number) =>
      obj.message.getMessage(field)?.fields.length ?? 0;

    const id = doc.createParagraphStyle({
      name: "Copied",
      copyOf: body.id,
      character: { fontSize: 24 },
    });
    const copy = doc.store.resolve(id)!;
    expect(dense(copy, CHAR_PROPERTIES) >= dense(source, CHAR_PROPERTIES)).toBe(true);
    expect(dense(copy, PARA_PROPERTIES)).toBe(dense(source, PARA_PROPERTIES));
    // The overlay wins over the copy: 24pt, not Body's size.
    expect(copy.message.getMessage(CHAR_PROPERTIES)?.getFloat(CharProps.FONT_SIZE)).toBe(24);
    // And the style it copied is untouched — a shared message would have
    // resized every Body paragraph in the document.
    expect(source.message.getMessage(CHAR_PROPERTIES)?.getFloat(CharProps.FONT_SIZE) !== 24).toBe(
      true,
    );
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

/**
 * Shape-audit findings, pinned one at a time.
 *
 * `npm run shape:audit` compares every archive a ladder rung writes
 * against the shape the corpus gives that type. A budget check keeps the
 * finding count from growing; these tests pin each individual fix so it
 * cannot quietly come undone, because a budget that goes 2 → 2 while one
 * defect returns and another is fixed says nothing.
 */
describe("archives we create carry the shape Apple's carry", () => {
  const STORAGE_TYPE = 2001;
  const IMAGE_TYPE = 3005;
  const ATTACHMENT_TYPE = 2003;
  const SECTION_TYPE = 10011;
  const LADDER_BASE = new Uint8Array(
    readFileSync(new URL("patrickomatic-termpaper-footers-masks.pages", FIXTURES)),
  );

  /** Distinct top-level field numbers, sorted — the audit's own comparison. */
  const shape = (m: RawMessage): string =>
    [...new Set(m.fields.map((f) => f.no))].sort((a, b) => a - b).join(",");

  it("gives a new footnote storage every table a real storage has", () => {
    // 2676 of 2676 corpus storages carry table_para_style (5),
    // table_para_data (6), table_list_style (7), in_document (10),
    // table_para_starts (14) and table_para_bidi (24). A created one had
    // none: a kind, a stylesheet and a string. table_para_style is where a
    // paragraph's style lives, and a storage without it has no styled
    // paragraph at all.
    const doc = PagesDocument.load(LADDER_BASE);
    doc.appendParagraph("A sentence that wants a note.");
    doc.body.addFootnote(doc.body.text.length - 1, "the note");

    const saved = PagesDocument.load(doc.save());
    const notes = [...saved.store.allObjects()]
      .map(({ obj }) => obj)
      .filter((obj) => obj.type === STORAGE_TYPE && obj.message.getUint(1) === 2);
    expect(notes.length).toBe(1);
    const missing = [5, 6, 7, 10, 14, 24].filter((f) => !notes[0]!.message.has(f));
    expect(`footnote storage missing: ${missing.join(",")}`).toBe("footnote storage missing: ");

    // And the paragraph table names the document's Footnote style rather
    // than sitting there empty, which is the shape that means "unstyled".
    const entry = notes[0]!.message.getMessage(5)?.getMessages(1)[0];
    const styleId = entry?.getMessage(2)?.getVarint(1);
    const style = styleId !== undefined ? saved.store.resolve(styleId) : undefined;
    expect(style?.message.getMessage(1)?.getString(1)).toBe("Footnote");
  });

  it("gives an inserted image a style, both sizes, and an anchored attachment", () => {
    // An image with no style is the cell-control-with-no-format shape: all
    // 83 corpus images point at a TSD.MediaStyleArchive, and all 101
    // attachments carry four offset fields we wrote none of.
    const doc = PagesDocument.load(LADDER_BASE);
    const red = Uint8Array.from(
      atob(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
      ),
      (c) => c.charCodeAt(0),
    );
    const { imageId } = doc.insertInlineImage(doc.body.text.length, red, {
      fileName: "dot.png",
      width: 60,
      height: 60,
    });

    const saved = PagesDocument.load(doc.save());
    const image = saved.store.resolve(imageId)!;
    expect(image.type).toBe(IMAGE_TYPE);
    for (const [field, what] of [
      [3, "style"],
      [4, "originalSize"],
      [7, "flags"],
      [9, "naturalSize"],
      [11, "data"],
      [18, "interpretsUntaggedImageDataAsGeneric"],
    ] as const) {
      expect(`${what}: ${image.message.has(field)}`).toBe(`${what}: true`);
    }
    // The style is the theme's, not one invented for this image.
    const style = saved.store.resolve(image.message.getMessage(3)?.getVarint(1));
    expect(style?.message.getMessage(1)?.getString(2)).toBe("image-0-imageStyle");

    const attachment = [...saved.store.allObjects()]
      .map(({ obj }) => obj)
      .find((obj) => obj.type === ATTACHMENT_TYPE && obj.message.getMessage(1)?.getVarint(1) === imageId);
    expect(shape(attachment!.message)).toBe("1,2,3,4,5");
  });

  it("leaves an inserted section its name", () => {
    // All 47 corpus sections carry one — the page master's, "Blank" in a
    // stock template — and insertSectionBreak explicitly removed the name
    // the clone brought with it.
    const doc = PagesDocument.load(LADDER_BASE);
    doc.appendParagraph("first");
    const at = doc.appendParagraph("second");
    doc.insertSectionBreak(at);

    const saved = PagesDocument.load(doc.save());
    const unnamed = [...saved.store.allObjects()]
      .map(({ obj }) => obj)
      .filter((obj) => obj.type === SECTION_TYPE && !obj.message.has(26));
    expect(`sections with no name: ${unnamed.length}`).toBe("sections with no name: 0");
  });

  it("does not let a copied drawable declare what contains it", () => {
    // The container rule, one type over from the image extractor that
    // already knows it. A clone arrives carrying the `parent` Apple writes
    // and never declares, and a copy of a grouped image reaches
    // ObjectStore.save's generic scan — which declared it: the mask
    // pointing at the image it masks, each shape at its group.
    const source = new Uint8Array(
      readFileSync(new URL("compphysics-poster-images-masks.pages", FIXTURES)),
    );
    const doc = PagesDocument.load(source);
    const page = doc.floatingDrawablePages()[0]!;
    const group = doc.floatingDrawables(page)!;
    const first = group.drawables()[0]!;
    const copy = group.addCopyOf(first);

    const saved = PagesDocument.load(doc.save());
    const offenders: string[] = [];
    // Via the library's own per-type depth, not by guessing: field 2 one
    // level down is `TSD.ShapeArchive.style` for a shape info, a reference
    // Apple does declare, and a search that took the first field-2 it found
    // would report every styled shape as an offender.
    for (const { obj } of saved.store.allObjects()) {
      const parent = drawableParent(obj.type, obj.message);
      if (parent === undefined) continue;
      if (obj.getObjectReferences().includes(parent)) {
        offenders.push(`${obj.type}#${obj.identifier}→${parent}`);
      }
    }
    expect(`declaring their container: ${offenders.slice(0, 4).join(" ")}`).toBe(
      "declaring their container: ",
    );
    expect(copy.id > 0n).toBe(true);
  });
});

describe("a bookmark's ranged flag matches its run", () => {
  // Found by a person, explained by the corpus. A named bookmark written
  // ranged=false over a 13-character run made Pages bookmark one character
  // — the flag won over the run. Apple's own files tie the flag to run
  // length exactly (true at 13 and 46, false at exactly 1), with the name
  // orthogonal, so that is the rule; deriving it from the name was an
  // inference that survived every offline check and not the app.
  const BOOKMARK_TYPE = 2035;
  const RANGED = 3;

  it("agrees with every corpus bookmark", () => {
    const wrong: string[] = [];
    for (const name of readdirSync(FIXTURES)) {
      if (!name.endsWith(".pages")) continue;
      let doc: PagesDocument;
      try {
        doc = PagesDocument.load(new Uint8Array(readFileSync(new URL(name, FIXTURES))));
      } catch {
        continue;
      }
      for (const storage of doc.textStorages()) {
        for (const b of storage.bookmarks()) {
          const ranged = doc.store.object(b.fieldId)?.message.getBool(RANGED) ?? false;
          if (ranged !== b.end - b.start > 1) {
            wrong.push(`${name}[${b.start},${b.end})=${ranged}`);
          }
        }
      }
    }
    expect(`corpus disagreements: ${wrong.join(" ")}`).toBe("corpus disagreements: ");
  });

  it("derives the flag from the span we author, for both call shapes", () => {
    const doc = PagesDocument.load(TEMPLATE);
    doc.appendParagraph("a phrase to bookmark and a point to anchor");
    const at = doc.body.text.lastIndexOf("phrase");
    const phrase = doc.body.addBookmark(at, at + 6, "named range");
    const point = doc.body.addBookmark(at + 10, at + 11, "destination");

    const saved = PagesDocument.load(doc.save());
    const flag = (id: bigint) => saved.store.object(id)!.message.getBool(RANGED);
    expect(`phrase ranged=${flag(phrase)} point ranged=${flag(point)}`).toBe(
      "phrase ranged=true point ranged=false",
    );
    expect(saved.store.object(phrase)!.type).toBe(BOOKMARK_TYPE);
  });
});

describe("a section break is a character as well as a table entry", () => {
  // P07 opened fine and did not paginate: the sidebar knew the new section,
  // the text kept flowing on the same page. The table entry names a section;
  // the U+0004 terminator is what breaks the page, and insertSectionBreak
  // wrote only the former.
  const TABLE_SECTION = 17;

  it("matches the corpus: every boundary's previous character is U+0004", () => {
    // 28 boundaries across five multi-section fixtures, no exception — and
    // U+0004 replaces the newline (the character before it is ordinary
    // text), so swapping the terminator is the whole edit.
    let boundaries = 0;
    const wrong: string[] = [];
    for (const name of readdirSync(FIXTURES)) {
      if (!name.endsWith(".pages")) continue;
      let doc: PagesDocument;
      try {
        doc = PagesDocument.load(new Uint8Array(readFileSync(new URL(name, FIXTURES))));
      } catch {
        continue;
      }
      const table = doc.store.resolve(doc.body.id)?.message.getMessage(TABLE_SECTION);
      for (const entry of table?.getMessages(1) ?? []) {
        const at = entry.getUint(1) ?? 0;
        if (at === 0) continue;
        boundaries++;
        const prev = doc.body.text.charCodeAt(at - 1);
        if (prev !== 0x04) wrong.push(`${name}@${at}=U+${prev.toString(16)}`);
      }
    }
    expect(boundaries >= 28).toBe(true);
    expect(`boundaries not after U+0004: ${wrong.join(" ")}`).toBe("boundaries not after U+0004: ");
  });

  it("rewrites the previous terminator when inserting a break", () => {
    const doc = PagesDocument.load(TEMPLATE);
    doc.appendParagraph("section one ends here");
    const second = doc.appendParagraph("section two starts here");
    doc.insertSectionBreak(second);

    const saved = PagesDocument.load(doc.save());
    const table = saved.store.resolve(saved.body.id)!.message.getMessage(TABLE_SECTION)!;
    const boundary = table
      .getMessages(1)
      .map((e) => e.getUint(1) ?? 0)
      .find((at) => at > 0)!;
    expect(`prev=U+${saved.body.text.charCodeAt(boundary - 1).toString(16).padStart(4, "0")}`).toBe(
      "prev=U+0004",
    );
    expect(saved.sections().length).toBe(2);
    // The swap must not cost any paragraph its style entry — the same
    // dense-table rule every other text edit is held to.
    const para = new Set(
      (saved.store.resolve(saved.body.id)!.message.getMessage(5)?.getMessages(1) ?? []).map(
        (e) => e.getUint(1) ?? 0,
      ),
    );
    const uncovered = saved.body.paragraphStarts().filter((s) => !para.has(s));
    expect(`uncovered: ${uncovered.join(",")}`).toBe("uncovered: ");
  });
});

describe("point-anchored tables never hold an objectless entry", () => {
  // P09 crashed Pages on open. The library seeded every newly created
  // attribute table with an objectless entry at 0 — correct for run-shaped
  // tables, where it means "nothing in effect from here", and fatal for
  // point-anchored ones, where an entry IS an object at a position: the
  // footnote-numbering walk dereferenced the entry that named nothing.
  // Ten confirmed rungs never hit it because they never created one of
  // these tables from nothing.
  const POINT = [9, 16]; // table_attachment, table_footnote

  const objectless = (doc: PagesDocument): string[] => {
    const out: string[] = [];
    for (const { obj } of doc.store.allObjects()) {
      if (obj.type !== 2001) continue;
      for (const field of POINT) {
        let table: RawMessage | undefined;
        try {
          table = obj.message.getMessage(field);
        } catch {
          continue;
        }
        for (const entry of table?.getMessages(1) ?? []) {
          let ref: bigint | undefined;
          try {
            ref = entry.getMessage(2)?.getVarint(1);
          } catch {
            ref = undefined;
          }
          if (ref === undefined) out.push(`#${obj.identifier}.${field}@${entry.getUint(1)}`);
        }
      }
    }
    return out;
  };

  it("matches the corpus: dozens of such tables, zero objectless entries", () => {
    // 45 in the Pages fixtures alone (107 across all three apps).
    let tables = 0;
    const bad: string[] = [];
    for (const name of readdirSync(FIXTURES)) {
      if (!name.endsWith(".pages")) continue;
      let doc: PagesDocument;
      try {
        doc = PagesDocument.load(new Uint8Array(readFileSync(new URL(name, FIXTURES))));
      } catch {
        continue;
      }
      for (const { obj } of doc.store.allObjects()) {
        if (obj.type !== 2001) continue;
        for (const field of POINT) {
          try {
            if (obj.message.getMessage(field)) tables++;
          } catch {
            continue;
          }
        }
      }
      bad.push(...objectless(doc).map((x) => `${name}:${x}`));
    }
    expect(tables >= 45).toBe(true);
    expect(`corpus objectless: ${bad.join(" ")}`).toBe("corpus objectless: ");
  });

  it("authors a footnote without one, in the body and in the note", () => {
    const doc = PagesDocument.load(TEMPLATE);
    doc.appendParagraph("a sentence that carries a footnote.");
    doc.body.addFootnote(doc.body.text.length - 1, "the note");
    const saved = PagesDocument.load(doc.save());
    expect(`objectless: ${objectless(saved).join(" ")}`).toBe("objectless: ");
    expect(saved.body.footnotes().length).toBe(1);
  });

  it("authors an inline attachment without one", () => {
    const doc = PagesDocument.load(TEMPLATE);
    doc.appendParagraph("a page number follows: ");
    doc.body.insertPageNumber(doc.body.text.length);
    const saved = PagesDocument.load(doc.save());
    expect(`objectless: ${objectless(saved).join(" ")}`).toBe("objectless: ");
  });
});

describe("a footnote mark is superscripted, in the body and in the note", () => {
  // "P09 footnote worked but the note ref wasn't superscript." The corpus
  // recipe, measured on the footnote fixture's 8 body marks and their
  // notes: one
  // shared anonymous character style whose entire property bag is
  // superscript=1, run over exactly the mark character — the body's U+000E
  // and the note's U+FFFC alike. Without it everything works and the
  // reference sits on the baseline at body size.
  const SUPERSCRIPT = 10;

  const bagOf = (doc: PagesDocument, id: bigint | undefined): string => {
    if (id === undefined) return "(none)";
    const bag = doc.store.resolve(id)?.message.getMessage(11);
    return bag ? bag.fields.map((f) => `${f.no}=${f.value as bigint}`).join(",") : "(no bag)";
  };

  it("matches the corpus: every U+000E is covered by a superscript-only style", () => {
    let marks = 0;
    const bad: string[] = [];
    for (const name of readdirSync(FIXTURES)) {
      if (!name.endsWith(".pages")) continue;
      let doc: PagesDocument;
      try {
        doc = PagesDocument.load(new Uint8Array(readFileSync(new URL(name, FIXTURES))));
      } catch {
        continue;
      }
      const text = doc.body.text;
      for (let i = 0; i < text.length; i++) {
        if (text.charCodeAt(i) !== 0x0e) continue;
        marks++;
        const bag = bagOf(doc, doc.body.effectiveObjectAt(8, i));
        if (bag !== `${SUPERSCRIPT}=1`) bad.push(`${name}@${i}:${bag}`);
      }
    }
    expect(marks >= 8).toBe(true);
    expect(`marks not superscript-covered: ${bad.join(" ")}`).toBe("marks not superscript-covered: ");
  });

  it("authors both marks with one shared style, like Apple's", () => {
    const doc = PagesDocument.load(TEMPLATE);
    doc.appendParagraph("first sentence with a note.");
    doc.body.addFootnote(doc.body.text.length - 1, "note one");
    doc.appendParagraph("second sentence with a note.");
    doc.body.addFootnote(doc.body.text.length - 1, "note two");

    const saved = PagesDocument.load(doc.save());
    const text = saved.body.text;
    const styles: string[] = [];
    for (let i = 0; i < text.length; i++) {
      if (text.charCodeAt(i) !== 0x0e) continue;
      const id = saved.body.effectiveObjectAt(8, i);
      styles.push(String(id));
      expect(`body mark bag: ${bagOf(saved, id)}`).toBe(`body mark bag: ${SUPERSCRIPT}=1`);
      // The run ends after the mark — the sentence's own styling resumes.
      expect(saved.body.effectiveObjectAt(8, i + 1)).toBe(undefined);
    }
    expect(styles.length).toBe(2);
    // One style object for the whole document, not one per footnote.
    expect(new Set(styles).size).toBe(1);

    for (const note of saved.body.footnotes()) {
      const runs = note.storage.object.message.getMessage(8)?.getMessages(1) ?? [];
      expect(runs.length).toBe(2);
      expect(String(runs[0]!.getMessage(2)?.getVarint(1))).toBe(styles[0]!);
    }
  });
});

describe("a comment always names an author", () => {
  // "P08 can't read comment on iPhone." Every corpus comment carries
  // field 3, a reference to a named TSK.AnnotationAuthorArchive listed in
  // the document's roster; ours wrote none when the document had no
  // existing author to reuse — the ladder base has a roster wired to the
  // document root with zero authors in it. Pages for iOS showed the
  // authorless comment as an unreadable placeholder.
  const COMMENT = 3056;

  it("matches the corpus: every comment carries an author reference", () => {
    let comments = 0;
    const bad: string[] = [];
    for (const name of readdirSync(FIXTURES)) {
      if (!name.endsWith(".pages")) continue;
      let doc: PagesDocument;
      try {
        doc = PagesDocument.load(new Uint8Array(readFileSync(new URL(name, FIXTURES))));
      } catch {
        continue;
      }
      for (const { obj } of doc.store.allObjects()) {
        if (obj.type !== COMMENT) continue;
        comments++;
        let author: bigint | undefined;
        try {
          author = obj.message.getMessage(3)?.getVarint(1);
        } catch {
          author = undefined;
        }
        if (author === undefined || !doc.store.resolve(author)) bad.push(`${name}#${obj.identifier}`);
      }
    }
    expect(comments >= 4).toBe(true);
    expect(`authorless corpus comments: ${bad.join(" ")}`).toBe("authorless corpus comments: ");
  });

  it("gives every author the corpus shape: name, colour, is_public_author", () => {
    // The colour is what stood between "renders" and "crashes on open" —
    // both corpus authors carry the identical comment-yellow TSP.Color and
    // the comment UI draws the author's tint. Both also write
    // is_public_author=false explicitly, and both rosters list their
    // author while declaring refs=[]; declaring the reference is a shape
    // no real document has.
    const base = new Uint8Array(
      readFileSync(new URL("patrickomatic-termpaper-footers-masks.pages", FIXTURES)),
    );
    const doc = PagesDocument.load(base);
    doc.appendParagraph("a phrase carrying a comment.");
    const at = doc.body.text.lastIndexOf("phrase");
    doc.body.addComment(at, at + 6, "the comment text");
    const saved = PagesDocument.load(doc.save());
    for (const { obj } of saved.store.allObjects()) {
      if (obj.type !== 212) continue;
      const shape = [...new Set(obj.message.fields.map((f) => f.no))].sort((a, b) => a - b);
      expect(`author fields: ${shape.join(",")}`).toBe("author fields: 1,2,4");
      const CORPUS_COLOR = "8,1,29,251,250,122,63,37,240,239,111,63,45,181,180,180,62,53,0,0,128,63,96,1";
      expect(Array.from(obj.message.getMessage(2)!.toBytes()).join(",")).toBe(CORPUS_COLOR);
    }
    for (const { obj } of saved.store.allObjects()) {
      if (obj.type !== 213) continue;
      expect(`roster declares: ${obj.getObjectReferences().join(",")}`).toBe("roster declares: ");
    }
  });

  it("creates and registers a default author when the document has none", () => {
    const base = new Uint8Array(
      readFileSync(new URL("patrickomatic-termpaper-footers-masks.pages", FIXTURES)),
    );
    const doc = PagesDocument.load(base);
    doc.appendParagraph("a phrase carrying a comment.");
    const at = doc.body.text.lastIndexOf("phrase");
    doc.body.addComment(at, at + 6, "the comment text");

    const saved = PagesDocument.load(doc.save());
    for (const { obj } of saved.store.allObjects()) {
      if (obj.type !== COMMENT) continue;
      const author = saved.store.resolve(obj.message.getMessage(3)?.getVarint(1));
      expect(`author resolves: ${author !== undefined}`).toBe("author resolves: true");
      expect(author!.message.getString(1)).toBe("cupertino-files");
      expect(obj.getObjectReferences().includes(author!.identifier)).toBe(true);
      // And the roster the base already carries now lists them.
      for (const { obj: roster } of saved.store.allObjects()) {
        if (roster.type !== 213) continue;
        const listed = roster.message
          .getMessages(1)
          .some((r) => r.getVarint(1) === author!.identifier);
        expect(`roster lists the author: ${listed}`).toBe("roster lists the author: true");
      }
    }
  });
});

describe("a hyperlink carries the document's Link character style", () => {
  // "For hyperlinks there were no hyperlink character style applied." The
  // link *worked* — P04's click passed — and did not look like one. The
  // native convention, measured: name "Link", identifier
  // "character-style-hyperlink", property bag exactly {underline: 1},
  // shipped by every template in the corpus and covering every native link
  // run. The Word imports carry their own styles, which is why the rule
  // pinned here is about what we author, plus the convention's existence.

  it("finds the Link style shipped by both ladder bases", () => {
    for (const base of [
      "patrickomatic-termpaper-footers-masks.pages",
      "iwork-mcp-v14.5-sample.pages",
    ]) {
      const doc = PagesDocument.load(new Uint8Array(readFileSync(new URL(base, FIXTURES))));
      const link = doc.stylesheet.findByIdentifier("character-style-hyperlink");
      expect(`${base} Link style: ${link?.name}`).toBe(`${base} Link style: Link`);
    }
  });

  it("styles an authored link with it by default", () => {
    const doc = PagesDocument.load(TEMPLATE);
    doc.appendParagraph("visit the apple site today");
    const at = doc.body.text.lastIndexOf("apple site");
    doc.insertLink(at, at + 10, "https://www.apple.com/");

    const saved = PagesDocument.load(doc.save());
    const expected = saved.stylesheet.findByIdentifier("character-style-hyperlink")!;
    const covering = saved.body.effectiveObjectAt(8, at);
    expect(`link styled by: ${covering}`).toBe(`link styled by: ${expected.id}`);
    // The run is the link, not the paragraph.
    expect(saved.body.effectiveObjectAt(8, at + 10)).toBe(undefined);
    // And the field itself is still there and live.
    expect(saved.body.links().some((l) => l.start === at && l.end === at + 10)).toBe(true);
  });

  it("lets the style be skipped or overridden", () => {
    const doc = PagesDocument.load(TEMPLATE);
    doc.appendParagraph("plain link and styled link here");
    const a = doc.body.text.lastIndexOf("plain link");
    doc.insertLink(a, a + 10, "https://example.org/", { characterStyle: false });
    expect(doc.body.effectiveObjectAt(8, a)).toBe(undefined);

    const custom = doc.stylesheet.createCharacterStyle({ character: { bold: true } });
    const b = doc.body.text.lastIndexOf("styled link");
    doc.insertLink(b, b + 11, "https://example.org/", { characterStyle: custom });
    expect(doc.body.effectiveObjectAt(8, b)).toBe(custom);

    // The field is live in both cases — styling is presentation only.
    const links = PagesDocument.load(doc.save()).body.links();
    expect(links.length >= 2).toBe(true);
  });

  it("footnote marks accept the same skip and override", () => {
    const doc = PagesDocument.load(TEMPLATE);
    doc.appendParagraph("a sentence with an unstyled note.");
    doc.body.addFootnote(doc.body.text.length - 1, "note", { markStyle: false });
    const saved = PagesDocument.load(doc.save());
    const text = saved.body.text;
    for (let i = 0; i < text.length; i++) {
      if (text.charCodeAt(i) !== 0x0e) continue;
      expect(`skipped mark style: ${saved.body.effectiveObjectAt(8, i)}`).toBe(
        "skipped mark style: undefined",
      );
    }
    expect(saved.body.footnotes().length).toBe(1);
  });
});
