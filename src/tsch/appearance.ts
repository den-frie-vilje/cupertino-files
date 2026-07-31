/**
 * Chart appearance — the TSCH style archives.
 *
 * `charts.ts` handles a chart's *data*: the grid, the series, the row and
 * column names. None of that says what the chart looks like. Colour, opacity
 * and stroke live in a parallel set of archives hanging off the same
 * `TSCH.ChartArchive`, one per thing that can be styled:
 *
 * | archive | type | what it styles |
 * | --- | --- | --- |
 * | `TSCH.ChartStyleArchive` | 5022 | the chart as a whole |
 * | `TSCH.LegendStyleArchive` | 5024 | the legend |
 * | `TSCH.ChartAxisStyleArchive` | 5026 | one axis |
 * | `TSCH.ChartSeriesStyleArchive` | 5028 | one series |
 *
 * ## The shape they share
 *
 * Every one of them is declared the same way:
 *
 * ```proto
 * message ChartSeriesStyleArchive {
 *   optional .TSS.StyleArchive super = 1;
 *   extensions 10000 to 536870911;
 * }
 * ```
 *
 * — a `TSS.StyleArchive` at field 1, and an extension range. The properties
 * are in the extension: `TSCH.Generated.ChartSeriesStyleArchive current =
 * 10000`, a flat bag whose field numbers each name one property.
 * `tschchartseriescolumnfill = 13` is a `TSD.FillArchive`;
 * `tschchartseriesdefaultopacity = 24` is a float. Those are the same
 * `TSD` value types the drawable styles use, so this module reuses
 * {@link readFill} and {@link writeFill} rather than restating them.
 *
 * The layout is confirmed against real bytes, not just read off the proto: a
 * series style in a borrowed chart has exactly field 1, field 10000 and two
 * trailing varints, and inside the bag field 13 decodes as a colour fill
 * while field 24 is wire-type 5. Every numbered property below was checked
 * that way before being named.
 *
 * ## Why one colour is written to six fields
 *
 * A series carries a *separate* fill per chart geometry — area, bar, column,
 * mixed-area, mixed-column, pie — so that changing a column chart into a pie
 * chart keeps the series looking the same. Apple writes all six identically;
 * only `tschchartseriesdefaultfill` differs, and that one is the template's
 * fallback rather than this series' colour. {@link ChartSeriesStyle.setFill}
 * follows that pattern: it sets the six, and leaves the default alone.
 *
 * ## What this module does not do
 *
 * It edits styles that exist. Charts in the corpus arrive with a full set of
 * style archives already — Apple writes them from the template whether or
 * not the user has touched anything — so there has been no need to
 * synthesise one, and no fixture that would show what a synthesised one
 * should contain.
 */
import type { IwaObject } from "../tsp/iwa.ts";
import type { ObjectStore } from "../tsp/store.ts";
import type { RawMessage } from "../base/protobuf.ts";
import { readFill, writeFill, readStroke, writeStroke, type Fill, type Stroke } from "../tsd/style.ts";

/**
 * The extension field every TSCH style archive keeps its properties in.
 *
 * `extensions 10000 to 536870911` in the proto, with
 * `TSCH.Generated.<name> current = 10000` filling the first slot. Reading a
 * style means reading this submessage; the `TSS.StyleArchive` at field 1
 * carries identity and inheritance, not values.
 */
export const GENERATED_PROPERTIES = 10000;

/**
 * Property numbers inside `TSCH.Generated.ChartSeriesStyleArchive`.
 *
 * Only the ones this module reads or writes are named. The bag holds 108
 * properties in a real file and the rest are preserved untouched, which is
 * the whole point of the schema-light representation.
 */
export const SeriesStyleProperty = {
  /** `TSD.FillArchive`, one per geometry — see the module note. */
  AREA_FILL: 11,
  BAR_FILL: 12,
  COLUMN_FILL: 13,
  /** The template's fallback, *not* this series' colour. Left alone. */
  DEFAULT_FILL: 14,
  MIXED_AREA_FILL: 15,
  MIXED_COLUMN_FILL: 16,
  PIE_FILL: 17,
  /** float */
  DEFAULT_OPACITY: 24,
} as const;

