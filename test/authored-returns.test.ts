import { readFileSync } from "node:fs";
import { describe, expect, it } from "./harness.ts";
import { NumbersDocument } from "../src/numbers/document.ts";

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
