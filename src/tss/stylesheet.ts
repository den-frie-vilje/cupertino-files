/**
 * TSS.StylesheetArchive wrapper: enumerate styles, look them up by name or
 * identifier, and create new paragraph/character styles.
 *
 * New style objects are created inside the stylesheet's own component (which
 * is where the apps keep them); registration updates the stylesheet's
 * `styles` list, `identifier_to_style_map` (when an identifier is given) and
 * `parent_to_children_style_map` (when based on another style). The
 * `styles_for_*` compatibility snapshots are deliberately left untouched.
 */
import type { IwaObject } from "../tsp/iwa.ts";
import { RawMessage } from "../base/protobuf.ts";
import type { Component, ObjectStore } from "../tsp/store.ts";
import { makeRef, refId } from "../tsp/schema.ts";
import type { Color, Shadow, Stroke } from "../tsd/style.ts";
import {
  readColor,
  readFill,
  readShadow,
  readStroke,
  writeColor,
  writeFill,
  writeShadow,
  writeStroke,
} from "../tsd/style.ts";
import {
  bordersFromDeprecated,
  CharProps,
  deprecatedBorders,
  LineSpacing,
  ParaProps,
  StyleArchive,
  TabArchive,
  TabsArchive,
  TextAlignment,
  TSWP_TYPE,
} from "../tswp/schema.ts";
import {
  IdentifiedStyleEntry,
  StyleChildrenEntry,
  StylesheetFields,
  StyleSuper,
} from "./schema.ts";

export interface StyleInfo {
  id: bigint;
  type: number;
  /** UI name ("Body", "Heading 1", …); unset for anonymous styles. */
  name: string | undefined;
  /** Machine identifier ("paragraph-style-32", …). */
  identifier: string | undefined;
  parentId: bigint | undefined;
}

export interface CharacterFormatting {
  bold?: boolean;
  italic?: boolean;
  /** Point size. */
  fontSize?: number;
  /** PostScript font name, e.g. "Helvetica-Bold". */
  fontName?: string;
  fontColor?: Color;
  /** Text highlight colour behind the glyphs. */
  backgroundColor?: Color;
  /** 0 none, 1 single, 2 double, 3 wavy — see {@link UnderlineType}. */
  underline?: number;
  underlineColor?: Color;
  underlineWidth?: number;
  /** Underline words only, skipping the spaces between them. */
  wordUnderline?: boolean;
  /** 0 none, 1 single, 2 double, 3 triple — see {@link StrikethruType}. */
  strikethru?: number;
  strikethruColor?: Color;
  strikethruWidth?: number;
  wordStrikethru?: boolean;
  /** 0 none, 1 all caps, 2 small caps, 3 title case. */
  capitalization?: number;
  /** 0 required, 1 standard, 2 all. */
  ligatures?: number;
  /** 0 normal, 1 superscript, 2 subscript. */
  superscript?: number;
  /** Additional tracking (fraction of font size). */
  tracking?: number;
  /** Manual kerning adjustment. */
  kerning?: number;
  baselineShift?: number;
  /** Glyph outline width; 0 = filled text. */
  outline?: number;
  outlineColor?: Color;
  shadow?: Shadow;
  /** BCP-47 language tag used for spelling and hyphenation. */
  language?: string;
}

/** A single tab stop. */
export interface TabStop {
  /** Distance from the left text margin, in points. */
  position: number;
  /** 0 left, 1 center, 2 right, 3 decimal — see {@link TabAlignment}. */
  alignment?: number;
  /** Repeated to fill the tab, e.g. "." for a dot leader. */
  leader?: string;
}

export interface ParagraphFormatting {
  /** 0 left, 1 right, 2 center, 3 justified, 4 natural. */
  alignment?: TextAlignment;
  spaceBefore?: number;
  spaceAfter?: number;
  firstLineIndent?: number;
  leftIndent?: number;
  rightIndent?: number;
  /** Relative line spacing multiple (mode 0). */
  lineSpacing?: number;
  keepLinesTogether?: boolean;
  keepWithNext?: boolean;
  pageBreakBefore?: boolean;
  widowControl?: boolean;
  hyphenate?: boolean;
  /** Heading outline level (1-based; 0 = body). */
  outlineLevel?: number;
  showInToc?: boolean;
  /** Paragraph background. Apple stores a flat colour here, never a gradient. */
  backgroundColor?: Color;
  /** The paragraph rule / border line. */
  border?: Stroke;
  /** Where {@link border} is drawn — see {@link BorderPosition}. */
  borderPositions?: number;
  /** Round the corners of a four-sided border. */
  roundedCorners?: boolean;
  /** Historical rule width, kept in step with `border.width` by the apps. */
  ruleWidth?: number;
  /**
   * Distance between the text and its border rules, stored as a
   * `TSP.Point`. A number writes both slots — they agree in 8637 of the
   * corpus's 8638 instances — and a pair states them separately. Zero
   * is the default gap, which the app itself states as `(0, 0)` when it
   * resaves a bordered style; negative pulls the rules toward and into
   * the text (−12 renders overlapping, the stock templates' −3
   * tightens), and the app preserves values beyond what its inspector
   * displays. `undefined` clears the field — no corpus style uses the
   * null flag.
   */
  ruleOffset?: number | { x: number; y: number };
  /** Explicit tab stops. An empty array clears them. */
  tabs?: TabStop[];
  /** Spacing of the implicit tab grid used beyond the last explicit stop. */
  defaultTabStops?: number;
  /** Character a decimal tab aligns on (locale-dependent: "." or ","). */
  decimalTab?: string;
  /**
   * Stored raw, and vestigial: no corpus style carries the field, styled
   * values 0/1/2 all render left-to-right, and the app leaves it
   * untouched when flipping a paragraph. The working mechanism is the
   * storage's bidi table — use `setParagraphDirection` /
   * `ParagraphHandle.setDirection` instead.
   */
  writingDirection?: number;
}

