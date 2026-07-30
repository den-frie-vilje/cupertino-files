/**
 * Raw DEFLATE (RFC 1951) decompressor in pure TypeScript.
 *
 * Needed to read ZIP entries that use method 8 (deflate). Implements stored,
 * fixed-Huffman and dynamic-Huffman blocks using the canonical bit-at-a-time
 * table walk (the approach of zlib's `puff`).
 */

const MAXBITS = 15;

const LENGTH_BASE = [
  3, 4, 5, 6, 7, 8, 9, 10, 11, 13, 15, 17, 19, 23, 27, 31, 35, 43, 51, 59, 67, 83, 99, 115, 131,
  163, 195, 227, 258,
];
const LENGTH_EXTRA = [
  0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 0,
];
const DIST_BASE = [
  1, 2, 3, 4, 5, 7, 9, 13, 17, 25, 33, 49, 65, 97, 129, 193, 257, 385, 513, 769, 1025, 1537, 2049,
  3073, 4097, 6145, 8193, 12289, 16385, 24577,
];
const DIST_EXTRA = [
  0, 0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10, 11, 11, 12, 12, 13, 13,
];
const CLEN_ORDER = [16, 17, 18, 0, 8, 7, 9, 6, 10, 5, 11, 4, 12, 3, 13, 2, 14, 1, 15];

interface Huffman {
  count: Uint16Array; // count[len] = number of codes with that bit length
  symbol: Uint16Array; // symbols ordered by (length, symbol)
}

function buildHuffman(lengths: Uint8Array | number[], n: number): Huffman {
  const count = new Uint16Array(MAXBITS + 1);
  for (let i = 0; i < n; i++) count[lengths[i]!]!++;
  if (count[0] === n) {
    // No codes at all — legal for an unused distance table.
    return { count, symbol: new Uint16Array(0) };
  }
  // Check for an over-subscribed or incomplete set (incomplete is tolerated).
  let left = 1;
  for (let len = 1; len <= MAXBITS; len++) {
    left <<= 1;
    left -= count[len]!;
    if (left < 0) throw new RangeError("inflate: over-subscribed Huffman code");
  }
  const offs = new Uint16Array(MAXBITS + 1);
  for (let len = 1; len < MAXBITS; len++) offs[len + 1] = offs[len]! + count[len]!;
  const symbol = new Uint16Array(n);
  for (let sym = 0; sym < n; sym++) {
    const l = lengths[sym]!;
    if (l !== 0) symbol[offs[l]!++] = sym;
  }
  return { count, symbol };
}

class Inflator {
  private pos = 0;
  private bitbuf = 0;
  private bitcnt = 0;
  private out: Uint8Array;
  private outLen = 0;

  private readonly input: Uint8Array;

  constructor(input: Uint8Array, expectedSize?: number) {
    this.input = input;
    this.out = new Uint8Array(expectedSize && expectedSize > 0 ? expectedSize : 4096);
  }

  private bits(need: number): number {
    let val = this.bitbuf;
    while (this.bitcnt < need) {
      const b = this.input[this.pos];
      if (b === undefined) throw new RangeError("inflate: unexpected end of input");
      this.pos++;
      val |= b << this.bitcnt;
      this.bitcnt += 8;
    }
    this.bitbuf = val >>> need;
    this.bitcnt -= need;
    return val & ((1 << need) - 1);
  }

  private ensureOut(extra: number): void {
    const need = this.outLen + extra;
    if (need <= this.out.length) return;
    let cap = this.out.length * 2;
    while (cap < need) cap *= 2;
    const next = new Uint8Array(cap);
    next.set(this.out.subarray(0, this.outLen));
    this.out = next;
  }

  private decode(h: Huffman): number {
    let code = 0;
    let first = 0;
    let index = 0;
    for (let len = 1; len <= MAXBITS; len++) {
      code |= this.bits(1);
      const count = h.count[len]!;
      if (code - count < first) return h.symbol[index + (code - first)]!;
      index += count;
      first += count;
      first <<= 1;
      code <<= 1;
    }
    throw new RangeError("inflate: invalid Huffman code");
  }

