import { describe, expect, it } from "./harness.ts";
import { deflateRawSync, deflateSync, inflateRawSync } from "node:zlib";
import { ByteWriter, bytesEqual, concatBytes } from "../src/bytes.ts";
import { readUvarint, uvarintLength, writeUvarint, zigzagDecode, zigzagEncode } from "../src/varint.ts";
import { crc32 } from "../src/crc32.ts";
import { inflateRaw } from "../src/inflate.ts";
import {
  decodeIwaData,
  encodeIwaData,
  snappyCompressBlock,
  snappyUncompressBlock,
} from "../src/snappy.ts";
import { buildZip, ZipReader } from "../src/zip.ts";
import { RawMessage, WireType } from "../src/protobuf.ts";

function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

function randomBytes(n: number, seed = 42): Uint8Array {
  const r = rng(seed);
  const b = new Uint8Array(n);
  for (let i = 0; i < n; i++) b[i] = (r() * 256) | 0;
  return b;
}

function repetitiveBytes(n: number): Uint8Array {
  const pattern = new TextEncoder().encode("iWork IWA snappy protobuf stream! ");
  const b = new Uint8Array(n);
  for (let i = 0; i < n; i++) b[i] = pattern[i % pattern.length]!;
  return b;
}

describe("varint", () => {
  it("round-trips edge values", () => {
    const values = [0n, 1n, 127n, 128n, 300n, 16383n, 16384n, 2n ** 32n - 1n, 2n ** 32n, 2n ** 53n, 2n ** 64n - 1n];
    for (const v of values) {
      const w = new ByteWriter();
      writeUvarint(w, v);
      const bytes = w.toBytes();
      expect(bytes.length).toBe(uvarintLength(v));
      const r = readUvarint(bytes, 0);
      expect(r.value).toBe(v);
      expect(r.next).toBe(bytes.length);
    }
  });

  it("zigzag round-trips", () => {
    for (const v of [0n, -1n, 1n, -2n, 2n, -(2n ** 31n), 2n ** 31n - 1n, -(2n ** 62n)]) {
      expect(zigzagDecode(zigzagEncode(v))).toBe(v);
    }
  });
});

describe("crc32", () => {
  it("matches the standard test vector", () => {
    expect(crc32(new TextEncoder().encode("123456789"))).toBe(0xcbf43926);
    expect(crc32(new Uint8Array(0))).toBe(0);
  });
});

describe("snappy", () => {
  it("round-trips random, repetitive, tiny and empty inputs", () => {
    for (const input of [
      new Uint8Array(0),
      new Uint8Array([1]),
      new Uint8Array([1, 2, 3]),
      randomBytes(10),
      randomBytes(100_000, 7),
      repetitiveBytes(100_000),
      repetitiveBytes(65_536),
      concatBytes([randomBytes(1000, 1), repetitiveBytes(5000), randomBytes(1000, 2)]),
    ]) {
      const compressed = snappyCompressBlock(input);
      const out = snappyUncompressBlock(compressed);
      expect(bytesEqual(out, input)).toBe(true);
    }
  });

  it("compresses repetitive data", () => {
    const input = repetitiveBytes(50_000);
    expect(snappyCompressBlock(input).length).toBeLessThan(input.length / 5);
  });

  it("decodes a hand-crafted block with overlapping copy", () => {
    // uncompressed length 10; literal "ab"; copy len 8 offset 2 (overlap run).
    const block = new Uint8Array([10, 0x01 << 2, 0x61, 0x62, ((8 - 1) << 2) | 2, 2, 0]);
    expect(new TextDecoder().decode(snappyUncompressBlock(block))).toBe("ababababab");
  });

  it("round-trips IWA chunk framing across chunk boundaries", () => {
    const raw = repetitiveBytes(200_000);
    const framed = encodeIwaData(raw);
    expect(framed[0]).toBe(0);
    expect(bytesEqual(decodeIwaData(framed), raw)).toBe(true);
    // Multiple chunks expected for 200 KB with 64 KiB chunking.
    const rawSmall = randomBytes(100, 3);
    expect(bytesEqual(decodeIwaData(encodeIwaData(rawSmall)), rawSmall)).toBe(true);
    expect(bytesEqual(decodeIwaData(encodeIwaData(new Uint8Array(0))), new Uint8Array(0))).toBe(true);
  });
});

