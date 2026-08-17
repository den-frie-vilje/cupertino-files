/**
 * Calc-engine formula owners (`TSCE.FormulaOwnerDependenciesArchive`).
 *
 * The calc engine does not address tables by object id. It gives every
 * table an **owner UUID**, and every structure that owns formulas on that
 * table — merges, conditional styles, hidden states, categories — a
 * *derived* owner UUID of its own. Cross-table formula references carry one
 * of these UUIDs rather than anything that looks like a table, which is why
 * a reference to another table reads as an unnameable identity until this
 * map is built.
 *
 * ```proto
 * message TSCE.FormulaOwnerDependenciesArchive {   // type 4008
 *   required TSP.UUID formula_owner_uid = 1;
 *   required uint32 internal_formula_owner_id = 2;
 *   optional uint32 owner_kind = 3;
 *   optional TSP.Reference formula_owner = 11;     // ← the object, when it has one
 *   optional TSP.UUID base_owner_uid = 12;         // ← the table this derives from
 * }
 * ```
 *
 * Resolution is two hops. An entry with `formula_owner` names its object
 * directly; a derived entry follows `base_owner_uid` to the entry that
 * does. Across the corpus that resolves 418 of 524 owners, and **every one
 * of them lands on a `TST.TableInfoArchive`** — the remainder are owners
 * for things that are not tables.
 *
 * The derived UUIDs are also *computable* in current files: `formula_owner_uid`
 * equals `base_owner_uid + owner_kind` in the low 64 bits, which holds for
 * 339 of the 409 entries that carry a base. Older files use unrelated random
 * UUIDs instead. That is why resolution follows the stored `base_owner_uid`
 * rather than arithmetic — the arithmetic is an observation about how the
 * apps generate them, not a rule a reader can rely on.
 *
 * **`TSP.CFUUIDArchive` and `TSP.UUID` are the same 128 bits in different
 * clothes.** The AST stores a CFUUID as four `uint32` words; the calc engine
 * stores a UUID as two `uint64`s. `lo = w0 | w1<<32`, `hi = w2 | w3<<32`,
 * which is what lets an AST's `table_id` be looked up in this map at all.
 */
import { protoFields } from "../proto/fields.ts";
import type { ObjectStore } from "../tsp/store.ts";
import type { IwaObject } from "../tsp/iwa.ts";
import { RawMessage } from "../base/protobuf.ts";
import { refId } from "../tsp/schema.ts";

/** TSCE.FormulaOwnerDependenciesArchive. */
export const FORMULA_OWNER_DEPENDENCIES = 4008;

export const FormulaOwnerFields = protoFields("TSCE.FormulaOwnerDependenciesArchive", {
  FORMULA_OWNER_UID: "formula_owner_uid",
  INTERNAL_FORMULA_OWNER_ID: "internal_formula_owner_id",
  OWNER_KIND: "owner_kind",
  FORMULA_OWNER: "formula_owner",
  BASE_OWNER_UID: "base_owner_uid",
  TILED_CELL_DEPENDENCIES: "tiled_cell_dependencies",
  CELL_DEPENDENCIES: "cell_dependencies",
  RANGE_DEPENDENCIES: "range_dependencies",
  VOLATILE_DEPENDENCIES: "volatile_dependencies",
  SPANNING_COLUMN_DEPENDENCIES: "spanning_column_dependencies",
  SPANNING_ROW_DEPENDENCIES: "spanning_row_dependencies",
  WHOLE_OWNER_DEPENDENCIES: "whole_owner_dependencies",
  CELL_ERRORS: "cell_errors",
  UUID_REFERENCES: "uuid_references",
  TILED_RANGE_DEPENDENCIES: "tiled_range_dependencies",
  SPILL_RANGE_SIZES: "spill_range_sizes",
});

/**
 * The per-cell dependency ledger hanging off an owner: a tiled list of
 * `CellRecordExpandedArchive`s. For a merge owner, "cells" are synthetic —
 * `(row 0, column = formula_index)`, one per merged rectangle, with a
 * deliberately empty edges message; both merge-bearing corpus documents
 * agree on the exact bytes. Tiles are 32 columns wide (begins observed at
 * 0, 64, 96 and 128, splitting exactly at multiples of 32) and exist only
 * once something occupies them: never-merged tables carry the tiled list
 * with zero tile references.
 */
export const CELL_RECORD_TILE = 4009;
export const TiledDependenciesFields = protoFields("TSCE.CellDependenciesTiledArchive", {
  TILES: "cell_record_tiles",
});
export const CellRecordTileFields = protoFields("TSCE.CellRecordTileArchive", {
  INTERNAL_OWNER_ID: "internal_owner_id",
  TILE_COLUMN_BEGIN: "tile_column_begin",
  TILE_ROW_BEGIN: "tile_row_begin",
  CELL_RECORDS: "cell_records",
});
export const CellRecordExpandedFields = protoFields("TSCE.CellRecordExpandedArchive", {
  COLUMN: "column",
  ROW: "row",
  EXPANDED_EDGES: "expanded_edges",
});
/**
 * One record's dependency edges, as parallel arrays: entry *i* of the row
 * and column lists names a cell in the owner whose internal id is entry
 * *i* of the id list. Every conditional-style record in the corpus — 1968
 * across two documents — carries exactly one edge, pointing at the same
 * `(row, column)` in the table's own kind-1 owner: the rule formula reads
 * the cell it styles.
 */
