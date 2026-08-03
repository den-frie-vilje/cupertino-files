/**
 * Categories (`TST.GroupByArchive`) — Numbers' row grouping.
 *
 * Categorising a table by a column collapses its rows into named groups:
 * "Category" becomes Animal / Fruit / Transport, each with its own rows and
 * its own summary row. Categories nest, up to five deep, so grouping by
 * Category then by Date gives Animal → 1979 → those rows.
 *
 * The archive says all of that plainly, which is unusual for this format:
 *
 *  - **`group_column`** — which columns are grouped by, as identities
 *    rather than positions, so a category survives a column being moved.
 *    {@link ColumnRowUidMap} resolves them back to indexes.
 *  - **`group_node_root`** — a tree of groups. Each node holds the value
 *    that defines it (`group_cell_value`) and the rows that fall in it
 *    (`row_lookup_uids`, despite the name a plain index set — verified
 *    against cell contents across the whole corpus).
 *  - **`is_enabled`** — whether the app is currently applying it. A table
 *    can carry a category definition with grouping switched off.
 *
 * The tree is a **cache the app recomputes**, in the same sense as a table
 * of contents: it is what Numbers worked out last time it grouped the rows.
 * Editing cells through this library does not regroup them, so
 * {@link TableCategories.verify} says whether the cached tree still matches
 * the data and {@link TableCategories.regroup} brings it back into line.
 *
 * Regrouping moves rows between groups that already exist and nothing else.
 * Which rows belong to "Animal" is a question the grouping column answers
 * directly, so it can be settled offline; what a *new* group's identity
 * should be, where the app would sort it, and how the per-column and
 * per-row fields alongside the tree should change are questions no fixture
 * answers. So a value with no group is refused. That line — recompute what
 * the data determines, refuse what only the app knows — is the same one
 * drawn for conditional rules and filters.
 */
import { protoFields } from "../proto/fields.ts";
import type { IwaObject } from "../tsp/iwa.ts";
import type { ObjectStore } from "../tsp/store.ts";
import { refId } from "../tsp/schema.ts";
import { RawMessage } from "../base/protobuf.ts";
import { APPLE_EPOCH_SECONDS } from "../base/bytes.ts";
import { ColumnRowUidMap, readUid, type Uid } from "./uidmap.ts";

/** TST.TableModelArchive.category_owner. */
export const CATEGORY_OWNER = 86;

/** TST.CategoryOwnerRefArchive: group_by = 1 (repeated Reference). */
const CategoryOwnerRef = { GROUP_BY: 1 } as const;

/** TST.GroupByArchive. */
export const GroupByFields = protoFields("TST.GroupByArchive", {
  GROUP_BY_UID: "group_by_uid",
  GROUP_COLUMN: "group_column",
  GROUP_NODE_ROOT: "group_node_root",
  AGGREGATOR: "aggregator",
  COLUMN_AGG_TYPE: "column_agg_type",
  IS_ENABLED: "is_enabled",
  GROUP_NODE_ROOT_REF: "group_node_root_ref",
});

/** TST.GroupColumnArchive. */
export const GroupColumnFields = protoFields("TST.GroupColumnArchive", {
  COLUMN_UID: "column_uid",
  GROUPING_TYPE: "grouping_type",
  GROUPING_FUNCTOR: "grouping_functor",
  GROUPING_COLUMN_UID: "grouping_column_uid",
});

/** TST.GroupByArchive.GroupNodeArchive. */
export const GroupNodeFields = protoFields("TST.GroupByArchive.GroupNodeArchive", {
  GROUP_UID: "group_uid",
  CHILD: "child",
  ROW_UID: "row_uid",
  FORMAT_MANAGER: "format_manager",
  GROUP_CELL_VALUE: "group_cell_value",
  ROW_INDEXES: "row_indexes",
  ROW_LOOKUP_UIDS: "row_lookup_uids",
  CHILD_REF: "child_ref",
});

/** TST.ColumnAggregateArchive — the per-group summary of one column. */
export const ColumnAggregateFields = protoFields("TST.ColumnAggregateArchive", {
  COLUMN_UID: "column_uid",
  LEVEL: "level",
  AGG_TYPE: "agg_type",
  SHOW_AS_TYPE: "show_as_type",
});

/** TSCE.CellValueArchive. */
const CellValueFields = {
  TYPE: 1,
  BOOLEAN: 2,
  DATE: 3,
  NUMBER: 4,
  STRING: 5,
} as const;

