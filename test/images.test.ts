import { readFileSync } from "node:fs";
import { describe, expect, it } from "./harness.ts";
import { bytesEqual, PagesDocument } from "../src/index.ts";

const FIXTURES = new URL("../fixtures/", import.meta.url);
const fixture = (name: string) => new Uint8Array(readFileSync(new URL(name, FIXTURES)));

describe("images and image filters", () => {
  it("reads image geometry, masks and media variants", () => {
    const doc = PagesDocument.load(fixture("libetonyek-pages5-extra-dir.pages"));
    const images = doc.images();
    expect(images.length).toBeGreaterThan(0);
    const image = images[0]!;

    expect(image.originalSize!.width).toBe(514);
    expect(image.hasMask).toBe(true);
    expect(image.hasFilters).toBe(false);
    expect(Object.keys(image.filters()).length).toBe(0);

    // This document references a full-size original that was never
    // materialized into the package, alongside a thumbnail that was.
    expect(image.isMaterialized).toBe(false);
    const variants = image.dataVariants();
    expect(variants.length).toBeGreaterThan(1);
    expect(variants[0]!.role).toBe("data");
    const source = image.dataSource()!;
    expect(source.role).toBe("thumbnailData");
    expect(image.data()!.length).toBeGreaterThan(0);
    // The bytes really are the entry named by DataInfo.file_name.
    const onDisk = doc.container.otherFiles().get(`Data/${source.fileName}`)!;
    expect(bytesEqual(image.data()!, onDisk)).toBe(true);
  });

  it("applies, reads back and clears image filters", () => {
    const doc = PagesDocument.load(fixture("libetonyek-pages5-extra-dir.pages"));
    const id = doc.images()[0]!.id;
    doc.images()[0]!.setFilters({
      exposure: 0.25,
      contrast: 0.5,
      saturation: 1.5,
      gamma: 0.75,
      enhance: true,
    });

    const reloaded = PagesDocument.load(doc.save());
    const image = reloaded.images().find((i) => i.id === id)!;
    expect(image.hasFilters).toBe(true);
    const filters = image.filters();
    // Values are stored as float32, so compare at that precision.
    expect(Math.fround(0.25)).toBe(filters.exposure);
    expect(Math.fround(1.5)).toBe(filters.saturation);
    expect(Math.fround(0.75)).toBe(filters.gamma);
    expect(filters.enhance).toBe(true);
    // Untouched properties stay absent rather than defaulting.
    expect(filters.tint).toBe(undefined);

    // Partial update leaves other filters intact.
    image.setFilters({ contrast: 0.9 });
    expect(Math.fround(0.9)).toBe(image.filters().contrast);
    expect(Math.fround(0.25)).toBe(image.filters().exposure);

    // Clearing one property vs all of them.
    image.setFilters({ exposure: undefined });
    expect(image.filters().exposure).toBe(undefined);
    image.clearFilters();
    expect(image.hasFilters).toBe(false);

    const final = PagesDocument.load(reloaded.save());
    expect(final.images().find((i) => i.id === id)!.hasFilters).toBe(false);
  });

  it("rejects non-image objects", () => {
    const doc = PagesDocument.load(fixture("libetonyek-pages5-extra-dir.pages"));
    expect(doc.images().every((i) => i.typeName === "TSD.ImageArchive")).toBe(true);
  });
});
