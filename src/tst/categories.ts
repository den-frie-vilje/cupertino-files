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
 * Regrouping moves rows between groups that already exist and nothing else:
 * which rows belong to "Animal" is a question the grouping column answers
 * directly. A value with no group is refused there, because a new group's
 * identity and position are the app's to give; {@link defineByValueCategory}
 * mints a whole definition at once instead, in the shape every categorised
 * table in the corpus has, and the app has yet to confirm it draws one.
 *
 * The archive's other fields are constant. Fields 7–13 and 16 are the
 * calc-engine coordinates of the eight internal formulas the grouping
 * registers (columns 0–7 of row 0 of its own owner, in every archive in the
 * corpus, categorised or not), `owner_index` is 8, and `row_uid_lookup`
 * is the table's row-uid list in map order. Every table carries the
 * archive, so defining a category fills it in rather than creating it.
 */
import { protoFields } from "../proto/fields.ts";
import type { IwaObject } from "../tsp/iwa.ts";
import type { ObjectStore } from "../tsp/store.ts";
import { makeRef, refId } from "../tsp/schema.ts";
import { RawMessage } from "../base/protobuf.ts";
import { APPLE_EPOCH_SECONDS } from "../base/bytes.ts";
import { ColumnRowUidMap, randomUid, readUid, type Uid } from "./uidmap.ts";

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

/** TST.GroupByArchive.GroupNodeArchive.FormatManagerArchive. */
const FormatManagerFields = protoFields("TST.GroupByArchive.GroupNodeArchive.FormatManagerArchive", {
  CELL_VALUE: "cell_value",
  FORMATS: "formats",
  ROW_UID_LOOKUP_SETS: "row_uid_lookup_sets",
});

/** TST.GroupByArchive.row_uid_lookup: the table's row uids, in map order. */
const ROW_UID_LOOKUP = 15;

/** Archive type id of `TST.GroupByArchive.GroupNodeArchive`. */
export const GROUP_NODE_TYPE = 6383;

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
   * Raw `agg_type`. Numbers offers sum, average, count and so on; the one
   * measured code is 1 on a text column, whose per-group accumulator is a
   * string count. The rest are passed through rather than named.
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

/** The bucketing a date column can be grouped by. */
export type DateBucket = "year" | "yearAndMonth" | "yearAndQuarter" | "yearAndWeek" | "day" | "weekday";

const BUCKET_TYPE: Record<DateBucket, number> = {
  year: GroupingType.BY_YEAR,
  yearAndMonth: GroupingType.BY_YEAR_MONTH,
  yearAndQuarter: GroupingType.BY_YEAR_QUARTER,
  yearAndWeek: GroupingType.BY_YEAR_WEEK,
  day: GroupingType.BY_DAY,
  weekday: GroupingType.BY_WEEKDAY,
};

/**
 * The `TSCE.FunctorArchive` a bucketed group column carries for each
 * grouping type: the app's own bucketing formula, as a one-argument
 * program the calc engine evaluates per cell. Byte for byte what
 * `numbers-parser-v26.0-categories.numbers` carries, where every
 * bucketed table of a kind carries the same bytes; the test re-reads
 * them from the fixture. The formulas they encode, rendered: year
 * `DATE(YEAR(x),1,1)`, month `DATE(YEAR(x),MONTH(x),1)`, quarter
 * `DATE(YEAR(x),ROUNDDOWN((MONTH(x)-1)/3,0)*3+1,1)`, week
 * `DATE(YEAR(x),MONTH(x),DAY(x))+6-WEEKDAY(x,2)`, day
 * `DATE(YEAR(x),MONTH(x),DAY(x))`, weekday `DATE(2018,1,6+WEEKDAY(x))`,
 * each guarded so a non-date cell errors.
 */
