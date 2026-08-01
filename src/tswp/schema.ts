/**
 * TSWP family — the word-processing layer shared by all apps: text storages
 * with their attribute tables, concrete text styles and their property
 * bags, smart fields (links, bookmarks), and attachments. Field numbers
 * from proto/current/TSWPArchives.proto.
 */
import type { ReferenceExtractor } from "../tsp/store.ts";
import { pushRef } from "../tsp/schema.ts";

export const TSWP_TYPE = {
  STORAGE: 2001,
  DRAWABLE_ATTACHMENT: 2003,
  FOOTNOTE_REF_ATTACHMENT: 2008,
  SHAPE_INFO: 2011,
  HIGHLIGHT: 2013,
  CHARACTER_STYLE: 2021,
  PARAGRAPH_STYLE: 2022,
  LIST_STYLE: 2023,
  COLUMN_STYLE: 2024,
  HYPERLINK_FIELD: 2032,
  BOOKMARK_FIELD: 2035,
} as const;

// ------------------------------------------------------------- StorageArchive

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

/**
 * U+FFFC OBJECT REPLACEMENT CHARACTER — anchors entries of
 * `table_attachment` (inline drawables, TOC and page-number attachments).
 */
export const ATTACHMENT_CHAR = "\uFFFC";

/**
 * U+000E SHIFT OUT — the character `table_footnote` entries anchor at.
 *
 * Footnote references do NOT use U+FFFC; that is reserved for the
 * attachment table. Verified against a document with 8 real footnotes,
 * where the U+FFFC count matched the attachment table exactly and every
 * footnote anchor landed on U+000E.
 */
export const FOOTNOTE_MARK_CHAR = "\u000E";

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
 * Point-anchored object tables: an entry names the single character it
 * occupies, rather than starting a run that continues to the next entry.
 *
 * Every one of these anchors something at a U+FFFC placeholder — an
 * attachment, a footnote mark, a section break. The distinction matters
 * when text is deleted: an entry exactly at the start of a deleted range is
 * a run boundary that should survive in a run table, and the anchor of a
 * character that no longer exists in one of these.
 */
