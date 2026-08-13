/**
 * TST styling: cell styles (fill, four borders, padding, alignment) and
 * table styles (banded rows, grid strokes, visibility toggles).
 *
 * Both are ordinary `TSS.StyleArchive` subclasses, so they inherit the
 * name/identifier/parent machinery from {@link StylesheetModel}; only the
 * property bag differs. The values themselves are the shared TSD ones —
 * a cell border is the same `TSD.StrokeArchive` as a paragraph rule or a
 * shape outline, which is why they live in `tsd/style.ts` and not here.
 */
import { protoFields } from "../proto/fields.ts";
import { RawMessage } from "../base/protobuf.ts";
import type { IwaObject } from "../tsp/iwa.ts";
import type { ObjectStore } from "../tsp/store.ts";
import type { Fill, Padding, Stroke } from "../tsd/style.ts";
import type { TextAlignment } from "../tswp/schema.ts";
import type { TextAlignmentName } from "../tss/stylesheet.ts";
import { readFill, readPadding, readStroke, writeFill, writePadding, writeStroke } from "../tsd/style.ts";
/**
 * Both TST style archives put their property bag at field 11 — the same
 * number TSWP uses for character properties, but a different message.
 * Naming it separately keeps that coincidence from reading as reuse.
 */
const STYLE_PROPERTIES = 11;
const STYLE_OVERRIDE_COUNT = 10;

/** TST style archive type ids. */
export const TST_STYLE_TYPE = {
  TABLE_STYLE: 6003,
  CELL_STYLE: 6004,
  DATA_LIST: 6005,
} as const;

/** TST.CellStylePropertiesArchive. */
export const CellStyleProps = protoFields("TST.CellStylePropertiesArchive", {
  CELL_FILL: "cell_fill",
  TEXT_WRAP: "text_wrap",
  VERTICAL_ALIGNMENT: "vertical_alignment",
  PADDING: "padding",
  TOP_STROKE: "top_stroke",
  RIGHT_STROKE: "right_stroke",
  BOTTOM_STROKE: "bottom_stroke",
  LEFT_STROKE: "left_stroke",
});

export const VerticalAlignment = { TOP: 0, MIDDLE: 1, BOTTOM: 2 } as const;

/** TST.TableStylePropertiesArchive (the fields worth modelling). */
export const TableStyleProps = protoFields("TST.TableStylePropertiesArchive", {
  BANDED_ROWS: "banded_rows",
  BANDED_FILL: "banded_fill",
  BEHAVES_LIKE_SPREADSHEET: "behaves_like_spreadsheet",
  AUTO_RESIZE: "auto_resize",
  VERTICAL_STROKES_VISIBLE: "v_strokes_visible",
  HORIZONTAL_STROKES_VISIBLE: "h_strokes_visible",
  HEADER_ROW_SEPARATOR_VISIBLE: "hr_separator_visible",
  HEADER_COLUMN_SEPARATOR_VISIBLE: "hc_separator_visible",
  FOOTER_SEPARATOR_VISIBLE: "footer_separator_visible",
  TABLE_BORDER_VISIBLE: "table_border_visible",
  TABLE_HEADER_BORDER_VISIBLE: "table_header_border_visible",
  MASTER_FONT_FAMILY: "master_font_family",
  WRITING_DIRECTION: "writing_direction",
  HEADER_COLUMN_DIVIDER_VISIBLE: "table_hc_divider_visible",
  HEADER_ROW_DIVIDER_VISIBLE: "table_hr_divider_visible",
  FOOTER_DIVIDER_VISIBLE: "table_footer_divider_visible",
  HEADER_ROW_SEPARATOR_STROKE: "header_row_separator_stroke",
  HEADER_ROW_BORDER_STROKE: "header_row_border_stroke",
  HEADER_ROW_HORIZONTAL_STROKE: "header_row_horizontal_stroke",
  HEADER_ROW_VERTICAL_STROKE: "header_row_vertical_stroke",
  HEADER_COLUMN_BORDER_STROKE: "header_column_border_stroke",
  HEADER_COLUMN_SEPARATOR_STROKE: "header_column_separator_stroke",
  HEADER_COLUMN_HORIZONTAL_STROKE: "header_column_horizontal_stroke",
  HEADER_COLUMN_VERTICAL_STROKE: "header_column_vertical_stroke",
  FOOTER_ROW_SEPARATOR_STROKE: "footer_row_separator_stroke",
  FOOTER_ROW_BORDER_STROKE: "footer_row_border_stroke",
  FOOTER_ROW_HORIZONTAL_STROKE: "footer_row_horizontal_stroke",
  FOOTER_ROW_VERTICAL_STROKE: "footer_row_vertical_stroke",
  BODY_HORIZONTAL_BORDER_STROKE: "table_body_horizontal_border_stroke",
  BODY_VERTICAL_BORDER_STROKE: "table_body_vertical_border_stroke",
  BODY_HORIZONTAL_STROKE: "table_body_horizontal_stroke",
  BODY_VERTICAL_STROKE: "table_body_vertical_stroke",
});