export const BUCKET_FUNCTORS: ReadonlyMap<number, string> = new Map([
  [GroupingType.BY_YEAR, "0add010ada010a050835a802000a07081010a80118010a050835a802000a02080b0a050835a802000a060810104518010a060810106018010a060810100718020a0208220a050835a802000a07081010a70118010a19081121000000000000f03fd00201d80280808080808080a0300a19081121000000000000f03fd00201d80280808080808080a0300a060810102718030a0208230a0208220a19081121000000000000f03fd00201d80280808080808080a0300a190811210000000000000000d00200d80280808080808080a0300a0208040a0208230a060810103e180310011800"],
  [GroupingType.BY_YEAR_MONTH, "0ad1010ace010a050835a802000a07081010a80118010a050835a802000a02080b0a050835a802000a060810104518010a060810106018010a060810100718020a0208220a050835a802000a07081010a70118010a050835a802000a060810105e18010a19081121000000000000f03fd00201d80280808080808080a0300a060810102718030a0208230a0208220a19081121000000000000f03fd00201d80280808080808080a0300a190811210000000000000000d00200d80280808080808080a0300a0208040a0208230a060810103e180310011800"],
  [GroupingType.BY_YEAR_QUARTER, "0af0020aed020a050835a802000a07081010a80118010a050835a802000a02080b0a050835a802000a060810104518010a060810106018010a060810100718020a0208220a050835a802000a07081010a70118010a050835a802000a060810105e18010a19081121000000000000f03fd00201d80280808080808080a0300a0208020a190811210000000000000840d00203d80280808080808080a0300a0208040a190811210000000000000000d00200d80280808080808080a0300a060810107f18020a190811210000000000000840d00203d80280808080808080a0300a0208030a19081121000000000000f03fd00201d80280808080808080a0300a0208010a19081121000000000000f03fd00201d80280808080808080a0300a060810102718030a0208230a0208220a19081121000000000000f03fd00201d80280808080808080a0300a190811210000000000000000d00200d80280808080808080a0300a0208040a0208230a060810103e180310011800"],
  [GroupingType.BY_YEAR_WEEK, "0a93020a90020a050835a802000a07081010a80118010a050835a802000a02080b0a050835a802000a060810104518010a060810106018010a060810100718020a0208220a050835a802000a07081010a70118010a050835a802000a060810105e18010a050835a802000a060810102918010a060810102718030a190811210000000000001840d00206d80280808080808080a0300a0208010a050835a802000a190811210000000000000040d00202d80280808080808080a0300a07081010a60118020a0208020a0208230a0208220a19081121000000000000f03fd00201d80280808080808080a0300a190811210000000000000000d00200d80280808080808080a0300a0208040a0208230a060810103e180310011800"],
  [GroupingType.BY_DAY, "0ac5010ac2010a050835a802000a07081010a80118010a050835a802000a02080b0a050835a802000a060810104518010a060810106018010a060810100718020a0208220a050835a802000a07081010a70118010a050835a802000a060810105e18010a050835a802000a060810102918010a060810102718030a0208230a0208220a19081121000000000000f03fd00201d80280808080808080a0300a190811210000000000000000d00200d80280808080808080a0300a0208040a0208230a060810103e180310011800"],
  [GroupingType.BY_WEEKDAY, "0afd010afa010a050835a802000a07081010a80118010a050835a802000a02080b0a050835a802000a060810104518010a060810106018010a060810100718020a0208220a1a0811210000000000889f40d002e20fd80280808080808080a0300a19081121000000000000f03fd00201d80280808080808080a0300a190811210000000000001840d00206d80280808080808080a0300a050835a802000a07081010a60118010a0208010a060810102718030a0208230a0208220a19081121000000000000f03fd00201d80280808080808080a0300a190811210000000000000000d00200d80280808080808080a0300a0208040a0208230a060810103e180310011800"],
]);

/** The date pattern a bucketed group's value is formatted with, per grouping type. */
export const BUCKET_PATTERNS: ReadonlyMap<number, string> = new Map([
  [GroupingType.BY_YEAR, "yyyy"],
  [GroupingType.BY_YEAR_MONTH, "LLLL yyyy"],
  [GroupingType.BY_YEAR_QUARTER, "yyyy-QQQ"],
  [GroupingType.BY_YEAR_WEEK, "yyyy'-W'w"],
  [GroupingType.BY_DAY, "d/M/yyyy"],
  [GroupingType.BY_WEEKDAY, "EEEE"],
]);

