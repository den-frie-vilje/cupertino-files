/**
 * PagesDocument — the Apple Pages (.pages) document model, extending the
 * shared IWorkDocument with the TP object graph: document root, body
 * storage, sections, section templates (page masters), headers/footers and
 * page geometry.
 */
import { IWorkDocument } from "../tsa/document.ts";
import { blankDonorBytes } from "./blank-donor.generated.ts";
import { OBJECT_REPLACEMENT_CHARACTER, TextStorage, type ParagraphInfo } from "../tswp/textstorage.ts";
import { ParagraphHandle, TextRange } from "../tswp/range.ts";
import {
  describeStyle,
  StylesheetModel,
  type CharacterFormatting,
  type ParagraphFormatting,
  type StyleInfo,
} from "../tss/stylesheet.ts";
import {
  ATTR_TABLE_ENTRIES,
  DrawableAttachment,
  ENTRY_CHARACTER_INDEX,
  ENTRY_OBJECT,
  ShapeInfo,
  Storage,
  TSWP_TYPE,
} from "../tswp/schema.ts";
import { makeDataRef, makeRef, Point, refId, SizeFields } from "../tsp/schema.ts";
import {
  buildTextWrap,
  Drawable,
  ExteriorTextWrap,
  Geometry,
  Image,
  TEXT_WRAP_IN_FLOW,
  TSD_TYPE,
} from "../tsd/schema.ts";
import { DrawableModel, findDrawableCore } from "../tsd/drawables.ts";
import { remintTableIdentity, tablesOf, TST_TYPE, type TableModel } from "../tst/tables.ts";
import { deepCloneObject, defaultFollow } from "../tsp/clone.ts";
import { rectanglePath } from "../tsd/masks.ts";
import { DrawableContainer } from "../tsd/placement.ts";
import { RawMessage } from "../base/protobuf.ts";
import { imageDimensions } from "../base/imagesize.ts";
import type { IwaObject } from "../tsp/iwa.ts";
import type { IWorkContainer } from "../tsp/package.ts";
import type { ObjectStore, ReferenceExtractor } from "../tsp/store.ts";
import { SHARED_REFERENCE_EXTRACTORS } from "../tsa/extractors.ts";
import {
  TP_REFERENCE_EXTRACTORS,
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

/** Shared-family extractors plus the TP types this document mutates. */
const PAGES_REFERENCE_EXTRACTORS: ReadonlyMap<number, ReferenceExtractor> = new Map([
  ...SHARED_REFERENCE_EXTRACTORS,
  ...TP_REFERENCE_EXTRACTORS,
]);

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
  /**
   * The named paper behind the geometry — `"iso-a4"` and `"na-letter"` in
   * the corpus. Set it alongside the dimensions so the print dialog agrees
   * with the page: Apple's A4 is `pageWidth 595.280029296875, pageHeight
   * 841.8900146484375` with all four margins `56.69291687011719` (2 cm),
   * measured identically from writers twelve app versions apart.
   */
  paperId: string | undefined;
}

/**
 * One of the up-to-three page-master variants of a section.
 *
 * Each master lists three header and three footer storages. Modern
 * Pages draws slot 1 as one page-wide field — text written there
 * renders with its own paragraph alignment — and leaves slots 0 and 2
 * undrawn; they are the legacy three-field layout's outer slots, still
 * carrying text in documents authored by old versions. Nearly all
 * corpus header text sits in slot 1.
 */
export interface SectionTemplateInfo {
  role: "first" | "even" | "odd";
  templateId: bigint;
  headers: TextStorage[];
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
   * Header/footer text of this section, from the odd-page master (the
   * default variant Pages shows). Slot 1 — the default — is the field
   * modern Pages draws, page-wide; 0 and 2 are the legacy layout's
   * outer slots.
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

  /**
   * Write header text into every page-master variant. The default slot
   * 1 is the field modern Pages draws — one page-wide field whose text
   * renders with its own paragraph alignment; slots 0 and 2 are the
   * legacy layout's outer slots, preserved but not drawn in modern
   * documents. Text written into a previously-empty slot copies the
   * attribute shape of a non-empty sibling — its paragraph style,
   * character-table and language entries — because a bare `setText`
   * leaves the donor's empty-storage shape.
   */
  setHeaderText(text: string, column = 1): void {
    this.writeMasterText("headers", text, column);
  }

