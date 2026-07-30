/**
 * Developer-facing fluent handles over text storages: {@link TextRange} for
 * span operations and {@link ParagraphHandle} for paragraph operations.
 * These are thin, always-live views — they read through to the storage on
 * every call, so mixing handle operations with direct storage edits is safe
 * as long as offsets are re-obtained after text-length changes (use the
 * return values, which carry updated ranges).
 */
import type { TextStorage } from "./textstorage.ts";
import type { CharacterFormatting } from "../tss/stylesheet.ts";
import { Storage, TSWP_TYPE, UnderlineType } from "./schema.ts";

export class TextRange {
  readonly storage: TextStorage;
  readonly start: number;
  readonly end: number;

  constructor(storage: TextStorage, start: number, end: number) {
    const len = storage.text.length;
    if (start < 0 || end < start || end > len) {
      throw new RangeError(`TextRange ${start}..${end} out of bounds (text length ${len})`);
    }
    this.storage = storage;
    this.start = start;
    this.end = end;
  }

  get text(): string {
    return this.storage.text.slice(this.start, this.end);
  }

  /** Replace this range's text; returns the range covering the replacement. */
  replaceWith(text: string): TextRange {
    this.storage.replaceRange(this.start, this.end, text);
    return new TextRange(this.storage, this.start, this.start + text.length);
  }

  delete(): void {
    this.storage.deleteRange(this.start, this.end);
  }

  /**
   * Apply direct character formatting (one anonymous character style over
   * the range, parented on the style in effect at `start`). Prefer a single
   * call with all properties over chaining sugar methods — each call
   * creates one style object.
   */
  format(formatting: CharacterFormatting): this {
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

  /** Apply a character style by name or id (undefined restores paragraph style). */
  applyCharacterStyle(style: string | bigint | undefined): this {
    const id =
      style === undefined
        ? undefined
        : this.storage.resolveStyle(style, TSWP_TYPE.CHARACTER_STYLE);
    this.storage.setCharacterStyleRange(this.start, this.end, id);
    return this;
  }

  /** Apply a paragraph style to every paragraph intersecting this range. */
  applyParagraphStyle(style: string | bigint): this {
    const id = this.storage.resolveStyle(style, TSWP_TYPE.PARAGRAPH_STYLE);
    for (const p of this.paragraphIndexes()) this.storage.setParagraphStyle(p, id);
    return this;
  }

  /** Apply a list style (e.g. "Bullet", "Numbered", "None") to intersecting paragraphs. */
  applyListStyle(style: string | bigint): this {
    const id = this.storage.resolveStyle(style, TSWP_TYPE.LIST_STYLE);
    for (const p of this.paragraphIndexes()) this.storage.setListStyle(p, id);
    return this;
  }

  /** Make this range a hyperlink. */
  link(url: string): this {
    this.storage.insertLink(this.start, this.end, url);
    return this;
  }

  /** Remove hyperlinks overlapping this range. */
  unlink(): this {
    this.storage.removeLinks(this.start, this.end);
    return this;
  }

  paragraphIndexes(): number[] {
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

  get styleName(): string | undefined {
    const id = this.styleId;
    return id !== undefined ? this.storage.styleNameOf(id) : undefined;
  }

  setStyle(style: string | bigint): this {
    this.storage.setParagraphStyle(
      this.index,
      this.storage.resolveStyle(style, TSWP_TYPE.PARAGRAPH_STYLE),
    );
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
