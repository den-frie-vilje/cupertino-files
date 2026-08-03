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

/**
 * The compressor below is a byte-exact port of google/snappy's reference
 * `CompressFragment` (the classic form, snappy ≤ 1.1.8) — not merely a
 * valid Snappy encoder but *the* encoder, reproducing its output bit for
 * bit: the same hash-table sizing, the same zero-initialized table with no
 * sentinel (a spurious candidate at position 0 is checked by comparing
 * bytes, exactly as upstream does), the same `skip++ >> 5` scan
 * acceleration, the same copy-1/copy-2 tag choices and 64/60-byte long-copy
 * chunking, and the same post-copy double table seeding.
 *
 * Byte-exactness is not pedantry here. Apple links stock snappy, so
 * matching it makes a re-compressed component identical to what the app
 * would have written — which is what lets a saved document be compared to
 * Apple's own bytes at the component level rather than only after
 * decompression.
 */
const MAX_HASH_TABLE_SIZE = 1 << 14;

function load32(b: Uint8Array, i: number): number {
  return (b[i]! | (b[i + 1]! << 8) | (b[i + 2]! << 16) | (b[i + 3]! << 24)) >>> 0;
}

function hashBytes(v: number, shift: number): number {
  return Math.imul(v, 0x1e35a7bd) >>> shift;
}

/** Literal tag + length bytes + payload, as EmitLiteral writes them. */
function emitLiteral(w: ByteWriter, src: Uint8Array, from: number, to: number): void {
  const len = to - from;
  if (len <= 0) return;
  let n = len - 1;
  if (n < 60) {
    w.byte(n << 2);
  } else {
    // Length bytes, little-endian, as many as needed; tag encodes the count.
    let count = 0;
    const lengthBytes: number[] = [];
    while (n > 0) {
      lengthBytes.push(n & 0xff);
      n >>>= 8;
      count++;
    }
    w.byte((59 + count) << 2);
    for (const b of lengthBytes) w.byte(b);
  }
  w.bytes(src.subarray(from, to));
}

/** One copy tag for len ≤ 64: copy-1 when it fits, copy-2 otherwise. */
function emitCopyAtMost64(w: ByteWriter, offset: number, len: number): void {
  if (len < 12 && offset < 2048) {
    w.byte(1 + ((len - 4) << 2) + ((offset >>> 8) << 5));
    w.byte(offset & 0xff);
  } else {
    w.byte(2 + ((len - 1) << 2));
    w.byte(offset & 0xff);
    w.byte((offset >>> 8) & 0xff);
  }
}

function emitCopy(w: ByteWriter, offset: number, len: number): void {
  // Long matches: 64-byte tags while ≥ 68 remain, then a 60-byte tag if
  // needed, so the final tag never carries fewer than 4 bytes.
  while (len >= 68) {
    emitCopyAtMost64(w, offset, 64);
    len -= 64;
  }
  if (len > 64) {
    emitCopyAtMost64(w, offset, 60);
    len -= 60;
  }
  emitCopyAtMost64(w, offset, len);
}

/**
 * Compress one fragment (≤ 64 KiB) exactly as snappy's CompressFragment.
 *
 * Structured line-for-line against the C++ so the two can be read side by
 * side; the labels in comments are upstream's.
 */
function compressFragment(w: ByteWriter, input: Uint8Array): void {
  const n = input.length;
  // Smallest power of two covering the input, in [256, 16384].
  let tableSize = 256;
  while (tableSize < MAX_HASH_TABLE_SIZE && tableSize < n) tableSize <<= 1;
  const shift = 32 - 31 + Math.clz32(tableSize); // 32 - log2(tableSize)
  const table = new Uint16Array(tableSize);

  let nextEmit = 0;
  const INPUT_MARGIN = 15;
  let ip = 0;

  if (n >= INPUT_MARGIN) {
    const ipLimit = n - INPUT_MARGIN;
    outer: for (let nextHash = hashBytes(load32(input, ++ip), shift); ; ) {
      // Step 1: scan for a 4-byte match, accelerating through
      // incompressible regions: after 32 probes without a match, look at
      // every other byte; after 32 more, every third; and so on.
      let skip = 32;
      let nextIp = ip;
      let candidate: number;
      do {
        ip = nextIp;
        const hash = nextHash;
        const bytesBetweenHashLookups = skip++ >>> 5;
        nextIp = ip + bytesBetweenHashLookups;
        if (nextIp > ipLimit) break outer;
        nextHash = hashBytes(load32(input, nextIp), shift);
        candidate = table[hash]!;
        table[hash] = ip;
      } while (load32(input, ip) !== load32(input, candidate));

      // Step 2: emit the unmatched bytes before the match as a literal.
      emitLiteral(w, input, nextEmit, ip);

      // Step 3: emit the copy, then keep emitting copies for as long as
      // the position right after each match immediately matches again.
      for (;;) {
        const base = ip;
        let matched = 4;
        while (ip + matched < n && input[ip + matched] === input[candidate + matched]) matched++;
        ip += matched;
        emitCopy(w, base - candidate, matched);
        nextEmit = ip;
        if (ip >= ipLimit) break outer;
        // Seed the table for ip - 1 as well as ip before probing — the
        // one-position lookbehind is upstream's density trick, and skipping
        // it changes which candidate the next probe finds.
        table[hashBytes(load32(input, ip - 1), shift)] = ip - 1;
        const data = load32(input, ip);
        const curHash = hashBytes(data, shift);
        candidate = table[curHash]!;
        table[curHash] = ip;
        if (data !== load32(input, candidate)) break;
      }

      nextHash = hashBytes(load32(input, ++ip), shift);
    }
  }

  // emit_remainder: everything scanned past the last emit is one literal.
  if (nextEmit < n) emitLiteral(w, input, nextEmit, n);
}

