/**
 * Image masks — cropping.
 *
 * The claim under test is a coordinate-space one: a mask's frame is in the
 * *image's* space, not the page's, so the visible rectangle is the sum of
 * the two positions. Getting it backwards misplaces every crop, and both
 * readings look plausible on any single file — so it is checked across the
 * whole corpus, on the case that discriminates (does the crop window land
 * inside the image?) rather than the one that does not.
 *
 * The second claim is that a rectangular mask can be *built*, not just
 * read: every mask in the corpus is reconstructed from its own frame and
 * required to describe the same crop. Not the same *bytes* — Apple writes
 * the path at several different scales, because the renderer stretches it
 * to naturalSize either way, and that is itself asserted below.
 */
import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "./harness.ts";
import {
  buildRectangularMask,
  imagesOf,
  IWorkDocument,
  MaskModel,
  PathElementType,
  type ImageModel,
} from "../src/index.ts";

const FIXTURES = new URL("../fixtures/", import.meta.url);
const fixtureNames = readdirSync(FIXTURES).filter((name) => /\.(pages|numbers|key)$/.test(name));
const open = (name: string) =>
  IWorkDocument.open(new Uint8Array(readFileSync(new URL(name, FIXTURES))));

/** Every masked image in the corpus, with the document it came from. */
function maskedImages(): { file: string; document: IWorkDocument; image: ImageModel }[] {
  const out: { file: string; document: IWorkDocument; image: ImageModel }[] = [];
  for (const file of fixtureNames) {
    let document: IWorkDocument;
    try {
      document = open(file);
    } catch {
      continue; // encrypted or otherwise unopenable; covered elsewhere
    }
    for (const image of imagesOf(document.store)) {
      if (image.hasMask) out.push({ file, document, image });
    }
  }
  return out;
}

