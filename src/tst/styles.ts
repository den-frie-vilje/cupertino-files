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
import { RawMessage } from "../base/protobuf.ts";
import type { IwaObject } from "../tsp/iwa.ts";
import type { ObjectStore } from "../tsp/store.ts";
import type { Fill, Padding, Stroke } from "../tsd/style.ts";
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
export const CellStyleProps = {
  CELL_FILL: 1,
  TEXT_WRAP: 3,
  VERTICAL_ALIGNMENT: 8,
  PADDING: 9,
  TOP_STROKE: 10,
  RIGHT_STROKE: 11,
  BOTTOM_STROKE: 12,
  LEFT_STROKE: 13,
} as const;

export const VerticalAlignment = { TOP: 0, MIDDLE: 1, BOTTOM: 2 } as const;

/** TST.TableStylePropertiesArchive (the fields worth modelling). */
export const TableStyleProps = {
  BANDED_ROWS: 1,
  BANDED_FILL: 2,
  BEHAVES_LIKE_SPREADSHEET: 21,
  AUTO_RESIZE: 22,
  VERTICAL_STROKES_VISIBLE: 33,
  HORIZONTAL_STROKES_VISIBLE: 34,
  HEADER_ROW_SEPARATOR_VISIBLE: 35,
  HEADER_COLUMN_SEPARATOR_VISIBLE: 36,
  FOOTER_SEPARATOR_VISIBLE: 37,
  TABLE_BORDER_VISIBLE: 38,
  TABLE_HEADER_BORDER_VISIBLE: 39,
  MASTER_FONT_FAMILY: 41,
  WRITING_DIRECTION: 45,
  HEADER_ROW_SEPARATOR_STROKE: 46,
  HEADER_ROW_BORDER_STROKE: 47,
  HEADER_COLUMN_BORDER_STROKE: 50,
  HEADER_COLUMN_SEPARATOR_STROKE: 51,
  FOOTER_ROW_SEPARATOR_STROKE: 54,
  FOOTER_ROW_BORDER_STROKE: 55,
  BODY_HORIZONTAL_BORDER_STROKE: 58,
  BODY_VERTICAL_BORDER_STROKE: 59,
  BODY_HORIZONTAL_STROKE: 60,
  BODY_VERTICAL_STROKE: 61,
} as const;

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
  /** Wrap text within the cell rather than clipping it. */
  textWrap?: boolean;
}

export interface TableFormatting {
  bandedRows?: boolean;
  bandedFill?: Fill;
  /** Show the vertical grid lines of the table body. */
  verticalStrokesVisible?: boolean;
  horizontalStrokesVisible?: boolean;
  tableBorderVisible?: boolean;
  headerRowSeparatorVisible?: boolean;
  headerColumnSeparatorVisible?: boolean;
  footerSeparatorVisible?: boolean;
  /** Grid line drawn between body rows. */
  bodyHorizontalStroke?: Stroke | null;
  /** Grid line drawn between body columns. */
  bodyVerticalStroke?: Stroke | null;
  /** Outer border of the table body. */
  bodyBorderStroke?: Stroke | null;
  headerRowSeparatorStroke?: Stroke | null;
  behavesLikeSpreadsheet?: boolean;
  autoResize?: boolean;
}

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
  for (const [key, field] of [
    ["bandedRows", TableStyleProps.BANDED_ROWS],
    ["verticalStrokesVisible", TableStyleProps.VERTICAL_STROKES_VISIBLE],
    ["horizontalStrokesVisible", TableStyleProps.HORIZONTAL_STROKES_VISIBLE],
    ["tableBorderVisible", TableStyleProps.TABLE_BORDER_VISIBLE],
    ["headerRowSeparatorVisible", TableStyleProps.HEADER_ROW_SEPARATOR_VISIBLE],
    ["headerColumnSeparatorVisible", TableStyleProps.HEADER_COLUMN_SEPARATOR_VISIBLE],
    ["footerSeparatorVisible", TableStyleProps.FOOTER_SEPARATOR_VISIBLE],
    ["behavesLikeSpreadsheet", TableStyleProps.BEHAVES_LIKE_SPREADSHEET],
    ["autoResize", TableStyleProps.AUTO_RESIZE],
  ] as const) {
    const value = props.getBool(field);
    if (value !== undefined) out[key] = value;
  }
  const banded = readFill(props.getMessage(TableStyleProps.BANDED_FILL));
  if (banded) out.bandedFill = banded;
  for (const [key, field] of [
    ["bodyHorizontalStroke", TableStyleProps.BODY_HORIZONTAL_STROKE],
    ["bodyVerticalStroke", TableStyleProps.BODY_VERTICAL_STROKE],
    ["bodyBorderStroke", TableStyleProps.BODY_HORIZONTAL_BORDER_STROKE],
    ["headerRowSeparatorStroke", TableStyleProps.HEADER_ROW_SEPARATOR_STROKE],
  ] as const) {
    const stroke = readStroke(props.getMessage(field));
    if (stroke) out[key] = stroke;
  }
  return out;
}

/** Merge table formatting into a property bag, preserving unmodelled fields. */
export function applyTableFormatting(props: RawMessage, f: TableFormatting): void {
  for (const [key, field] of [
    ["bandedRows", TableStyleProps.BANDED_ROWS],
    ["verticalStrokesVisible", TableStyleProps.VERTICAL_STROKES_VISIBLE],
    ["horizontalStrokesVisible", TableStyleProps.HORIZONTAL_STROKES_VISIBLE],
    ["tableBorderVisible", TableStyleProps.TABLE_BORDER_VISIBLE],
    ["headerRowSeparatorVisible", TableStyleProps.HEADER_ROW_SEPARATOR_VISIBLE],
    ["headerColumnSeparatorVisible", TableStyleProps.HEADER_COLUMN_SEPARATOR_VISIBLE],
    ["footerSeparatorVisible", TableStyleProps.FOOTER_SEPARATOR_VISIBLE],
    ["behavesLikeSpreadsheet", TableStyleProps.BEHAVES_LIKE_SPREADSHEET],
    ["autoResize", TableStyleProps.AUTO_RESIZE],
  ] as const) {
    const value = f[key];
    if (value !== undefined) props.setBool(field, value);
  }
  if (f.bandedFill !== undefined) {
    props.setMessage(TableStyleProps.BANDED_FILL, writeFill(f.bandedFill));
  }
  for (const [key, field] of [
    ["bodyHorizontalStroke", TableStyleProps.BODY_HORIZONTAL_STROKE],
    ["bodyVerticalStroke", TableStyleProps.BODY_VERTICAL_STROKE],
    ["bodyBorderStroke", TableStyleProps.BODY_HORIZONTAL_BORDER_STROKE],
    ["headerRowSeparatorStroke", TableStyleProps.HEADER_ROW_SEPARATOR_STROKE],
  ] as const) {
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
