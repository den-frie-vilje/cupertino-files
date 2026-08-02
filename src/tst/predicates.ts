/**
 * Table predicates (`TST.FormulaPredicateArchive`).
 *
 * One structure answers "does this cell match?" for two features that look
 * unrelated in the UI: **conditional formatting** ("colour this cell when
 * it is below zero") and **filters** ("show rows where this column is
 * below zero"). Apple stores both as the same archive, distinguished only
 * by a `for_conditional_style` flag, so this module is shared rather than
 * duplicated into {@link ../tst/conditional.ts} and {@link ../tst/filters.ts}.
 *
 * A predicate is stored twice over, redundantly:
 *
 *  - as a **formula** — a real TSCE AST, `<cell> < 0` — which is what the
 *    calc engine evaluates; and
 *  - as a **template**: `predicate_type` naming the comparison, plus up to
 *    three `param_value` operands and the AST indexes they occupy, which
 *    is what the UI's condition editor round-trips.
 *
 * The two must agree, and that redundancy is what makes this decodable
 * without Apple's enum. `predicate_type` is an unpublished integer; the
 * formula's terminal operator node is the documented TSCE comparison enum
 * this library already renders. So the **formula is treated as
 * authoritative** for what the condition means, and `predicate_type` is
 * carried through as an opaque number. {@link PREDICATE_TYPE_OPERATORS}
 * records only the pairings the corpus actually exhibits — it is a log of
 * observations, not a guess at the full enum.
 *
 * The operand under test has no address: a predicate is written once and
 * applied to a whole range, so Apple encodes it as a linked cell reference
 * with no coordinate. It renders as {@link SELF_CELL_MARKER} unless the
 * caller knows which cell they are asking about.
 */
import { protoFields } from "../proto/fields.ts";
import type { RawMessage } from "../base/protobuf.ts";
import type { FormulaOwnerRegistry } from "../tsce/owners.ts";
import { decodeDecimal128 } from "./tables.ts";
import { AstNodeArrayFields, AstNodeFields, AstNodeType, FormulaFields } from "../tsce/ast.ts";
import {
  renderFormula,
  SELF_CELL_MARKER,
  type FormulaOrigin,
  type RenderedFormula,
} from "./formulas.ts";

/** TST.FormulaPredicateArchive. */
export const PredicateFields = protoFields("TST.FormulaPredicateArchive", {
  PREDICATE_TYPE: "predicate_type",
  QUALIFIER1: "qualifier1",
  QUALIFIER2: "qualifier2",
  PARAM_VALUE0: "param_value0",
  PARAM_VALUE1: "param_value1",
  PARAM_VALUE2: "param_value2",
  FORMULA: "formula",
  FOR_CONDITIONAL_STYLE: "for_conditional_style",
  HOST_TABLE_UID: "host_table_uid",
  HOST_COLUMN_UID: "host_column_uid",
  HOST_ROW_UID: "host_row_uid",
});

/**
 * TST.FormulaPredicatePrePivotArchive — the pre-2016 shape.
 *
 * Same idea, but the operands are *positions in the AST* rather than
 * values: `param_index0/1/2` say which node each editable operand is.
 * Files written by current apps carry both forms; older ones carry only
 * this. A `param_index` of -1 means the slot is unused.
 */
export const PrePivotPredicateFields = protoFields("TST.FormulaPredicatePrePivotArchive", {
  FORMULA: "formula",
  PREDICATE_TYPE: "predicate_type",
  QUALIFIER1: "qualifier1",
  QUALIFIER2: "qualifier2",
  PARAM_INDEX1: "param_index1",
  PARAM_INDEX2: "param_index2",
  PARAM_INDEX0: "param_index0",
});

/** TST.FormulaPredArgArchive. */
export const PredArgFields = protoFields("TST.FormulaPredArgArchive", {
  ARG_TYPE: "arg_type",
  ARG_VALUE: "arg_value",
  BASE_CELL_REF: "base_cell_ref",
  RELATIVE_CELL_REF: "relative_cell_ref",
  CATEGORY_REF: "category_ref",
  UID_TRACT_LIST: "uid_tract_list",
  HOST_CELL_COORD: "host_cell_coord",
  PRESERVE_ROW: "preserve_row",
  PRESERVE_COLUMN: "preserve_column",
  LIST_ENTRIES: "list_entries",
  VIEW_TRACT_REF: "view_tract_ref",
});