/**
 * The six fills that together mean "this series is this colour".
 *
 * Ordered as the proto declares them so a diff against Apple's output reads
 * in field order.
 */
const SERIES_GEOMETRY_FILLS: readonly number[] = [
  SeriesStyleProperty.AREA_FILL,
  SeriesStyleProperty.BAR_FILL,
  SeriesStyleProperty.COLUMN_FILL,
  SeriesStyleProperty.MIXED_AREA_FILL,
  SeriesStyleProperty.MIXED_COLUMN_FILL,
  SeriesStyleProperty.PIE_FILL,
];

/** `TSP.SparseReferenceArray`: entries carry an index and a reference. */
const SparseArray = { COUNT: 1, ENTRIES: 2 } as const;
/** `TSP.SparseReferenceArray.Entry`. */
export const SparseEntry = { INDEX: 1, REFERENCE: 2 } as const;
/** `TSP.Reference.identifier`. */
export const REFERENCE_IDENTIFIER = 1;

/** One entry of a sparse reference array, with its position. */
export interface SparseRef {
  index: number;
  id: bigint;
}

/**
 * Read a `TSP.SparseReferenceArray` into positioned ids.
 *
 * Sparse because a chart may style series 0 and 3 and leave the rest on the
 * preset — the entry's own `index` is authoritative, never its position in
 * the list.
 */
export function sparseRefs(array: RawMessage | undefined): SparseRef[] {
  if (!array) return [];
  const out: SparseRef[] = [];
  for (const entry of array.getMessages(SparseArray.ENTRIES)) {
    const id = entry.getMessage(SparseEntry.REFERENCE)?.getVarint(REFERENCE_IDENTIFIER);
    if (id === undefined || id === 0n) continue;
    out.push({ index: entry.getUint(SparseEntry.INDEX) ?? 0, id });
  }
  return out;
}

/** How many slots the array claims, which can exceed the entries present. */
export function sparseCount(array: RawMessage | undefined): number {
  return array?.getUint(SparseArray.COUNT) ?? 0;
}

/**
 * A styled thing in a chart: series, axis, legend or the chart itself.
 *
 * All four archives have the same shape, so they share the accessor for
 * their property bag. Subclasses name the properties they understand.
 */
export class ChartStyleArchive {
  readonly store: ObjectStore;
  readonly object: IwaObject;

  constructor(store: ObjectStore, object: IwaObject) {
    this.store = store;
    this.object = object;
  }

  get id(): bigint {
    return this.object.identifier;
  }

  /**
   * The property bag, or `undefined` on an archive that carries none.
   *
   * An archive with no field 10000 is inheriting everything from its
   * preset. Reading returns `undefined` rather than inventing defaults,
   * because the value that applies then is the preset's, and this module
   * does not resolve preset inheritance.
   */
  properties(): RawMessage | undefined {
    return this.object.message.getMessage(GENERATED_PROPERTIES);
  }

  /** The bag, created if the archive has none. */
  protected requireProperties(): RawMessage {
    const existing = this.properties();
    if (existing) return existing;
    throw new RangeError(
      `chart style ${this.id} has no property bag (field ${GENERATED_PROPERTIES}); ` +
        "it inherits from a preset, and writing one would override every " +
        "inherited value with nothing",
    );
  }

  /** A `TSD.FillArchive` property, decoded. */
  fillProperty(field: number): Fill | undefined {
    return readFill(this.properties()?.getMessage(field));
  }

  setFillProperty(field: number, fill: Fill): void {
    this.requireProperties().setMessage(field, writeFill(fill));
    this.object.message.markDirty();
  }

  /** A float property, e.g. an opacity. */
  floatProperty(field: number): number | undefined {
    return this.properties()?.getFloat(field);
  }

  setFloatProperty(field: number, value: number): void {
    this.requireProperties().setFloat(field, value);
    this.object.message.markDirty();
  }
}

/** The style of one series — in practice, its colour. */
export class ChartSeriesStyle extends ChartStyleArchive {
  /** Position of the series this styles, from the sparse array. */
  readonly index: number;

  constructor(store: ObjectStore, object: IwaObject, index: number) {
    super(store, object);
    this.index = index;
  }

