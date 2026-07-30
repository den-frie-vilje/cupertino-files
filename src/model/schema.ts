/**
 * Field numbers, type IDs and reference extractors for the message families
 * SHARED by all three iWork apps (TSP / TSS / TSWP / TSD), transcribed from
 * the current proto dumps under proto/current/ (Numbers 14.4; registry
 * cross-confirmed against a live 2026 dump — see research/).
 *
 * App-specific families extend these in src/pages, src/numbers, src/keynote.
 *
 * Compatibility strategy: Apple evolves these messages additively (field
 * numbers are never reused; 2013→2026 diffs are pure additions plus renames).
 * Everything this library does not model is preserved byte-for-byte by the
 * RawMessage layer, so documents written by newer apps survive a round-trip
 * even when they contain fields unknown to us.
 */
import { RawMessage } from "../protobuf.ts";
import type { ReferenceExtractor } from "../store.ts";

// ------------------------------------------------------------- type IDs

export const SHARED_TYPE = {
  TSWP_STORAGE: 2001,
  TSWP_CHARACTER_STYLE: 2021,
  TSWP_PARAGRAPH_STYLE: 2022,
  TSWP_LIST_STYLE: 2023,
  TSWP_COLUMN_STYLE: 2024,
  TSS_STYLESHEET: 401,
  TSS_THEME: 402,
  TSP_PACKAGE_METADATA: 11006,
} as const;

// ------------------------------------------------------------- TSWP.StorageArchive

export const Storage = {
  KIND: 1,
  STYLE_SHEET: 2,
  TEXT: 3,
  HAS_ITEXT: 4,
  TABLE_PARA_STYLE: 5,
  TABLE_PARA_DATA: 6,
  TABLE_LIST_STYLE: 7,
  TABLE_CHAR_STYLE: 8,
  TABLE_ATTACHMENT: 9,
  IN_DOCUMENT: 10,
  TABLE_SMARTFIELD: 11,
  TABLE_LAYOUT_STYLE: 12,
  TABLE_PARA_STARTS: 14,
  TABLE_BOOKMARK: 15,
  TABLE_FOOTNOTE: 16,
  TABLE_SECTION: 17,
  TABLE_RUBYFIELD: 18,
  TABLE_LANGUAGE: 19,
  TABLE_DICTATION: 20,
  TABLE_INSERTION: 21,
  TABLE_DELETION: 22,
  TABLE_HIGHLIGHT: 23,
  TABLE_PARA_BIDI: 24,
  TABLE_OVERLAPPING_HIGHLIGHT: 25,
  TABLE_PENCIL_ANNOTATION: 26,
  TABLE_TATECHUYOKO: 27,
  TABLE_DROP_CAP_STYLE: 28,
} as const;

export const StorageKind = {
  BODY: 0,
  HEADER: 1,
  FOOTNOTE: 2,
  TEXTBOX: 3,
  NOTE: 4,
  CELL: 5,
  UNCLASSIFIED: 6,
  TABLEOFCONTENTS: 7,
  UNDEFINED: 8,
} as const;
export type StorageKind = (typeof StorageKind)[keyof typeof StorageKind];

/** ObjectAttributeTable / StringAttributeTable / ParaDataAttributeTable: entries = 1. */
export const ATTR_TABLE_ENTRIES = 1;
/** Entry fields: character_index = 1; object/string = 2 (ParaData: first = 2, second = 3). */
export const ENTRY_CHARACTER_INDEX = 1;
export const ENTRY_OBJECT = 2;
export const ENTRY_PARA_FIRST = 2;
export const ENTRY_PARA_SECOND = 3;
/** OverlappingFieldAttributeTable entry: range = 1 (TSP.Range), field = 2 (ref). */
export const OVERLAP_RANGE = 1;
export const OVERLAP_FIELD = 2;
/** TSP.Range: location = 1, length = 2. */
export const RANGE_LOCATION = 1;
export const RANGE_LENGTH = 2;

