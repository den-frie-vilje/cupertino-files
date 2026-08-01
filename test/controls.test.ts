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
import { readFileSync } from "node:fs";
import { describe, expect, it } from "./harness.ts";
import { NumbersDocument } from "../src/index.ts";
import { CellFlag } from "../src/tst/cellrecord.ts";
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

describe("writing cell controls", () => {
  /**
   * Creating a widget was withheld until `interaction_type` was measured:
   * a control the apps silently drop looks exactly like one that was never
   * written, so a wrong code is undetectable from here.
   *
   * The list these are interned in is not invented either. Apple writes the
   * control table into 44 of the corpus's 50 tables — empty, because none
   * of those documents uses a widget — and every one declares
   * `list_type = 12`.
   */
  const FIXTURES = new URL("../fixtures/", import.meta.url);
  const load = () =>
    NumbersDocument.load(
      new Uint8Array(readFileSync(new URL("numbers-parser-v26.0-categories.numbers", FIXTURES))),
    );

  it("writes every widget it can build, and reads each one back", () => {
    const doc = load();
    const table = doc.tables()[0]!;
    table.setCellControl(1, 0, { widget: "checkbox", value: true });
    table.setCellControl(2, 0, { widget: "starRating", value: 3 });
    table.setCellControl(3, 0, {
      widget: "slider",
      minimum: 1,
      maximum: 50,
      increment: 0.1,
      value: 12.3,
    });
    table.setCellControl(4, 0, {
      widget: "stepper",
      minimum: 0,
      maximum: 10,
      increment: 1,
      value: 4,
    });

    const after = NumbersDocument.load(doc.save()).tables()[0]!;
    expect(after.cellControl(1, 0)?.widget).toBe("checkbox");
    expect(after.cellControl(2, 0)?.widget).toBe("star rating");
    expect(after.cellControl(3, 0)?.widget).toBe("slider");
    expect(after.cellControl(4, 0)?.widget).toBe("stepper");
    // The widget changes how a value is edited; the value is still the
    // cell's, and a control with nothing to show is not much of a control.
    expect(after.cellText(1, 0)).toBe("TRUE");
    expect(after.cellText(2, 0)).toBe("3");
    expect(after.cellText(3, 0)).toBe("12.3");
  });

  it("shares one spec between cells that want the same widget", () => {
    // A column of checkboxes is one archive and forty pointers in the app's
    // own output; writing forty copies would be larger and unlike it.
    const doc = load();
    const table = doc.tables()[0]!;
    const first = table.setCellControl(1, 0, { widget: "checkbox", value: true });
    const second = table.setCellControl(2, 0, { widget: "checkbox", value: false });
    expect(second).toBe(first);
    expect(table.controls().size).toBe(1);

    // A different configuration is a different spec.
    table.setCellControl(3, 0, { widget: "stepper", minimum: 0, maximum: 9, increment: 1 });
    expect(table.controls().size).toBe(2);
  });

  it("keeps the bounds it was given", () => {
    const doc = load();
    const table = doc.tables()[0]!;
    table.setCellControl(1, 0, {
      widget: "slider",
      minimum: -100,
      maximum: 100,
      increment: 0.25,
      value: 0,
    });
    const control = NumbersDocument.load(doc.save()).tables()[0]!.cellControl(1, 0)!;
    expect(control.minimum).toBe(-100);
    expect(control.maximum).toBe(100);
    expect(control.increment).toBe(0.25);
    // A star rating's bounds are fixed; the app offers no way to change them.
    const other = load().tables()[0]!;
    other.setCellControl(2, 0, { widget: "starRating" });
    expect(other.cellControl(2, 0)?.maximum).toBe(5);
  });

  it("takes a widget off without taking the value with it", () => {
    const doc = load();
    const table = doc.tables()[0]!;
    table.setCellControl(1, 0, { widget: "starRating", value: 4 });
    expect(table.removeCellControl(1, 0)).toBe(true);
    expect(table.removeCellControl(1, 0)).toBe(false);

    const after = NumbersDocument.load(doc.save()).tables()[0]!;
    expect(after.cellControl(1, 0)).toBe(undefined);
    expect(after.cellText(1, 0)).toBe("4");
  });

  it("refuses bounds that describe no usable widget", () => {
    const table = load().tables()[0]!;
    const rejected = (fn: () => void): string => {
      try {
        fn();
        return "accepted";
      } catch (error) {
        return (error as Error).message;
      }
    };
    expect(
      rejected(() => table.setCellControl(1, 0, { widget: "slider", minimum: 0, maximum: 10, increment: 0 })),
    ).toContain("increment must be positive");
    expect(
      rejected(() => table.setCellControl(1, 0, { widget: "stepper", minimum: 10, maximum: 1, increment: 1 })),
    ).toContain("must exceed minimum");
  });

  it("attaches a pop-up menu model but will not invent one", () => {
    // The menu's list of choices is a separate archive whose shape no
    // document here contains. Given one, attaching it is ordinary.
    const doc = load();
    const table = doc.tables()[0]!;
    table.setPopupMenu(1, 0, 12345n);
    const control = NumbersDocument.load(doc.save()).tables()[0]!.cellControl(1, 0)!;
    expect(control.widget).toBe("pop-up menu");
    expect(control.popupModelId).toBe(12345n);
    expect(control.startsWithFirstItem).toBe(true);
  });
});

