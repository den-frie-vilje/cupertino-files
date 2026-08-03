/**
 * Apple LZFSE container reading — the framing collaboration-mode
 * components use (`Index/OperationStorage.iwa`, `ActivityStream.iwa`)
 * while every other component in the same package stays Snappy-framed.
 *
 * A stream is a sequence of blocks, each opening with a 4-byte magic:
 *
 *  - `bvx-` — raw bytes; header carries the byte count.
 *  - `bvxn` — one LZVN-compressed block; header carries the decoded and
 *    payload byte counts. The measured iWork specimen is a single such
 *    block.
 *  - `bvx1` / `bvx2` — FSE-entropy-coded blocks. Recognised and refused
 *    with a precise error; nothing in iWork has been observed to write
 *    them, and decoding them means porting the full FSE decoder.
 *  - `bvx$` — end of stream.
 *
 * The LZVN decoder is ported from Apple's published `lzfse` reference
 * implementation (BSD-3-Clause; see THIRD-PARTY-NOTICES.md). LZVN is a
 * byte-code of literal-and-match ops: each opcode carries a literal
 * length L (bytes copied from the stream), a match length M and match
 * distance D (bytes copied from earlier output, overlapping forward
 * copy), with dedicated ops for literal-only, match-only (reusing the
 * previous distance), no-op and end-of-stream.
 *
 * Decoding is exposed for inspection tooling; the document model keeps
 * LZFSE-framed components opaque and byte-preserved, because what the
 * decoded payload *means* is unmeasured until a redistributable
 * collaboration-mode document exists to measure it against.
 */

/** Block magics, little-endian: "bvx-", "bvxn", "bvx1", "bvx2", "bvx$". */
const MAGIC_UNCOMPRESSED = 0x2d787662;
const MAGIC_LZVN = 0x6e787662;
const MAGIC_FSE_V1 = 0x31787662;
const MAGIC_FSE_V2 = 0x32787662;
const MAGIC_END = 0x24787662;

/** Opcode kinds, indexed by first byte via {@link OPCODE_KIND}. */
const Op = {
  smlD: 0,
  medD: 1,
  lrgD: 2,
  preD: 3,
  smlM: 4,
  lrgM: 5,
  smlL: 6,
  lrgL: 7,
  nop: 8,
  eos: 9,
  udef: 10,
} as const;
type OpKind = (typeof Op)[keyof typeof Op];

/**
 * The 256-entry opcode table from the reference decoder. Most rows of
 * eight are six "small distance" ops, a row-specific seventh slot and a
 * "large distance" op; the exceptions are the medium-distance band
 * (0xA0–0xBF), two undefined bands (0x70–0x7F, 0xD0–0xDF) and the
 * literal/match-only ops at 0xE0–0xFF.
 */
const OPCODE_KIND: Uint8Array = (() => {
  const table = new Uint8Array(256).fill(Op.udef);
  const seventh: [number, OpKind][] = [
    [0x00, Op.eos],
    [0x08, Op.nop],
    [0x10, Op.nop],
    [0x18, Op.udef],
    [0x20, Op.udef],
    [0x28, Op.udef],
    [0x30, Op.udef],
    [0x38, Op.udef],
    [0x40, Op.preD],
    [0x48, Op.preD],
    [0x50, Op.preD],
    [0x58, Op.preD],
    [0x60, Op.preD],
    [0x68, Op.preD],
    [0x80, Op.preD],
    [0x88, Op.preD],
    [0x90, Op.preD],
    [0x98, Op.preD],
    [0xc0, Op.preD],
    [0xc8, Op.preD],
  ];
  for (const [base, kind] of seventh) {
    table.fill(Op.smlD, base, base + 6);
    table[base + 6] = kind;
    table[base + 7] = Op.lrgD;
  }
  table.fill(Op.medD, 0xa0, 0xc0);
  table[0xe0] = Op.lrgL;
  table.fill(Op.smlL, 0xe1, 0xf0);
  table[0xf0] = Op.lrgM;
  table.fill(Op.smlM, 0xf1, 0x100);
  return table;
})();

function readU32(data: Uint8Array, offset: number): number {
  return (
    (data[offset]! | (data[offset + 1]! << 8) | (data[offset + 2]! << 16)) +
    data[offset + 3]! * 0x1000000
  );
}

/**
 * Decode one LZVN payload to exactly `outLength` bytes.
 *
 * Truncated input, an undefined opcode, a zero or out-of-window match
 * distance, output overrun, or a length mismatch at end-of-stream all
 * throw — a collaboration log is small and there is nothing safe to do
 * with half of one.
 */