export const ExpandedEdgesFields = protoFields("TSCE.ExpandedEdgesArchive", {
  EDGE_WITH_OWNER_ROWS: "edge_with_owner_rows",
  EDGE_WITH_OWNER_COLUMNS: "edge_with_owner_columns",
  INTERNAL_OWNER_ID_FOR_EDGE: "internal_owner_id_for_edge",
});

/** TSCE.HauntedOwnerArchive, on TST.TableModelArchive.haunted_owner = 84. */
export const HAUNTED_OWNER = 84;
export const HauntedOwnerFields = protoFields("TSCE.HauntedOwnerArchive", { OWNER_UID: "owner_uid" });

/** TST.TableInfoArchive.tableModel, for naming a resolved owner. */
const TABLE_INFO_MODEL = 2;
const TABLE_MODEL_NAME = 8;

/**
 * `owner_kind` — what a derived owner belongs to.
 *
 * Apple publishes no enum for this, but it does not need to: every derived
 * owner is *used* by a field somewhere, and matching each field's UUID back
 * to its owner entry names the kind. Nine of the thirteen values in the
 * corpus were established that way, each unanimous across every file that
 * exercises it. The counts below are the evidence.
 *
 * | kind | meaning | how it was established |
 * |---|---|---|
 * | 1 | the table itself | the only entries carrying `formula_owner`; every other kind's base |
 * | 3 | conditional-style formulas | `TableModelArchive.conditional_style_formula_owner_id` ×44 |
 * | 4 | hidden-state formulas, **rows** | `hidden_state_formula_owner_for_rows` ×44, and the archive's own id ×49 |
 * | 5 | merge formulas | the inline `merge_owner`'s id ×18 — and it names the table it sits on |
 * | 8 | categories (group-by) | `GroupByArchive.group_by_uid` ×32 |
 * | 9 | summary aggregates | `SummaryModelArchive.aggregate_formula_owner_uuid` ×44 |
 * | 11 | hidden-state formulas, **columns** | `hidden_state_formula_owner_for_columns` ×39 |
 * | 35 | the "haunted" owner | `TableModelArchive.haunted_owner` ×34 |
 * | 200 | the document | fixed sentinel `uid = 666`, in all 23 files that have one |
 *
 * Kinds **6, 7, 10 and 12** occur (32, 41, 44 and 28 times) with no field
 * in this repository's protos pointing at them. They are left unnamed
 * rather than guessed; naming one means finding the field that uses it, the
 * same way the others were found.
 */
export const OwnerKind = {
  /**
   * The owner Numbers mints for a uid it cannot resolve while opening a
   * document: the uid keeps an internal id, parked on the owner map's
   * `unregistered_internal_owner_id` list, and every formula referencing
   * it opens as a ref error. Two review rounds produced one each, both
   * for cross-table references to a clone whose written identity the
   * app had discarded.
   */
  TOMBSTONE: 0,
  /** The table itself. Carries the `formula_owner` reference. */
  TABLE: 1,
  /** Formulas backing conditional-formatting rules. */
  CONDITIONAL_STYLE: 3,
  /** Formulas backing row hiding — filters and manual hides. */
  HIDDEN_STATE_ROWS: 4,
  /** Formulas backing merged cell ranges. */
  MERGE: 5,
  /** Formulas backing categories (row grouping). */
  CATEGORIES: 8,
  /** Formulas backing a category's summary aggregates. */
  SUMMARY_AGGREGATES: 9,
  /** Formulas backing column hiding. */
  HIDDEN_STATE_COLUMNS: 11,
  /** Apple's "haunted owner" for the table. */
  HAUNTED: 35,
  /**
   * The document as a whole, not any table.
   *
   * Recognisable without knowing the enum: every kind-200 owner in every
   * corpus file — 23 of them, across all three apps and every era — has the
   * *same* identity, `uid = 666` derived from `base = 466`. Real owners get
   * random 128-bit UUIDs; this is a hardcoded sentinel, which is why it
   * names no table and should not be reported as an unresolved one.
   */
  DOCUMENT: 200,
} as const;

