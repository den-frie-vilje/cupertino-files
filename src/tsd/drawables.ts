/**
 * Drawable objects (shapes, images, text boxes — anything with a
 * TSD.DrawableArchive core). All concrete drawable archives embed the
 * drawable base through a `super` chain at field 1; this module walks that
 * chain generically to read and edit geometry without needing the concrete
 * schema of every drawable subclass.
 */
import type { IwaObject } from "../tsp/iwa.ts";
import { RawMessage, WireType } from "../base/protobuf.ts";
import type { ObjectStore } from "../tsp/store.ts";
import { typeName, type IWorkApp } from "../tsp/registry.ts";
import { Drawable, Geometry } from "./schema.ts";
import { Point, refId, SizeFields } from "../tsp/schema.ts";
import type { Fill, Shadow, Stroke } from "./style.ts";
import { readFill, readShadow, readStroke, writeFill, writeShadow, writeStroke } from "./style.ts";

export interface GeometryInfo {
  x: number | undefined;
  y: number | undefined;
  width: number | undefined;
  height: number | undefined;
  /** Radians. */
  angle: number | undefined;
  flags: number | undefined;
}

/**
 * Locate the TSD.DrawableArchive submessage inside a concrete drawable by
 * following `super` (field 1) chains until a message carrying a
 * TSD.GeometryArchive (field 1 with position/size shape) is found.
 */
export function findDrawableCore(message: RawMessage, maxDepth = 6): RawMessage | undefined {
  // Field 1 is `super` in a drawable and something else entirely in the
  // other archives that reach here — an attachment table lists footnote
  // marks and smart fields beside drawables — so every read is wire-type
  // guarded. A search returns `undefined` for "not one of these"; it does
  // not throw.
  const submessage = (m: RawMessage, field: number): RawMessage | undefined => {
    try {
      return m.fieldWire(field) === WireType.Bytes ? m.getMessage(field) : undefined;
    } catch {
      return undefined;
    }
  };
  let current: RawMessage | undefined = message;
  for (let depth = 0; depth < maxDepth && current; depth++) {
    const geometry = submessage(current, Drawable.GEOMETRY);
    if (geometry && looksLikeGeometry(geometry)) return current;
    current = submessage(current, 1);
  }
  return undefined;
}

function looksLikeGeometry(m: RawMessage): boolean {
  // A GeometryArchive holds a TSP.Point at 1 and TSP.Size at 2, both made of
  // fixed32 floats. Checking wire types (not just presence) is what keeps
  // unrelated messages with small field numbers from matching.
  const isFloatPair = (child: RawMessage | undefined, a: number, b: number): boolean =>
    child !== undefined &&
    child.fieldWire(a) === WireType.Fixed32 &&
    child.fieldWire(b) === WireType.Fixed32;
  let pos: RawMessage | undefined;
  let size: RawMessage | undefined;
  try {
    pos = m.fieldWire(Geometry.POSITION) === WireType.Bytes ? m.getMessage(Geometry.POSITION) : undefined;
    size = m.fieldWire(Geometry.SIZE) === WireType.Bytes ? m.getMessage(Geometry.SIZE) : undefined;
  } catch {
    return false; // field 1/2 not parseable as messages
  }
  return isFloatPair(pos, Point.X, Point.Y) || isFloatPair(size, SizeFields.WIDTH, SizeFields.HEIGHT);
}

export class DrawableModel {
  readonly store: ObjectStore;
  readonly object: IwaObject;

  constructor(store: ObjectStore, object: IwaObject) {
    this.store = store;
    this.object = object;
  }

  get id(): bigint {
    return this.object.identifier;
  }

  get type(): number {
    return this.object.type;
  }

  get typeName(): string | undefined {
    return typeName(this.object.type, this.store.app);
  }

  private core(): RawMessage | undefined {
    return findDrawableCore(this.object.message);
  }

  geometry(): GeometryInfo | undefined {
    const core = this.core();
    const g = core?.getMessage(Drawable.GEOMETRY);
    if (!g) return undefined;
    const pos = g.getMessage(Geometry.POSITION);
    const size = g.getMessage(Geometry.SIZE);
    return {
      x: pos?.getFloat(Point.X),
      y: pos?.getFloat(Point.Y),
      width: size?.getFloat(SizeFields.WIDTH),
      height: size?.getFloat(SizeFields.HEIGHT),
      angle: g.getFloat(Geometry.ANGLE),
      flags: g.getUint(Geometry.FLAGS),
    };
  }