/** TST.FormulaPredArgDataArchive — one operand's value, by type. */
export const PredArgDataFields = protoFields("TST.FormulaPredArgDataArchive", {
  DOUBLE_VALUE: "double_value",
  DECIMAL_LOW: "decimal_low",
  DECIMAL_HIGH: "decimal_high",
  STRING_VALUE: "string_value",
  DATE_VALUE: "date_value",
  DURATION_TIMEINTERVAL: "duration_timeinterval",
  DURATION_UNITS: "duration_units",
  BOOLEAN_VALUE: "boolean_value",
});

/**
 * Comparison operators, by the TSCE AST node that encodes them.
 *
 * These are the documented enum, not an inference: the same node types
 * appear in ordinary cell formulas, where their meaning is visible in the
 * app's formula bar.
 */
const OPERATOR_BY_NODE: ReadonlyMap<number, PredicateOperator> = new Map([
  [AstNodeType.EQUAL_TO, "="],
  [AstNodeType.NOT_EQUAL_TO, "<>"],
  [AstNodeType.GREATER_THAN, ">"],
  [AstNodeType.GREATER_THAN_OR_EQUAL, ">="],
  [AstNodeType.LESS_THAN, "<"],
  [AstNodeType.LESS_THAN_OR_EQUAL, "<="],
]);

export type PredicateOperator = "=" | "<>" | ">" | ">=" | "<" | "<=";

/**
 * `predicate_type` values paired with the operator their formula uses.
 *
 * **Observations, not a schema.** Every entry is a pairing seen in the
 * fixture corpus, where the formula AST independently states the
 * comparison. Apple's enum certainly has more members; a value absent
 * here is reported as `undefined` rather than guessed, because a filter
 * silently read as "greater than" when it means "greater than or equal"
 * is worse than one honestly reported as unknown.
 *
 * Sources: `numbers-parser-v26.1-xlsx-lineage.numbers` in this repository —
 * three conditional-style sets, types 9 (`<`) and 5 (`=`). Types 6 (`<>`)
 * and 10 (`<=`) come from public conditional-formatting demo documents read
 * and discarded; each was confirmed by its own formula, and
 * `scripts/harvest-predicates.ts` re-derives all four from any such file.
 */
export const PREDICATE_TYPE_OPERATORS: ReadonlyMap<number, PredicateOperator> = new Map([
  [5, "="],
  [6, "<>"],
  [9, "<"],
  [10, "<="],
]);

/**
 * `predicate_type` values whose formula is a function call, not a
 * comparison.
 *
 * Numbers' non-comparison conditions — "is blank", "text contains", and the
 * rest — compile to a function rather than an operator, so they have no
 * entry in {@link PREDICATE_TYPE_OPERATORS}. Recording the codes anyway
 * means a reader can say *which* condition it is looking at, and it keeps
 * them from being mistaken for gaps in the comparison enum.
 */
export const PREDICATE_TYPE_FUNCTIONS: ReadonlyMap<number, string> = new Map([
  [34, "ISBLANK"],
  [54, "SUM"],
]);

/**
 * A **prediction** for the rest of the enum, held separately from the proof.
 *
 * Numbers' condition menu lists the numeric comparisons in a fixed order:
 * equal to, not equal to, greater than, greater than or equal to, less
 * than, less than or equal to. Laying that order out from 5 predicts all
 * six codes, and **four of the six are now observed** — 5 `=`, 6 `<>`,
 * 9 `<`, 10 `<=` — each landing exactly where the menu says it should.
 *
 * What is left is narrower than it looks. Two codes remain, 7 and 8, and
 * two operators remain, `>` and `>=`; the only open question is whether
 * they are in menu order or swapped. No document read so far uses either
 * condition.
 *
 * It is still a prediction, and this map is **never consulted when
 * reading**: {@link readPredicate} takes the operator from the formula,
 * which states it outright. What this is for is making a harvest decisive
 * — `scripts/harvest-predicates.ts` checks every observed pairing against
 * it and reports agreements and contradictions, so one document with a
 * "greater than" rule settles the rest instead of merely collecting rows.
 *
 * See `docs/MANUAL-WORK.md` protocol 4.
 */
export const PREDICATE_TYPE_HYPOTHESIS: ReadonlyMap<number, PredicateOperator> = new Map([
  [5, "="],
  [6, "<>"],
  [7, ">"],
  [8, ">="],
  [9, "<"],
  [10, "<="],
]);

/** Which entries of the hypothesis the corpus has actually confirmed. */
export function predicateTypeStatus(): {
  type: number;
  operator: PredicateOperator;
  proven: boolean;
}[] {
  return [...PREDICATE_TYPE_HYPOTHESIS].map(([type, operator]) => ({
    type,
    operator,
    proven: PREDICATE_TYPE_OPERATORS.get(type) === operator,
  }));
}

