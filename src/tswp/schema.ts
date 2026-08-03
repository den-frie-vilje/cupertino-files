/**
 * TSWP family — the word-processing layer shared by all apps: text storages
 * with their attribute tables, concrete text styles and their property
 * bags, smart fields (links, bookmarks), and attachments. Field numbers
 * from proto/current/TSWPArchives.proto.
 */
import { protoEnum, protoFields } from "../proto/fields.ts";
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

export const Storage = protoFields("TSWP.StorageArchive", {
  KIND: "kind",
  STYLE_SHEET: "style_sheet",
  TEXT: "text",
  HAS_ITEXT: "has_itext",
  TABLE_PARA_STYLE: "table_para_style",
  TABLE_PARA_DATA: "table_para_data",
  TABLE_LIST_STYLE: "table_list_style",
  TABLE_CHAR_STYLE: "table_char_style",
  TABLE_ATTACHMENT: "table_attachment",
  IN_DOCUMENT: "in_document",
  TABLE_SMARTFIELD: "table_smartfield",
  TABLE_LAYOUT_STYLE: "table_layout_style",
  TABLE_PARA_STARTS: "table_para_starts",
  TABLE_BOOKMARK: "table_bookmark",
  TABLE_FOOTNOTE: "table_footnote",
  TABLE_SECTION: "table_section",
  TABLE_RUBYFIELD: "table_rubyfield",
  TABLE_LANGUAGE: "table_language",
  TABLE_DICTATION: "table_dictation",
  TABLE_INSERTION: "table_insertion",
  TABLE_DELETION: "table_deletion",
  TABLE_HIGHLIGHT: "table_highlight",
  TABLE_PARA_BIDI: "table_para_bidi",
  TABLE_OVERLAPPING_HIGHLIGHT: "table_overlapping_highlight",
  TABLE_PENCIL_ANNOTATION: "table_pencil_annotation",
  TABLE_TATECHUYOKO: "table_tatechuyoko",
  TABLE_DROP_CAP_STYLE: "table_drop_cap_style",
});

export const StorageKind = protoEnum("TSWP.StorageArchive.KindType", {
  BODY: "BODY",
  HEADER: "HEADER",
  FOOTNOTE: "FOOTNOTE",
  TEXTBOX: "TEXTBOX",
  NOTE: "NOTE",
  CELL: "CELL",
  UNCLASSIFIED: "UNCLASSIFIED",
  TABLEOFCONTENTS: "TABLEOFCONTENTS",
  UNDEFINED: "UNDEFINED",
});
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
export const StyleArchive = protoFields("TSWP.ParagraphStyleArchive", {
  SUPER: "super",
  OVERRIDE_COUNT: "override_count",
  CHAR_PROPERTIES: "char_properties", // ParagraphStyleArchive + CharacterStyleArchive
  PARA_PROPERTIES: "para_properties", // ParagraphStyleArchive only
});

/**
 * TSWP.CharacterStylePropertiesArchive.
 *
 * The `*_NULL` booleans are how a *child* style says "clear the inherited
 * value" as opposed to "inherit it": the value field is absent and the null
 * flag is true. Setting the value field and the null flag together is
 * contradictory, so writers must clear the flag whenever they set a value.
 */
export const CharProps = protoFields("TSWP.CharacterStylePropertiesArchive", {
  BOLD: "bold",
  ITALIC: "italic",
  FONT_SIZE: "font_size",
  FONT_NAME_NULL: "font_name_null",
  FONT_NAME: "font_name",
  FONT_COLOR_NULL: "font_color_null",
  /**
   * `tsd_fill` — where modern Pages actually reads text colour from.
   *
   * `font_color` (7) alone is not enough. A character style carrying only
   * field 7 renders in the inherited colour: bold applies, red does not,
   * and nothing about the file is malformed. Every colour-carrying style
   * written by a recent Pages — including the newest writer in the corpus
   * — carries both, the fill holding a plain `{ color }`.
   */
  TSD_FILL: "tsd_fill",
  TSD_FILL_NULL: "tsd_fill_null",
  FONT_COLOR: "font_color",
  LANGUAGE_NULL: "language_null",
  LANGUAGE: "language",
  SUPERSCRIPT: "superscript",
  UNDERLINE: "underline",
  STRIKETHRU: "strikethru",
  CAPITALIZATION: "capitalization",
  BASELINE_SHIFT: "baseline_shift",
  KERNING: "kerning",
  LIGATURES: "ligatures",
  OUTLINE_COLOR_NULL: "outline_color_null",
  OUTLINE_COLOR: "outline_color",
  OUTLINE: "outline",
  SHADOW_NULL: "shadow_null",
  SHADOW: "shadow",
  STRIKETHRU_COLOR_NULL: "strikethru_color_null",
  STRIKETHRU_COLOR: "strikethru_color",
  STRIKETHRU_WIDTH: "strikethru_width",
  BACKGROUND_COLOR_NULL: "background_color_null",
  BACKGROUND_COLOR: "background_color",
  TRACKING: "tracking",
  UNDERLINE_COLOR_NULL: "underline_color_null",
  UNDERLINE_COLOR: "underline_color",
  UNDERLINE_WIDTH: "underline_width",
  WORD_STRIKETHRU: "word_strikethru",
  WORD_UNDERLINE: "word_underline",
});

