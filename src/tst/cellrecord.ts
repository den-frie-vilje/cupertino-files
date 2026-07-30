/**
 * The v5 ("BNC") cell record: decode, edit, re-encode.
 *
 * A record is a 12-byte header followed by optional fields, present when
 * their bit is set in the header's flag word and serialized in ascending
 * bit order. Layout and flag table: docs/FORMAT.md §14.
 *
 * Everything here is built around one rule: **a record carries more than
 * its value.** Style ids, number formats, comment ids and things this
 * library does not model share the record with the value. Writing a cell
 * therefore edits the fields that belong to the value and leaves every
 * other field exactly where it was — the difference between changing a
 * number and silently stripping the cell's formatting.
 */
import { ByteWriter } from "../base/bytes.ts";

/** Cell type codes (record byte 1). 10 is currency, absent from the enum. */
export const CellType = {
  EMPTY: 0,
  SPAN: 1,
  NUMBER: 2,
  TEXT: 3,
  FORMULA: 4,
  DATE: 5,
  BOOL: 6,
  DURATION: 7,
  ERROR: 8,
  RICH_TEXT: 9,
  CURRENCY: 10,
} as const;

/** Optional-field flags, in ascending bit order with their payload sizes. */
export const CellFlag = {
  DECIMAL128: 0x1,
  DOUBLE: 0x2,
  SECONDS: 0x4,
  STRING_ID: 0x8,
  RICH_ID: 0x10,
  CELL_STYLE_ID: 0x20,
  TEXT_STYLE_ID: 0x40,
  COND_STYLE_ID: 0x80,
  COND_RULE_STYLE_ID: 0x100,
  FORMULA_ID: 0x200,
  CONTROL_ID: 0x400,
  FORMULA_ERROR_ID: 0x800,
  SUGGEST_ID: 0x1000,
  NUM_FORMAT_ID: 0x2000,
  CURRENCY_FORMAT_ID: 0x4000,
  DATE_FORMAT_ID: 0x8000,
  DURATION_FORMAT_ID: 0x10000,
  TEXT_FORMAT_ID: 0x20000,
  BOOL_FORMAT_ID: 0x40000,
  COMMENT_ID: 0x80000,
  IMPORT_WARNING_ID: 0x100000,
} as const;

/** Field sizes by flag, ascending — the serialization order. */
export const FLAG_SIZES: readonly (readonly [flag: number, size: number])[] = [
  [CellFlag.DECIMAL128, 16],
  [CellFlag.DOUBLE, 8],
  [CellFlag.SECONDS, 8],
  [CellFlag.STRING_ID, 4],
  [CellFlag.RICH_ID, 4],
  [CellFlag.CELL_STYLE_ID, 4],
  [CellFlag.TEXT_STYLE_ID, 4],
  [CellFlag.COND_STYLE_ID, 4],
  [CellFlag.COND_RULE_STYLE_ID, 4],
  [CellFlag.FORMULA_ID, 4],
  [CellFlag.CONTROL_ID, 4],
  [CellFlag.FORMULA_ERROR_ID, 4],
  [CellFlag.SUGGEST_ID, 4],
  [CellFlag.NUM_FORMAT_ID, 4],
  [CellFlag.CURRENCY_FORMAT_ID, 4],
  [CellFlag.DATE_FORMAT_ID, 4],
  [CellFlag.DURATION_FORMAT_ID, 4],
  [CellFlag.TEXT_FORMAT_ID, 4],
  [CellFlag.BOOL_FORMAT_ID, 4],
  [CellFlag.COMMENT_ID, 4],
  [CellFlag.IMPORT_WARNING_ID, 4],
];

/** Flags holding the cell's value, as opposed to its presentation. */
export const VALUE_FLAGS =
  CellFlag.DECIMAL128 | CellFlag.DOUBLE | CellFlag.SECONDS | CellFlag.STRING_ID | CellFlag.RICH_ID;