/** Storage fields holding ObjectAttributeTables whose entry field 2 is a TSP.Reference. */
export const OBJECT_TABLE_FIELDS: readonly number[] = [
  Storage.TABLE_PARA_STYLE,
  Storage.TABLE_LIST_STYLE,
  Storage.TABLE_CHAR_STYLE,
  Storage.TABLE_ATTACHMENT,
  Storage.TABLE_SMARTFIELD,
  Storage.TABLE_LAYOUT_STYLE,
  Storage.TABLE_BOOKMARK,
  Storage.TABLE_FOOTNOTE,
  Storage.TABLE_SECTION,
  Storage.TABLE_RUBYFIELD,
  Storage.TABLE_INSERTION,
  Storage.TABLE_DELETION,
  Storage.TABLE_HIGHLIGHT,
  Storage.TABLE_TATECHUYOKO,
  Storage.TABLE_DROP_CAP_STYLE,
];

/** Storage fields holding StringAttributeTables (entry field 2 is a string). */
export const STRING_TABLE_FIELDS: readonly number[] = [
  Storage.TABLE_LANGUAGE,
  Storage.TABLE_DICTATION,
];

/** Storage fields holding ParaDataAttributeTables (per-paragraph uint pairs). */
export const PARA_DATA_TABLE_FIELDS: readonly number[] = [
  Storage.TABLE_PARA_DATA,
  Storage.TABLE_PARA_STARTS,
  Storage.TABLE_PARA_BIDI,
];

/** Storage fields holding OverlappingFieldAttributeTables (TSP.Range based). */
export const OVERLAP_TABLE_FIELDS: readonly number[] = [
  Storage.TABLE_OVERLAPPING_HIGHLIGHT,
  Storage.TABLE_PENCIL_ANNOTATION,
];

/**
 * Paragraph-aligned object tables: by app convention exactly one entry per
 * paragraph, an entry with `object` unset meaning "unchanged from the
 * previous paragraph".
 */
export const PARA_ALIGNED_OBJECT_TABLES: readonly number[] = [
  Storage.TABLE_PARA_STYLE,
  Storage.TABLE_LIST_STYLE,
  Storage.TABLE_LAYOUT_STYLE,
];

// ------------------------------------------------------------- styles

/** TSS.StyleArchive (embedded as `super` = field 1 of concrete styles). */
export const StyleSuper = {
  NAME: 1,
  STYLE_IDENTIFIER: 2,
  PARENT: 3,
  IS_VARIATION: 4,
  STYLESHEET: 5,
} as const;

/** Concrete style archives (TSWP.*StyleArchive). */
export const StyleArchive = {
  SUPER: 1,
  OVERRIDE_COUNT: 10,
  CHAR_PROPERTIES: 11, // ParagraphStyleArchive + CharacterStyleArchive
  PARA_PROPERTIES: 12, // ParagraphStyleArchive only
} as const;

/** TSWP.CharacterStylePropertiesArchive. */
export const CharProps = {
  BOLD: 1,
  ITALIC: 2,
  FONT_SIZE: 3,
  FONT_NAME_NULL: 4,
  FONT_NAME: 5,
  FONT_COLOR_NULL: 6,
  FONT_COLOR: 7,
  SUPERSCRIPT: 10,
  UNDERLINE: 11,
  STRIKETHRU: 12,
  CAPITALIZATION: 13,
  BASELINE_SHIFT: 14,
  KERNING: 15,
  LIGATURES: 16,
  BACKGROUND_COLOR_NULL: 25,
  BACKGROUND_COLOR: 26,
  TRACKING: 27,
} as const;

export const UnderlineType = {
  NONE: 0,
  SINGLE: 1,
  DOUBLE: 2,
  WAVY: 3,
} as const;

