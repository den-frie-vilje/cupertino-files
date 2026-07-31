/**
 * Conditional formatting (`TST.ConditionalStyleSetArchive`).
 *
 * A conditional style is a small ordered rulebook attached to a cell: for
 * each rule, a {@link Predicate} and the cell and text styles to use when
 * it matches. The app evaluates the rules in order and the first match
 * wins; nothing here evaluates them, because doing so means running the
 * calc engine over the whole document.
 *
 * The wiring is the same interning pattern the string and format tables
 * use. `DataStore.conditionalstyletable` is a `TST.TableDataList` mapping
 * a small integer key to a rule set, and each cell's record carries that
 * key in its `COND_STYLE_ID` field. Many cells share one rule set — in the
 * corpus, three sets cover 1921 cells — so reading is a table lookup, and
 * assigning a rule set to another cell is writing one integer.
 *
 * Rule sets appear twice in every file current apps write: `rules_prepivot`
 * (the pre-2016 encoding, operands as AST indexes) and `rules` (operands
 * as values). {@link ConditionalStyleSet.rules} reads the modern list and
 * falls back to the older one, so a file from either era decodes.
 */
import type { IwaObject } from "../tsp/iwa.ts";
import type { ObjectStore } from "../tsp/store.ts";
import { refId } from "../tsp/schema.ts";
import {
  PredArgDataFields,
  PredArgFields,
  PredicateFields,
  PREDICATE_TYPE_OPERATORS,
  PrePivotPredicateFields,
  readPredicate,
  type Predicate,
  type PredicateOperator,
  type ReadPredicateOptions,
} from "./predicates.ts";
import { RawMessage } from "../base/protobuf.ts";
import { makeRef } from "../tsp/schema.ts";
import { AstNodeArrayFields, AstNodeFields, AstNodeType, FormulaFields } from "../tsce/ast.ts";
import { buildFormula } from "./formula-builder.ts";
import { encodeDecimal128 } from "./cellrecord.ts";
import { readCfUid } from "../tsce/owners.ts";
import { cellAddress } from "./formulas.ts";
import type { CellFormatting } from "./styles.ts";

/** TST.ConditionalStyleSetArchive. */
export const ConditionalStyleSetFields = {
  RULE_COUNT: 1,
  RULES_PRE_PIVOT: 2,
  RULES: 3,
} as const;

/** TST.ConditionalStyleSetArchive.ConditionalStyleRules: rule = 1. */
const ConditionalStyleRules = { RULE: 1 } as const;

/** Both rule shapes number their three fields alike. */
const ConditionalStyleRuleFields = {
  PREDICATE: 1,
  CELL_STYLE: 2,
  TEXT_STYLE: 3,
} as const;

/** One "when this, look like that" entry. */
export interface ConditionalRule {
  /** Position in the set; the app applies the first matching rule. */
  index: number;
  /** The condition. Absent only in a malformed archive. */
  predicate: Predicate | undefined;
  /** `TST.CellStyleArchive` applied on a match. */
  cellStyleId: bigint | undefined;
  /** Character style applied to the cell's text on a match. */
  textStyleId: bigint | undefined;
  /** True when read from the pre-2016 `rules_prepivot` list. */
  legacy: boolean;
}

/** A rule set, as interned in the table's conditional-style table. */
export class ConditionalStyleSet {
  readonly store: ObjectStore;
  readonly object: IwaObject;
  /** Key in the owning table's conditional-style table. */
  readonly key: number;

  constructor(store: ObjectStore, object: IwaObject, key: number) {
    this.store = store;
    this.object = object;
    this.key = key;
  }

  get id(): bigint {
    return this.object.identifier;
  }

  /**
   * The count Apple records, which may exceed the rules actually stored:
   * it counts the set as authored, and a rule whose style was deleted
   * leaves the count behind. Compare against `rules().length`.
   */
  get declaredRuleCount(): number {
    return this.object.message.getUint(ConditionalStyleSetFields.RULE_COUNT) ?? 0;
  }