/**
 * The format that draws the control.
 *
 * A control needs two things and the suite only ever checked one. The spec
 * says *what* the widget is; a format on the cell says to **draw** the cell
 * as that widget rather than as its value. Written without the format, a
 * checkbox cell is a boolean cell that reads back as having a checkbox and
 * renders in Numbers as the word TRUE. That shipped, and every test here
 * passed, because a reader that resolves the spec answers "checkbox" either
 * way.
 *
 * The evidence is four borrowed documents: every control cell in all of
 * them carries a format id matching its value type. The minimal one settles
 * which part is load-bearing — a checkbox in `test-format-save.numbers` has
 * the boolean format and no number format at all.
 */
describe("controls carry the format that draws them", () => {
  const FIXTURES = new URL("../fixtures/", import.meta.url);
  const load = () =>
    NumbersDocument.load(
      new Uint8Array(readFileSync(new URL("numbers-parser-v26.0-categories.numbers", FIXTURES))),
    );

  const formatOf = (table: ReturnType<NumbersDocument["tables"]>[number], row: number, flag: number) =>
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (table as any).recordAt(row, 0)?.id(flag);

  it("gives a checkbox a boolean format, not just a spec", () => {
    const doc = load();
    doc.tables()[0]!.setCellControl(1, 0, { widget: "checkbox", value: true });
    const after = NumbersDocument.load(doc.save()).tables()[0]!;

    const key = formatOf(after, 1, CellFlag.BOOL_FORMAT_ID);
    expect(`bool format present: ${key !== undefined}`).toBe("bool format present: true");
    expect(after.cellFormat(1, 0)?.kind).toBe("checkbox");
  });

  it("gives a slider and a stepper a number format", () => {
    const doc = load();
    const table = doc.tables()[0]!;
    table.setCellControl(1, 0, { widget: "slider", minimum: 1, maximum: 50, increment: 0.1, value: 12.3 });
    table.setCellControl(2, 0, { widget: "stepper", minimum: 0, maximum: 10, increment: 1, value: 4 });
    const after = NumbersDocument.load(doc.save()).tables()[0]!;

    for (const row of [1, 2]) {
      expect(`row ${row}: ${formatOf(after, row, CellFlag.NUM_FORMAT_ID) !== undefined}`).toBe(
        `row ${row}: true`,
      );
    }
  });

  it("gives a star rating its own number format, distinct from a slider's", () => {
    const doc = load();
    const table = doc.tables()[0]!;
    table.setCellControl(1, 0, { widget: "starRating", value: 3 });
    table.setCellControl(2, 0, { widget: "slider", minimum: 1, maximum: 50, increment: 1, value: 3 });
    const after = NumbersDocument.load(doc.save()).tables()[0]!;

    expect(after.cellFormat(1, 0)?.kind).toBe("starRating");
    expect(after.cellFormat(2, 0)?.kind).toBe("number");
  });

  it("writes the exact format bytes Apple writes", () => {
    // 263 and 267 are unpublished codes read off borrowed documents. Both
    // are a bare `{ format_type: N }`, and getting the body wrong would
    // still read back as the right kind.
    const doc = load();
    const table = doc.tables()[0]!;
    table.setCellControl(1, 0, { widget: "checkbox", value: true });
    table.setCellControl(2, 0, { widget: "starRating", value: 3 });

    const saved = NumbersDocument.load(doc.save());
    const seen = new Map<number, string>();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const { obj } of (saved as any).store.index.values()) {
      if (obj.type !== 6005 || obj.message.getUint(1) !== 2) continue;
      for (const entry of obj.message.getMessages(3)) {
        const format = entry.getMessage(6);
        const type = format?.getUint(1);
        if (type === 263 || type === 267) {
          seen.set(type, [...format!.toBytes()].map((b) => b.toString(16).padStart(2, "0")).join(" "));
        }
      }
    }
    expect(seen.get(263)).toBe("08 87 02");
    expect(seen.get(267)).toBe("08 8b 02");
  });

  it("leaves a format the caller already chose alone", () => {
    // Choosing a percentage for a stepper must survive attaching it.
    const doc = load();
    const table = doc.tables()[0]!;
    table.setCell(1, 0, 4);
    table.setCellFormat(1, 0, { kind: "percentage", decimals: 1 });
    table.setCellControl(1, 0, { widget: "stepper", minimum: 0, maximum: 10, increment: 1 });

    const after = NumbersDocument.load(doc.save()).tables()[0]!;
    expect(after.cellFormat(1, 0)?.kind).toBe("percentage");
    expect(after.cellControl(1, 0)?.widget).toBe("stepper");
  });
});
