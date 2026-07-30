/**
 * Drawable objects (shapes, images, text boxes — anything with a
 * TSD.DrawableArchive core). All concrete drawable archives embed the
 * drawable base through a `super` chain at field 1; this module walks that
 * chain generically to read and edit geometry without needing the concrete
 * schema of every drawable subclass.
 */
import type { IwaObject } from "../iwa.ts";
import { RawMessage } from "../protobuf.ts";
import type { ObjectStore } from "../store.ts";
import { typeName } from "../registry.ts";
import { Drawable, Geometry, Point, SizeFields } from "./schema.ts";

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
  let current: RawMessage | undefined = message;
  for (let depth = 0; depth < maxDepth && current; depth++) {
    const geometry = current.getMessage(Drawable.GEOMETRY);
    if (geometry && looksLikeGeometry(geometry)) return current;
    current = current.getMessage(1) ?? undefined;
  }
  return undefined;
}

function looksLikeGeometry(m: RawMessage): boolean {
  // A GeometryArchive has only small field numbers with point/size children
  // or fixed32 floats; a `super` chain member would itself contain field 1
  // as a message too — disambiguate by checking position/size shape.
  const pos = m.getMessage(Geometry.POSITION);
  const size = m.getMessage(Geometry.SIZE);
  const posOk = pos !== undefined && pos.has(Point.X) && pos.has(Point.Y);
  const sizeOk = size !== undefined && size.has(SizeFields.WIDTH) && size.has(SizeFields.HEIGHT);
  return posOk || sizeOk || m.has(Geometry.ANGLE) || m.has(Geometry.FLAGS);
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
}
