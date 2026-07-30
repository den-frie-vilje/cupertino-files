/**
 * Snappy block-format codec, plus the Apple IWA chunk framing.
 *
 * iWork's `.iwa` files are Snappy-compressed protobuf streams, but Apple does
 * NOT use the standard Snappy framing format: there is no `sNaPpY` stream
 * identifier and no CRC-32C masking. Instead each chunk is:
 *
 *   byte 0    : chunk type (always 0x00 = Snappy-compressed data)
 *   bytes 1-3 : 24-bit little-endian length N of the chunk payload
 *   bytes 4.. : N bytes of a standalone Snappy *block* (which itself starts
 *               with a varint uncompressed-length header)
 *
 * The decompressed chunks are concatenated to form the archive stream.
 * Copy back-references never cross chunk boundaries because each chunk is an
 * independent Snappy block.
 */
import { readUvarintNumber } from "./varint.ts";
import { ByteWriter, concatBytes } from "./bytes.ts";

/** Decompress a single raw Snappy block (varint length header + tags). */
export function snappyUncompressBlock(input: Uint8Array): Uint8Array {
  const { value: outLen, next } = readUvarintNumber(input, 0);
  const out = new Uint8Array(outLen);
  let ip = next;
  let op = 0;
  const inLen = input.length;

  while (ip < inLen) {
    const tag = input[ip++]!;
    const kind = tag & 3;
    if (kind === 0) {
      // Literal run.
      let litLen = tag >>> 2;
      if (litLen >= 60) {
        const extra = litLen - 59; // 1..4 bytes of little-endian length
        if (ip + extra > inLen) throw new RangeError("snappy: truncated literal length");
        litLen = 0;
        for (let i = 0; i < extra; i++) litLen |= input[ip + i]! << (8 * i);
        litLen = litLen >>> 0;
        ip += extra;
      }
      litLen += 1;
      if (ip + litLen > inLen) throw new RangeError("snappy: truncated literal");
      if (op + litLen > outLen) throw new RangeError("snappy: output overflow (literal)");
      out.set(input.subarray(ip, ip + litLen), op);
      ip += litLen;
      op += litLen;
      continue;
    }

    let len: number;
    let offset: number;
    if (kind === 1) {
      // Copy with 1-byte offset extension: length 4..11, offset 11 bits.
      len = ((tag >>> 2) & 0x7) + 4;
      if (ip >= inLen) throw new RangeError("snappy: truncated copy-1");
      offset = ((tag >>> 5) << 8) | input[ip]!;
      ip += 1;
    } else if (kind === 2) {
      // Copy with 2-byte little-endian offset: length 1..64.
      len = (tag >>> 2) + 1;
      if (ip + 2 > inLen) throw new RangeError("snappy: truncated copy-2");
      offset = input[ip]! | (input[ip + 1]! << 8);
      ip += 2;
    } else {
      // Copy with 4-byte little-endian offset: length 1..64.
      len = (tag >>> 2) + 1;
      if (ip + 4 > inLen) throw new RangeError("snappy: truncated copy-4");
      offset =
        (input[ip]! | (input[ip + 1]! << 8) | (input[ip + 2]! << 16) | (input[ip + 3]! << 24)) >>>
        0;
      ip += 4;
    }

    if (offset === 0 || offset > op) throw new RangeError("snappy: invalid copy offset");
    if (op + len > outLen) throw new RangeError("snappy: output overflow (copy)");
    // Copies may overlap (offset < len) — must copy byte-by-byte.
    let from = op - offset;
    for (let i = 0; i < len; i++) out[op++] = out[from++]!;
  }

  if (op !== outLen) {
    throw new RangeError(`snappy: expected ${outLen} bytes, produced ${op}`);
  }
  return out;
}

const HASH_BITS = 14;
const HASH_TABLE_SIZE = 1 << HASH_BITS;
const MAX_COPY_OFFSET = 0xffff; // we only emit copy-2 tags

