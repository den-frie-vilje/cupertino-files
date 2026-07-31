/**
 * Numbers cell controls — the five data-entry widgets.
 *
 * `interaction_type` is an enum Apple never published. It was settled by
 * reading documents that lay one widget out per row and state in their own
 * cell values which row is which — a checkbox row holding FALSE/TRUE, a
 * star row bounded [0…5], a slider row whose bounds match a published test
 * that builds exactly that cell as a slider.
 *
 * Those documents are not in this repository: they were read, measured and
 * discarded. What survives is the measurement, and these tests are it. Each
 * one rebuilds a spec byte-for-byte as it appeared — including the list
 * entry's field 12 wrapper — so the reader is checked against the real
 * layout rather than against a convenient one.
 */
import { describe, expect, it } from "./harness.ts";
import { RawMessage } from "../src/base/protobuf.ts";
import {
  CellSpecFields,
  INTERACTION_TYPE_NAMES,
  InteractionType,
  controlShape,
  readCellSpec,
  readControlList,
} from "../src/tst/controls.ts";

/** A spec exactly as observed: interaction type, then whatever it configures. */
function spec(type: number, fields: Partial<Record<"min" | "max" | "inc", number>> = {}): RawMessage {
  const m = RawMessage.create();
  m.setVarint(CellSpecFields.INTERACTION_TYPE, type);
  if (fields.min !== undefined) m.setDouble(CellSpecFields.RANGE_MIN, fields.min);
  if (fields.max !== undefined) m.setDouble(CellSpecFields.RANGE_MAX, fields.max);
  if (fields.inc !== undefined) m.setDouble(CellSpecFields.RANGE_INCREMENT, fields.inc);
  return m;
}

/** A chooser, whose popup model is a reference rather than a scalar. */
function chooserSpec(startsWithFirst: boolean): RawMessage {
  const m = RawMessage.create();
  m.setVarint(CellSpecFields.INTERACTION_TYPE, InteractionType.POPUP_MENU);
  const ref = RawMessage.create();
  ref.setVarint(1, 905376);
  m.setMessage(CellSpecFields.CHOOSER_POPUP_MODEL, ref);
  m.setVarint(CellSpecFields.CHOOSER_START_WITH_FIRST, startsWithFirst ? 1 : 0);
  return m;
}

describe("cell control specs", () => {
  it("names every widget Numbers offers", () => {
    // The five rows of the document this came from, in its own order.
    const observed: [number, string][] = [
      [8, "checkbox"],
      [6, "star rating"],
      [5, "slider"],
      [4, "stepper"],
      [7, "pop-up menu"],
    ];
    for (const [type, name] of observed) {
      expect(INTERACTION_TYPE_NAMES.get(type)).toBe(name);
    }
    // Nothing else is claimed. A sixth widget must be measured, not guessed.
    expect([...INTERACTION_TYPE_NAMES.keys()].sort((a, b) => a - b)).toEqual([4, 5, 6, 7, 8]);
  });

  it("reads a checkbox, whose whole spec is one varint", () => {
    // This is the case that used to be dropped: a lone interaction_type is
    // indistinguishable from a bare TSP.Reference unless you know the field.
    const control = readCellSpec(spec(InteractionType.CHECKBOX), 5);
    expect(control.interactionType).toBe(8);
    expect(control.widget).toBe("checkbox");
    expect(control.shape).toBe("toggle");
    expect(control.minimum).toBe(undefined);
    expect(control.populatedFields).toEqual([1]);
  });

  it("reads a star rating as a bounded range", () => {
    const control = readCellSpec(spec(InteractionType.STAR_RATING, { min: 0, max: 5, inc: 1 }), 2);
    expect(control.widget).toBe("star rating");
    expect(control.shape).toBe("range");
    expect(control.minimum).toBe(0);
    expect(control.maximum).toBe(5);
    expect(control.increment).toBe(1);
  });

  it("distinguishes a slider from a stepper by code, not by contents", () => {
    // Both carry min/max/increment and nothing else, which is exactly why
    // the enum had to be measured: shape alone cannot separate them.
    const slider = readCellSpec(spec(InteractionType.SLIDER, { min: 1, max: 50, inc: 0.1 }), 10);
    const stepper = readCellSpec(spec(InteractionType.STEPPER, { min: 1, max: 67, inc: 0.01 }), 7);
    expect(slider.widget).toBe("slider");
    expect(stepper.widget).toBe("stepper");
    expect(slider.shape).toBe(stepper.shape);
    expect(slider.populatedFields).toEqual(stepper.populatedFields);
  });

  it("reads a pop-up menu and its start-with-first flag", () => {
    const on = readCellSpec(chooserSpec(true), 1);
    expect(on.widget).toBe("pop-up menu");
    expect(on.shape).toBe("chooser");
    expect(on.popupModelId).toBe(905376n);
    expect(on.startsWithFirstItem).toBe(true);
    expect(readCellSpec(chooserSpec(false), 8).startsWithFirstItem).toBe(false);
  });

  it("carries an unrecognised code through instead of rejecting it", () => {
    // A future Numbers with a sixth widget must still round-trip, and must
    // still be classified by what its archive contains.
    const control = readCellSpec(spec(99, { min: 1, max: 2, inc: 1 }), 1);
    expect(control.interactionType).toBe(99);
    expect(control.widget).toBe(undefined);
    expect(control.shape).toBe("range");
  });

  it("classifies by contents even with no interaction type at all", () => {
    const bare = RawMessage.create();
    expect(controlShape(bare)).toBe("toggle");
    bare.setDouble(CellSpecFields.RANGE_MAX, 10);
    expect(controlShape(bare)).toBe("range");
  });
});