export class StylesheetModel {
  readonly store: ObjectStore;
  readonly object: IwaObject;

  constructor(store: ObjectStore, object: IwaObject) {
    this.store = store;
    this.object = object;
  }

  get id(): bigint {
    return this.object.identifier;
  }

  private get msg(): RawMessage {
    return this.object.message;
  }

  get component(): Component {
    const c = this.store.componentOf(this.id);
    if (!c) throw new RangeError(`stylesheet ${this.id}: component not found`);
    return c;
  }

  /** Parent stylesheet (theme stylesheet), if chained. */
  get parentId(): bigint | undefined {
    return refId(this.msg, StylesheetFields.PARENT);
  }

  /** All styles registered in the `styles` list, resolved to StyleInfo. */
  styles(): StyleInfo[] {
    const out: StyleInfo[] = [];
    for (const ref of this.msg.getMessages(StylesheetFields.STYLES)) {
      const id = ref.getVarint(1);
      const obj = this.store.resolve(id);
      if (id === undefined || !obj) continue;
      out.push(describeStyle(obj));
    }
    return out;
  }

  /** identifier → style id entries of `identifier_to_style_map`. */
  identifierMap(): Map<string, bigint> {
    const out = new Map<string, bigint>();
    for (const e of this.msg.getMessages(StylesheetFields.IDENTIFIER_TO_STYLE_MAP)) {
      const key = e.getString(IdentifiedStyleEntry.IDENTIFIER);
      const id = refId(e, IdentifiedStyleEntry.STYLE);
      if (key !== undefined && id !== undefined) out.set(key, id);
    }
    return out;
  }

  /**
   * Find a style by UI name (exact match), optionally filtered by archive
   * type. Searches this stylesheet, then its parent chain.
   */
  findByName(name: string, type?: number): StyleInfo | undefined {
    for (const s of this.styles()) {
      if (s.name === name && (type === undefined || s.type === type)) return s;
    }
    const parent = this.parentSheet();
    return parent?.findByName(name, type);
  }

  findByIdentifier(identifier: string): StyleInfo | undefined {
    const id = this.identifierMap().get(identifier);
    if (id !== undefined) {
      const obj = this.store.resolve(id);
      if (obj) return describeStyle(obj);
    }
    return this.parentSheet()?.findByIdentifier(identifier);
  }

  parentSheet(): StylesheetModel | undefined {
    const pid = this.parentId;
    const obj = pid !== undefined ? this.store.resolve(pid) : undefined;
    return obj ? new StylesheetModel(this.store, obj) : undefined;
  }

  paragraphStyles(): StyleInfo[] {
    return this.styles().filter((s) => s.type === TSWP_TYPE.PARAGRAPH_STYLE);
  }

  characterStyles(): StyleInfo[] {
    return this.styles().filter((s) => s.type === TSWP_TYPE.CHARACTER_STYLE);
  }

