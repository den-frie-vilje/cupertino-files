import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "./harness.ts";
import {
  bytesEqual,
  eraAtLeast,
  eraOf,
  IWorkVersion,
  IWorkDocument,
  IWORK_ERAS,
  PagesDocument,
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
    // 2018-era Keynote uses merge/patch archives; they must be reported,
    // preserved, and must not prevent loading or saving.
    const doc = IWorkDocument.open(fixture("tika-testKeynote2018.key"));
    const report = doc.compatibility();
    expect(report.probe.patchArchiveCount).toBeGreaterThan(0);
    expect(report.warnings.join(" ")).toContain("merge/patch");
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