/**
 * `CompressFragment` as rewritten in snappy 1.1.9 (2020) — the vintage
 * current Apple apps link. Three visible differences from the classic
 * form: each restart begins with an unrolled probe of the next 16
 * positions at every-byte granularity; the scan accelerator grows
 * geometrically (`skip += skip >> 5`) instead of linearly; and the hash
 * for a smaller-than-maximum table selects bits just above the 2-byte
 * entry stride rather than the top bits, so sub-16 KiB inputs hash
 * differently even though full-size tables coincide.
 */
function compressFragmentModern(w: ByteWriter, input: Uint8Array): void {
  const n = input.length;
  let tableSize = 256;
  while (tableSize < MAX_HASH_TABLE_SIZE && tableSize < n) tableSize <<= 1;
  const indexMask = tableSize - 1;
  // (hash15 & 2(ts-1)) >> 1 as upstream byte-addresses it, folded to an index.
  const tableIndex = (v: number): number => (Math.imul(v, 0x1e35a7bd) >>> 18) & indexMask;
  const table = new Uint16Array(tableSize);

  const INPUT_MARGIN = 15;
  let ip = 0;

  /**
   * Step 3, shared by both match finders: emit copies while each match's
   * end immediately matches again. Returns the position to resume scanning
   * from, or -1 when the input ran out and the remainder has been emitted.
   */
  const copyLoop = (from: number, firstCandidate: number): number => {
    let at = from;
    let candidate = firstCandidate;
    for (;;) {
      const base = at;
      let matched = 4;
      while (at + matched < n && input[at + matched] === input[candidate + matched]) matched++;
      at += matched;
      emitCopy(w, base - candidate, matched);
      if (at >= n - INPUT_MARGIN) {
        if (at < n) emitLiteral(w, input, at, n);
        return -1;
      }
      table[tableIndex(load32(input, at - 1))] = at - 1;
      const data = load32(input, at);
      const h = tableIndex(data);
      candidate = table[h]!;
      table[h] = at;
      if (data !== load32(input, candidate)) return at;
    }
  };

  if (n >= INPUT_MARGIN) {
    const ipLimit = n - INPUT_MARGIN;
    outer: for (;;) {
      const nextEmit = ip++;

      // The unrolled 16-position probe: every byte, no acceleration.
      let skip = 32;
      let candidate = 0;
      let found = false;
      if (ipLimit - ip >= 16) {
        for (let i = 0; i < 16 && !found; i++) {
          const dword = load32(input, ip + i);
          const h = tableIndex(dword);
          candidate = table[h]!;
          table[h] = ip + i;
          if (load32(input, candidate) === dword) {
            ip += i;
            found = true;
          }
        }
        if (!found) {
          ip += 16;
          skip += 16;
        }
      }

      // The accelerating scan.
      if (!found) {
        for (;;) {
          const data = load32(input, ip);
          const h = tableIndex(data);
          const bytesBetween = skip >>> 5;
          skip += bytesBetween;
          const nextIp = ip + bytesBetween;
          if (nextIp > ipLimit) {
            ip = nextEmit;
            break outer;
          }
          candidate = table[h]!;
          table[h] = ip;
          if (data === load32(input, candidate)) break;
          ip = nextIp;
        }
      }

      emitLiteral(w, input, nextEmit, ip);
      ip = copyLoop(ip, candidate);
      if (ip < 0) return;
    }
  }

  if (ip < n) emitLiteral(w, input, ip, n);
}

/**
 * Compress a buffer into a single raw Snappy block: the varint
 * uncompressed-length header followed by 64 KiB fragments, each compressed
 * independently — byte-identical to `snappy::Compress` on the same input.
 */
export function snappyCompressBlock(
  input: Uint8Array,
  vintage: "classic" | "modern" = "modern",
): Uint8Array {
  const n = input.length;
  const w = new ByteWriter(32 + n + Math.ceil(n / 6));
  // Varint uncompressed length header.
  let x = n;
  while (x >= 0x80) {
    w.byte((x & 0x7f) | 0x80);
    x >>>= 7;
  }
  w.byte(x);
  const FRAGMENT = 0x10000; // snappy's kBlockSize
  for (let pos = 0; pos === 0 || pos < n; pos += FRAGMENT) {
    const fragment = input.subarray(pos, Math.min(pos + FRAGMENT, n));
    if (vintage === "modern") compressFragmentModern(w, fragment);
    else compressFragment(w, fragment);
  }
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