  /**
   * Create a paragraph style. Returns the new style's object id.
   * `basedOn` may be a style id or a UI name resolved in this sheet chain.
   */
  createParagraphStyle(options: {
    name?: string;
    identifier?: string;
    basedOn?: bigint | string;
    copyOf?: bigint | string;
    character?: CharacterFormatting;
    paragraph?: ParagraphFormatting;
  }): bigint {
    const parentId = this.resolveBase(options.basedOn, TSWP_TYPE.PARAGRAPH_STYLE);
    const source =
      options.copyOf === undefined
        ? undefined
        : this.store.resolve(this.resolveBase(options.copyOf, TSWP_TYPE.PARAGRAPH_STYLE));
    // Derived once and used twice: Apple's listed styles carry the same
    // string in `super.identifier` and as the map key, and the panel wants
    // both. Writing only the map entry leaves the style listed but with no
    // identity of its own.
    const identifier = options.identifier ?? this.deriveIdentifier(options.name);
    const obj = this.store.createObject(TSWP_TYPE.PARAGRAPH_STYLE, this.component);
    const m = obj.message;
    m.setMessage(StyleArchive.SUPER, buildStyleSuper(options.name, identifier, parentId, this.id));
    // **Both property bags, always.** 9068 of the corpus's 9069 paragraph
    // styles have the identical top-level field set — super,
    // override_count, char_properties, para_properties — empty bags
    // included (the one exception is a bare 2013-era archive). Matching
    // that costs nothing.
    //
    // The bags are also one of four requirements for the app's style panel
    // to list a created style (with the name, the identifier map entry, and
    // the theme's preset-list reference) — confirmed in Pages after four
    // rounds in which each alone changed nothing visible.
    //
    // Character styles are the counter-case, and the reason this is not a
    // blanket rule: theirs is [1,10,11] in 383 of 429, with no paragraph
    // bag at all. Only the paragraph style carries both.
    //
    // `copyOf` starts each bag from an existing style's instead of from
    // nothing. Every one of the 35 styles the panel lists in
    // `picodocs-v14.4-headers-tables.pages` sets 27-28 paragraph properties
    // and 30-31 character ones — none is sparse, whether Apple authored it
    // or Word did — while ours sets three and none. Whether that density is
    // what the panel requires or merely what Apple happens to write is the
    // open question; `copyOf` exists so the two can be told apart.
    let overrides = 0;
    const character = cloneBag(source?.message.getMessage(StyleArchive.CHAR_PROPERTIES));
    applyCharacterProperties(character, options.character ?? {});
    overrides += character.fields.length;
    m.setMessage(StyleArchive.CHAR_PROPERTIES, character);
    const paragraph = cloneBag(source?.message.getMessage(StyleArchive.PARA_PROPERTIES));
    applyParagraphProperties(paragraph, options.paragraph ?? {});
    overrides += paragraph.fields.length;
    m.setMessage(StyleArchive.PARA_PROPERTIES, paragraph);
    m.setVarint(StyleArchive.OVERRIDE_COUNT, overrides);
    this.register(obj.identifier, identifier, parentId);
    return obj.identifier;
  }

  /**
   * A stable identifier for a style the caller has named.
   *
   * Naming a style and having it appear in the app's style list are two
   * different things, and only the second is what anyone means. Of the 146
   * paragraph styles in the ladder's base document, 23 carry a
   * `super.name` and 21 of those also sit in `identifier_to_style_map`,
   * keyed by a `super.identifier` that matches the map entry exactly. A
   * style with a name and no identifier renders correctly wherever it is
   * applied and never appears in the panel — which is precisely what
   * `createParagraphStyle({ name })` used to produce.
   *
   * Apple's identifiers are `<origin>-<n>-paragraphstyle-<Name>`, the
   * origin naming where the style came from — `text` for the document's
   * own, `captions`, `chart`. A style this library creates is a document
   * style, so it takes `text` and the next free index.
   *
   * Returns undefined for an unnamed style: an anonymous override is not
   * supposed to be listed, and giving it an identifier would put it in the
   * panel as a stray entry.
   */
  private deriveIdentifier(name: string | undefined): string | undefined {
    if (name === undefined) return undefined;
    let next = 0;
    for (const entry of this.msg.getMessages(StylesheetFields.IDENTIFIER_TO_STYLE_MAP)) {
      const key = entry.getString(IdentifiedStyleEntry.IDENTIFIER);
      const match = key?.match(/^text-(\d+)-paragraphstyle-/);
      if (match) next = Math.max(next, Number(match[1]) + 1);
    }
    return `text-${next}-paragraphstyle-${name}`;
  }

  /** Create a character style (anonymous unless a name/identifier is given). */
  createCharacterStyle(options: {
    name?: string;
    identifier?: string;
    basedOn?: bigint | string;
    character: CharacterFormatting;
  }): bigint {
    const parentId = this.resolveBase(options.basedOn, TSWP_TYPE.CHARACTER_STYLE);
    const obj = this.store.createObject(TSWP_TYPE.CHARACTER_STYLE, this.component);
    const m = obj.message;
    m.setMessage(
      StyleArchive.SUPER,
      buildStyleSuper(options.name, options.identifier, parentId, this.id),
    );
    const props = buildCharacterProperties(options.character);
    m.setVarint(StyleArchive.OVERRIDE_COUNT, props.fields.length);
    m.setMessage(StyleArchive.CHAR_PROPERTIES, props);
    this.register(obj.identifier, options.identifier, parentId);
    return obj.identifier;
  }