  /**
   * The series colour.
   *
   * Read from the column fill, which every chart carries whatever its
   * geometry, falling back through the other geometries and finally to the
   * template default so that a chart authored as a pie still answers.
   */
  fill(): Fill | undefined {
    for (const field of [SeriesStyleProperty.COLUMN_FILL, ...SERIES_GEOMETRY_FILLS]) {
      const fill = this.fillProperty(field);
      if (fill) return fill;
    }
    return this.fillProperty(SeriesStyleProperty.DEFAULT_FILL);
  }

  /**
   * Set the series colour across every geometry.
   *
   * See the module note: Apple keeps the six geometry fills identical and
   * the seventh — the template default — distinct, so this writes the six.
   */
  setFill(fill: Fill): void {
    for (const field of SERIES_GEOMETRY_FILLS) this.setFillProperty(field, fill);
  }

  /** Per-geometry fills, for callers that need the distinction. */
  fills(): Record<string, Fill | undefined> {
    return {
      area: this.fillProperty(SeriesStyleProperty.AREA_FILL),
      bar: this.fillProperty(SeriesStyleProperty.BAR_FILL),
      column: this.fillProperty(SeriesStyleProperty.COLUMN_FILL),
      mixedArea: this.fillProperty(SeriesStyleProperty.MIXED_AREA_FILL),
      mixedColumn: this.fillProperty(SeriesStyleProperty.MIXED_COLUMN_FILL),
      pie: this.fillProperty(SeriesStyleProperty.PIE_FILL),
      default: this.fillProperty(SeriesStyleProperty.DEFAULT_FILL),
    };
  }

  get opacity(): number | undefined {
    return this.floatProperty(SeriesStyleProperty.DEFAULT_OPACITY);
  }

  setOpacity(value: number): void {
    if (!(value >= 0 && value <= 1)) {
      throw new RangeError(`opacity must be between 0 and 1, got ${value}`);
    }
    this.setFloatProperty(SeriesStyleProperty.DEFAULT_OPACITY, value);
  }
}

/**
 * Property numbers inside `TSCH.Generated.LegendStyleArchive`.
 *
 * The whole message is five fields, so this one is complete rather than a
 * selection.
 */
export const LegendStyleProperty = {
  /** `TSD.FillArchive` */
  FILL: 1,
  LABEL_PARAGRAPH_STYLE_INDEX: 2,
  /** float */
  OPACITY: 3,
  /** `TSD.ShadowArchive` */
  SHADOW: 4,
  /** `TSD.StrokeArchive` */
  STROKE: 5,
} as const;

/** The legend's background, border and opacity. */
export class ChartLegendStyle extends ChartStyleArchive {
  fill(): Fill | undefined {
    return this.fillProperty(LegendStyleProperty.FILL);
  }

  setFill(fill: Fill): void {
    this.setFillProperty(LegendStyleProperty.FILL, fill);
  }

  stroke(): Stroke | undefined {
    return readStroke(this.properties()?.getMessage(LegendStyleProperty.STROKE));
  }

  setStroke(stroke: Stroke): void {
    this.requireProperties().setMessage(LegendStyleProperty.STROKE, writeStroke(stroke));
    this.object.message.markDirty();
  }

  get opacity(): number | undefined {
    return this.floatProperty(LegendStyleProperty.OPACITY);
  }

  setOpacity(value: number): void {
    if (!(value >= 0 && value <= 1)) {
      throw new RangeError(`opacity must be between 0 and 1, got ${value}`);
    }
    this.setFloatProperty(LegendStyleProperty.OPACITY, value);
  }
}

/** Which axis an axis style belongs to. */
export type AxisKind = "category" | "value";

/**
 * Property numbers inside `TSCH.Generated.ChartAxisStyleArchive`, as
 * `[category, value]` pairs.
 *
 * Nearly every axis property exists twice, once for each kind, and an
 * archive populates only its own family: in a real chart the category
 * axis's bag holds fields 1, 3, 5, 12, 14, 16, 18, 20, 22, 24 … and the
 * value axis's holds 2, 4, 13, 15, 17, 19, 21, 25 … — the counterparts,
 * with nothing in common but the shared label-style field 7. So a reader
 * has to know which kind it is holding, and {@link ChartAxisStyle} is told
 * by the chart, which keeps `value_axis_styles` and `category_axis_styles`
 * in separate fields.
 */
