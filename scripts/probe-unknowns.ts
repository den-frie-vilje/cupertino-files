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
 *     Predicate formulas (conditional and filter rules) are swept too — a
 *     condition can call a function no cell uses; "text contains" calls
 *     the still-unnamed index 296.
 *  2. **Predicate types** — `predicate_type` paired with the operator its
 *     formula states. Unblocks authoring conditional-formatting and filter
 *     rules. `scripts/harvest-predicates.ts` scores these against the
 *     predicted enum ordering.
 *  3. **Cell controls** — `interaction_type` for each widget, with the
 *     fields that widget populates. Unblocks reading and writing checkboxes,
 *     sliders, steppers and pop-up menus.
 *  4. **Keynote builds** — effect, timing, delivery, trigger, per-stage
 *     chunks, the populated attribute fields, and the shape of
 *     `animationAttributes` (decoded: effect and timing live there on
 *     modern builds; an unlisted field would be a new finding).
 *  5. **Unresolved formula owners** — owner UUIDs that name no object.
 *  6. **Unknown archive types** — type ids absent from the registry.
 *  7. **Paragraph border positions and direction** — `border_positions`
 *     with each style's stroke colour, decoded against the measured
 *     bitmask (1 top, 2 bottom, 4 left, 8 right); a value outside those
 *     bits would be a new finding. Also the storage's `table_para_bidi`
 *     pairs wherever a table departs from the uniform baseline —
 *     per-paragraph direction lives there, not in the style bag, with
 *     0 = LTR and 65535 (uint16 −1) = natural observed and the RTL
 *     value still open.
 *
 * Sections with nothing to report say so, so a run against an ordinary
 * document is a short, honest "nothing new here".
 */