/** Human-readable names for the kinds evidence has established. */
export const OWNER_KIND_NAMES: ReadonlyMap<number, string> = new Map([
  [OwnerKind.TOMBSTONE, "tombstone"],
  [OwnerKind.TABLE, "table"],
  [OwnerKind.CONDITIONAL_STYLE, "conditional style"],
  [OwnerKind.HIDDEN_STATE_ROWS, "hidden state (rows)"],
  [OwnerKind.MERGE, "merge"],
  [OwnerKind.CATEGORIES, "categories"],
  [OwnerKind.SUMMARY_AGGREGATES, "summary aggregates"],
  [OwnerKind.HIDDEN_STATE_COLUMNS, "hidden state (columns)"],
  [OwnerKind.HAUNTED, "haunted owner"],
  [OwnerKind.DOCUMENT, "document"],
]);

/** The fixed identity every document-level owner uses. */
export const DOCUMENT_OWNER_UID: OwnerUid = { lo: 666n, hi: 0n };

/** A 128-bit identity, however it was written. */
export interface OwnerUid {
  lo: bigint;
  hi: bigint;
}

/** Stable key for map lookups. */
export function ownerKey(uid: OwnerUid | undefined): string {
  return uid ? `${uid.lo}:${uid.hi}` : "";
}

/** Read a `TSP.UUID` (two uint64s). */
export function readOwnerUid(message: RawMessage | undefined): OwnerUid | undefined {
  if (!message) return undefined;
  return { lo: message.getVarint(1) ?? 0n, hi: message.getVarint(2) ?? 0n };
}

/**
 * Read a `TSP.CFUUIDArchive` as the same 128 bits.
 *
 * Two encodings exist and both occur: four `uint32` words, or a 16-byte
 * `uuid_bytes` blob. They are packed little-endian, so `w0` is the low half
 * of the low word.
 */
export function readCfUid(message: RawMessage | undefined): OwnerUid | undefined {
  if (!message) return undefined;
  const bytes = message.has(1) ? message.getBytes(1) : undefined;
  if (bytes?.length === 16) {
    const view = new DataView(bytes.buffer, bytes.byteOffset, 16);
    return { lo: view.getBigUint64(0, true), hi: view.getBigUint64(8, true) };
  }
  const w = [2, 3, 4, 5].map((no) => BigInt(message.getUint(no) ?? 0));
  return { lo: w[0]! | (w[1]! << 32n), hi: w[2]! | (w[3]! << 32n) };
}

/** What the calc engine knows about one owner. */
export interface FormulaOwner {
  uid: OwnerUid;
  kind: number;
  internalId: number | undefined;
  /** The owner this one derives from, for anything but a table's own. */
  base: OwnerUid | undefined;
  /** Object the owner names, when the entry or its base carries one. */
  ownerId: bigint | undefined;
  /** Table name, when the owner resolves to a table. */
  tableName: string | undefined;
  /** True when `uid` equals `base + kind`, the current apps' derivation. */
  derivedByArithmetic: boolean;
  /** {@link kind} named, or `undefined` for one still unidentified. */
  kindName: string | undefined;
}

/**
 * Every formula owner in a document, resolved as far as the file allows.
 *
 * Built once and reused: a document has hundreds of owners and resolving
 * one means chasing its base, so a per-lookup scan would be quadratic.
 */
export class FormulaOwnerRegistry {
  private readonly byUid = new Map<string, FormulaOwner>();

  constructor(store: ObjectStore) {
    const raw = new Map<string, { message: RawMessage; uid: OwnerUid }>();
    for (const { obj } of store.allObjects()) {
      if (obj.type !== FORMULA_OWNER_DEPENDENCIES) continue;
      const uid = readOwnerUid(obj.message.getMessage(FormulaOwnerFields.FORMULA_OWNER_UID));
      if (uid) raw.set(ownerKey(uid), { message: obj.message, uid });
    }

    for (const [key, { message, uid }] of raw) {
      const kind = message.getUint(FormulaOwnerFields.OWNER_KIND) ?? 0;
      const base = readOwnerUid(message.getMessage(FormulaOwnerFields.BASE_OWNER_UID));
      // The entry's own reference first, then its base's — a derived owner
      // names nothing itself, which is exactly why the base is stored.
      let ownerId = refId(message, FormulaOwnerFields.FORMULA_OWNER);
      if (ownerId === undefined && base) {
        ownerId = refId(raw.get(ownerKey(base))?.message, FormulaOwnerFields.FORMULA_OWNER);
      }
      this.byUid.set(key, {
        uid,
        kind,
        internalId: message.getUint(FormulaOwnerFields.INTERNAL_FORMULA_OWNER_ID),
        base,
        ownerId,
        tableName: ownerId === undefined ? undefined : tableNameOf(store, ownerId),
        derivedByArithmetic:
          base !== undefined &&
          uid.hi === base.hi &&
          uid.lo === ((base.lo + BigInt(kind)) & 0xffffffffffffffffn),
        kindName: OWNER_KIND_NAMES.get(kind),
      });
    }

    // A table states its own owner too. Where the dependency entry could
    // not be resolved, this names it; where both exist they agree in every
    // corpus file, so the extra path costs nothing and closes real gaps in
    // documents whose dependency records were trimmed.
    for (const { obj } of store.allObjects()) {
      const uid = readOwnerUid(
        obj.message.getMessage(HAUNTED_OWNER)?.getMessage(HauntedOwnerFields.OWNER_UID),
      );
      if (!uid) continue;
      const existing = this.byUid.get(ownerKey(uid));
      const name = obj.message.getString(TABLE_MODEL_NAME);
      if (existing && existing.tableName === undefined && name !== undefined) {
        existing.tableName = name;
        existing.ownerId ??= obj.identifier;
      } else if (!existing) {
        // An archive-backed entry for this same table wins outright: a
        // second TABLE identity under the haunted uid would make the
        // table's name ambiguous to every cross-table compile.
        let registered = false;
        for (const entry of this.byUid.values()) {
          if (entry.kind !== OwnerKind.TABLE || entry.ownerId === undefined) continue;
          if (entry.ownerId === obj.identifier) { registered = true; break; }
          const info = store.object(entry.ownerId);
          if (info && refId(info.message, TABLE_INFO_MODEL) === obj.identifier) { registered = true; break; }
        }
        if (registered) continue;
        this.byUid.set(ownerKey(uid), {
          uid,
          kind: OwnerKind.TABLE,
          internalId: undefined,
          base: undefined,
          ownerId: obj.identifier,
          tableName: name,
          derivedByArithmetic: false,
          kindName: OWNER_KIND_NAMES.get(OwnerKind.TABLE),
        });
      }
    }
  }