  setFooterText(text: string, column = 1): void {
    this.writeMasterText("footers", text, column);
  }

  private writeMasterText(kind: "headers" | "footers", text: string, column: number): void {
    if (column !== 0 && column !== 1 && column !== 2) {
      throw new RangeError(`${kind} column ${column} out of range (0/1/2)`);
    }
    for (const t of this.templates()) {
      const storage = t[kind][column];
      if (!storage) continue;
      const sibling = t[kind].find((s) => s !== storage && s.text.length > 0);
      const wasEmpty = storage.text.length === 0;
      storage.setText(text);
      if (wasEmpty && sibling) storage.copyShapeFrom(sibling);
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

  /**
   * A new, empty Pages document — A4, vanilla styling, no template file
   * needed.
   *
   * The embedded donor is an Apple-written corpus fixture emptied by
   * {@link blankFrom} and re-papered to A4 with byte-measured values, so
   * every style and identity in the "new" document was authored by an
   * Apple app. `scripts/make-blanks.ts` records its provenance.
   *
   * @agentTool create_document
   */
  static blank(): PagesDocument {
    return PagesDocument.load(blankDonorBytes());
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
    // Chain-resolved, like ParagraphHandle.styleName: direct formatting
    // parents a paragraph on an anonymous style, and the name callers
    // want is the named ancestor's.
    return body.paragraphs().map((p) => ({
      ...p,
      styleName: p.styleId !== undefined ? body.styleNameOf(p.styleId) : undefined,
    }));
  }

  /**
   * Literal find/replace across the body, preserving the styling of the
   * surrounding text. Returns how many occurrences changed.
   *
   * @agentTool replace_text
   */
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
   *
   * `list` names a list style ("Bullet", "Numbered") to make the
   * paragraph a list item; without it the paragraph is not one, whatever
   * the paragraph before it was.
   * @agentTool append_paragraph
   */
  appendParagraph(text: string, style?: string | bigint, list?: string | bigint): number {
    const listId =
      list === undefined ? undefined : this.body.resolveStyle(list, TSWP_TYPE.LIST_STYLE);
    const index = this.body.appendParagraph(text, listId);
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
   * @agentTool format_text
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
        // Anonymous styles — the ones direct formatting creates — are
        // listed in the same sheet but are not styles anybody can apply
        // by name, and a document accumulates hundreds of them.
        if (s.name === undefined || s.name.length === 0) continue;
        if (!seen.has(s.id)) {
          seen.add(s.id);
          out.push(s);
        }
      }
    }
    return out;
  }

  /**
   * Which paragraph styles the body actually uses, most-used first — as
   * against {@link paragraphStyles}, which is everything the template
   * *defines*. A template usually defines styles its own sample content
   * never demonstrates, and those are the ones whose look nobody has
   * seen next to the rest.
   */
  paragraphStylesInUse(): { name: string; count: number }[] {
    const counts = new Map<string, number>();
    const paragraphs = this.body.paragraphs();
    for (let i = 0; i < paragraphs.length; i++) {
      const name = this.body.paragraph(i).styleName;
      if (name === undefined) continue;
      counts.set(name, (counts.get(name) ?? 0) + 1);
    }
    return [...counts.entries()]
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  }

  /**
   * Create a paragraph style and list it in the app's style panel.
   *
   * **Confirmed in Pages.** A style created here applies as asked and
   * appears in the paragraph styles panel. Four requirements, found one
   * failed round in the app at a time, each necessary and none sufficient:
   *
   *   1. a `super.name`;
   *   2. a `super.identifier` and a matching `identifier_to_style_map`
   *      entry — of the 146 paragraph styles in the ladder's base, the 21
   *      that are listed all carry both;
   *   3. both property bags, the field set all 3130 paragraph styles in
   *      these fixtures share;
   *   4. an entry in `TSWP.ThemePresetsArchive.paragraph_style_presets`
   *      (`TP.ThemeArchive.super.110.7`), which in every fixture holds
   *      exactly the names the app shows and whose length tracks what the
   *      user sees — twelve in a stock document, 35 and 61 in the two
   *      imported from Word.
   *
   * The first three produce a style that renders correctly and whose name
   * Pages prefills when adding a style by hand — and still does not list.
   * {@link unlistParagraphStyle} was built as the control (removal proves
   * which list the panel reads in a way addition cannot), and
   * {@link listedParagraphStyles} reads the panel's own order back.
   *
   * `copyOf` starts the new style's property bags as a full copy of an
   * existing style's — the dense shape every listed corpus style has.
   * Whether density is *also* required went unrecorded in the confirming
   * report, so sparse styles list on faith; dense ones on evidence.
   */
  createParagraphStyle(options: {
    name: string;
    basedOn?: string | bigint;
    copyOf?: string | bigint;
    character?: CharacterFormatting;
    paragraph?: ParagraphFormatting;
  }): bigint {
    const id = this.stylesheet.createParagraphStyle(options);
    this.listInThemeStyles(id);
    return id;
  }