export function decodeLzvn(src: Uint8Array, outLength: number): Uint8Array {
  const dst = new Uint8Array(outLength);
  let s = 0;
  let d = 0;
  let prevDistance = 0;

  const fail = (why: string): never => {
    throw new Error(`lzfse: lzvn ${why} (src offset ${s}, dst offset ${d})`);
  };

  for (;;) {
    if (s >= src.length) fail("payload ends without an end-of-stream op");
    const opc = src[s]!;
    let opcLen = 0;
    let L = 0;
    let M = 0;
    let D = prevDistance;

    switch (OPCODE_KIND[opc] as OpKind) {
      case Op.smlD:
        // LLMMMDDD DDDDDDDD LITERAL
        opcLen = 2;
        L = (opc >> 6) & 3;
        M = ((opc >> 3) & 7) + 3;
        if (s + opcLen + L > src.length) fail("truncated small-distance op");
        D = ((opc & 7) << 8) | src[s + 1]!;
        break;
      case Op.medD: {
        // 101LLMMM DDDDDDMM DDDDDDDD LITERAL
        opcLen = 3;
        L = (opc >> 3) & 3;
        if (s + opcLen + L > src.length) fail("truncated medium-distance op");
        const packed = src[s + 1]! | (src[s + 2]! << 8);
        M = (((opc & 7) << 2) | (packed & 3)) + 3;
        D = (packed >> 2) & 0x3fff;
        break;
      }
      case Op.lrgD:
        // LLMMM111 DDDDDDDD DDDDDDDD LITERAL
        opcLen = 3;
        L = (opc >> 6) & 3;
        M = ((opc >> 3) & 7) + 3;
        if (s + opcLen + L > src.length) fail("truncated large-distance op");
        D = src[s + 1]! | (src[s + 2]! << 8);
        break;
      case Op.preD:
        // LLMMM110 LITERAL — distance carried over
        opcLen = 1;
        L = (opc >> 6) & 3;
        M = ((opc >> 3) & 7) + 3;
        if (s + opcLen + L > src.length) fail("truncated previous-distance op");
        break;
      case Op.smlM:
        // 1111MMMM — match only, previous distance
        opcLen = 1;
        M = opc & 15;
        break;
      case Op.lrgM:
        // 11110000 MMMMMMMM — match only, bias 16
        opcLen = 2;
        if (s + opcLen > src.length) fail("truncated large-match op");
        M = src[s + 1]! + 16;
        break;
      case Op.smlL:
        // 1110LLLL LITERAL — literal only
        opcLen = 1;
        L = opc & 15;
        if (s + opcLen + L > src.length) fail("truncated small-literal op");
        break;
      case Op.lrgL:
        // 11100000 LLLLLLLL LITERAL — literal only, bias 16
        opcLen = 2;
        if (s + opcLen > src.length) fail("truncated large-literal op");
        L = src[s + 1]! + 16;
        if (s + opcLen + L > src.length) fail("truncated large-literal op");
        break;
      case Op.nop:
        s += 1;
        continue;
      case Op.eos:
        // The end-of-stream op occupies 8 bytes.
        if (s + 8 > src.length) fail("truncated end-of-stream op");
        if (d !== outLength) fail(`decoded ${d} bytes where the header promised ${outLength}`);
        return dst;
      case Op.udef:
      default:
        fail(`undefined opcode 0x${opc.toString(16)}`);
    }

    s += opcLen;
    if (d + L + M > outLength) fail("output overruns the declared length");
    for (let i = 0; i < L; i++) dst[d + i] = src[s + i]!;
    d += L;
    s += L;
    if (M > 0) {
      if (D === 0 || D > d) fail(`match distance ${D} outside the written window`);
      // Overlapping forward copy: D < M splats the recent bytes.
      for (let i = 0; i < M; i++) dst[d + i] = dst[d + i - D]!;
      d += M;
      prevDistance = D;
    }
  }
}

/** One decoded block, with the framing it used. */
export interface LzfseBlock {
  kind: "raw" | "lzvn";
  bytes: Uint8Array;
}

/**
 * Decode an LZFSE stream: walk blocks to `bvx$` and concatenate their
 * decoded bytes. Refuses FSE-coded blocks (`bvx1`/`bvx2`) and unknown
 * magics loudly rather than guessing.
 */
export function decodeLzfseStream(data: Uint8Array): Uint8Array {
  const blocks = decodeLzfseBlocks(data);
  const total = blocks.reduce((n, b) => n + b.bytes.length, 0);
  const out = new Uint8Array(total);
  let at = 0;
  for (const block of blocks) {
    out.set(block.bytes, at);
    at += block.bytes.length;
  }
  return out;
}

/** {@link decodeLzfseStream}, keeping per-block framing for inspection. */
export function decodeLzfseBlocks(data: Uint8Array): LzfseBlock[] {
  const blocks: LzfseBlock[] = [];
  let offset = 0;
  for (;;) {
    if (offset + 4 > data.length) {
      throw new Error(`lzfse: stream ends at ${offset} without a bvx$ terminator`);
    }
    const magic = readU32(data, offset);
    if (magic === MAGIC_END) return blocks;
    if (magic === MAGIC_UNCOMPRESSED) {
      if (offset + 8 > data.length) throw new Error("lzfse: truncated bvx- header");
      const nRaw = readU32(data, offset + 4);
      if (offset + 8 + nRaw > data.length) throw new Error("lzfse: truncated bvx- block");
      blocks.push({ kind: "raw", bytes: data.slice(offset + 8, offset + 8 + nRaw) });
      offset += 8 + nRaw;
    } else if (magic === MAGIC_LZVN) {
      if (offset + 12 > data.length) throw new Error("lzfse: truncated bvxn header");
      const nRaw = readU32(data, offset + 4);
      const nPayload = readU32(data, offset + 8);
      if (offset + 12 + nPayload > data.length) throw new Error("lzfse: truncated bvxn block");
      blocks.push({
        kind: "lzvn",
        bytes: decodeLzvn(data.subarray(offset + 12, offset + 12 + nPayload), nRaw),
      });
      offset += 12 + nPayload;
    } else if (magic === MAGIC_FSE_V1 || magic === MAGIC_FSE_V2) {
      throw new Error(
        "lzfse: FSE-coded block (bvx1/bvx2) — not implemented; no iWork component has " +
          "been observed to use one",
      );
    } else {
      throw new Error(`lzfse: unrecognised block magic 0x${magic.toString(16)} at ${offset}`);
    }
  }
}
