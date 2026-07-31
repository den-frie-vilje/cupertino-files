#!/usr/bin/env node
/**
 * One pass over a document, reporting everything this library still cannot
 * name — so a purpose-built file settles several open questions at once.
 *
 *   node scripts/probe-unknowns.ts <file...> [--json]
 *
 * Every remaining gap in this project has the same shape: an integer enum
 * Apple never published, in a structure no fixture happens to contain. The
 * fix is always the same too — one document that exercises the feature,
 * made in the app, read back here. This script is the "read back here"
 * half, and it covers all of them in one run rather than one script per
 * question.
 *
 * What it reports, and what each answer unblocks:
 *
 *  1. **Formula function indexes** — `AST_function_node_index` values with
 *     no name. Unblocks reading, and is a prerequisite for authoring
 *     formulas. Prefer `scripts/harvest-functions.ts`, which drives a whole
 *     probe sheet; this catches ids a hand-made document happens to use.
 *  2. **Predicate types** — `predicate_type` paired with the operator its
 *     formula states. Unblocks authoring conditional-formatting and filter
 *     rules. `scripts/harvest-predicates.ts` scores these against the
 *     predicted enum ordering.
 *  3. **Cell controls** — `interaction_type` for each widget, with the
 *     fields that widget populates. Unblocks reading and writing checkboxes,
 *     sliders, steppers and pop-up menus.
 *  4. **Keynote builds** — the delivery strings, effect names and attribute
 *     fields an animation actually uses. Unblocks the build model, which is
 *     currently schema-derived with nothing to check it against.
 *  5. **Unresolved formula owners** — owner UUIDs that name no object.
 *  6. **Unknown archive types** — type ids absent from the registry.
 *  7. **Paragraph border positions** — `border_positions` with the styles
 *     using it. Settles which edge each value draws, the one remaining
 *     inferred mapping in the text model.
 *
 * Sections with nothing to report say so, so a run against an ordinary
 * document is a short, honest "nothing new here".
 */
import { readFileSync } from "node:fs";
import { IWorkDocument } from "../src/tsa/document.ts";
import { KeynoteDocument } from "../src/keynote/document.ts";
import { tablesOf } from "../src/tst/tables.ts";
import { typeName } from "../src/tsp/registry.ts";
import { FormulaOwnerRegistry, OwnerKind } from "../src/tsce/owners.ts";
import { readPredicate } from "../src/tst/predicates.ts";
import { BuildFields } from "../src/keynote/builds.ts";
import { ParaProps, StyleArchive } from "../src/tswp/schema.ts";

interface Findings {
  file: string;
  app: string;
  unknownFunctions: { index: number; occurrences: number; sample: string }[];
  predicateTypes: { type: number; operator: string | undefined; sample: string }[];
  controls: {
    key: number;
    interactionType: number | undefined;
    widget: string | undefined;
    shape: string;
    fields: number[];
    detail: string;
  }[];
  builds: { slide: number; delivery: string | undefined; effect: string | undefined; attributeFields: number[] }[];
  unresolvedOwners: { kind: number; count: number }[];
  unknownTypes: { type: number; count: number }[];
  borderPositions: { value: number; style: string | undefined; hasStroke: boolean }[];
}