  /**
   * Handle for reading and editing an existing style, by id or UI name.
   *
   * Editing a style reaches every run that uses it — which is the point of a
   * stylesheet, and the difference between "make this heading blue" and
   * "make all headings blue".
   */
  style(style: bigint | string, type?: number): StyleHandle | undefined {
    const id = typeof style === "bigint" ? style : this.findByName(style, type)?.id;
    if (id === undefined) return undefined;
    const obj = this.store.resolve(id);
    return obj ? new StyleHandle(this.store, obj) : undefined;
  }

  private resolveBase(basedOn: bigint | string | undefined, type: number): bigint | undefined {
    if (basedOn === undefined) return undefined;
    if (typeof basedOn === "bigint") return basedOn;
    const found = this.findByName(basedOn, type);
    if (!found) throw new RangeError(`base style not found: ${JSON.stringify(basedOn)}`);
    return found.id;
  }

  /** Register a style object in this sheet's lists/maps. */
  private register(styleId: bigint, identifier: string | undefined, parentId: bigint | undefined): void {
    this.msg.addMessage(StylesheetFields.STYLES, makeRef(styleId));
    if (identifier !== undefined) {
      const entry = RawMessage.create();
      entry.setString(IdentifiedStyleEntry.IDENTIFIER, identifier);
      entry.setMessage(IdentifiedStyleEntry.STYLE, makeRef(styleId));
      this.msg.addMessage(StylesheetFields.IDENTIFIER_TO_STYLE_MAP, entry);
    }
    if (parentId !== undefined && this.msg.has(StylesheetFields.PARENT_TO_CHILDREN_STYLE_MAP)) {
      const entries = this.msg.getMessages(StylesheetFields.PARENT_TO_CHILDREN_STYLE_MAP);
      const existing = entries.find((e) => refId(e, StyleChildrenEntry.PARENT) === parentId);
      if (existing) {
        existing.addMessage(StyleChildrenEntry.CHILDREN, makeRef(styleId));
      } else {
        const entry = RawMessage.create();
        entry.setMessage(StyleChildrenEntry.PARENT, makeRef(parentId));
        entry.addMessage(StyleChildrenEntry.CHILDREN, makeRef(styleId));
        this.msg.addMessage(StylesheetFields.PARENT_TO_CHILDREN_STYLE_MAP, entry);
      }
    }
  }
}

/**
 * A live view of one concrete style archive.
 *
 * Reads return only what this style *overrides*; use {@link resolved} to
 * fold in the parent chain, which is what the app actually renders.
 */
export class StyleHandle {
  readonly store: ObjectStore;
  readonly object: IwaObject;

  constructor(store: ObjectStore, object: IwaObject) {
    this.store = store;
    this.object = object;
  }

  get id(): bigint {
    return this.object.identifier;
  }

  get info(): StyleInfo {
    return describeStyle(this.object);
  }

  parent(): StyleHandle | undefined {
    const parentId = this.info.parentId;
    const obj = parentId !== undefined ? this.store.resolve(parentId) : undefined;
    return obj ? new StyleHandle(this.store, obj) : undefined;
  }

  character(): CharacterFormatting {
    return readCharacterProperties(this.object.message.getMessage(StyleArchive.CHAR_PROPERTIES));
  }

  paragraph(): ParagraphFormatting {
    return readParagraphProperties(this.object.message.getMessage(StyleArchive.PARA_PROPERTIES));
  }

  /**
   * Formatting with inherited values folded in, nearest override winning.
   *
   * Cycles in the parent chain are broken defensively — a corrupt document
   * should not hang a reader.
   */
  resolved(): { character: CharacterFormatting; paragraph: ParagraphFormatting } {
    const chain: StyleHandle[] = [this];
    const seen = new Set<bigint>([this.id]);
    for (let node = this.parent(); node && !seen.has(node.id); node = node.parent()) {
      seen.add(node.id);
      chain.push(node);
    }
    const character: CharacterFormatting = {};
    const paragraph: ParagraphFormatting = {};
    // Furthest ancestor first, so nearer overrides land on top.
    for (const node of chain.reverse()) {
      Object.assign(character, node.character());
      Object.assign(paragraph, node.paragraph());
    }
    return { character, paragraph };
  }

  /** Merge character formatting into this style, preserving unmodelled properties. */
  setCharacter(formatting: CharacterFormatting): this {
    const m = this.object.message;
    const props = m.getMessage(StyleArchive.CHAR_PROPERTIES) ?? RawMessage.create();
    applyCharacterProperties(props, formatting);
    m.setMessage(StyleArchive.CHAR_PROPERTIES, props);
    this.refreshOverrideCount();
    return this;
  }