  get size(): number {
    return this.byUid.size;
  }

  /** Look an owner up by its identity. */
  lookup(uid: OwnerUid | undefined): FormulaOwner | undefined {
    return uid ? this.byUid.get(ownerKey(uid)) : undefined;
  }

  /**
   * The name of the table an owner belongs to.
   *
   * The point of the whole map: an AST's cross-table `table_id` is one of
   * these identities, so this is what turns an unnameable reference into
   * `Revenue::A2`.
   */
  tableName(uid: OwnerUid | undefined): string | undefined {
    return this.lookup(uid)?.tableName;
  }

  /**
   * The other direction: the identity `Revenue::A2` must *store*.
   *
   * Every cross-table node in the corpus — 1020 of 1020 — carries the
   * target table's kind-1 owner UUID, so that is the only kind consulted.
   * Two tables sharing a name is refused rather than guessed: Numbers
   * scopes names per sheet, and a reference that silently picked one
   * would compute the wrong number somewhere far from the mistake.
   */
  tableUid(name: string): OwnerUid | undefined {
    let found: FormulaOwner | undefined;
    for (const owner of this.byUid.values()) {
      if (owner.kind !== OwnerKind.TABLE || owner.tableName !== name) continue;
      if (found && ownerKey(found.uid) !== ownerKey(owner.uid)) {
        throw new RangeError(
          `two tables are named ${JSON.stringify(name)}; a cross-table reference cannot choose between them`,
        );
      }
      found = owner;
    }
    return found?.uid;
  }

  /** Every owner, for diagnostics. */
  all(): FormulaOwner[] {
    return [...this.byUid.values()];
  }

  /**
   * Owners that name no object.
   *
   * Excludes the document-level sentinel, which names nothing by design —
   * counting it as unresolved would report a gap in every file.
   */
  unresolved(): FormulaOwner[] {
    return this.all().filter(
      (owner) => owner.ownerId === undefined && owner.kind !== OwnerKind.DOCUMENT,
    );
  }

  /** True for the fixed document-level identity rather than a real owner. */
  static isDocumentOwner(uid: OwnerUid | undefined): boolean {
    return uid?.hi === 0n && uid.lo === DOCUMENT_OWNER_UID.lo;
  }
}

/** Name a table from its `TST.TableInfoArchive` or its model. */
function tableNameOf(store: ObjectStore, id: bigint): string | undefined {
  const object = store.object(id);
  if (!object) return undefined;
  // Owners point at the info archive; the name lives on the model below it.
  const model = store.resolve(refId(object.message, TABLE_INFO_MODEL)) ?? object;
  return model.message.getString(TABLE_MODEL_NAME);
}