export const POINT_ANCHORED_OBJECT_TABLES: readonly number[] = [
  Storage.TABLE_ATTACHMENT,
  Storage.TABLE_FOOTNOTE,
  Storage.TABLE_SECTION,
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

// ------------------------------------------------------------------- styles

/** Concrete style archives (TSWP.*StyleArchive) embed TSS.StyleArchive at 1. */
export const StyleArchive = {
  SUPER: 1,
  OVERRIDE_COUNT: 10,
  CHAR_PROPERTIES: 11, // ParagraphStyleArchive + CharacterStyleArchive
  PARA_PROPERTIES: 12, // ParagraphStyleArchive only
} as const;

/**
 * TSWP.CharacterStylePropertiesArchive.
 *
 * The `*_NULL` booleans are how a *child* style says "clear the inherited
 * value" as opposed to "inherit it": the value field is absent and the null
 * flag is true. Setting the value field and the null flag together is
 * contradictory, so writers must clear the flag whenever they set a value.
 */
export const CharProps = {
  BOLD: 1,
  ITALIC: 2,
  FONT_SIZE: 3,
  FONT_NAME_NULL: 4,
  FONT_NAME: 5,
  FONT_COLOR_NULL: 6,
  /**
   * `tsd_fill` — where modern Pages actually reads text colour from.
   *
   * `font_color` (7) alone is not enough. A character style carrying only
   * field 7 renders in the inherited colour: bold applies, red does not,
   * and nothing about the file is malformed. Every colour-carrying style
   * written by a recent Pages — including the newest writer in the corpus
   * — carries both, the fill holding a plain `{ color }`.
   */
  TSD_FILL: 46,
  TSD_FILL_NULL: 45,
  FONT_COLOR: 7,
  LANGUAGE_NULL: 8,
  LANGUAGE: 9,
  SUPERSCRIPT: 10,
  UNDERLINE: 11,
  STRIKETHRU: 12,
  CAPITALIZATION: 13,
  BASELINE_SHIFT: 14,
  KERNING: 15,
  LIGATURES: 16,
  OUTLINE_COLOR_NULL: 17,
  OUTLINE_COLOR: 18,
  OUTLINE: 19,
  SHADOW_NULL: 20,
  SHADOW: 21,
  STRIKETHRU_COLOR_NULL: 22,
  STRIKETHRU_COLOR: 23,
  STRIKETHRU_WIDTH: 24,
  BACKGROUND_COLOR_NULL: 25,
  BACKGROUND_COLOR: 26,
  TRACKING: 27,
  UNDERLINE_COLOR_NULL: 28,
  UNDERLINE_COLOR: 29,
  UNDERLINE_WIDTH: 30,
  WORD_STRIKETHRU: 31,
  WORD_UNDERLINE: 32,
} as const;

export const UnderlineType = {
  NONE: 0,
  SINGLE: 1,
  DOUBLE: 2,
  WAVY: 3,
} as const;

export const StrikethruType = {
  NONE: 0,
  SINGLE: 1,
  DOUBLE: 2,
  TRIPLE: 3,
} as const;

/** Capitalization is a rendering transform; the stored text is unchanged. */
export const Capitalization = {
  NONE: 0,
  ALL_CAPS: 1,
  SMALL_CAPS: 2,
  TITLE_CASE: 3,
} as const;

export const Ligatures = { REQUIRED: 0, STANDARD: 1, ALL: 2 } as const;

export const ScriptPosition = { NORMAL: 0, SUPERSCRIPT: 1, SUBSCRIPT: 2 } as const;

/**
 * TSWP.ParagraphStylePropertiesArchive.
 *
 * Note `FILL` is a bare `TSP.Color`, *not* a `TSD.FillArchive` — a paragraph
 * background can only be a flat colour, never a gradient or image. The
 * paragraph rule/border is a `TSD.StrokeArchive` at `STROKE`, positioned by
 * `BORDER_POSITIONS`.
 */
export const ParaProps = {
  ALIGNMENT: 1,
  DECIMAL_TAB_NULL: 2,
  DECIMAL_TAB: 3,
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
  RULE_WIDTH: 18,
  RIGHT_INDENT: 19,
  SPACE_AFTER: 20,
  SPACE_BEFORE: 21,
  TABS_NULL: 24,
  TABS: 25,
  WIDOW_CONTROL: 26,
  OUTLINE_LEVEL: 27,
  STROKE_NULL: 31,
  STROKE: 32,
  SHOW_IN_TOC: 33,
  WRITING_DIRECTION: 38,
  LIST_STYLE_NULL: 39,
  LIST_STYLE: 40,
  FOLLOWING_STYLE_NULL: 41,
  FOLLOWING_STYLE: 42,
  SHOW_IN_BOOKMARKS_LIST: 43,
  SHOW_IN_TOC_NAVIGATOR: 44,
  BORDER_POSITIONS: 45,
  ROUNDED_CORNERS: 46,
} as const;

/**
 * `ParagraphStylePropertiesArchive.border_positions` — which edges draw.
 *
 * **Partly measured, partly inferred, and the inferred half is suspect.**
 *
 * What the corpus establishes: **0 is "none"**. 4208 paragraph styles carry
 * position 0 with no stroke at all, and a further 127 carry 0 *with* a
 * stroke — a border configured and switched off, which is what Pages leaves
 * behind when you clear one.
 *
 * What it does not establish: which edge 1 and 2 mean. Only four styles in
 * the whole corpus use a non-zero position — three "Heading 3" and one
 * "Title", all inheriting from Apple's stock templates — so there is one
 * effective data point per value and no way to tell an edge apart without
 * rendering. **1 and 2 could be the other way round**, and 3 and 4 are not
 * observed at all; they follow the five choices in the Pages inspector
 * (none / top / bottom / top and bottom / all) and the deprecated enum's
 * shape.
 *
 * Read the raw integer, not this enum, if the distinction matters to you.
 * Protocol 2 in `docs/MANUAL-WORK.md` settles it in about ten minutes.
 */
export const BorderPosition = {
  NONE: 0,
  TOP: 1,
  BOTTOM: 2,
  TOP_AND_BOTTOM: 3,
  ALL: 4,
} as const;

/** TSWP.TabsArchive: repeated TabArchive at 1. */
export const TabsArchive = { TABS: 1 } as const;
/** TSWP.TabArchive. */
export const TabArchive = { POSITION: 1, ALIGNMENT: 2, LEADER: 3 } as const;
export const TabAlignment = { LEFT: 0, CENTER: 1, RIGHT: 2, DECIMAL: 3 } as const;

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

/** TSWP.ListStyleArchive value fields (beyond the StyleArchive shell). */
export const ListStyleFields = {
  LABEL_TYPES: 11, // repeated LabelType: 0 none, 1 image, 2 string, 3 number
  TEXT_INDENTS: 12, // repeated float
  INDENTS: 13, // repeated float
  GEOMETRIES: 14,
  NUMBER_TYPES: 15, // repeated NumberType: 0 = "1." decimal…
  STRINGS: 16, // repeated string (bullet characters)
} as const;
export const ListLabelType = { NONE: 0, IMAGE: 1, STRING: 2, NUMBER: 3 } as const;

// ------------------------------------------------------- fields & attachments

/** TSWP.SmartFieldArchive (embedded as super=1 of concrete fields). */
export const SmartField = { UUID_STRING: 1 } as const;
/** TSWP.HyperlinkFieldArchive: super = 1, url_ref = 2. */
export const HyperlinkField = { SUPER: 1, URL_REF: 2 } as const;
/** TSWP.BookmarkFieldArchive: super = 1, name = 2, ranged = 3, hidden = 4. */
export const BookmarkField = { SUPER: 1, NAME: 2, RANGED: 3, HIDDEN: 4 } as const;
/** TSWP.DrawableAttachmentArchive: drawable = 1. */
export const DrawableAttachment = { DRAWABLE: 1 } as const;
/** TSWP.FootnoteReferenceAttachmentArchive: super = 1, contained_storage = 2, custom_mark_string = 3. */
export const FootnoteRefAttachment = { SUPER: 1, CONTAINED_STORAGE: 2, CUSTOM_MARK: 3 } as const;
/** TSWP.HighlightArchive (comment anchor): commentStorage = 1. */
export const Highlight = { COMMENT_STORAGE: 1 } as const;
/**
 * TSWP.ShapeInfoArchive (text boxes & shapes with text): super = 1
 * (TSD.ShapeArchive), text_flow = 3, owned_storage = 4 (→ StorageArchive),
 * is_text_box = 6.
 */
export const ShapeInfo = { SUPER: 1, TEXT_FLOW: 3, OWNED_STORAGE: 4, IS_TEXT_BOX: 6 } as const;

// ------------------------------------------------------- reference extractors

export const storageExtractor: ReferenceExtractor = (m) => {
  const out: bigint[] = [];
  // **Not `style_sheet`.** A storage points at its stylesheet through field
  // 2, and Apple never declares that in `object_references`: across every
  // fixture here, 2676 storages carry the field and none of them list it.
  // What they list is the concrete styles the run tables resolve to — the
  // paragraph, list and column styles — plus same-component placeholders.
  //
  // Declaring it anyway is not inert. Pages opens such a document, keeps
  // the text, and renders the whole body unstyled: the storage's own
  // paragraph styling silently stops applying. Nothing is malformed, the
  // reference is real, the target exists, and every offline check passes.
  // It cost six rounds in the app to find, because the symptom appears on
  // any edit at all — the declaration is rewritten whenever the archive is
  // re-serialized, so a one-character change triggers it as surely as
  // appending a paragraph.
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

export const styleExtractor: ReferenceExtractor = (m) => {
  const out: bigint[] = [];
  const sup = m.getMessage(StyleArchive.SUPER);
  pushRef(out, sup, 3); // TSS.StyleArchive.parent
  // Not field 5, the owning stylesheet — see storageExtractor. The same
  // rule holds here: Apple declares what a style *resolves through* (its
  // parent, its list style, its following style) and never the stylesheet
  // that contains it.
  const para = m.getMessage(StyleArchive.PARA_PROPERTIES);
  pushRef(out, para, ParaProps.LIST_STYLE);
  pushRef(out, para, ParaProps.FOLLOWING_STYLE);
  return out;
};

/** Hyperlink/bookmark fields reference nothing; attachments reference a drawable. */
export const drawableAttachmentExtractor: ReferenceExtractor = (m) => {
  const out: bigint[] = [];
  pushRef(out, m, DrawableAttachment.DRAWABLE);
  return out;
};

/** Extractors for TSWP-owned archive types. */
export const TSWP_REFERENCE_EXTRACTORS: ReadonlyMap<number, ReferenceExtractor> = new Map([
  [TSWP_TYPE.STORAGE, storageExtractor],
  [TSWP_TYPE.PARAGRAPH_STYLE, styleExtractor],
  [TSWP_TYPE.CHARACTER_STYLE, styleExtractor],
  [TSWP_TYPE.LIST_STYLE, styleExtractor],
  [TSWP_TYPE.COLUMN_STYLE, styleExtractor],
  [TSWP_TYPE.DRAWABLE_ATTACHMENT, drawableAttachmentExtractor],
  [TSWP_TYPE.HYPERLINK_FIELD, () => []],
]);
