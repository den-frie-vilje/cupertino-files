/**
 * Developer-facing fluent handles over text storages: {@link TextRange} for
 * span operations and {@link ParagraphHandle} for paragraph operations.
 *
 * A {@link ParagraphHandle} addresses by paragraph *index* and resolves
 * offsets on every call, so it stays valid across text edits (its index
 * shifts only when earlier paragraphs are added or removed). A
 * {@link TextRange} captures offsets at creation and refuses to operate
 * once an edit before it has shifted the text underneath — use the ranges
 * its operations return, re-obtain via `find()`/`range()`, or hand all
 * spans to `applyEdits()`, which needs no ordering discipline at all.
 */
import type { TextStorage } from "./textstorage.ts";
import type { CharacterFormatting, ParagraphFormatting } from "../tss/stylesheet.ts";
import type { Color } from "../tsd/style.ts";
import { ScriptPosition, Storage, StrikethruType, TSWP_TYPE, UnderlineType } from "./schema.ts";

export class TextRange {
  readonly storage: TextStorage;
  readonly start: number;
  readonly end: number;
  /** The storage revision this range's offsets were captured against. */
  private readonly revision: number;

  constructor(storage: TextStorage, start: number, end: number) {
    const len = storage.text.length;
    if (start < 0 || end < start || end > len) {
      throw new RangeError(`TextRange ${start}..${end} out of bounds (text length ${len})`);
    }
    this.storage = storage;
    this.start = start;
    this.end = end;
    this.revision = storage.revision;
  }

  /**
   * Captured offsets stay meaningful only while nothing before them moves.
   * Edits at or after `end` are fine — including the descending-order
   * idiom over one snapshot — but an edit before this range shifts the
   * text under it, and using the range then would silently hit the wrong
   * span. Loud is better.
   */
  private assertFresh(): void {
    if (!this.storage.offsetsStableSince(this.revision, this.end)) {
      throw new RangeError(
        `stale TextRange ${this.start}..${this.end}: the storage was edited before this range ` +
          `after it was obtained — re-obtain offsets (find()/range()/paragraph()), or make ` +
          `multi-span changes through applyEdits(), which needs no ordering discipline`,
      );
    }
  }

  get text(): string {
    this.assertFresh();
    return this.storage.text.slice(this.start, this.end);
  }

  /** Replace this range's text; returns the range covering the replacement. */
  replaceWith(text: string): TextRange {
    this.assertFresh();
    this.storage.replaceRange(this.start, this.end, text);
    return new TextRange(this.storage, this.start, this.start + text.length);
  }

  delete(): void {
    this.assertFresh();
    this.storage.deleteRange(this.start, this.end);
  }

  /**
   * Apply direct character formatting (one anonymous character style over
   * the range, parented on the style in effect at `start`). Prefer a single
   * call with all properties over chaining sugar methods — each call
   * creates one style object.
   */
  format(formatting: CharacterFormatting): this {
    this.assertFresh();
    const sheet = this.storage.sheet();
    if (!sheet) throw new RangeError("storage has no stylesheet; cannot create styles");
    const current = this.storage.effectiveObjectAt(Storage.TABLE_CHAR_STYLE, this.start);
    const styleId = sheet.createCharacterStyle({ basedOn: current, character: formatting });
    this.storage.setCharacterStyleRange(this.start, this.end, styleId);
    return this;
  }

  bold(value = true): this {
    return this.format({ bold: value });
  }

  italic(value = true): this {
    return this.format({ italic: value });
  }

  underline(value = true): this {
    return this.format({ underline: value ? UnderlineType.SINGLE : UnderlineType.NONE });
  }

  fontSize(points: number): this {
    return this.format({ fontSize: points });
  }

  fontName(postScriptName: string): this {
    return this.format({ fontName: postScriptName });
  }

  color(r: number, g: number, b: number, a = 1): this {
    return this.format({ fontColor: { r, g, b, a } });
  }

  /** Highlight colour drawn behind the glyphs. */
  highlight(color: Color | undefined): this {
    return this.format({ backgroundColor: color });
  }

  strikethrough(value = true): this {
    return this.format({ strikethru: value ? StrikethruType.SINGLE : StrikethruType.NONE });
  }

  superscript(): this {
    return this.format({ superscript: ScriptPosition.SUPERSCRIPT });
  }

  subscript(): this {
    return this.format({ superscript: ScriptPosition.SUBSCRIPT });
  }

  /** Apply direct paragraph formatting to every paragraph in this range. */
  formatParagraphs(formatting: ParagraphFormatting): this {
    for (const p of this.paragraphs()) p.format(formatting);
    return this;
  }

  /** Apply a character style by name or id (undefined restores paragraph style). */
  applyCharacterStyle(style: string | bigint | undefined): this {
    this.assertFresh();
    const id =
      style === undefined
        ? undefined
        : this.storage.resolveStyle(style, TSWP_TYPE.CHARACTER_STYLE);
    this.storage.setCharacterStyleRange(this.start, this.end, id);
    return this;
  }

  /** Apply a paragraph style to every paragraph intersecting this range. */
  applyParagraphStyle(style: string | bigint): this {
    this.assertFresh();
    const id = this.storage.resolveStyle(style, TSWP_TYPE.PARAGRAPH_STYLE);
    for (const p of this.paragraphIndexes()) this.storage.setParagraphStyle(p, id);
    return this;
  }

  /** Apply a list style (e.g. "Bullet", "Numbered", "None") to intersecting paragraphs. */
  applyListStyle(style: string | bigint): this {
    this.assertFresh();
    const id = this.storage.resolveStyle(style, TSWP_TYPE.LIST_STYLE);
    for (const p of this.paragraphIndexes()) this.storage.setListStyle(p, id);
    return this;
  }

