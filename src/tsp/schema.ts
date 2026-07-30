/**
 * TSP family — persistence primitives shared by every iWork message:
 * references, geometry value types, colors, ranges. Field numbers from
 * proto/current/TSPMessages.proto.
 */
import { RawMessage } from "../base/protobuf.ts";

export const TSP_TYPE = {
  PACKAGE_METADATA: 11006,
  PASTEBOARD_METADATA: 11007,
} as const;

/** TSP.Range: location = 1, length = 2. */
export const RANGE_LOCATION = 1;
export const RANGE_LENGTH = 2;

/** TSP.Point / TSP.Size. */
export const Point = { X: 1, Y: 2 } as const;
export const SizeFields = { WIDTH: 1, HEIGHT: 2 } as const;

/** TSP.Color. */
export const ColorFields = { MODEL: 1, R: 3, G: 4, B: 5, A: 6 } as const;
export const COLOR_MODEL_RGB = 1;

/** Build a TSP.Reference message. */
export function makeRef(id: bigint): RawMessage {
  const m = RawMessage.create();
  m.setVarint(1, id);
  return m;
}

/** Read a TSP.Reference field's identifier. */
export function refId(container: RawMessage | undefined, fieldNo: number): bigint | undefined {
  return container?.getMessage(fieldNo)?.getVarint(1);
}

/** Build a TSP.DataReference message (Data/ identifier space). */
export function makeDataRef(id: bigint): RawMessage {
  const m = RawMessage.create();
  m.setVarint(1, id);
  return m;
}

/** Build an sRGB TSP.Color. */
export function makeColor(r: number, g: number, b: number, a = 1): RawMessage {
  const m = RawMessage.create();
  m.setVarint(ColorFields.MODEL, COLOR_MODEL_RGB);
  m.setFloat(ColorFields.R, r);
  m.setFloat(ColorFields.G, g);
  m.setFloat(ColorFields.B, b);
  m.setFloat(ColorFields.A, a);
  return m;
}

/** Collect TSP.Reference identifiers of a (possibly repeated) message field. */
export function pushRef(out: bigint[], container: RawMessage | undefined, fieldNo: number): void {
  if (!container) return;
  for (const ref of container.getMessages(fieldNo)) {
    const id = ref.getVarint(1);
    if (id !== undefined) out.push(id);
  }
}