/** `TSCE.CalculationEngineArchive`. */
const CALCULATION_ENGINE = 4000;
const EngineFields = protoFields("TSCE.CalculationEngineArchive", {
  DEPENDENCY_TRACKER: "dependency_tracker",
});
const TrackerFields = protoFields("TSCE.DependencyTrackerArchive", {
  OWNER_ID_MAP: "owner_id_map",
  FORMULA_OWNER_DEPENDENCIES: "formula_owner_dependencies",
});
const OwnerIdMapFields = protoFields("TSCE.OwnerIDMapArchive", {
  MAP_ENTRY: "map_entry",
  UNREGISTERED: "unregistered_internal_owner_id",
});
const MapEntryFields = protoFields("TSCE.OwnerIDMapArchive.OwnerIDMapArchiveEntry", {
  INTERNAL: "internal_owner_id",
  OWNER_ID: "owner_id",
});
const PayloadFields = protoFields("TSCE.FormulaOwnerDependenciesArchive", {
  CELL_DEPENDENCIES: "cell_dependencies",
  RANGE_DEPENDENCIES: "range_dependencies",
  VOLATILE_DEPENDENCIES: "volatile_dependencies",
  SPANNING_COLUMN_DEPENDENCIES: "spanning_column_dependencies",
  SPANNING_ROW_DEPENDENCIES: "spanning_row_dependencies",
  WHOLE_OWNER_DEPENDENCIES: "whole_owner_dependencies",
  CELL_ERRORS: "cell_errors",
  TILED_CELL_DEPENDENCIES_BAG: "tiled_cell_dependencies",
  UUID_REFERENCES: "uuid_references",
  TILED_RANGE_DEPENDENCIES: "tiled_range_dependencies",
  SPILL_RANGE_SIZES: "spill_range_sizes",
});
/** `TSCE.CellRecordTileArchive`. */
const CELL_RECORD_TILE_TYPE = 4009;
const TileArchiveFields = protoFields("TSCE.CellRecordTileArchive", {
  INTERNAL_OWNER_ID: "internal_owner_id",
  TILE_COLUMN_BEGIN: "tile_column_begin",
  TILE_ROW_BEGIN: "tile_row_begin",
});

/**
 * The empty-state payload every owner archive carries beside its
 * identity, measured twice from the app itself: its own fresh family for
 * a re-registered table, and — field for field the same — the upgrade it
 * wrote onto a library-minted identity-only archive it kept. The
 * spanning extents hold int16/int32 sentinels meaning "no extent"; every
 * message with required fields states them, which is what separates this
 * decoration from the malformed empties that once shipped.
 */
function writeEmptyPayload(m: RawMessage): void {
  m.setBytes(PayloadFields.CELL_DEPENDENCIES, new Uint8Array(0));
  m.setBytes(PayloadFields.RANGE_DEPENDENCIES, new Uint8Array(0));
  const volatile = RawMessage.create();
  for (const field of [1, 2, 3, 4, 5, 7]) volatile.setBytes(field, new Uint8Array(0));
  m.setMessage(PayloadFields.VOLATILE_DEPENDENCIES, volatile);
  for (const field of [
    PayloadFields.SPANNING_COLUMN_DEPENDENCIES,
    PayloadFields.SPANNING_ROW_DEPENDENCIES,
  ]) {
    const spanning = RawMessage.create();
    for (const slot of [2, 3]) {
      const extent = RawMessage.create();
      extent.setVarint(1, 32767);
      extent.setVarint(2, 2147483647);
      extent.setVarint(3, 32767);
      extent.setVarint(4, 2147483647);
      spanning.setMessage(slot, extent);
    }
    m.setMessage(field, spanning);
  }
  const whole = RawMessage.create();
  whole.setBytes(1, new Uint8Array(0));
  m.setMessage(PayloadFields.WHOLE_OWNER_DEPENDENCIES, whole);
  m.setBytes(PayloadFields.CELL_ERRORS, new Uint8Array(0));
}

/** The payload fields that follow the owner-specific ones, in field order. */
function writePayloadTail(m: RawMessage): void {
  m.setBytes(PayloadFields.UUID_REFERENCES, new Uint8Array(0));
  m.setBytes(PayloadFields.TILED_RANGE_DEPENDENCIES, new Uint8Array(0));
  m.setBytes(PayloadFields.SPILL_RANGE_SIZES, new Uint8Array(0));
}

/**
 * The owner kinds a table's family comprises, base + kind each. Both
 * app-minted families available for measurement — the blank template's
 * own table and the family Numbers minted while re-registering a
 * library clone — carry exactly this set.
 */
const TABLE_FAMILY_KINDS = [
  OwnerKind.TABLE,
  OwnerKind.CONDITIONAL_STYLE,
  OwnerKind.HIDDEN_STATE_ROWS,
  OwnerKind.MERGE,
  6,
  OwnerKind.CATEGORIES,
  OwnerKind.SUMMARY_AGGREGATES,
  10,
  OwnerKind.HIDDEN_STATE_COLUMNS,
  12,
  OwnerKind.HAUNTED,
] as const;