  /**
   * The rules, in evaluation order.
   *
   * `subject` is the address the condition is being asked about, so a rule
   * on B4 reads `B4<0` rather than the generic marker. Omit it and rules
   * render generically, which is right when describing the set itself
   * rather than its effect on one cell.
   */
  rules(
    subject?: { row: number; column: number },
    extra: ReadPredicateOptions = {},
  ): ConditionalRule[] {
    // cellAddress takes (column, row). Passing (row, column) named the
    // transposed cell — B3 read back as C2 — and looked plausible in every
    // square range, which is most of them.
    const selfCell = subject ? cellAddress(subject.column, subject.row) : undefined;
    const options = {
      ...extra,
      ...(subject ?? {}),
      ...(selfCell !== undefined ? { selfCell } : {}),
    };

    const modern = this.object.message
      .getMessage(ConditionalStyleSetFields.RULES)
      ?.getMessages(ConditionalStyleRules.RULE);
    if (modern?.length) {
      return modern.map((rule, index) => ({
        index,
        predicate: readPredicate(rule.getMessage(ConditionalStyleRuleFields.PREDICATE), options),
        cellStyleId: refId(rule, ConditionalStyleRuleFields.CELL_STYLE),
        textStyleId: refId(rule, ConditionalStyleRuleFields.TEXT_STYLE),
        legacy: false,
      }));
    }
    // Field 2 holds the rules directly, unlike the modern list at field 3
    // which wraps them in a `ConditionalStyleRules`. The asymmetry is
    // Apple's, and it is easy to "correct" into a bug.
    return this.object.message
      .getMessages(ConditionalStyleSetFields.RULES_PRE_PIVOT)
      .map((rule, index) => ({
        index,
        predicate: readPredicate(rule.getMessage(ConditionalStyleRuleFields.PREDICATE), options),
        cellStyleId: refId(rule, ConditionalStyleRuleFields.CELL_STYLE),
        textStyleId: refId(rule, ConditionalStyleRuleFields.TEXT_STYLE),
        legacy: true,
      }));
  }

  /** Turn a rule set into lines a person can read. */
  describe(subject?: { row: number; column: number }): string[] {
    return this.rules(subject).map((rule) => {
      const condition = rule.predicate?.text || "(unreadable condition)";
      return `if ${condition} → cell style ${rule.cellStyleId ?? "—"}, text style ${rule.textStyleId ?? "—"}`;
    });
  }
}

// --------------------------------------------------------------- authoring

/**
 * A condition to write, as the pair the archive actually stores.
 *
 * A predicate is recorded twice over — as a real TSCE formula the engine
 * evaluates, and as a template the condition editor round-trips — and both
 * must agree. {@link buildConditionalStyleSet} derives one from the other
 * so they cannot drift.
 *
 * Only the four comparisons whose `predicate_type` has been *observed* can
 * be written. `>` and `>=` are predicted to be 7 and 8 but no document has
 * confirmed the pairing, and a rule stored under the wrong code is a rule
 * the editor shows as something else while the formula says the truth —
 * the kind of disagreement that is very hard to notice.
 */
export interface ConditionalCondition {
  operator: PredicateOperator;
  /** The literal the cell is compared against. */
  value: number;
  /**
   * Formatting to apply on a match — the usual way to write a rule.
   *
   * A `TST.CellStyleArchive` is created from it and referenced. Supply this
   * or {@link cellStyleId}; a rule must format *something*, because both
   * style references are `required` (see {@link buildConditionalStyleSet}).
   */
  cell?: CellFormatting;
  /** An existing `TST.CellStyleArchive`, when one is already interned. */
  cellStyleId?: bigint;
  /**
   * Paragraph style for the cell's text on a match.
   *
   * Defaults to the table's own body text style, which satisfies the
   * required reference while leaving the text as it was.
   */
  textStyleId?: bigint;
}

/** TSCE.FormulaPredArgArchive argument kinds seen in real predicates. */
const PredArgType = { UNUSED: 0, VALUE: 1, RELATIVE_CELL: 4 } as const;

/**
 * `param_index` for a slot the pre-pivot form does not use.
 *
 * Stored as a full-width negative varint, which is what -1 looks like on
 * the wire in proto2 and what Apple writes.
 */
const UNUSED_PARAM_INDEX = -1n & 0xffffffffffffffffn;

/**
 * Build a `TST.ConditionalStyleSetArchive` for one condition.
 *
 * `tableUid` is the table's own calc-engine owner UUID, as a
 * `TSP.CFUUIDArchive`: the cell under test is a linked reference that names
 * its table and carries no coordinate, because one rule applies to a whole
 * range. Callers get it from the formula-owner registry rather than
 * deriving it.
 *
 * Both encodings are written — `rules` and `rules_prepivot` — because every
 * file a current app produces carries both, and a reader that prefers the
 * older one would otherwise find nothing.
 */