  /** Move and/or resize. Only the provided components are changed. */
  setGeometry(update: { x?: number; y?: number; width?: number; height?: number; angle?: number }): void {
    const core = this.core();
    if (!core) throw new RangeError(`object ${this.id}: no drawable geometry found`);
    let g = core.getMessage(Drawable.GEOMETRY);
    if (!g) {
      g = RawMessage.create();
      core.setMessage(Drawable.GEOMETRY, g);
    }
    if (update.x !== undefined || update.y !== undefined) {
      let pos = g.getMessage(Geometry.POSITION);
      if (!pos) {
        pos = RawMessage.create();
        g.setMessage(Geometry.POSITION, pos);
      }
      if (update.x !== undefined) pos.setFloat(Point.X, update.x);
      if (update.y !== undefined) pos.setFloat(Point.Y, update.y);
    }
    if (update.width !== undefined || update.height !== undefined) {
      let size = g.getMessage(Geometry.SIZE);
      if (!size) {
        size = RawMessage.create();
        g.setMessage(Geometry.SIZE, size);
      }
      if (update.width !== undefined) size.setFloat(SizeFields.WIDTH, update.width);
      if (update.height !== undefined) size.setFloat(SizeFields.HEIGHT, update.height);
    }
    if (update.angle !== undefined) g.setFloat(Geometry.ANGLE, update.angle);
  }

  get hyperlinkUrl(): string | undefined {
    return this.core()?.getString(Drawable.HYPERLINK_URL);
  }

  get accessibilityDescription(): string | undefined {
    return this.core()?.getString(Drawable.ACCESSIBILITY_DESCRIPTION);
  }

  set accessibilityDescription(value: string | undefined) {
    const core = this.core();
    if (!core) throw new RangeError(`object ${this.id}: not a drawable`);
    if (value === undefined) core.remove(Drawable.ACCESSIBILITY_DESCRIPTION);
    else core.setString(Drawable.ACCESSIBILITY_DESCRIPTION, value);
  }

  /**
   * Visual style — fill, stroke, opacity, shadow, reflection.
   *
   * This is where drawable **shadows** live. Cell and table styles have no
   * shadow field at all, so a shadow on a table means a shadow on the
   * shape or image, not on its cells.
   */
  style(): DrawableStyleHandle | undefined {
    const styleObject = this.styleObject();
    return styleObject ? new DrawableStyleHandle(this.store, styleObject) : undefined;
  }

  /**
   * Resolve the drawable's style object.
   *
   * The field number differs per concrete archive (`ShapeArchive.style` is
   * 2, `ImageArchive.style` is 3, and so on), so rather than tabulate every
   * subclass we resolve each reference-shaped field and keep the one that
   * lands on a shape or media style.
   */
  private styleObject(): IwaObject | undefined {
    for (const field of this.object.message.fields) {
      if (field.wire !== WireType.Bytes) continue;
      const id = refId(this.object.message, field.no);
      if (id === undefined) continue;
      const target = this.store.object(id);
      if (target && isDrawableStyleType(target.type, this.store.app)) return target;
    }
    return undefined;
  }
}

/** Type ids of the TSD style archives, and the wrappers that embed them. */
const TSD_SHAPE_STYLE = 3015;
const TSD_MEDIA_STYLE = 3016;

function isDrawableStyleType(type: number, app: IWorkApp): boolean {
  if (type === TSD_SHAPE_STYLE || type === TSD_MEDIA_STYLE) return true;
  const name = typeName(type, app);
  return name !== undefined && /(Shape|Media)StyleArchive$/.test(name);
}

/**
 * The TSD property bag inside a (possibly wrapped) drawable style.
 *
 * `TSWP.ShapeStyleArchive` puts its own *text-frame* properties (columns,
 * padding, vertical alignment) at field 11 and keeps the visual ones in
 * `super`. Descending while the child still has a field-11 bag lands on
 * the TSD properties in both the wrapped and unwrapped cases.
 */
function drawableStyleProperties(message: RawMessage): RawMessage | undefined {
  let node = message;
  let props = message.getMessage(DRAWABLE_STYLE_PROPERTIES);
  for (let depth = 0; depth < 4; depth++) {
    const child = node.getMessage(1);
    const childProps = child?.getMessage(DRAWABLE_STYLE_PROPERTIES);
    if (!child || !childProps) break;
    node = child;
    props = childProps;
  }
  return props;
}

const DRAWABLE_STYLE_PROPERTIES = 11;

/**
 * Field numbers differ between shape and media property bags — media has
 * no fill, so everything after it shifts down by one.
 */
const SHAPE_STYLE_FIELDS = { FILL: 1, STROKE: 2, OPACITY: 3, SHADOW: 4, REFLECTION: 5 } as const;
const MEDIA_STYLE_FIELDS = { STROKE: 1, OPACITY: 2, SHADOW: 3, REFLECTION: 4 } as const;

export interface DrawableStyle {
  /** Shapes only — media (images, movies) cannot carry a fill. */
  fill?: Fill | null;
  stroke?: Stroke | null;
  /** 0..1. */
  opacity?: number;
  shadow?: Shadow | null;
  /** Mirror below the object; the value is its opacity, 0..1. */
  reflection?: number | null;
}