/** The four sides of a cell, in the order Apple numbers them. */
export const CELL_BORDER_FIELDS = [
  ["top", CellStyleProps.TOP_STROKE],
  ["right", CellStyleProps.RIGHT_STROKE],
  ["bottom", CellStyleProps.BOTTOM_STROKE],
  ["left", CellStyleProps.LEFT_STROKE],
] as const;

export interface CellBorders {
  top?: Stroke;
  right?: Stroke;
  bottom?: Stroke;
  left?: Stroke;
}

export interface CellFormatting {
  /** Background: a colour, gradient or image. */
  fill?: Fill;
  /** Per-side borders. A side set to `null` removes that border. */
  borders?: { [K in keyof CellBorders]: Stroke | null };
  padding?: Padding;
  /** 0 top, 1 middle, 2 bottom — see {@link VerticalAlignment}. */
  verticalAlignment?: number;
  /**
   * Horizontal alignment of the cell's text — a `TextAlignment` value or
   * its name. Rides the text layer: the cell gets an anonymous paragraph
   * style carrying the alignment, which is where the corpus keeps it.
   * `null` drops the cell's own text style so the band default applies.
   */
  horizontalAlignment?: TextAlignment | TextAlignmentName | null;
  /** Wrap text within the cell rather than clipping it. */
  textWrap?: boolean;
}

/**
 * Table-level formatting, mirroring `TST.TableStylePropertiesArchive`.
 *
 * Every key is three-state: a value sets the field, `undefined` leaves it
 * as it is, and `null` removes it so the style inherits again — absent is
 * not false, and a bag that never states a field defers to its parent.
 * The divider flags and every band stroke here are corpus-standard: 286
 * of 302 table-style bags carry each of them.
 */
export interface TableFormatting {
  bandedRows?: boolean | null;
  bandedFill?: Fill | null;
  /** Show the vertical grid lines of the table body. */
  verticalStrokesVisible?: boolean | null;
  horizontalStrokesVisible?: boolean | null;
  tableBorderVisible?: boolean | null;
  /** Border around the header bands, the inspector's second outline toggle. */
  tableHeaderBorderVisible?: boolean | null;
  headerRowSeparatorVisible?: boolean | null;
  headerColumnSeparatorVisible?: boolean | null;
  footerSeparatorVisible?: boolean | null;
  /** The divider between header columns and body. */
  headerColumnDividerVisible?: boolean | null;
  /** The divider between header rows and body. */
  headerRowDividerVisible?: boolean | null;
  footerDividerVisible?: boolean | null;
  /** Grid line drawn between body rows. */
  bodyHorizontalStroke?: Stroke | null;
  /** Grid line drawn between body columns. */
  bodyVerticalStroke?: Stroke | null;
  /** Outer border of the table body. */
  bodyBorderStroke?: Stroke | null;
  headerRowSeparatorStroke?: Stroke | null;
  headerRowBorderStroke?: Stroke | null;
  headerRowHorizontalStroke?: Stroke | null;
  headerRowVerticalStroke?: Stroke | null;
  headerColumnBorderStroke?: Stroke | null;
  headerColumnSeparatorStroke?: Stroke | null;
  headerColumnHorizontalStroke?: Stroke | null;
  headerColumnVerticalStroke?: Stroke | null;
  footerRowSeparatorStroke?: Stroke | null;
  footerRowBorderStroke?: Stroke | null;
  footerRowHorizontalStroke?: Stroke | null;
  footerRowVerticalStroke?: Stroke | null;
  behavesLikeSpreadsheet?: boolean | null;
  autoResize?: boolean | null;
}