const CellValueType = { NIL: 1, BOOLEAN: 2, DATE: 3, NUMBER: 4, STRING: 5 } as const;

/** TSCE.IndexSetArchive: entries = 1 { range_begin = 1, range_end = 2 }. */
const IndexSet = { ENTRIES: 1 } as const;
const IndexRange = { BEGIN: 1, END: 2 } as const;

/**
 * How a column's values become groups.
 *
 * Anything but {@link GroupingType.BY_VALUE} buckets the values first, and
 * carries a `TSCE.FunctorArchive` — the bucketing formula — alongside. The
 * group's own value is then the *bucket*, expressed as a date at the
 * bucket's start.
 *
 * The date codes are read off `numbers-parser-v26.0-categories.numbers`,
 * which has one table per bucketing the UI offers. Each is confirmed by the
 * shape of the dates it produces rather than by the table's name:
 * year groups are all 1 January, quarter groups fall only in months 1/4/7/10,
 * week groups every land on the same weekday, and weekday groups collapse
 * into six dates within one reference week.
 */
export const GroupingType = {
  /** One group per distinct value. */
  BY_VALUE: 0,
  /** Dates bucketed by year: every group value is 1 January. */
  BY_YEAR: 1,
  /** By calendar month: every group value is the 1st. */
  BY_YEAR_MONTH: 2,
  /** By day of the week: seven buckets, dated within one reference week. */
  BY_WEEKDAY: 3,
  /** By exact day. */
  BY_DAY: 4,
  /** By week: every group value falls on the week's first day. */
  BY_YEAR_WEEK: 5,
  /** By quarter: every group value is 1 January, April, July or October. */
  BY_YEAR_QUARTER: 6,
} as const;

/** Human-readable names for {@link GroupingType}, for diagnostics. */
export const GROUPING_TYPE_NAMES: ReadonlyMap<number, string> = new Map([
  [GroupingType.BY_VALUE, "value"],
  [GroupingType.BY_YEAR, "year"],
  [GroupingType.BY_YEAR_MONTH, "year and month"],
  [GroupingType.BY_WEEKDAY, "weekday"],
  [GroupingType.BY_DAY, "day"],
  [GroupingType.BY_YEAR_WEEK, "year and week"],
  [GroupingType.BY_YEAR_QUARTER, "year and quarter"],
]);

/** A column the table is grouped by. */
export interface GroupColumn {
  /** Resolved position, or `undefined` if the identity is not this table's. */
  column: number | undefined;
  columnUid: Uid | undefined;
  groupingType: number;
  /**
   * True when the column is bucketed rather than grouped one-per-value.
   * Equivalent to a `groupingType` other than {@link GroupingType.BY_VALUE},
   * and read from the presence of the bucketing formula so the two can be
   * cross-checked on a code this library has not seen.
   */
  hasFunctor: boolean;
  /** {@link groupingType} named, or `undefined` for a code not yet seen. */
  groupingName: string | undefined;
}

/** The value a group is defined by. */
export type GroupValue = string | number | boolean | Date | undefined;

/** One group in the tree. */
export interface CategoryGroup {
  /** Value the group collects, e.g. `"Animal"`. Absent on the root. */
  value: GroupValue;
  /** Value rendered for display. */
  label: string;
  /** Depth, where 0 is the outermost category. */
  level: number;
  /**
   * Rows in this group, as absolute row indexes.
   *
   * On a nested group these are that subgroup's rows only; a parent's rows
   * are the union of its children's.
   */
  rows: number[];
  children: CategoryGroup[];
}

/** A per-group summary of one column, e.g. "total of Count per Category". */
export interface ColumnAggregate {
  column: number | undefined;
  columnUid: Uid | undefined;
  /** Category depth this summary is shown at. */
  level: number;
  /**
   * Raw `agg_type`. Numbers offers sum, average, count and so on, but no
   * fixture carries a non-empty aggregate list, so the codes are passed
   * through rather than named.
   */
  aggType: number;
  showAsType: number | undefined;
}

export class TableCategories {
  readonly store: ObjectStore;
  /** The `TST.GroupByArchive`. */
  readonly object: IwaObject;
  private readonly uids: ColumnRowUidMap;

  constructor(store: ObjectStore, object: IwaObject, uids: ColumnRowUidMap) {
    this.store = store;
    this.object = object;
    this.uids = uids;
  }

  get id(): bigint {
    return this.object.identifier;
  }

  /** Whether the app is currently grouping rows by this definition. */
  get enabled(): boolean {
    return this.object.message.getBool(GroupByFields.IS_ENABLED) ?? false;
  }

