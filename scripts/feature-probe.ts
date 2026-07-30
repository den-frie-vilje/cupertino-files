#!/usr/bin/env node
/**
 * Feature inventory for an iWork document — used to judge whether a
 * candidate fixture is worth adding to the corpus.
 *
 *   node scripts/feature-probe.ts <file...> [--json]
 *
 * Reports the document's era/compatibility profile plus which document
 * features it actually exercises, so fixture selection is evidence-based
 * rather than guessed from filenames.
 */
import { readFileSync } from "node:fs";
import { IWorkDocument } from "../src/tsa/document.ts";
import { PagesDocument } from "../src/pages/document.ts";
import { typeName } from "../src/tsp/registry.ts";
import { tablesOf } from "../src/tst/tables.ts";
import { Storage, TSWP_TYPE } from "../src/tswp/schema.ts";
import { Image, TSD_TYPE } from "../src/tsd/schema.ts";

/** TSD.ImageArchive.imageAdjustments = 14 — the "image filters" payload. */
const IMAGE_ADJUSTMENTS = 14;
const IMAGE_MASK = 5;

export interface FeatureInventory {
  file: string;
  app: string;
  era: string;
  formatVersion: string | undefined;
  appBuild: string | undefined;
  layout: string;
  objects: number;
  features: Record<string, number | boolean | string>;
  unsupported: string[];
}

function inventory(path: string): FeatureInventory {
  const bytes = new Uint8Array(readFileSync(path));
  const doc = IWorkDocument.open(bytes);
  const report = doc.compatibility();
  const features: Record<string, number | boolean | string> = {};

  // Shared: text storages by kind, images, charts, tables.
  const storages = doc.textStorages();
  features["textStorages"] = storages.length;
  features["nonEmptyStorages"] = storages.filter((s) => s.text.trim().length > 0).length;

  let images = 0;
  let imagesWithFilters = 0;
  let imagesWithMask = 0;
  let charts = 0;
  for (const { obj } of doc.store.allObjects()) {
    const name = typeName(obj.type, doc.app) ?? "";
    if (obj.type === TSD_TYPE.IMAGE) {
      images++;
      try {
        if (obj.message.has(IMAGE_ADJUSTMENTS)) imagesWithFilters++;
        if (obj.message.has(IMAGE_MASK)) imagesWithMask++;
      } catch {
        /* opaque payload */
      }
    }
    if (/^TSCH\..*(ChartArchive|ChartInfo)$/.test(name)) charts++;
  }
  features["images"] = images;
  features["imagesWithFilters"] = imagesWithFilters;
  features["imagesWithMask"] = imagesWithMask;
  features["charts"] = charts;

  const tables = tablesOf(doc.store);
  features["tables"] = tables.length;
  features["tableCellStorage"] = report.probe.cellStorage;
  features["readableTableCells"] = tables.filter((t) => t.hasReadableCells).length;

  // Text-level features across every storage.
  let links = 0;
  let smartFields = 0;
  let footnotes = 0;
  let comments = 0;
  let bookmarks = 0;
  let attachments = 0;
  let listParagraphs = 0;
  let changeTracked = 0;
  for (const s of storages) {
    try {
      links += s.links().length;
      smartFields += s.smartFields().length;
      footnotes += s.footnotes().length;
      comments += s.comments().length;
      bookmarks += s.bookmarks().length;
      attachments += s.attachments().length;
      const msg = s.object.message;
      if (msg.has(Storage.TABLE_INSERTION) || msg.has(Storage.TABLE_DELETION)) changeTracked++;
      const listTable = msg.getMessage(Storage.TABLE_LIST_STYLE);
      if (listTable) {
        for (const e of listTable.getMessages(1)) {
          if (e.getMessage(2) !== undefined) listParagraphs++;
        }
      }
    } catch {
      /* skip storages we cannot read */
    }
  }
  features["hyperlinks"] = links;
  features["smartFields"] = smartFields;
  features["footnotes"] = footnotes;
  features["comments"] = comments;
  features["bookmarks"] = bookmarks;
  features["inlineAttachments"] = attachments;
  features["listStyledParagraphs"] = listParagraphs;
  features["storagesWithChangeTracking"] = changeTracked;

  // Pages-specific.
  if (doc.app === "pages") {
    const pages = PagesDocument.load(bytes);
    features["isPageLayout"] = pages.isPageLayout;
    features["bodyChars"] = pages.bodyText.length;
    features["paragraphs"] = pages.paragraphs().length;
    const sections = pages.sections();
    features["sections"] = sections.length;
    let headerText = 0;
    let footerText = 0;
    let masterDrawables = 0;
    for (const s of sections) {
      for (const t of s.templates()) {
        headerText += t.headers.filter((h) => h.text.trim().length > 0).length;
        footerText += t.footers.filter((f) => f.text.trim().length > 0).length;
      }
      for (const m of s.masterDrawables()) masterDrawables += m.drawables.length;
    }
    features["nonEmptyHeaders"] = headerText;
    features["nonEmptyFooters"] = footerText;
    features["masterDrawables"] = masterDrawables;
    features["textBoxes"] = pages.textBoxes().length;
    features["namedParagraphStyles"] = pages.paragraphStyles().filter((s) => s.name).length;
    features["namedListStyles"] = pages.listStyles().length;
    const toc = [...doc.store.allObjects()].filter(({ obj }) =>
      /TOC(Info|Settings)Archive$/.test(typeName(obj.type, "pages") ?? ""),
    ).length;
    features["tocObjects"] = toc;
    features["hasTOC"] = toc > 0;
    features["shapeInfos"] = [...doc.store.allObjects()].filter(
      ({ obj }) => obj.type === TSWP_TYPE.SHAPE_INFO,
    ).length;
  }

  return {
    file: path,
    app: doc.app,
    era: report.era,
    formatVersion: report.formatVersion?.toString(),
    appBuild: report.appBuilds.at(-1),
    layout: report.probe.containerLayout,
    objects: doc.stats().objectCount,
    features,
    unsupported: report.unsupportedFeatures,
  };
}

