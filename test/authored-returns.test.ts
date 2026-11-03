import { readFileSync } from "node:fs";
import { describe, expect, it } from "./harness.ts";
import { NumbersDocument } from "../src/numbers/document.ts";
import { PagesDocument } from "../src/pages/document.ts";
import { KeynoteDocument } from "../src/keynote/document.ts";
import { findDrawableCore } from "../src/tsd/drawables.ts";
import { refId } from "../src/tsp/schema.ts";
import { Slide } from "../src/keynote/schema.ts";
import { GROUP_NODE_TYPE } from "../src/tst/categories.ts";
import { FilterSetFields } from "../src/tst/filters.ts";
import { PredicateFields, PREDICATE_TYPE_CONDITIONS, PREDICATE_TYPE_OPERATORS } from "../src/tst/predicates.ts";

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

describe("the eight text conditions the app wrote, one rule per column", () => {
  it("carry the predicate type and formula of their column's condition", () => {
    const doc = NumbersDocument.load(fixture("olekristensen-v26.0-mac-filter-conditions-text.numbers"));
    const table = doc.tables().find((t) => t.name === "Text rules")!;
    const rules = table.filterSets().rows!.rules();
    const cell = "OTHER_TABLE::R[0]C";
    expect(rules.map((r) => [table.cellText(0, r.column!), r.predicate?.predicateType, r.predicate?.text])).toEqual([
      ["is", 36, `IF(LEN("Pear")=LEN(${cell}[0]),FIND.CASEINSENSITIVE("Pear",${cell}[0])=1)`],
      ["is not", 37, `IF(LEN("Pear")<>LEN(${cell}[1]),TRUE,IF(ISERROR(FIND.CASEINSENSITIVE("Pear",${cell}[1])),TRUE,FIND.CASEINSENSITIVE("Pear",${cell}[1])<>1))`],
      ["starts with", 1, `FIND.CASEINSENSITIVE("P",${cell}[2])=1`],
      ["ends with", 2, `FIND.CASEINSENSITIVE("r",RIGHT(${cell}[3],LEN("r")))`],
      ["contains", 3, `NOT(ISERROR(FIND.CASEINSENSITIVE("ea",${cell}[4])))`],
      ["not contain", 4, `ISERROR(FIND.CASEINSENSITIVE("ea",${cell}[5]))`],
      ["not start with", 61, `IFERROR(FIND.CASEINSENSITIVE("P",${cell}[6])<>1,TRUE)`],
      ["not end with", 62, `IFERROR(NOT(FIND.CASEINSENSITIVE("r",RIGHT(${cell}[7],LEN("r")))),TRUE)`],
    ]);
  });
});