  /** Merge paragraph formatting into this style, preserving unmodelled properties. */
  setParagraph(formatting: ParagraphFormatting): this {
    const m = this.object.message;
    if (this.object.type === TSWP_TYPE.CHARACTER_STYLE) {
      throw new RangeError(`style ${this.id} is a character style; it has no paragraph properties`);
    }
    const props = m.getMessage(StyleArchive.PARA_PROPERTIES) ?? RawMessage.create();
    applyParagraphProperties(props, formatting);
    m.setMessage(StyleArchive.PARA_PROPERTIES, props);
    this.refreshOverrideCount();
    return this;
  }

  /** `override_count` is the number of properties this style sets. */
  private refreshOverrideCount(): void {
    const m = this.object.message;
    const chars = m.getMessage(StyleArchive.CHAR_PROPERTIES)?.fields.length ?? 0;
    const paras = m.getMessage(StyleArchive.PARA_PROPERTIES)?.fields.length ?? 0;
    m.setVarint(StyleArchive.OVERRIDE_COUNT, chars + paras);
  }
}

export function describeStyle(obj: IwaObject): StyleInfo {
  const sup = obj.message.getMessage(StyleArchive.SUPER);
  return {
    id: obj.identifier,
    type: obj.type,
    name: sup?.getString(StyleSuper.NAME),
    identifier: sup?.getString(StyleSuper.STYLE_IDENTIFIER),
    parentId: sup ? refId(sup, StyleSuper.PARENT) : undefined,
  };
}

function buildStyleSuper(
  name: string | undefined,
  identifier: string | undefined,
  parentId: bigint | undefined,
  stylesheetId: bigint,
): RawMessage {
  const sup = RawMessage.create();
  if (name !== undefined) sup.setString(StyleSuper.NAME, name);
  if (identifier !== undefined) sup.setString(StyleSuper.STYLE_IDENTIFIER, identifier);
  if (parentId !== undefined) sup.setMessage(StyleSuper.PARENT, makeRef(parentId));
  sup.setMessage(StyleSuper.STYLESHEET, makeRef(stylesheetId));
  return sup;
}

/**
 * Set a value field and clear its paired `*_null` flag.
 *
 * A style property that can be inherited has two encodings for "no value":
 * absent (inherit the parent's) and a `*_null` flag set to true (explicitly
 * none). Writing a value while a stale null flag is still set is
 * contradictory, so the two always move together.
 */
function setNullable(
  m: RawMessage,
  valueField: number,
  nullField: number,
  value: RawMessage | string | undefined,
): void {
  if (value === undefined) {
    m.remove(valueField);
    m.setBool(nullField, true);
    return;
  }
  m.remove(nullField);
  if (typeof value === "string") m.setString(valueField, value);
  else m.setMessage(valueField, value);
}

/**
 * Apply character formatting onto an existing property bag.
 *
 * Editing in place rather than rebuilding matters: a real style carries
 * properties this library does not model, and rebuilding would drop them.
 */
export function applyCharacterProperties(m: RawMessage, f: CharacterFormatting): void {
  if (f.bold !== undefined) m.setBool(CharProps.BOLD, f.bold);
  if (f.italic !== undefined) m.setBool(CharProps.ITALIC, f.italic);
  if (f.fontSize !== undefined) m.setFloat(CharProps.FONT_SIZE, f.fontSize);
  if ("fontName" in f) setNullable(m, CharProps.FONT_NAME, CharProps.FONT_NAME_NULL, f.fontName);
  if ("language" in f) setNullable(m, CharProps.LANGUAGE, CharProps.LANGUAGE_NULL, f.language);
  // Text colour goes in two places. `font_color` is the field the name
  // suggests and the one this library wrote for a long time; on its own it
  // does nothing visible in a recent Pages, which renders text from
  // `tsd_fill` and leaves the glyphs in the inherited colour. Bold applies,
  // red does not, and no offline check can see the difference — the style
  // is valid, the reader agrees with the writer, and the word stays black.
  // Every colour-carrying character style written by a current Pages holds
  // both, the fill being a plain `{ color }`.
  if ("fontColor" in f) {
    const color = f.fontColor;
    setNullable(
      m,
      CharProps.TSD_FILL,
      CharProps.TSD_FILL_NULL,
      color ? writeFill({ kind: "color", color }) : undefined,
    );
  }
  for (const [key, valueField, nullField] of [
    ["fontColor", CharProps.FONT_COLOR, CharProps.FONT_COLOR_NULL],
    ["backgroundColor", CharProps.BACKGROUND_COLOR, CharProps.BACKGROUND_COLOR_NULL],
    ["underlineColor", CharProps.UNDERLINE_COLOR, CharProps.UNDERLINE_COLOR_NULL],
    ["strikethruColor", CharProps.STRIKETHRU_COLOR, CharProps.STRIKETHRU_COLOR_NULL],
    ["outlineColor", CharProps.OUTLINE_COLOR, CharProps.OUTLINE_COLOR_NULL],
  ] as const) {
    if (!(key in f)) continue;
    const color = f[key];
    setNullable(m, valueField, nullField, color ? writeColor(color) : undefined);
  }
  if ("shadow" in f) {
    setNullable(
      m,
      CharProps.SHADOW,
      CharProps.SHADOW_NULL,
      f.shadow ? writeShadow(f.shadow) : undefined,
    );
  }
  for (const [key, field] of [
    ["underline", CharProps.UNDERLINE],
    ["strikethru", CharProps.STRIKETHRU],
    ["capitalization", CharProps.CAPITALIZATION],
    ["ligatures", CharProps.LIGATURES],
    ["superscript", CharProps.SUPERSCRIPT],
  ] as const) {
    const value = f[key];
    if (value !== undefined) m.setVarint(field, value);
  }
  for (const [key, field] of [
    ["tracking", CharProps.TRACKING],
    ["kerning", CharProps.KERNING],
    ["baselineShift", CharProps.BASELINE_SHIFT],
    ["outline", CharProps.OUTLINE],
    ["underlineWidth", CharProps.UNDERLINE_WIDTH],
    ["strikethruWidth", CharProps.STRIKETHRU_WIDTH],
  ] as const) {
    const value = f[key];
    if (value !== undefined) m.setFloat(field, value);
  }
  if (f.wordUnderline !== undefined) m.setBool(CharProps.WORD_UNDERLINE, f.wordUnderline);
  if (f.wordStrikethru !== undefined) m.setBool(CharProps.WORD_STRIKETHRU, f.wordStrikethru);
}

