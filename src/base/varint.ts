/**
 * Protobuf base-128 varints (LEB128), used both by protobuf wire data and by
 * the Snappy block header and IWA archive framing.
 */
import type { ByteWriter } from "./bytes.ts";

export interface VarintResult {
  value: bigint;
  /** Offset of the first byte after the varint. */
  next: number;
}

/** Read an unsigned varint (up to 64 bits) as a bigint. */
export function readUvarint(buf: Uint8Array, pos: number): VarintResult {
  // Fast path: values fitting in 4 bytes (28 bits) avoid BigInt arithmetic.
  let b = buf[pos];
  if (b === undefined) throw new RangeError("varint: unexpected end of input");
  if ((b & 0x80) === 0) return { value: BigInt(b), next: pos + 1 };

  let shift = 0;
  let low = 0;
  let p = pos;
  while (shift < 28) {
    b = buf[p];
    if (b === undefined) throw new RangeError("varint: unexpected end of input");
    p++;
    low |= (b & 0x7f) << shift;
    if ((b & 0x80) === 0) return { value: BigInt(low >>> 0), next: p };
    shift += 7;
  }
  // Slow path for values >= 2^28.
  let value = BigInt(low >>> 0);
  let bshift = 28n;
  for (let i = 0; i < 6; i++) {
    b = buf[p];
    if (b === undefined) throw new RangeError("varint: unexpected end of input");
    p++;
    value |= BigInt(b & 0x7f) << bshift;
    if ((b & 0x80) === 0) return { value: BigInt.asUintN(64, value), next: p };
    bshift += 7n;
  }
  throw new RangeError("varint: too long (more than 10 bytes)");
}

/** Read an unsigned varint expected to fit a JS number (< 2^53). */
export function readUvarintNumber(buf: Uint8Array, pos: number): { value: number; next: number } {
  const { value, next } = readUvarint(buf, pos);
  if (value > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new RangeError(`varint: value ${value} exceeds MAX_SAFE_INTEGER`);
  }
  return { value: Number(value), next };
}

export function writeUvarint(w: ByteWriter, v: bigint | number): void {
  let x = typeof v === "bigint" ? BigInt.asUintN(64, v) : BigInt(v);
  if (x < 0n) throw new RangeError("varint: negative value");
  while (x >= 0x80n) {
    w.byte(Number(x & 0x7fn) | 0x80);
    x >>= 7n;
  }
  w.byte(Number(x));
}

export function uvarintLength(v: bigint | number): number {
  let x = typeof v === "bigint" ? BigInt.asUintN(64, v) : BigInt(v);
  let n = 1;
  while (x >= 0x80n) {
    x >>= 7n;
    n++;
  }
  return n;
}

/** ZigZag encoding used by protobuf sint32/sint64 fields. */
export function zigzagDecode(v: bigint): bigint {
  return (v >> 1n) ^ -(v & 1n);
}

export function zigzagEncode(v: bigint): bigint {
  return BigInt.asUintN(64, (v << 1n) ^ (v >> 63n));
}
