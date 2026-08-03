import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "./harness.ts";
import {
  buildZip,
  bytesEqual,
  detectIwaFraming,
  eraAtLeast,
  eraOf,
  IWorkVersion,
  IWorkDocument,
  IWORK_ERAS,
  PagesDocument,
  registerTypes,
  clearRegisteredTypes,
  typeName,
  ZipReader,
} from "../src/index.ts";

const FIXTURES = new URL("../fixtures/", import.meta.url);
const fixture = (name: string) => new Uint8Array(readFileSync(new URL(name, FIXTURES)));

/**
 * Every modern iWork fixture in the repository. The compatibility suite is
 * deliberately data-driven: dropping a newer file into fixtures/ extends the
 * matrix automatically, which is how this library keeps proving it handles
 * formats released after the code was written.
 */
function modernFixtures(): string[] {
  return readdirSync(fileURLToPath(FIXTURES))
    .filter((n) => /\.(pages|numbers|key)$/.test(n) && !n.includes("iwork09"))
    .sort();
}

describe("version model", () => {
  it("parses and compares dotted and packed versions", () => {
    expect(IWorkVersion.parse("14.1.1")!.toString()).toBe("14.1.1");
    expect(IWorkVersion.parse([2, 0, 24])!.toString()).toBe("2.0.24");
    expect(IWorkVersion.parse(undefined)).toBe(undefined);
    expect(IWorkVersion.parse([])).toBe(undefined);
    expect(IWorkVersion.parse("not.a.version")).toBe(undefined);

    const a = IWorkVersion.parse("2.0.24")!;
    const b = IWorkVersion.parse("3.2.13")!;
    expect(a.compare(b) < 0).toBe(true);
    expect(b.compare(a) > 0).toBe(true);
    expect(a.compare(IWorkVersion.parse("2.0.24")!)).toBe(0);
    // Differing lengths compare as if zero-padded.
    expect(IWorkVersion.parse("14")!.compare(IWorkVersion.parse("14.0.0")!)).toBe(0);
    expect(IWorkVersion.parse("26.0")!.gte(IWorkVersion.parse("14.5")!)).toBe(true);
  });

  it("classifies format versions into the observed eras", () => {
    expect(eraOf(IWorkVersion.parse("1.5.0"))).toBe("iwork13");
    expect(eraOf(IWorkVersion.parse("2.0.24"))).toBe("iwork16");
    expect(eraOf(IWorkVersion.parse("3.2.13"))).toBe("iwork19");
    expect(eraOf(IWorkVersion.parse("14.1.1"))).toBe("modern");
    expect(eraOf(IWorkVersion.parse("26.3"))).toBe("current");
    // Anything past the surveyed range is "future" — reported, never refused.
    expect(eraOf(IWorkVersion.parse("30.0"))).toBe("future");
    expect(eraOf(undefined)).toBe("modern");
  });

  it("orders eras", () => {
    expect(eraAtLeast("current", "modern")).toBe(true);
    expect(eraAtLeast("iwork13", "modern")).toBe(false);
    expect(IWORK_ERAS.indexOf("future")).toBe(IWORK_ERAS.length - 1);
  });
});

