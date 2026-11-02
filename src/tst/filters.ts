/**
 * Table filters (`TST.FilterSetArchive`).
 *
 * A filter set is the "Show rows that match…" rulebook of a Numbers table:
 * a combining mode (all rules or any rule), an on/off switch, and a list
 * of per-column rules that reuse the same {@link Predicate} structure as
 * conditional formatting.
 *
 * A rule names its column inside its predicate, as a reference relative
 * to a host at column 1: every app-authored rule in the corpus sits on
 * column 1 or 2 and carries offset 0 or 1. `filter_offsets` is not a
 * column list but a boundary list — `[0]` on an empty set, `[0, 1, 2]`
 * on a two-rule set, one entry more than there are rules — and
 * `filter_enabled`, absent on every app-written set, is a per-rule
 * switch where absent means on.
 *
 * **What the corpus proves, and what it does not.** Most corpus
 * `FilterSetArchive`s are empty — mode "all", disabled, no rules — and
 * `olekristensen-v26.3-mac-filters.numbers` carries a populated two-rule
 * set, so the container, switches, parallel arrays and rule predicates
 * are all validated against app-written bytes, and {@link FilterSet.addRule}
 * writes a comparison or text-contains rule byte for byte as that set
 * carries one. What a written rule cannot do is hide rows: the
 * hidden-state extent is recomputed by the app, and whether it does so
 * for a rule it did not author has not been seen. {@link FilterSet.setEnabled},
 * {@link FilterSet.setMode} and {@link FilterSet.setRuleEnabled} change
 * fields Apple demonstrably writes.
 *
 * Filtering also *hides rows*, and that is stored separately, in
 * `TST.HiddenStateExtentArchive` — a filter set says which rows should be
 * hidden, the extent's state list is the machinery that hides them. This
 * module never computes or removes that list: the app keeps it across
 * enable/disable and never rebuilds a missing one from a panel toggle,
 * so a set toggled here changes the flag and nothing else.
 */
import { protoEnum, protoFields } from "../proto/fields.ts";
import type { IwaObject } from "../tsp/iwa.ts";
import type { ObjectStore } from "../tsp/store.ts";
import { readPredicate, type Predicate, type ReadPredicateOptions } from "./predicates.ts";
import { RawMessage } from "../base/protobuf.ts";
import { columnName } from "./formulas.ts";

/** TST.FilterSetArchive. */
export const FilterSetFields = protoFields("TST.FilterSetArchive", {
  TYPE: "type",
  IS_ENABLED: "is_enabled",
  RULES_PRE_PIVOT: "filter_rules_prepivot",
  NEEDS_FORMULA_REWRITE_FOR_IMPORT: "needs_formula_rewrite_for_import",
  OFFSETS: "filter_offsets",
  ENABLED: "filter_enabled",
  RULES: "filter_rules",
});

/** TST.FilterRuleArchive / TST.FilterRulePrePivotArchive. */
const FilterRuleFields = { PREDICATE: 1, DISABLED: 2 } as const;

/**
 * The column a rule's predicate names: its relative offset from the host
 * at column 1. The offset is a signed count stored in an unsigned field —
 * a rule on column A carries 2^64 − 1 — so the high half reads as negative.
 */
function ruleColumn(predicate: ReturnType<IwaObject["message"]["getMessage"]>): number | undefined {
  const raw = predicate?.getMessage(4)?.getMessage(4)?.getVarint(2);
  if (raw === undefined) return undefined;
  const offset = raw >= 1n << 63n ? raw - (1n << 64n) : raw;
  return Number(offset) + FILTER_HOST_COLUMN;
}

/** The column the app's filter references count from. */
export const FILTER_HOST_COLUMN = 1;

/** How a set combines its rules. */
export const FilterSetType = protoEnum("TST.FilterSetArchive.FilterSetType", {
  /** A row must match every enabled rule. */
  ALL: "FilterSetArchiveTypeAll",
  /** A row matching any enabled rule is shown. */
  ANY: "FilterSetArchiveTypeAny",
});

export type FilterMode = "all" | "any";

/** One column's filter rule. */
export interface FilterRule {
  /** Position in the rule list. */
  index: number;
  /**
   * Column the rule tests, absolute: the predicate's relative column
   * offset from the host at column 1. `undefined` when the predicate
   * carries no cell operand.
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

  /**
   * Turn the set on or off — the flag alone, never the stored states.
   *
   * The extent's `RowOrColumnState` list is the filter machinery's
   * working substrate, not a result cache: the app keeps it across
   * enable/disable (a disabled filter with its states opens unfiltered
   * and re-enables correctly), and a panel toggle never rebuilds a
   * missing list — a filter enabled over no states stores the flag and
   * hides nothing. Corpus tables with zero states are filters that
   * never ran, not filters the app cleaned. So disabling leaves the
   * states exactly where they were.
   */
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

  /** The boundary list: one entry more than there are rules. */
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
    const enabled = this.ruleFlags();
    const build = (messages: ReturnType<IwaObject["message"]["getMessages"]>, legacy: boolean): FilterRule[] =>
      messages.map((rule, index) => ({
        index,
        column: ruleColumn(rule.getMessage(FilterRuleFields.PREDICATE)),
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
    return this.offsets().length === count + 1 && (enabled.length === 0 || enabled.length >= count);
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

  /**
   * Add a rule, enabled, and switch the set on.
   *
   * The rule carries its column in its predicate; the boundary list grows
   * by one. The predicate is written by
   * `writeComparisonPredicate`; the rows the rule would hide are the
   * app's to recompute (the hidden-state extent is not touched), and
   * whether the app does so for a rule it did not author is unproven.
   * Returns the new rule's index.
   */
  addRule(predicate: RawMessage): number {
    const m = this.object.message;
    if (m.getMessages(FilterSetFields.RULES_PRE_PIVOT).length > 0 && m.getMessages(FilterSetFields.RULES).length === 0) {
      throw new RangeError("filter set carries only pre-2016 rules; adding to it is not supported");
    }
    const rule = RawMessage.create();
    rule.setMessage(FilterRuleFields.PREDICATE, predicate);
    const rules = [...m.getMessages(FilterSetFields.RULES), rule];
    m.setMessages(FilterSetFields.RULES, rules);
    // The boundary list: 0 through the rule count.
    m.setVarints(FilterSetFields.OFFSETS, [...Array(rules.length + 1).keys()]);
    // `filter_enabled` is absent on every app-written set — absent means
    // enabled — so it is only kept in step where a set already states it.
    if (m.has(FilterSetFields.ENABLED)) {
      const flags = this.ruleFlags();
      flags.length = rules.length - 1;
      for (let i = 0; i < flags.length; i++) flags[i] ??= true;
      flags.push(true);
      m.setVarints(FilterSetFields.ENABLED, flags.map((flag) => (flag ? 1 : 0)));
    }
    m.setBool(FilterSetFields.IS_ENABLED, true);
    return rules.length - 1;
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
