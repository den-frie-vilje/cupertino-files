/**
 * Placing drawables: the same operation across three different containers.
 *
 * Keynote keeps ownership and paint order in two lists; Numbers keeps one;
 * Pages nests per-page groups whose entries wrap the reference one level
 * deeper. These tests exist because that variation is exactly where a
 * shared abstraction goes wrong.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "./harness.ts";
import { KeynoteDocument, NumbersDocument, PagesDocument } from "../src/index.ts";

const FIXTURES = new URL("../fixtures/", import.meta.url);
const fixture = (name: string) => new Uint8Array(readFileSync(new URL(name, FIXTURES)));

describe("drawable placement", () => {
  it("copies a drawable onto another Keynote slide", () => {
    const doc = KeynoteDocument.load(fixture("zenodo-v26.1-hyperlinks-masks.key"));
    const source = doc.slides()[0]!.drawables()[0]!;
    const target = doc.slides()[1]!;
    const before = target.drawables().length;

    const copy = target.container().addCopyOf(source, {
      x: 100,
      y: 120,
      width: 200,
      height: 150,
    });
    expect(copy.id).not.toBe(source.id);

    const reloaded = KeynoteDocument.load(doc.save());
    const placed = reloaded.slides()[1]!.drawables();
    expect(placed.length).toBe(before + 1);
    const found = placed.find((d) => d.id === copy.id)!;
    expect(found.geometry()).toEqual({ x: 100, y: 120, width: 200, height: 150, angle: 0, flags: 3 });
    expect(reloaded.compatibility().canRoundTrip).toBe(true);
  });

  it("keeps ownership and paint order in step on a slide", () => {
    // A drawable added to owned_drawables but not the z-order list is
    // owned by the slide and never drawn.
    const doc = KeynoteDocument.load(fixture("zenodo-v26.1-hyperlinks-masks.key"));
    const slide = doc.slides()[1]!;
    const container = slide.container();
    const copy = container.addCopyOf(doc.slides()[0]!.drawables()[0]!);
    expect(container.ids()).toContain(copy.id);
    expect(container.zOrder()).toContain(copy.id);

    container.sendToBack(copy.id);
    expect(container.zOrder()[0]).toBe(copy.id);
    container.bringToFront(copy.id);
    expect(container.zOrder()[container.zOrder().length - 1]).toBe(copy.id);

    container.remove(copy.id);
    expect(container.ids().includes(copy.id)).toBe(false);
    expect(container.zOrder().includes(copy.id)).toBe(false);
  });

  it("copies a table onto another Numbers sheet", () => {
    const doc = NumbersDocument.load(fixture("iwork-mcp-v14.5-earnings.numbers"));
    const sheets = doc.sheets();
    const from = doc.sheetContainer(sheets[0]!.id);
    const to = doc.sheetContainer(sheets[1]!.id);
    const tablesBefore = doc.tables(sheets[1]!.id).length;

    to.addCopyOf(from.drawables()[0]!, { x: 40, y: 60 });
    const reloaded = NumbersDocument.load(doc.save());
    expect(reloaded.tables(reloaded.sheets()[1]!.id).length).toBe(tablesBefore + 1);
    expect(reloaded.compatibility().canRoundTrip).toBe(true);
  });

  it("handles the Pages per-page group whose entries wrap the reference", () => {
    // Pages nests floating drawables under page_groups, and each entry
    // holds a reference rather than being one. Reading tolerates both
    // shapes; writing has to produce the right one.
    const doc = PagesDocument.load(fixture("compphysics-poster-images-masks.pages"));
    expect(doc.floatingDrawablePages().length).toBeGreaterThan(0);
    const container = doc.floatingDrawables()!;
    const before = container.drawables().length;
    expect(before).toBeGreaterThan(0);

    const copy = container.addCopyOf(container.drawables()[0]!, {
      x: 10,
      y: 10,
      width: 80,
      height: 60,
    });
    const reloaded = PagesDocument.load(doc.save());
    const after = reloaded.floatingDrawables()!;
    expect(after.drawables().length).toBe(before + 1);
    expect(after.drawables().find((d) => d.id === copy.id)!.geometry()!.width).toBe(80);
    expect(reloaded.compatibility().canRoundTrip).toBe(true);
  });

  it("gives the copy its own storages rather than sharing the source's", () => {
    const doc = KeynoteDocument.load(fixture("zenodo-v26.1-hyperlinks-masks.key"));
    const source = doc.slides()[0]!.drawables()[0]!;
    const copy = doc.slides()[1]!.container().addCopyOf(source);
    // Nothing the source references is also referenced by the copy, except
    // shared presentation objects the policy deliberately keeps.
    const sourceRefs = new Set(source.object.getObjectReferences());
    const shared = copy.object.getObjectReferences().filter((id) => sourceRefs.has(id));
    for (const id of shared) {
      const name = doc.store.typeNameOf(doc.store.object(id)!) ?? "";
      expect(/Style|Theme|Stylesheet/.test(name)).toBe(true);
    }
  });

  it("removing a drawable leaves the object in the package", () => {
    const doc = KeynoteDocument.load(fixture("zenodo-v26.1-hyperlinks-masks.key"));
    const slide = doc.slides()[0]!;
    const victim = slide.drawables()[0]!.id;
    expect(slide.container().remove(victim)).toBe(true);
    // Unlinked from the slide, still resolvable: an orphan is inert, a
    // dangling reference is not.
    expect(doc.store.object(victim) !== undefined).toBe(true);
    expect(slide.container().remove(victim)).toBe(false);
    expect(KeynoteDocument.load(doc.save()).compatibility().canRoundTrip).toBe(true);
  });
});
