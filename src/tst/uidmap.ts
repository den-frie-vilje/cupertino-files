/**
 * Row and column identities (`TST.ColumnRowUIDMapArchive`).
 *
 * Most of a table addresses cells by position, but the parts that must
 * survive a sort or an insert — categories, hidden states, calc-engine
 * dependencies — address them by **UID** instead. A row that moves from 5
 * to 12 keeps its UID, which is exactly why those structures use one.
 *
 * The archive is a sorted-array index rather than a map, laid out for
 * binary search:
 *
 * ```proto
 * message TST.ColumnRowUIDMapArchive {
 *   repeated TSP.UUID sorted_column_uids = 1;
 *   repeated uint32 column_index_for_uid = 2;   // parallel to the above
 *   repeated uint32 column_uid_for_index = 3;   // indexes into the above
 *   repeated TSP.UUID sorted_row_uids = 4;      // …rows the same, 5 and 6
 * }
 * ```
 *
 * `column_index_for_uid[i]` is the position of `sorted_column_uids[i]`, and
 * `column_uid_for_index[n]` is where column `n`'s UID sits in that sorted
 * list. Reading it as two plain maps costs one pass and makes both
 * directions O(1), which is worth it — a category tree resolves one UID per
 * group column and per row range.
 */
import { protoFields } from "../proto/fields.ts";
import type { RawMessage } from "../base/protobuf.ts";
import type { ObjectStore } from "../tsp/store.ts";
import { refId } from "../tsp/schema.ts";

/** TST.ColumnRowUIDMapArchive. */
export const UidMapFields = protoFields("TST.ColumnRowUIDMapArchive", {
  SORTED_COLUMN_UIDS: "sorted_column_uids",
  COLUMN_INDEX_FOR_UID: "column_index_for_uid",
  COLUMN_UID_FOR_INDEX: "column_uid_for_index",
  SORTED_ROW_UIDS: "sorted_row_uids",
  ROW_INDEX_FOR_UID: "row_index_for_uid",
  ROW_UID_FOR_INDEX: "row_uid_for_index",
});

/** TST.TableModelArchive.base_column_row_uids. */
export const BASE_COLUMN_ROW_UIDS = 46;

/** TSP.UUID: two halves of a 128-bit identifier. */
export interface Uid {
  lower: bigint;
  upper: bigint;
}

/** Stable string form, for use as a map key. */
export function uidKey(uid: Uid): string {
  return `${uid.lower}:${uid.upper}`;
}

/** Read a `TSP.UUID` submessage. */
export function readUid(message: RawMessage | undefined): Uid | undefined {
  if (!message) return undefined;
  return { lower: message.getVarint(1) ?? 0n, upper: message.getVarint(2) ?? 0n };
}

/** Both directions of a table's row and column identity mapping. */
export class ColumnRowUidMap {
  private readonly columnByUid = new Map<string, number>();
  private readonly rowByUid = new Map<string, number>();
  private readonly uidByColumn: (Uid | undefined)[] = [];
  private readonly uidByRow: (Uid | undefined)[] = [];

  constructor(message: RawMessage | undefined) {
    if (!message) return;
    this.load(
      message,
      UidMapFields.SORTED_COLUMN_UIDS,
      UidMapFields.COLUMN_INDEX_FOR_UID,
      UidMapFields.COLUMN_UID_FOR_INDEX,
      this.columnByUid,
      this.uidByColumn,
    );
    this.load(
      message,
      UidMapFields.SORTED_ROW_UIDS,
      UidMapFields.ROW_INDEX_FOR_UID,
      UidMapFields.ROW_UID_FOR_INDEX,
      this.rowByUid,
      this.uidByRow,
    );
  }

  private load(
    message: RawMessage,
    sortedField: number,
    indexForUidField: number,
    uidForIndexField: number,
    byUid: Map<string, number>,
    byIndex: (Uid | undefined)[],
  ): void {
    const sorted = message.getMessages(sortedField).map((entry) => readUid(entry)!);
    const indexes = message.getPackedVarints(indexForUidField).map(Number);
    for (const [slot, uid] of sorted.entries()) {
      const index = indexes[slot];
      if (index !== undefined) byUid.set(uidKey(uid), index);
    }
    // The reverse array is indexed by position and holds a *slot*, so it is
    // dereferenced through the sorted list rather than read directly.
    for (const [index, slot] of message.getPackedVarints(uidForIndexField).entries()) {
      byIndex[index] = sorted[Number(slot)];
    }
  }

  /** Column holding this identity, or `undefined` if it is not this table's. */
  columnIndex(uid: Uid | undefined): number | undefined {
    return uid ? this.columnByUid.get(uidKey(uid)) : undefined;
  }

  rowIndex(uid: Uid | undefined): number | undefined {
    return uid ? this.rowByUid.get(uidKey(uid)) : undefined;
  }

  columnUid(index: number): Uid | undefined {
    return this.uidByColumn[index];
  }

  rowUid(index: number): Uid | undefined {
    return this.uidByRow[index];
  }

  get columnCount(): number {
    return this.columnByUid.size;
  }

  get rowCount(): number {
    return this.rowByUid.size;
  }
}

/** The identity map of a table, if it keeps one. */
export function uidMapOf(store: ObjectStore, tableModel: RawMessage): ColumnRowUidMap {
  const target = store.resolve(refId(tableModel, BASE_COLUMN_ROW_UIDS));
  return new ColumnRowUidMap(target?.message);
}