/** A live view of one drawable's visual style. */
export class DrawableStyleHandle {
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
   * True for images and movies, whose property bag omits `fill` and so
   * numbers every later field one lower.
   *
   * Decided by declared type where known, and structurally otherwise:
   * field 2 is a stroke message in a shape bag but the float opacity in a
   * media bag, so its wire type settles the question for wrapper types the
   * registry does not name.
   */
  get isMedia(): boolean {
    if (this.object.type === TSD_MEDIA_STYLE) return true;
    if (this.object.type === TSD_SHAPE_STYLE) return false;
    const name = typeName(this.object.type, this.store.app);
    if (name !== undefined && /MediaStyleArchive$/.test(name)) return true;
    if (name !== undefined && /ShapeStyleArchive$/.test(name)) return false;
    return this.properties()?.fieldWire(2) === WireType.Fixed32;
  }

  private properties(): RawMessage | undefined {
    return drawableStyleProperties(this.object.message);
  }

  private fields(): { FILL?: number; STROKE: number; OPACITY: number; SHADOW: number; REFLECTION: number } {
    return this.isMedia ? MEDIA_STYLE_FIELDS : SHAPE_STYLE_FIELDS;
  }

  /** Everything this style sets, in one object. */
  read(): DrawableStyle {
    const props = this.properties();
    const out: DrawableStyle = {};
    if (!props) return out;
    const fields = this.fields();
    if (fields.FILL !== undefined) {
      const fill = readFill(props.getMessage(fields.FILL));
      if (fill) out.fill = fill;
    }
    const stroke = readStroke(props.getMessage(fields.STROKE));
    if (stroke) out.stroke = stroke;
    const opacity = props.getFloat(fields.OPACITY);
    if (opacity !== undefined) out.opacity = opacity;
    const shadow = readShadow(props.getMessage(fields.SHADOW));
    if (shadow) out.shadow = shadow;
    const reflection = props.getMessage(fields.REFLECTION)?.getFloat(REFLECTION_OPACITY);
    if (reflection !== undefined) out.reflection = reflection;
    return out;
  }

  shadow(): Shadow | undefined {
    return this.read().shadow ?? undefined;
  }

  /**
   * Merge visual properties into this style.
   *
   * `null` removes a property outright; omitting it leaves whatever was
   * there. Note that a shadow with `enabled: false` is how the apps store
   * "shadow configured but switched off" — removing the archive and
   * disabling it are different states, and both are expressible.
   */
  set(style: DrawableStyle): this {
    let props = this.properties();
    if (!props) {
      props = RawMessage.create();
      this.object.message.setMessage(DRAWABLE_STYLE_PROPERTIES, props);
    }
    const fields = this.fields();
    if (style.fill !== undefined) {
      if (fields.FILL === undefined) {
        throw new RangeError(`style ${this.id} is a media style; images and movies have no fill`);
      }
      if (style.fill === null) props.remove(fields.FILL);
      else props.setMessage(fields.FILL, writeFill(style.fill));
    }
    if (style.stroke !== undefined) {
      if (style.stroke === null) props.remove(fields.STROKE);
      else props.setMessage(fields.STROKE, writeStroke(style.stroke));
    }
    if (style.opacity !== undefined) props.setFloat(fields.OPACITY, style.opacity);
    if (style.shadow !== undefined) {
      if (style.shadow === null) props.remove(fields.SHADOW);
      else props.setMessage(fields.SHADOW, writeShadow(style.shadow));
    }
    if (style.reflection !== undefined) {
      if (style.reflection === null) props.remove(fields.REFLECTION);
      else {
        const reflection = RawMessage.create();
        reflection.setFloat(REFLECTION_OPACITY, style.reflection);
        props.setMessage(fields.REFLECTION, reflection);
      }
    }
    this.object.message.setVarint(DRAWABLE_STYLE_OVERRIDE_COUNT, props.fields.length);
    return this;
  }

  /** Turn a shadow on or off without discarding its parameters. */
  setShadowEnabled(enabled: boolean): this {
    const existing = this.read().shadow;
    return this.set({ shadow: { ...(existing ?? DEFAULT_SHADOW), enabled } });
  }
}

/** TSD.ReflectionArchive holds only its opacity. */
const REFLECTION_OPACITY = 1;
const DRAWABLE_STYLE_OVERRIDE_COUNT = 10;

/**
 * The parameters Apple defaults a fresh drop shadow to. The inspector
 * displays `360 − angle`: stored 45 is the standard down-right shadow
 * the UI calls 315°, and stored 315 renders up-right as UI 45° — the
 * proto's `[default = 315]` describes the legacy scale, not the
 * inspector's.
 */
export const DEFAULT_SHADOW: Shadow = {
  color: { r: 0, g: 0, b: 0, a: 1 },
  angle: 45,
  offset: 5,
  radius: 1,
  opacity: 1,
  enabled: true,
};

/** Every drawable in a document that carries a visual style. */
export function drawableStylesOf(store: ObjectStore): DrawableStyleHandle[] {
  const out: DrawableStyleHandle[] = [];
  for (const { obj } of store.allObjects()) {
    if (isDrawableStyleType(obj.type, store.app)) out.push(new DrawableStyleHandle(store, obj));
  }
  return out;
}