describe("compatibility across every fixture era", () => {
  it("reports a coherent compatibility profile for each fixture", () => {
    const fixtures = modernFixtures();
    expect(fixtures.length).toBeGreaterThan(0);

    for (const name of fixtures) {
      const doc = IWorkDocument.open(fixture(name));
      const report = doc.compatibility();

      // Era classification is always populated and self-consistent.
      expect(IWORK_ERAS.includes(report.era)).toBe(true);
      expect(report.era).toBe(doc.era);
      expect(report.eraLabel.length > 0).toBe(true);
      expect(["pages", "numbers", "keynote"].includes(report.app)).toBe(true);

      // Properties.plist and PackageMetadata agree on the format version
      // wherever both are present — they are two views of one marker.
      if (report.formatVersion && report.packageFormatVersion) {
        expect(report.formatVersion.compare(report.packageFormatVersion)).toBe(0);
      }

      // Structural probes are always meaningful.
      expect(
        ["flat", "nested-index-zip", "wrapper-directory"].includes(report.probe.containerLayout),
      ).toBe(true);
      expect(["none", "v5", "preBNC", "mixed"].includes(report.probe.cellStorage)).toBe(true);
      expect(report.probe.unparseableObjectCount).toBe(0);
      expect(report.canRoundTrip).toBe(true);

      // Unknown type IDs must be reported, never silently ignored.
      if (report.probe.unknownTypeIds.length > 0) {
        expect(report.probe.unknownTypeObjectCount).toBeGreaterThan(0);
        expect(report.warnings.join(" ")).toContain("registry");
      }

      expect(doc.compatibilitySummary()).toContain(report.app);
    }
  });

  it("round-trips every fixture byte-identically regardless of era", () => {
    for (const name of modernFixtures()) {
      const original = fixture(name);
      const doc = IWorkDocument.open(original);
      // Exercise read paths, including ones that touch unknown content.
      doc.compatibility();
      doc.textStorages().forEach((s) => s.text);
      const saved = doc.save();

      const before = ZipReader.parse(original);
      const after = ZipReader.parse(saved);
      const names = before.names().filter((n) => !n.endsWith("/"));
      expect(after.names().filter((n) => !n.endsWith("/"))).toEqual(names);
      for (const entry of names) {
        if (entry.toLowerCase().endsWith("index.zip")) {
          const b = ZipReader.parse(before.read(entry));
          const a = ZipReader.parse(after.read(entry));
          for (const inner of b.names().filter((n) => !n.endsWith("/"))) {
            expect(bytesEqual(a.read(inner), b.read(inner))).toBe(true);
          }
        } else {
          expect(bytesEqual(after.read(entry), before.read(entry))).toBe(true);
        }
      }
    }
  });

  it("preserves objects of unknown types across an edit (forward compatibility)", () => {
    // The 2013-era Pages file contains type 608, which the current registry
    // (dumped from 14.4/2026 apps) no longer lists. Editing the document
    // must not disturb it — the same mechanism that will protect content
    // added by future app releases.
    const original = fixture("libetonyek-pages5-file.pages");
    const doc = PagesDocument.load(original);
    const report = doc.compatibility();
    expect(report.probe.unknownTypeIds).toContain(608);

    const unknownBefore = [...doc.store.allObjects()]
      .filter(({ obj }) => report.probe.unknownTypeIds.includes(obj.type))
      .map(({ obj }) => ({ id: obj.identifier, bytes: obj.message.toBytes() }));
    expect(unknownBefore.length).toBeGreaterThan(0);

    doc.replaceText("hovercraft", "airship");
    const reloaded = PagesDocument.load(doc.save());

    for (const before of unknownBefore) {
      const after = reloaded.store.object(before.id);
      expect(after !== undefined).toBe(true);
      expect(bytesEqual(after!.message.toBytes(), before.bytes)).toBe(true);
    }
    // And the unknown type is still reported after the round-trip.
    expect(reloaded.compatibility().probe.unknownTypeIds).toContain(608);
  });

  it("surfaces unsupported features rather than failing the load", () => {
    // Archives carrying several complete messages are normal in modern
    // documents and must NOT be mistaken for merge/patch archives (which
    // require should_merge or a type-0 diff payload). They are reported as
    // a warning, preserved, and never block loading or saving.
    const doc = IWorkDocument.open(fixture("tika-testKeynote2018.key"));
    const report = doc.compatibility();
    expect(report.probe.multiPayloadArchiveCount).toBeGreaterThan(0);
    expect(report.probe.patchArchiveCount).toBe(0);
    expect(report.warnings.join(" ")).toContain("more than one message payload");
    expect(report.unsupportedFeatures.length).toBe(0);
    expect(report.canRoundTrip).toBe(true);

    // Pre-BNC cell storage is an unsupported *feature*, not a load failure.
    const numbers = IWorkDocument.open(fixture("tika-testNumbers2013.numbers"));
    const numbersReport = numbers.compatibility();
    expect(numbersReport.probe.cellStorage).toBe("preBNC");
    expect(numbersReport.unsupportedFeatures.join(" ")).toContain("pre-BNC");
    expect(numbersReport.canRoundTrip).toBe(true);
  });

  it("covers a spread of eras and container layouts", () => {
    const reports = modernFixtures().map((n) => IWorkDocument.open(fixture(n)).compatibility());
    const eras = new Set(reports.map((r) => r.era));
    const layouts = new Set(reports.map((r) => r.probe.containerLayout));
    // The corpus must exercise more than one era and more than one layout,
    // otherwise the compatibility model is untested in practice.
    expect(eras.size).toBeGreaterThan(1);
    expect(layouts.size).toBeGreaterThan(1);
  });
});