/**
 * The bucket a date falls in, as the app's functor computes it: the
 * bucket's start as a UTC midnight, a week ending on its Saturday, a
 * weekday placed in the reference week of 7–13 January 2018. Agrees with
 * every group in the corpus's bucketed tables.
 */
export function bucketStart(groupingType: number, date: Date): Date {
  const utc = (y: number, m: number, d: number): Date => new Date(Date.UTC(y, m, d));
  const y = date.getUTCFullYear();
  const m = date.getUTCMonth();
  const d = date.getUTCDate();
  switch (groupingType) {
    case GroupingType.BY_YEAR:
      return utc(y, 0, 1);
    case GroupingType.BY_YEAR_MONTH:
      return utc(y, m, 1);
    case GroupingType.BY_YEAR_QUARTER:
      return utc(y, Math.floor(m / 3) * 3, 1);
    case GroupingType.BY_YEAR_WEEK: {
      const mondayBased = ((date.getUTCDay() + 6) % 7) + 1;
      return utc(y, m, d + 6 - mondayBased);
    }
    case GroupingType.BY_DAY:
      return utc(y, m, d);
    case GroupingType.BY_WEEKDAY:
      return utc(2018, 0, 6 + date.getUTCDay() + 1);
    default:
      throw new RangeError(`grouping type ${groupingType} is not a date bucket`);
  }
}

/** The format a bucketed group's value carries: a date with the kind's pattern. */
function bucketFormat(groupingType: number): RawMessage {
  const format = RawMessage.create();
  format.setVarint(1, 261);
  format.setString(14, BUCKET_PATTERNS.get(groupingType)!);
  return format;
}

/** One level of a category definition: a column, grouped by value or by a date bucket. */
export interface CategoryLevel {
  column: number;
  bucket?: DateBucket;
}

/** A `TSP.UUID` message. */
function writeUidMessage(uid: Uid): RawMessage {
  const m = RawMessage.create();
  m.setVarint(1, uid.lower);
  m.setVarint(2, uid.upper);
  return m;
}

/**
 * Encode a group's value as the app does: the value, the format its cells
 * carry, and the explicit-false flags the app states for the type.
 */
export function writeCellValue(value: GroupValue, format: RawMessage): RawMessage {
  const out = RawMessage.create();
  const inner = RawMessage.create();
  if (typeof value === "string") {
    out.setVarint(CellValueFields.TYPE, CellValueType.STRING);
    inner.setString(1, value);
    inner.setMessage(2, format);
    inner.setBool(4, false);
    inner.setBool(5, false);
    inner.setBool(6, false);
    out.setMessage(CellValueFields.STRING, inner);
  } else if (typeof value === "number") {
    out.setVarint(CellValueFields.TYPE, CellValueType.NUMBER);
    inner.setDouble(1, value);
    inner.setVarint(2, 0);
    inner.setMessage(3, format);
    inner.setBool(6, false);
    out.setMessage(CellValueFields.NUMBER, inner);
  } else if (typeof value === "boolean") {
    out.setVarint(CellValueFields.TYPE, CellValueType.BOOLEAN);
    inner.setBool(1, value);
    inner.setMessage(2, format);
    inner.setBool(3, false);
    out.setMessage(CellValueFields.BOOLEAN, inner);
  } else if (value instanceof Date) {
    out.setVarint(CellValueFields.TYPE, CellValueType.DATE);
    inner.setDouble(1, value.getTime() / 1000 - APPLE_EPOCH_SECONDS);
    inner.setMessage(2, format);
    inner.setBool(4, false);
    out.setMessage(CellValueFields.DATE, inner);
  } else {
    throw new RangeError("a category group needs a value; the grouping column has an empty cell");
  }
  return out;
}

/** A group's text, the order the app lists by-value groups in. */
function groupText(value: GroupValue): string {
  return value instanceof Date ? value.toISOString() : String(value);
}