/** Count of "interesting" features present — a crude fixture-quality score. */
export function featureScore(inv: FeatureInventory): number {
  const keys = [
    "imagesWithFilters",
    "imagesWithMask",
    "images",
    "charts",
    "readableTableCells",
    "hyperlinks",
    "footnotes",
    "comments",
    "bookmarks",
    "listStyledParagraphs",
    "storagesWithChangeTracking",
    "nonEmptyHeaders",
    "nonEmptyFooters",
    "masterDrawables",
    "textBoxes",
    "tocObjects",
  ];
  let score = 0;
  for (const k of keys) {
    const v = inv.features[k];
    if (typeof v === "number" && v > 0) score++;
    if (v === true) score++;
  }
  if ((inv.features["sections"] as number) > 1) score++;
  return score;
}

function main(): void {
  const args = process.argv.slice(2);
  const json = args.includes("--json");
  const files = args.filter((a) => !a.startsWith("--"));
  if (files.length === 0) {
    console.error("usage: node scripts/feature-probe.ts <file...> [--json]");
    process.exit(2);
  }
  const results: FeatureInventory[] = [];
  for (const file of files) {
    try {
      results.push(inventory(file));
    } catch (e) {
      if (json) results.push({ file, app: "error", era: "", formatVersion: undefined, appBuild: String((e as Error).message), layout: "", objects: 0, features: {}, unsupported: [] });
      else console.log(`${file}\n  ERROR: ${(e as Error).message}\n`);
    }
  }
  if (json) {
    console.log(JSON.stringify(results, null, 2));
    return;
  }
  for (const r of results) {
    console.log(
      `${r.file}\n  ${r.app} | era=${r.era} | format=${r.formatVersion ?? "-"} | build=${r.appBuild ?? "-"} | ${r.layout} | ${r.objects} objects | score=${featureScore(r)}`,
    );
    const present = Object.entries(r.features).filter(([, v]) => v !== 0 && v !== false);
    console.log("  " + present.map(([k, v]) => `${k}=${v}`).join("  "));
    if (r.unsupported.length) console.log("  unsupported: " + r.unsupported.join("; "));
    console.log();
  }
}

main();