describe("registry extensibility (teaching the library new types)", () => {
  it("lets callers name types the bundled registry does not know", () => {
    const doc = PagesDocument.load(fixture("libetonyek-pages5-file.pages"));
    // Type 608 exists in this 2014-era file but not in the 14.4-era registry.
    expect(doc.compatibility().probe.unknownTypeIds).toContain(608);
    const before = doc.store.object(
      [...doc.store.allObjects()].find(({ obj }) => obj.type === 608)!.obj.identifier,
    )!;
    expect(typeName(608, "pages")).toBe(undefined);

    try {
      registerTypes({ 608: "TSA.LegacyThingArchive" }, "pages");
      expect(typeName(608, "pages")).toBe("TSA.LegacyThingArchive");
      // Once registered, the type is no longer reported as unknown.
      const after = PagesDocument.load(fixture("libetonyek-pages5-file.pages"));
      expect(after.compatibility().probe.unknownTypeIds).toEqual([]);
      expect(before.type).toBe(608);
    } finally {
      clearRegisteredTypes();
    }
    expect(typeName(608, "pages")).toBe(undefined);
  });

  it("rejects invalid type IDs", () => {
    expect(() => { registerTypes({ "not-a-number": "X.Y" }); }).toThrow();
    expect(() => { registerTypes({ 0: "X.Y" }); }).toThrow();
  });
});

describe("multi-payload archives (modern documents)", () => {
  it("distinguishes multi-message archives from merge/patch archives", () => {
    // Pages 14.5 writes TST.TableStyleNetworkArchive as an archive holding
    // two complete messages of the same type — no should_merge, no type-0
    // diff. Both payloads must survive a round-trip untouched.
    const original = fixture("iwork-mcp-v14.5-sample.pages");
    const doc = PagesDocument.load(original);
    const multi = [...doc.store.allObjects()].filter(({ obj }) => obj.payloadCount > 1);
    expect(multi.length).toBeGreaterThan(0);

    for (const { obj } of multi) {
      expect(obj.isPatchArchive).toBe(false);
      // Every payload declares a real (non-zero) type.
      expect(obj.payloadTypes.every((t) => t !== 0)).toBe(true);
      expect(obj.payloadMessage(1) !== undefined).toBe(true);
    }

    const before = multi.map(({ obj }) => ({
      id: obj.identifier,
      payloads: obj.payloads.map((p) => p.slice()),
    }));
    doc.appendParagraph("Edited elsewhere in the document.");
    const reloaded = PagesDocument.load(doc.save());
    for (const b of before) {
      const after = reloaded.store.object(b.id)!;
      expect(after.payloadCount).toBe(b.payloads.length);
      for (let i = 0; i < b.payloads.length; i++) {
        expect(bytesEqual(after.payloads[i]!, b.payloads[i]!)).toBe(true);
      }
    }
  });

  it("classifies the modern-era fixture and its versioned style snapshots", () => {
    const doc = PagesDocument.load(fixture("iwork-mcp-v14.5-sample.pages"));
    const report = doc.compatibility();
    expect(report.era).toBe("modern");
    expect(report.formatVersion!.toString()).toBe("14.4.1");
    expect(report.appBuilds.join(" ")).toContain("M14.5");
    // styles_for_* snapshots appear in modern files but not in the older ones.
    expect(report.probe.hasVersionedStyleSnapshots).toBe(true);
    const older = PagesDocument.load(fixture("libetonyek-pages5-file.pages"));
    expect(older.compatibility().probe.hasVersionedStyleSnapshots).toBe(false);
  });
});