function probe(path: string): Findings {
  const document = IWorkDocument.open(new Uint8Array(readFileSync(path)));
  const findings: Findings = {
    file: path.split("/").pop() ?? path,
    app: document.app,
    unknownFunctions: [],
    predicateTypes: [],
    controls: [],
    builds: [],
    unresolvedOwners: [],
    unknownTypes: [],
    borderPositions: [],
  };

  // 1 + 2 + 3: everything that hangs off a table.
  const functions = new Map<number, { occurrences: number; sample: string }>();
  const predicates = new Map<number, { operator: string | undefined; sample: string }>();
  for (const table of tablesOf(document.store)) {
    if (table.storageGeneration === "v5") {
      for (const cell of table.cells()) {
        if (cell.value.type === "empty" || !cell.value.isFormula) continue;
        const detail = table.cellFormulaDetail(cell.row, cell.column);
        for (const index of detail?.unknownFunctions ?? []) {
          const seen = functions.get(index) ?? { occurrences: 0, sample: detail!.text };
          seen.occurrences++;
          functions.set(index, seen);
        }
      }
    }
    for (const set of table.conditionalStyleSets().values()) {
      for (const rule of set.rules()) collectPredicate(predicates, rule.predicate);
    }
    const { rows, columns } = table.filterSets();
    for (const set of [rows, columns]) {
      for (const rule of set?.rules() ?? []) collectPredicate(predicates, rule.predicate);
    }
    for (const [key, control] of table.controls()) {
      findings.controls.push({
        key,
        interactionType: control.interactionType,
        widget: control.widget,
        shape: control.shape,
        fields: control.populatedFields,
        detail: describeControl(control),
      });
    }
  }
  findings.unknownFunctions = [...functions]
    .sort((a, b) => a[0] - b[0])
    .map(([index, seen]) => ({ index, ...seen }));
  findings.predicateTypes = [...predicates]
    .sort((a, b) => a[0] - b[0])
    .map(([type, seen]) => ({ type, ...seen }));

  // 4: Keynote builds.
  if (document.app === "keynote") {
    try {
      const deck = KeynoteDocument.load(new Uint8Array(readFileSync(path)));
      for (const slide of deck.slides()) {
        for (const build of slide.builds()) {
          const info = build.read();
          findings.builds.push({
            slide: slide.index,
            delivery: info.delivery,
            effect: info.effect,
            attributeFields:
              build.object.message
                .getMessage(BuildFields.ATTRIBUTES)
                ?.fields.map((field) => field.no)
                .filter((no, i, all) => all.indexOf(no) === i)
                .sort((a, b) => a - b) ?? [],
          });
        }
      }
    } catch {
      /* not loadable as a deck; the shared reader already covered it */
    }
  }

  // 5: owners that name nothing.
  const byKind = new Map<number, number>();
  for (const owner of new FormulaOwnerRegistry(document.store).unresolved()) {
    byKind.set(owner.kind, (byKind.get(owner.kind) ?? 0) + 1);
  }
  findings.unresolvedOwners = [...byKind]
    .sort((a, b) => b[1] - a[1])
    .map(([kind, count]) => ({ kind, count }));

  // 7: paragraph border positions, with the style each belongs to.
  for (const { obj } of document.store.allObjects()) {
    if (!(typeName(obj.type, document.app) ?? "").endsWith("ParagraphStyleArchive")) continue;
    const props = obj.message.getMessage(StyleArchive.PARA_PROPERTIES);
    let value: number | undefined;
    try {
      value = props?.getUint(ParaProps.BORDER_POSITIONS);
    } catch {
      continue;
    }
    // 0 is "no border" and fills every document; only the interesting
    // values are worth reporting.
    if (value === undefined || value === 0) continue;
    findings.borderPositions.push({
      value,
      style: obj.message.getMessage(1)?.getString(1),
      hasStroke: props!.has(ParaProps.STROKE),
    });
  }

  // 6: type ids the registry does not name.
  const unknown = new Map<number, number>();
  for (const { obj } of document.store.allObjects()) {
    if (typeName(obj.type, document.app) === undefined) {
      unknown.set(obj.type, (unknown.get(obj.type) ?? 0) + 1);
    }
  }
  findings.unknownTypes = [...unknown]
    .sort((a, b) => b[1] - a[1])
    .map(([type, count]) => ({ type, count }));

  return findings;
}

function collectPredicate(
  into: Map<number, { operator: string | undefined; sample: string }>,
  predicate: ReturnType<typeof readPredicate>,
): void {
  if (!predicate || predicate.predicateType === undefined) return;
  if (into.has(predicate.predicateType)) return;
  into.set(predicate.predicateType, { operator: predicate.operator, sample: predicate.text });
}

