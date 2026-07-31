/**
 * Table filters (`TST.FilterSetArchive`).
 *
 * A filter set is the "Show rows that match…" rulebook of a Numbers table:
 * a combining mode (all rules or any rule), an on/off switch, and a list
 * of per-column rules that reuse the same {@link Predicate} structure as
 * conditional formatting.
 *
 * Rules are addressed by **column offset**, not by index in the rule list.
 * `filter_offsets[i]` is the column rule `i` applies to and
 * `filter_enabled[i]` whether that one rule is live, so the three repeated
 * fields are parallel arrays that must stay the same length. Writing
 * enforces that; a set whose arrays disagree is one the app reads with the
 * wrong rule on the wrong column.
 *
 * **What the corpus proves, and what it does not.** Every `FilterSetArchive`
 * across the 20 fixtures containing one is *empty* — mode "all", disabled,
 * no rules. So the container, its enable flag and its mode are validated
 * against real files; the layout of a populated rule list is read from the
 * schema and from the predicate encoding that conditional formatting
 * exercises for real. Creating filter rules from nothing is therefore not
 * offered: {@link FilterSet.setEnabled} and {@link FilterSet.setMode}
 * change fields Apple demonstrably writes, whereas synthesising a rule
 * would be asserting a layout nothing has confirmed. See
 * `docs/VERIFICATION.md`.
 *
 * Filtering also *hides rows*, and that is stored separately, in
 * `TST.HiddenStateExtentArchive` — a filter set says which rows should be
 * hidden, the hidden-state extent records which ones are. This module does
 * not recompute the latter, so toggling a filter set here changes the rule,
 * not the visible row set, until the app re-evaluates.
 */
import type { IwaObject } from "../tsp/iwa.ts";
import type { ObjectStore } from "../tsp/store.ts";
import { readPredicate, type Predicate, type ReadPredicateOptions } from "./predicates.ts";
import { columnName } from "./formulas.ts";

/** TST.FilterSetArchive. */
export const FilterSetFields = {
  TYPE: 1,
  IS_ENABLED: 2,
  RULES_PRE_PIVOT: 3,
  NEEDS_FORMULA_REWRITE_FOR_IMPORT: 4,
  OFFSETS: 5,
  ENABLED: 6,
  RULES: 7,
} as const;

/** TST.FilterRuleArchive / TST.FilterRulePrePivotArchive. */
const FilterRuleFields = { PREDICATE: 1, DISABLED: 2 } as const;

/** How a set combines its rules. */
export const FilterSetType = {
  /** A row must match every enabled rule. */
  ALL: 0,
  /** A row matching any enabled rule is shown. */
  ANY: 1,
} as const;

export type FilterMode = "all" | "any";

/** One column's filter rule. */
export interface FilterRule {
  /** Position in the rule list. */
  index: number;
  /**
   * Column the rule tests, from the parallel `filter_offsets` array.
   * `undefined` when the arrays are ragged — a file we should not guess at.
   */
  column: number | undefined;
  /** Whether this rule contributes, independent of the set's own switch. */
  enabled: boolean;
  predicate: Predicate | undefined;
  /** True when read from the pre-2016 `filter_rules_prepivot` list. */
  legacy: boolean;
}

export class FilterSet {
  readonly store: ObjectStore;
  readonly object: IwaObject;

  constructor(store: ObjectStore, object: IwaObject) {
    this.store = store;
    this.object = object;
  }

  get id(): bigint {
    return this.object.identifier;
  }

  /** Whether the app is applying this set at all. */
  get enabled(): boolean {
    // Apple's default is true, but every file examined writes the field
    // explicitly, so the default only matters for archives we create.
    return this.object.message.getBool(FilterSetFields.IS_ENABLED) ?? true;
  }

  setEnabled(enabled: boolean): void {
    this.object.message.setBool(FilterSetFields.IS_ENABLED, enabled);
  }

  get mode(): FilterMode {
    return this.object.message.getUint(FilterSetFields.TYPE) === FilterSetType.ANY ? "any" : "all";
  }

  setMode(mode: FilterMode): void {
    this.object.message.setVarint(
      FilterSetFields.TYPE,
      mode === "any" ? FilterSetType.ANY : FilterSetType.ALL,
    );
  }

  /** Column each rule applies to, in rule order. */
  private offsets(): number[] {
    return this.object.message.getPackedVarints(FilterSetFields.OFFSETS).map(Number);
  }

  /** Per-rule switches, as booleans. */
  private ruleFlags(): boolean[] {
    return this.object.message.getPackedVarints(FilterSetFields.ENABLED).map((v) => v !== 0n);
  }

  /**
   * The rules, in stored order.
   *
   * The modern list wins where both exist, matching how the apps read
   * them; a file written before the 2016 format change carries only the
   * older one.
   */
  rules(options: ReadPredicateOptions = {}): FilterRule[] {
    const offsets = this.offsets();
    const enabled = this.ruleFlags();
    const build = (messages: ReturnType<IwaObject["message"]["getMessages"]>, legacy: boolean): FilterRule[] =>
      messages.map((rule, index) => ({
        index,
        column: offsets[index],
        // A rule is live unless its own switch says otherwise. The legacy
        // shape stores the inverse — `disabled` — on the rule itself.
        enabled: legacy
          ? !(rule.getBool(FilterRuleFields.DISABLED) ?? false)
          : (enabled[index] ?? true),
        predicate: readPredicate(rule.getMessage(FilterRuleFields.PREDICATE), options),
        legacy,
      }));

    const modern = this.object.message.getMessages(FilterSetFields.RULES);
    if (modern.length) return build(modern, false);
    return build(this.object.message.getMessages(FilterSetFields.RULES_PRE_PIVOT), true);
  }

  /**
   * True when the parallel arrays line up with the rule list.
   *
   * `filter_offsets` and `filter_enabled` are indexed by rule position, so
   * a set where they are shorter than the rules is one whose later rules
   * have no column — worth detecting rather than silently reading as
   * column 0. An empty set with a single stray offset, which is what every
   * fixture holds, counts as consistent.
   */
  get consistent(): boolean {
    const count = this.rules().length;
    if (count === 0) return true;
    const enabled = this.ruleFlags();
    return this.offsets().length >= count && (enabled.length === 0 || enabled.length >= count);
  }

  /** Turn a rule on or off without removing it. */
  setRuleEnabled(index: number, enabled: boolean): void {
    const rules = this.rules();
    const rule = rules[index];
    if (!rule) throw new RangeError(`filter set ${this.id} has no rule ${index}`);
    if (rule.legacy) {
      const message = this.object.message.getMessages(FilterSetFields.RULES_PRE_PIVOT)[index];
      message?.setBool(FilterRuleFields.DISABLED, !enabled);
      return;
    }
    const flags = this.ruleFlags();
    while (flags.length < rules.length) flags.push(true);
    flags[index] = enabled;
    this.object.message.setVarints(
      FilterSetFields.ENABLED,
      flags.map((flag) => (flag ? 1 : 0)),
    );
  }

  /** Readable summary, one line per rule. */
  describe(): string[] {
    return this.rules().map((rule) => {
      const where = rule.column === undefined ? "column ?" : `column ${columnName(rule.column)}`;
      const condition = rule.predicate?.text || "(unreadable condition)";
      return `${rule.enabled ? "" : "(off) "}${where}: ${condition}`;
    });
  }
}