describe("every filter condition the app wrote, one rule per column", () => {
  const doc = NumbersDocument.load(fixture("olekristensen-v26.0-mac-filter-conditions.numbers"));
  const rules = doc.tables().flatMap((table) => {
    const set = table.filterSets().rows;
    const raw = set?.object.message.getMessages(FilterSetFields.RULES) ?? [];
    return (set?.rules() ?? []).map((rule, i) => {
      const predicate = raw[i]!.getMessage(1)!;
      return {
        table: table.name,
        label: table.cellText(0, rule.column!),
        type: Number(predicate.getVarint(PredicateFields.PREDICATE_TYPE)),
        q1: Number(predicate.getVarint(PredicateFields.QUALIFIER1) ?? 0n),
        q2: Number(predicate.getVarint(PredicateFields.QUALIFIER2) ?? 0n),
        text: rule.predicate?.text ?? "",
      };
    });
  });

  it("carry the predicate type and qualifiers of their column's condition", () => {
    expect(rules.map((r) => [r.label, r.type, r.q1, r.q2])).toEqual([
      ["is", 36, 0, 0], ["is not", 37, 0, 0], ["starts with", 1, 0, 0], ["ends with", 2, 0, 0],
      ["contains", 3, 0, 0], ["not contain", 4, 0, 0], ["not start with", 61, 0, 0], ["not end with", 62, 0, 0],
      ["is blank", 34, 0, 0], ["is not blank", 35, 0, 0],
      ["equal to", 5, 0, 0], ["not equal to", 6, 0, 0], ["greater than", 7, 0, 0], ["greater or equal", 8, 0, 0],
      ["less than", 9, 0, 0], ["less or equal", 10, 0, 0], ["between", 13, 0, 0], ["not between", 32, 0, 0],
      ["is not blank", 35, 0, 0],
      ["is", 20, 0, 0], ["before", 21, 0, 0], ["after", 22, 0, 0], ["in the range", 23, 0, 0],
      ["today", 17, 0, 0], ["yesterday", 18, 0, 0], ["tomorrow", 19, 0, 0], ["this week", 33, 3, 0],
      ["this month", 33, 4, 0], ["this quarter", 33, 8, 0], ["this year", 33, 5, 0],
      ["last days", 25, 2, 0], ["last weeks", 25, 3, 0], ["last months", 25, 4, 0], ["last quarters", 25, 8, 0], ["last years", 25, 5, 0],
      ["next days", 24, 2, 0], ["exactly ago", 26, 2, 6], ["exactly from now", 26, 3, 7], ["before ago", 27, 4, 6],
      ["after from now", 28, 5, 7], ["between ago", 29, 2, 6], ["is blank", 34, 0, 0],
      ["equal to", 38, 0, 0], ["greater than", 40, 0, 0], ["between", 44, 0, 0], ["is blank", 34, 0, 0],
      ["is checked", 55, 0, 0], ["is not checked", 56, 0, 0],
    ]);
    for (const r of rules) expect(PREDICATE_TYPE_CONDITIONS.has(r.type) || PREDICATE_TYPE_OPERATORS.has(r.type)).toBe(true);
  });

  it("render whole: date and duration literals, lists, thunks", () => {
    expect(rules.filter((r) => /NODE_/.test(r.text)).map((r) => r.label)).toEqual([]);
    const text = (label: string) => rules.find((r) => r.label === label)!.text;
    expect(text("today")).toBe("AND(OTHER_TABLE::R[0]C[4]>=TODAY(),OTHER_TABLE::R[0]C[4]<TODAY()+1d)");
    expect(text("before")).toBe("AND(OTHER_TABLE::R[0]C[1]<2026-11-01,NOT(ISBLANK(OTHER_TABLE::R[0]C[1])))");
    expect(text("this quarter")).toBe(
      "AND(OTHER_TABLE::R[0]C[1]>=DATE(YEAR(TODAY()),(CEILING(MONTH(TODAY())/3,1)-1)*3+1,1),OTHER_TABLE::R[0]C[1]<DATE(YEAR(TODAY()),(CEILING(MONTH(TODAY())/3,1)-1)*3+4,1))",
    );
    expect(rules.find((r) => r.type === 38)!.text).toBe("OTHER_TABLE::R[0]C[0]=1h");
    expect(rules.find((r) => r.type === 44)!.text.startsWith("IF(10m<=1h30m,AND(")).toBe(true);
    expect(rules.find((r) => r.type === 55)!.text).toBe("IF(AND(OTHER_TABLE::R[0]C[0],FUNCTION_326(OTHER_TABLE::R[0]C[0])=8),TRUE,FALSE)");
  });
});

describe("the number conditions beyond comparisons, written on the phone", () => {
  it("carry their predicate type, values or percent in qualifier1, and a whole-column SUM", () => {
    const doc = NumbersDocument.load(fixture("olekristensen-v26.0-ios-filter-number-conditions.numbers"));
    const table = doc.tables()[0]!;
    const set = table.filterSets().rows!;
    const raw = set.object.message.getMessages(FilterSetFields.RULES);
    const rules = set.rules().map((rule, i) => {
      const p = raw[i]!.getMessage(1)!;
      return [table.cellText(0, rule.column!), Number(p.getVarint(PredicateFields.PREDICATE_TYPE)), Number(p.getVarint(PredicateFields.QUALIFIER1) ?? 0n), rule.predicate?.text];
    });
    expect(rules).toEqual([
      ["above average", 11, 0, "SUM(OTHER_TABLE::C[0])"],
      ["below average", 12, 0, "SUM(OTHER_TABLE::C[1])"],
      ["top values", 30, 10, "SUM(OTHER_TABLE::C[2])+2"],
      ["bottom values", 31, 10, "SUM(OTHER_TABLE::C[3])+2"],
      ["top percent", 30, 9, "SUM(OTHER_TABLE::C[4])+50"],
      ["bottom percent", 31, 9, "SUM(OTHER_TABLE::C[5])+50"],
      ["duplicate", 15, 0, "SUM(OTHER_TABLE::C[6])"],
      ["unique", 16, 0, "SUM(OTHER_TABLE::C[7])"],
    ]);
    for (const [, type] of rules) expect(PREDICATE_TYPE_CONDITIONS.has(type as number)).toBe(true);
  });
});

