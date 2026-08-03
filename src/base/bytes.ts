/**
 * Small byte-level utilities and shared constants for the whole library.
 * Zero dependencies; works in Node and browsers.
 */

/**
 * Apple's reference date, 2001-01-01T00:00:00Z. Timestamps throughout the
 * format — cell dates, comment dates, plist dates — are seconds from this
 * epoch, not Unix's.
 */
export const APPLE_EPOCH_MS = Date.UTC(2001, 0, 1);
export const APPLE_EPOCH_SECONDS = APPLE_EPOCH_MS / 1000;

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder("utf-8");

export function utf8Encode(s: string): Uint8Array {
  return textEncoder.encode(s);
}

export function utf8Decode(b: Uint8Array): string {
  return textDecoder.decode(b);
}

export function concatBytes(chunks: readonly Uint8Array[]): Uint8Array {
  let total = 0;
  for (const c of chunks) total += c.length;
  const out = new Uint8Array(total);
  let pos = 0;
  for (const c of chunks) {
    out.set(c, pos);
    pos += c.length;
  }
  return out;
}

export function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

/** Growable little-endian byte sink. */
export class ByteWriter {
  private buf: Uint8Array;
  private len = 0;

  constructor(initialCapacity = 256) {
    this.buf = new Uint8Array(initialCapacity);
  }

  get length(): number {
    return this.len;
  }

  private ensure(extra: number): void {
    const need = this.len + extra;
    if (need <= this.buf.length) return;
    let cap = Math.max(this.buf.length * 2, 16);
    while (cap < need) cap *= 2;
    const next = new Uint8Array(cap);
    next.set(this.buf.subarray(0, this.len));
    this.buf = next;
  }

  byte(b: number): void {
    this.ensure(1);
    this.buf[this.len++] = b & 0xff;
  }

  bytes(b: Uint8Array): void {
    this.ensure(b.length);
    this.buf.set(b, this.len);
    this.len += b.length;
  }

  u16le(v: number): void {
    this.ensure(2);
    this.buf[this.len++] = v & 0xff;
    this.buf[this.len++] = (v >>> 8) & 0xff;
  }

  u32le(v: number): void {
    this.ensure(4);
    this.buf[this.len++] = v & 0xff;
    this.buf[this.len++] = (v >>> 8) & 0xff;
    this.buf[this.len++] = (v >>> 16) & 0xff;
    this.buf[this.len++] = (v >>> 24) & 0xff;
  }

  u64le(v: bigint): void {
    this.ensure(8);
    let x = BigInt.asUintN(64, v);
    for (let i = 0; i < 8; i++) {
      this.buf[this.len++] = Number(x & 0xffn);
      x >>= 8n;
    }
  }

  /** Copy of the written bytes. */
  toBytes(): Uint8Array {
    return this.buf.slice(0, this.len);
  }
}

export function readU16le(b: Uint8Array, pos: number): number {
  return b[pos]! | (b[pos + 1]! << 8);
}

export function readU32le(b: Uint8Array, pos: number): number {
  return (b[pos]! | (b[pos + 1]! << 8) | (b[pos + 2]! << 16) | (b[pos + 3]! << 24)) >>> 0;
}

export function readU64le(b: Uint8Array, pos: number): bigint {
  let v = 0n;
  for (let i = 7; i >= 0; i--) v = (v << 8n) | BigInt(b[pos + i]!);
  return v;
}