/** TSWP.ParagraphStylePropertiesArchive. */
export const ParaProps = {
  ALIGNMENT: 1,
  DEFAULT_TAB_STOPS: 4,
  FILL_NULL: 5,
  FILL: 6,
  FIRST_LINE_INDENT: 7,
  HYPHENATE: 8,
  KEEP_LINES_TOGETHER: 9,
  KEEP_WITH_NEXT: 10,
  LEFT_INDENT: 11,
  LINE_SPACING_NULL: 12,
  LINE_SPACING: 13,
  PAGE_BREAK_BEFORE: 14,
  RIGHT_INDENT: 19,
  SPACE_AFTER: 20,
  SPACE_BEFORE: 21,
  TABS_NULL: 24,
  TABS: 25,
  WIDOW_CONTROL: 26,
  OUTLINE_LEVEL: 27,
  SHOW_IN_TOC: 33,
  WRITING_DIRECTION: 38,
  LIST_STYLE_NULL: 39,
  LIST_STYLE: 40,
  FOLLOWING_STYLE_NULL: 41,
  FOLLOWING_STYLE: 42,
} as const;

export const TextAlignment = {
  LEFT: 0,
  RIGHT: 1,
  CENTER: 2,
  JUSTIFIED: 3,
  NATURAL: 4,
} as const;
export type TextAlignment = (typeof TextAlignment)[keyof typeof TextAlignment];

/** TSWP.LineSpacingArchive. */
export const LineSpacing = { MODE: 1, AMOUNT: 2 } as const;

/** TSS.StylesheetArchive. */
export const StylesheetFields = {
  STYLES: 1,
  IDENTIFIER_TO_STYLE_MAP: 2,
  PARENT: 3,
  IS_LOCKED: 4,
  PARENT_TO_CHILDREN_STYLE_MAP: 5,
  CAN_CULL_STYLES: 6,
  // styles_for_10_0 .. styles_for_14_4 compatibility snapshots.
  VERSIONED_FIRST: 7,
  VERSIONED_LAST: 22,
} as const;
export const IdentifiedStyleEntry = { IDENTIFIER: 1, STYLE: 2 } as const;
export const StyleChildrenEntry = { PARENT: 1, CHILDREN: 2 } as const;
export const VersionedStyles = { STYLES: 1, ID_MAP: 2, CHILDREN_MAP: 3 } as const;

// ------------------------------------------------------------- TSD geometry

/** TSD.DrawableArchive. */
export const Drawable = {
  GEOMETRY: 1,
  PARENT: 2,
  HYPERLINK_URL: 4,
  LOCKED: 5,
  ACCESSIBILITY_DESCRIPTION: 8,
  TITLE: 10,
  CAPTION: 11,
} as const;

/** TSD.GeometryArchive. */
export const Geometry = { POSITION: 1, SIZE: 2, FLAGS: 3, ANGLE: 4 } as const;
/** TSP.Point / TSP.Size. */
export const Point = { X: 1, Y: 2 } as const;
export const SizeFields = { WIDTH: 1, HEIGHT: 2 } as const;

/** TSD.ShapeArchive / TSWP.ShapeInfoArchive-style supers. */
export const Shape = { SUPER: 1, STYLE: 2, PATHSOURCE: 3 } as const;

/** TSWP.DrawableAttachmentArchive (inline attachments). */
export const DrawableAttachment = { DRAWABLE: 1 } as const;

// ------------------------------------------------------------- TSP.Color

export const ColorFields = { MODEL: 1, R: 3, G: 4, B: 5, A: 6 } as const;
export const COLOR_MODEL_RGB = 1;

// ------------------------------------------------------------- helpers

/** Build a TSP.Reference message. */
export function makeRef(id: bigint): RawMessage {
  const m = RawMessage.create();
  m.setVarint(1, id);
  return m;
}

/** Read a TSP.Reference field's identifier. */
export function refId(container: RawMessage | undefined, fieldNo: number): bigint | undefined {
  return container?.getMessage(fieldNo)?.getVarint(1);
}

