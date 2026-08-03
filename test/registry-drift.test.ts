/**
 * Two drift guards for the type registry.
 *
 * `src/tsp/registry.ts` is generated from `research/type-registry.json`,
 * but nothing regenerates it automatically — a hand edit to either side
 * would silently fork them. The first suite asserts the four bundled
 * tables and the JSON are the same id → name maps, entry for entry.
 *
 * The per-family `*_TYPE` tables are hand-kept shortlists of the ids the
 * code actually constructs or looks up, and a wrong id there produces
 * objects of the wrong class — valid, loadable, and meaningless. The
 * second suite maps every entry through `typeName()` and pins the archive
 * name it must resolve to, the same way chart-appearance pins
 * CHART_TYPE_NAMES. An entry added without a pin here fails the test by
 * name, which is the reminder to state what the id is expected to be.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "./harness.ts";
import {
  KEYNOTE_TYPES,
  NUMBERS_TYPES,
  PAGES_TYPES,
  SHARED_TYPES,
  typeName,
  type IWorkApp,
} from "../src/tsp/registry.ts";
import { TSP_TYPE } from "../src/tsp/schema.ts";
import { TSS_TYPE } from "../src/tss/schema.ts";
import { TSD_TYPE } from "../src/tsd/schema.ts";
import { TSWP_TYPE } from "../src/tswp/schema.ts";
import { COMMENT_TYPE } from "../src/tswp/comments.ts";
import { ATTACHMENT_TYPE } from "../src/tswp/fields.ts";
import { TOC_TYPE } from "../src/tswp/toc.ts";
import { TST_TYPE } from "../src/tst/tables.ts";
import { TST_STYLE_TYPE } from "../src/tst/styles.ts";
import { TSCH_TYPE } from "../src/tsch/charts.ts";
import { BUILD_TYPE } from "../src/keynote/builds.ts";

const REGISTRY_JSON = JSON.parse(
  readFileSync(new URL("../research/type-registry.json", import.meta.url), "utf8"),
) as {
  shared: Record<string, string>;
  pages: Record<string, string>;
  keynote: Record<string, string>;
  numbers: Record<string, string>;
};

describe("src/tsp/registry.ts matches research/type-registry.json", () => {
  const sections: [string, Record<string, string>, Readonly<Record<number, string>>][] = [
    ["shared", REGISTRY_JSON.shared, SHARED_TYPES],
    ["pages", REGISTRY_JSON.pages, PAGES_TYPES],
    ["keynote", REGISTRY_JSON.keynote, KEYNOTE_TYPES],
    ["numbers", REGISTRY_JSON.numbers, NUMBERS_TYPES],
  ];
  for (const [name, json, table] of sections) {
    it(`keeps the ${name} table in lockstep`, () => {
      expect({ ...table }).toEqual(json);
    });
  }
});

/**
 * Every `*_TYPE` entry, with the archive name its id must resolve to.
 * Keys are `TABLE.ENTRY`; the loop below fails on any entry missing here.
 */