/**
 * Register a table with the calc engine, at every site the engine
 * consults.
 *
 * Registration is three things, and a table is only registered when it
 * has all of them:
 *
 * 1. A `FormulaOwnerDependenciesArchive` per owner kind — the full
 *    family the app mints for a fresh table, each uid `base + kind`.
 * 2. A `TSP.Reference` to each archive from the engine's
 *    `dependency_tracker.formula_owner_dependencies` list. An archive
 *    the list does not name is never loaded.
 * 3. An `owner_id_map` entry per owner — internal id ↔ uid, the uid in
 *    its four-word CFUUID shape. The map is the engine's registry: a
 *    uid absent here is a table the engine has never heard of, and
 *    Numbers re-registers it under a brand-new identity on open,
 *    re-pointing stray references at a kind-0 tombstone owner it parks
 *    on the map's `unregistered_internal_owner_id` list — measured as
 *    the `#ERROR` a library-written cross-table reference opened to
 *    while the checker's own, typed a minute later, computed.
 *
 * Internal ids allocate one past the map's maximum — the map knows
 * owners that have no archive in the file, so the archives' maximum
 * runs low and colliding with a mapped id would alias two owners.
 *
 * Only identity is written per archive: uid, internal id, kind, and
 * the `formula_owner` reference (base uid on derived entries). The
 * app's own archives carry dependency payloads as well, but several
 * nest messages whose fields are `required` — an *empty*
 * `RangeCoordinateArchive` is malformed, and one round of demo
 * documents shipped exactly that and opened as damaged. Omitting an
 * optional field can never be malformed, and the engine rebuilds
 * dependency state on open.
 */
/**
 * Where a table's base identity stands against the three registration
 * sites the engine consults. `audit()` reports any gap: a partial
 * registration is exactly the state Numbers repairs by re-minting the
 * table's identity, which strands every stored reference to it.
 */
export function ownerRegistrationState(
  store: ObjectStore,
  base: OwnerUid,
): { archive: boolean; tracked: boolean; mapped: boolean } {
  let archiveId: bigint | undefined;
  for (const { obj } of store.allObjects()) {
    if (obj.type !== FORMULA_OWNER_DEPENDENCIES) continue;
    const uid = readOwnerUid(obj.message.getMessage(FormulaOwnerFields.FORMULA_OWNER_UID));
    if (uid && uid.lo === base.lo && uid.hi === base.hi) {
      archiveId = obj.identifier;
      break;
    }
  }
  const engine = store.findByType(CALCULATION_ENGINE);
  const tracker = engine?.message.getMessage(EngineFields.DEPENDENCY_TRACKER);
  const tracked =
    archiveId !== undefined &&
    (tracker?.getMessages(TrackerFields.FORMULA_OWNER_DEPENDENCIES) ?? []).some(
      (r) => r.getVarint(1) === archiveId,
    );
  const mapped = (tracker?.getMessage(TrackerFields.OWNER_ID_MAP)?.getMessages(OwnerIdMapFields.MAP_ENTRY) ?? []).some(
    (e) => {
      const uid = readCfUid(e.getMessage(MapEntryFields.OWNER_ID));
      return uid !== undefined && uid.lo === base.lo && uid.hi === base.hi;
    },
  );
  return { archive: archiveId !== undefined, tracked, mapped };
}

/** The internal id the engine's map gives an owner uid, if any archive carries it. */
export function ownerInternalId(store: ObjectStore, uid: OwnerUid): number | undefined {
  for (const { obj } of store.allObjects()) {
    if (obj.type !== FORMULA_OWNER_DEPENDENCIES) continue;
    const u = readOwnerUid(obj.message.getMessage(FormulaOwnerFields.FORMULA_OWNER_UID));
    if (u && u.lo === uid.lo && u.hi === uid.hi) {
      return obj.message.getUint(FormulaOwnerFields.INTERNAL_FORMULA_OWNER_ID);
    }
  }
  return undefined;
}

/** The kind-1 owner archive carrying this uid, if present. */
export function ownerArchiveByUid(store: ObjectStore, uid: OwnerUid): IwaObject | undefined {
  for (const { obj } of store.allObjects()) {
    if (obj.type !== FORMULA_OWNER_DEPENDENCIES) continue;
    const u = readOwnerUid(obj.message.getMessage(FormulaOwnerFields.FORMULA_OWNER_UID));
    if (u && u.lo === uid.lo && u.hi === uid.hi) return obj;
  }
  return undefined;
}