/**
 * A detached copy of a property bag, or an empty one.
 *
 * Round-tripping through bytes rather than sharing the message: a style
 * created from another must not mutate the one it copied when the caller
 * overlays their own formatting on top.
 */
function cloneBag(source: RawMessage | undefined): RawMessage {
  return source ? RawMessage.parse(source.toBytes()) : RawMessage.create();
}

export function buildCharacterProperties(f: CharacterFormatting): RawMessage {
  const m = RawMessage.create();
  applyCharacterProperties(m, f);
  return m;
}

/** Read a character property bag back into the same shape used to write it. */
export function readCharacterProperties(m: RawMessage | undefined): CharacterFormatting {
  const f: CharacterFormatting = {};
  if (!m) return f;
  const bold = m.getBool(CharProps.BOLD);
  if (bold !== undefined) f.bold = bold;
  const italic = m.getBool(CharProps.ITALIC);
  if (italic !== undefined) f.italic = italic;
  const fontSize = m.getFloat(CharProps.FONT_SIZE);
  if (fontSize !== undefined) f.fontSize = fontSize;
  const fontName = m.getString(CharProps.FONT_NAME);
  if (fontName !== undefined) f.fontName = fontName;
  const language = m.getString(CharProps.LANGUAGE);
  if (language !== undefined) f.language = language;
  for (const [key, field] of [
    ["fontColor", CharProps.FONT_COLOR],
    ["backgroundColor", CharProps.BACKGROUND_COLOR],
    ["underlineColor", CharProps.UNDERLINE_COLOR],
    ["strikethruColor", CharProps.STRIKETHRU_COLOR],
    ["outlineColor", CharProps.OUTLINE_COLOR],
  ] as const) {
    const color = readColor(m.getMessage(field));
    if (color) f[key] = color;
  }
  // A style may carry its text colour only as a fill — Apple writes both,
  // but an importer or an older writer need not. Reading the fill when
  // `font_color` is absent means the colour is reported either way; a solid
  // fill is the only kind that maps onto a single colour.
  if (f.fontColor === undefined) {
    const fill = readFill(m.getMessage(CharProps.TSD_FILL));
    if (fill?.kind === "color") f.fontColor = fill.color;
  }
  const shadow = readShadow(m.getMessage(CharProps.SHADOW));
  if (shadow) f.shadow = shadow;
  for (const [key, field] of [
    ["underline", CharProps.UNDERLINE],
    ["strikethru", CharProps.STRIKETHRU],
    ["capitalization", CharProps.CAPITALIZATION],
    ["ligatures", CharProps.LIGATURES],
    ["superscript", CharProps.SUPERSCRIPT],
  ] as const) {
    const value = m.getUint(field);
    if (value !== undefined) f[key] = value;
  }
  for (const [key, field] of [
    ["tracking", CharProps.TRACKING],
    ["kerning", CharProps.KERNING],
    ["baselineShift", CharProps.BASELINE_SHIFT],
    ["outline", CharProps.OUTLINE],
    ["underlineWidth", CharProps.UNDERLINE_WIDTH],
    ["strikethruWidth", CharProps.STRIKETHRU_WIDTH],
  ] as const) {
    const value = m.getFloat(field);
    if (value !== undefined) f[key] = value;
  }
  const wordUnderline = m.getBool(CharProps.WORD_UNDERLINE);
  if (wordUnderline !== undefined) f.wordUnderline = wordUnderline;
  const wordStrikethru = m.getBool(CharProps.WORD_STRIKETHRU);
  if (wordStrikethru !== undefined) f.wordStrikethru = wordStrikethru;
  return f;
}

