/**
 * Pages-specific (TP family) field numbers, type IDs and reference
 * extractors, layered on top of the shared families in model/schema.ts.
 *
 * TP message shapes are from the iWork '13 proto dump; the type registry and
 * every field this module touches are confirmed present in current Pages
 * (2026 registry dump + fixture evidence). Unknown newer fields are
 * preserved untouched by the RawMessage layer.
 */
import { protoFields } from "../proto/fields.ts";
import type { ReferenceExtractor } from "../tsp/store.ts";
import { pushRef } from "../tsp/schema.ts";

export const TP_TYPE = {
  DOCUMENT: 10000,
  THEME: 10001,
  FLOATING_DRAWABLES: 10010,
  /** Pages-only meaning; the same ID is TSWP.SectionPlaceholderArchive elsewhere. */
  SECTION: 10011,
  SETTINGS: 10012,
  DRAWABLES_ZORDER: 10015,
  /** Named PageMasterArchive in iWork '13, SectionTemplateArchive today. */
  SECTION_TEMPLATE: 10143,
} as const;

/** TP.DocumentArchive. */
/**
 * `TP.ThemeArchive`, and the list the paragraph-style panel reads.
 *
 * The style list is an extension on `TSS.ThemeArchive` at field 110, whose
 * field 7 holds one reference per listed paragraph style. Measured in all
 * 19 Pages fixtures: always present, always field 7, and the entries are
 * exactly the names the app shows.
 */
export const ThemeArchive = {
  ...protoFields("TP.ThemeArchive", { SUPER: "super" }),
  // Both lists are extensions on `TSS.ThemeArchive`, so they are addressed
  // by the type they carry rather than by name — every one of the five
  // families that extends a theme calls its field `extension`.
  ...protoFields("TSS.ThemeArchive", {
    PARAGRAPH_STYLE_LIST: "TSWP.ThemePresetsArchive",
    /** Object titles and captions live in their own list. */
    OBJECT_STYLE_LIST: "TSA.ThemePresetsArchive",
  }),
  ...protoFields("TSWP.ThemePresetsArchive", { LIST_ENTRIES: "paragraph_style_presets" }),
} as const;

export const TPDocument = protoFields("TP.DocumentArchive", {
  STYLESHEET: "stylesheet",
  FLOATING_DRAWABLES: "floating_drawables",
  BODY_STORAGE: "body_storage",
  SECTION: "section",
  THEME: "theme",
  SETTINGS: "settings",
  DEPRECATED_LAYOUT_STATE: "deprecated_layout_state",
  DEPRECATED_VIEW_STATE: "deprecated_view_state",
  CITATION_RECORDS: "citation_records",
  TOC_STYLES: "toc_styles",
  SUPER: "super", // TSA.DocumentArchive
  CHANGE_SESSIONS: "change_sessions",
  DRAWABLES_ZORDER: "drawables_zorder",
  USES_SINGLE_HEADER_FOOTER: "uses_single_header_footer",
  PAGE_WIDTH: "page_width",
  PAGE_HEIGHT: "page_height",
  LEFT_MARGIN: "left_margin",
  RIGHT_MARGIN: "right_margin",
  TOP_MARGIN: "top_margin",
  BOTTOM_MARGIN: "bottom_margin",
  HEADER_MARGIN: "header_margin",
  FOOTER_MARGIN: "footer_margin",
  PAGE_SCALE: "page_scale",
  TABLES_CUSTOM_FORMAT_LIST: "tables_custom_format_list",
  ORIENTATION: "orientation",
});