export function buildConditionalStyleSet(
  conditions: readonly ConditionalCondition[],
  tableUid: RawMessage,
): RawMessage {
  if (conditions.length === 0) throw new RangeError("a conditional style set needs a rule");

  const set = RawMessage.create();
  set.setVarint(ConditionalStyleSetFields.RULE_COUNT, conditions.length);
  const modern = RawMessage.create();

  for (const condition of conditions) {
    const predicateType = [...PREDICATE_TYPE_OPERATORS].find(
      ([, operator]) => operator === condition.operator,
    )?.[0];
    if (predicateType === undefined) {
      throw new RangeError(
        `no predicate_type is confirmed for ${JSON.stringify(condition.operator)}; ` +
          `writable operators are ${[...PREDICATE_TYPE_OPERATORS.values()].join(" ")} ` +
          "— see docs/BLOCKERS.md priority 2",
      );
    }
    const formula = buildPredicateFormula(condition, tableUid);

    const predicate = RawMessage.create();
    predicate.setVarint(PredicateFields.PREDICATE_TYPE, predicateType);
    predicate.setVarint(PredicateFields.QUALIFIER1, 0);
    predicate.setVarint(PredicateFields.QUALIFIER2, 0);
    predicate.setMessage(PredicateFields.PARAM_VALUE0, cellUnderTestArg(tableUid));
    predicate.setMessage(PredicateFields.PARAM_VALUE1, literalArg(condition.value));
    predicate.setMessage(PredicateFields.PARAM_VALUE2, unusedArg());
    predicate.setMessage(PredicateFields.FORMULA, formula);
    predicate.setVarint(PredicateFields.FOR_CONDITIONAL_STYLE, 1);
    modern.addMessage(ConditionalStyleRules.RULE, rule(predicate, condition));

    // The pre-2016 twin: the same formula, with the operands named by their
    // position in the AST rather than by value.
    const older = RawMessage.create();
    older.setMessage(PrePivotPredicateFields.FORMULA, formula);
    older.setVarint(PrePivotPredicateFields.PREDICATE_TYPE, predicateType);
    older.setVarint(PrePivotPredicateFields.QUALIFIER1, 0);
    older.setVarint(PrePivotPredicateFields.QUALIFIER2, 0);
    older.setVarint(PrePivotPredicateFields.PARAM_INDEX1, 1);
    older.setVarint(PrePivotPredicateFields.PARAM_INDEX2, UNUSED_PARAM_INDEX);
    older.setVarint(PrePivotPredicateFields.PARAM_INDEX0, 0);
    // Directly at field 2, repeated — not wrapped, unlike the modern list.
    set.addMessage(ConditionalStyleSetFields.RULES_PRE_PIVOT, rule(older, condition));
  }

  set.setMessage(ConditionalStyleSetFields.RULES, modern);
  return set;
}

/**
 * One rule: the predicate, and the two styles it applies.
 *
 * **Both style references are `required`**, in `ConditionalStyleRule` and in
 * its pre-pivot twin alike:
 *
 * ```proto
 * message ConditionalStyleRule {
 *   optional .TST.FormulaPredicateArchive predicate = 1;
 *   required .TSP.Reference cell_style = 2;
 *   required .TSP.Reference text_style = 3;
 * }
 * ```
 *
 * Omitting them does not produce a rule that formats nothing — it produces
 * a **malformed message**, which Numbers refuses along with the whole
 * document. This was shipped once, and the byte-identity test did not catch
 * it because the only rule Apple wrote to compare against has both styles;
 * there is no such thing as an unstyled conditional rule to compare with.
 * So they are required here too, rather than written when present.
 */
function rule(predicate: RawMessage, condition: ConditionalCondition): RawMessage {
  if (condition.cellStyleId === undefined || condition.textStyleId === undefined) {
    throw new RangeError(
      "a conditional rule needs both a cell style and a text style: TST.ConditionalStyleRule " +
        "declares cell_style and text_style as `required`, so a rule without them is a malformed " +
        "message and Numbers rejects the document. Pass `cell` formatting and let the table " +
        "create the styles, or give cellStyleId and textStyleId directly",
    );
  }
  const out = RawMessage.create();
  out.setMessage(ConditionalStyleRuleFields.PREDICATE, predicate);
  out.setMessage(ConditionalStyleRuleFields.CELL_STYLE, makeRef(condition.cellStyleId));
  out.setMessage(ConditionalStyleRuleFields.TEXT_STYLE, makeRef(condition.textStyleId));
  return out;
}

