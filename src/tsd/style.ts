/**
 * TSD style *values* — fills, gradients, strokes and shadows.
 *
 * These are the shared vocabulary of visual styling across the whole
 * suite: a paragraph background, a table-cell fill, a shape fill and a
 * chart series fill are all `TSD.FillArchive`; a paragraph rule, a cell
 * border and a shape outline are all `TSD.StrokeArchive`. Modelling them
 * once here is what lets text, table and drawable styling share an API
 * instead of re-implementing borders three times.
 *
 * Field numbers from proto/current/TSDArchives.proto.
 */
import { protoEnum, protoFields } from "../proto/fields.ts";
import { RawMessage } from "../base/protobuf.ts";
import { ColorFields, RGB_SPACE, makeColor, makeDataRef } from "../tsp/schema.ts";

// ------------------------------------------------------------------- colors

/**
 * An RGB colour with components in 0..1.
 *
 * `space` distinguishes sRGB from Display P3. It matters: 26.x documents
 * carry an explicit `rgbspace` on essentially every colour, and a P3 colour
 * read and written back as plain sRGB would shift on screen.
 */
export interface Color {
  r: number;
  g: number;
  b: number;
  a?: number;
  space?: "srgb" | "p3";
}

export function readColor(message: RawMessage | undefined): Color | undefined {
  if (!message) return undefined;
  const r = message.getFloat(ColorFields.R);
  const g = message.getFloat(ColorFields.G);
  const b = message.getFloat(ColorFields.B);
  if (r === undefined || g === undefined || b === undefined) return undefined;
  const a = message.getFloat(ColorFields.A);
  const out: Color = a === undefined || a === 1 ? { r, g, b } : { r, g, b, a };
  const space = message.getUint(ColorFields.RGB_SPACE);
  if (space === RGB_SPACE.P3) out.space = "p3";
  else if (space === RGB_SPACE.SRGB) out.space = "srgb";
  return out;
}

/**
 * A colour that names no `space` is written as sRGB rather than bare.
 * From iWork 19 on the apps stamp a space on every colour they write —
 * of the 8,000-plus colours at the measured fill and stroke sites in
 * iwork19/modern/current-era corpus files, not one is bare; bare
 * colours appear only in 2013/2016-era files. An explicit `space` is
 * kept as given, P3 included.
 */
export function writeColor(color: Color): RawMessage {
  const m = makeColor(color.r, color.g, color.b, color.a ?? 1);
  m.setVarint(ColorFields.RGB_SPACE, color.space === "p3" ? RGB_SPACE.P3 : RGB_SPACE.SRGB);
  return m;
}

/** True when the message looks like a TSP.Color (has a model or channels). */
export function isColorLike(message: RawMessage): boolean {
  return message.has(ColorFields.MODEL) || message.has(ColorFields.R);
}

/** Convenience constructors for the few colours worth naming. */
export const BLACK: Color = { r: 0, g: 0, b: 0 };
export const WHITE: Color = { r: 1, g: 1, b: 1 };