const EXPECTED_NAMES: Readonly<Record<string, string>> = {
  "TSP_TYPE.PACKAGE_METADATA": "TSP.PackageMetadata",
  "TSP_TYPE.PASTEBOARD_METADATA": "TSP.PasteboardMetadata",
  "TSS_TYPE.STYLESHEET": "TSS.StylesheetArchive",
  "TSS_TYPE.THEME": "TSS.ThemeArchive",
  "TSD_TYPE.IMAGE": "TSD.ImageArchive",
  "TSD_TYPE.MASK": "TSD.MaskArchive",
  "TSD_TYPE.COMMENT_STORAGE": "TSD.CommentStorageArchive",
  "TSWP_TYPE.STORAGE": "TSWP.StorageArchive",
  "TSWP_TYPE.DRAWABLE_ATTACHMENT": "TSWP.DrawableAttachmentArchive",
  "TSWP_TYPE.FOOTNOTE_REF_ATTACHMENT": "TSWP.FootnoteReferenceAttachmentArchive",
  "TSWP_TYPE.SHAPE_INFO": "TSWP.ShapeInfoArchive",
  "TSWP_TYPE.HIGHLIGHT": "TSWP.HighlightArchive",
  "TSWP_TYPE.CHARACTER_STYLE": "TSWP.CharacterStyleArchive",
  "TSWP_TYPE.PARAGRAPH_STYLE": "TSWP.ParagraphStyleArchive",
  "TSWP_TYPE.LIST_STYLE": "TSWP.ListStyleArchive",
  "TSWP_TYPE.COLUMN_STYLE": "TSWP.ColumnStyleArchive",
  "TSWP_TYPE.HYPERLINK_FIELD": "TSWP.HyperlinkFieldArchive",
  "TSWP_TYPE.BOOKMARK_FIELD": "TSWP.BookmarkFieldArchive",
  "COMMENT_TYPE.HIGHLIGHT": "TSWP.HighlightArchive",
  "COMMENT_TYPE.COMMENT_STORAGE": "TSD.CommentStorageArchive",
  "COMMENT_TYPE.AUTHOR": "TSK.AnnotationAuthorArchive",
  "COMMENT_TYPE.AUTHOR_STORAGE": "TSK.AnnotationAuthorStorageArchive",
  "ATTACHMENT_TYPE.NUMBER": "TSWP.NumberAttachmentArchive",
  "ATTACHMENT_TYPE.TEXTUAL": "TSWP.TextualAttachmentArchive",
  "TOC_TYPE.ENTRY_STYLE": "TSWP.TOCEntryStyleArchive",
  "TOC_TYPE.SETTINGS": "TSWP.TOCSettingsArchive",
  "TOC_TYPE.ENTRY_INSTANCE": "TSWP.TOCEntryInstanceArchive",
  "TOC_TYPE.INFO": "TSWP.TOCInfoArchive",
  "TOC_TYPE.ATTACHMENT": "TSWP.TOCAttachmentArchive",
  "TST_TYPE.TABLE_INFO": "TST.TableInfoArchive",
  "TST_TYPE.TABLE_MODEL": "TST.TableModelArchive",
  "TST_TYPE.TILE": "TST.Tile",
  "TST_TYPE.MERGE_REGION_MAP": "TST.MergeRegionMapArchive",
  "TST_STYLE_TYPE.TABLE_STYLE": "TST.TableStyleArchive",
  "TST_STYLE_TYPE.CELL_STYLE": "TST.CellStyleArchive",
  "TST_STYLE_TYPE.DATA_LIST": "TST.TableDataList",
  "TSCH_TYPE.CHART_DRAWABLE": "TSCH.ChartDrawableArchive",
  "TSCH_TYPE.PREUFF_CHART_INFO": "TSCH.PreUFF.ChartInfoArchive",
  "TSCH_TYPE.CHART_STYLE": "TSCH.ChartStyleArchive",
  "TSCH_TYPE.LEGEND_STYLE": "TSCH.LegendStyleArchive",
  "TSCH_TYPE.AXIS_STYLE": "TSCH.ChartAxisStyleArchive",
  "TSCH_TYPE.SERIES_STYLE": "TSCH.ChartSeriesStyleArchive",
  "BUILD_TYPE.BUILD": "KN.BuildArchive",
  "BUILD_TYPE.BUILD_CHUNK": "KN.BuildChunkArchive",
};

describe("every *_TYPE entry resolves to the archive it claims", () => {
  const tables: { name: string; table: Readonly<Record<string, number>>; app?: IWorkApp }[] = [
    { name: "TSP_TYPE", table: TSP_TYPE },
    { name: "TSS_TYPE", table: TSS_TYPE },
    { name: "TSD_TYPE", table: TSD_TYPE },
    { name: "TSWP_TYPE", table: TSWP_TYPE },
    { name: "COMMENT_TYPE", table: COMMENT_TYPE },
    { name: "ATTACHMENT_TYPE", table: ATTACHMENT_TYPE },
    { name: "TOC_TYPE", table: TOC_TYPE },
    { name: "TST_TYPE", table: TST_TYPE },
    { name: "TST_STYLE_TYPE", table: TST_STYLE_TYPE },
    { name: "TSCH_TYPE", table: TSCH_TYPE },
    { name: "BUILD_TYPE", table: BUILD_TYPE, app: "keynote" },
  ];
  for (const { name, table, app } of tables) {
    it(`pins ${name}`, () => {
      const wrong: string[] = [];
      for (const [key, id] of Object.entries(table)) {
        const expected = EXPECTED_NAMES[`${name}.${key}`];
        const actual = typeName(id, app);
        if (expected === undefined) wrong.push(`${name}.${key} (${id}) has no pinned name`);
        else if (actual !== expected) {
          wrong.push(`${name}.${key} (${id}) → ${actual ?? "unknown"}, pinned ${expected}`);
        }
      }
      expect(`mismatches: ${wrong.join(" | ")}`).toBe("mismatches: ");
    });
  }
});
