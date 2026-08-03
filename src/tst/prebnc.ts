/**
 * Pre-BNC cell records — storage version 4, written by iWork '13/'15 apps.
 *
 * Nothing about the layout needs Apple: the records sit in ordinary
 * documents, and the string table beside them says in plain English
 * whether a reading is right.
 *
 * ## What was measured
 *
 * The header is 12 bytes and is v5's header with a wider extras word:
 *
 * ```text
 *   0  version      always 4
 *   1  cell type    the same TST codes v5 uses (2 number, 3 text, 5 date…)
 *   2  padding      zero in every record seen
 *   4  flags   u32  which optional fields follow
 *   8  extras  u32  a presence mask mirroring some of the flags
 * ```
 *
 * Payload sizes come from a linear system — flag word against record length
 * — that the observed combinations over-determine. `scripts/analyse-prebnc.ts`
 * solves and re-checks it on demand. Six combinations occur:
 *
 * ```text
 *   flags   bits      payload  type
 *   0x0014  2,4        8       3  text
 *   0x0094  2,4,7     12       3  text
 *   0x0024  2,5       16       2  number
 *   0x0026  1,2,5     20       2  number
 *   0x002c  2,3,5     20       2  number
 *   0x00c4  2,6,7     20       5  date
 * ```
 *
 * ## Why this decodes by position rather than by flag
 *
 * Bit 2 is set in **every** record, so it is either a marker or a field
 * every cell carries, and its size cannot be separated from bits 4, 5 and 6
 * by length alone. That leaves the exact flag→field assignment open.
 *
 * What is *not* open is where the value sits. Across all six combinations
 * the value lands at the same place relative to the end of the record: a
 * text cell's string key is the last four bytes, and a number or date's
 * IEEE double is the eight bytes before a single trailing word. That
 * regularity is what this module decodes, and it is checked rather than
 * assumed — {@link PRE_BNC_LAYOUTS} lists the payload sizes seen for each
 * cell type, and a record whose size is not among them is **refused**.
 *
 * Refusing is the point. A pre-BNC file from a corner of iWork '13 that
 * nobody here has seen should read as "cannot decode this cell", not as a
 * number off by a factor of a thousand.
 *
 * ## Writing
 *
 * Not supported, and not planned. Any current iWork app converts these
 * documents to v5 storage on open, so the useful operation is to read an
 * old file and save it modern — which the v5 writer already does.
 */

/** Storage version byte of a pre-BNC record. */
export const PRE_BNC_VERSION = 4;

const HEADER_SIZE = 12;

/** Header field offsets, mirroring v5's layout with a wider extras word. */
const Header = {
  VERSION: 0,
  TYPE: 1,
  PADDING: 2,
  FLAGS: 4,
  EXTRAS: 8,
} as const;

/**
 * Payload sizes observed per cell type, in bytes.
 *
 * A record whose payload is not one of these is refused rather than
 * decoded: the position rule this module relies on is only known to hold
 * for the shapes that were measured.
 */
export const PRE_BNC_LAYOUTS: ReadonlyMap<number, readonly number[]> = new Map([
  [2, [16, 20]], // number
  [3, [8, 12]], // text
  [5, [20]], // date
]);

/** Cell type codes, shared with v5 — see {@link ../tst/cellrecord.ts}. */
const PreBncType = { NUMBER: 2, TEXT: 3, DATE: 5 } as const;

/** A decoded pre-BNC record. Undecoded fields are reported, never invented. */
export interface PreBncRecord {
  /** TST cell type code, the same enum v5 uses. */
  type: number;
  /** The raw flag word. Its field assignment is not fully resolved. */
  flags: number;
  /** The raw extras word, a presence mask mirroring some flags. */
  extras: number;
  /** Key into the table's string table, for a text cell. */
  stringId?: number;
  /** The cell's value, for a number cell. */
  number?: number;
  /** Seconds since 2001-01-01 UTC, for a date cell. */
  seconds?: number;
  /**
   * The four bytes after the value on a number or date record.
   *
   * Constant per column in every document measured, so most likely a style
   * or format key. Reported rather than named.
   */
  trailingId?: number;
  /** The words before the value, in order. Reported so nothing is lost. */
  leading: number[];
}

/**
 * Decode one pre-BNC record, or return `undefined` if its shape is unknown.
 *
 * `undefined` means "this library has not measured this shape", which the
 * caller must surface rather than treat as an empty cell.
 */
export function decodePreBncRecord(bytes: Uint8Array): PreBncRecord | undefined {
  if (bytes.length < HEADER_SIZE) return undefined;
  if (bytes[Header.VERSION] !== PRE_BNC_VERSION) return undefined;

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const type = bytes[Header.TYPE]!;
  const payload = bytes.length - HEADER_SIZE;
  if (!(PRE_BNC_LAYOUTS.get(type) ?? []).includes(payload)) return undefined;

  const record: PreBncRecord = {
    type,
    flags: view.getUint32(Header.FLAGS, true),
    extras: view.getUint32(Header.EXTRAS, true),
    leading: [],
  };

  if (type === PreBncType.TEXT) {
    // The string key is the last word; everything before it is carried
    // through unread.
    for (let at = HEADER_SIZE; at + 4 < bytes.length; at += 4) {
      record.leading.push(view.getUint32(at, true));
    }
    record.stringId = view.getUint32(bytes.length - 4, true);
    return record;
  }

  // Number and date: [leading words][f64 value][one trailing word].
  const valueAt = bytes.length - 12;
  for (let at = HEADER_SIZE; at + 12 <= bytes.length; at += 4) {
    record.leading.push(view.getUint32(at, true));
  }
  const value = view.getFloat64(valueAt, true);
  if (type === PreBncType.DATE) record.seconds = value;
  else record.number = value;
  record.trailingId = view.getUint32(bytes.length - 4, true);
  return record;
}

/**
 * Split a pre-BNC row buffer into per-column records.
 *
 * The offsets array is the only reliable boundary — records are not
 * self-describing — and `0xFFFF` marks a column with no cell. Offsets are
 * sorted before differencing because column order and storage order are not
 * required to agree.
 */
export function splitPreBncRow(
  buffer: Uint8Array,
  offsets: Uint8Array,
): { column: number; bytes: Uint8Array }[] {
  const view = new DataView(offsets.buffer, offsets.byteOffset, offsets.byteLength);
  const present: { column: number; offset: number }[] = [];
  for (let column = 0; column * 2 + 1 < offsets.length; column++) {
    const offset = view.getUint16(column * 2, true);
    if (offset !== 0xffff) present.push({ column, offset });
  }
  present.sort((a, b) => a.offset - b.offset);

  const out: { column: number; bytes: Uint8Array }[] = [];
  for (let i = 0; i < present.length; i++) {
    const start = present[i]!.offset;
    const end = i + 1 < present.length ? present[i + 1]!.offset : buffer.length;
    if (start >= end || end > buffer.length) continue;
    out.push({ column: present[i]!.column, bytes: buffer.slice(start, end) });
  }
  return out;
}