  setEnabled(enabled: boolean): void {
    this.object.message.setBool(GroupByFields.IS_ENABLED, enabled);
  }

  /** The columns grouped by, outermost first. */
  groupColumns(): GroupColumn[] {
    return this.object.message.getMessages(GroupByFields.GROUP_COLUMN).map((column) => {
      const columnUid = readUid(column.getMessage(GroupColumnFields.COLUMN_UID));
      const groupingType =
        column.getUint(GroupColumnFields.GROUPING_TYPE) ?? GroupingType.BY_VALUE;
      return {
        column: this.uids.columnIndex(columnUid),
        columnUid,
        groupingType,
        hasFunctor: column.has(GroupColumnFields.GROUPING_FUNCTOR),
        groupingName: GROUPING_TYPE_NAMES.get(groupingType),
      };
    });
  }

  /** Per-group column summaries, where the table defines any. */
  aggregates(): ColumnAggregate[] {
    return this.object.message.getMessages(GroupByFields.COLUMN_AGG_TYPE).map((aggregate) => {
      const columnUid = readUid(aggregate.getMessage(ColumnAggregateFields.COLUMN_UID));
      return {
        column: this.uids.columnIndex(columnUid),
        columnUid,
        level: aggregate.getUint(ColumnAggregateFields.LEVEL) ?? 0,
        aggType: aggregate.getUint(ColumnAggregateFields.AGG_TYPE) ?? 0,
        showAsType: aggregate.getUint(ColumnAggregateFields.SHOW_AS_TYPE),
      };
    });
  }

  /**
   * The root of the group tree.
   *
   * Written two ways. Current files put the root in a separate object and
   * reference it (`group_node_root_ref`), keeping the tree out of the table
   * model's own record; older ones inline it (`group_node_root`). The
   * reference wins where both exist, matching how the apps read it.
   */
  private rootNode(): RawMessage | undefined {
    const referenced = this.store.resolve(
      refId(this.object.message, GroupByFields.GROUP_NODE_ROOT_REF),
    );
    return referenced?.message ?? this.object.message.getMessage(GroupByFields.GROUP_NODE_ROOT);
  }

  /**
   * The groups, as a tree.
   *
   * The root node is not a group — it holds every row — so its children are
   * returned as the top level.
   */
  groups(): CategoryGroup[] {
    const root = this.rootNode();
    return root ? this.childrenOf(root, 0) : [];
  }

  /** Groups at every level, flattened, for callers that just want a list. */
  flatGroups(): CategoryGroup[] {
    const out: CategoryGroup[] = [];
    const walk = (groups: CategoryGroup[]): void => {
      for (const group of groups) {
        out.push(group);
        walk(group.children);
      }
    };
    walk(this.groups());
    return out;
  }

  private childrenOf(node: RawMessage, level: number): CategoryGroup[] {
    const out: CategoryGroup[] = [];
    for (const child of this.childNodes(node)) {
      const value = readCellValue(child.getMessage(GroupNodeFields.GROUP_CELL_VALUE));
      out.push({
        value,
        label: labelOf(value),
        level,
        rows: this.rowsOf(child),
        children: this.childrenOf(child, level + 1),
      });
    }
    return out;
  }

  /** A node's children, whichever of the two encodings it uses. */
  private childNodes(node: RawMessage): RawMessage[] {
    const referenced = node
      .getMessages(GroupNodeFields.CHILD_REF)
      .flatMap((ref) => {
        const target = this.store.resolve(ref.getVarint(1));
        return target ? [target.message] : [];
      });
    return referenced.length > 0 ? referenced : node.getMessages(GroupNodeFields.CHILD);
  }

  /**
   * The rows in one group.
   *
   * `row_lookup_uids` is typed as an index set and, despite its name,
   * holds row **indexes**: across every categorised fixture, the rows a
   * group names hold exactly that group's value in the grouping column, and
   * the groups together cover every data row exactly once. `row_indexes`
   * carries the same thing when present, so either is read.
   */
  private rowsOf(node: RawMessage): number[] {
    const set =
      node.getMessage(GroupNodeFields.ROW_LOOKUP_UIDS) ??
      node.getMessage(GroupNodeFields.ROW_INDEXES);
    return expandIndexSet(set);
  }

