/**
 * PagesDocument — the Apple Pages (.pages) document model, extending the
 * shared IWorkDocument with the TP object graph: document root, body
 * storage, sections, section templates (page masters), headers/footers and
 * page geometry.
 */
import { IWorkDocument } from "../model/document.ts";
import { TextStorage, type ParagraphInfo } from "../model/textstorage.ts";
import {
  StylesheetModel,
  type CharacterFormatting,
  type ParagraphFormatting,
  type StyleInfo,
} from "../model/stylesheet.ts";
import {
  ATTR_TABLE_ENTRIES,
  ENTRY_CHARACTER_INDEX,
  ENTRY_OBJECT,
  refId,
  SHARED_TYPE,
  Storage,
} from "../model/schema.ts";
import type { IwaObject } from "../iwa.ts";
import type { IWorkContainer } from "../package.ts";
import type { ObjectStore } from "../store.ts";
import { PAGES_REFERENCE_EXTRACTORS, Section, SectionTemplate, TP_TYPE, TPDocument } from "./schema.ts";

export interface PageSetup {
  pageWidth: number | undefined;
  pageHeight: number | undefined;
  leftMargin: number | undefined;
  rightMargin: number | undefined;
  topMargin: number | undefined;
  bottomMargin: number | undefined;
  headerMargin: number | undefined;
  footerMargin: number | undefined;
  /** 0 = portrait, 1 = landscape. */
  orientation: number | undefined;
}

/** One of the up-to-three page-master variants of a section. */
export interface SectionTemplateInfo {
  role: "first" | "even" | "odd";
  templateId: bigint;
  /** Header text boxes (left, center, right). */
  headers: TextStorage[];
  /** Footer text boxes (left, center, right). */
  footers: TextStorage[];
}

export class PagesSection {
  readonly document: PagesDocument;
  readonly object: IwaObject;
  /** Body-text range this section spans. */
  readonly start: number;
  readonly end: number;
  readonly index: number;

  constructor(document: PagesDocument, object: IwaObject, index: number, start: number, end: number) {
    this.document = document;
    this.object = object;
    this.index = index;
    this.start = start;
    this.end = end;
  }

  get id(): bigint {
    return this.object.identifier;
  }

  get name(): string | undefined {
    return this.object.message.getString(Section.NAME);
  }

  set name(value: string | undefined) {
    if (value === undefined) this.object.message.remove(Section.NAME);
    else this.object.message.setString(Section.NAME, value);
  }

  get pageNumberStart(): number | undefined {
    return this.object.message.getUint(Section.PAGE_NUMBER_START);
  }

  set pageNumberStart(value: number | undefined) {
    if (value === undefined) this.object.message.remove(Section.PAGE_NUMBER_START);
    else this.object.message.setVarint(Section.PAGE_NUMBER_START, value);
  }

  get firstPageDifferent(): boolean {
    return this.object.message.getBool(Section.FIRST_PAGE_DIFFERENT) ?? false;
  }

  get evenOddDifferent(): boolean {
    return this.object.message.getBool(Section.EVEN_ODD_DIFFERENT) ?? false;
  }

  /** The section's page-master variants with their header/footer storages. */
  templates(): SectionTemplateInfo[] {
    const out: SectionTemplateInfo[] = [];
    const roles = [
      ["first", Section.FIRST_PAGE_MASTER],
      ["even", Section.EVEN_PAGE_MASTER],
      ["odd", Section.ODD_PAGE_MASTER],
    ] as const;
    for (const [role, field] of roles) {
      const id = refId(this.object.message, field);
      const obj = id !== undefined ? this.document.store.object(id) : undefined;
      if (!obj) continue;
      const storagesOf = (f: number): TextStorage[] => {
        const list: TextStorage[] = [];
        for (const ref of obj.message.getMessages(f)) {
          const target = this.document.store.resolve(ref.getVarint(1));
          if (target?.type === SHARED_TYPE.TSWP_STORAGE) {
            list.push(new TextStorage(this.document.store, target));
          }
        }
        return list;
      };
      out.push({
        role,
        templateId: obj.identifier,
        headers: storagesOf(SectionTemplate.HEADERS),
        footers: storagesOf(SectionTemplate.FOOTERS),
      });
    }
    return out;
  }