describe("a per-group summary the app wrote", () => {
  it("reads as one aggregate on the grouping column, level 1, agg_type 1 (Count)", () => {
    const doc = NumbersDocument.load(fixture("olekristensen-v26.0-mac-authored.numbers"));
    const category = doc.tables()[0]!.categories()[0]!;
    expect(category.groupColumns().map((c) => c.column)).toEqual([1]);
    expect(category.aggregates()).toEqual([
      { column: 1, columnUid: category.groupColumns()[0]!.columnUid, level: 1, aggType: 1, showAsType: 0 },
    ]);
  });
});

describe("a category the app regrouped and answered on the canvas", () => {
  it("keeps the library's grouping, and the comment reads back", () => {
    const doc = NumbersDocument.load(fixture("olekristensen-v26.0-mac-category-seed.numbers"));
    const category = doc.tables()[0]!.categories()[0]!;
    expect(category.groupColumns().map((c) => c.column)).toEqual([1]);
    expect(category.describe()).toEqual(["Animal (2 rows)", "Fruit (2 rows)", "Transport (2 rows)"]);
    expect(doc.canvasComments().map((c) => [c.text, c.authorName])).toEqual([["Works", "ole kristensen"]]);
  });

  it("addCategory declares the new root and lets the donor's go", () => {
    const doc = NumbersDocument.blank();
    const table = doc.tables()[0]!;
    table.setCell(1, 1, "a");
    table.setCell(2, 1, "b");
    table.deleteRows(3, table.rowCount - 3);
    table.addCategory(1);
    const saved = NumbersDocument.load(doc.save());
    const category = saved.tables()[0]!.categories()[0]!;
    const declared = category.object.getObjectReferences();
    expect(declared.every((id) => saved.store.object(id) !== undefined)).toBe(true);
    const roots = declared.filter((id) => saved.store.object(id)?.type === GROUP_NODE_TYPE);
    expect(roots.length).toBe(1);
  });
});

describe("a build the app played and answered on the slide", () => {
  it("reads back as the dissolve the library wrote, declared by the slide alone", () => {
    const doc = KeynoteDocument.load(fixture("olekristensen-v26.0-mac-build-seed.key"));
    const slide = doc.slides()[0]!;
    const builds = slide.builds();
    expect(builds.length).toBe(1);
    expect(builds[0]!.read().effect).toBe("apple:dissolve");
    expect(doc.store.object(builds[0]!.id)!.getObjectReferences()).toEqual([]);
    expect(slide.canvasComments().map((c) => c.text)).toEqual(["It worked"]);
  });

  it("addBuild leaves the build and its chunk undeclared, as the app does", () => {
    const doc = KeynoteDocument.blank();
    const slide = doc.slides()[0]!;
    const title = refId(slide.object.message, Slide.TITLE_PLACEHOLDER)!;
    slide.addBuild({ drawableId: title, effect: "apple:dissolve", duration: 1 });
    const saved = KeynoteDocument.load(doc.save());
    const build = saved.slides()[0]!.builds()[0]!;
    expect(saved.store.object(build.id)!.getObjectReferences()).toEqual([]);
    for (const chunk of build.chunks()) expect(saved.store.object(chunk.id)!.getObjectReferences()).toEqual([]);
  });
});