describe("older-reader compatibility diffs", () => {
  it("identifies type-0 patches and the reader versions they target", () => {
    // Numbers 26.1 stores TN.UIStateArchive as a current message plus one
    // type-0 diff per older reader version (11.0, 10.1, 10.0) — the
    // object-level analogue of the styles_for_* stylesheet snapshots.
    const doc = IWorkDocument.open(fixture("numbers-parser-v26.1-custom-formats.numbers"));
    const patched = [...doc.store.allObjects()].filter(({ obj }) => obj.isPatchArchive);
    expect(patched.length).toBeGreaterThan(0);

    const { obj } = patched[0]!;
    expect(obj.hasCompatibilityPatches).toBe(true);
    const targets = obj.compatibilityPatchVersions();
    expect(targets.length).toBeGreaterThan(0);
    // Each diff names the reader version it is for.
    expect(targets.every((v) => v.length > 0)).toBe(true);
    // The base payload is a real typed message; the diffs are type 0.
    expect(obj.payloadTypes[0] !== 0).toBe(true);
    expect(obj.payloadTypes.slice(1).every((t) => t === 0)).toBe(true);

    // Reported as a warning, never as a load failure or unsupported feature.
    const report = doc.compatibility();
    expect(report.probe.patchArchiveCount).toBeGreaterThan(0);
    expect(report.canRoundTrip).toBe(true);
    expect(report.warnings.join(" ")).toContain("older-reader compatibility diffs");
  });

  it("reports nothing stale when edits avoid patched objects", () => {
    const doc = IWorkDocument.open(fixture("numbers-parser-v26.1-custom-formats.numbers"));
    const storage = doc.textStorages().find((s) => s.text.length > 0);
    if (storage) storage.replaceAll(storage.text.slice(0, 1), storage.text.slice(0, 1));
    // Editing ordinary content must not touch UI-state objects.
    expect(doc.store.staleCompatibilityPatches().length).toBe(0);
  });

  it("classifies the newest fixtures as the current era with readable cells", () => {
    for (const name of ["numbers-parser-v26.0-issue102.numbers", "numbers-parser-v26.1-date-formats.numbers"]) {
      const doc = IWorkDocument.open(fixture(name));
      const report = doc.compatibility();
      expect(report.era).toBe("current");
      expect(report.formatVersion!.major).toBe(26);
      expect(report.probe.cellStorage).toBe("v5");
      expect(report.unsupportedFeatures.length).toBe(0);
    }
  });
});