  /**
   * Header/footer text of this section. `column` 0/1/2 = left/center/right.
   * Reads from the odd-page master (the default variant Pages shows).
   */
  headerText(column = 1): string {
    const t = this.templates();
    const master = t.find((x) => x.role === "odd") ?? t[0];
    return master?.headers[column]?.text ?? "";
  }

  footerText(column = 1): string {
    const t = this.templates();
    const master = t.find((x) => x.role === "odd") ?? t[0];
    return master?.footers[column]?.text ?? "";
  }

  /** Write header text into every page-master variant (column 0/1/2). */
  setHeaderText(text: string, column = 1): void {
    for (const t of this.templates()) {
      const storage = t.headers[column];
      if (storage) storage.setText(text);
    }
  }

  setFooterText(text: string, column = 1): void {
    for (const t of this.templates()) {
      const storage = t.footers[column];
      if (storage) storage.setText(text);
    }
  }
}

export class PagesDocument extends IWorkDocument {
  private docObject: IwaObject;

  private constructor(container: IWorkContainer, store: ObjectStore, docObject: IwaObject) {
    super(container, store);
    this.docObject = docObject;
  }

  static load(bytes: Uint8Array): PagesDocument {
    const { container, store } = IWorkDocument.loadStore(bytes, "pages", PAGES_REFERENCE_EXTRACTORS);
    const docObject = store.findByType(TP_TYPE.DOCUMENT);
    if (!docObject) {
      throw new RangeError("TP.DocumentArchive not found — not a Pages document?");
    }
    return new PagesDocument(container, store, docObject);
  }

  // ------------------------------------------------------------------- body

  /** The document body text storage. */
  get body(): TextStorage {
    const id = refId(this.docObject.message, TPDocument.BODY_STORAGE);
    const obj = id !== undefined ? this.store.object(id) : undefined;
    if (!obj) throw new RangeError("body storage not found");
    return new TextStorage(this.store, obj);
  }

  /** Plain body text (paragraphs separated by \n, attachments as U+FFFC). */
  get bodyText(): string {
    return this.body.text;
  }

  paragraphs(): (ParagraphInfo & { styleName: string | undefined })[] {
    const sheet = this.stylesheet;
    return this.body.paragraphs().map((p) => ({
      ...p,
      styleName: p.styleId !== undefined ? nameOfStyle(this.store, p.styleId) : undefined,
    }));
  }

  /** Literal find/replace across the body. Returns replacement count. */
  replaceText(find: string, replace: string): number {
    return this.body.replaceAll(find, replace);
  }

  insertText(pos: number, text: string): void {
    this.body.insertText(pos, text);
  }

  deleteRange(start: number, end: number): void {
    this.body.deleteRange(start, end);
  }

  /**
   * Append a paragraph to the body. `style` may be a style name ("Heading 1")
   * or a style object id. Returns the new paragraph index.
   */
  appendParagraph(text: string, style?: string | bigint): number {
    const index = this.body.appendParagraph(text);
    if (style !== undefined) this.setParagraphStyle(index, style);
    return index;
  }

  /** Set a paragraph's style by name or id. */
  setParagraphStyle(paragraphIndex: number, style: string | bigint): void {
    const id = this.resolveParagraphStyle(style);
    this.body.setParagraphStyle(paragraphIndex, id);
  }

  /**
   * Apply direct character formatting to a body range: creates an anonymous
   * TSWP.CharacterStyleArchive (parented on the effective style at `start`)
   * and spans it over [start, end). Returns the new style's id.
   */
  applyCharacterFormatting(start: number, end: number, formatting: CharacterFormatting): bigint {
    const current = this.body.effectiveObjectAt(Storage.TABLE_CHAR_STYLE, start);
    const styleId = this.stylesheet.createCharacterStyle({
      basedOn: current,
      character: formatting,
    });
    this.body.setCharacterStyleRange(start, end, styleId);
    return styleId;
  }

  // ------------------------------------------------------------------ styles

  /** The document stylesheet (named styles live here). */
  get stylesheet(): StylesheetModel {
    const id = refId(this.docObject.message, TPDocument.STYLESHEET);
    const obj = id !== undefined ? this.store.object(id) : undefined;
    if (!obj) throw new RangeError("document stylesheet not found");
    return new StylesheetModel(this.store, obj);
  }

