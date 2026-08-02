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
import type { IwaObject } from "../tsp/iwa.ts";
import type { ObjectStore } from "../tsp/store.ts";
import type { RawMessage } from "../base/protobuf.ts";
import { refId } from "../tsp/schema.ts";

/** TSCE.FormulaOwnerDependenciesArchive. */
export const FORMULA_OWNER_DEPENDENCIES = 4008;

export const FormulaOwnerFields = protoFields("TSCE.FormulaOwnerDependenciesArchive", {
  FORMULA_OWNER_UID: "formula_owner_uid",
  INTERNAL_FORMULA_OWNER_ID: "internal_formula_owner_id",
  OWNER_KIND: "owner_kind",
  FORMULA_OWNER: "formula_owner",
  BASE_OWNER_UID: "base_owner_uid",
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