  /**
   * The paragraph styles the app lists in its style panel, in panel order.
   *
   * Distinct from {@link paragraphStyles}, which is every style the
   * stylesheet chain holds — 146 of them in the ladder's base document
   * against the twelve the panel shows. The rest are overrides and
   * variations the app deliberately hides.
   */
  listedParagraphStyles(): StyleInfo[] {
    const out: StyleInfo[] = [];
    for (const entry of this.themeStyleList()?.getMessages(ThemeArchive.LIST_ENTRIES) ?? []) {
      // Each entry *is* a `TSP.Reference`, not a wrapper holding one.
      const id = entry.getVarint(1);
      const obj = id !== undefined ? this.store.resolve(id) : undefined;
      if (obj) out.push(describeStyle(obj));
    }
    return out;
  }

  /**
   * Take a paragraph style out of the panel list, leaving the style itself
   * in place and still applied wherever it is used.
   *
   * Returns whether it was listed. The inverse of what
   * {@link createParagraphStyle} does, and the control for it: adding an
   * entry and seeing nothing appear says only that the addition did not
   * work, while removing an entry and seeing an entry vanish says the list
   * is the thing the panel reads.
   */
  unlistParagraphStyle(id: bigint): boolean {
    const list = this.themeStyleList();
    const theme = this.store.resolve(refId(this.docObject.message, TPDocument.THEME));
    if (!list || !theme) return false;
    const kept = list
      .getMessages(ThemeArchive.LIST_ENTRIES)
      .filter((entry) => entry.getVarint(1) !== id);
    if (kept.length === list.getMessages(ThemeArchive.LIST_ENTRIES).length) return false;
    list.remove(ThemeArchive.LIST_ENTRIES);
    for (const entry of kept) list.addMessage(ThemeArchive.LIST_ENTRIES, entry);
    theme.message.markDirty();
    return true;
  }

  /** `TSWP.ThemePresetsArchive.paragraph_style_presets`, if this theme has one. */
  private themeStyleList(): RawMessage | undefined {
    const theme = this.store.resolve(refId(this.docObject.message, TPDocument.THEME));
    const sup = theme?.message.getMessage(ThemeArchive.SUPER);
    return sup?.getMessage(ThemeArchive.PARAGRAPH_STYLE_LIST);
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

  /**
   * Append a style to the theme's panel list, in the preset list its
   * type belongs to: `TSWP.ThemePresetsArchive` carries three —
   * paragraph, character and list style presets — and the app refuses a
   * document whose paragraph list holds a character style. A style of
   * any other type throws.
   */
  listInThemeStyles(styleId: bigint): void {
    const entriesField =
      this.store.object(styleId)?.type === TSWP_TYPE.PARAGRAPH_STYLE
        ? ThemeArchive.LIST_ENTRIES
        : this.store.object(styleId)?.type === TSWP_TYPE.CHARACTER_STYLE
          ? ThemeArchive.CHARACTER_ENTRIES
          : this.store.object(styleId)?.type === TSWP_TYPE.LIST_STYLE
            ? ThemeArchive.LIST_STYLE_ENTRIES
            : undefined;
    if (entriesField === undefined) {
      throw new RangeError(`style ${styleId} is not a paragraph, character or list style`);
    }
    const theme = this.store.resolve(refId(this.docObject.message, TPDocument.THEME));
    if (!theme) return;
    const sup = theme.message.getMessage(ThemeArchive.SUPER);
    const list = sup?.getMessage(ThemeArchive.PARAGRAPH_STYLE_LIST);
    if (!sup || !list) return; // a theme without the list is not one we can extend
    list.addMessage(entriesField, makeRef(styleId));
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
        const id = refId(entries[i], ENTRY_OBJECT);
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
      paperId: m.getString(TPDocument.PAPER_ID),
    };
  }