/** Build an sRGB TSP.Color. */
export function makeColor(r: number, g: number, b: number, a = 1): RawMessage {
  const m = RawMessage.create();
  m.setVarint(ColorFields.MODEL, COLOR_MODEL_RGB);
  m.setFloat(ColorFields.R, r);
  m.setFloat(ColorFields.G, g);
  m.setFloat(ColorFields.B, b);
  m.setFloat(ColorFields.A, a);
  return m;
}

// ------------------------------------------------------- reference extractors

export function pushRef(out: bigint[], container: RawMessage | undefined, fieldNo: number): void {
  if (!container) return;
  for (const ref of container.getMessages(fieldNo)) {
    const id = ref.getVarint(1);
    if (id !== undefined) out.push(id);
  }
}

export const storageExtractor: ReferenceExtractor = (m) => {
  const out: bigint[] = [];
  pushRef(out, m, Storage.STYLE_SHEET);
  for (const tableField of OBJECT_TABLE_FIELDS) {
    const table = m.getMessage(tableField);
    if (!table) continue;
    for (const entry of table.getMessages(ATTR_TABLE_ENTRIES)) {
      pushRef(out, entry, ENTRY_OBJECT);
    }
  }
  for (const tableField of OVERLAP_TABLE_FIELDS) {
    const table = m.getMessage(tableField);
    if (!table) continue;
    for (const entry of table.getMessages(ATTR_TABLE_ENTRIES)) {
      pushRef(out, entry, OVERLAP_FIELD);
    }
  }
  return out;
};

export const stylesheetExtractor: ReferenceExtractor = (m) => {
  const out: bigint[] = [];
  pushRef(out, m, StylesheetFields.STYLES);
  for (const e of m.getMessages(StylesheetFields.IDENTIFIER_TO_STYLE_MAP)) {
    pushRef(out, e, IdentifiedStyleEntry.STYLE);
  }
  pushRef(out, m, StylesheetFields.PARENT);
  for (const e of m.getMessages(StylesheetFields.PARENT_TO_CHILDREN_STYLE_MAP)) {
    pushRef(out, e, StyleChildrenEntry.PARENT);
    pushRef(out, e, StyleChildrenEntry.CHILDREN);
  }
  for (let f = StylesheetFields.VERSIONED_FIRST; f <= StylesheetFields.VERSIONED_LAST; f++) {
    const vs = m.getMessage(f);
    if (!vs) continue;
    pushRef(out, vs, VersionedStyles.STYLES);
    for (const e of vs.getMessages(VersionedStyles.ID_MAP)) {
      pushRef(out, e, IdentifiedStyleEntry.STYLE);
    }
    for (const e of vs.getMessages(VersionedStyles.CHILDREN_MAP)) {
      pushRef(out, e, StyleChildrenEntry.PARENT);
      pushRef(out, e, StyleChildrenEntry.CHILDREN);
    }
  }
  return out;
};

export const styleExtractor: ReferenceExtractor = (m) => {
  const out: bigint[] = [];
  const sup = m.getMessage(StyleArchive.SUPER);
  pushRef(out, sup, StyleSuper.PARENT);
  pushRef(out, sup, StyleSuper.STYLESHEET);
  const para = m.getMessage(StyleArchive.PARA_PROPERTIES);
  pushRef(out, para, ParaProps.LIST_STYLE);
  pushRef(out, para, ParaProps.FOLLOWING_STYLE);
  return out;
};

/** Extractors for the shared families; app modules extend this map. */
export const SHARED_REFERENCE_EXTRACTORS: ReadonlyMap<number, ReferenceExtractor> = new Map([
  [SHARED_TYPE.TSWP_STORAGE, storageExtractor],
  [SHARED_TYPE.TSS_STYLESHEET, stylesheetExtractor],
  [SHARED_TYPE.TSWP_PARAGRAPH_STYLE, styleExtractor],
  [SHARED_TYPE.TSWP_CHARACTER_STYLE, styleExtractor],
  [SHARED_TYPE.TSWP_LIST_STYLE, styleExtractor],
  [SHARED_TYPE.TSWP_COLUMN_STYLE, styleExtractor],
]);
