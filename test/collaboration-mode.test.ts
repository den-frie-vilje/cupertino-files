/**
 * Collaboration-mode packages: mixed codecs inside one Index.zip.
 *
 * Turning on Pages' Collaboration writes an LZFSE-framed
 * `Index/OperationStorage.iwa` (magic `bvxn` … `bvx$`) beside the
 * Snappy-framed document graph. The specimen that proved it — TDF
 * Bugzilla 166298, attachment 200502 — carries no redistribution grant,
 * so this test rebuilds the shape from the measurements recorded in
 * research/archive-survey.md instead: a real fixture with a synthetic
 * LZFSE component injected.
 *
 * The contract under test: one undecodable component must never take the
 * document down. It goes opaque, its bytes survive a save verbatim, the
 * compatibility report names it as the collaboration marker, and every
 * other component stays fully readable and editable.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "./harness.ts";
import { PagesDocument, ZipReader, buildZip } from "../src/index.ts";

const FIXTURE = new URL("../fixtures/iwork-mcp-v14.5-sample.pages", import.meta.url);

/** An LZFSE container per the survey's byte layout: bvxn, sizes, bvx$. */
function lzfseComponent(): Uint8Array {
  const bytes = new Uint8Array(24);
  bytes.set([0x62, 0x76, 0x78, 0x6e], 0); // 'bvxn'
  const view = new DataView(bytes.buffer);
  view.setUint32(4, 8, true); // n_raw_bytes
  view.setUint32(8, 8, true); // n_payload_bytes
  bytes.set([1, 2, 3, 4, 5, 6, 7, 8], 12);
  bytes.set([0x62, 0x76, 0x78, 0x24], 20); // 'bvx$'
  return bytes;
}

function collaborationPackage(): { bytes: Uint8Array; alien: Uint8Array } {
  const zip = ZipReader.parse(new Uint8Array(readFileSync(FIXTURE)));
  const entries = zip.entries
    .filter((e) => !e.isDirectory)
    .map((e) => ({ name: e.name, data: zip.read(e) }));
  const alien = lzfseComponent();
  entries.push({ name: "Index/OperationStorage.iwa", data: alien });
  return { bytes: buildZip(entries), alien };
}

describe("collaboration-mode packages", () => {
  it("loads, names the LZFSE component, and stays editable", () => {
    const { bytes } = collaborationPackage();
    const doc = PagesDocument.load(bytes);
    expect(doc.bodyText.length).toBeGreaterThan(0);

    const compat = doc.compatibility();
    const opaque = compat.probe.opaqueComponents;
    expect(opaque.length).toBe(1);
    expect(opaque[0]!.name).toBe("Index/OperationStorage.iwa");
    expect(opaque[0]!.framing).toBe("lzfse");
    // The warning explains itself — collaboration mode, bytes preserved.
    expect(compat.warnings.join(" ")).toContain("collaboration-mode");
    expect(compat.canRoundTrip).toBe(true);
  });

  it("preserves the undecodable component byte for byte through an edit", () => {
    const { bytes, alien } = collaborationPackage();
    const doc = PagesDocument.load(bytes);
    doc.appendParagraph("edited beside a component we cannot read");
    const saved = doc.save();

    const zip = ZipReader.parse(saved);
    const kept = zip.entries.find((e) => e.name === "Index/OperationStorage.iwa");
    expect(kept !== undefined).toBe(true);
    const keptBytes = zip.read(kept!);
    expect(keptBytes.length).toBe(alien.length);
    expect(keptBytes.every((b, i) => b === alien[i])).toBe(true);

    const reread = PagesDocument.load(saved);
    expect(reread.bodyText).toContain("edited beside a component we cannot read");
  });
});