function describeControl(control: { minimum?: number; maximum?: number; increment?: number; popupModelId?: bigint }): string {
  const parts: string[] = [];
  if (control.minimum !== undefined) parts.push(`min=${control.minimum}`);
  if (control.maximum !== undefined) parts.push(`max=${control.maximum}`);
  if (control.increment !== undefined) parts.push(`step=${control.increment}`);
  if (control.popupModelId !== undefined) parts.push(`popup=${control.popupModelId}`);
  return parts.join(" ") || "(no distinguishing fields)";
}

function render(findings: Findings): string {
  const out: string[] = [`\n═══ ${findings.file}  (${findings.app})`];

  const section = (title: string, lines: string[], nothing: string): void => {
    out.push(`\n  ${title}`);
    out.push(lines.length ? lines.map((l) => `    ${l}`).join("\n") : `    — ${nothing}`);
  };

  section(
    "1. Formula function indexes with no name",
    findings.unknownFunctions.map(
      (f) => `FUNCTION_${f.index} × ${f.occurrences}   e.g. ${f.sample}`,
    ),
    "every function in this document is named",
  );
  section(
    "2. predicate_type values, with the operator their formula states",
    findings.predicateTypes.map(
      (p) => `type ${p.type} → ${p.operator ?? "(not a plain comparison)"}   e.g. ${p.sample}`,
    ),
    "no conditional-formatting or filter rules here",
  );
  section(
    "3. Cell controls",
    findings.controls.map(
      (c) =>
        `key ${c.key}: interaction_type=${c.interactionType} (${c.widget ?? "UNRECOGNISED — measure it"})` +
          ` shape=${c.shape} fields=[${c.fields.join(",")}]  ${c.detail}`,
    ),
    "no cell controls in this document",
  );
  section(
    "4. Keynote builds",
    findings.builds.map(
      (b) =>
        `slide ${b.slide}: delivery=${JSON.stringify(b.delivery)} effect=${JSON.stringify(b.effect)} attributeFields=[${b.attributeFields.join(",")}]`,
    ),
    "no animations here — this is the gap an animated deck closes",
  );
  section(
    "5. Formula owners naming no object",
    findings.unresolvedOwners.map((o) => `owner_kind ${o.kind} × ${o.count}`),
    "every owner resolves",
  );
  section(
    "6. Archive types the registry cannot name",
    findings.unknownTypes.map((t) => `type ${t.type} × ${t.count}`),
    "every type is known",
  );
  section(
    "7. Paragraph border positions (which edge each value draws)",
    findings.borderPositions.map(
      (b) => `border_positions=${b.value} style=${JSON.stringify(b.style)} hasStroke=${b.hasStroke}`,
    ),
    "no paragraph borders here — a document with top/bottom/both/all borders settles the mapping",
  );
  return out.join("\n");
}

function main(argv: string[]): number {
  const files = argv.filter((arg) => !arg.startsWith("--"));
  if (files.length === 0) {
    console.error("usage: node scripts/probe-unknowns.ts <file...> [--json]");
    console.error("");
    console.error("Reports everything this library still cannot name, in one pass.");
    console.error("See docs/MANUAL-WORK.md for the documents that close each gap.");
    return 2;
  }
  const all = files.map(probe);
  if (argv.includes("--json")) {
    console.log(JSON.stringify(all, null, 2));
    return 0;
  }
  for (const findings of all) console.log(render(findings));

  const open =
    all.some((f) => f.unknownFunctions.length) ||
    all.some((f) => f.controls.length) ||
    all.some((f) => f.builds.length) ||
    all.some((f) => f.borderPositions.length);
  console.log(
    open
      ? "\nSomething here is new. Record it in docs/MANUAL-WORK.md and turn it into a test."
      : "\nNothing unknown in these documents.",
  );
  return 0;
}

process.exitCode = main(process.argv.slice(2));
