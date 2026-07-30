/**
 * Cell controls (`TST.CellSpecArchive`) — Numbers' data-entry widgets.
 *
 * A cell can carry a control instead of a plain editing caret: a checkbox,
 * a star rating, a slider, a stepper, or a pop-up menu. The control lives
 * in `DataStore.control_cell_spec_table`, interned by key exactly like
 * strings and formats, and a cell's record points at it through the
 * `CONTROL_ID` field (flag `0x400`).
 *
 * ```proto
 * message TST.CellSpecArchive {
 *   required uint32 interaction_type = 1;
 *   optional TSCE.FormulaArchive formula = 2;
 *   optional double range_control_min = 3;
 *   optional double range_control_max = 4;
 *   optional double range_control_inc = 5;
 *   optional TSP.Reference chooser_control_popup_model = 6;
 *   optional bool chooser_control_start_w_first = 7;
 * }
 * ```
 *
 * **No fixture contains one.** All 37 documents were surveyed: zero control
 * spec tables, zero cells with the control flag set, zero `CellSpecArchive`
 * objects. So unlike the rest of this library, the reading here rests on
 * the schema alone, and two consequences follow:
 *
 *  - `interactionType` is exposed as a **raw number**. The field names make
 *    the *shapes* obvious — a control with min/max/increment is a slider or
 *    a stepper, one with a popup model is a menu — so
 *    {@link controlShape} reports what the archive demonstrably contains
 *    rather than which of the five widgets Apple would draw.
 *  - Nothing here creates a control. A widget the apps quietly drop looks
 *    exactly like one that was never written.
 *
 * `scripts/probe-controls.ts` prints everything a real document's controls
 * contain. One Numbers file with a checkbox, a slider and a pop-up menu —
 * two minutes of work on any Mac — pins `interaction_type` for good. See
 * `docs/MANUAL-WORK.md` protocol 6.
 */
import type { IwaObject } from "../tsp/iwa.ts";
import type { ObjectStore } from "../tsp/store.ts";
import type { RawMessage } from "../base/protobuf.ts";
import { refId } from "../tsp/schema.ts";

/** TST.DataStore.control_cell_spec_table. */
export const CONTROL_CELL_SPEC_TABLE = 21;

/** TST.CellSpecArchive. */
export const CellSpecFields = {
  INTERACTION_TYPE: 1,
  FORMULA: 2,
  RANGE_MIN: 3,
  RANGE_MAX: 4,
  RANGE_INCREMENT: 5,
  CHOOSER_POPUP_MODEL: 6,
  CHOOSER_START_WITH_FIRST: 7,
} as const;

/**
 * What the archive's own contents show the control to be.
 *
 * Derived from which fields are populated, not from `interaction_type`:
 * the field names are published and the enum is not, so this says what can
 * be demonstrated and leaves the rest to the raw code.
 */
export type ControlShape =
  /** Has min, max and increment — a slider or a stepper. */
  | "range"
  /** Has a popup model — a pop-up menu. */
  | "chooser"
  /** Has a formula and nothing else — a computed control. */
  | "formula"
  /** No distinguishing fields; a checkbox or star rating would look like this. */
  | "toggle";

/** A control attached to one or more cells. */
export interface CellControl {
  /** Key in the table's control-spec list, which cells point at. */
  key: number;
  /** Raw `interaction_type`; the enum is not published, see the module note. */
  interactionType: number | undefined;
  shape: ControlShape;
  /** Slider and stepper bounds. */
  minimum: number | undefined;
  maximum: number | undefined;
  increment: number | undefined;
  /** The popup model a chooser draws its items from. */
  popupModelId: bigint | undefined;
  /** True when a chooser starts on its first item rather than empty. */
  startsWithFirstItem: boolean | undefined;
  /** True when the control computes its value rather than storing one. */
  hasFormula: boolean;
  /**
   * Field numbers the archive actually populates.
   *
   * The point of reporting these: with `interaction_type` unpublished, the
   * set of populated fields is what distinguishes one widget from another,
   * and `scripts/probe-unknowns.ts` prints it so a document made in Numbers
   * pins the enum in one pass.
   */
  populatedFields: number[];
}