export const AxisStyleProperty: Readonly<Record<string, readonly [number, number]>> = {
  /** bool — is the axis line drawn at all */
  SHOW_AXIS: [24, 25],
  /** bool */
  SHOW_MAJOR_GRIDLINES: [27, 28],
  /** bool */
  SHOW_MINOR_GRIDLINES: [32, 33],
  /** bool */
  SHOW_MAJOR_TICK_MARKS: [29, 30],
  /** bool */
  SHOW_MINOR_TICK_MARKS: [34, 35],
  /** `TSD.StrokeArchive` */
  MAJOR_GRIDLINE_STROKE: [16, 17],
  /** `TSD.StrokeArchive` */
  MINOR_GRIDLINE_STROKE: [22, 23],
  /** float */
  MAJOR_GRIDLINE_OPACITY: [12, 13],
  /** float */
  MINOR_GRIDLINE_OPACITY: [18, 19],
  /** float — label rotation */
  LABELS_ORIENTATION: [9, 11],
  /** int — where tick marks sit relative to the axis */
  TICK_MARK_LOCATION: [36, 37],
};

/** One axis's gridlines, tick marks and visibility. */
export class ChartAxisStyle extends ChartStyleArchive {
  readonly kind: AxisKind;
  /** Position among the axes of this kind. */
  readonly index: number;

  constructor(store: ObjectStore, object: IwaObject, kind: AxisKind, index: number) {
    super(store, object);
    this.kind = kind;
    this.index = index;
  }

  /** Resolve a `[category, value]` pair against this axis's kind. */
  field(property: keyof typeof AxisStyleProperty): number {
    const pair = AxisStyleProperty[property];
    if (!pair) throw new RangeError(`unknown axis property ${String(property)}`);
    return this.kind === "category" ? pair[0] : pair[1];
  }

  bool(property: keyof typeof AxisStyleProperty): boolean | undefined {
    return this.properties()?.getBool(this.field(property));
  }

  setBool(property: keyof typeof AxisStyleProperty, value: boolean): void {
    this.requireProperties().setBool(this.field(property), value);
    this.object.message.markDirty();
  }

  stroke(property: keyof typeof AxisStyleProperty): Stroke | undefined {
    return readStroke(this.properties()?.getMessage(this.field(property)));
  }

  setStroke(property: keyof typeof AxisStyleProperty, stroke: Stroke): void {
    this.requireProperties().setMessage(this.field(property), writeStroke(stroke));
    this.object.message.markDirty();
  }

  get showAxis(): boolean | undefined {
    return this.bool("SHOW_AXIS");
  }

  setShowAxis(value: boolean): void {
    this.setBool("SHOW_AXIS", value);
  }

  get showMajorGridlines(): boolean | undefined {
    return this.bool("SHOW_MAJOR_GRIDLINES");
  }

  setShowMajorGridlines(value: boolean): void {
    this.setBool("SHOW_MAJOR_GRIDLINES", value);
  }

  majorGridlineStroke(): Stroke | undefined {
    return this.stroke("MAJOR_GRIDLINE_STROKE");
  }

  setMajorGridlineStroke(stroke: Stroke): void {
    this.setStroke("MAJOR_GRIDLINE_STROKE", stroke);
  }

  /** Everything this module names, for inspection. */
  describe(): Record<string, unknown> {
    const properties = this.properties();
    if (!properties) return {};
    const out: Record<string, unknown> = { kind: this.kind, index: this.index };
    for (const name of Object.keys(AxisStyleProperty)) {
      const field = this.field(name);
      if (!properties.has(field)) continue;
      const raw = properties.fields.find((f) => f.no === field);
      out[name] =
        raw?.wire === 0
          ? properties.getUint(field)
          : raw?.wire === 5
            ? properties.getFloat(field)
            : (readStroke(properties.getMessage(field)) ?? "(message)");
    }
    return out;
  }
}