  /**
   * Check the cached tree against the data it claims to describe.
   *
   * Grouping happens in the app. This library can change cells but does not
   * regroup them, so a tree can go stale — and unlike a table of contents,
   * a stale category tree is checkable, because the grouping column's
   * values are right there. Returns the groups whose rows no longer all
   * hold the group's value.
   *
   * Comparison is on **values, not rendered text**: a boolean group is
   * `false` where the cell renders as `FALSE`, and a date group is a
   * `Date` where the cell renders in the document's format. Comparing the
   * strings would report every boolean and date category as stale.
   *
   * Only the outermost grouping column is checked, and only for
   * {@link GroupingType.BY_VALUE}: a bucketed group ("dates in 1979") names
   * the bucket, not any cell's value, so checking it means evaluating the
   * bucketing formula.
   */
  verify(valueAt: (row: number, column: number) => GroupValue): {
    group: CategoryGroup;
    rows: number[];
  }[] {
    const [first] = this.groupColumns();
    if (!first || first.column === undefined || first.groupingType !== GroupingType.BY_VALUE) {
      return [];
    }
    const mismatches: { group: CategoryGroup; rows: number[] }[] = [];
    for (const group of this.groups()) {
      const wrong = group.rows.filter(
        (row) => !sameGroupValue(valueAt(row, first.column!), group.value),
      );
      if (wrong.length > 0) mismatches.push({ group, rows: wrong });
    }
    return mismatches;
  }

  /**
   * Re-sort rows into the groups their values now put them in.
   *
   * {@link verify} says the cached tree has gone stale; this fixes it. Only
   * membership moves — every group node, its identity and its value stay
   * exactly as the app wrote them, and only the row index set inside each
   * one is rewritten.
   *
   * That restriction is what makes this safe to do offline. Deciding which
   * rows belong to "Animal" is reading the grouping column and comparing
   * values, which needs nothing this library cannot already do. *Creating*
   * a group would mean minting a group identity, placing the node in
   * whatever order the app sorts groups in, and populating the several
   * per-column and per-row fields alongside the tree whose meaning no
   * fixture explains. So a value with no group is refused rather than
   * invented, and the tree is left untouched when that happens.
   *
   * Returns how many rows moved. Regrouping data that has not changed moves
   * none and rewrites the archive to the same bytes, which is how the tests
   * check it.
   *
   * @throws RangeError if a row's value matches no existing group, or if
   * the outermost grouping is bucketed rather than by value.
   */
  regroup(valueAt: (row: number, column: number) => GroupValue): number {
    const [first] = this.groupColumns();
    if (!first || first.column === undefined) {
      throw new RangeError("category has no resolvable grouping column");
    }
    if (first.groupingType !== GroupingType.BY_VALUE) {
      throw new RangeError(
        `grouping is by ${GROUPING_TYPE_NAMES.get(first.groupingType) ?? first.groupingType}, ` +
          "not by value; bucketing a row means evaluating the grouping formula",
      );
    }

    const root = this.rootNode();
    if (!root) throw new RangeError("category has no group tree");
    const nodes = this.childNodes(root);
    // Every row the tree currently accounts for. Rows outside it are not
    // this category's to place — a row can be excluded by a filter.
    const known = new Set<number>();
    for (const node of nodes) for (const row of expandIndexSet(node.getMessage(GroupNodeFields.ROW_LOOKUP_UIDS))) known.add(row);

    const wanted = new Map<RawMessage, number[]>();
    for (const node of nodes) wanted.set(node, []);
    let moved = 0;
    for (const row of [...known].sort((a, b) => a - b)) {
      const value = valueAt(row, first.column);
      const node = nodes.find((candidate) =>
        sameGroupValue(value, readCellValue(candidate.getMessage(GroupNodeFields.GROUP_CELL_VALUE))),
      );
      if (!node) {
        throw new RangeError(
          `row ${row} holds ${JSON.stringify(labelOf(value))}, which has no group; ` +
            "this library will not create one",
        );
      }
      wanted.get(node)!.push(row);
      if (!expandIndexSet(node.getMessage(GroupNodeFields.ROW_LOOKUP_UIDS)).includes(row)) moved++;
    }

    // Only rewrite the sets that actually changed. Writing them all would
    // dirty the component even when nothing moved, and a no-op regroup
    // rebuilding a component is both wasteful and a lie about what
    // happened.
    for (const [node, rows] of wanted) {
      const current = expandIndexSet(node.getMessage(GroupNodeFields.ROW_LOOKUP_UIDS));
      if (current.length === rows.length && current.every((row, at) => row === rows[at])) continue;
      node.setMessage(GroupNodeFields.ROW_LOOKUP_UIDS, writeIndexSet(rows));
      this.object.message.markDirty();
    }
    return moved;
  }