/** Classify a spec by what it actually carries. */
export function controlShape(spec: RawMessage): ControlShape {
  if (spec.has(CellSpecFields.CHOOSER_POPUP_MODEL)) return "chooser";
  if (
    spec.has(CellSpecFields.RANGE_MIN) ||
    spec.has(CellSpecFields.RANGE_MAX) ||
    spec.has(CellSpecFields.RANGE_INCREMENT)
  ) {
    return "range";
  }
  if (spec.has(CellSpecFields.FORMULA)) return "formula";
  return "toggle";
}

/** Read one `TST.CellSpecArchive`. */
export function readCellSpec(spec: RawMessage, key: number): CellControl {
  return {
    key,
    interactionType: spec.getUint(CellSpecFields.INTERACTION_TYPE),
    shape: controlShape(spec),
    minimum: spec.getDouble(CellSpecFields.RANGE_MIN),
    maximum: spec.getDouble(CellSpecFields.RANGE_MAX),
    increment: spec.getDouble(CellSpecFields.RANGE_INCREMENT),
    popupModelId: refId(spec, CellSpecFields.CHOOSER_POPUP_MODEL),
    startsWithFirstItem: spec.getBool(CellSpecFields.CHOOSER_START_WITH_FIRST),
    hasFormula: spec.has(CellSpecFields.FORMULA),
    populatedFields: [...new Set(spec.fields.map((field) => field.no))].sort((a, b) => a - b),
  };
}

/** TST.TableDataList / .ListEntry, as used by the control-spec table. */
const DataList = { ENTRIES: 3 } as const;
const ListEntry = { KEY: 1, CELL_SPEC: 7 } as const;

/**
 * Every control a table interns, by key.
 *
 * The list entry's payload field is not stated by any proto this repository
 * has, so both plausible slots are tried: a `cell_spec` submessage, and a
 * reference to a standalone archive. A file that uses either decodes; one
 * that uses neither yields nothing rather than a wrong reading.
 */
export function controlsOf(store: ObjectStore, dataStore: RawMessage | undefined): Map<number, CellControl> {
  const out = new Map<number, CellControl>();
  const list = store.resolve(refId(dataStore, CONTROL_CELL_SPEC_TABLE));
  for (const entry of list?.message.getMessages(DataList.ENTRIES) ?? []) {
    const key = entry.getUint(ListEntry.KEY);
    if (key === undefined) continue;
    const inline = readSpecMessage(entry);
    if (inline) out.set(key, readCellSpec(inline, key));
  }
  return out;
}

/** The spec inside a list entry, inline or referenced. */
function readSpecMessage(entry: RawMessage): RawMessage | undefined {
  for (const field of entry.fields) {
    if (field.wire !== 2) continue;
    let sub: RawMessage | undefined;
    try {
      sub = entry.getMessage(field.no);
    } catch {
      continue;
    }
    if (!sub) continue;
    // A spec always states its interaction type; a bare reference is one
    // varint at field 1 and would be misread as a type-1 control.
    if (sub.fields.length === 1 && sub.fields[0]!.no === 1 && sub.fields[0]!.wire === 0) {
      continue;
    }
    if (sub.has(CellSpecFields.INTERACTION_TYPE)) return sub;
  }
  return undefined;
}

/** Standalone `TST.CellSpecArchive` objects, for a store that keeps them out of line. */
export function cellSpecObjects(store: ObjectStore, typeId: number): IwaObject[] {
  const out: IwaObject[] = [];
  for (const { obj } of store.allObjects()) {
    if (obj.type === typeId) out.push(obj);
  }
  return out;
}
