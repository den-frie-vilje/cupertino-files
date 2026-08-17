/**
 * `audit()` — the person-check, run offline.
 *
 * Every code it can emit names a state some review round watched an app
 * refuse, repair destructively, or render against the author's intent.
 * The returned demo fixtures are the natural test bed: they carry the
 * very states the audits were written for, frozen at the round that
 * found them.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "./harness.ts";
import { NumbersDocument, PagesDocument } from "../src/index.ts";
import { FORMULA_OWNER_DEPENDENCIES } from "../src/tsce/owners.ts";

const FIXTURES = new URL("../fixtures/", import.meta.url);
const bytes = (name: string) => new Uint8Array(readFileSync(new URL(name, FIXTURES)));

describe("document audit", () => {
  it("finds nothing in a cleanly built document", () => {
    const doc = NumbersDocument.blank();
    const table = doc.tables()[0]!;
    if (table.rowCount < 6) table.insertRows(table.rowCount, 6 - table.rowCount);
    table.setCell(1, 1, 42);
    table.setCell(2, 1, "text");
    table.setConditionalRules(3, 1, [
      { operator: ">", value: 5, cell: { fill: { kind: "color", color: { r: 0, g: 1, b: 0 } } } },
    ]);
    const sheet = doc.sheets()[0]!;
    doc.addTable(sheet.id, { name: "Clean", withContent: false });
    expect(NumbersDocument.load(doc.save()).audit()).toEqual([]);
  });

  it("finds nothing in a cleanly built Pages document", () => {
    const doc = PagesDocument.blank();
    doc.appendParagraph("A paragraph.", "Body");
    expect(PagesDocument.load(doc.save()).audit()).toEqual([]);
  });

  it("names the inert rules in the round-one returned demo", () => {
    // Seven cells carry rules; the app registered only the five the
    // checker re-typed. The other two are exactly the state the audit
    // exists to catch: visible in the inspector, never evaluated.
    const doc = NumbersDocument.load(bytes("olekristensen-v26.3-demo07-rules-returned.numbers"));
    const codes = doc.audit().map((f) => f.code);
    expect(codes.filter((c) => c === "cell/rule-unregistered").length).toBe(2);
  });

  it("stays silent about bare text styles, even on the pre-drop returned demo", () => {
    // The do-nothing style measurably left-pinned the values in this
    // file — but a corpus sweep found 1071 value cells in app-authored
    // fixtures carrying the identical record state as their normal
    // condition, so no offline check can tell the two apart. The audit
    // does not guess; the writers simply never produce the state.
    const doc = NumbersDocument.load(bytes("olekristensen-v26.3-demo07-rules-round2.numbers"));
    expect(doc.audit().filter((f) => f.code === "cell/bare-text-style").length).toBe(0);
  });

  it("names the tombstoned cross-reference in the round-two returned demo", () => {
    // The app discarded the clone identity a library build had written,
    // re-registered the table, and re-pointed the stored reference at a
    // kind-0 tombstone owner. The audit sees the corpse offline: a
    // cross-table uuid that no TABLE-kind owner carries.
    const doc = NumbersDocument.load(bytes("olekristensen-v26.3-demo06-formulas-round2.numbers"));
    const dangling = doc.audit().filter((f) => f.code === "cell/cross-ref-dangling");
    expect(dangling.length).toBe(1);
    expect(dangling[0]!.message.includes("13,2")).toBe(true);
  });

  it("save refuses a message stripped of a required field", () => {
    const doc = NumbersDocument.blank();
    const table = doc.tables()[0]!;
    table.setCell(1, 1, 42);
    // Strip a required field through the raw layer — the guarded writers
    // cannot produce this state, which is exactly why save re-checks.
    const model = table.object.message;
    model.fields.splice(
      model.fields.findIndex((f) => f.no === 1),
      1,
    );
    model.markDirty();
    let refused = "";
    try {
      doc.save();
    } catch (error) {
      refused = (error as Error).message;
    }
    expect(refused.includes("required")).toBe(true);
  });

  it("flags a table whose calc-engine registration is gone", () => {
    const doc = NumbersDocument.blank();
    const sheet = doc.sheets()[0]!;
    doc.addTable(sheet.id, { name: "Ghost", withContent: false });
    // Undo the registration the clone path minted, leaving the table in
    // the state that opened as a ref-error source.
    const ghost = doc
      .tables()
      .find((t) => t.name === "Ghost")!;
    const haunted = ghost.object.message.getMessage(84)!.getMessage(1)!;
    haunted.setVarint(1, (haunted.getVarint(1)! + 1000n) & 0xffffffffffffffffn);
    const findings = doc.audit();
    expect(findings.some((f) => f.code === "table/unregistered")).toBe(true);
    void FORMULA_OWNER_DEPENDENCIES;
  });
});