/** How the operand's value was stored, derived from which field is set. */
export type PredicateOperandKind =
  | "number"
  | "string"
  | "boolean"
  | "date"
  | "duration"
  | "cell"
  | "range"
  | "none";

/** One side of a comparison. */
export interface PredicateOperand {
  kind: PredicateOperandKind;
  /** Numbers, dates (as an Apple epoch offset) and durations. */
  number?: number;
  string?: string;
  boolean?: boolean;
  /** Duration operands only: the unit code the app displays it in. */
  durationUnits?: number;
  /**
   * `arg_type` as stored. Preserved because {@link kind} is derived from
   * which value field is populated, which is reliable, whereas the code
   * itself is an unpublished enum.
   */
  argType: number | undefined;
}

/** A decoded condition. */
export interface Predicate {
  /** Raw `predicate_type`; see {@link PREDICATE_TYPE_OPERATORS}. */
  predicateType: number | undefined;
  qualifier1: number | undefined;
  qualifier2: number | undefined;
  /** Set on conditional-formatting predicates, absent on filters. */
  forConditionalStyle: boolean;
  /**
   * The comparison, read from the formula's terminal operator node.
   * `undefined` when the formula is something richer than a comparison —
   * a "text contains" rule, say, which is a function call.
   */
  operator: PredicateOperator | undefined;
  /** Operands in `param_value0..2` order, unused slots dropped. */
  operands: PredicateOperand[];
  /** The condition as text, e.g. `THIS_CELL<0`. */
  text: string;
  /** Full render detail, including anything the renderer could not name. */
  formula: RenderedFormula;
  /**
   * True when {@link predicateType} disagrees with the formula's operator.
   * Never seen in the corpus; a caller writing predicates should treat it
   * as a bug, and a caller reading one should trust {@link operator}.
   */
  inconsistent: boolean;
}

export interface ReadPredicateOptions extends Partial<FormulaOrigin> {
  /** Address to render in place of the coordinate-less "cell under test". */
  selfCell?: string;
  /**
   * Owner registry, so a predicate reaching into another table names it.
   *
   * A filter or conditional rule is an ordinary TSCE formula and can
   * reference another table exactly as a cell formula can. Without this it
   * renders `OTHER_TABLE::C1`, which is honest but useless.
   */
  owners?: FormulaOwnerRegistry;
}

/**
 * True when a field is present *and* length-delimited.
 *
 * `has` alone is not enough: field 7 is the formula in the modern predicate
 * archive, and a document in the wild puts a varint there. Reading wire
 * type before reaching for a submessage is the schema-light rule this
 * library is built on, and this is the spot that forgot it.
 */
function hasMessageAt(message: RawMessage, field: number): boolean {
  return message.fields.some((f) => f.no === field && f.wire === 2);
}

/**
 * Decode a `TST.FormulaPredicateArchive`.
 *
 * Also accepts the pre-pivot shape, whose field numbers differ; the two
 * are told apart by where the formula sits (field 7 in the modern archive,
 * field 1 in the older one).
 */
export function readPredicate(
  message: RawMessage | undefined,
  options: Partial<ReadPredicateOptions> = {},
): Predicate | undefined {
  if (!message) return undefined;
  const prePivot = !hasMessageAt(message, PredicateFields.FORMULA) &&
    hasMessageAt(message, PrePivotPredicateFields.FORMULA);
  const fields = prePivot ? PrePivotPredicateFields : PredicateFields;
  // Not `getMessage`: some archives put a scalar where the modern schema
  // puts the formula, and a predicate with no readable formula is still a
  // predicate worth reporting — with its type — rather than a crash.
  const formulaMessage = hasMessageAt(message, fields.FORMULA)
    ? message.getMessage(fields.FORMULA)
    : undefined;

  const origin =
    options.row !== undefined && options.column !== undefined
      ? { row: options.row, column: options.column }
      : undefined;
  const formula = renderFormula(formulaMessage, origin, {
    selfCell: options.selfCell ?? SELF_CELL_MARKER,
    ...(options.owners ? { owners: options.owners } : {}),
  });

  const operator = terminalOperator(formulaMessage);
  const predicateType = message.getUint(fields.PREDICATE_TYPE);
  const expected = predicateType === undefined ? undefined : PREDICATE_TYPE_OPERATORS.get(predicateType);

  const operands: PredicateOperand[] = [];
  if (!prePivot) {
    for (const field of [
      PredicateFields.PARAM_VALUE0,
      PredicateFields.PARAM_VALUE1,
      PredicateFields.PARAM_VALUE2,
    ]) {
      const operand = readOperand(message.getMessage(field));
      if (operand && operand.kind !== "none") operands.push(operand);
    }
  }

  return {
    predicateType,
    qualifier1: message.getUint(fields.QUALIFIER1),
    qualifier2: message.getUint(fields.QUALIFIER2),
    forConditionalStyle: message.getBool(PredicateFields.FOR_CONDITIONAL_STYLE) ?? false,
    operator,
    operands,
    text: formula.text.replace(/^=/, ""),
    formula,
    inconsistent: expected !== undefined && operator !== undefined && expected !== operator,
  };
}

