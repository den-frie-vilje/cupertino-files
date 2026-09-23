/**
 * TSP.Path — the vector outline language every mask path, traced
 * outline and shape path speaks: move/line/curve elements over points
 * in the path's own coordinate space. Shared by masks and drawables,
 * which is why it lives below both.
 */
import { protoEnum } from "../proto/fields.ts";
import { RawMessage } from "../base/protobuf.ts";
import { Point } from "../tsp/schema.ts";

/** TSP.Path / TSP.Path.Element. */
export const PathFields = { ELEMENTS: 1 } as const;
export const PathElement = { TYPE: 1, POINTS: 2 } as const;

/** TSP.Path.ElementType. */
export const PathElementType = protoEnum("TSP.Path.ElementType", {
  MOVE_TO: "moveTo",
  LINE_TO: "lineTo",
  QUAD_CURVE_TO: "quadCurveTo",
  CURVE_TO: "curveTo",
  CLOSE_SUBPATH: "closeSubpath",
});

/**
 * A bare `TSP.Path` rectangle — the shape `traced_path` carries on 30 of
 * the corpus's 31 masked Pages images, sized to the image's natural
 * (source) extent, with the same trailing moveTo as every mask path.
 */
export function rectanglePath(width: number, height: number): RawMessage {
  const path = RawMessage.create();
  const corners: [number, number, number][] = [
    [PathElementType.MOVE_TO, 0, 0],
    [PathElementType.LINE_TO, width, 0],
    [PathElementType.LINE_TO, width, height],
    [PathElementType.LINE_TO, 0, height],
  ];
  for (const [type, x, y] of corners) path.addMessage(PathFields.ELEMENTS, element(type, x, y));
  path.addMessage(PathFields.ELEMENTS, element(PathElementType.CLOSE_SUBPATH));
  path.addMessage(PathFields.ELEMENTS, element(PathElementType.MOVE_TO, 0, 0));
  return path;
}

export function element(type: number, x?: number, y?: number): RawMessage {
  const message = RawMessage.create();
  message.setVarint(PathElement.TYPE, type);
  if (x !== undefined && y !== undefined) {
    const point = RawMessage.create();
    point.setFloat(Point.X, x);
    point.setFloat(Point.Y, y);
    message.setMessage(PathElement.POINTS, point);
  }
  return message;
}

/**
 * The rectangle a path traces, or `undefined` if it traces anything else.
 *
 * Recognises the shape Apple writes: `moveTo(0,0)`, three `lineTo`s round
 * the corners, then a close. The size is read *from the path* rather than
 * checked against an expected one, because the path lives in its own space.
 */
export function rectangleOf(
  elements: readonly RawMessage[],
): { width: number; height: number } | undefined {
  // Four corners plus a close; Apple's trailing moveTo is optional.
  if (elements.length < 5) return undefined;
  const types = [
    PathElementType.MOVE_TO,
    PathElementType.LINE_TO,
    PathElementType.LINE_TO,
    PathElementType.LINE_TO,
  ];
  const corners: [number, number][] = [];
  for (const [index, type] of types.entries()) {
    const element = elements[index]!;
    if (element.getUint(PathElement.TYPE) !== type) return undefined;
    const point = element.getMessages(PathElement.POINTS)[0];
    const x = point?.getFloat(Point.X);
    const y = point?.getFloat(Point.Y);
    if (x === undefined || y === undefined) return undefined;
    corners.push([x, y]);
  }
  if (elements[4]!.getUint(PathElement.TYPE) !== PathElementType.CLOSE_SUBPATH) return undefined;

  const [[x0, y0], [x1, y1], [x2, y2], [x3, y3]] = corners as [
    [number, number],
    [number, number],
    [number, number],
    [number, number],
  ];
  const width = x1 - x0;
  const height = y2 - y1;
  // Axis-aligned: the top edge is horizontal, the right edge vertical, and
  // the fourth corner closes the box.
  if (!closeEnough(y1, y0) || !closeEnough(x2, x1) || !closeEnough(x3, x0)) return undefined;
  if (!closeEnough(y3, y2)) return undefined;
  return { width, height };
}

/** Float32 storage means an exact comparison rejects rectangles it should not. */
function closeEnough(found: number | undefined, wanted: number): boolean {
  if (found === undefined) return false;
  return Math.abs(found - wanted) <= Math.max(1, Math.abs(wanted)) * 1e-5;
}