function hash4(v: number): number {
  return (Math.imul(v, 0x1e35a7bd) >>> (32 - HASH_BITS)) & (HASH_TABLE_SIZE - 1);
}

function load32(b: Uint8Array, i: number): number {
  return (b[i]! | (b[i + 1]! << 8) | (b[i + 2]! << 16) | (b[i + 3]! << 24)) >>> 0;
}

function emitLiteral(w: ByteWriter, src: Uint8Array, from: number, to: number): void {
  let len = to - from;
  if (len <= 0) return;
  const n = len - 1;
  if (n < 60) {
    w.byte(n << 2);
  } else if (n < 0x100) {
    w.byte(60 << 2);
    w.byte(n);
  } else if (n < 0x10000) {
    w.byte(61 << 2);
    w.byte(n & 0xff);
    w.byte((n >>> 8) & 0xff);
  } else if (n < 0x1000000) {
    w.byte(62 << 2);
    w.byte(n & 0xff);
    w.byte((n >>> 8) & 0xff);
    w.byte((n >>> 16) & 0xff);
  } else {
    w.byte(63 << 2);
    w.byte(n & 0xff);
    w.byte((n >>> 8) & 0xff);
    w.byte((n >>> 16) & 0xff);
    w.byte((n >>> 24) & 0xff);
  }
  w.bytes(src.subarray(from, to));
}

function emitCopy(w: ByteWriter, offset: number, len: number): void {
  // Emit copy-2 tags (1..64 bytes each); chunk longer matches.
  while (len > 0) {
    const chunk = Math.min(len, 64);
    // Avoid leaving a tail shorter than 4 when possible (matches snappy's
    // reference encoder and keeps tags efficient); any length 1..64 is legal.
    let emit = chunk;
    if (len > 64 && len - 64 < 4) emit = 60;
    w.byte(((emit - 1) << 2) | 2);
    w.byte(offset & 0xff);
    w.byte((offset >>> 8) & 0xff);
    len -= emit;
  }
}

/**
 * Compress a buffer into a single raw Snappy block (greedy hash matcher,
 * copy-2 tags only). Output decodes with any conformant Snappy decoder.
 */
export function snappyCompressBlock(input: Uint8Array): Uint8Array {
  const n = input.length;
  const w = new ByteWriter(64 + n + (n >>> 2));
  // Varint uncompressed length header.
  let x = n;
  while (x >= 0x80) {
    w.byte((x & 0x7f) | 0x80);
    x >>>= 7;
  }
  w.byte(x);

  if (n < 4) {
    emitLiteral(w, input, 0, n);
    return w.toBytes();
  }

  const table = new Int32Array(HASH_TABLE_SIZE).fill(-1);
  let ip = 0;
  let litStart = 0;
  const ipLimit = n - 4;

  while (ip <= ipLimit) {
    let skip = 32;
    let candidate = -1;
    let cur = load32(input, ip);
    // Find a match, skipping faster through incompressible regions.
    for (;;) {
      const h = hash4(cur);
      candidate = table[h]!;
      table[h] = ip;
      if (
        candidate >= 0 &&
        ip - candidate <= MAX_COPY_OFFSET &&
        load32(input, candidate) === cur
      ) {
        break;
      }
      const bytesBetween = skip >>> 5;
      skip++;
      ip += bytesBetween;
      if (ip > ipLimit) {
        candidate = -1;
        break;
      }
      cur = load32(input, ip);
    }
    if (candidate < 0) break;

    emitLiteral(w, input, litStart, ip);

    // Extend the match forward.
    let matched = 4;
    while (ip + matched < n && input[ip + matched] === input[candidate + matched]) matched++;
    emitCopy(w, ip - candidate, matched);
    ip += matched;
    litStart = ip;

    if (ip <= ipLimit) {
      // Refresh the hash for the position just before the new cursor to help
      // find adjacent matches (cheap approximation of the reference encoder).
      const h = hash4(load32(input, ip - 1));
      table[h] = ip - 1;
    }
  }

  emitLiteral(w, input, litStart, n);
  return w.toBytes();
}

