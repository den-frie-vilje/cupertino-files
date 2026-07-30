/**
 * Pages-specific (TP family) field numbers, type IDs and reference
 * extractors, layered on top of the shared families in model/schema.ts.
 *
 * TP message shapes are from the iWork '13 proto dump; the type registry and
 * every field this module touches are confirmed present in current Pages
 * (2026 registry dump + fixture evidence). Unknown newer fields are
 * preserved untouched by the RawMessage layer.
 */
import type { ReferenceExtractor } from "../tsp/store.ts";
import { pushRef } from "../tsp/schema.ts";
import { SHARED_REFERENCE_EXTRACTORS } from "../tsp/extractors.ts";

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
export const TPDocument = {
  STYLESHEET: 2,
  FLOATING_DRAWABLES: 3,
  BODY_STORAGE: 4,
  SECTION: 5,
  THEME: 6,
  SETTINGS: 7,
  DEPRECATED_LAYOUT_STATE: 11,
  DEPRECATED_VIEW_STATE: 12,
  CITATION_RECORDS: 13,
  TOC_STYLES: 14,
  SUPER: 15, // TSA.DocumentArchive
  CHANGE_SESSIONS: 16,
  DRAWABLES_ZORDER: 20,
  USES_SINGLE_HEADER_FOOTER: 21,
  PAGE_WIDTH: 30,
  PAGE_HEIGHT: 31,
  LEFT_MARGIN: 32,
  RIGHT_MARGIN: 33,
  TOP_MARGIN: 34,
  BOTTOM_MARGIN: 35,
  HEADER_MARGIN: 36,
  FOOTER_MARGIN: 37,
  PAGE_SCALE: 38,
  TABLES_CUSTOM_FORMAT_LIST: 41,
  ORIENTATION: 42,
} as const;

/** TP.SectionArchive (post-5.0 fields; never write the OBSOLETE_* ones). */
export const Section = {
  OBSOLETE_HEADERS: 3,
  OBSOLETE_FOOTERS: 4,
  OBSOLETE_MASTER_DRAWABLES: 14,
  INHERIT_PREVIOUS_HEADER_FOOTER: 17,
  FIRST_PAGE_DIFFERENT: 18,
  EVEN_ODD_DIFFERENT: 19,
  START_KIND: 20,
  PAGE_NUMBER_KIND: 21,
  PAGE_NUMBER_START: 22,
  FIRST_PAGE_MASTER: 23,
  EVEN_PAGE_MASTER: 24,
  ODD_PAGE_MASTER: 25,
  NAME: 26,
  FIRST_PAGE_HIDES_HEADER_FOOTER: 28,
} as const;

/** TP.PageMasterArchive / TP.SectionTemplateArchive. */
export const SectionTemplate = {
  HEADERS: 1,
  FOOTERS: 2,
  MASTER_DRAWABLES: 3,
} as const;

/** TP.FloatingDrawablesArchive. */
export const FloatingDrawables = { PAGE_GROUPS: 1 } as const;
export const PageGroup = {
  PAGE_INDEX: 1,
  BACKGROUND_DRAWABLES: 2,
  FOREGROUND_DRAWABLES: 3,
  DRAWABLES: 4,
} as const;
export const DrawableEntry = { DRAWABLE: 1 } as const;

/** TP.DrawablesZOrderArchive. */
export const DrawablesZOrder = { DRAWABLES: 1 } as const;

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

/** Shared extractors plus the TP types this library mutates. */
export const PAGES_REFERENCE_EXTRACTORS: ReadonlyMap<number, ReferenceExtractor> = new Map([
  ...SHARED_REFERENCE_EXTRACTORS,
  [TP_TYPE.SECTION, sectionExtractor],
  [TP_TYPE.SECTION_TEMPLATE, sectionTemplateExtractor],
]);
