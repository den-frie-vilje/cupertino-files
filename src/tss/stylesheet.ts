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
import { makeColor, makeRef, refId } from "../tsp/schema.ts";
import {
  CharProps,
  LineSpacing,
  ParaProps,
  StyleArchive,
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
  /** sRGB components in 0..1. */
  fontColor?: { r: number; g: number; b: number; a?: number };
  /** 0 none, 1 single, 2 double, 3 wavy. */
  underline?: number;
  /** 0 none, 1 single, … */
  strikethru?: number;
  /** Additional tracking (fraction of font size). */
  tracking?: number;
  baselineShift?: number;
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
  /** Heading outline level (1-based; 0 = body). */
  outlineLevel?: number;
  showInToc?: boolean;
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
    character?: CharacterFormatting;
    paragraph?: ParagraphFormatting;
  }): bigint {
    const parentId = this.resolveBase(options.basedOn, TSWP_TYPE.PARAGRAPH_STYLE);
    const obj = this.store.createObject(TSWP_TYPE.PARAGRAPH_STYLE, this.component);
    const m = obj.message;
    m.setMessage(
      StyleArchive.SUPER,
      buildStyleSuper(options.name, options.identifier, parentId, this.id),
    );
    let overrides = 0;
    if (options.character) {
      const props = buildCharacterProperties(options.character);
      overrides += props.fields.length;
      m.setMessage(StyleArchive.CHAR_PROPERTIES, props);
    }
    if (options.paragraph) {
      const props = buildParagraphProperties(options.paragraph);
      overrides += props.fields.length;
      m.setMessage(StyleArchive.PARA_PROPERTIES, props);
    }
    m.setVarint(StyleArchive.OVERRIDE_COUNT, overrides);
    this.register(obj.identifier, options.identifier, parentId);
    return obj.identifier;
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

export function buildCharacterProperties(f: CharacterFormatting): RawMessage {
  const m = RawMessage.create();
  if (f.bold !== undefined) m.setBool(CharProps.BOLD, f.bold);
  if (f.italic !== undefined) m.setBool(CharProps.ITALIC, f.italic);
  if (f.fontSize !== undefined) m.setFloat(CharProps.FONT_SIZE, f.fontSize);
  if (f.fontName !== undefined) m.setString(CharProps.FONT_NAME, f.fontName);
  if (f.fontColor !== undefined) {
    m.setMessage(
      CharProps.FONT_COLOR,
      makeColor(f.fontColor.r, f.fontColor.g, f.fontColor.b, f.fontColor.a ?? 1),
    );
  }
  if (f.underline !== undefined) m.setVarint(CharProps.UNDERLINE, f.underline);
  if (f.strikethru !== undefined) m.setVarint(CharProps.STRIKETHRU, f.strikethru);
  if (f.tracking !== undefined) m.setFloat(CharProps.TRACKING, f.tracking);
  if (f.baselineShift !== undefined) m.setFloat(CharProps.BASELINE_SHIFT, f.baselineShift);
  return m;
}

export function buildParagraphProperties(f: ParagraphFormatting): RawMessage {
  const m = RawMessage.create();
  if (f.alignment !== undefined) m.setVarint(ParaProps.ALIGNMENT, f.alignment);
  if (f.spaceBefore !== undefined) m.setFloat(ParaProps.SPACE_BEFORE, f.spaceBefore);
  if (f.spaceAfter !== undefined) m.setFloat(ParaProps.SPACE_AFTER, f.spaceAfter);
  if (f.firstLineIndent !== undefined) m.setFloat(ParaProps.FIRST_LINE_INDENT, f.firstLineIndent);
  if (f.leftIndent !== undefined) m.setFloat(ParaProps.LEFT_INDENT, f.leftIndent);
  if (f.rightIndent !== undefined) m.setFloat(ParaProps.RIGHT_INDENT, f.rightIndent);
  if (f.lineSpacing !== undefined) {
    const ls = RawMessage.create();
    ls.setVarint(LineSpacing.MODE, 0);
    ls.setFloat(LineSpacing.AMOUNT, f.lineSpacing);
    m.setMessage(ParaProps.LINE_SPACING, ls);
  }
  if (f.keepLinesTogether !== undefined) m.setBool(ParaProps.KEEP_LINES_TOGETHER, f.keepLinesTogether);
  if (f.keepWithNext !== undefined) m.setBool(ParaProps.KEEP_WITH_NEXT, f.keepWithNext);
  if (f.pageBreakBefore !== undefined) m.setBool(ParaProps.PAGE_BREAK_BEFORE, f.pageBreakBefore);
  if (f.widowControl !== undefined) m.setBool(ParaProps.WIDOW_CONTROL, f.widowControl);
  if (f.outlineLevel !== undefined) m.setVarint(ParaProps.OUTLINE_LEVEL, f.outlineLevel);
  if (f.showInToc !== undefined) m.setBool(ParaProps.SHOW_IN_TOC, f.showInToc);
  return m;
}
