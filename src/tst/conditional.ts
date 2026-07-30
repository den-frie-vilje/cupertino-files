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
import { readPredicate, type Predicate } from "./predicates.ts";
import { cellAddress } from "./formulas.ts";

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
  rules(subject?: { row: number; column: number }): ConditionalRule[] {
    const selfCell = subject ? cellAddress(subject.row, subject.column) : undefined;
    const options = { ...(subject ?? {}), ...(selfCell !== undefined ? { selfCell } : {}) };

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
