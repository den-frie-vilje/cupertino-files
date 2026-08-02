/**
 * Pop-up menus — the fifth widget, and the only one not yet seen working.
 *
 * The other four are confirmed: a document authoring a checkbox, a star
 * rating, a slider and a stepper was opened in Numbers and each drew as
 * labelled. A menu is different in kind, because it is the only control
 * that needs a **second archive** — `TST.PopUpMenuModel`, holding the list
 * of choices — and no document available here contains one to measure.
 *
 * So this is built from the vendored schema. That is a weaker footing than
 * the rest of the library stands on, and the reason to say so plainly is
 * that schema-correct has already proved insufficient once: a control with
 * no format was valid in every checkable respect and invisible in the app.
 * What these tests can prove is that the archive is well-formed, that its
 * required fields are populated to the bottom, that the cell carries the
 * format a real menu cell carries, and that it reads back. Whether Numbers
 * accepts it is a question only Numbers answers.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "./harness.ts";
import { NumbersDocument } from "../src/index.ts";
import { buildPopupMenuModel, readPopupMenuModel } from "../src/tst/controls.ts";
import { CellFlag } from "../src/tst/cellrecord.ts";
import { RawMessage } from "../src/base/protobuf.ts";

const FIXTURES = new URL("../fixtures/", import.meta.url);
const TEMPLATE = new Uint8Array(
  readFileSync(new URL("numbers-parser-v26.0-categories.numbers", FIXTURES)),
);
const load = () => NumbersDocument.load(TEMPLATE);

const flagsOn = (table: unknown, row: number, column: number): number =>
  ((table as { recordAt: (r: number, c: number) => { flags?: number } | undefined }).recordAt(
    row,
    column,
  )?.flags ?? 0);

describe("pop-up menu model", () => {
  it("round-trips text and numeric choices", () => {
    const text = buildPopupMenuModel(["Apple", "Pear", "Quince"]);
    expect(readPopupMenuModel(text).join("|")).toBe("Apple|Pear|Quince");

    const numeric = buildPopupMenuModel([1, 2.5, 100]);
    expect(readPopupMenuModel(numeric).join("|")).toBe("1|2.5|100");
  });

  it('keeps a choice literally named "nil"', () => {
    // The None slot used to be marked by the in-band string "nil", so a menu
    // whose first choice was the word itself lost that choice — encoded as a
    // second bare NIL slot instead of a string. The marker is a symbol now;
    // this pins the only input that could tell the difference.
    const model = buildPopupMenuModel(["nil", "other"]);
    expect(readPopupMenuModel(model).join("|")).toBe("nil|other");
  });

  it("gives every item the format its schema requires", () => {
    // `StringCellValueArchive.format` and `NumberCellValueArchive.format`
    // are both `required`. Omitting either makes the message malformed,
    // and a malformed message anywhere takes the whole document with it —
    // which is exactly how a conditional rule broke a file once.
    const model = RawMessage.parse(buildPopupMenuModel(["a", 2]).toBytes());
    const items = model.getMessages(2);
    // Three, not two: the None slot precedes the choices.
    expect(items.length).toBe(3);
    // field 2 on a string value, field 3 on a number value — not the same
    expect(items[1]!.getMessage(5)?.getMessage(2)?.getUint(1)).toBe(260);
    expect(items[2]!.getMessage(4)?.getMessage(3)?.getUint(1)).toBe(256);
  });

  it("reserves slot 0 for the None entry, as a bare NIL_TYPE", () => {
    // Measured in Numbers, and the reason to pin it: without this slot the
    // menu opens fine, works fine, and quietly offers one fewer choice than
    // it was given — the first one. Nothing offline notices.
    const items = RawMessage.parse(
      buildPopupMenuModel(["Apple", "Pear", "Quince"]).toBytes(),
    ).getMessages(2);
    expect(items.length).toBe(4);
    expect(items[0]!.getUint(1)).toBe(1); // NIL_TYPE
    // Bare: a real value here restores the choice count but breaks the
    // selection — the menu marks nothing as current.
    expect(items[0]!.fields.length).toBe(1);
    // The choices follow, in order and unshifted.
    expect(items[1]!.getMessage(5)?.getString(1)).toBe("Apple");
  });

  it("refuses an empty menu", () => {
    let threw = "";
    try {
      buildPopupMenuModel([]);
    } catch (error) {
      threw = (error as Error).message;
    }
    expect(threw.includes("at least one item")).toBe(true);
  });
});

describe("authoring a menu onto a cell", () => {
  it("writes a spec, a model and the format that draws it", () => {
    const doc = load();
    doc.tables()[0]!.setCellControl(1, 0, {
      widget: "popupMenu",
      items: ["Apple", "Pear", "Quince"],
      value: "Pear",
    });

    const table = NumbersDocument.load(doc.save()).tables()[0]!;
    const control = [...table.controls().values()].find((c) => c.widget === "pop-up menu");
    expect(control !== undefined).toBe(true);
    expect(control!.shape).toBe("chooser");
    expect(control!.startsWithFirstItem).toBe(true);
    expect(control!.popupModelId !== undefined).toBe(true);
    const value = table.cellValue(1, 0);
    expect(value?.type === "text" ? value.value : undefined).toBe("Pear");

    // The format is the part that was missing from every widget until
    // recently, and a text menu takes a text format.
    expect((flagsOn(table, 1, 0) & CellFlag.TEXT_FORMAT_ID) !== 0).toBe(true);
  });

  it("gives a numeric menu a number format instead", () => {
    const doc = load();
    doc.tables()[0]!.setCellControl(1, 0, { widget: "popupMenu", items: [10, 20], value: 20 });
    const table = NumbersDocument.load(doc.save()).tables()[0]!;
    expect((flagsOn(table, 1, 0) & CellFlag.NUM_FORMAT_ID) !== 0).toBe(true);
    const value = table.cellValue(1, 0);
    expect(value?.type === "number" ? value.value : undefined).toBe(20);
  });

  it("shares one model between cells offering the same choices", () => {
    const doc = load();
    const table = doc.tables()[0]!;
    const items = ["Yes", "No"];
    table.setCellControl(1, 0, { widget: "popupMenu", items, value: "Yes" });
    table.setCellControl(2, 0, { widget: "popupMenu", items, value: "No" });

    const after = NumbersDocument.load(doc.save()).tables()[0]!;
    const models = new Set(
      [...after.controls().values()]
        .filter((c) => c.popupModelId !== undefined)
        .map((c) => String(c.popupModelId)),
    );
    // One archive, not two. A column of forty menus is one object.
    expect(models.size).toBe(1);
  });

  it("will not set a value the menu cannot offer", () => {
    const doc = load();
    let threw = "";
    try {
      doc.tables()[0]!.setCellControl(1, 0, {
        widget: "popupMenu",
        items: ["Apple", "Pear"],
        value: "Durian",
      });
    } catch (error) {
      threw = (error as Error).message;
    }
    expect(threw.includes("not one of the menu's items")).toBe(true);
  });

  it("attaching an existing model also formats the cell", () => {
    // The regression that made this worth checking: setPopupMenu is the one
    // control path that never called the format helper, so a menu attached
    // this way would have been as invisible as the widgets used to be.
    const doc = load();
    const table = doc.tables()[0]!;
    const key = table.setCellControl(1, 0, { widget: "popupMenu", items: ["A", "B"] });
    const model = [...table.controls().values()].find((c) => c.key === key)!.popupModelId!;

    table.setPopupMenu(2, 0, model);
    expect((flagsOn(table, 2, 0) & CellFlag.TEXT_FORMAT_ID) !== 0).toBe(true);
  });
});