  /**
   * Update page geometry (points; 1 pt = 1/72 in). Only given fields change.
   *
   * @agentTool set_page_setup
   */
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
    if (update.paperId !== undefined) {
      m.setString(TPDocument.PAPER_ID, update.paperId);
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

  /**
   * Apply several non-overlapping body edits from one snapshot — offsets
   * for every edit refer to the text as it is now, in any order; an
   * omitted `replacement` deletes the range. The safe way to make many
   * changes gathered from one `paragraphs()`/`find()` pass.
   */
  applyEdits(edits: readonly { start: number; end: number; replacement?: string }[]): void {
    this.body.applyEdits(edits);
  }

  /** The body's placeholder-text spans ("tap or click to add …"). */
  placeholders(): { start: number; end: number; text: string; fieldId: bigint }[] {
    return this.bodyOrUndefined?.placeholders() ?? [];
  }

  /**
   * Fill a body placeholder: real text in, placeholder marking off,
   * styling kept — what typing into one does in Pages. Returns the
   * filled span as a fluent range.
   *
   * A number indexes the listing *as of this call*: a fill removes its
   * entry, so the indexes of the placeholders after it shift down by
   * one — filling 0, 1, 2 from one remembered listing lands two of them
   * in the wrong fields. To fill several, pass the entries of one
   * {@link placeholders} snapshot (each carries the `fieldId` that pins
   * it, resolved live at the fill), or pass field ids directly.
   */
  fillPlaceholder(
    placeholder: number | bigint | { start: number; end: number; fieldId?: bigint },
    text: string,
  ): TextRange {
    let target: bigint | { start: number; end: number; fieldId?: bigint };
    if (typeof placeholder === "number") {
      const entry = this.body.placeholders()[placeholder];
      if (!entry) {
        throw new RangeError(
          `no placeholder ${placeholder}: the body has ${this.body.placeholders().length}`,
        );
      }
      target = entry;
    } else {
      target = placeholder;
    }
    const span = this.body.fillPlaceholder(target, text);
    return this.body.range(span.start, span.end);
  }

  /**
   * Mark a body span as placeholder text, the way Format → Advanced →
   * Define as Placeholder Text does. Returns the field's id.
   */
  defineAsPlaceholder(start: number, end: number): bigint {
    return this.body.defineAsPlaceholder(start, end);
  }

  /** Effective character formatting at a body position, inheritance folded in. */
  characterFormattingAt(pos: number): ReturnType<TextStorage["characterFormattingAt"]> {
    return this.body.characterFormattingAt(pos);
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

  /**
   * Make a body range a hyperlink.
   *
   * @agentTool insert_link
   */
  insertLink(
    start: number,
    end: number,
    url: string,
    options: { characterStyle?: bigint | string | false } = {},
  ): bigint {
    return this.body.insertLink(start, end, url, options);
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

  /**
   * Tables in document order: the body's anchored tables first, by their
   * position in the text, then floating tables in paint order, then any
   * the anchors do not reach (storage order). `tables()[0]` is the first
   * table in the document whatever was added this session.
   */
  override tables(): TableModel[] {
    const anchored: bigint[] = [];
    for (const attachment of this.body.attachments()) {
      const target =
        attachment.drawableId !== undefined
          ? this.store.object(attachment.drawableId)
          : undefined;
      if (target?.type === TST_TYPE.TABLE_INFO) anchored.push(target.identifier);
    }
    const zorder = this.store.resolve(refId(this.docObject.message, TPDocument.DRAWABLES_ZORDER));
    for (const entry of zorder?.message.getMessages(DrawablesZOrder.DRAWABLES) ?? []) {
      const id = refId(entry, DrawablesZOrder.DRAWABLES);
      if (id !== undefined && this.store.object(id)?.type === TST_TYPE.TABLE_INFO) {
        anchored.push(id);
      }
    }
    const seen = new Set<bigint>();
    const out: TableModel[] = [];
    const take = (models: TableModel[]): void => {
      for (const model of models) {
        if (seen.has(model.object.identifier)) continue;
        seen.add(model.object.identifier);
        out.push(model);
      }
    };
    take(tablesOf(this.store, anchored));
    take(tablesOf(this.store));
    return out;
  }

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
   * the enclosing section's configuration *and its page masters*: every
   * section owns its three master variants and their header/footer
   * storages — no two sections in the corpus's 25 sectioned documents
   * share a master object — so the sections' headers stay independently
   * editable. `inherit_previous_header_footer` is set, matching Pages'
   * "Create a new section" default. Returns the new section.
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
    // A section boundary is a *character* as well as a table entry: in all
    // 28 boundaries across the five multi-section fixtures, the previous
    // paragraph's terminator is U+0004 — replacing its U+000A, not
    // following it — and `section_start_kind` is always 0. The table entry
    // alone produced a document Pages opened and did not paginate: the
    // sidebar knew the section, the layout kept flowing on the same page,
    // because pagination reads the text. Same length either way, so every
    // attribute-table index survives the swap.
    if (body.text.charCodeAt(at - 1) !== 0x04) {
      body.replaceRange(at - 1, at, "\u0004");
    }
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
    for (const field of [
      Section.FIRST_PAGE_MASTER,
      Section.EVEN_PAGE_MASTER,
      Section.ODD_PAGE_MASTER,
    ]) {
      const masterId = refId(m, field);
      const master = masterId !== undefined ? this.store.object(masterId) : undefined;
      if (!master) continue;
      const clone = this.store.createObject(TP_TYPE.SECTION_TEMPLATE, component, {
        cloneFrom: master,
      });
      for (const listField of [SectionTemplate.HEADERS, SectionTemplate.FOOTERS]) {
        const cloned = clone.message.getMessages(listField).map((ref) => {
          const id = ref.getVarint(1);
          const storage = id !== undefined ? this.store.object(id) : undefined;
          if (!storage) return ref;
          const copy = this.store.createObject(TSWP_TYPE.STORAGE, component, {
            cloneFrom: storage,
          });
          return makeRef(copy.identifier);
        });
        clone.message.setMessages(listField, cloned);
      }
      m.setMessage(field, makeRef(clone.identifier));
    }
    m.setBool(Section.INHERIT_PREVIOUS_HEADER_FOOTER, true);
    // The clone brings the enclosing section's name, and keeping it is the
    // point: all 47 sections in these fixtures carry one — the page
    // master's, "Blank" in a stock template — and none carries none.
    // Stripping it was inventing a shape Apple never writes.
    if (options.name !== undefined) m.setString(Section.NAME, options.name);
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
      (id) => {
        this.addToZOrder(id);
        // A floating drawable carries the on-page wrap — type 4 with a
        // 12 pt margin, the shape of 1136 corpus floating drawables. A
        // copy of an inline image brings its in-the-text-flow wrap
        // along, and the app then shows automatic wrap in the inspector
        // while wrapping nothing.
        const obj = this.store.object(id);
        const core = obj ? findDrawableCore(obj.message) : undefined;
        if (core) {
          const wrap = core.getMessage(Drawable.EXTERIOR_TEXT_WRAP);
          if (!wrap || wrap.getUint(ExteriorTextWrap.TYPE) === TEXT_WRAP_IN_FLOW) {
            core.setMessage(Drawable.EXTERIOR_TEXT_WRAP, buildTextWrap("page"));
            obj!.message.markDirty();
          }
        }
      },
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
   * Insert an image inline at a body-text position. Registers the bytes
   * as a Data/ file (SHA-1 deduped), creates the TSD.ImageArchive +
   * attachment objects, anchors them at a U+FFFC character, and sizes
   * the image from its intrinsic dimensions — PNG/JPEG/GIF pixels, or a
   * PDF's first-page MediaBox in points — scaled to fit `maxWidth`
   * (default 400 pt) unless explicit width/height are given. A PDF is
   * media like any raster image: the corpus's PDF figures use the same
   * archive, and stay vector when the app scales them.
   * App-confirmed: ladder rung P11 renders at the size asked.
   *
   * The image rides the text: it sits in the text column and moves with
   * the paragraph's indent, because the drawable carries the
   * in-the-text-flow `exterior_text_wrap`. Pass `wrap: "page"` for the
   * other behaviour, where the image is placed against the page margins
   * and text flows around it — with an indented body that means the
   * picture will not line up with the words above it.
   */
  insertInlineImage(
    pos: number,
    data: Uint8Array,
    options: {
      fileName: string;
      width?: number;
      height?: number;
      maxWidth?: number;
      wrap?: "text" | "page";
    },
  ): { imageId: bigint; dataId: bigint } {
    const body = this.body;
    const wrap = options.wrap ?? "text";
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
    // Flags 3 and an explicit angle are on 102 of 102 corpus inline
    // drawables, without exception.
    geometry.setVarint(Geometry.FLAGS, 3);
    geometry.setFloat(Geometry.ANGLE, 0);
    drawable.setMessage(Drawable.GEOMETRY, geometry);
    // The back-pointer to the storage the drawable is anchored in:
    // present on all 102, resolving to the TSWP.StorageArchive every time.
    drawable.setMessage(Drawable.PARENT, makeRef(body.id));
    drawable.setMessage(Drawable.EXTERIOR_TEXT_WRAP, buildTextWrap(wrap));
    // Locked and aspect-ratio-locked are stated, not left absent: 156 of
    // 171 corpus images carry exactly this pair, and all 87 masked ones
    // state aspect_ratio_locked true — the resize behavior a photo gets.
    drawable.setBool(Drawable.LOCKED, false);
    drawable.setBool(Drawable.ASPECT_RATIO_LOCKED, true);
    // Title and caption point at empty stand-in archives with both hidden
    // flags stated: 88 corpus images carry the pair, all 176 targets are
    // empty TSD.StandinCaptionArchives, and 87 of 88 state false/false.
    const title = this.store.createObject(TSD_TYPE.STANDIN_CAPTION, component);
    const caption = this.store.createObject(TSD_TYPE.STANDIN_CAPTION, component);
    drawable.setMessage(Drawable.TITLE, makeRef(title.identifier));
    drawable.setMessage(Drawable.CAPTION, makeRef(caption.identifier));
    drawable.setBool(Drawable.TITLE_HIDDEN, false);
    drawable.setBool(Drawable.CAPTION_HIDDEN, false);
    image.message.setMessage(Image.SUPER, drawable);
    if (dims) {
      // Both sizes are on 83 of 83 corpus images, and they answer
      // different questions: `naturalSize` is the source's own extent
      // (pixels, or a PDF's points), `originalSize` the uncropped
      // drawn frame in parent points — the frame the mask editor
      // exposes. Writing pixels into both wrapped a source-sized claim
      // around a scaled geometry, and the editor refused the mask.
      const natural = RawMessage.create();
      natural.setFloat(SizeFields.WIDTH, dims.width);
      natural.setFloat(SizeFields.HEIGHT, dims.height);
      image.message.setMessage(Image.NATURAL_SIZE, natural);
      const drawn = RawMessage.create();
      drawn.setFloat(SizeFields.WIDTH, width);
      drawn.setFloat(SizeFields.HEIGHT, height);
      image.message.setMessage(Image.ORIGINAL_SIZE, drawn);
      // traced_path: the source-extent rectangle 30 of the corpus's 31
      // masked Pages images carry, and the mask editor's outline.
      image.message.setMessage(19, rectanglePath(dims.width, dims.height));
    }
    image.message.setMessage(Image.DATA, makeDataRef(dataId));
    // An image with no style is the same shape as a cell control with no
    // format: valid, complete by the schema, and never drawn. Every corpus
    // image points at a TSD.MediaStyleArchive, and the one it points at is
    // the theme's own `image-0-imageStyle`.
    const style = mediaStyleIdOf(this);
    if (style !== undefined) image.message.setMessage(Image.STYLE, makeRef(style));
    image.message.setVarint(Image.FLAGS, 0);
    image.message.setBool(Image.UNTAGGED_AS_GENERIC, false);
    image.setDataReferences([dataId]);

    const attachment = this.store.createObject(TSWP_TYPE.DRAWABLE_ATTACHMENT, component);
    attachment.message.setMessage(DrawableAttachment.DRAWABLE, makeRef(image.identifier));
    // Zero offsets, explicitly. All four fields are on 101 of 101 corpus
    // attachments; absent is not a value Pages has been observed to write.
    attachment.message.setVarint(DrawableAttachment.H_OFFSET_TYPE, 0);
    attachment.message.setFloat(DrawableAttachment.H_OFFSET, 0);
    attachment.message.setVarint(DrawableAttachment.V_OFFSET_TYPE, 0);
    attachment.message.setFloat(DrawableAttachment.V_OFFSET, 0);

    body.insertText(pos, OBJECT_REPLACEMENT_CHARACTER);
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

  /**
   * Insert a table inline at a body-text position, cloned from a table
   * already in the document.
   *
   * Clone-based like `NumbersDocument.addTable`, because a table's object
   * graph — model, data store, tiles, data lists, per-band styles — is
   * far beyond what can be invented safely; every identity in the copy
   * comes from an Apple-authored source. A document with no table has
   * nothing to clone, and throws. The copy forks its data lists (the
   * clone walk follows the whole table subtree), so filling it never
   * touches the source — the save-time integrity gate would refuse the
   * file if it did.
   *
   * The anchoring is the measured inline-table shape: the info's
   * `parent` is the body storage, its geometry sits at the origin with
   * the standard flags, and a five-field attachment ties it to a U+FFFC
   * character.
   */
  insertInlineTable(
    pos: number,
    options: { copyOf?: bigint; name?: string; withContent?: boolean } = {},
  ): TableModel {
    const body = this.body;
    const component = this.store.componentOf(body.id);
    if (!component) throw new RangeError("body component not found");
    const sourceId =
      options.copyOf ?? this.tables().find((t) => t.infoObject !== undefined)?.infoObject?.identifier;
    if (sourceId === undefined) {
      throw new RangeError(
        "no table to copy: this document contains none, and building one from nothing is not supported",
      );
    }
    const source = this.store.object(sourceId);
    if (source?.type !== TST_TYPE.TABLE_INFO) {
      throw new RangeError(`object ${sourceId} is not a TST.TableInfoArchive`);
    }

    const { clone } = deepCloneObject(this.store, source, {
      component,
      follow: (candidate, depth) =>
        defaultFollow(candidate, this.store.typeNameOf(candidate)) && depth <= 8,
    });
    const core = findDrawableCore(clone.message);
    if (core) {
      core.setMessage(Drawable.PARENT, makeRef(body.id));
      clone.message.markDirty();
    }

    const model = tablesOf(this.store, [clone.identifier])[0];
    if (!model) throw new RangeError(`copied table ${clone.identifier} did not resolve`);
    remintTableIdentity(this.store, clone.identifier);
    model.name = this.uniqueTableName(options.name, clone.identifier);
    if (options.withContent === false) model.clearAllCells();

    const attachment = this.store.createObject(TSWP_TYPE.DRAWABLE_ATTACHMENT, component);
    attachment.message.setMessage(DrawableAttachment.DRAWABLE, makeRef(clone.identifier));
    attachment.message.setVarint(DrawableAttachment.H_OFFSET_TYPE, 0);
    attachment.message.setFloat(DrawableAttachment.H_OFFSET, 0);
    attachment.message.setVarint(DrawableAttachment.V_OFFSET_TYPE, 0);
    attachment.message.setFloat(DrawableAttachment.V_OFFSET, 0);
    body.insertAttachment(pos, attachment.identifier);
    return model;
  }

  /** A table name no other table in the document uses. */
  private uniqueTableName(preferred: string | undefined, exclude: bigint): string {
    const used = new Set(
      this.tables()
        .filter((table) => table.infoObject?.identifier !== exclude)
        .map((table) => table.name)
        .filter((name): name is string => name !== undefined),
    );
    const base = preferred ?? "Table";
    if (!used.has(base)) return base;
    for (let n = 2; ; n++) {
      const candidate = `${base} ${n}`;
      if (!used.has(candidate)) return candidate;
    }
  }
}

/**
 * The theme's image style, which every image in the corpus points at.
 *
 * Identified rather than searched by type, because a document holds several
 * `TSD.MediaStyleArchive`s and only one is the one images use: 59 of the 83
 * corpus images name `image-0-imageStyle`, and the rest name a variation of
 * it. Falls back to whatever an image already in the document uses, and
 * then to nothing — an unstyled image is worth writing anyway, since the
 * alternative is refusing to insert one.
 */
function mediaStyleIdOf(doc: PagesDocument): bigint | undefined {
  const byIdentifier = doc.stylesheet.findByIdentifier("image-0-imageStyle");
  if (byIdentifier) return byIdentifier.id;
  for (const { obj } of doc.store.allObjects()) {
    if (obj.type !== TSD_TYPE.IMAGE) continue;
    const style = refId(obj.message, Image.STYLE);
    if (style !== undefined) return style;
  }
  return undefined;
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