describe("image masks", () => {
  it("finds masked images across all three apps", () => {
    const apps = new Set(maskedImages().map(({ document }) => document.app));
    expect(apps.has("pages")).toBe(true);
    expect(apps.has("keynote")).toBe(true);
    expect(maskedImages().length).toBeGreaterThan(50);
  });

  it("reads the crop window as image-local, not page-local", () => {
    // The discriminating measurement. Under the correct reading the crop
    // window sits inside the image; under the alternative it rarely does.
    let inside = 0;
    let onPage = 0;
    let total = 0;
    for (const { image } of maskedImages()) {
      const crop = image.crop();
      if (!crop) continue;
      total++;
      const { window, full, visible } = crop;
      if (
        window.x >= -1 &&
        window.y >= -1 &&
        window.x + window.width <= full.width + 1 &&
        window.y + window.height <= full.height + 1
      ) {
        inside++;
      }
      if (visible.x >= -1 && visible.y >= -1) onPage++;
    }
    expect(total).toBeGreaterThan(50);
    // Allow the handful of legitimate letterbox crops, where the window is
    // deliberately larger than the picture.
    expect(inside / total).toBeGreaterThan(0.9);
    expect(onPage / total).toBeGreaterThan(0.95);
  });

  it("puts a full-bleed crop exactly at the parent origin", () => {
    // An image dragged to fill the slide is cropped at (0,0): its own
    // position is the exact negation of its mask's. Nothing but the
    // image-local reading produces that.
    const exact = maskedImages().filter(({ image }) => {
      const crop = image.crop();
      return (
        crop !== undefined &&
        Math.abs(crop.full.x + crop.window.x) < 0.01 &&
        Math.abs(crop.full.y + crop.window.y) < 0.01 &&
        crop.full.x < 0
      );
    });
    expect(exact.length).toBeGreaterThan(0);
    for (const { image } of exact) {
      const crop = image.crop()!;
      expect(Math.abs(crop.visible.x)).toBeLessThan(0.01);
      expect(Math.abs(crop.visible.y)).toBeLessThan(0.01);
    }
  });

  it("every corpus mask traces a rectangle", () => {
    for (const { file, image } of maskedImages()) {
      expect(`${file}: ${image.crop()!.isRectangular}`).toBe(`${file}: true`);
    }
  });

  it("naturalSize is what sizes the crop, not the path's own dimensions", () => {
    // The path is stretched to naturalSize per axis, so its own size is
    // arbitrary — most corpus masks disagree with it, and one is a plain
    // 100x100 reference box. What always holds is naturalSize == the frame.
    let differing = 0;
    for (const { file, image } of maskedImages()) {
      const mask = image.mask()!;
      const natural = mask.naturalSize()!;
      const frame = mask.geometry()!;
      expect(`${file} w`).toBe(
        Math.abs(natural.width - frame.width!) < 0.01 ? `${file} w` : `${file} w mismatch`,
      );
      expect(`${file} h`).toBe(
        Math.abs(natural.height - frame.height!) < 0.01 ? `${file} h` : `${file} h mismatch`,
      );
      const path = mask.pathSize()!;
      if (Math.abs(path.width - natural.width) > 0.01) differing++;
    }
    // Not a stray case: most of the corpus writes the path at another scale.
    expect(differing).toBeGreaterThan(20);
  });

  it("rebuilds every corpus mask's crop from its frame alone", () => {
    // A synthesized mask must describe the same rectangle Apple's does:
    // same frame, same naturalSize, and a path that is a rectangle. The
    // path's own scale is deliberately not compared — Apple writes several,
    // and the renderer stretches whichever it finds.
    let checked = 0;
    for (const { file, document, image } of maskedImages()) {
      const original = image.mask()!;
      const geometry = original.geometry()!;
      const component = document.store.componentOf(original.object.identifier)!;
      const built = new MaskModel(
        document.store,
        buildRectangularMask(
          document.store,
          {
            x: geometry.x ?? 0,
            y: geometry.y ?? 0,
            width: geometry.width ?? 0,
            height: geometry.height ?? 0,
          },
          component,
        ),
      );
      const describe = (model: MaskModel): string =>
        JSON.stringify({ geometry: model.geometry(), natural: model.naturalSize() });
      expect(`${file}: ${describe(built)}`).toBe(`${file}: ${describe(original)}`);
      expect(`${file}: ${built.isRectangular}`).toBe(`${file}: true`);
      checked++;
    }
    expect(checked).toBeGreaterThan(50);
  });

  it("moves the visible rectangle when the window moves", () => {
    const { document, image } = maskedImages()[0]!;
    const before = image.crop()!;
    image.setCrop({ x: before.window.x + 10, y: before.window.y + 5, width: 50, height: 40 });
    const after = image.crop()!;
    expect(after.visible.x).toBeCloseTo(before.visible.x + 10, 3);
    expect(after.visible.y).toBeCloseTo(before.visible.y + 5, 3);
    expect(after.window.width).toBeCloseTo(50, 3);
    // The picture itself has not moved.
    expect(after.full.x).toBeCloseTo(before.full.x, 3);
    expect(document.store).not.toBe(undefined);
  });

  it("keeps the same part visible when the frame is placed", () => {
    const { image } = maskedImages()[0]!;
    const before = image.crop()!;
    image.setVisibleFrame({ x: 100, y: 200, width: before.window.width, height: before.window.height });
    const after = image.crop()!;
    expect(after.visible.x).toBeCloseTo(100, 3);
    expect(after.visible.y).toBeCloseTo(200, 3);
    // Same window into the picture, so the same part shows.
    expect(after.window.x).toBeCloseTo(before.window.x, 3);
    expect(after.window.y).toBeCloseTo(before.window.y, 3);
  });

  it("crops an image that had no mask, and the file reloads", () => {
    const document = open("iwork-mcp-v14.5-sample.pages");
    const image = imagesOf(document.store).find((candidate) => !candidate.hasMask);
    if (!image) return; // nothing to crop in this fixture
    const full = image.geometry()!;
    image.setCrop({ x: 5, y: 6, width: 40, height: 30 });

    const reloaded = IWorkDocument.open(document.save());
    const again = imagesOf(reloaded.store).find(
      (candidate) => candidate.object.identifier === image.object.identifier,
    )!;
    const crop = again.crop()!;
    expect(crop.isRectangular).toBe(true);
    expect(crop.window.x).toBeCloseTo(5, 3);
    expect(crop.window.height).toBeCloseTo(30, 3);
    expect(crop.visible.x).toBeCloseTo((full.x ?? 0) + 5, 3);
  });

  it("removes a crop, showing the whole picture", () => {
    const { document, image } = maskedImages()[0]!;
    const full = image.crop()!.full;
    expect(image.removeCrop()).toBe(true);
    expect(image.hasMask).toBe(false);
    expect(image.crop()).toBe(undefined);
    expect(image.removeCrop()).toBe(false);

    const reloaded = IWorkDocument.open(document.save());
    const again = imagesOf(reloaded.store).find(
      (candidate) => candidate.object.identifier === image.object.identifier,
    )!;
    expect(again.hasMask).toBe(false);
    // The picture keeps its own frame — which is bigger than the crop was.
    expect(again.geometry()!.width).toBeCloseTo(full.width, 3);
  });

  it("survives a save with the crop changed", () => {
    const { document, image } = maskedImages()[0]!;
    image.setCrop({ x: 3, y: 4, width: 25, height: 20 });
    const reloaded = IWorkDocument.open(document.save());
    const again = imagesOf(reloaded.store).find(
      (candidate) => candidate.object.identifier === image.object.identifier,
    )!;
    const crop = again.crop()!;
    expect(crop.window.x).toBeCloseTo(3, 3);
    expect(crop.window.width).toBeCloseTo(25, 3);
    expect(crop.isRectangular).toBe(true);
  });

  it("refuses to resize a mask that is not a rectangle", () => {
    // Synthesize one the module should decline to rewrite, rather than
    // flattening a hypothetical instant-alpha outline into a box.
    const { document, image } = maskedImages()[0]!;
    const mask = image.mask()!;
    const path = mask.pathSource()!.getMessage(5)!.getMessage(3)!;
    // Turn the first line into a curve: no longer the rectangle we wrote.
    path.getMessages(1)[1]!.setVarint(1, PathElementType.CURVE_TO);
    expect(mask.isRectangular).toBe(false);
    expect(() => { mask.setSize(10, 10); }).toThrow();
    expect(document.store).not.toBe(undefined);
  });
});