describe("the control spec table", () => {
  /** A TST.TableDataList holding each spec in a field-12 list entry. */
  function listOf(specs: [key: number, spec: RawMessage][]): RawMessage {
    const list = RawMessage.create();
    for (const [key, s] of specs) {
      const entry = RawMessage.create();
      entry.setVarint(1, key);
      entry.setMessage(12, s);
      list.addMessage(3, entry);
    }
    return list;
  }

  it("reads every entry, including the single-varint checkbox", () => {
    const controls = readControlList(
      listOf([
        [1, chooserSpec(true)],
        [2, spec(InteractionType.STAR_RATING, { min: 0, max: 5, inc: 1 })],
        [3, spec(InteractionType.SLIDER, { min: 1, max: 100, inc: 1 })],
        [4, spec(InteractionType.STEPPER, { min: 1, max: 100, inc: 1 })],
        [5, spec(InteractionType.CHECKBOX)],
      ]),
    );
    expect(controls.size).toBe(5);
    expect([...controls.values()].map((c) => c.widget)).toEqual([
      "pop-up menu",
      "star rating",
      "slider",
      "stepper",
      "checkbox",
    ]);
    // Keys are the table's own, not positions.
    expect([...controls.keys()]).toEqual([1, 2, 3, 4, 5]);
  });

  it("still reads a spec parked at some other field", () => {
    // The fallback scan exists so a layout from another Numbers version
    // decodes rather than yielding nothing.
    const entry = RawMessage.create();
    entry.setVarint(1, 3);
    entry.setMessage(7, spec(InteractionType.SLIDER, { min: 0, max: 1, inc: 0.5 }));
    const list = RawMessage.create();
    list.addMessage(3, entry);
    expect(readControlList(list).get(3)?.widget).toBe("slider");
  });

  it("does not mistake a bare reference at an unknown field for a control", () => {
    // A lone varint at field 1 is what a TSP.Reference looks like. At an
    // unknown field it must not be read as an interaction type of 1.
    const entry = RawMessage.create();
    entry.setVarint(1, 9);
    const ref = RawMessage.create();
    ref.setVarint(1, 12345);
    entry.setMessage(5, ref);
    const list = RawMessage.create();
    list.addMessage(3, entry);
    expect(readControlList(list).size).toBe(0);
  });

  it("yields nothing rather than guessing when the table is absent", () => {
    expect(readControlList(RawMessage.create()).size).toBe(0);
  });
});