/** The boolean keys of {@link TableFormatting}, with their fields. */
const TABLE_BOOL_FIELDS = [
  ["bandedRows", TableStyleProps.BANDED_ROWS],
  ["verticalStrokesVisible", TableStyleProps.VERTICAL_STROKES_VISIBLE],
  ["horizontalStrokesVisible", TableStyleProps.HORIZONTAL_STROKES_VISIBLE],
  ["tableBorderVisible", TableStyleProps.TABLE_BORDER_VISIBLE],
  ["tableHeaderBorderVisible", TableStyleProps.TABLE_HEADER_BORDER_VISIBLE],
  ["headerRowSeparatorVisible", TableStyleProps.HEADER_ROW_SEPARATOR_VISIBLE],
  ["headerColumnSeparatorVisible", TableStyleProps.HEADER_COLUMN_SEPARATOR_VISIBLE],
  ["footerSeparatorVisible", TableStyleProps.FOOTER_SEPARATOR_VISIBLE],
  ["headerColumnDividerVisible", TableStyleProps.HEADER_COLUMN_DIVIDER_VISIBLE],
  ["headerRowDividerVisible", TableStyleProps.HEADER_ROW_DIVIDER_VISIBLE],
  ["footerDividerVisible", TableStyleProps.FOOTER_DIVIDER_VISIBLE],
  ["behavesLikeSpreadsheet", TableStyleProps.BEHAVES_LIKE_SPREADSHEET],
  ["autoResize", TableStyleProps.AUTO_RESIZE],
] as const;

/** The stroke keys of {@link TableFormatting}, with their fields. */
const TABLE_STROKE_FIELDS = [
  ["bodyHorizontalStroke", TableStyleProps.BODY_HORIZONTAL_STROKE],
  ["bodyVerticalStroke", TableStyleProps.BODY_VERTICAL_STROKE],
  ["bodyBorderStroke", TableStyleProps.BODY_HORIZONTAL_BORDER_STROKE],
  ["headerRowSeparatorStroke", TableStyleProps.HEADER_ROW_SEPARATOR_STROKE],
  ["headerRowBorderStroke", TableStyleProps.HEADER_ROW_BORDER_STROKE],
  ["headerRowHorizontalStroke", TableStyleProps.HEADER_ROW_HORIZONTAL_STROKE],
  ["headerRowVerticalStroke", TableStyleProps.HEADER_ROW_VERTICAL_STROKE],
  ["headerColumnBorderStroke", TableStyleProps.HEADER_COLUMN_BORDER_STROKE],
  ["headerColumnSeparatorStroke", TableStyleProps.HEADER_COLUMN_SEPARATOR_STROKE],
  ["headerColumnHorizontalStroke", TableStyleProps.HEADER_COLUMN_HORIZONTAL_STROKE],
  ["headerColumnVerticalStroke", TableStyleProps.HEADER_COLUMN_VERTICAL_STROKE],
  ["footerRowSeparatorStroke", TableStyleProps.FOOTER_ROW_SEPARATOR_STROKE],
  ["footerRowBorderStroke", TableStyleProps.FOOTER_ROW_BORDER_STROKE],
  ["footerRowHorizontalStroke", TableStyleProps.FOOTER_ROW_HORIZONTAL_STROKE],
  ["footerRowVerticalStroke", TableStyleProps.FOOTER_ROW_VERTICAL_STROKE],
] as const;

// ------------------------------------------------------------- cell styles

export function readCellFormatting(props: RawMessage | undefined): CellFormatting {
  const out: CellFormatting = {};
  if (!props) return out;
  const fill = readFill(props.getMessage(CellStyleProps.CELL_FILL));
  if (fill) out.fill = fill;
  const borders: CellBorders = {};
  let any = false;
  for (const [side, field] of CELL_BORDER_FIELDS) {
    const stroke = readStroke(props.getMessage(field));
    if (stroke) {
      borders[side] = stroke;
      any = true;
    }
  }
  if (any) out.borders = borders;
  const padding = readPadding(props.getMessage(CellStyleProps.PADDING));
  if (padding && Object.keys(padding).length > 0) out.padding = padding;
  const alignment = props.getUint(CellStyleProps.VERTICAL_ALIGNMENT);
  if (alignment !== undefined) out.verticalAlignment = alignment;
  const wrap = props.getBool(CellStyleProps.TEXT_WRAP);
  if (wrap !== undefined) out.textWrap = wrap;
  return out;
}

/** Merge cell formatting into a property bag, preserving unmodelled fields. */
export function applyCellFormatting(props: RawMessage, f: CellFormatting): void {
  if (f.fill !== undefined) props.setMessage(CellStyleProps.CELL_FILL, writeFill(f.fill));
  if (f.borders) {
    for (const [side, field] of CELL_BORDER_FIELDS) {
      const stroke = f.borders[side];
      if (stroke === undefined) continue;
      // `null` is an explicit "no border here", distinct from "leave it".
      if (stroke === null) props.remove(field);
      else props.setMessage(field, writeStroke(stroke));
    }
  }
  if (f.padding) props.setMessage(CellStyleProps.PADDING, writePadding(f.padding));
  if (f.verticalAlignment !== undefined) {
    props.setVarint(CellStyleProps.VERTICAL_ALIGNMENT, f.verticalAlignment);
  }
  if (f.textWrap !== undefined) props.setBool(CellStyleProps.TEXT_WRAP, f.textWrap);
}

