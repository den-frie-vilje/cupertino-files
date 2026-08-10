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

export function writeColor(color: Color): RawMessage {
  const m = makeColor(color.r, color.g, color.b, color.a ?? 1);
  if (color.space) {
    m.setVarint(ColorFields.RGB_SPACE, color.space === "p3" ? RGB_SPACE.P3 : RGB_SPACE.SRGB);
  }
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
    const gradient = RawMessage.create();
    gradient.setVarint(
      GradientFields.TYPE,
      fill.gradient.type === "radial" ? GradientType.RADIAL : GradientType.LINEAR,
    );
    for (const stop of fill.gradient.stops) {
      const entry = RawMessage.create();
      entry.setMessage(GradientStopFields.COLOR, writeColor(stop.color));
      entry.setFloat(GradientStopFields.FRACTION, stop.fraction);
      // Apple writes an explicit midpoint; default to the true middle.
      entry.setFloat(GradientStopFields.INFLECTION, stop.inflection ?? 0.5);
      gradient.addMessage(GradientFields.STOPS, entry);
    }
    if (fill.gradient.opacity !== undefined) {
      gradient.setFloat(GradientFields.OPACITY, fill.gradient.opacity);
    }
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
      const dashes = pattern.getFloats(StrokePatternFields.PATTERN);
      out.pattern = dashes.length > 0 ? dashes : "solid";
    }
  }
  return out;
}

/**
 * Every app-written paragraph border stroke states cap, join, miter
 * limit 4 and a complete pattern message — phase 0, count 0 and six
 * pattern floats even for solid and empty types (167 of 167 in the
 * corpus). A stroke stating only type renders as no border: the app
 * shows the width but "None" for the stroke, draws nothing, and zeroes
 * `border_positions` on resave.
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
      pattern.setVarint(StrokePatternFields.COUNT, stroke.pattern.length);
      pattern.setFloats(StrokePatternFields.PATTERN, stroke.pattern);
    }
    message.setMessage(StrokeFields.PATTERN, pattern);
  }
  return message;
}

/** Convenience: a solid border. */
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

export function writeShadow(shadow: Shadow): RawMessage {
  const message = RawMessage.create();
  if (shadow.color) message.setMessage(ShadowFields.COLOR, writeColor(shadow.color));
  if (shadow.angle !== undefined) message.setFloat(ShadowFields.ANGLE, shadow.angle);
  if (shadow.offset !== undefined) message.setFloat(ShadowFields.OFFSET, shadow.offset);
  if (shadow.radius !== undefined) message.setVarint(ShadowFields.RADIUS, shadow.radius);
  if (shadow.opacity !== undefined) message.setFloat(ShadowFields.OPACITY, shadow.opacity);
  if (shadow.enabled !== undefined) message.setBool(ShadowFields.IS_ENABLED, shadow.enabled);
  if (shadow.type !== undefined) message.setVarint(ShadowFields.TYPE, shadow.type);
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

export function writePadding(padding: Padding): RawMessage {
  const message = RawMessage.create();
  if (padding.left !== undefined) message.setFloat(PaddingFields.LEFT, padding.left);
  if (padding.top !== undefined) message.setFloat(PaddingFields.TOP, padding.top);
  if (padding.right !== undefined) message.setFloat(PaddingFields.RIGHT, padding.right);
  if (padding.bottom !== undefined) message.setFloat(PaddingFields.BOTTOM, padding.bottom);
  return message;
}