export function mintTableOwnerArchive(
  store: ObjectStore,
  tableInfoId: bigint,
  base: OwnerUid,
  extent?: { rows: number; columns: number },
): void {
  const engine = store.findByType(CALCULATION_ENGINE);
  const component = engine ? store.componentOf(engine.identifier) : undefined;
  if (!engine || !component) return;
  const tracker = engine.message.getMessage(EngineFields.DEPENDENCY_TRACKER);
  if (!tracker) return;
  let map = tracker.getMessage(TrackerFields.OWNER_ID_MAP);
  if (!map) {
    map = RawMessage.create();
    tracker.setMessage(TrackerFields.OWNER_ID_MAP, map);
  }

  const mapEntries = map.getMessages(OwnerIdMapFields.MAP_ENTRY);
  const mappedUids = new Set(
    mapEntries
      .map((e) => readCfUid(e.getMessage(MapEntryFields.OWNER_ID)))
      .filter((uid): uid is OwnerUid => uid !== undefined)
      .map(ownerKey),
  );
  let maxInternal = 0;
  for (const entry of mapEntries) {
    const internal = entry.getUint(MapEntryFields.INTERNAL) ?? 0;
    if (internal > maxInternal) maxInternal = internal;
  }
  for (const field of map.fields) {
    if (field.no === OwnerIdMapFields.UNREGISTERED && typeof field.value === "bigint") {
      const internal = Number(field.value);
      if (internal > maxInternal) maxInternal = internal;
    }
  }
  const existing = new Map<string, { archive: IwaObject; internal: number }>();
  for (const { obj } of store.allObjects()) {
    if (obj.type !== FORMULA_OWNER_DEPENDENCIES) continue;
    const internal = obj.message.getUint(FormulaOwnerFields.INTERNAL_FORMULA_OWNER_ID) ?? 0;
    if (internal > maxInternal) maxInternal = internal;
    const uid = readOwnerUid(obj.message.getMessage(FormulaOwnerFields.FORMULA_OWNER_UID));
    if (uid) existing.set(ownerKey(uid), { archive: obj, internal });
  }
  const trackedIds = new Set(
    tracker
      .getMessages(TrackerFields.FORMULA_OWNER_DEPENDENCIES)
      .map((r) => r.getVarint(1))
      .filter((id): id is bigint => id !== undefined),
  );

  const enroll = (archive: IwaObject, uid: OwnerUid, internal: number): void => {
    if (!trackedIds.has(archive.identifier)) {
      const ref = RawMessage.create();
      ref.setVarint(1, archive.identifier);
      tracker.addMessage(TrackerFields.FORMULA_OWNER_DEPENDENCIES, ref);
      store.declareReference(engine, archive.identifier);
      engine.message.markDirty();
    }
    if (!mappedUids.has(ownerKey(uid))) {
      const entry = RawMessage.create();
      entry.setVarint(MapEntryFields.INTERNAL, internal);
      const cf = RawMessage.create();
      const words = [uid.lo & 0xffffffffn, uid.lo >> 32n, uid.hi & 0xffffffffn, uid.hi >> 32n];
      for (const [i, word] of words.entries()) cf.setVarint(i + 2, word);
      entry.setMessage(MapEntryFields.OWNER_ID, cf);
      map.addMessage(OwnerIdMapFields.MAP_ENTRY, entry);
      mappedUids.add(ownerKey(uid));
      engine.message.markDirty();
    }
  };

  for (const kind of TABLE_FAMILY_KINDS) {
    const uid: OwnerUid = {
      lo: kind === OwnerKind.TABLE ? base.lo : (base.lo + BigInt(kind)) & 0xffffffffffffffffn,
      hi: base.hi,
    };
    const present = existing.get(ownerKey(uid));
    if (present) {
      enroll(present.archive, uid, present.internal);
      continue;
    }
    const internal = ++maxInternal;
    const archive = store.createObject(FORMULA_OWNER_DEPENDENCIES, component);
    const m = archive.message;
    const uidMsg = RawMessage.create();
    uidMsg.setVarint(1, uid.lo);
    uidMsg.setVarint(2, uid.hi);
    m.setMessage(FormulaOwnerFields.FORMULA_OWNER_UID, uidMsg);
    m.setVarint(FormulaOwnerFields.INTERNAL_FORMULA_OWNER_ID, internal);
    m.setVarint(FormulaOwnerFields.OWNER_KIND, kind);
    writeEmptyPayload(m);
    // The table's own owner states the real extent where derived kinds
    // state the no-extent sentinels — every accepted kind-1 specimen
    // carries {0..columns-1, 0..rows-1} in both spanning slots.
    if (kind === OwnerKind.TABLE && extent) {
      for (const field of [
        PayloadFields.SPANNING_COLUMN_DEPENDENCIES,
        PayloadFields.SPANNING_ROW_DEPENDENCIES,
      ]) {
        const spanning = RawMessage.create();
        for (const [slot, second] of [[2, 0], [3, 1]] as const) {
          const range = RawMessage.create();
          range.setVarint(1, 0);
          range.setVarint(2, second);
          range.setVarint(3, Math.max(0, extent.columns - 1));
          range.setVarint(4, Math.max(0, extent.rows - 1));
          spanning.setMessage(slot, range);
        }
        m.setMessage(field, spanning);
      }
    }
    if (kind === OwnerKind.TABLE) {
      const owner = RawMessage.create();
      owner.setVarint(1, tableInfoId);
      m.setMessage(FormulaOwnerFields.FORMULA_OWNER, owner);
      store.declareReference(archive, tableInfoId);
      // The one payload only the table's own owner carries: a dependency
      // tile of its formula cells, empty for a fresh table — the app
      // minted exactly this beside the kind-1 it kept.
      const tile = store.createObject(CELL_RECORD_TILE_TYPE, component);
      tile.message.setVarint(TileArchiveFields.INTERNAL_OWNER_ID, internal);
      tile.message.setVarint(TileArchiveFields.TILE_COLUMN_BEGIN, 0);
      tile.message.setVarint(TileArchiveFields.TILE_ROW_BEGIN, 0);
      const tiled = RawMessage.create();
      const ref = RawMessage.create();
      ref.setVarint(1, tile.identifier);
      tiled.addMessage(1, ref);
      m.setMessage(PayloadFields.TILED_CELL_DEPENDENCIES_BAG, tiled);
      store.declareReference(archive, tile.identifier);
    } else {
      const baseUid = RawMessage.create();
      baseUid.setVarint(1, base.lo);
      baseUid.setVarint(2, base.hi);
      m.setMessage(FormulaOwnerFields.BASE_OWNER_UID, baseUid);
      m.setBytes(PayloadFields.TILED_CELL_DEPENDENCIES_BAG, new Uint8Array(0));
    }
    writePayloadTail(m);
    enroll(archive, uid, internal);
  }
}