describe("inflate", () => {
  it("decompresses node-generated raw deflate streams", () => {
    for (const input of [
      new Uint8Array(0),
      new TextEncoder().encode("hello world"),
      randomBytes(50_000, 9),
      repetitiveBytes(80_000),
      randomBytes(1, 4),
    ]) {
      // Default (dynamic huffman, various levels) and level 0 (stored blocks).
      for (const level of [0, 1, 6, 9]) {
        const compressed = new Uint8Array(deflateRawSync(input, { level }));
        const out = inflateRaw(compressed, input.length);
        expect(bytesEqual(out, input)).toBe(true);
        // Also without the size hint.
        expect(bytesEqual(inflateRaw(compressed), input)).toBe(true);
      }
    }
  });

  it("handles fixed-huffman streams", () => {
    // Small inputs typically produce fixed-Huffman blocks at low levels.
    const input = new TextEncoder().encode("abcabcabcabc");
    const compressed = new Uint8Array(deflateRawSync(input, { strategy: 2 /* Z_HUFFMAN_ONLY */ }));
    expect(bytesEqual(inflateRaw(compressed), input)).toBe(true);
  });
});

describe("zip", () => {
  it("round-trips a stored zip through our own reader", () => {
    const entries = [
      { name: "Index/Document.iwa", data: randomBytes(1000, 11) },
      { name: "Metadata/Properties.plist", data: new TextEncoder().encode("plist!") },
      { name: "empty.txt", data: new Uint8Array(0) },
    ];
    const zip = buildZip(entries);
    const reader = ZipReader.parse(zip);
    expect(reader.names()).toEqual(entries.map((e) => e.name));
    for (const e of entries) {
      expect(bytesEqual(reader.read(e.name), e.data)).toBe(true);
    }
  });

  it("reads deflated entries (python/zlib-style zips)", () => {
    // Build a minimal deflated zip by hand: local header + deflate data + cd.
    const name = new TextEncoder().encode("a.bin");
    const data = repetitiveBytes(10_000);
    const deflated = new Uint8Array(deflateRawSync(data));
    const w = new ByteWriter();
    const crc = crc32(data);
    w.u32le(0x04034b50);
    w.u16le(20);
    w.u16le(0);
    w.u16le(8); // deflate
    w.u16le(0);
    w.u16le(0x2121);
    w.u32le(crc);
    w.u32le(deflated.length);
    w.u32le(data.length);
    w.u16le(name.length);
    w.u16le(0);
    w.bytes(name);
    w.bytes(deflated);
    const cdStart = w.length;
    w.u32le(0x02014b50);
    w.u16le(20);
    w.u16le(20);
    w.u16le(0);
    w.u16le(8);
    w.u16le(0);
    w.u16le(0x2121);
    w.u32le(crc);
    w.u32le(deflated.length);
    w.u32le(data.length);
    w.u16le(name.length);
    w.u16le(0);
    w.u16le(0);
    w.u16le(0);
    w.u16le(0);
    w.u32le(0);
    w.u32le(0);
    w.bytes(name);
    const cdSize = w.length - cdStart;
    w.u32le(0x06054b50);
    w.u16le(0);
    w.u16le(0);
    w.u16le(1);
    w.u16le(1);
    w.u32le(cdSize);
    w.u32le(cdStart);
    w.u16le(0);

    const reader = ZipReader.parse(w.toBytes());
    expect(bytesEqual(reader.read("a.bin"), data)).toBe(true);
  });

  it("our zip output is readable by node's zlib-based unzip (sanity via signatures)", () => {
    const zip = buildZip([{ name: "x", data: new TextEncoder().encode("y") }]);
    expect(zip[0]).toBe(0x50);
    expect(zip[1]).toBe(0x4b);
  });
});

