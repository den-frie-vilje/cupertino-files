/**
 * Whole-file byte identity: open → save reproduces Apple's bytes.
 *
 * Three layers had to line up for this, and each is pinned here:
 *
 *  1. **Snappy.** The compressor is a byte-exact port of google/snappy's
 *     `CompressFragment` — both vintages. Apple switched encoders when
 *     upstream rewrote it in 1.1.9 (2020): every fixture written by a
 *     2023-or-later app matches the modern form exactly, every 2013-2016
 *     writer matches the classic form, and mixed-age documents contain
 *     both (incremental save keeps whatever bytes an older writer left).
 *  2. **Messages.** Re-serializing parsed objects must reproduce their
 *     wire bytes, field order and all.
 *  3. **Container.** Apple's zip layout is quirkier than a generic
 *     writer's: no general-purpose flags, version-made-by 62, a redundant
 *     ZIP64 local extra on `Metadata/*` and preview entries but never on
 *     `Index/` or `Data/`, and — in incrementally saved documents — local
 *     records in a different physical order than the central directory.
 *
 * The two named exceptions are legacy *wrapper* packages (a zipped bundle
 * directory with a nested Index.zip) whose entries were deflated by
 * whatever tool zipped them; reproducing those bytes would mean cloning
 * that tool's deflate, which is not this library's format. Their content
 * still round-trips — only the recompression differs.
 */
import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "./harness.ts";
import { IWorkDocument } from "../src/tsa/document.ts";
import { ZipReader } from "../src/base/zip.ts";
import { decodeIwaData, snappyCompressBlock } from "../src/base/snappy.ts";
import { ByteWriter, bytesEqual } from "../src/base/bytes.ts";

const FIXTURES = new URL("../fixtures/", import.meta.url);

const NOT_BYTE_IDENTICAL = new Set([
  "libetonyek-pages5-extra-dir.pages", // deflated wrapper zip (not app-written)
  "tika-testKeynote2018.key", // deflated wrapper zip (not app-written)
  "tika-iwork09-testPages.pages", // iWork '09 XML — refused at open
]);

describe("no-op save reproduces Apple's file byte for byte", () => {
  it("holds for every fixture except the named wrapper zips", () => {
    const wrong: string[] = [];
    let identical = 0;
    for (const name of readdirSync(FIXTURES).sort()) {
      if (!/\.(pages|numbers|key)$/.test(name)) continue;
      const original = new Uint8Array(readFileSync(new URL(name, FIXTURES)));
      let saved: Uint8Array;
      try {
        saved = IWorkDocument.open(original).save();
      } catch {
        if (!NOT_BYTE_IDENTICAL.has(name)) wrong.push(`${name} became unreadable`);
        continue;
      }
      const same = bytesEqual(saved, original);
      if (same) identical++;
      if (same === NOT_BYTE_IDENTICAL.has(name)) {
        wrong.push(`${name} ${same ? "unexpectedly identical — tighten the list" : "diverged"}`);
      }
    }
    expect(`exceptions: ${wrong.join(" | ")}`).toBe("exceptions: ");
    // Measured floor: byte-identical for every package except the two
    // re-zipped wrapper bundles and the eleven strong-Snappy holdouts.
    expect(identical >= 35).toBe(true);
  });
});

describe("the Snappy port reproduces Apple's compression", () => {
  it("matches every stored component with one of the two vintages, with floors", () => {
    let components = 0;
    let modern = 0;
    let classic = 0;
    let either = 0;
    for (const name of readdirSync(FIXTURES).sort()) {
      if (!/\.(pages|numbers|key)$/.test(name)) continue;
      let zip: ZipReader;
      try {
        zip = ZipReader.parse(new Uint8Array(readFileSync(new URL(name, FIXTURES))));
      } catch {
        continue;
      }
      for (const entry of zip.names()) {
        if (!entry.endsWith(".iwa")) continue;
        const original = zip.read(entry);
        let raw: Uint8Array;
        try {
          raw = decodeIwaData(original);
        } catch {
          continue; // LZFSE-framed collaboration components
        }
        components++;
        const reEncode = (vintage: "classic" | "modern"): Uint8Array => {
          const w = new ByteWriter(raw.length >>> 1);
          let pos = 0;
          do {
            const end = Math.min(pos + 0x10000, raw.length);
            const block = snappyCompressBlock(raw.subarray(pos, end), vintage);
            w.byte(0x00);
            w.byte(block.length & 0xff);
            w.byte((block.length >>> 8) & 0xff);
            w.byte((block.length >>> 16) & 0xff);
            w.bytes(block);
            pos = end;
          } while (pos < raw.length);
          return w.toBytes();
        };
        const okModern = bytesEqual(reEncode("modern"), original);
        const okClassic = bytesEqual(reEncode("classic"), original);
        if (okModern) modern++;
        if (okClassic) classic++;
        if (okModern || okClassic) either++;
      }
    }
    // Measured over the fixtures: 1751 components; 1648 match the modern
    // compressor exactly, 1438 the classic, 1740 one of the two. The 11
    // holdouts are valid Snappy in standard chunks whose matches beat
    // google's greedy encoder — some old iOS builds linked a stronger
    // one — and are the gap between `either` and `components`.
    expect(components >= 1751).toBe(true);
    expect(modern >= 1648).toBe(true);
    expect(classic >= 1438).toBe(true);
    expect(either >= 1740).toBe(true);
    expect(components - either <= 11).toBe(true);
  });
});