/** Flags holding a per-type number/date/text format id. */
export const FORMAT_FLAGS =
  CellFlag.NUM_FORMAT_ID |
  CellFlag.CURRENCY_FORMAT_ID |
  CellFlag.DATE_FORMAT_ID |
  CellFlag.DURATION_FORMAT_ID |
  CellFlag.TEXT_FORMAT_ID |
  CellFlag.BOOL_FORMAT_ID;

/**
 * The 16-bit "extras" word at bytes 6-7 duplicates which format id is
 * present. Readers ignore it, but Apple writes it, so we keep it in step.
 */
export const EXTRAS_BY_FLAG: ReadonlyMap<number, number> = new Map([
  [CellFlag.NUM_FORMAT_ID, 0x01],
  [CellFlag.CURRENCY_FORMAT_ID, 0x02],
  [CellFlag.DURATION_FORMAT_ID, 0x04],
  [CellFlag.DATE_FORMAT_ID, 0x08],
  [CellFlag.BOOL_FORMAT_ID, 0x20],
  [CellFlag.STRING_ID, 0x80],
]);

const HEADER_SIZE = 12;
const STORAGE_VERSION = 5;

/** The canonical 12-byte empty record Apple writes for a cell with no value. */
export const EMPTY_RECORD: Uint8Array = new Uint8Array(HEADER_SIZE).fill(0);
EMPTY_RECORD[0] = STORAGE_VERSION;

/**
 * A decoded record: the type byte plus each present field's raw payload,
 * keyed by flag. Keeping payloads as bytes rather than decoded values is
 * deliberate — a field we do not interpret still round-trips exactly.
 */
export class CellRecord {
  type: number;
  /** Bytes 2-5: zero in every file examined, but preserved anyway. */
  reserved: Uint8Array;
  /** Bytes 6-7: the extras bitfield (see {@link EXTRAS_BY_FLAG}). */
  extras: number;
  private fields = new Map<number, Uint8Array>();

  constructor(type: number = CellType.EMPTY) {
    this.type = type;
    this.reserved = new Uint8Array(4);
    this.extras = 0;
  }

  static decode(record: Uint8Array): CellRecord {
    if (record.length < HEADER_SIZE) return new CellRecord(CellType.EMPTY);
    if (record[0] !== STORAGE_VERSION) {
      throw new RangeError(`cell storage version ${record[0]} not supported (expected 5)`);
    }
    const out = new CellRecord(record[1]!);
    out.reserved = record.slice(2, 6);
    out.extras = record[6]! | (record[7]! << 8);
    const view = new DataView(record.buffer, record.byteOffset, record.byteLength);
    const flags = view.getUint32(8, true);
    let pos = HEADER_SIZE;
    for (const [flag, size] of FLAG_SIZES) {
      if ((flags & flag) === 0) continue;
      // Trailing ids are occasionally truncated in the wild; stop rather
      // than read past the record and invent a value.
      if (pos + size > record.length) break;
      out.fields.set(flag, record.slice(pos, pos + size));
      pos += size;
    }
    return out;
  }

  has(flag: number): boolean {
    return this.fields.has(flag);
  }

  get flags(): number {
    let flags = 0;
    for (const flag of this.fields.keys()) flags |= flag;
    return flags >>> 0;
  }

  raw(flag: number): Uint8Array | undefined {
    return this.fields.get(flag);
  }

  /** Read a 4-byte id field. */
  id(flag: number): number | undefined {
    const b = this.fields.get(flag);
    if (!b || b.length !== 4) return undefined;
    return new DataView(b.buffer, b.byteOffset, 4).getUint32(0, true);
  }

  setId(flag: number, value: number): void {
    const b = new Uint8Array(4);
    new DataView(b.buffer).setUint32(0, value >>> 0, true);
    this.fields.set(flag, b);
    this.syncExtras(flag, true);
  }

  double(flag: number): number | undefined {
    const b = this.fields.get(flag);
    if (!b || b.length !== 8) return undefined;
    return new DataView(b.buffer, b.byteOffset, 8).getFloat64(0, true);
  }