/**
 * Apply paragraph formatting onto an existing property bag (see above).
 *
 * A left indent is written as the pair Apple writes. Of the 8647 corpus
 * paragraph styles that set `left_indent`, 8645 set `first_line_indent`
 * beside it, and a style carrying the left indent alone was observed not
 * to indent in Pages at all. So an unaccompanied left indent gains a
 * matching first line — a block indent, which is what indenting a
 * paragraph means — while a bag that already states its own first line
 * keeps it, hanging indents included.
 */
export function applyParagraphProperties(m: RawMessage, f: ParagraphFormatting): void {
  if (f.alignment !== undefined) m.setVarint(ParaProps.ALIGNMENT, f.alignment);
  for (const [key, field] of [
    ["spaceBefore", ParaProps.SPACE_BEFORE],
    ["spaceAfter", ParaProps.SPACE_AFTER],
    ["firstLineIndent", ParaProps.FIRST_LINE_INDENT],
    ["leftIndent", ParaProps.LEFT_INDENT],
    ["rightIndent", ParaProps.RIGHT_INDENT],
    ["defaultTabStops", ParaProps.DEFAULT_TAB_STOPS],
    ["ruleWidth", ParaProps.RULE_WIDTH],
  ] as const) {
    const value = f[key];
    if (value !== undefined) m.setFloat(field, value);
  }
  if (f.lineSpacing !== undefined) {
    const ls = RawMessage.create();
    ls.setVarint(LineSpacing.MODE, 0);
    ls.setFloat(LineSpacing.AMOUNT, f.lineSpacing);
    m.remove(ParaProps.LINE_SPACING_NULL);
    m.setMessage(ParaProps.LINE_SPACING, ls);
  }
  for (const [key, field] of [
    ["keepLinesTogether", ParaProps.KEEP_LINES_TOGETHER],
    ["keepWithNext", ParaProps.KEEP_WITH_NEXT],
    ["pageBreakBefore", ParaProps.PAGE_BREAK_BEFORE],
    ["widowControl", ParaProps.WIDOW_CONTROL],
    ["hyphenate", ParaProps.HYPHENATE],
    ["showInToc", ParaProps.SHOW_IN_TOC],
    ["roundedCorners", ParaProps.ROUNDED_CORNERS],
  ] as const) {
    const value = f[key];
    if (value !== undefined) m.setBool(field, value);
  }
  for (const [key, field] of [
    ["outlineLevel", ParaProps.OUTLINE_LEVEL],
    ["borderPositions", ParaProps.BORDER_POSITIONS],
    ["writingDirection", ParaProps.WRITING_DIRECTION],
  ] as const) {
    const value = f[key];
    if (value !== undefined) m.setVarint(field, value);
  }
  if (f.borderPositions !== undefined) {
    const historical = deprecatedBorders(f.borderPositions);
    if (historical === undefined) m.remove(ParaProps.DEPRECATED_BORDERS);
    else m.setVarint(ParaProps.DEPRECATED_BORDERS, historical);
  }
  if ("ruleOffset" in f) {
    m.remove(ParaProps.HISTORICAL_RULE_OFFSET);
    if (f.ruleOffset !== undefined) {
      const o = f.ruleOffset;
      const point = RawMessage.create();
      point.setFloat(1, typeof o === "number" ? o : o.x);
      point.setFloat(2, typeof o === "number" ? o : o.y);
      m.setMessage(ParaProps.HISTORICAL_RULE_OFFSET, point);
    }
  }
  if ("backgroundColor" in f) {
    setNullable(
      m,
      ParaProps.FILL,
      ParaProps.FILL_NULL,
      f.backgroundColor ? writeColor(f.backgroundColor) : undefined,
    );
  }
  if ("border" in f) {
    setNullable(m, ParaProps.STROKE, ParaProps.STROKE_NULL, f.border ? writeStroke(f.border) : undefined);
  }
  if ("decimalTab" in f) {
    setNullable(m, ParaProps.DECIMAL_TAB, ParaProps.DECIMAL_TAB_NULL, f.decimalTab);
  }
  if (f.tabs !== undefined) {
    const tabs = RawMessage.create();
    for (const tab of f.tabs) {
      const entry = RawMessage.create();
      entry.setFloat(TabArchive.POSITION, tab.position);
      if (tab.alignment !== undefined) entry.setVarint(TabArchive.ALIGNMENT, tab.alignment);
      if (tab.leader !== undefined) entry.setString(TabArchive.LEADER, tab.leader);
      tabs.addMessage(TabsArchive.TABS, entry);
    }
    // An empty TabsArchive is how "no tab stops" is expressed; the null flag
    // means "inherit nothing", which is a different thing.
    m.remove(ParaProps.TABS_NULL);
    m.setMessage(ParaProps.TABS, tabs);
  }
  // The left indent's other half — see the note above this function.
  const left = m.getFloat(ParaProps.LEFT_INDENT);
  if (left !== undefined && m.getFloat(ParaProps.FIRST_LINE_INDENT) === undefined) {
    m.setFloat(ParaProps.FIRST_LINE_INDENT, left);
  }
}