import { readFileSync } from "node:fs";
import { IWorkDocument } from "../src/tsa/document.ts";
import { KeynoteDocument } from "../src/keynote/document.ts";
import { tablesOf } from "../src/tst/tables.ts";
import { typeName } from "../src/tsp/registry.ts";
import { FormulaOwnerRegistry } from "../src/tsce/owners.ts";
import { readPredicate } from "../src/tst/predicates.ts";
import {
  BuildAttributesFields,
  BuildFields,
  DeliveryOption,
  TextDelivery,
} from "../src/keynote/builds.ts";
import {
  ATTR_TABLE_ENTRIES,
  ENTRY_CHARACTER_INDEX,
  ENTRY_PARA_FIRST,
  ENTRY_PARA_SECOND,
  ParaProps,
  Storage,
  StyleArchive,
} from "../src/tswp/schema.ts";
import { readStroke } from "../src/tsd/style.ts";
import type { RawMessage } from "../src/base/protobuf.ts";
import type { ObjectStore } from "../src/tsp/store.ts";

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
  builds: {
    slide: number;
    delivery: string | undefined;
    effect: string | undefined;
    animationType: string | undefined;
    duration: number | undefined;
    delay: number | undefined;
    attributeFields: number[];
    /** eventTrigger (field 4), raw. */
    eventTrigger: number | undefined;
    /** custom_textDelivery (20), rendered "value (NAME)". */
    textDelivery: string | undefined;
    /** custom_deliveryOption (21), rendered "value (NAME)". */
    deliveryOption: string | undefined;
    /** Per-stage timing, for builds delivered in parts. */
    chunks: { delay: number | undefined; duration: number | undefined; automatic: boolean | undefined }[];
    /** The shape of animationAttributes (18) — see the header note. */
    animation18: string | undefined;
  }[];
  unresolvedOwners: { kind: number; count: number }[];
  unknownTypes: { type: number; count: number }[];
  borderPositions: {
    value: number;
    style: string | undefined;
    /** Width and colour — the colour is what ties a code to its paragraph. */
    stroke: string | undefined;
    /** ParaProps.WRITING_DIRECTION when set; unset means natural. */
    writingDirection: number | undefined;
    /** True when a paragraph actually uses this style — see below. */
    used: boolean;
  }[];
  /** table_para_bidi pairs, for storages that depart from a uniform baseline. */
  paraBidi: { pair: string; snippet: string }[];
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
    paraBidi: [],
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
      for (const rule of set.rules()) collectPredicate(predicates, functions, rule.predicate);
    }
    const { rows, columns } = table.filterSets();
    for (const set of [rows, columns]) {
      for (const rule of set?.rules() ?? []) collectPredicate(predicates, functions, rule.predicate);
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
      const enumName = (table: Readonly<Record<string, number>>, value: number | undefined) =>
        value === undefined
          ? undefined
          : `${value} (${Object.entries(table).find(([, n]) => n === value)?.[0] ?? "UNRECOGNISED"})`;
      for (const slide of deck.slides()) {
        for (const build of slide.builds()) {
          const info = build.read();
          const attributes = build.object.message.getMessage(BuildFields.ATTRIBUTES);
          findings.builds.push({
            slide: slide.index,
            delivery: info.delivery,
            effect: info.effect,
            animationType: info.animationType,
            duration: info.duration,
            delay: info.delay,
            eventTrigger: attributes?.getUint(BuildAttributesFields.EVENT_TRIGGER),
            textDelivery: enumName(TextDelivery, info.textDelivery),
            deliveryOption: enumName(DeliveryOption, info.deliveryOption),
            chunks: info.chunks.map((chunk) => ({
              delay: chunk.delay,
              duration: chunk.duration,
              automatic: chunk.automatic,
            })),
            animation18: describeAnimationAttributes(deck.store, attributes),
            attributeFields:
              attributes?.fields
                .map((field) => field.no)
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
  //
  // Whether the style is *used* is the point. Apple's templates define
  // bordered heading styles that most documents never apply, so a corpus
  // can look like it has border evidence and have none: across 128
  // documents, every non-zero border_positions belonged to an unused
  // template style and not one paragraph drew a border. Only a used style
  // shows up in the package's rendered preview, which is the one way to
  // see which edge a value draws without opening the app.
  const usedStyleIds = new Set<bigint>();
  for (const storage of document.textStorages()) {
    for (const paragraph of storage.paragraphs()) {
      if (paragraph.styleId !== undefined) usedStyleIds.add(paragraph.styleId);
    }
    // Per-paragraph direction lives in the storage's bidi table, not the
    // style bag. A uniform all-(0,0) or all-(65535,65535) table is the
    // baseline everywhere; only a departure is worth a line.
    const table = storage.object.message.getMessage(Storage.TABLE_PARA_BIDI);
    const entries = table?.getMessages(ATTR_TABLE_ENTRIES) ?? [];
    const pairs = entries.map((entry) => ({
      start: Number(entry.getVarint(ENTRY_CHARACTER_INDEX) ?? 0n),
      first: entry.getVarint(ENTRY_PARA_FIRST) ?? 0n,
      second: entry.getVarint(ENTRY_PARA_SECOND) ?? 0n,
    }));
    const baseline = (p: { first: bigint; second: bigint }) =>
      (p.first === 0n && p.second === 0n) || (p.first === 65535n && p.second === 65535n);
    if (pairs.length === 0 || (pairs.every(baseline) && new Set(pairs.map((p) => p.first)).size <= 1)) {
      continue;
    }
    const paragraphs = storage.paragraphs();
    for (const p of pairs.slice(0, 30)) {
      const para = paragraphs.find((info) => info.start === p.start);
      findings.paraBidi.push({
        pair: `(${p.first}, ${p.second})`,
        snippet: (para?.text ?? `char ${p.start}`).slice(0, 44),
      });
    }
  }
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
    const stroke = readStroke(props!.getMessage(ParaProps.STROKE));
    const direction = props!.getVarint(ParaProps.WRITING_DIRECTION);
    findings.borderPositions.push({
      value,
      style: obj.message.getMessage(1)?.getString(1),
      stroke:
        stroke === undefined
          ? undefined
          : `${stroke.width ?? "?"}pt ` +
            (stroke.color === undefined
              ? "(no colour)"
              : `rgb(${stroke.color.r.toFixed(2)}, ${stroke.color.g.toFixed(2)}, ${stroke.color.b.toFixed(2)})`),
      writingDirection: direction === undefined ? undefined : Number(BigInt.asIntN(64, direction)),
      used: usedStyleIds.has(obj.identifier),
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
  functions: Map<number, { occurrences: number; sample: string }>,
  predicate: ReturnType<typeof readPredicate>,
): void {
  if (!predicate) return;
  // A condition can call a function no cell uses — "text contains" calls
  // the still-unnamed index 296 — so predicate formulas feed the unknown-
  // function sweep too. The renderer already marks them: FUNCTION_<id>.
  for (const match of predicate.text.matchAll(/\bFUNCTION_(\d+)\b/g)) {
    const index = Number(match[1]);
    const seen = functions.get(index) ?? { occurrences: 0, sample: predicate.text };
    seen.occurrences++;
    functions.set(index, seen);
  }
  if (predicate.predicateType === undefined) return;
  if (into.has(predicate.predicateType)) return;
  into.set(predicate.predicateType, { operator: predicate.operator, sample: predicate.text });
}

/**
 * Decode a `border_positions` value against the measured bitmask (see
 * `BorderPosition`): 1 top, 2 bottom, 4 leading, 8 trailing — the side
 * bits are logical, drawing left/right in an LTR paragraph and swapped
 * in an RTL one. A residue outside those bits is flagged rather than
 * folded in.
 */
function describeBorderBits(value: number): string {
  const edges = [
    ...(value & 1 ? ["top"] : []),
    ...(value & 2 ? ["bottom"] : []),
    ...(value & 4 ? ["leading"] : []),
    ...(value & 8 ? ["trailing"] : []),
  ];
  const residue = value & ~15;
  if (residue !== 0) edges.push(`UNKNOWN BIT ${residue} — a new finding`);
  return `(${edges.join("+") || "none"})`;
}

/**
 * The shape of `attributes.animationAttributes` (field 18) — where modern
 * Keynote packs the effect and timing the legacy `database_*` fields no
 * longer carry. Whether 18 is an inline archive or a `TSP.Reference` is
 * itself unmeasured, so both readings are attempted: a lone varint at
 * field 1 that resolves in the store is reported as the reference it then
 * must be, anything else as an inline message with its field numbers.
 */
function describeAnimationAttributes(store: ObjectStore, attributes: RawMessage | undefined): string | undefined {
  const message = attributes?.getMessage(BuildAttributesFields.ANIMATION_ATTRIBUTES);
  if (!message) return undefined;
  const numbers = message.fields
    .map((field) => field.no)
    .filter((no, i, all) => all.indexOf(no) === i)
    .sort((a, b) => a - b);
  if (numbers.length === 1 && numbers[0] === 1) {
    const id = message.getVarint(1);
    const target = id === undefined ? undefined : store.resolve(id);
    if (target) {
      const targetFields = target.message.fields
        .map((field) => field.no)
        .filter((no, i, all) => all.indexOf(no) === i)
        .sort((a, b) => a - b);
      return (
        `→ reference to object ${target.identifier} type ${target.type} ` +
        `(${typeName(target.type, "keynote") ?? "UNREGISTERED — measure it"}) fields=[${targetFields.join(",")}]`
      );
    }
  }
  return `inline, fields=[${numbers.join(",")}]`;
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
    findings.builds.flatMap((b) => [
      `slide ${b.slide}: effect=${JSON.stringify(b.effect)} type=${JSON.stringify(b.animationType)} duration=${b.duration ?? "unset"} delay=${b.delay ?? "unset"} delivery=${JSON.stringify(b.delivery)} attributeFields=[${b.attributeFields.join(",")}]`,
      ...(b.eventTrigger === undefined ? [] : [`    eventTrigger=${b.eventTrigger}`]),
      ...(b.textDelivery === undefined ? [] : [`    textDelivery=${b.textDelivery}`]),
      ...(b.deliveryOption === undefined ? [] : [`    deliveryOption=${b.deliveryOption}`]),
      ...(b.animation18 === undefined ? [] : [`    animationAttributes(18) ${b.animation18}`]),
      ...b.chunks.map(
        (chunk, i) =>
          `    chunk ${i}: delay=${chunk.delay ?? "unset"} duration=${chunk.duration ?? "unset"} automatic=${chunk.automatic ?? "unset"}`,
      ),
    ]),
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
    "7. Paragraph border positions (decoded against the measured bitmask)",
    [
      ...findings.borderPositions.map(
        (b) =>
          `border_positions=${b.value} ${describeBorderBits(b.value)} style=${JSON.stringify(b.style)}` +
          (b.stroke === undefined ? " (no stroke)" : ` stroke=${b.stroke}`) +
          (b.writingDirection === undefined ? "" : ` writing_direction=${b.writingDirection}`) +
          (b.used
            ? "  USED — match the stroke colour to the paragraph wearing it"
            : "  (defined but unused: no paragraph applies it, so nothing renders)"),
      ),
      ...findings.paraBidi.map((b) => `para_bidi pair=${b.pair}  ${JSON.stringify(b.snippet)}`),
    ],
    "no paragraph borders here",
  );
  return out.join("\n");
}

function main(argv: string[]): number {
  const files = argv.filter((arg) => !arg.startsWith("--"));
  if (files.length === 0) {
    console.error("usage: node scripts/probe-unknowns.ts <file...> [--json]");
    console.error("");
    console.error("Reports everything this library still cannot name, in one pass.");
    console.error("See docs/BLOCKERS.md for the documents that close each gap.");
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
    // The border bitmask is fully measured (1|2|4|8); only a residue
    // outside it is news now.
    all.some((f) => f.borderPositions.some((b) => (b.value & ~15) !== 0));
  console.log(
    open
      ? "\nSomething here is new. Record it in the docs/BLOCKERS.md ledger and turn it into a test."
      : "\nNothing unknown in these documents.",
  );
  return 0;
}

process.exitCode = main(process.argv.slice(2));