/**
 * Define a by-value category on one or more columns, filling the table's
 * existing group-by archive with the shape every categorised table in the
 * corpus has: one group column per level, the row-uid lookup, a tree with
 * one node per distinct value at each level — nested in the order the
 * columns are given — referenced from field 18 and copied inline into
 * field 3, and the definition switched on.
 *
 * At every level the groups list in the code-unit order of their text,
 * which is the order the corpus shows for strings and numbers alike. A
 * node carries its value, its rows (a parent's are the union of its
 * children's) and a format manager: the value again, the cells' format
 * and the row set for string and number groups, the value alone for
 * boolean groups, as the corpus writes them. `formatAt` supplies the
 * format message of a row's cell in a column, or nothing.
 */
export function defineByValueCategory(
  store: ObjectStore,
  groupBy: IwaObject,
  uids: ColumnRowUidMap,
  levels: readonly CategoryLevel[],
  dataRows: readonly number[],
  valueAt: (row: number, column: number) => GroupValue,
  formatAt: (row: number, column: number) => RawMessage | undefined,
): void {
  const m = groupBy.message;
  if (m.getMessages(GroupByFields.GROUP_COLUMN).length > 0) {
    throw new RangeError("table is already categorised; regroup it instead of defining it again");
  }
  if (levels.length === 0) throw new RangeError("a category needs at least one column");
  const columns = levels.map((level) => level.column);
  const types = levels.map((level) => (level.bucket ? BUCKET_TYPE[level.bucket] : GroupingType.BY_VALUE));
  const groupColumns = levels.map((level, i) => {
    const columnUid = uids.columnUid(level.column);
    if (!columnUid) throw new RangeError(`column ${level.column} has no identity in the uid map`);
    const groupColumn = RawMessage.create();
    groupColumn.setMessage(GroupColumnFields.COLUMN_UID, writeUidMessage(columnUid));
    groupColumn.setVarint(GroupColumnFields.GROUPING_TYPE, types[i]!);
    if (level.bucket) {
      const functor = BUCKET_FUNCTORS.get(types[i]!)!;
      groupColumn.setMessage(
        GroupColumnFields.GROUPING_FUNCTOR,
        RawMessage.parse(Uint8Array.from(Buffer.from(functor, "hex"))),
      );
    }
    groupColumn.setMessage(GroupColumnFields.GROUPING_COLUMN_UID, writeUidMessage(randomUid()));
    return groupColumn;
  });
  m.setMessages(GroupByFields.GROUP_COLUMN, groupColumns);

  const lookup = RawMessage.create();
  lookup.setMessages(
    1,
    uids.rowUidList().flatMap((uid) => (uid ? [writeUidMessage(uid)] : [])),
  );
  m.setMessage(ROW_UID_LOOKUP, lookup);

  const component = store.componentOf(groupBy.identifier);
  if (!component) throw new RangeError("group-by archive has no component");

  /**
   * Distinct values of `column` among `rows`, each with its rows, in text
   * order; for a bucketed level the bucket each date falls in.
   */
  const partition = (rows: readonly number[], column: number, type: number): { value: GroupValue; rows: number[] }[] => {
    const groups = new Map<string, { value: GroupValue; rows: number[] }>();
    for (const row of rows) {
      let value = valueAt(row, column);
      if (value === undefined) {
        throw new RangeError(`row ${row} has no value in column ${column}; every data row needs one to be grouped`);
      }
      if (type !== GroupingType.BY_VALUE) {
        if (!(value instanceof Date)) {
          throw new RangeError(`row ${row} holds no date in column ${column}; a bucketed level needs dates`);
        }
        value = bucketStart(type, value);
      }
      const key = `${typeof value}:${groupText(value)}`;
      const group = groups.get(key);
      if (group) group.rows.push(row);
      else groups.set(key, { value, rows: [row] });
    }
    return [...groups.values()].sort((a, b) => {
      const x = groupText(a.value);
      const y = groupText(b.value);
      return x < y ? -1 : x > y ? 1 : 0;
    });
  };

  /** A node's message, without its children; `inline` nodes carry children inline. */
  const nodeMessage = (group: { value: GroupValue; rows: number[] }, column: number, type: number): RawMessage => {
    const node = RawMessage.create();
    node.setMessage(GroupNodeFields.GROUP_UID, writeUidMessage(randomUid()));
    const format =
      type === GroupingType.BY_VALUE
        ? formatAt(group.rows[0]!, column) ?? RawMessage.create()
        : bucketFormat(type);
    const cellValue = writeCellValue(group.value, format);
    const manager = RawMessage.create();
    manager.setMessage(FormatManagerFields.CELL_VALUE, cellValue);
    if (typeof group.value !== "boolean") {
      manager.setMessages(FormatManagerFields.FORMATS, [format]);
      manager.setMessages(FormatManagerFields.ROW_UID_LOOKUP_SETS, [writeIndexSet(group.rows)]);
    }
    node.setMessage(GroupNodeFields.FORMAT_MANAGER, manager);
    node.setMessage(GroupNodeFields.GROUP_CELL_VALUE, cellValue);
    node.setMessage(GroupNodeFields.ROW_LOOKUP_UIDS, writeIndexSet(group.rows));
    return node;
  };

  /**
   * Build one level: returns the referenced objects and the inline copies
   * of the nodes for `rows` grouped by `columns[level]`, recursively.
   */
  const buildLevel = (rows: readonly number[], level: number): { objects: IwaObject[]; inline: RawMessage[] } => {
    const column = columns[level]!;
    const type = types[level]!;
    const objects: IwaObject[] = [];
    const inline: RawMessage[] = [];
    for (const group of partition(rows, column, type)) {
      const base = nodeMessage(group, column, type);
      const referenced = nodeMessage(group, column, type);
      const inlineNode = base;
      if (level + 1 < columns.length) {
        const children = buildLevel(group.rows, level + 1);
        inlineNode.setMessages(GroupNodeFields.CHILD, children.inline);
        referenced.setMessages(GroupNodeFields.CHILD_REF, children.objects.map((o) => makeRef(o.identifier)));
        const object = store.createObject(GROUP_NODE_TYPE, component);
        object.setMessageBytes(referenced.toBytes());
        object.setObjectReferences(children.objects.map((o) => o.identifier));
        objects.push(object);
      } else {
        const object = store.createObject(GROUP_NODE_TYPE, component);
        object.setMessageBytes(referenced.toBytes());
        objects.push(object);
      }
      inline.push(inlineNode);
    }
    return { objects, inline };
  };

  const tree = buildLevel(dataRows, 0);
  const rootMessage = (children: readonly RawMessage[] | undefined): RawMessage => {
    const root = RawMessage.create();
    root.setMessage(GroupNodeFields.GROUP_UID, writeUidMessage(randomUid()));
    if (children) root.setMessages(GroupNodeFields.CHILD, children);
    root.setMessage(GroupNodeFields.FORMAT_MANAGER, RawMessage.create());
    root.setMessage(GroupNodeFields.ROW_LOOKUP_UIDS, writeIndexSet([...dataRows]));
    return root;
  };
  const root = store.createObject(GROUP_NODE_TYPE, component);
  const referenced = rootMessage(undefined);
  referenced.setMessages(
    GroupNodeFields.CHILD_REF,
    tree.objects.map((object) => makeRef(object.identifier)),
  );
  root.setMessageBytes(referenced.toBytes());
  // The references the app declares: each node lists its children, the
  // archive lists its root, both beside the messages that carry them.
  root.setObjectReferences(tree.objects.map((object) => object.identifier));
  const previousRoot = refId(m, GroupByFields.GROUP_NODE_ROOT_REF);
  m.setMessage(GroupByFields.GROUP_NODE_ROOT, rootMessage(tree.inline));
  m.setMessage(GroupByFields.GROUP_NODE_ROOT_REF, makeRef(root.identifier));
  groupBy.setObjectReferences([
    ...groupBy.getObjectReferences().filter((id) => id !== previousRoot),
    root.identifier,
  ]);
  if (previousRoot !== undefined) store.discardUnreachable(groupBy.identifier, [previousRoot]);
  m.setBool(GroupByFields.IS_ENABLED, true);
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