  setDouble(flag: number, value: number): void {
    const b = new Uint8Array(8);
    new DataView(b.buffer).setFloat64(0, value, true);
    this.fields.set(flag, b);
  }

  setDecimal128(value: number): void {
    this.fields.set(CellFlag.DECIMAL128, encodeDecimal128(value));
  }

  remove(flag: number): void {
    if (this.fields.delete(flag)) this.syncExtras(flag, false);
  }

  /** Drop every flag in a mask. */
  removeAll(mask: number): void {
    for (const [flag] of FLAG_SIZES) {
      if ((mask & flag) !== 0) this.remove(flag);
    }
  }

  /** Keep bytes 6-7 consistent with which format ids are present. */
  private syncExtras(flag: number, present: boolean): void {
    const bit = EXTRAS_BY_FLAG.get(flag);
    if (bit === undefined) return;
    this.extras = (present ? this.extras | bit : this.extras & ~bit) & 0xffff;
  }

  encode(): Uint8Array {
    const w = new ByteWriter(HEADER_SIZE + 32);
    w.byte(STORAGE_VERSION);
    w.byte(this.type & 0xff);
    w.bytes(this.reserved.length === 4 ? this.reserved : new Uint8Array(4));
    w.u16le(this.extras & 0xffff);
    w.u32le(this.flags);
    for (const [flag, size] of FLAG_SIZES) {
      const payload = this.fields.get(flag);
      if (!payload) continue;
      w.bytes(payload.length === size ? payload : padTo(payload, size));
    }
    return w.toBytes();
  }
}

function padTo(b: Uint8Array, size: number): Uint8Array {
  const out = new Uint8Array(size);
  out.set(b.subarray(0, size));
  return out;
}

const DECIMAL128_BIAS = 0x1820;

/**
 * Encode a JS number as IEEE 754-2008 decimal128 (binary significand).
 *
 * The significand is derived from the shortest decimal string that
 * round-trips the double, so 0.1 stores as 1×10⁻¹ rather than the binary
 * approximation — which is the whole reason Numbers uses decimal128, and
 * what stops a written 0.1 from displaying as 0.1000000000000000055511151.
 */
export function encodeDecimal128(value: number): Uint8Array {
  const out = new Uint8Array(16);
  if (!Number.isFinite(value)) return out;
  const negative = value < 0 || Object.is(value, -0);
  const text = Math.abs(value).toExponential();
  const [mantissaText, exponentText] = text.split("e");
  const [intPart, fracPart = ""] = mantissaText!.split(".");
  let digits = `${intPart}${fracPart}`;
  let exponent = Number.parseInt(exponentText!, 10) - fracPart.length;

  // Trailing zeros can move into the exponent, keeping the significand small.
  while (digits.length > 1 && digits.endsWith("0")) {
    digits = digits.slice(0, -1);
    exponent += 1;
  }
  let mantissa = BigInt(digits);

  // decimal128 holds a 113-bit significand and a biased exponent in
  // 0..12287; clamp by shedding low-order digits rather than emitting a
  // number the apps would reject.
  const MAX_MANTISSA = (1n << 113n) - 1n;
  while (mantissa > MAX_MANTISSA) {
    mantissa /= 10n;
    exponent += 1;
  }
  let biased = exponent + DECIMAL128_BIAS;
  while (biased > 0x2fff && mantissa > 0n) {
    mantissa *= 10n;
    biased -= 1;
  }
  while (biased < 0 && mantissa > 0n) {
    mantissa /= 10n;
    biased += 1;
  }
  if (biased < 0) biased = 0;

  let rest = mantissa;
  for (let i = 0; i < 14; i++) {
    out[i] = Number(rest & 0xffn);
    rest >>= 8n;
  }
  out[14] = Number(rest & 1n) | ((biased & 0x7f) << 1);
  out[15] = ((biased >> 7) & 0x7f) | (negative ? 0x80 : 0);
  return out;
}