  private stored(): void {
    // Discard partial bits; length is byte-aligned.
    this.bitbuf = 0;
    this.bitcnt = 0;
    if (this.pos + 4 > this.input.length) throw new RangeError("inflate: truncated stored block");
    const len = this.input[this.pos]! | (this.input[this.pos + 1]! << 8);
    const nlen = this.input[this.pos + 2]! | (this.input[this.pos + 3]! << 8);
    if ((len ^ 0xffff) !== nlen) throw new RangeError("inflate: stored block length mismatch");
    this.pos += 4;
    if (this.pos + len > this.input.length) throw new RangeError("inflate: truncated stored data");
    this.ensureOut(len);
    this.out.set(this.input.subarray(this.pos, this.pos + len), this.outLen);
    this.pos += len;
    this.outLen += len;
  }

  private codes(litlen: Huffman, dist: Huffman): void {
    for (;;) {
      let sym = this.decode(litlen);
      if (sym < 256) {
        this.ensureOut(1);
        this.out[this.outLen++] = sym;
        continue;
      }
      if (sym === 256) return; // end of block
      sym -= 257;
      if (sym >= LENGTH_BASE.length) throw new RangeError("inflate: invalid length symbol");
      const len = LENGTH_BASE[sym]! + this.bits(LENGTH_EXTRA[sym]!);
      const dsym = this.decode(dist);
      if (dsym >= DIST_BASE.length) throw new RangeError("inflate: invalid distance symbol");
      const distv = DIST_BASE[dsym]! + this.bits(DIST_EXTRA[dsym]!);
      if (distv > this.outLen) throw new RangeError("inflate: distance too far back");
      this.ensureOut(len);
      let from = this.outLen - distv;
      for (let i = 0; i < len; i++) this.out[this.outLen++] = this.out[from++]!;
    }
  }

  private static fixedLit: Huffman | undefined;
  private static fixedDist: Huffman | undefined;

  private fixed(): [Huffman, Huffman] {
    if (!Inflator.fixedLit) {
      const litLengths = new Uint8Array(288);
      let i = 0;
      for (; i < 144; i++) litLengths[i] = 8;
      for (; i < 256; i++) litLengths[i] = 9;
      for (; i < 280; i++) litLengths[i] = 7;
      for (; i < 288; i++) litLengths[i] = 8;
      Inflator.fixedLit = buildHuffman(litLengths, 288);
      const distLengths = new Uint8Array(30).fill(5);
      Inflator.fixedDist = buildHuffman(distLengths, 30);
    }
    return [Inflator.fixedLit, Inflator.fixedDist!];
  }

  private dynamic(): [Huffman, Huffman] {
    const nlen = this.bits(5) + 257;
    const ndist = this.bits(5) + 1;
    const ncode = this.bits(4) + 4;
    if (nlen > 286 || ndist > 30) throw new RangeError("inflate: bad counts in dynamic block");

    const clenLengths = new Uint8Array(19);
    for (let i = 0; i < ncode; i++) clenLengths[CLEN_ORDER[i]!] = this.bits(3);
    const clen = buildHuffman(clenLengths, 19);

    const lengths = new Uint8Array(nlen + ndist);
    let index = 0;
    while (index < nlen + ndist) {
      const sym = this.decode(clen);
      if (sym < 16) {
        lengths[index++] = sym;
      } else {
        let repeat: number;
        let value = 0;
        if (sym === 16) {
          if (index === 0) throw new RangeError("inflate: repeat with no previous length");
          value = lengths[index - 1]!;
          repeat = 3 + this.bits(2);
        } else if (sym === 17) {
          repeat = 3 + this.bits(3);
        } else {
          repeat = 11 + this.bits(7);
        }
        if (index + repeat > nlen + ndist) throw new RangeError("inflate: repeat overflow");
        while (repeat-- > 0) lengths[index++] = value;
      }
    }
    if (lengths[256] === 0) throw new RangeError("inflate: missing end-of-block code");
    const litlen = buildHuffman(lengths, nlen);
    const dist = buildHuffman(lengths.subarray(nlen), ndist);
    return [litlen, dist];
  }

  run(): Uint8Array {
    let final = 0;
    do {
      final = this.bits(1);
      const type = this.bits(2);
      if (type === 0) {
        this.stored();
      } else if (type === 1 || type === 2) {
        const [litlen, dist] = type === 1 ? this.fixed() : this.dynamic();
        this.codes(litlen, dist);
      } else {
        throw new RangeError("inflate: invalid block type 3");
      }
    } while (!final);
    return this.out.slice(0, this.outLen);
  }
}

/** Decompress a raw DEFLATE stream (no zlib/gzip wrapper). */
export function inflateRaw(input: Uint8Array, expectedSize?: number): Uint8Array {
  return new Inflator(input, expectedSize).run();
}
