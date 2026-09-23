/**
 * Image masks (`TSD.MaskArchive`) — cropping.
 *
 * Cropping an image in iWork does not touch the media. The image keeps its
 * full extent and a **mask** is laid over it: a second drawable whose frame
 * is the window you see through. Everything outside the window is hidden,
 * and dragging the image behind a fixed window is how the apps let you
 * choose which part shows.
 *
 * Two coordinate spaces matter, and getting them the wrong way round
 * silently misplaces every crop:
 *
 *  - the **image**'s geometry is in its parent's space — page, slide, or
 *    sheet — and covers the whole picture, cropped parts included;
 *  - the **mask**'s geometry is in the *image's* space. So the visible
 *    rectangle on the page is `image.position + mask.position`, sized by
 *    the mask.
 *
 * That reading is measured, not assumed. Across the 79 masked images in the
 * corpus it puts the visible rectangle at a non-negative position 78 times
 * and the crop window inside the image 75 times, against 48 for the
 * alternative — and it explains the full-bleed cases exactly, where an
 * image at (-91, -102) carries a mask at (91, 102) so the crop begins
 * precisely at the page origin.
 *
 * **Every mask in the corpus is a rectangle**, but not at the size you might
 * expect. The `BezierPathSourceArchive` holds a rectangle in its *own*
 * space, which the renderer stretches — independently per axis — to
 * `naturalSize`. Of the 79 corpus masks, 30 write the path at exactly
 * `naturalSize`, 12 at a uniform scale of it, and 37 at some other scale
 * entirely; one is a plain 100×100 reference box stretched to 860×880. So
 * the path's dimensions carry no information beyond "this shape is a
 * rectangle", and what actually sizes the crop is `naturalSize`, which
 * equals the mask's own frame in every file examined.
 *
 * That is why resizing changes the geometry and `naturalSize` and leaves
 * the path alone: the shape is already right, and rewriting it would be
 * churn. Instant-alpha and shape crops would not be rectangles — none
 * appears in any corpus file — so a mask whose path is not one is refused
 * rather than flattened into a box.
 */
import { protoFields } from "../proto/fields.ts";
import type { IwaObject } from "../tsp/iwa.ts";
import type { Component, ObjectStore } from "../tsp/store.ts";
import { RawMessage } from "../base/protobuf.ts";
import { makeRef, Point, SizeFields } from "../tsp/schema.ts";
import { DrawableModel } from "./drawables.ts";
import { element, PathElementType, PathFields, rectangleOf, rectanglePath } from "./paths.ts";

export { PathElementType, rectanglePath };
import { buildTextWrap, Drawable, Geometry, TSD_TYPE } from "./schema.ts";

/** TSD.MaskArchive: super = 1, pathsource = 2. */
export const MaskFields = protoFields("TSD.MaskArchive", { SUPER: "super", PATH_SOURCE: "pathsource" });

/** TSD.PathSourceArchive — the subset a mask uses. */
export const PathSourceFields = protoFields("TSD.PathSourceArchive", {
  HORIZONTAL_FLIP: "horizontalFlip",
  VERTICAL_FLIP: "verticalFlip",
  BEZIER_PATH_SOURCE: "bezier_path_source",
});

/** TSD.BezierPathSourceArchive. */
export const BezierPathSourceFields = protoFields("TSD.BezierPathSourceArchive", {
  PATH_STRING: "path_string",
  NATURAL_SIZE: "naturalSize",
  PATH: "path",
});

/** A rectangle, in whichever space the reader documents. */
export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * The crop applied to an image.
 *
 * `window` is in image-local points: `{x: 0, y: 0}` shows the picture from
 * its top-left corner. `visible` is the same rectangle placed in the
 * image's parent, which is where it actually appears.
 */
export interface ImageCrop {
  window: Rect;
  visible: Rect;
  /** The uncropped image's frame in its parent, for reference. */
  full: Rect;
  /** False for instant-alpha and shape crops, which this module leaves alone. */
  isRectangular: boolean;
}

/** A mask drawable, wrapping the geometry that defines the crop window. */
export class MaskModel extends DrawableModel {
  /** The mask's path source, if it has one. */
  pathSource(): RawMessage | undefined {
    return this.object.message.getMessage(MaskFields.PATH_SOURCE);
  }

  /** The mask's `TSD.BezierPathSourceArchive`, if it has one. */
  private bezier(): RawMessage | undefined {
    return this.pathSource()?.getMessage(PathSourceFields.BEZIER_PATH_SOURCE);
  }

  /**
   * True when the path traces a rectangle **in its own space**.
   *
   * Not "a rectangle the size of the frame": the path is stretched to
   * `naturalSize` when drawn, so its own dimensions are arbitrary. The only
   * shape any corpus file uses, and the only one {@link setSize} will
   * touch — resizing an instant-alpha outline would distort the cut-out.
   */
  get isRectangular(): boolean {
    const elements = this.bezier()
      ?.getMessage(BezierPathSourceFields.PATH)
      ?.getMessages(PathFields.ELEMENTS);
    return elements !== undefined && pathIsRectangle(elements);
  }

  /**
   * The rectangle the path traces, in the path's own coordinates.
   *
   * Rarely interesting on its own — the drawn size is `naturalSize` — but
   * it is what {@link isRectangular} tests, so it is worth being able to
   * see.
   */
  pathSize(): { width: number; height: number } | undefined {
    const elements = this.bezier()
      ?.getMessage(BezierPathSourceFields.PATH)
      ?.getMessages(PathFields.ELEMENTS);
    return elements ? rectangleOf(elements) : undefined;
  }