export function buildParagraphProperties(f: ParagraphFormatting): RawMessage {
  const m = RawMessage.create();
  applyParagraphProperties(m, f);
  return m;
}

/** Read a paragraph property bag back into the same shape used to write it. */
export function readParagraphProperties(m: RawMessage | undefined): ParagraphFormatting {
  const f: ParagraphFormatting = {};
  if (!m) return f;
  const alignment = m.getUint(ParaProps.ALIGNMENT);
  if (alignment !== undefined) f.alignment = alignment;
  for (const [key, field] of [
    ["spaceBefore", ParaProps.SPACE_BEFORE],
    ["spaceAfter", ParaProps.SPACE_AFTER],
    ["firstLineIndent", ParaProps.FIRST_LINE_INDENT],
    ["leftIndent", ParaProps.LEFT_INDENT],
    ["rightIndent", ParaProps.RIGHT_INDENT],
    ["defaultTabStops", ParaProps.DEFAULT_TAB_STOPS],
    ["ruleWidth", ParaProps.RULE_WIDTH],
  ] as const) {
    const value = m.getFloat(field);
    if (value !== undefined) f[key] = value;
  }
  const spacing = m.getMessage(ParaProps.LINE_SPACING);
  if (spacing && (spacing.getUint(LineSpacing.MODE) ?? 0) === 0) {
    const amount = spacing.getFloat(LineSpacing.AMOUNT);
    if (amount !== undefined) f.lineSpacing = amount;
  }
  for (const [key, field] of [
    ["keepLinesTogether", ParaProps.KEEP_LINES_TOGETHER],
    ["keepWithNext", ParaProps.KEEP_WITH_NEXT],
    ["pageBreakBefore", ParaProps.PAGE_BREAK_BEFORE],
    ["widowControl", ParaProps.WIDOW_CONTROL],
    ["hyphenate", ParaProps.HYPHENATE],
    ["showInToc", ParaProps.SHOW_IN_TOC],
    ["roundedCorners", ParaProps.ROUNDED_CORNERS],
  ] as const) {
    const value = m.getBool(field);
    if (value !== undefined) f[key] = value;
  }
  for (const [key, field] of [
    ["outlineLevel", ParaProps.OUTLINE_LEVEL],
    ["borderPositions", ParaProps.BORDER_POSITIONS],
    ["writingDirection", ParaProps.WRITING_DIRECTION],
  ] as const) {
    const value = m.getUint(field);
    if (value !== undefined) f[key] = value;
  }
  if (f.borderPositions === undefined) {
    const historical = m.getUint(ParaProps.DEPRECATED_BORDERS);
    if (historical !== undefined) f.borderPositions = bordersFromDeprecated(historical);
  }
  const ruleOffset = m.getMessage(ParaProps.HISTORICAL_RULE_OFFSET);
  if (ruleOffset) {
    const x = ruleOffset.getFloat(1) ?? 0;
    const y = ruleOffset.getFloat(2) ?? 0;
    f.ruleOffset = x === y ? x : { x, y };
  }
  const background = readColor(m.getMessage(ParaProps.FILL));
  if (background) f.backgroundColor = background;
  const border = readStroke(m.getMessage(ParaProps.STROKE));
  if (border) f.border = border;
  const decimalTab = m.getString(ParaProps.DECIMAL_TAB);
  if (decimalTab !== undefined) f.decimalTab = decimalTab;
  const tabs = m.getMessage(ParaProps.TABS);
  if (tabs) {
    f.tabs = tabs.getMessages(TabsArchive.TABS).map((tab) => {
      const stop: TabStop = { position: tab.getFloat(TabArchive.POSITION) ?? 0 };
      const alignment = tab.getUint(TabArchive.ALIGNMENT);
      if (alignment !== undefined) stop.alignment = alignment;
      const leader = tab.getString(TabArchive.LEADER);
      if (leader !== undefined) stop.leader = leader;
      return stop;
    });
  }
  return f;
}