export const UnderlineType = protoEnum("TSWP.CharacterStylePropertiesArchive.UnderlineType", {
  NONE: "kNoUnderline",
  SINGLE: "kSingleUnderline",
  DOUBLE: "kDoubleUnderline",
  WAVY: "kWavyUnderline",
});

export const StrikethruType = protoEnum("TSWP.CharacterStylePropertiesArchive.StrikethruType", {
  NONE: "kNoStrikethru",
  SINGLE: "kSingleStrikethru",
  DOUBLE: "kDoubleStrikethru",
  TRIPLE: "kTripleStrikethru",
});

/** Capitalization is a rendering transform; the stored text is unchanged. */
export const Capitalization = protoEnum("TSWP.CharacterStylePropertiesArchive.CapitalizationType", {
  NONE: "kNoCaps",
  ALL_CAPS: "kAllCaps",
  SMALL_CAPS: "kSmallCaps",
  TITLE_CASE: "kTitled",
});

export const Ligatures = protoEnum("TSWP.CharacterStylePropertiesArchive.LigaturesType", { REQUIRED: "kRequiredLigatures", STANDARD: "kStandardLigatures", ALL: "kAllLigatures" });

export const ScriptPosition = protoEnum("TSWP.CharacterStylePropertiesArchive.SuperscriptType", { NORMAL: "kNoScript", SUPERSCRIPT: "kSuperscript", SUBSCRIPT: "kSubscript" });

/**
 * TSWP.ParagraphStylePropertiesArchive.
 *
 * Note `FILL` is a bare `TSP.Color`, *not* a `TSD.FillArchive` — a paragraph
 * background can only be a flat colour, never a gradient or image. The
 * paragraph rule/border is a `TSD.StrokeArchive` at `STROKE`, positioned by
 * `BORDER_POSITIONS`.
 */
export const ParaProps = protoFields("TSWP.ParagraphStylePropertiesArchive", {
  ALIGNMENT: "alignment",
  DECIMAL_TAB_NULL: "decimal_tab_null",
  DECIMAL_TAB: "decimal_tab",
  DEFAULT_TAB_STOPS: "default_tab_stops",
  FILL_NULL: "fill_null",
  FILL: "fill",
  FIRST_LINE_INDENT: "first_line_indent",
  HYPHENATE: "hyphenate",
  KEEP_LINES_TOGETHER: "keep_lines_together",
  KEEP_WITH_NEXT: "keep_with_next",
  LEFT_INDENT: "left_indent",
  LINE_SPACING_NULL: "line_spacing_null",
  LINE_SPACING: "line_spacing",
  PAGE_BREAK_BEFORE: "page_break_before",
  RULE_WIDTH: "rule_width",
  RIGHT_INDENT: "right_indent",
  SPACE_AFTER: "space_after",
  SPACE_BEFORE: "space_before",
  TABS_NULL: "tabs_null",
  TABS: "tabs",
  WIDOW_CONTROL: "widow_control",
  OUTLINE_LEVEL: "outline_level",
  STROKE_NULL: "stroke_null",
  STROKE: "stroke",
  SHOW_IN_TOC: "show_in_toc",
  WRITING_DIRECTION: "writing_direction",
  LIST_STYLE_NULL: "list_style_null",
  LIST_STYLE: "list_style",
  FOLLOWING_STYLE_NULL: "following_style_null",
  FOLLOWING_STYLE: "following_style",
  SHOW_IN_BOOKMARKS_LIST: "show_in_bookmarks_list",
  SHOW_IN_TOC_NAVIGATOR: "show_in_toc_navigator",
  BORDER_POSITIONS: "border_positions",
  ROUNDED_CORNERS: "rounded_corners",
});

/**
 * `ParagraphStylePropertiesArchive.border_positions` — which edges draw.
 *
 * **A bitmask, measured 2026-08-03** from a document authored for exactly
 * this question (the seed-borders errand; ledger in docs/BLOCKERS.md): a
 * person gave four paragraphs top-only, bottom-only, top-and-bottom, and
 * all-four borders in Pages, and the saved file carries **1, 2, 3, 15**
 * in that order. Bit 1 is top and bit 2 is bottom; 3 being their union is
 * what proves these are flags, not an enum; 15 adds two bits for the
 * vertical edges. The corpus's 4335 styles had only established that 0 is
 * "none" (4208 with no stroke, 127 with a configured-but-off stroke) —
 * and the previous guess, an enum with ALL = 4, would have drawn a single
 * vertical edge where a box was meant.
 *
 * Still open: which of bits 4 and 8 is left and which is right — nothing
 * observed uses them separately, so the names say exactly that. "Left"
 * itself is also unproven: the pair could be logical (leading/trailing),
 * flipping sides in a right-to-left paragraph. The follow-up seed — a
 * left-only, a right-only, and an RTL paragraph bordered on the same
 * visual side as the first — settles both questions in one run.
 */