// ------------------------------------------------------- clone identity

const MASK64 = 0xffffffffffffffffn;
/** Widest observed table-derived kind is 35; the window is generous. */
const KIND_WINDOW = 256n;

/**
 * Give a cloned table a calc-engine identity of its own.
 *
 * Every owner of a table derives from one base UUID — the owner's kind
 * added to the base — and a byte-clone copies each of them, so the copy
 * and its donor answer to the same identity: a cross-table reference
 * cannot tell the tables apart, and a name lookup resolves the clone to
 * the donor. No two corpus tables share a base. This rewrites every
 * UUID in the given objects that derives from the table's base to the
 * same derivation from a fresh random base, in whichever of the two
 * wire encodings it is stored (TSP.UUID's two varints, or the
 * four-word/16-byte CFUUID shape formula internals use).
 *
 * Returns the fresh base identity, or `undefined` when the table
 * carries none to re-mint (pre-BNC storage generations).
 */
export function remintFormulaOwnerIdentity(
  tableModel: IwaObject,
  objects: Iterable<IwaObject>,
): OwnerUid | undefined {
  const haunted = readOwnerUid(
    tableModel.message.getMessage(HAUNTED_OWNER)?.getMessage(HauntedOwnerFields.OWNER_UID),
  );
  if (!haunted) return undefined;
  const oldBase: OwnerUid = {
    lo: (haunted.lo - BigInt(OwnerKind.HAUNTED)) & MASK64,
    hi: haunted.hi,
  };
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  const view = new DataView(bytes.buffer);
  const newBase: OwnerUid = { lo: view.getBigUint64(0, true), hi: view.getBigUint64(8, true) };

  const derivation = (uid: OwnerUid): bigint | undefined => {
    if (uid.hi !== oldBase.hi) return undefined;
    const delta = (uid.lo - oldBase.lo) & MASK64;
    return delta < KIND_WINDOW ? delta : undefined;
  };

  const visit = (message: RawMessage, depth: number): void => {
    if (depth > 16) return;
    // TSP.UUID: lower/upper varints at 1 and 2. Either probe throws on a
    // message whose fields carry other wire types; that just means "not
    // this shape".
    let asUuid;
    try {
      asUuid = readOwnerUid(message);
    } catch {
      asUuid = undefined;
    }
    const uuidDelta = asUuid ? derivation(asUuid) : undefined;
    if (uuidDelta !== undefined && message.has(1) && message.has(2)) {
      message.setVarint(1, (newBase.lo + uuidDelta) & MASK64);
      message.setVarint(2, newBase.hi);
      return;
    }
    // CFUUID: 16 raw bytes at 1, or four uint32 words at 2..5.
    let asCf;
    try {
      asCf = readCfUid(message);
    } catch {
      asCf = undefined;
    }
    const cfDelta = asCf ? derivation(asCf) : undefined;
    if (cfDelta !== undefined) {
      const lo = (newBase.lo + cfDelta) & MASK64;
      if (message.has(1)) {
        const raw = new Uint8Array(16);
        const w = new DataView(raw.buffer);
        w.setBigUint64(0, lo, true);
        w.setBigUint64(8, newBase.hi, true);
        message.setBytes(1, raw);
        return;
      }
      const words = [lo & 0xffffffffn, lo >> 32n, newBase.hi & 0xffffffffn, newBase.hi >> 32n];
      for (const [i, word] of words.entries()) message.setVarint(i + 2, word);
      return;
    }
    for (const field of message.fields) {
      if (field.wire !== 2) continue;
      let children: RawMessage[];
      try {
        children = message.getMessages(field.no);
      } catch {
        continue;
      }
      for (const child of children) visit(child, depth + 1);
    }
  };

  for (const object of objects) {
    visit(object.message, 0);
    object.message.markDirty();
  }
  return newBase;
}