  /** Readable summary, one line per group. */
  describe(): string[] {
    return this.flatGroups().map(
      (group) => `${"  ".repeat(group.level)}${group.label} (${group.rows.length} rows)`,
    );
  }
}

/** Expand a `TSCE.IndexSetArchive` into the indexes it names. */
export function expandIndexSet(set: RawMessage | undefined): number[] {
  const out: number[] = [];
  for (const entry of set?.getMessages(IndexSet.ENTRIES) ?? []) {
    const begin = entry.getUint(IndexRange.BEGIN);
    if (begin === undefined) continue;
    // A range with no end is a single index, not an open-ended run.
    const end = entry.getUint(IndexRange.END) ?? begin;
    for (let index = begin; index <= end; index++) out.push(index);
  }
  return out;
}

/**
 * Build a `TSCE.IndexSetArchive` from indexes — the inverse of
 * {@link expandIndexSet}.
 *
 * Consecutive indexes collapse into one range, and a range covering a
 * single index is written with `range_begin` alone. Both match what Apple
 * writes: a root node covering rows 1–30 stores one entry with an end, and
 * a group holding seven scattered rows stores seven entries without one.
 * Getting that detail wrong would still read back correctly, and would stop
 * a regrouped archive being byte-identical to the app's.
 */
export function writeIndexSet(indexes: readonly number[]): RawMessage {
  const sorted = [...new Set(indexes)].sort((a, b) => a - b);
  const set = RawMessage.create();
  const entries: RawMessage[] = [];
  for (let at = 0; at < sorted.length; ) {
    const begin = sorted[at]!;
    let end = begin;
    while (at + 1 < sorted.length && sorted[at + 1] === end + 1) {
      end = sorted[++at]!;
    }
    at++;
    const entry = RawMessage.create();
    entry.setVarint(IndexRange.BEGIN, begin);
    if (end !== begin) entry.setVarint(IndexRange.END, end);
    entries.push(entry);
  }
  set.setMessages(IndexSet.ENTRIES, entries);
  return set;
}

/** Decode a `TSCE.CellValueArchive`. */
export function readCellValue(message: RawMessage | undefined): GroupValue {
  if (!message) return undefined;
  switch (message.getUint(CellValueFields.TYPE)) {
    case CellValueType.STRING:
      return message.getMessage(CellValueFields.STRING)?.getString(1);
    case CellValueType.NUMBER:
      return message.getMessage(CellValueFields.NUMBER)?.getDouble(1);
    case CellValueType.BOOLEAN:
      return message.getMessage(CellValueFields.BOOLEAN)?.getBool(1);
    case CellValueType.DATE: {
      const seconds = message.getMessage(CellValueFields.DATE)?.getDouble(1);
      return seconds === undefined ? undefined : new Date((seconds + APPLE_EPOCH_SECONDS) * 1000);
    }
    default:
      return undefined;
  }
}

/**
 * Whether a cell's value falls in a group.
 *
 * Dates compare by instant rather than identity, and numbers tolerate the
 * rounding that comes of a value stored as decimal128 in the cell and as a
 * double in the group node — the two are equal to well under a float's
 * precision, but not always bit-identical.
 */
export function sameGroupValue(cell: GroupValue, group: GroupValue): boolean {
  if (cell instanceof Date && group instanceof Date) return cell.getTime() === group.getTime();
  if (typeof cell === "number" && typeof group === "number") {
    if (cell === group) return true;
    const scale = Math.max(Math.abs(cell), Math.abs(group), 1);
    return Math.abs(cell - group) <= scale * Number.EPSILON * 8;
  }
  return cell === group;
}

function labelOf(value: GroupValue): string {
  if (value === undefined) return "";
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value);
}

/**
 * Every category definition on a table.
 *
 * A table can hold more than one — Numbers keeps a definition around when
 * grouping is switched off — so this returns all of them and
 * {@link TableCategories.enabled} says which is live.
 */
export function categoriesOf(
  store: ObjectStore,
  tableModel: RawMessage,
  uids: ColumnRowUidMap,
): TableCategories[] {
  const owner = store.resolve(refId(tableModel, CATEGORY_OWNER));
  const out: TableCategories[] = [];
  for (const ref of owner?.message.getMessages(CategoryOwnerRef.GROUP_BY) ?? []) {
    const groupBy = store.resolve(ref.getVarint(1));
    if (groupBy) out.push(new TableCategories(store, groupBy, uids));
  }
  return out;
}