  /** The size the path is stretched to, which is what sizes the crop. */
  naturalSize(): { width: number; height: number } | undefined {
    const size = this.bezier()?.getMessage(BezierPathSourceFields.NATURAL_SIZE);
    const width = size?.getFloat(SizeFields.WIDTH);
    const height = size?.getFloat(SizeFields.HEIGHT);
    return width !== undefined && height !== undefined ? { width, height } : undefined;
  }

  /**
   * Resize the crop window.
   *
   * Changes the frame and `naturalSize` together — they are equal in every
   * corpus file, and `naturalSize` is what the path is stretched to. The
   * path itself is left alone: it already describes a rectangle, and its
   * own dimensions do not reach the rendered result.
   */
  setSize(width: number, height: number): void {
    if (!this.isRectangular) {
      throw new RangeError(
        `mask ${this.id} is not a rectangle; resizing it would distort the cut-out`,
      );
    }
    this.setGeometry({ width, height });
    const bezier = this.bezier();
    if (!bezier) return;
    const size = RawMessage.create();
    size.setFloat(SizeFields.WIDTH, width);
    size.setFloat(SizeFields.HEIGHT, height);
    bezier.setMessage(BezierPathSourceFields.NATURAL_SIZE, size);
  }
}

/**
 * Build the mask archive Apple writes for a rectangular crop.
 *
 * Reproduced field for field from the corpus, including the trailing
 * `moveTo(0,0)` after the closing element — a quirk present in all 79
 * masks examined, and cheap to keep. The mask node is a full drawable:
 * its `parent` is the image it masks (79 of 79 corpus masks carry the
 * field, and never declare it — the container rule), it has its own
 * `exterior_text_wrap`, and it states `locked`,
 * `aspect_ratio_locked`, `title_hidden` and `caption_hidden`
 * explicitly. A bare-geometry mask renders but the app's mask editor
 * will not engage with it.
 */
export function buildRectangularMask(
  store: ObjectStore,
  window: Rect,
  component: Component,
  options: { parentId?: bigint } = {},
): IwaObject {
  const message = RawMessage.create();

  const drawable = RawMessage.create();
  const geometry = RawMessage.create();
  const position = RawMessage.create();
  position.setFloat(Point.X, window.x);
  position.setFloat(Point.Y, window.y);
  const size = RawMessage.create();
  size.setFloat(SizeFields.WIDTH, window.width);
  size.setFloat(SizeFields.HEIGHT, window.height);
  geometry.setMessage(Geometry.POSITION, position);
  geometry.setMessage(Geometry.SIZE, size);
  // Flags 3 (position and size both explicit) is what every corpus mask
  // carries; angle 0 is written explicitly rather than left to default.
  geometry.setVarint(Geometry.FLAGS, 3);
  geometry.setFloat(Geometry.ANGLE, 0);
  drawable.setMessage(Drawable.GEOMETRY, geometry);
  if (options.parentId !== undefined) {
    drawable.setMessage(Drawable.PARENT, makeRef(options.parentId));
  }
  drawable.setMessage(Drawable.EXTERIOR_TEXT_WRAP, buildTextWrap("page"));
  drawable.setBool(Drawable.LOCKED, false);
  drawable.setBool(Drawable.ASPECT_RATIO_LOCKED, false);
  drawable.setBool(Drawable.TITLE_HIDDEN, false);
  drawable.setBool(Drawable.CAPTION_HIDDEN, false);
  message.setMessage(MaskFields.SUPER, drawable);

  const pathSource = RawMessage.create();
  pathSource.setBool(PathSourceFields.HORIZONTAL_FLIP, false);
  pathSource.setBool(PathSourceFields.VERTICAL_FLIP, false);
  const bezier = RawMessage.create();
  writeRectanglePath(bezier, window.width, window.height);
  pathSource.setMessage(PathSourceFields.BEZIER_PATH_SOURCE, bezier);
  message.setMessage(MaskFields.PATH_SOURCE, pathSource);

  const object = store.createObject(TSD_TYPE.MASK, component);
  object.setMessageBytes(message.toBytes());
  return object;
}

/** Write the rectangle path and matching natural size into a bezier source. */
function writeRectanglePath(bezier: RawMessage, width: number, height: number): void {
  const size = RawMessage.create();
  size.setFloat(SizeFields.WIDTH, width);
  size.setFloat(SizeFields.HEIGHT, height);
  bezier.setMessage(BezierPathSourceFields.NATURAL_SIZE, size);

  const path = RawMessage.create();
  const corners: [number, number, number][] = [
    [PathElementType.MOVE_TO, 0, 0],
    [PathElementType.LINE_TO, width, 0],
    [PathElementType.LINE_TO, width, height],
    [PathElementType.LINE_TO, 0, height],
  ];
  for (const [type, x, y] of corners) path.addMessage(PathFields.ELEMENTS, element(type, x, y));
  path.addMessage(PathFields.ELEMENTS, element(PathElementType.CLOSE_SUBPATH));
  // Apple's own trailing moveTo. Harmless, and present in every mask.
  path.addMessage(PathFields.ELEMENTS, element(PathElementType.MOVE_TO, 0, 0));
  bezier.setMessage(BezierPathSourceFields.PATH, path);
}

function pathIsRectangle(elements: readonly RawMessage[]): boolean {
  return rectangleOf(elements) !== undefined;
}