/** Default uncompressed chunk size used when writing IWA data (Apple uses ≤64 KiB). */
export const IWA_CHUNK_SIZE = 0x10000;

/**
 * Compression framing of an `.iwa` component, identified from its first
 * bytes. Not every component in a package uses Snappy: collaboration-mode
 * documents write `Index/OperationStorage.iwa` as an Apple **LZFSE**
 * container (`bvx*` magic), alongside normally-framed components in the
 * same package.
 */
export type IwaFraming = "snappy" | "lzfse" | "unknown";

/** LZFSE/LZVN container magics: "bvxn", "bvx1", "bvx2", "bvx-", "bvx$". */
function isLzfseMagic(data: Uint8Array): boolean {
  return (
    data.length >= 4 &&
    data[0] === 0x62 && // 'b'
    data[1] === 0x76 && // 'v'
    data[2] === 0x78 && // 'x'
    (data[3] === 0x6e || data[3] === 0x31 || data[3] === 0x32 || data[3] === 0x2d || data[3] === 0x24)
  );
}

/** Identify a component's framing without decoding it. */
export function detectIwaFraming(data: Uint8Array): IwaFraming {
  if (data.length === 0) return "unknown";
  if (isLzfseMagic(data)) return "lzfse";
  return data[0] === 0x00 ? "snappy" : "unknown";
}

/** Raised when a component's framing is not the Snappy chunking we decode. */
export class UnsupportedIwaFramingError extends Error {
  readonly framing: IwaFraming;

  constructor(framing: IwaFraming, detail: string) {
    super(
      framing === "lzfse"
        ? `iwa: component uses Apple LZFSE framing (bvx* magic), not Snappy — ${detail}`
        : `iwa: unrecognized component framing — ${detail}`,
    );
    this.name = "UnsupportedIwaFramingError";
    this.framing = framing;
  }
}

/** Decode a whole `.iwa` file body (sequence of framed Snappy chunks). */
export function decodeIwaData(data: Uint8Array): Uint8Array {
  const framing = detectIwaFraming(data);
  if (framing !== "snappy") {
    throw new UnsupportedIwaFramingError(
      framing,
      `first bytes ${[...data.slice(0, 4)].map((b) => b.toString(16).padStart(2, "0")).join(" ")}`,
    );
  }
  const chunks: Uint8Array[] = [];
  let pos = 0;
  while (pos < data.length) {
    if (pos + 4 > data.length) throw new RangeError("iwa: truncated chunk header");
    const type = data[pos]!;
    if (type !== 0x00) {
      throw new RangeError(`iwa: unsupported chunk type 0x${type.toString(16)} at offset ${pos}`);
    }
    const len = data[pos + 1]! | (data[pos + 2]! << 8) | (data[pos + 3]! << 16);
    pos += 4;
    if (pos + len > data.length) throw new RangeError("iwa: truncated chunk payload");
    chunks.push(snappyUncompressBlock(data.subarray(pos, pos + len)));
    pos += len;
  }
  return concatBytes(chunks);
}

/** Encode an archive stream as framed Snappy chunks (inverse of {@link decodeIwaData}). */
export function encodeIwaData(raw: Uint8Array, chunkSize: number = IWA_CHUNK_SIZE): Uint8Array {
  const w = new ByteWriter(raw.length >>> 1);
  let pos = 0;
  // Always emit at least one chunk, even for empty input.
  do {
    const end = Math.min(pos + chunkSize, raw.length);
    const block = snappyCompressBlock(raw.subarray(pos, end));
    if (block.length > 0xffffff) throw new RangeError("iwa: chunk payload too large");
    w.byte(0x00);
    w.byte(block.length & 0xff);
    w.byte((block.length >>> 8) & 0xff);
    w.byte((block.length >>> 16) & 0xff);
    w.bytes(block);
    pos = end;
  } while (pos < raw.length);
  return w.toBytes();
}
