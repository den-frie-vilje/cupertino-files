/**
 * Composition of the per-family reference extractors — the registry the
 * ObjectStore consults to recompute MessageInfo.object_references for dirty
 * objects. App layers extend this with their own types.
 *
 * Lives in `tsa`, not `tsp`, on purpose: the store knows *that* extractors
 * exist and is handed a map of them; which families contribute is
 * application-level wiring. Keeping the composition here is what lets the
 * persistence layer stay ignorant of every family above it — the layering
 * test holds `tsp` to that.
 */
import { referencedIds, type ReferenceExtractor } from "../tsp/store.ts";
import type { RawMessage } from "../base/protobuf.ts";
import { TSWP_REFERENCE_EXTRACTORS } from "../tswp/schema.ts";
import { TSS_REFERENCE_EXTRACTORS } from "../tss/schema.ts";
import { TSD_REFERENCE_EXTRACTORS } from "../tsd/schema.ts";

/** TST.TableModelArchive's style preset reference, which no app declares. */
const TABLE_MODEL_STYLE_PRESET = 48;
/** The model's base data store, whose references the apps declare in their own order. */
const TABLE_MODEL_DATA_STORE = 4;

/**
 * The model's two inline stores whose nested numbers the wide scan would
 * take for pointers: `merge_owner` (47, a formula store) and
 * `category_owner_deprecated` (81). Neither holds a reference Apple
 * declares.
 */
const TABLE_MODEL_UNDECLARED = new Set([47, 81, TABLE_MODEL_STYLE_PRESET]);

/**
 * The order the apps declare a table model's references in, by field —
 * not field order, but one sequence shared by 70 of the corpus's 71
 * models; and inside the data store, the sequence 65 of them share
 * (tiles, column headers, row headers, the tables, then the rest).
 * Fields absent from a message are skipped; fields not listed follow,
 * in field order.
 */
const TABLE_MODEL_DECLARATION_ORDER = [
  4, 3, 19, 20, 21, 18, 25, 26, 27, 24, 60, 61, 62, 63, 64, 71, 72, 73, 74, 75, 76, 77, 78, 79, 80, 30, 36,
  87, 88, 89, 45, 46, 49, 86, 70, 34, 35, 38,
];
const DATA_STORE_DECLARATION_ORDER = [3, 2, 1, 4, 5, 6, 12, 17, 19, 20, 18, 11, 16, 21, 22];
const HIGHEST_FIELD = 130;

/** The wide scan over a message, one field at a time in the given order. */
function orderedScan(
  m: RawMessage,
  order: readonly number[],
  skip: ReadonlySet<number>,
  nested: ReadonlyMap<number, readonly number[]>,
): bigint[] {
  const fields: number[] = [];
  for (let field = 1; field <= HIGHEST_FIELD; field++) if (m.has(field) && !skip.has(field)) fields.push(field);
  const listed = new Set(order);
  const sequence = [...order.filter((f) => fields.includes(f)), ...fields.filter((f) => !listed.has(f))];
  const out: bigint[] = [];
  for (const field of sequence) {
    const inner = nested.get(field);
    if (inner) {
      for (const sub of m.getMessages(field)) out.push(...orderedScan(sub, inner, new Set(), new Map()));
      continue;
    }
    const alone = m.clone();
    for (const other of fields) if (other !== field) alone.remove(other);
    for (const other of skip) alone.remove(other);
    out.push(...referencedIds(alone));
  }
  return out;
}

/**
 * TST.TableModelArchive declares every reference it carries but the
 * style preset and the numbers inside its two inline stores, in the
 * sequences above, repeats kept at their first place. Measured against
 * all 71 corpus models: the same set on every one, the same order on 64,
 * the exceptions iWork '13 and '16 files.
 */
const tableModelExtractor: ReferenceExtractor = (m) =>
  orderedScan(
    m,
    TABLE_MODEL_DECLARATION_ORDER,
    TABLE_MODEL_UNDECLARED,
    new Map([[TABLE_MODEL_DATA_STORE, DATA_STORE_DECLARATION_ORDER]]),
  );

export const SHARED_REFERENCE_EXTRACTORS: ReadonlyMap<number, ReferenceExtractor> = new Map([
  ...TSWP_REFERENCE_EXTRACTORS,
  ...TSS_REFERENCE_EXTRACTORS,
  ...TSD_REFERENCE_EXTRACTORS,
  [6001, tableModelExtractor],
]);
