/**
 * Proto2 `required` fields, across every authoring path.
 *
 * This is the test that would have caught the bug that shipped twice.
 * Conditional rules were written without `cell_style` or `text_style`, both
 * of which `TST.ConditionalStyleRule` declares as `required`. The result is
 * not a rule that formats nothing — it is a message no conforming parser
 * accepts, so Numbers refuses the entire document.
 *
 * Nothing already in the suite could find it:
 *
 *  - **round-tripping** passes, because our reader is as tolerant as our
 *    writer. It reads the rule back perfectly.
 *  - **byte-comparison against Apple** passes, because the only rule Apple
 *    ever wrote has both styles. Comparing against a case the app produces
 *    proves that case; it says nothing about a case the app never produces.
 *
 * Only the schema knows, and the schema is vendored. So this reads it.
 *
 * Running it over the fixtures too is deliberate: a violation there is
 * evidence about the *vendored protos*, not about Apple's file, since
 * Apple's documents are well-formed by definition. Those are reported and
 * not failed.
 */
import { describe, expect, it } from "./harness.ts";
import {
  authoredDocuments,
  checkDocument,
  loadSchema,
} from "../scripts/check-required-fields.ts";
import { parseProtoSchema, missingRequired } from "../src/tsp/required.ts";
import { RawMessage } from "../src/base/protobuf.ts";

const schema = loadSchema();

describe("the schema parser", () => {
  it("reads required, optional and repeated, and qualifies nested names", () => {
    const parsed = parseProtoSchema([
      `syntax = "proto2";
       package TST;
       message Outer {
         message Inner {
           required .TSP.Reference cell_style = 2;
           optional uint32 count = 3;
         }
         required uint32 ruleCount = 1;
         repeated .TST.Outer.Inner rule = 4;
       }`,
    ]);
    expect([...parsed.keys()].sort().join(",")).toBe("TST.Outer,TST.Outer.Inner");
    expect(parsed.get("TST.Outer")!.get(1)!.label).toBe("required");
    expect(parsed.get("TST.Outer")!.get(4)!.type).toBe("TST.Outer.Inner");
    expect(parsed.get("TST.Outer.Inner")!.get(2)!.name).toBe("cell_style");
  });

  it("does not mistake enum members for fields", () => {
    // `Value = 0;` inside an enum looks exactly like a field to a careless
    // parser, and would invent required fields that do not exist.
    const parsed = parseProtoSchema([
      `package TSP;
       message FieldInfo {
         enum Type { Value = 0; ObjectReference = 1; }
         required .TSP.FieldPath path = 1;
       }`,
    ]);
    const fields = parsed.get("TSP.FieldInfo")!;
    expect(fields.size).toBe(1);
    expect(fields.get(1)!.name).toBe("path");
  });

  it("attributes extension fields to the type being extended", () => {
    // How a ChartArchive ends up inside a ChartDrawableArchive at 10000.
    const parsed = parseProtoSchema([
      `package TSCH;
       message ChartArchive {
         optional uint32 chart_type = 1;
         extend .TSCH.ChartDrawableArchive {
           optional .TSCH.ChartArchive unity = 10000;
         }
       }`,
    ]);
    expect(parsed.get("TSCH.ChartDrawableArchive")?.get(10000)?.name).toBe("unity");
    expect(parsed.get("TSCH.ChartArchive")?.has(10000)).toBe(false);
  });

  it("loads the vendored schema with a plausible amount in it", () => {
    expect(schema.size > 500).toBe(true);
    const required = [...schema.values()].reduce(
      (n, message) => n + [...message.values()].filter((f) => f.label === "required").length,
      0,
    );
    expect(required > 500).toBe(true);
    // The two that caused all this.
    const rule = schema.get("TST.ConditionalStyleSetArchive.ConditionalStyleRule")!;
    expect(rule.get(2)!.label).toBe("required");
    expect(rule.get(3)!.label).toBe("required");
  });
});

describe("the validator", () => {
  it("reports a missing required field, with the path to it", () => {
    const parsed = parseProtoSchema([
      `package T;
       message Rule { required .TSP.Reference style = 2; }
       message Set { repeated .T.Rule rule = 1; }`,
    ]);
    const set = RawMessage.create();
    set.addMessage(1, RawMessage.create());
    const problems = missingRequired(set, "T.Set", parsed);
    expect(problems.length).toBe(1);
    expect(problems[0]!.field).toBe("style");
    expect(problems[0]!.path).toBe("T.Set.rule");
  });

  it("says nothing about an absent optional submessage", () => {
    const parsed = parseProtoSchema([
      `package T;
       message Rule { required uint32 x = 1; }
       message Set { optional .T.Rule rule = 1; }`,
    ]);
    expect(missingRequired(RawMessage.create(), "T.Set", parsed).length).toBe(0);
  });
});

describe("everything this library authors", () => {
  const documents = authoredDocuments();

  it("exercises every authoring path", () => {
    // A guard against the whole suite passing because the list went empty.
    expect(documents.length >= 10).toBe(true);
  });

  for (const { name, bytes } of documents) {
    it(`writes no malformed archive: ${name}`, () => {
      const problems = checkDocument(bytes, schema);
      const summary = problems
        .slice(0, 4)
        .map((p) => `${p.message}.${p.field} at ${p.path}`)
        .join("; ");
      expect(`${name}: ${summary}`).toBe(`${name}: `);
    });
  }
});