describe("current-era Pages document (26.x)", () => {
  it("classifies and reads the newest available Pages writer", () => {
    // Format 26.1.0, written by build M15.2.1 — the same build that wrote
    // the newest Numbers fixtures. Its build history records edits by three
    // app generations, so it also exercises multi-generation provenance.
    const doc = PagesDocument.load(fixture("gomap-v26.1-newest-writer.pages"));
    const report = doc.compatibility();
    expect(report.era).toBe("current");
    expect(report.formatVersion!.toString()).toBe("26.1.0");
    expect(report.appBuilds.join(" ")).toContain("M15.2.1");
    expect(report.appBuilds.length).toBeGreaterThan(2);
    expect(report.unsupportedFeatures.length).toBe(0);
    expect(report.canRoundTrip).toBe(true);
    expect(report.probe.hasVersionedStyleSnapshots).toBe(true);

    // The document model works on it, not just the compatibility layer.
    expect(doc.textBoxes().length).toBeGreaterThan(0);
    expect(doc.paragraphStyles().some((s) => s.name === "Body")).toBe(true);
    expect(doc.sections().length).toBeGreaterThan(0);
  });

  it("edits and round-trips a 26.x document", () => {
    const doc = PagesDocument.load(fixture("gomap-v26.1-newest-writer.pages"));
    const box = doc.textBoxes().find((t) => t.storage.text.trim().length > 5)!;
    const storageId = box.storage.id;
    const before = box.storage.text;
    box.storage.replaceRange(0, 1, before[0]!.toUpperCase());

    const reloaded = PagesDocument.load(doc.save());
    const after = reloaded.textBoxes().find((t) => t.storage.id === storageId)!;
    expect(after.storage.text.length).toBe(before.length);
    expect(reloaded.compatibility().formatVersion!.toString()).toBe("26.1.0");
  });
});

describe("mixed-codec packages (collaboration mode)", () => {
  it("detects component framing from magic bytes", () => {
    expect(detectIwaFraming(new Uint8Array([0x00, 1, 2, 3]))).toBe("snappy");
    // LZFSE/LZVN container magics: bvxn bvx1 bvx2 bvx- bvx$
    for (const last of [0x6e, 0x31, 0x32, 0x2d, 0x24]) {
      expect(detectIwaFraming(new Uint8Array([0x62, 0x76, 0x78, last]))).toBe("lzfse");
    }
    expect(detectIwaFraming(new Uint8Array([0x99, 1]))).toBe("unknown");
    expect(detectIwaFraming(new Uint8Array(0))).toBe("unknown");
  });

  it("keeps the document usable when one component uses another codec", () => {
    // Collaboration-mode Pages packages write Index/OperationStorage.iwa as
    // an Apple LZFSE container while every other component uses Snappy
    // chunking. One undecodable component must not fail the whole document.
    const source = ZipReader.parse(fixture("picodocs-v14.4-headers-tables.pages"));
    const entries = source.entries
      .filter((e) => !e.isDirectory)
      .map((e) => ({ name: e.name, data: source.read(e) }));
    const lzfse = new Uint8Array([
      0x62, 0x76, 0x78, 0x6e, 0xd6, 0, 0, 0, 0xbb, 0, 0, 0, 9, 9, 9, 0x62, 0x76, 0x78, 0x24,
    ]);
    entries.push({ name: "Index/OperationStorage.iwa", data: lzfse });

    const doc = IWorkDocument.open(buildZip(entries));
    expect(doc.app).toBe("pages");
    // Every other component loaded.
    expect(doc.textStorages().filter((s) => s.text.length > 0).length).toBeGreaterThan(10);

    const report = doc.compatibility();
    expect(report.probe.opaqueComponents.length).toBe(1);
    expect(report.probe.opaqueComponents[0]!.name).toBe("Index/OperationStorage.iwa");
    expect(report.probe.opaqueComponents[0]!.framing).toBe("lzfse");
    expect(report.unsupportedFeatures.join(" ")).toContain("opaque component");
    expect(report.warnings.join(" ")).toContain("LZFSE");

    // The undecodable component round-trips byte-for-byte.
    const after = ZipReader.parse(doc.save());
    expect(bytesEqual(after.read("Index/OperationStorage.iwa"), lzfse)).toBe(true);
  });

  it("still refuses a package with no decodable component at all", () => {
    const zip = buildZip([
      { name: "Index/Document.iwa", data: new Uint8Array([0x62, 0x76, 0x78, 0x6e, 1, 2]) },
    ]);
    let threw = false;
    try {
      IWorkDocument.open(zip);
    } catch {
      threw = true;
    }
    expect(threw).toBe(true);
  });
});