export const BorderPosition = {
  NONE: 0,
  TOP: 1,
  BOTTOM: 2,
  TOP_AND_BOTTOM: 3,
  /** One vertical edge, side unmeasured — see the docblock. */
  VERTICAL_BIT_A: 4,
  /** The other vertical edge, side unmeasured — see the docblock. */
  VERTICAL_BIT_B: 8,
  ALL: 15,
} as const;

/** TSWP.TabsArchive: repeated TabArchive at 1. */
export const TabsArchive = protoFields("TSWP.TabsArchive", { TABS: "tabs" });
/** TSWP.TabArchive. */
export const TabArchive = protoFields("TSWP.TabArchive", { POSITION: "position", ALIGNMENT: "alignment", LEADER: "leader" });
export const TabAlignment = protoEnum("TSWP.TabArchive.TabAlignmentType", { LEFT: "kTabAlignmentLeft", CENTER: "kTabAlignmentCenter", RIGHT: "kTabAlignmentRight", DECIMAL: "kTabAlignmentDecimal" });

export const TextAlignment = protoEnum("TSWP.ParagraphStylePropertiesArchive.TextAlignmentType", {
  LEFT: "TATvalue0",
  RIGHT: "TATvalue1",
  CENTER: "TATvalue2",
  JUSTIFIED: "TATvalue3",
  NATURAL: "TATvalue4",
});
export type TextAlignment = (typeof TextAlignment)[keyof typeof TextAlignment];

/** TSWP.LineSpacingArchive. */
export const LineSpacing = protoFields("TSWP.LineSpacingArchive", { MODE: "mode", AMOUNT: "amount" });

/** TSWP.ListStyleArchive value fields (beyond the StyleArchive shell). */
export const ListStyleFields = protoFields("TSWP.ListStyleArchive", {
  LABEL_TYPES: "label_types", // repeated LabelType: 0 none, 1 image, 2 string, 3 number
  TEXT_INDENTS: "text_indents", // repeated float
  INDENTS: "indents", // repeated float
  GEOMETRIES: "geometries",
  NUMBER_TYPES: "number_types", // repeated NumberType: 0 = "1." decimal…
  STRINGS: "strings", // repeated string (bullet characters)
});
export const ListLabelType = protoEnum("TSWP.ListStyleArchive.LabelType", { NONE: "kNone", IMAGE: "kImage", STRING: "kString", NUMBER: "kNumber" });

// ------------------------------------------------------- fields & attachments

/** TSWP.SmartFieldArchive (embedded as super=1 of concrete fields). */
export const SmartField = protoFields("TSWP.SmartFieldArchive", { UUID_STRING: "text_attribute_uuid_string" });
/** TSWP.HyperlinkFieldArchive: super = 1, url_ref = 2. */
export const HyperlinkField = protoFields("TSWP.HyperlinkFieldArchive", { SUPER: "super", URL_REF: "url_ref" });
/** TSWP.BookmarkFieldArchive: super = 1, name = 2, ranged = 3, hidden = 4. */
export const BookmarkField = protoFields("TSWP.BookmarkFieldArchive", { SUPER: "super", NAME: "name", RANGED: "ranged", HIDDEN: "hidden" });
/** TSWP.DrawableAttachmentArchive: drawable = 1. */
/**
 * TSWP.DrawableAttachmentArchive — an inline drawable's anchor.
 *
 * All four offset fields are present on 101 of 101 corpus attachments, and
 * zero is the common value (`h_offset` 0 in 50, `v_offset_type` 0 in 92).
 * They are `optional`, so omitting them is well-formed; whether Pages reads
 * an absent offset as zero or as "no placement" is the question the inline
 * image rung asks.
 */
export const DrawableAttachment = protoFields("TSWP.DrawableAttachmentArchive", {
  DRAWABLE: "drawable",
  H_OFFSET_TYPE: "h_offset_type",
  H_OFFSET: "h_offset",
  V_OFFSET_TYPE: "v_offset_type",
  V_OFFSET: "v_offset",
});
/** TSWP.FootnoteReferenceAttachmentArchive: super = 1, contained_storage = 2, custom_mark_string = 3. */
export const FootnoteRefAttachment = protoFields("TSWP.FootnoteReferenceAttachmentArchive", { SUPER: "super", CONTAINED_STORAGE: "contained_storage", CUSTOM_MARK: "custom_mark_string" });
/** TSWP.HighlightArchive (comment anchor): commentStorage = 1. */
export const Highlight = protoFields("TSWP.HighlightArchive", { COMMENT_STORAGE: "commentStorage" });
/**
 * TSWP.ShapeInfoArchive (text boxes & shapes with text): super = 1
 * (TSD.ShapeArchive), text_flow = 3, owned_storage = 4 (→ StorageArchive),
 * is_text_box = 6.
 */
export const ShapeInfo = protoFields("TSWP.ShapeInfoArchive", { SUPER: "super", TEXT_FLOW: "text_flow", OWNED_STORAGE: "owned_storage", IS_TEXT_BOX: "is_text_box" });

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