export function buildCellProperties(f: CellFormatting): RawMessage {
  const m = RawMessage.create();
  applyCellFormatting(m, f);
  return m;
}

/** Set every side's border at once. */
export function allBorders(stroke: Stroke | null): CellFormatting["borders"] {
  return { top: stroke, right: stroke, bottom: stroke, left: stroke };
}

// ------------------------------------------------------------ table styles

export function readTableFormatting(props: RawMessage | undefined): TableFormatting {
  const out: TableFormatting = {};
  if (!props) return out;
  for (const [key, field] of TABLE_BOOL_FIELDS) {
    const value = props.getBool(field);
    if (value !== undefined) out[key] = value;
  }
  const banded = readFill(props.getMessage(TableStyleProps.BANDED_FILL));
  if (banded) out.bandedFill = banded;
  for (const [key, field] of TABLE_STROKE_FIELDS) {
    const stroke = readStroke(props.getMessage(field));
    if (stroke) out[key] = stroke;
  }
  return out;
}

/**
 * Merge table formatting into a property bag, preserving unmodelled
 * fields. `null` removes a field — the style inherits again — and
 * `undefined` leaves it alone; absent has never meant false here.
 */
export function applyTableFormatting(props: RawMessage, f: TableFormatting): void {
  for (const [key, field] of TABLE_BOOL_FIELDS) {
    const value = f[key];
    if (value === undefined) continue;
    if (value === null) props.remove(field);
    else props.setBool(field, value);
  }
  if (f.bandedFill !== undefined) {
    if (f.bandedFill === null) props.remove(TableStyleProps.BANDED_FILL);
    else props.setMessage(TableStyleProps.BANDED_FILL, writeFill(f.bandedFill));
  }
  for (const [key, field] of TABLE_STROKE_FIELDS) {
    const stroke = f[key];
    if (stroke === undefined) continue;
    if (stroke === null) props.remove(field);
    else props.setMessage(field, writeStroke(stroke));
  }
  // The body border is drawn by two strokes; keeping them in step is what
  // the inspector's single "table outline" control does.
  if (f.bodyBorderStroke !== undefined) {
    if (f.bodyBorderStroke === null) props.remove(TableStyleProps.BODY_VERTICAL_BORDER_STROKE);
    else {
      props.setMessage(
        TableStyleProps.BODY_VERTICAL_BORDER_STROKE,
        writeStroke(f.bodyBorderStroke),
      );
    }
  }
}

/** A live view of one TST.CellStyleArchive or TST.TableStyleArchive. */
export class TableStyleHandle {
  readonly store: ObjectStore;
  readonly object: IwaObject;

  constructor(store: ObjectStore, object: IwaObject) {
    this.store = store;
    this.object = object;
  }

  get id(): bigint {
    return this.object.identifier;
  }

  get isCellStyle(): boolean {
    return this.object.type === TST_STYLE_TYPE.CELL_STYLE;
  }

  private props(): RawMessage | undefined {
    return this.object.message.getMessage(STYLE_PROPERTIES);
  }

  cell(): CellFormatting {
    return readCellFormatting(this.isCellStyle ? this.props() : undefined);
  }

  table(): TableFormatting {
    return readTableFormatting(this.isCellStyle ? undefined : this.props());
  }

  setCell(formatting: CellFormatting): this {
    if (!this.isCellStyle) throw new RangeError(`style ${this.id} is not a cell style`);
    const props = this.props() ?? RawMessage.create();
    applyCellFormatting(props, formatting);
    this.object.message.setMessage(STYLE_PROPERTIES, props);
    this.refreshOverrideCount(props);
    return this;
  }

  setTable(formatting: TableFormatting): this {
    if (this.isCellStyle) throw new RangeError(`style ${this.id} is not a table style`);
    const props = this.props() ?? RawMessage.create();
    applyTableFormatting(props, formatting);
    this.object.message.setMessage(STYLE_PROPERTIES, props);
    this.refreshOverrideCount(props);
    return this;
  }

  private refreshOverrideCount(props: RawMessage): void {
    this.object.message.setVarint(STYLE_OVERRIDE_COUNT, props.fields.length);
  }
}