  /** Named paragraph styles available to this document. */
  paragraphStyles(): StyleInfo[] {
    const seen = new Set<bigint>();
    const out: StyleInfo[] = [];
    for (
      let sheet: StylesheetModel | undefined = this.stylesheet;
      sheet;
      sheet = sheet.parentSheet()
    ) {
      for (const s of sheet.paragraphStyles()) {
        if (!seen.has(s.id)) {
          seen.add(s.id);
          out.push(s);
        }
      }
    }
    return out;
  }

  createParagraphStyle(options: {
    name: string;
    basedOn?: string | bigint;
    character?: CharacterFormatting;
    paragraph?: ParagraphFormatting;
  }): bigint {
    return this.stylesheet.createParagraphStyle(options);
  }

  private resolveParagraphStyle(style: string | bigint): bigint {
    if (typeof style === "bigint") return style;
    const found = this.stylesheet.findByName(style, SHARED_TYPE.TSWP_PARAGRAPH_STYLE);
    if (!found) throw new RangeError(`paragraph style not found: ${JSON.stringify(style)}`);
    return found.id;
  }

  // --------------------------------------------------------------- sections

  /**
   * Sections of the document, from the body storage's section table. Every
   * document has at least one.
   */
  sections(): PagesSection[] {
    const body = this.body;
    const text = body.text;
    const table = body.object.message.getMessage(Storage.TABLE_SECTION);
    const out: PagesSection[] = [];
    if (table) {
      const entries = table.getMessages(ATTR_TABLE_ENTRIES);
      for (let i = 0; i < entries.length; i++) {
        const start = entries[i]!.getUint(ENTRY_CHARACTER_INDEX) ?? 0;
        const end =
          i + 1 < entries.length
            ? (entries[i + 1]!.getUint(ENTRY_CHARACTER_INDEX) ?? text.length)
            : text.length;
        const id = refId(entries[i]!, ENTRY_OBJECT);
        const obj = id !== undefined ? this.store.object(id) : undefined;
        if (obj) out.push(new PagesSection(this, obj, out.length, start, end));
      }
    }
    if (out.length === 0) {
      // Legacy wiring: a single section referenced from the document root.
      const id = refId(this.docObject.message, TPDocument.SECTION);
      const obj = id !== undefined ? this.store.object(id) : undefined;
      if (obj) out.push(new PagesSection(this, obj, 0, 0, text.length));
    }
    return out;
  }

  // ------------------------------------------------------------- page setup

  pageSetup(): PageSetup {
    const m = this.docObject.message;
    return {
      pageWidth: m.getFloat(TPDocument.PAGE_WIDTH),
      pageHeight: m.getFloat(TPDocument.PAGE_HEIGHT),
      leftMargin: m.getFloat(TPDocument.LEFT_MARGIN),
      rightMargin: m.getFloat(TPDocument.RIGHT_MARGIN),
      topMargin: m.getFloat(TPDocument.TOP_MARGIN),
      bottomMargin: m.getFloat(TPDocument.BOTTOM_MARGIN),
      headerMargin: m.getFloat(TPDocument.HEADER_MARGIN),
      footerMargin: m.getFloat(TPDocument.FOOTER_MARGIN),
      orientation: m.getUint(TPDocument.ORIENTATION),
    };
  }

  /** Update page geometry (points; 1 pt = 1/72 in). Only given fields change. */
  setPageSetup(update: Partial<PageSetup>): void {
    const m = this.docObject.message;
    const setF = (no: number, v: number | undefined) => {
      if (v !== undefined) m.setFloat(no, v);
    };
    setF(TPDocument.PAGE_WIDTH, update.pageWidth);
    setF(TPDocument.PAGE_HEIGHT, update.pageHeight);
    setF(TPDocument.LEFT_MARGIN, update.leftMargin);
    setF(TPDocument.RIGHT_MARGIN, update.rightMargin);
    setF(TPDocument.TOP_MARGIN, update.topMargin);
    setF(TPDocument.BOTTOM_MARGIN, update.bottomMargin);
    setF(TPDocument.HEADER_MARGIN, update.headerMargin);
    setF(TPDocument.FOOTER_MARGIN, update.footerMargin);
    if (update.orientation !== undefined) {
      m.setVarint(TPDocument.ORIENTATION, update.orientation);
    }
  }
}

function nameOfStyle(store: ObjectStore, id: bigint): string | undefined {
  const obj = store.object(id);
  return obj?.message.getMessage(1)?.getString(1);
}