describe("four seeds the 15.4 apps resaved", () => {
  it("filter: the rule on column C is kept and applied", () => {
    const doc = NumbersDocument.load(fixture("olekristensen-v26.0-mac-filter-seed.numbers"));
    const table = doc.tables()[0]!;
    expect(table.filterSets().rows!.rules().map((r) => [r.column, r.predicate?.predicateType])).toEqual([[2, 7]]);
    expect(doc.canvasComments()[0]!.text.startsWith("It worked")).toBe(true);
  });

  it("pages: the grafted table survives with its cells", () => {
    const doc = PagesDocument.load(fixture("olekristensen-v26.0-mac-table-seed.pages"));
    const table = doc.tables()[0]!;
    expect(table.cells().map((c) => ("value" in c.value ? c.value.value : undefined))).toEqual(["Item", "Count", "Apples", 3, "Pears", 5]);
    expect(doc.comments().map((c) => c.text)).toEqual(["worked great"]);
  });

  it("keynote: the app keeps the sizes a file states, so a new table takes the app's cell size", () => {
    const doc = KeynoteDocument.load(fixture("olekristensen-v26.0-mac-table-seed.key"));
    const kept = doc.tables()[0]!;
    expect([Math.round(kept.rowHeight(0) * 100) / 100, Math.round(kept.columnWidth(0))]).toEqual([19.93, 205]);
    expect(doc.slides()[0]!.canvasComments()[0]!.text.includes("sized")).toBe(true);
    const fresh = KeynoteDocument.blank().slides()[0]!.addTable({ rows: [["Item", "Count"], ["Apples", "3"], ["Pears", "5"]] });
    const theirs = KeynoteDocument.load(fixture("olekristensen-v26.0-mac-authored.key")).tables()[0]!;
    expect([fresh.columnWidth(0), fresh.rowHeight(2)]).toEqual([theirs.columnWidth(0), theirs.rowHeight(0)]);
  });

  it("keynote: the copied text box survives with its words", () => {
    const doc = KeynoteDocument.load(fixture("olekristensen-v26.0-mac-text-box-seed.key"));
    const texts = [...doc.store.allObjects()].filter(({ obj }) => obj.type === 2001).map(({ obj }) => obj.message.getStrings(3).join(""));
    expect(texts.some((t) => t.includes("Written by cupertino-files"))).toBe(true);
    expect(doc.slides()[0]!.canvasComments().map((c) => c.text)).toEqual(["works"]);
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

describe("a new table takes the app's Insert > Table shape", () => {
  const widths = (t: { columnCount: number; columnWidth(c: number): number }): number[] =>
    [...Array(t.columnCount).keys()].map((c) => Math.round(t.columnWidth(c) * 1000) / 1000);

  it("in Numbers: 10 by 5, one header row and column, 98-point columns", () => {
    const doc = NumbersDocument.blank();
    const table = doc.addTable(doc.sheets()[0]!.id, { name: "Fresh" });
    expect([table.rowCount, table.columnCount, table.headerRowCount, table.headerColumnCount]).toEqual([10, 5, 1, 1]);
    expect(widths(table)).toEqual([98, 98, 98, 98, 98]);
    const theirs = NumbersDocument.load(fixture("olekristensen-v26.0-mac-authored.numbers")).tables()[1]!;
    expect([theirs.rowCount, theirs.columnCount, theirs.headerRowCount, theirs.headerColumnCount, widths(theirs)[0]]).toEqual([10, 5, 1, 1, 98]);
  });

  it("in Pages: 5 by 4 across the body, 120.386-point columns on A4", () => {
    const doc = PagesDocument.blank();
    const table = doc.appendTable();
    expect([table.rowCount, table.columnCount, table.headerRowCount, table.headerColumnCount, table.nameVisible]).toEqual([5, 4, 1, 1, false]);
    const theirs = PagesDocument.load(fixture("olekristensen-v26.0-mac-authored.pages")).tables()[0]!;
    expect(widths(table)).toEqual(widths(theirs));
    expect(table.rowHeight(0)).toBe(theirs.rowHeight(0));
  });

  it("in Keynote: 5 by 4 in the layout's object frame, 432.25-point columns", () => {
    const doc = KeynoteDocument.blank();
    const slide = doc.slides()[0]!;
    const table = slide.addTable();
    expect([table.rowCount, table.columnCount, table.headerRowCount, table.headerColumnCount, table.nameVisible]).toEqual([5, 4, 1, 1, false]);
    const theirs = KeynoteDocument.load(fixture("olekristensen-v26.0-mac-authored.key"));
    const theirTable = theirs.tables()[0]!;
    expect(widths(table)).toEqual(widths(theirTable));
    expect(table.rowHeight(0)).toBe(theirTable.rowHeight(0));
    const frame = slide.drawables().find((d) => d.object.type === 6000)!.geometry()!;
    const theirFrame = theirs.slides()[2]!.drawables().find((d) => d.object.type === 6000)!.geometry()!;
    expect([frame.x, frame.y, frame.width, frame.height]).toEqual([theirFrame.x, theirFrame.y, theirFrame.width, theirFrame.height]);
  });
});