  /** Make this range a hyperlink. */
  link(url: string): this {
    this.assertFresh();
    this.storage.insertLink(this.start, this.end, url);
    return this;
  }

  /** Mark this range as template placeholder text (tap to replace). */
  asPlaceholder(): this {
    this.assertFresh();
    this.storage.defineAsPlaceholder(this.start, this.end);
    return this;
  }

  /** Remove hyperlinks overlapping this range. */
  unlink(): this {
    this.assertFresh();
    this.storage.removeLinks(this.start, this.end);
    return this;
  }

  paragraphIndexes(): number[] {
    this.assertFresh();
    const out: number[] = [];
    for (const p of this.storage.paragraphs()) {
      // A paragraph intersects if its span (including terminator position)
      // overlaps [start, end); a caret range at a boundary counts once.
      if (p.start < this.end && p.end >= this.start) out.push(p.index);
      else if (this.start === this.end && this.start >= p.start && this.start <= p.end) {
        out.push(p.index);
      }
    }
    return out;
  }

  paragraphs(): ParagraphHandle[] {
    return this.paragraphIndexes().map((i) => new ParagraphHandle(this.storage, i));
  }
}

export class ParagraphHandle {
  readonly storage: TextStorage;
  readonly index: number;

  constructor(storage: TextStorage, index: number) {
    this.storage = storage;
    this.index = index;
  }

  private info() {
    const p = this.storage.paragraphs()[this.index];
    if (!p) throw new RangeError(`paragraph ${this.index} no longer exists`);
    return p;
  }

  get text(): string {
    return this.info().text;
  }

  set text(value: string) {
    const p = this.info();
    this.storage.replaceRange(p.start, p.end, value);
  }

  /** Range covering the paragraph's text (excluding the terminator). */
  range(): TextRange {
    const p = this.info();
    return new TextRange(this.storage, p.start, p.end);
  }

  get styleId(): bigint | undefined {
    return this.info().styleId;
  }

  /**
   * The named style this paragraph reads as — resolved through the
   * parent chain, so direct formatting does not hide it. This is the
   * name a table of contents collects by.
   */
  get styleName(): string | undefined {
    const id = this.styleId;
    return id !== undefined ? this.storage.styleNameOf(id) : undefined;
  }

  /**
   * True when the paragraph carries direct formatting: its style object
   * is the anonymous child {@link format} creates, rather than the named
   * style itself. {@link styleName} still names the style it inherits.
   */
  get hasDirectFormatting(): boolean {
    const id = this.styleId;
    return id !== undefined && this.storage.ownStyleNameOf(id) === undefined;
  }

  setStyle(style: string | bigint): this {
    this.storage.setParagraphStyle(
      this.index,
      this.storage.resolveStyle(style, TSWP_TYPE.PARAGRAPH_STYLE),
    );
    return this;
  }

  /**
   * Apply direct paragraph formatting: create an anonymous paragraph style
   * parented on the one currently in effect, and assign it to this paragraph
   * alone. Prefer editing a named style when the change should apply
   * everywhere that style is used.
   */
  format(formatting: ParagraphFormatting, character?: CharacterFormatting): this {
    const sheet = this.storage.sheet();
    if (!sheet) throw new RangeError("storage has no stylesheet; cannot create styles");
    const options: {
      basedOn?: bigint;
      paragraph: ParagraphFormatting;
      character?: CharacterFormatting;
    } = { paragraph: formatting };
    const current = this.styleId;
    if (current !== undefined) options.basedOn = current;
    if (character) options.character = character;
    this.storage.setParagraphStyle(this.index, sheet.createParagraphStyle(options));
    return this;
  }

  /** Base writing direction — where "natural" resolves from the text. */
  get direction(): "ltr" | "rtl" | "natural" {
    return this.storage.paragraphDirection(this.index);
  }

  /** Flip the paragraph's base direction, as the app's ⇄ control does. */
  setDirection(direction: "ltr" | "rtl" | "natural"): this {
    this.storage.setParagraphDirection(this.index, direction);
    return this;
  }

  get listStyleId(): bigint | undefined {
    return this.storage.listStyleIdAt(this.index);
  }

  get listStyleName(): string | undefined {
    const id = this.listStyleId;
    return id !== undefined ? this.storage.styleNameOf(id) : undefined;
  }

  setListStyle(style: string | bigint): this {
    this.storage.setListStyle(
      this.index,
      this.storage.resolveStyle(style, TSWP_TYPE.LIST_STYLE),
    );
    return this;
  }

  /** Delete the paragraph including its terminator. */
  delete(): void {
    const p = this.info();
    const text = this.storage.text;
    const end = p.end < text.length ? p.end + 1 : p.end;
    // Deleting the last unterminated paragraph also removes the preceding \n.
    const start = p.end >= text.length && p.start > 0 ? p.start - 1 : p.start;
    this.storage.deleteRange(start, end);
  }

  /** Insert a new paragraph after this one; returns its handle. */
  insertAfter(text: string, style?: string | bigint): ParagraphHandle {
    if (text.includes("\n")) throw new RangeError("paragraph text must not contain \\n");
    const p = this.info();
    const full = this.storage.text;
    if (p.end >= full.length) {
      // Last paragraph: append via the terminator-convention-preserving path.
      const idx = this.storage.appendParagraph(text);
      const handle = new ParagraphHandle(this.storage, idx);
      if (style !== undefined) handle.setStyle(style);
      return handle;
    }
    this.storage.insertText(p.end + 1, `${text}\n`);
    const handle = new ParagraphHandle(this.storage, this.index + 1);
    if (style !== undefined) handle.setStyle(style);
    return handle;
  }
}