/**
 * The comparison a predicate formula performs.
 *
 * The AST is post-order, so the comparison — when the formula is a plain
 * comparison at all — is its last node. A formula ending in anything else
 * (a function call, for a "text contains" rule) has no simple operator,
 * and saying so is more useful than picking the nearest comparison found
 * somewhere inside it.
 */
function terminalOperator(formula: RawMessage | undefined): PredicateOperator | undefined {
  const nodes = formula
    ?.getMessage(FormulaFields.AST_NODE_ARRAY)
    ?.getMessages(AstNodeArrayFields.NODES);
  const last = nodes?.[nodes.length - 1];
  const type = last?.getUint(AstNodeFields.TYPE);
  return type === undefined ? undefined : OPERATOR_BY_NODE.get(type);
}

/**
 * Decode one `TST.FormulaPredArgArchive`.
 *
 * The kind comes from which field carries a value rather than from
 * `arg_type`: the populated field is unambiguous, whereas `arg_type` is an
 * unpublished enum whose members beyond those in the corpus are unknown.
 */
export function readOperand(message: RawMessage | undefined): PredicateOperand | undefined {
  if (!message) return undefined;
  const argType = message.getUint(PredArgFields.ARG_TYPE);
  const base: PredicateOperand = { kind: "none", argType };

  if (message.has(PredArgFields.RELATIVE_CELL_REF) || message.has(PredArgFields.BASE_CELL_REF)) {
    return { ...base, kind: "cell" };
  }
  if (message.has(PredArgFields.UID_TRACT_LIST) || message.has(PredArgFields.VIEW_TRACT_REF)) {
    return { ...base, kind: "range" };
  }

  const value = message.getMessage(PredArgFields.ARG_VALUE);
  if (!value) return base;

  const string = value.getString(PredArgDataFields.STRING_VALUE);
  if (string !== undefined) return { ...base, kind: "string", string };

  const boolean = value.getBool(PredArgDataFields.BOOLEAN_VALUE);
  if (boolean !== undefined) return { ...base, kind: "boolean", boolean };

  if (value.has(PredArgDataFields.DATE_VALUE)) {
    return { ...base, kind: "date", number: value.getDouble(PredArgDataFields.DATE_VALUE) ?? 0 };
  }
  if (value.has(PredArgDataFields.DURATION_TIMEINTERVAL)) {
    const operand: PredicateOperand = {
      ...base,
      kind: "duration",
      number: value.getDouble(PredArgDataFields.DURATION_TIMEINTERVAL) ?? 0,
    };
    const units = value.getUint(PredArgDataFields.DURATION_UNITS);
    return units === undefined ? operand : { ...operand, durationUnits: units };
  }

  // Numbers carry both a double and a decimal128; the decimal is exact and
  // the double is a convenience copy, so prefer the decimal when present.
  if (value.has(PredArgDataFields.DECIMAL_HIGH) || value.has(PredArgDataFields.DECIMAL_LOW)) {
    return { ...base, kind: "number", number: decimalOf(value) };
  }
  if (value.has(PredArgDataFields.DOUBLE_VALUE)) {
    return { ...base, kind: "number", number: value.getDouble(PredArgDataFields.DOUBLE_VALUE) ?? 0 };
  }
  return base;
}

/** The 16-byte decimal128 split across two varint fields. */
function decimalOf(value: RawMessage): number {
  const low = value.getVarint(PredArgDataFields.DECIMAL_LOW) ?? 0n;
  const high = value.getVarint(PredArgDataFields.DECIMAL_HIGH) ?? 0n;
  const bytes = new Uint8Array(16);
  const view = new DataView(bytes.buffer);
  view.setBigUint64(0, BigInt.asUintN(64, low), true);
  view.setBigUint64(8, BigInt.asUintN(64, high), true);
  return decodeDecimal128(bytes);
}

/**
 * A predicate as a readable condition.
 *
 * `subject` replaces the "cell under test" marker, so a caller who knows
 * they are asking about B4 gets `B4 < 0` rather than `THIS_CELL<0`.
 */
export function describePredicate(predicate: Predicate, subject?: string): string {
  const text = predicate.text || "(empty condition)";
  return subject ? text.split(SELF_CELL_MARKER).join(subject) : text;
}