describe("the app's own crop over a library-inserted image", () => {
  it("matches setCrop's shape field for field, and shares the pasted asset", () => {
    // The crop-delta seed: one library-inserted photo, copy-pasted in the
    // app, rewrapped, and cropped with the app's own mask editor. The
    // measurements this file settled: the editor engages on our image;
    // the app's mask carries the same shape setCrop writes (window in
    // the image's drawn space, parent back-pointer, wrap type 4 with a
    // 12 pt margin, six-element rectangle path); and the pasted copy
    // shares the original's data object — one JPEG in the package, two
    // drawables referencing it, one generated thumbnail shared too.
    const doc = open("olekristensen-v26.3-seed-crop-returned.pages");
    const images = imagesOf(doc.store).filter((i) => i.hasMask);
    expect(images.length).toBe(1);
    const image = images[0]!;
    const mask = image.mask()!;
    const drawable = mask.object.message.getMessage(1)!;
    expect(drawable.getMessage(2)?.getVarint(1)).toBe(image.object.identifier);
    const wrap = drawable.getMessage(3)!;
    expect(wrap.getUint(1)).toBe(4);
    expect(wrap.getFloat(4)).toBe(12);
    expect(mask.isRectangular).toBe(true);
    const crop = image.crop()!;
    expect(crop.window.width).toBeGreaterThan(0);
    expect(crop.window.width).toBeLessThan(crop.full.width);

    // Asset dedupe on paste: both images, one data reference, one file.
    const dataRefs = new Set(
      imagesOf(doc.store).map((i) => i.object.message.getMessage(11)?.getVarint(1)),
    );
    expect(imagesOf(doc.store).length).toBe(2);
    expect(dataRefs.size).toBe(1);
    const waves = [...doc.container.otherFiles().keys()].filter((n) => /great-wave-\d+\.jpg$/.test(n));
    expect(waves.length).toBe(1);
  });
});
