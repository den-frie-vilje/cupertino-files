import { readFileSync } from "node:fs";
import { describe, expect, it } from "./harness.ts";
import { NumbersDocument } from "../src/numbers/document.ts";
import { PagesDocument } from "../src/pages/document.ts";
import { findDrawableCore } from "../src/tsd/drawables.ts";
import { refId } from "../src/tsp/schema.ts";

const FIXTURES = new URL("../fixtures/", import.meta.url);
const fixture = (name: string) => new Uint8Array(readFileSync(new URL(name, FIXTURES)));

describe("a starts-with filter rule the app wrote", () => {
  it("reads as a rule on column A, offset -1 from the host column", () => {
    const doc = NumbersDocument.load(fixture("olekristensen-v26.0-mac-authored.numbers"));
    const table = doc.tables()[0]!;
    const set = table.filterSets().rows!;
    const rules = set.rules();
    expect(rules.length).toBe(1);
    expect(rules[0]!.column).toBe(0);
    expect(rules[0]!.predicate?.predicateType).toBe(1);
    expect(rules[0]!.predicate?.text.includes("FIND.CASEINSENSITIVE")).toBe(true);
    expect(set.enabled).toBe(true);
  });

  it("is written back byte for byte by addFilterRule", () => {
    const doc = NumbersDocument.load(fixture("olekristensen-v26.0-mac-authored.numbers"));
    const table = doc.tables()[0]!;
    const set = table.filterSets().rows!;
    const before = set.object.message.getMessages(7).map((r) => r.toBytes());
    expect(before.length).toBe(1);
    table.addFilterRule(0, { operator: "startsWith", value: "C" });
    const after = set.object.message.getMessages(7).map((r) => r.toBytes());
    expect(after.length).toBe(2);
    expect(Buffer.from(after[1]!).equals(Buffer.from(before[0]!))).toBe(true);
  });

  it("hides the rows a starts-with rule excludes", () => {
    const doc = NumbersDocument.blank();
    const table = doc.tables()[0]!;
    table.setCell(0, 0, "Item");
    const items = ["Pear", "Cat", "Apple", "Train", "Dog", "Cabbage"];
    items.forEach((item, i) => { table.setCell(i + 1, 0, item); });
    table.deleteRows(items.length + 1, table.rowCount - items.length - 1);
    const hidden = table.addFilterRule(0, { operator: "startsWith", value: "c" });
    expect(hidden).toBe(0);
    const reloaded = NumbersDocument.load(doc.save());
    const rule = reloaded.tables()[0]!.filterSets().rows!.rules()[0]!;
    expect([rule.column, rule.predicate?.predicateType]).toEqual([0, 1]);
    expect(reloaded.tables()[0]!.refilterRows()).toBe(4);
  });
});

describe("a shape the app moved to the section master", () => {
  it("is a plain reference from the odd master, the drawable without a parent, on no page", () => {
    const doc = PagesDocument.load(fixture("olekristensen-v26.0-mac-authored.pages"));
    const masters = doc.sections()[0]!.masterDrawables();
    expect(masters.map((m) => [m.role, m.drawables.length])).toEqual([["first", 0], ["even", 0], ["odd", 1]]);
    const shape = masters[2]!.drawables[0]!;
    expect(refId(findDrawableCore(shape.object.message), 2)).toBe(undefined);
    expect(doc.floatingDrawablePages().every((p) => !doc.floatingDrawables(p)!.ids().includes(shape.id))).toBe(true);
  });

  it("is what moveToSectionMaster writes", () => {
    const doc = PagesDocument.load(fixture("patrickomatic-pages26-sections-masks.pages"));
    const page = doc.floatingDrawablePages()[0]!;
    const drawable = doc.floatingDrawables(page)!.drawables()[0]!;
    doc.sections()[0]!.moveToSectionMaster(drawable.id);
    const again = PagesDocument.load(doc.save());
    const odd = again.sections()[0]!.masterDrawables().find((m) => m.role === "odd")!;
    expect(odd.drawables.some((d) => d.id === drawable.id)).toBe(true);
    expect(again.floatingDrawables(page)?.ids().includes(drawable.id) ?? false).toBe(false);
    expect(refId(findDrawableCore(again.store.object(drawable.id)!.message), 2)).toBe(undefined);
  });
});

describe("the page break", () => {
  it("is the paragraph terminator U+0005 in the app's document and in ours", () => {
    const theirs = PagesDocument.load(fixture("olekristensen-v26.0-mac-authored.pages"));
    const at = theirs.bodyText.indexOf("\u0005");
    expect(theirs.body.paragraphs().some((p) => p.end === at)).toBe(true);
    const doc = PagesDocument.blank();
    doc.appendParagraph("Before the break.", "Body");
    doc.appendParagraph("After the break.", "Body");
    doc.insertPageBreak(0);
    const again = PagesDocument.load(doc.save());
    expect(again.bodyText).toBe("Before the break.\u0005After the break.");
    expect(again.body.paragraphs().map((p) => p.text)).toEqual(["Before the break.", "After the break."]);
  });
});
