/**
 * The LZFSE container and LZVN decoder — the framing collaboration-mode
 * components use beside Snappy in one package.
 *
 * No fixture carries the framing yet, so these vectors are assembled by
 * hand from the opcode encodings the decoder implements, one per opcode
 * family, and every refusal path is pinned as a loud error.
 */
import { describe, expect, it } from "./harness.ts";
import { decodeLzfseBlocks, decodeLzfseStream, decodeLzvn } from "../src/index.ts";

const text = (bytes: Uint8Array): string => new TextDecoder().decode(bytes);
const ascii = (s: string): number[] =>
  Array.from({ length: s.length }, (_, i) => s.charCodeAt(i));
const EOS = [0x06, 0, 0, 0, 0, 0, 0, 0];

function frame(...parts: (number[] | string)[]): Uint8Array {
  const bytes: number[] = [];
  for (const part of parts) {
    if (typeof part === "string") bytes.push(...ascii(part));
    else bytes.push(...part);
  }
  return new Uint8Array(bytes);
}

const u32 = (n: number): number[] => [n & 255, (n >> 8) & 255, (n >> 16) & 255, (n >> 24) & 255];

describe("lzvn opcodes", () => {
  it("small literal then small-distance match", () => {
    // 0xE6: literal ×6. 0x30 0x06: L=0 M=9 D=6.
    const src = frame([0xe6], "hello ", [0x30, 0x06], EOS);
    expect(text(decodeLzvn(src, 15))).toBe("hello hello hel");
  });

  it("large literal carries the +16 bias", () => {
    const src = frame([0xe0, 0x00], "ABCDEFGHIJKLMNOP", EOS);
    expect(text(decodeLzvn(src, 16))).toBe("ABCDEFGHIJKLMNOP");
  });

  it("previous-distance op reuses the last distance", () => {
    // "ab", match M=3 D=2 → "ababa"; 0x46: L=1 M=3 D=prev → +"X" +"aXa".
    const src = frame([0xe2], "ab", [0x00, 0x02], [0x46], "X", EOS);
    expect(text(decodeLzvn(src, 9))).toBe("ababaXaXa");
  });

  it("match-only ops, small and large", () => {
    // "abc", M=3 D=3 → "abcabc"; 0xF2: M=2 D=prev → "abcabcab".
    const small = frame([0xe3], "abc", [0x00, 0x03], [0xf2], EOS);
    expect(text(decodeLzvn(small, 8))).toBe("abcabcab");
    // "ab", M=3 D=2 → "ababa"; 0xF0 0x04: M=20 D=prev — the overlapping
    // splat: every copied byte was itself just written.
    const large = frame([0xe2], "ab", [0x00, 0x02], [0xf0, 0x04], EOS);
    expect(text(decodeLzvn(large, 25))).toBe("ababababababababababababa");
  });

  it("medium- and large-distance encodings", () => {
    // 0xA0 0x08 0x00: L=0, M=3, D=2 (packed>>2).
    const medium = frame([0xe2], "xy", [0xa0, 0x08, 0x00], EOS);
    expect(text(decodeLzvn(medium, 5))).toBe("xyxyx");
    // 0x07 0x02 0x00: L=0, M=3, D=2 as 16-bit LE.
    const large = frame([0xe2], "pq", [0x07, 0x02, 0x00], EOS);
    expect(text(decodeLzvn(large, 5))).toBe("pqpqp");
  });

  it("nop bytes are skipped", () => {
    const src = frame([0x0e, 0xe2], "ok", [0x16], EOS);
    expect(text(decodeLzvn(src, 2))).toBe("ok");
  });

  it("refuses what the format refuses", () => {
    // Undefined opcode.
    expect(() => decodeLzvn(frame([0x1e], EOS), 0)).toThrow(/undefined opcode/);
    // Match distance outside the written window.
    expect(() => decodeLzvn(frame([0x00, 0x08], EOS), 3)).toThrow(/match distance/);
    // Payload with no end-of-stream op.
    expect(() => decodeLzvn(frame([0xe2], "ab"), 2)).toThrow(/end-of-stream/);
    // Header promised more bytes than the stream decodes.
    expect(() => decodeLzvn(frame([0xe2], "ab", EOS), 5)).toThrow(/promised/);
    // Literal overrunning the declared output length.
    expect(() => decodeLzvn(frame([0xe4], "abcd", EOS), 2)).toThrow(/overruns/);
  });
});

describe("lzfse framing", () => {
  it("walks raw and lzvn blocks to the terminator and concatenates", () => {
    const lzvnPayload = frame([0xe6], "hello ", [0x30, 0x06], EOS);
    const stream = frame(
      "bvx-",
      u32(4),
      "raw!",
      "bvxn",
      u32(15),
      u32(lzvnPayload.length),
      [...lzvnPayload],
      "bvx$",
    );
    expect(text(decodeLzfseStream(stream))).toBe("raw!hello hello hel");
    const blocks = decodeLzfseBlocks(stream);
    expect(blocks.map((b) => b.kind).join(",")).toBe("raw,lzvn");
  });

  it("refuses FSE blocks, unknown magics and unterminated streams loudly", () => {
    expect(() => decodeLzfseStream(frame("bvx1", u32(0)))).toThrow(/bvx1\/bvx2/);
    expect(() => decodeLzfseStream(frame("bvx2", u32(0)))).toThrow(/bvx1\/bvx2/);
    expect(() => decodeLzfseStream(frame("nope"))).toThrow(/unrecognised/);
    expect(() => decodeLzfseStream(frame("bvx-", u32(4), "raw!"))).toThrow(/terminator/);
    expect(() => decodeLzfseStream(frame("bvxn", u32(10)))).toThrow(/truncated/);
  });
});