/** `[<the cell under test>, <literal>, <comparison>]`, in postfix. */
function buildPredicateFormula(
  condition: ConditionalCondition,
  tableUid: RawMessage,
): RawMessage {
  const nodes = RawMessage.create();

  // Not an address: the rule applies to a range, so the operand is a
  // linked reference naming the table and nothing else.
  const subject = RawMessage.create();
  subject.setVarint(AstNodeFields.TYPE, AstNodeType.LINKED_CELL_REFERENCE);
  const crossTable = RawMessage.create();
  crossTable.setMessage(1, tableUid);
  subject.setMessage(AstNodeFields.CROSS_TABLE_INFO, crossTable);
  nodes.addMessage(AstNodeArrayFields.NODES, subject);

  for (const node of buildFormula({ kind: "number", value: condition.value }, { row: 0, column: 0 })
    .getMessages(AstNodeArrayFields.NODES)) {
    nodes.addMessage(AstNodeArrayFields.NODES, node);
  }

  const comparison = RawMessage.create();
  comparison.setVarint(AstNodeFields.TYPE, COMPARISON_NODE[condition.operator]);
  nodes.addMessage(AstNodeArrayFields.NODES, comparison);

  const formula = RawMessage.create();
  formula.setMessage(FormulaFields.AST_NODE_ARRAY, nodes);
  return formula;
}

const COMPARISON_NODE: Record<PredicateOperator, number> = {
  "=": AstNodeType.EQUAL_TO,
  "<>": AstNodeType.NOT_EQUAL_TO,
  ">": AstNodeType.GREATER_THAN,
  ">=": AstNodeType.GREATER_THAN_OR_EQUAL,
  "<": AstNodeType.LESS_THAN,
  "<=": AstNodeType.LESS_THAN_OR_EQUAL,
};

/**
 * The editor's record of "the cell this rule is attached to".
 *
 * The identity here is a `TSP.UUID` — two uint64s — while the AST node a
 * few lines above wants the same 128 bits as a `TSP.CFUUIDArchive`, four
 * uint32s. Both forms name the same table; passing the wrong one produces
 * a predicate that reads back correctly through this library and does not
 * match a single byte Apple wrote.
 */
function cellUnderTestArg(tableUid: RawMessage): RawMessage {
  const uid = readCfUid(tableUid);
  if (!uid) throw new RangeError("table uid is not a readable CFUUID");
  const packed = RawMessage.create();
  packed.setVarint(1, uid.lo);
  packed.setVarint(2, uid.hi);

  const reference = RawMessage.create();
  reference.setVarint(1, 0);
  reference.setVarint(2, 0);
  reference.setMessage(3, packed);
  // Apple writes every remaining slot as an explicit zero rather than
  // leaving it absent — four on the reference, and two more on the
  // argument that wraps it. Putting all six on the reference reads back
  // identically and is four bytes longer than anything Apple wrote.
  for (const field of [4, 5, 6, 7]) reference.setVarint(field, 0);
  const arg = RawMessage.create();
  arg.setVarint(PredArgFields.ARG_TYPE, PredArgType.RELATIVE_CELL);
  arg.setMessage(PredArgFields.RELATIVE_CELL_REF, reference);
  arg.setVarint(PredArgFields.PRESERVE_ROW, 0);
  arg.setVarint(PredArgFields.PRESERVE_COLUMN, 0);
  return arg;
}

/** The editor's record of the literal, as a double *and* a decimal128. */
function literalArg(value: number): RawMessage {
  const decimal = encodeDecimal128(value);
  const view = new DataView(decimal.buffer, decimal.byteOffset, decimal.byteLength);
  const data = RawMessage.create();
  data.setDouble(PredArgDataFields.DOUBLE_VALUE, value);
  data.setVarint(PredArgDataFields.DECIMAL_LOW, view.getBigUint64(0, true));
  data.setVarint(PredArgDataFields.DECIMAL_HIGH, view.getBigUint64(8, true));
  const arg = RawMessage.create();
  arg.setVarint(PredArgFields.ARG_TYPE, PredArgType.VALUE);
  arg.setMessage(PredArgFields.ARG_VALUE, data);
  return arg;
}

function unusedArg(): RawMessage {
  const arg = RawMessage.create();
  arg.setVarint(PredArgFields.ARG_TYPE, PredArgType.UNUSED);
  return arg;
}