describe("protobuf RawMessage", () => {
  it("parses and re-serializes byte-identically when untouched", () => {
    // Build a message with protobufjs-style manual encoding.
    const w = new ByteWriter();
    // field 1 varint 150
    writeUvarint(w, (1 << 3) | 0);
    writeUvarint(w, 150);
    // field 2 string "testing"
    writeUvarint(w, (2 << 3) | 2);
    const s = new TextEncoder().encode("testing");
    writeUvarint(w, s.length);
    w.bytes(s);
    // field 3 fixed32
    writeUvarint(w, (3 << 3) | 5);
    w.u32le(0xdeadbeef);
    // field 4 packed varints [3,270,86942]
    const packed = new ByteWriter();
    writeUvarint(packed, 3);
    writeUvarint(packed, 270);
    writeUvarint(packed, 86942);
    writeUvarint(w, (4 << 3) | 2);
    writeUvarint(w, packed.length);
    w.bytes(packed.toBytes());
    const bytes = w.toBytes();

    const m = RawMessage.parse(bytes);
    expect(m.getUint(1)).toBe(150);
    expect(m.getString(2)).toBe("testing");
    expect(m.getFixed32(3)).toBe(0xdeadbeef);
    expect(m.getPackedVarints(4).map(Number)).toEqual([3, 270, 86942]);
    expect(m.isDirty).toBe(false);
    expect(bytesEqual(m.toBytes(), bytes)).toBe(true);
  });

  it("preserves unknown fields and order across an edit", () => {
    const w = new ByteWriter();
    writeUvarint(w, (7 << 3) | 0);
    writeUvarint(w, 1);
    writeUvarint(w, (2 << 3) | 2);
    const s = new TextEncoder().encode("keep me");
    writeUvarint(w, s.length);
    w.bytes(s);
    writeUvarint(w, (9 << 3) | 1);
    w.u64le(0x0102030405060708n);
    const bytes = w.toBytes();

    const m = RawMessage.parse(bytes);
    m.setVarint(7, 2);
    const out = RawMessage.parse(m.toBytes());
    expect(out.getUint(7)).toBe(2);
    expect(out.getString(2)).toBe("keep me");
    expect(out.fields.map((f) => f.no)).toEqual([7, 2, 9]);
  });

  it("bubbles dirtiness through nested messages", () => {
    const inner = RawMessage.create();
    inner.setVarint(1, 5);
    const outer = RawMessage.create();
    outer.setMessage(3, inner);
    const bytes = outer.toBytes();

    const parsed = RawMessage.parse(bytes);
    expect(parsed.isDirty).toBe(false);
    const child = parsed.getMessage(3)!;
    expect(parsed.isDirty).toBe(false); // materializing is not mutating
    expect(bytesEqual(parsed.toBytes(), bytes)).toBe(true);
    child.setVarint(1, 6);
    expect(parsed.isDirty).toBe(true);
    const reparsed = RawMessage.parse(parsed.toBytes());
    expect(reparsed.getMessage(3)!.getUint(1)).toBe(6);
  });

  it("supports repeated message replacement preserving position", () => {
    const mk = (v: number) => {
      const m = RawMessage.create();
      m.setVarint(1, v);
      return m;
    };
    const outer = RawMessage.create();
    outer.setVarint(1, 99);
    outer.addMessage(2, mk(1));
    outer.addMessage(2, mk(2));
    outer.setVarint(3, 100);
    const parsed = RawMessage.parse(outer.toBytes());
    parsed.setMessages(2, [mk(7), mk(8), mk(9)]);
    const out = RawMessage.parse(parsed.toBytes());
    expect(out.getMessages(2).map((m) => m.getUint(1))).toEqual([7, 8, 9]);
    expect(out.fields.map((f) => f.no)).toEqual([1, 2, 2, 2, 3]);
  });
});

describe("zlib interop", () => {
  it("zlib-wrapped data is NOT raw deflate (guard against wrapper confusion)", () => {
    const data = new TextEncoder().encode("wrapper check");
    const zlibWrapped = new Uint8Array(deflateSync(data));
    const raw = new Uint8Array(deflateRawSync(data));
    expect(bytesEqual(new Uint8Array(inflateRawSync(raw)), data)).toBe(true);
    expect(zlibWrapped[0]! & 0x0f).toBe(8); // zlib CMF marker present
  });
});