/** TP.SectionArchive (post-5.0 fields; never write the OBSOLETE_* ones). */
export const Section = protoFields("TP.SectionArchive", {
  OBSOLETE_HEADERS: "OBSOLETE_headers",
  OBSOLETE_FOOTERS: "OBSOLETE_footers",
  OBSOLETE_MASTER_DRAWABLES: "OBSOLETE_master_drawables",
  INHERIT_PREVIOUS_HEADER_FOOTER: "inherit_previous_header_footer",
  FIRST_PAGE_DIFFERENT: "page_master_first_page_different",
  EVEN_ODD_DIFFERENT: "page_master_even_odd_pages_different",
  START_KIND: "section_start_kind",
  PAGE_NUMBER_KIND: "section_page_number_kind",
  PAGE_NUMBER_START: "section_page_number_start",
  FIRST_PAGE_MASTER: "first_page_master",
  EVEN_PAGE_MASTER: "even_page_master",
  ODD_PAGE_MASTER: "odd_page_master",
  NAME: "name",
  FIRST_PAGE_HIDES_HEADER_FOOTER: "page_master_first_page_hides_header_footer",
});

/** TP.PageMasterArchive / TP.SectionTemplateArchive. */
export const SectionTemplate = protoFields("TP.PageMasterArchive", {
  HEADERS: "headers",
  FOOTERS: "footers",
  MASTER_DRAWABLES: "master_drawables",
});

/** TP.SettingsArchive. */
export const SettingsFields = protoFields("TP.SettingsArchive", {
  /** false ⇒ page-layout document (no body text flow). */
  BODY: "body",
  HEADERS: "headers",
  FOOTERS: "footers",
  HYPHENATION: "hyphenation",
  USE_LIGATURES: "use_ligatures",
  DOCUMENT_IS_RTL: "document_is_rtl",
  DECIMAL_TAB: "decimal_tab",
  LANGUAGE: "language",
  ORIG_TEMPLATE: "orig_template",
  CREATION_DATE: "creation_date",
  FOOTNOTE_KIND: "footnote_kind",
  FOOTNOTE_FORMAT: "footnote_format",
  FOOTNOTE_NUMBERING: "footnote_numbering",
  FOOTNOTE_GAP: "footnote_gap",
});

/** TP.FloatingDrawablesArchive. */
export const FloatingDrawables = protoFields("TP.FloatingDrawablesArchive", { PAGE_GROUPS: "page_groups" });
export const PageGroup = protoFields("TP.FloatingDrawablesArchive.PageGroup", {
  PAGE_INDEX: "page_index",
  BACKGROUND_DRAWABLES: "background_drawables",
  FOREGROUND_DRAWABLES: "foreground_drawables",
  DRAWABLES: "drawables",
});
export const DrawableEntry = protoFields("TP.FloatingDrawablesArchive", { DRAWABLE: "page_groups" });

/** TP.DrawablesZOrderArchive. */
export const DrawablesZOrder = protoFields("TP.DrawablesZOrderArchive", { DRAWABLES: "drawables" });

const sectionExtractor: ReferenceExtractor = (m) => {
  const out: bigint[] = [];
  pushRef(out, m, Section.OBSOLETE_HEADERS);
  pushRef(out, m, Section.OBSOLETE_FOOTERS);
  pushRef(out, m, Section.OBSOLETE_MASTER_DRAWABLES);
  pushRef(out, m, Section.FIRST_PAGE_MASTER);
  pushRef(out, m, Section.EVEN_PAGE_MASTER);
  pushRef(out, m, Section.ODD_PAGE_MASTER);
  return out;
};

const sectionTemplateExtractor: ReferenceExtractor = (m) => {
  const out: bigint[] = [];
  pushRef(out, m, SectionTemplate.HEADERS);
  pushRef(out, m, SectionTemplate.FOOTERS);
  pushRef(out, m, SectionTemplate.MASTER_DRAWABLES);
  return out;
};

/**
 * The TP types this library mutates. Family-local on purpose: schema leaves
 * are importable from every layer, so this map must not pull in the shared
 * composition — `pages/document.ts` merges it with
 * `SHARED_REFERENCE_EXTRACTORS`, exactly as `tsa/extractors.ts` merges the
 * shared families' own leaf maps.
 */
export const TP_REFERENCE_EXTRACTORS: ReadonlyMap<number, ReferenceExtractor> = new Map([
  [TP_TYPE.SECTION, sectionExtractor],
  [TP_TYPE.SECTION_TEMPLATE, sectionTemplateExtractor],
]);