/** Parse `#rgb`, `#rrggbb` or `#rrggbbaa` into a {@link Color}. */
export function hexColor(hex: string): Color {
  const text = hex.replace(/^#/, "");
  const expand = text.length === 3 || text.length === 4;
  const parts: number[] = [];
  for (let i = 0; i < text.length; i += expand ? 1 : 2) {
    const chunk = expand ? text[i]!.repeat(2) : text.slice(i, i + 2);
    const value = Number.parseInt(chunk, 16);
    if (Number.isNaN(value)) throw new RangeError(`invalid hex colour: ${hex}`);
    parts.push(value / 255);
  }
  if (parts.length < 3) throw new RangeError(`invalid hex colour: ${hex}`);
  const color: Color = { r: parts[0]!, g: parts[1]!, b: parts[2]! };
  if (parts.length > 3 && parts[3] !== 1) color.a = parts[3]!;
  return color;
}

// -------------------------------------------------------------------- fills

/** TSD.FillArchive. */
export const FillFields = protoFields("TSD.FillArchive", { COLOR: "color", GRADIENT: "gradient", IMAGE: "image" });

/** TSD.GradientArchive. */
export const GradientFields = protoFields("TSD.GradientArchive", {
  TYPE: "type",
  STOPS: "stops",
  OPACITY: "opacity",
  ADVANCED: "advancedGradient",
  ANGLE_GRADIENT: "anglegradient",
});
export const GradientStopFields = protoFields("TSD.GradientArchive", { COLOR: "type", FRACTION: "stops", INFLECTION: "opacity" });
export const GradientType = protoEnum("TSD.GradientArchive.GradientType", { LINEAR: "Linear", RADIAL: "Radial" });

/** TSD.AngleGradientArchive.gradientangle — radians. */
const ANGLE_GRADIENT_ANGLE = 2;

/**
 * The direction of a fresh gradient: 3π/2, top to bottom. 755 of the
 * 765 angle-bearing corpus gradients state exactly this value.
 */
const DEFAULT_GRADIENT_ANGLE = (3 * Math.PI) / 2;

/** TSD.ImageFillArchive. */
export const ImageFillFields = protoFields("TSD.ImageFillArchive", {
  TECHNIQUE: "technique",
  TINT: "tint",
  FILL_SIZE: "fillsize",
  IMAGE_DATA: "imagedata",
});
export const ImageFillTechnique = protoEnum("TSD.ImageFillArchive.ImageFillTechnique", {
  NATURAL_SIZE: "NaturalSize",
  STRETCH: "Stretch",
  TILE: "Tile",
  SCALE_TO_FILL: "ScaleToFill",
  SCALE_TO_FIT: "ScaleToFit",
});

export interface GradientStop {
  color: Color;
  /** Position along the gradient, 0..1. */
  fraction: number;
  /** Midpoint skew toward the next stop, 0..1. */
  inflection?: number;
}

export interface Gradient {
  type: "linear" | "radial";
  stops: GradientStop[];
  opacity?: number;
  /**
   * Direction in radians, as `TSD.AngleGradientArchive` stores it.
   * Omitted, a written gradient gets the app's own fresh-gradient
   * direction, 3π/2 — top to bottom.
   */
  angle?: number;
  /** The inspector's advanced-gradient mode; fresh gradients state false. */
  advanced?: boolean;
}

export interface ImageFill {
  /** Data-space identifier of the backing media. */
  dataId?: bigint;
  technique?: number;
  tint?: Color;
}

/** A fill is exactly one of a flat colour, a gradient, or an image. */
export type Fill =
  | { kind: "color"; color: Color }
  | { kind: "gradient"; gradient: Gradient }
  | { kind: "image"; image: ImageFill };

export function readFill(message: RawMessage | undefined): Fill | undefined {
  if (!message) return undefined;
  const color = readColor(message.getMessage(FillFields.COLOR));
  if (color) return { kind: "color", color };

  const gradient = message.getMessage(FillFields.GRADIENT);
  if (gradient) {
    const stops: GradientStop[] = [];
    for (const stop of gradient.getMessages(GradientFields.STOPS)) {
      const stopColor = readColor(stop.getMessage(GradientStopFields.COLOR));
      if (!stopColor) continue;
      const entry: GradientStop = {
        color: stopColor,
        fraction: stop.getFloat(GradientStopFields.FRACTION) ?? 0,
      };
      const inflection = stop.getFloat(GradientStopFields.INFLECTION);
      if (inflection !== undefined) entry.inflection = inflection;
      stops.push(entry);
    }
    const out: Gradient = {
      type: gradient.getUint(GradientFields.TYPE) === GradientType.RADIAL ? "radial" : "linear",
      stops,
    };
    const opacity = gradient.getFloat(GradientFields.OPACITY);
    if (opacity !== undefined) out.opacity = opacity;
    const advanced = gradient.getBool(GradientFields.ADVANCED);
    if (advanced !== undefined) out.advanced = advanced;
    const angle = gradient.getMessage(GradientFields.ANGLE_GRADIENT)?.getFloat(ANGLE_GRADIENT_ANGLE);
    if (angle !== undefined) out.angle = angle;
    return { kind: "gradient", gradient: out };
  }

  const image = message.getMessage(FillFields.IMAGE);
  if (image) {
    const out: ImageFill = {};
    const dataId = image.getMessage(ImageFillFields.IMAGE_DATA)?.getVarint(1);
    if (dataId !== undefined) out.dataId = dataId;
    const technique = image.getUint(ImageFillFields.TECHNIQUE);
    if (technique !== undefined) out.technique = technique;
    const tint = readColor(image.getMessage(ImageFillFields.TINT));
    if (tint) out.tint = tint;
    return { kind: "image", image: out };
  }
  return undefined;
}

export function writeFill(fill: Fill): RawMessage {
  const message = RawMessage.create();
  if (fill.kind === "color") {
    message.setMessage(FillFields.COLOR, writeColor(fill.color));
    return message;
  }
  if (fill.kind === "gradient") {
    // The app's own gradients state all five fields — measured over the
    // corpus's 876: opacity on every one, the advanced flag on every one
    // (false outside a single advanced specimen), the midpoint on all
    // 1,993 stops (0.5 unless dragged), and the angle on every fresh-era
    // gradient. Absent options are completed to that fresh shape.
    const gradient = RawMessage.create();
    gradient.setVarint(
      GradientFields.TYPE,
      fill.gradient.type === "radial" ? GradientType.RADIAL : GradientType.LINEAR,
    );
    for (const stop of fill.gradient.stops) {
      const entry = RawMessage.create();
      entry.setMessage(GradientStopFields.COLOR, writeColor(stop.color));
      entry.setFloat(GradientStopFields.FRACTION, stop.fraction);
      entry.setFloat(GradientStopFields.INFLECTION, stop.inflection ?? 0.5);
      gradient.addMessage(GradientFields.STOPS, entry);
    }
    gradient.setFloat(GradientFields.OPACITY, fill.gradient.opacity ?? 1);
    gradient.setBool(GradientFields.ADVANCED, fill.gradient.advanced ?? false);
    const angle = RawMessage.create();
    angle.setFloat(ANGLE_GRADIENT_ANGLE, fill.gradient.angle ?? DEFAULT_GRADIENT_ANGLE);
    gradient.setMessage(GradientFields.ANGLE_GRADIENT, angle);
    message.setMessage(FillFields.GRADIENT, gradient);
    return message;
  }
  const image = RawMessage.create();
  if (fill.image.dataId !== undefined) {
    image.setMessage(ImageFillFields.IMAGE_DATA, makeDataRef(fill.image.dataId));
  }
  if (fill.image.technique !== undefined) {
    image.setVarint(ImageFillFields.TECHNIQUE, fill.image.technique);
  }
  if (fill.image.tint) image.setMessage(ImageFillFields.TINT, writeColor(fill.image.tint));
  message.setMessage(FillFields.IMAGE, image);
  return message;
}

/** Convenience: a flat colour fill. */
export function colorFill(r: number, g: number, b: number, a = 1): Fill {
  return { kind: "color", color: { r, g, b, a } };
}

/** Convenience: a two-stop linear gradient. */
export function linearGradient(from: Color, to: Color, opacity?: number): Fill {
  const gradient: Gradient = {
    type: "linear",
    stops: [
      { color: from, fraction: 0 },
      { color: to, fraction: 1 },
    ],
  };
  if (opacity !== undefined) gradient.opacity = opacity;
  return { kind: "gradient", gradient };
}

// ------------------------------------------------------------------ strokes

/** TSD.StrokeArchive — used for cell borders, paragraph rules and outlines. */
export const StrokeFields = protoFields("TSD.StrokeArchive", {
  COLOR: "color",
  WIDTH: "width",
  CAP: "cap",
  JOIN: "join",
  MITER_LIMIT: "miter_limit",
  PATTERN: "pattern",
});
export const LineCap = protoEnum("TSD.StrokeArchive.LineCap", { BUTT: "ButtCap", ROUND: "RoundCap", SQUARE: "SquareCap" });
export const LineJoin = protoEnum("TSD.LineJoin", { MITER: "MiterJoin", ROUND: "RoundJoin", BEVEL: "BevelJoin" });

/** TSD.StrokePatternArchive. */
export const StrokePatternFields = protoFields("TSD.StrokePatternArchive", { TYPE: "type", PHASE: "phase", COUNT: "count", PATTERN: "pattern" });
export const StrokePatternType = protoEnum("TSD.StrokePatternArchive.StrokePatternType", { PATTERN: "TSDPattern", SOLID: "TSDSolidPattern", EMPTY: "TSDEmptyPattern" });

export interface Stroke {
  color?: Color;
  /** Points. */
  width?: number;
  cap?: number;
  join?: number;
  /** "solid" | "none" | dash lengths in points. */
  pattern?: "solid" | "none" | number[];
}

export function readStroke(message: RawMessage | undefined): Stroke | undefined {
  if (!message) return undefined;
  const out: Stroke = {};
  const color = readColor(message.getMessage(StrokeFields.COLOR));
  if (color) out.color = color;
  const width = message.getFloat(StrokeFields.WIDTH);
  if (width !== undefined) out.width = width;
  const cap = message.getUint(StrokeFields.CAP);
  if (cap !== undefined) out.cap = cap;
  const join = message.getUint(StrokeFields.JOIN);
  if (join !== undefined) out.join = join;
  const pattern = message.getMessage(StrokeFields.PATTERN);
  if (pattern) {
    const type = pattern.getUint(StrokePatternFields.TYPE);
    if (type === StrokePatternType.SOLID) out.pattern = "solid";
    else if (type === StrokePatternType.EMPTY) out.pattern = "none";
    else {
      // The float list is padded to six; `count` states how many are the
      // dash pattern. A corpus dashed border is count 2 with
      // [2,2,0,0,0,0] — a two-dash pattern, not six.
      const dashes = pattern.getFloats(StrokePatternFields.PATTERN);
      const count = pattern.getUint(StrokePatternFields.COUNT);
      const meaningful =
        count !== undefined && count > 0 && count <= dashes.length
          ? dashes.slice(0, count)
          : dashes;
      out.pattern = meaningful.length > 0 ? meaningful : "solid";
    }
  }
  return out;
}

/**
 * Every app-written stroke states cap, join, miter limit and a complete
 * pattern message — measured over all 9,493 strokes at every site the
 * corpus has one: paragraph borders, table band strokes, the
 * cell-border stroke sidecar, chart gridlines and legend outlines,
 * shape and media outlines. Cap 0, join 0, miter 4 is the shape on
 * 8,992 of them; the rest are styles' own round caps and joins and a
 * few miter-8 gridlines, so the defaults here are the app's dominant
 * shape and an explicit cap or join is honoured. The pattern message is
 * always whole: phase 0, the run count, and the float list padded to
 * six — solid and empty state count 0 with six zeros, a dashed border
 * states its dashes and zero-fill. A stroke stating only type renders
 * as no border: the app shows the width but "None" for the stroke,
 * draws nothing, and zeroes `border_positions` on resave.
 */
export function writeStroke(stroke: Stroke): RawMessage {
  const message = RawMessage.create();
  if (stroke.color) message.setMessage(StrokeFields.COLOR, writeColor(stroke.color));
  if (stroke.width !== undefined) message.setFloat(StrokeFields.WIDTH, stroke.width);
  message.setVarint(StrokeFields.CAP, stroke.cap ?? 0);
  message.setVarint(StrokeFields.JOIN, stroke.join ?? 0);
  message.setFloat(StrokeFields.MITER_LIMIT, 4);
  if (stroke.pattern !== undefined) {
    const pattern = RawMessage.create();
    if (stroke.pattern === "solid" || stroke.pattern === "none") {
      pattern.setVarint(
        StrokePatternFields.TYPE,
        stroke.pattern === "solid" ? StrokePatternType.SOLID : StrokePatternType.EMPTY,
      );
      pattern.setFloat(StrokePatternFields.PHASE, 0);
      pattern.setVarint(StrokePatternFields.COUNT, 0);
      pattern.setFloats(StrokePatternFields.PATTERN, [0, 0, 0, 0, 0, 0]);
    } else {
      pattern.setVarint(StrokePatternFields.TYPE, StrokePatternType.PATTERN);
      pattern.setFloat(StrokePatternFields.PHASE, 0);
      pattern.setVarint(StrokePatternFields.COUNT, stroke.pattern.length);
      const floats = [...stroke.pattern];
      while (floats.length < 6) floats.push(0);
      pattern.setFloats(StrokePatternFields.PATTERN, floats);
    }
    message.setMessage(StrokeFields.PATTERN, pattern);
  }
  return message;
}

/**
 * Convenience: a solid border. The 1 pt default width is the app's own
 * — the width its border controls start at, and the corpus mode for
 * borders a person added (139 of 169 paragraph borders, every legend
 * outline).
 */
export function solidStroke(color: Color, width = 1): Stroke {
  return { color, width, pattern: "solid" };
}

// ------------------------------------------------------------------ shadows

/** TSD.ShadowArchive. */
export const ShadowFields = protoFields("TSD.ShadowArchive", {
  COLOR: "color",
  ANGLE: "angle",
  OFFSET: "offset",
  RADIUS: "radius",
  OPACITY: "opacity",
  IS_ENABLED: "is_enabled",
  TYPE: "type",
  // Per-type sub-archives the app writes when a type's own knobs are
  // touched: the corpus's contact shadows carry one float at sub-field
  // 2, and an inspector's curve adjustment writes one at sub-field 1
  // (negative curves inward).
  DROP_SHADOW: "dropShadow",
  CONTACT_SHADOW: "contactShadow",
  CURVED_SHADOW: "curvedShadow",
});
export const ShadowType = protoEnum("TSD.ShadowArchive.ShadowType", { DROP: "TSDDropShadow", CONTACT: "TSDContactShadow", CURVED: "TSDCurvedShadow" });

export interface Shadow {
  color?: Color;
  /** Degrees; Apple's default is 315. */
  angle?: number;
  /** Points. */
  offset?: number;
  /** Blur radius. */
  radius?: number;
  opacity?: number;
  enabled?: boolean;
  type?: number;
}

export function readShadow(message: RawMessage | undefined): Shadow | undefined {
  if (!message) return undefined;
  const out: Shadow = {};
  const color = readColor(message.getMessage(ShadowFields.COLOR));
  if (color) out.color = color;
  for (const [key, field] of [
    ["angle", ShadowFields.ANGLE],
    ["offset", ShadowFields.OFFSET],
    ["opacity", ShadowFields.OPACITY],
  ] as const) {
    const value = message.getFloat(field);
    if (value !== undefined) out[key] = value;
  }
  const radius = message.getUint(ShadowFields.RADIUS);
  if (radius !== undefined) out.radius = radius;
  const enabled = message.getBool(ShadowFields.IS_ENABLED);
  if (enabled !== undefined) out.enabled = enabled;
  const type = message.getUint(ShadowFields.TYPE);
  if (type !== undefined) out.type = type;
  return out;
}

/**
 * What "add a shadow" writes in the app itself — the popup's fresh
 * drop-shadow preset, measured from the app writing it over one of
 * this library's archives (`olekristensen-v26.3-demo11-shadows-
 * returned.pages`): stored angle 90, which the inspector displays as
 * 270° (the UI shows `360 − angle`; the proto's `[default = 315]` is
 * the legacy scale), offset 2, blur 5, half opacity, black.
 *
 * This library's defaults are the app's, here and throughout styling:
 * a user of either expects "add a shadow" to look the same. The
 * archive-level idle defaults untouched theme shadows carry (315, 5,
 * 1, full opacity) are a different, also-measured shape — what a
 * shadow nobody added looks like, not what adding one produces.
 */
export const DEFAULT_SHADOW: Shadow = {
  color: { r: 0, g: 0, b: 0, a: 1 },
  angle: 90,
  offset: 2,
  radius: 5,
  opacity: 0.5,
  enabled: true,
};

/**
 * A shadow archive is written whole. Every parameter-carrying shadow in
 * the corpus — all 929, the 687 disabled ones included — states all
 * seven fields, and every current-era shadow colour names its space
 * (822 of 822; the 107 space-less ones live in five 2013-class files).
 * The only other app-written state is the empty archive. Absent fields
 * are completed from {@link DEFAULT_SHADOW}, the type as drop, the
 * colour's space as sRGB: a six-field shadow renders, but the app's
 * shadow machinery asserts over the archive when its popup edits one,
 * and the assert aborts the whole app.
 */
export function writeShadow(shadow: Shadow): RawMessage {
  const message = RawMessage.create();
  const color = shadow.color ?? DEFAULT_SHADOW.color!;
  message.setMessage(ShadowFields.COLOR, writeColor(color));
  message.setFloat(ShadowFields.ANGLE, shadow.angle ?? DEFAULT_SHADOW.angle!);
  message.setFloat(ShadowFields.OFFSET, shadow.offset ?? DEFAULT_SHADOW.offset!);
  message.setVarint(ShadowFields.RADIUS, shadow.radius ?? DEFAULT_SHADOW.radius!);
  message.setFloat(ShadowFields.OPACITY, shadow.opacity ?? DEFAULT_SHADOW.opacity!);
  message.setBool(ShadowFields.IS_ENABLED, shadow.enabled ?? DEFAULT_SHADOW.enabled!);
  message.setVarint(ShadowFields.TYPE, shadow.type ?? ShadowType.DROP);
  return message;
}

// ----------------------------------------------------------------- padding

/** TSWP.PaddingArchive — reused by table cells and text insets. */
export const PaddingFields = protoFields("TSWP.PaddingArchive", { LEFT: "left", TOP: "top", RIGHT: "right", BOTTOM: "bottom" });

export interface Padding {
  left?: number;
  top?: number;
  right?: number;
  bottom?: number;
}

export function readPadding(message: RawMessage | undefined): Padding | undefined {
  if (!message) return undefined;
  const out: Padding = {};
  for (const [key, field] of [
    ["left", PaddingFields.LEFT],
    ["top", PaddingFields.TOP],
    ["right", PaddingFields.RIGHT],
    ["bottom", PaddingFields.BOTTOM],
  ] as const) {
    const value = message.getFloat(field);
    if (value !== undefined) out[key] = value;
  }
  return out;
}

/**
 * Sides are written exactly as given — this bag supplies no default.
 * For reference, the app's own cell paddings state all four sides,
 * 4 pt each being the norm (4,908 of the corpus's 5,072).
 */
export function writePadding(padding: Padding): RawMessage {
  const message = RawMessage.create();
  if (padding.left !== undefined) message.setFloat(PaddingFields.LEFT, padding.left);
  if (padding.top !== undefined) message.setFloat(PaddingFields.TOP, padding.top);
  if (padding.right !== undefined) message.setFloat(PaddingFields.RIGHT, padding.right);
  if (padding.bottom !== undefined) message.setFloat(PaddingFields.BOTTOM, padding.bottom);
  return message;
}
