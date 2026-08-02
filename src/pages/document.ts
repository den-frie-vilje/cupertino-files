/**
 * PagesDocument — the Apple Pages (.pages) document model, extending the
 * shared IWorkDocument with the TP object graph: document root, body
 * storage, sections, section templates (page masters), headers/footers and
 * page geometry.
 */
import { IWorkDocument } from "../tsa/document.ts";
import { TextStorage, type ParagraphInfo } from "../tswp/textstorage.ts";
import { ParagraphHandle, TextRange } from "../tswp/range.ts";
import {
  StylesheetModel,
  type CharacterFormatting,
  type ParagraphFormatting,
  type StyleInfo,
} from "../tss/stylesheet.ts";
import {
  ATTACHMENT_CHAR,
  ATTR_TABLE_ENTRIES,
  DrawableAttachment,
  ENTRY_CHARACTER_INDEX,
  ENTRY_OBJECT,
  ShapeInfo,
  Storage,
  TSWP_TYPE,
} from "../tswp/schema.ts";
import { makeDataRef, makeRef, Point, refId, SizeFields } from "../tsp/schema.ts";
import { Drawable, Geometry, Image, TSD_TYPE } from "../tsd/schema.ts";
import { DrawableModel } from "../tsd/drawables.ts";
import { DrawableContainer } from "../tsd/placement.ts";
import { tablesOf, type TableModel } from "../tst/tables.ts";
import { RawMessage } from "../base/protobuf.ts";
import { imageDimensions } from "../base/imagesize.ts";
import type { IwaObject } from "../tsp/iwa.ts";
import type { IWorkContainer } from "../tsp/package.ts";
import type { ObjectStore } from "../tsp/store.ts";
import {
  PAGES_REFERENCE_EXTRACTORS,
  Section,
  SectionTemplate,
  SettingsFields,
  TP_TYPE,
  ThemeArchive,
  TPDocument,
  FloatingDrawables,
  PageGroup,
  DrawableEntry,
  DrawablesZOrder,
} from "./schema.ts";

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
          if (target?.type === TSWP_TYPE.STORAGE) {
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

  /**
   * Drawables placed on this section's master pages (watermarks, logos,
   * repeating page furniture), keyed by page-master role.
   */
  masterDrawables(): { role: "first" | "even" | "odd"; drawables: DrawableModel[] }[] {
    return this.templates().map((t) => {
      const template = this.document.store.object(t.templateId);
      const drawables: DrawableModel[] = [];
      for (const ref of template?.message.getMessages(SectionTemplate.MASTER_DRAWABLES) ?? []) {
        const obj = this.document.store.resolve(ref.getVarint(1));
        if (obj) drawables.push(new DrawableModel(this.document.store, obj));
      }
      return { role: t.role, drawables };
    });
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

  /**
   * A new, empty document built from one you supply.
   *
   * **There is no from-nothing constructor, and there will not be one.** A
   * Pages document is dozens of interlinked archives — theme, stylesheet,
   * section templates, master drawables — and inventing that graph would
   * produce a file nothing offline could validate. Emptying a real one is
   * safe: every identity, style and master stays exactly as an Apple app
   * wrote it, and only the content goes.
   *
   * The body text is cleared and the first paragraph's style is kept, so
   * the result is a blank page in the template's design. Headers, footers
   * and masters are left alone — they are the template.
   */
  static blankFrom(template: Uint8Array): PagesDocument {
    const doc = PagesDocument.load(template);
    const body = doc.bodyOrUndefined;
    if (!body) {
      throw new RangeError(
        "template has no document body (a page-layout document); nothing to blank",
      );
    }
    body.setText("");
    doc.compact();
    return doc;
  }

  // ------------------------------------------------------------------- body

  /**
   * The document body text storage, or undefined for page-layout documents
   * (Pages' "Document Body" switch off) where text lives only in text boxes.
   */
  get bodyOrUndefined(): TextStorage | undefined {
    const id = refId(this.docObject.message, TPDocument.BODY_STORAGE);
    const obj = id !== undefined ? this.store.object(id) : undefined;
    return obj ? new TextStorage(this.store, obj) : undefined;
  }

  /**
   * The document body text storage. Throws for page-layout documents — check
   * {@link isPageLayout} or use {@link bodyOrUndefined} when the document
   * kind is unknown.
   */
  get body(): TextStorage {
    const body = this.bodyOrUndefined;
    if (!body) {
      throw new RangeError(
        "this is a page-layout document (no body text flow); use textBoxes() or bodyOrUndefined",
      );
    }
    return body;
  }

  /**
   * True for page-layout documents: TP.SettingsArchive.body is false, or the
   * document has no body storage at all. Word-processing documents (the
   * default) have a body text flow; page-layout ones only have text boxes.
   */
  get isPageLayout(): boolean {
    if (this.bodyOrUndefined === undefined) return true;
    const settingsId = refId(this.docObject.message, TPDocument.SETTINGS);
    const settings = settingsId !== undefined ? this.store.object(settingsId) : undefined;
    return settings?.message.getBool(SettingsFields.BODY) === false;
  }

  /** Plain body text ("" for page-layout documents). */
  get bodyText(): string {
    return this.bodyOrUndefined?.text ?? "";
  }

  /** Body paragraphs with resolved style names ([] for page-layout documents). */
  paragraphs(): (ParagraphInfo & { styleName: string | undefined })[] {
    const body = this.bodyOrUndefined;
    if (!body) return [];
    return body.paragraphs().map((p) => ({
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

  /**
   * Create a paragraph style and list it in the document's style panel.
   *
   * Being in the stylesheet is not what puts a style in the panel. The
   * panel reads the **theme's** own list: `TP.ThemeArchive.super.110.7`,
   * present in all 19 Pages fixtures here and holding exactly the names the
   * app shows — Title, Subtitle, Heading, Body, Caption and the rest,
   * localised where the document is. Its length tracks what the user sees:
   * twelve in a stock document, 35 and 61 in the two that were imported
   * from Word with their own styles.
   *
   * Everything else was necessary and not sufficient. A style needs a name,
   * an identifier, an `identifier_to_style_map` entry and both property
   * bags before it will apply correctly and report its own name — Pages
   * will even prefill that name when you go to add the style by hand — and
   * with all four it still does not appear in the list until it is in here.
   */
  createParagraphStyle(options: {
    name: string;
    basedOn?: string | bigint;
    character?: CharacterFormatting;
    paragraph?: ParagraphFormatting;
  }): bigint {
    const id = this.stylesheet.createParagraphStyle(options);
    if (options.name !== undefined) this.listInThemeStyles(id);
    return id;
  }

  /**
   * Put a floating drawable into the document's paint order.
   *
   * A page group says which page a drawable belongs to; it does not say
   * that the document draws it. That is `TP.DrawablesZOrderArchive`, one
   * per document, and a drawable in a page group but missing from it does
   * not appear at all — no warning, no blank box, nothing. Copying onto the
   * page the drawable already lived on failed exactly as completely as
   * copying onto a fresh page, which is what showed the fault was here
   * rather than in the page group.
   */
  private addToZOrder(id: bigint): void {
    const zorder = this.store.resolve(refId(this.docObject.message, TPDocument.DRAWABLES_ZORDER));
    if (!zorder) return;
    const present = zorder.message
      .getMessages(DrawablesZOrder.DRAWABLES)
      .some((entry) => refId(entry, DrawablesZOrder.DRAWABLES) === id);
    if (present) return;
    // Appended, so a copy paints above what was already there — the same
    // place the app puts a newly pasted object.
    zorder.message.addMessage(DrawablesZOrder.DRAWABLES, makeRef(id));
    zorder.message.markDirty();
    this.store.declareReference(zorder, id);
  }

  /** Append a paragraph style to the theme's panel list. */
  private listInThemeStyles(styleId: bigint): void {
    const theme = this.store.resolve(refId(this.docObject.message, TPDocument.THEME));
    if (!theme) return;
    const sup = theme.message.getMessage(ThemeArchive.SUPER);
    const list = sup?.getMessage(ThemeArchive.PARAGRAPH_STYLE_LIST);
    if (!sup || !list) return; // a theme without the list is not one we can extend
    list.addMessage(ThemeArchive.LIST_ENTRIES, makeRef(styleId));
    sup.setMessage(ThemeArchive.PARAGRAPH_STYLE_LIST, list);
    theme.message.setMessage(ThemeArchive.SUPER, sup);
    theme.message.markDirty();
    // The style lives in the stylesheet component and the theme does not,
    // so the reference has to be declared or the app has a pointer into a
    // component it was never told to open.
    this.store.declareReference(theme, styleId);
  }

  private resolveParagraphStyle(style: string | bigint): bigint {
    if (typeof style === "bigint") return style;
    const found = this.stylesheet.findByName(style, TSWP_TYPE.PARAGRAPH_STYLE);
    if (!found) throw new RangeError(`paragraph style not found: ${JSON.stringify(style)}`);
    return found.id;
  }

  // --------------------------------------------------------------- sections

  /**
   * Sections of the document, from the body storage's section table. Every
   * document has at least one.
   */
  sections(): PagesSection[] {
    const body = this.bodyOrUndefined;
    const text = body?.text ?? "";
    const table = body?.object.message.getMessage(Storage.TABLE_SECTION);
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

  // ------------------------------------------------------- fluent delegates

  /** Fluent range over body text. */
  range(start: number, end: number): TextRange {
    return this.body.range(start, end);
  }

  /** Find body-text matches as fluent ranges. */
  find(pattern: string | RegExp): TextRange[] {
    return this.body.find(pattern);
  }

  /** Fluent handle for one body paragraph. */
  paragraph(index: number): ParagraphHandle {
    return this.body.paragraph(index);
  }

  /** Body hyperlinks ([] for page-layout documents). */
  links(): { start: number; end: number; url: string; fieldId: bigint }[] {
    return this.bodyOrUndefined?.links() ?? [];
  }

  /** Every hyperlink in the document, including those inside text boxes. */
  allLinks(): { storage: TextStorage; start: number; end: number; url: string }[] {
    const out: { storage: TextStorage; start: number; end: number; url: string }[] = [];
    for (const storage of this.textStorages()) {
      for (const l of storage.links()) {
        out.push({ storage, start: l.start, end: l.end, url: l.url });
      }
    }
    // Drawables can carry their own hyperlink (TSD.DrawableArchive.hyperlink_url).
    return out;
  }

  /** Body smart fields — page numbers, dates, merge fields, links, … */
  smartFields(): ReturnType<TextStorage["smartFields"]> {
    return this.bodyOrUndefined?.smartFields() ?? [];
  }

  /** Body inline attachments (page-number fields, images, footnote marks). */
  attachments(): ReturnType<TextStorage["attachments"]> {
    return this.bodyOrUndefined?.attachments() ?? [];
  }

  /** Bookmarks (named destinations) declared in the body. */
  bookmarks(): ReturnType<TextStorage["bookmarks"]> {
    return this.bodyOrUndefined?.bookmarks() ?? [];
  }

  /** Make a body range a hyperlink. */
  insertLink(start: number, end: number, url: string): bigint {
    return this.body.insertLink(start, end, url);
  }

  /** Footnotes/endnotes anchored in the body (edit via `.storage`). */
  footnotes(): { anchorIndex: number; mark: string | undefined; storage: TextStorage }[] {
    return this.bodyOrUndefined?.footnotes() ?? [];
  }

  /** Comments anchored anywhere in the document. */
  comments(): { start: number; end: number; text: string }[] {
    const out: { start: number; end: number; text: string }[] = [];
    for (const storage of this.textStorages()) out.push(...storage.comments());
    return out;
  }

  /** Apply a list style ("Bullet", "Numbered", "None", …) to a paragraph. */
  setListStyle(paragraphIndex: number, style: string | bigint): void {
    this.body.setListStyle(
      paragraphIndex,
      this.body.resolveStyle(style, TSWP_TYPE.LIST_STYLE),
    );
  }

  /** Named list styles available to this document. */
  listStyles(): StyleInfo[] {
    const seen = new Set<bigint>();
    const out: StyleInfo[] = [];
    for (
      let sheet: StylesheetModel | undefined = this.stylesheet;
      sheet;
      sheet = sheet.parentSheet()
    ) {
      for (const s of sheet.styles()) {
        if (s.type === TSWP_TYPE.LIST_STYLE && s.name !== undefined && !seen.has(s.id)) {
          seen.add(s.id);
          out.push(s);
        }
      }
    }
    return out;
  }

  // ---------------------------------------------------------- more features

  /** Document-wide settings (hyphenation, ligatures, footnote config …). */
  get settings(): PagesSettings {
    const id = refId(this.docObject.message, TPDocument.SETTINGS);
    const obj = id !== undefined ? this.store.object(id) : undefined;
    if (!obj) throw new RangeError("TP.SettingsArchive not found");
    return new PagesSettings(obj);
  }

  /** Text boxes and shapes carrying text: drawable + its text storage. */
  textBoxes(): { drawable: DrawableModel; storage: TextStorage; isTextBox: boolean }[] {
    const out: { drawable: DrawableModel; storage: TextStorage; isTextBox: boolean }[] = [];
    for (const { obj } of this.store.allObjects()) {
      if (obj.type !== TSWP_TYPE.SHAPE_INFO) continue;
      const storageId = refId(obj.message, ShapeInfo.OWNED_STORAGE);
      const storageObj = storageId !== undefined ? this.store.object(storageId) : undefined;
      if (!storageObj) continue;
      out.push({
        drawable: new DrawableModel(this.store, obj),
        storage: new TextStorage(this.store, storageObj),
        isTextBox: obj.message.getBool(ShapeInfo.IS_TEXT_BOX) ?? false,
      });
    }
    return out;
  }

  /**
   * Start a new section at the given body paragraph. The new section clones
   * the enclosing section's configuration and shares its page masters
   * (headers/footers), with `inherit_previous_header_footer` set — matching
   * Pages' "Create a new section" default. Returns the new section.
   */
  insertSectionBreak(
    paragraphIndex: number,
    options: { name?: string; pageNumberStart?: number } = {},
  ): PagesSection {
    const body = this.body;
    const starts = body.paragraphStarts();
    const at = starts[paragraphIndex];
    if (at === undefined) throw new RangeError(`paragraph ${paragraphIndex} out of range`);
    if (at === 0) throw new RangeError("cannot insert a section break before the first paragraph");
    const sections = this.sections();
    const enclosing =
      sections.filter((s) => s.start <= at).at(-1) ?? sections[sections.length - 1];
    if (!enclosing) throw new RangeError("document has no sections");
    const component = this.store.componentOf(body.id);
    if (!component) throw new RangeError("body component not found");

    const section = this.store.createObject(TP_TYPE.SECTION, component, {
      cloneFrom: enclosing.object,
    });
    const m = section.message;
    m.setBool(Section.INHERIT_PREVIOUS_HEADER_FOOTER, true);
    if (options.name !== undefined) m.setString(Section.NAME, options.name);
    else m.remove(Section.NAME);
    if (options.pageNumberStart !== undefined) {
      m.setVarint(Section.PAGE_NUMBER_START, options.pageNumberStart);
    }

    // Insert the table_section entry at the paragraph start (run-based:
    // the previous section's entry ends where ours begins).
    const table = body.object.message.getMessage(Storage.TABLE_SECTION);
    if (!table) throw new RangeError("body has no section table");
    const entry = RawMessage.create();
    entry.setVarint(ENTRY_CHARACTER_INDEX, at);
    entry.setMessage(ENTRY_OBJECT, makeRef(section.identifier));
    const kept = table
      .getMessages(ATTR_TABLE_ENTRIES)
      .filter((e) => (e.getUint(ENTRY_CHARACTER_INDEX) ?? 0) !== at);
    kept.push(entry);
    kept.sort(
      (a, b) => (a.getUint(ENTRY_CHARACTER_INDEX) ?? 0) - (b.getUint(ENTRY_CHARACTER_INDEX) ?? 0),
    );
    table.setMessages(ATTR_TABLE_ENTRIES, kept);
    const found = this.sections().find((s) => s.id === section.identifier);
    if (!found) throw new RangeError("section insertion failed");
    return found;
  }

  /**
   * Floating drawables of one page, for adding, removing and reordering.
   *
   * Pages groups floating objects **per page**, not per section or per
   * document: `TP.FloatingDrawablesArchive.page_groups` holds one entry per
   * page that has any, each with background, foreground and main lists.
   * `pageIndex` selects the group; omit it for the first one the document
   * has. Pages with no floating objects have no group, so a document can
   * be missing the page you ask for even though the page exists — which is
   * why `create` exists: without it there is no way to put the first
   * drawable on a page, and "copy this onto page 3" is the ordinary case.
   *
   * A created group carries exactly what Apple's do. Every page group in
   * every fixture here holds two fields and no others — the page index and
   * the drawable list — and `libetonyek-pages5-extra-dir` has three of them
   * for pages 0, 1 and 2, in page order, which is what the insert below
   * preserves.
   */
  floatingDrawables(
    pageIndex?: number,
    options: { create?: boolean } = {},
  ): DrawableContainer | undefined {
    const holder = this.store.resolve(refId(this.docObject.message, TPDocument.FLOATING_DRAWABLES));
    if (!holder) return undefined;
    const groups = holder.message.getMessages(FloatingDrawables.PAGE_GROUPS);
    let group =
      pageIndex === undefined
        ? groups[0]
        : groups.find((g) => (g.getUint(PageGroup.PAGE_INDEX) ?? 0) === pageIndex);
    if (!group && options.create && pageIndex !== undefined) {
      const fresh = RawMessage.create();
      fresh.setVarint(PageGroup.PAGE_INDEX, pageIndex);
      const ordered = [...groups, fresh].sort(
        (a, b) => (a.getUint(PageGroup.PAGE_INDEX) ?? 0) - (b.getUint(PageGroup.PAGE_INDEX) ?? 0),
      );
      holder.message.setMessages(FloatingDrawables.PAGE_GROUPS, ordered);
      holder.message.markDirty();
      // Re-read: setMessages re-parses, so the instance to write through is
      // the one now owned by the holder, not the one just built.
      group = holder.message
        .getMessages(FloatingDrawables.PAGE_GROUPS)
        .find((g) => (g.getUint(PageGroup.PAGE_INDEX) ?? 0) === pageIndex);
    }
    if (!group) return undefined;
    // The group is an inline submessage, so the container writes through
    // the holder object it belongs to.
    return new DrawableContainer(
      this.store,
      holder,
      PageGroup.DRAWABLES,
      undefined,
      group,
      DrawableEntry.DRAWABLE,
      (id) => this.addToZOrder(id),
    );
  }

  /** Page indexes that currently hold floating drawables. */
  floatingDrawablePages(): number[] {
    const holder = this.store.resolve(refId(this.docObject.message, TPDocument.FLOATING_DRAWABLES));
    return (holder?.message.getMessages(FloatingDrawables.PAGE_GROUPS) ?? []).map(
      (g) => g.getUint(PageGroup.PAGE_INDEX) ?? 0,
    );
  }

  /**
   * Insert an image inline at a body-text position (EXPERIMENTAL — see
   * docs/FORMAT.md §14). Registers the bytes as a Data/ file (SHA-1
   * deduped), creates the TSD.ImageArchive + attachment objects, anchors
   * them at a U+FFFC character, and sizes the image from its intrinsic
   * dimensions (PNG/JPEG/GIF) scaled to fit `maxWidth` (default 400 pt)
   * unless explicit width/height are given.
   */
  insertInlineImage(
    pos: number,
    data: Uint8Array,
    options: { fileName: string; width?: number; height?: number; maxWidth?: number },
  ): { imageId: bigint; dataId: bigint } {
    const body = this.body;
    const component = this.store.componentOf(body.id);
    if (!component) throw new RangeError("body component not found");
    const { dataId } = this.store.addDataFile(data, options.fileName);

    // Size: explicit > intrinsic (fitted) > fallback.
    const dims = imageDimensions(data);
    const maxWidth = options.maxWidth ?? 400;
    let width = options.width;
    let height = options.height;
    if (width === undefined || height === undefined) {
      const iw = dims?.width ?? 300;
      const ih = dims?.height ?? 200;
      const scale = Math.min(1, maxWidth / iw);
      width = width ?? iw * scale;
      height = height ?? ih * (width / iw);
    }

    const image = this.store.createObject(TSD_TYPE.IMAGE, component);
    const drawable = RawMessage.create();
    const geometry = RawMessage.create();
    const position = RawMessage.create();
    position.setFloat(Point.X, 0);
    position.setFloat(Point.Y, 0);
    const size = RawMessage.create();
    size.setFloat(SizeFields.WIDTH, width);
    size.setFloat(SizeFields.HEIGHT, height);
    geometry.setMessage(Geometry.POSITION, position);
    geometry.setMessage(Geometry.SIZE, size);
    drawable.setMessage(Drawable.GEOMETRY, geometry);
    image.message.setMessage(Image.SUPER, drawable);
    if (dims) {
      const natural = RawMessage.create();
      natural.setFloat(SizeFields.WIDTH, dims.width);
      natural.setFloat(SizeFields.HEIGHT, dims.height);
      image.message.setMessage(Image.ORIGINAL_SIZE, natural);
    }
    image.message.setMessage(Image.DATA, makeDataRef(dataId));
    image.setDataReferences([dataId]);

    const attachment = this.store.createObject(TSWP_TYPE.DRAWABLE_ATTACHMENT, component);
    attachment.message.setMessage(DrawableAttachment.DRAWABLE, makeRef(image.identifier));

    body.insertText(pos, ATTACHMENT_CHAR);
    // Attachment entries are point-anchored at the U+FFFC character.
    const table = body.object.message.getMessage(Storage.TABLE_ATTACHMENT) ?? RawMessage.create();
    if (!body.object.message.has(Storage.TABLE_ATTACHMENT)) {
      body.object.message.setMessage(Storage.TABLE_ATTACHMENT, table);
    }
    const entry = RawMessage.create();
    entry.setVarint(ENTRY_CHARACTER_INDEX, pos);
    entry.setMessage(ENTRY_OBJECT, makeRef(attachment.identifier));
    const entries = table.getMessages(ATTR_TABLE_ENTRIES);
    entries.push(entry);
    entries.sort(
      (a, b) => (a.getUint(ENTRY_CHARACTER_INDEX) ?? 0) - (b.getUint(ENTRY_CHARACTER_INDEX) ?? 0),
    );
    table.setMessages(ATTR_TABLE_ENTRIES, entries);

    return { imageId: image.identifier, dataId };
  }
}

function nameOfStyle(store: ObjectStore, id: bigint): string | undefined {
  const obj = store.object(id);
  return obj?.message.getMessage(1)?.getString(1);
}

/** TP.SettingsArchive accessor (document-wide behavior switches). */
export class PagesSettings {
  private readonly object: IwaObject;

  constructor(object: IwaObject) {
    this.object = object;
  }

  get hyphenation(): boolean {
    return this.object.message.getBool(SettingsFields.HYPHENATION) ?? false;
  }

  set hyphenation(value: boolean) {
    this.object.message.setBool(SettingsFields.HYPHENATION, value);
  }

  get useLigatures(): boolean {
    return this.object.message.getBool(SettingsFields.USE_LIGATURES) ?? false;
  }

  set useLigatures(value: boolean) {
    this.object.message.setBool(SettingsFields.USE_LIGATURES, value);
  }

  /** 0 footnotes, 1 document endnotes, 2 section endnotes. */
  get footnoteKind(): number {
    return this.object.message.getUint(SettingsFields.FOOTNOTE_KIND) ?? 0;
  }

  set footnoteKind(value: number) {
    this.object.message.setVarint(SettingsFields.FOOTNOTE_KIND, value);
  }

  /** 0 numeric, 1 roman, 2 symbolic, 3/4 japanese. */
  get footnoteFormat(): number {
    return this.object.message.getUint(SettingsFields.FOOTNOTE_FORMAT) ?? 0;
  }

  set footnoteFormat(value: number) {
    this.object.message.setVarint(SettingsFields.FOOTNOTE_FORMAT, value);
  }

  /** 0 continuous, 1 restart each page, 2 restart each section. */
  get footnoteNumbering(): number {
    return this.object.message.getUint(SettingsFields.FOOTNOTE_NUMBERING) ?? 0;
  }

  set footnoteNumbering(value: number) {
    this.object.message.setVarint(SettingsFields.FOOTNOTE_NUMBERING, value);
  }

  get language(): string | undefined {
    return this.object.message.getString(SettingsFields.LANGUAGE);
  }

  get documentIsRtl(): boolean {
    return this.object.message.getBool(SettingsFields.DOCUMENT_IS_RTL) ?? false;
  }
}
