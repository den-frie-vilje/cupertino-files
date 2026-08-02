# iWork file-format version survey

Compiled 2026-07-30. Purpose: give the parser a concrete, evidence-based model of what
changes between iWork format eras, using real files rather than assumptions.

Every claim below was measured by decompressing the IWA components (raw Snappy → the
`TSP.ArchiveInfo` / `TSP.MessageInfo` framing → generic protobuf field walk) and reading
`Metadata/Properties.plist` + `Metadata/BuildVersionHistory.plist` as binary plists.
Where something was not observed, this document says **"not observed"** rather than guessing.

## Version-marker vocabulary

- **`fileFormatVersion`** — `Metadata/Properties.plist`. Per-app numbering, *not* the app
  version. Numbers 15.1 writes `26.0.0`; Numbers 15.2/15.2.1 write `26.1.0`.
- **BuildVersionHistory** — `Metadata/BuildVersionHistory.plist`, an *append-only array*.
  Element 0 is the origin (`Template: Blank (11.2)`, or an import marker: `xlsx`, `csv`,
  `docx`). Later elements name each app build that saved the file:
  `M<ver>-<build>-<n>` = macOS, `T<ver> (<build>)` = iOS/iPadOS, `G-r<rev>-<build>` =
  iCloud/web. The **last** element is the writer that produced the bytes on disk.
- The two disagree deliberately: a file can be `fileFormatVersion` 26.1.0 with a
  BuildVersionHistory 180 entries long reaching back to a 2014 build.

## Newest available in open source (as of 2026-07-30)

| App | Newest `fileFormatVersion` found | Newest app build found | Where |
|---|---|---|---|
| Numbers | **26.1.0** | **`M15.2.1-7048.0.3-2`** (Numbers 15.2.1) | masaccio/numbers-parser `tests/data/` |
| Pages | 14.4.1 | `M14.5-7045.0.17-4` (Pages 14.5) | reichenbach/iwork_mcp `examples/sample.pages` |
| Keynote | 14.4.1 | `M14.5-7045.0.17-4` (Keynote 14.5) | reichenbach/iwork_mcp `examples/sample.key` |

**No `.pages` or `.key` with a 26.x `fileFormatVersion` exists in any open-source repository
surveyed.** The 26.x format is represented only by Numbers files. Repos checked and what they
had: `masaccio/numbers-parser` (89 files, Numbers only, up to 26.1.0);
`reichenbach/iwork_mcp` (4 files, all three apps, 14.5-era — the newest Pages/Keynote found);
`orcastor/iwork-converter` (3 files, best is Pages 14.1); `psobot/keynote-parser`
(3 files, best is Keynote 10.1); `apache/tika` (23 files, 2013-2018 era);
`LibreOffice/libetonyek` (13 files + directory packages, 2013-2018 era);
`6over3/WorkKit` and `openpreserve/format-corpus` ship **no** iWork documents;
`kreuzberg-dev/kreuzberg` ships none either.

For context, `numbers-parser`'s `src/numbers_parser/constants.py` declares
`SUPPORTED_NUMBERS_VERSIONS` as `10.0`–`14.5` plus `26.0`–`26.3` (commented
"Numbers Creator Studio"). Files saved by `26.2`/`26.3` were **not observed** — the newest
actually present is 26.1.0.

## Files inspected

Structural analysis of every file below; `sv` = `storage_version`, `bnc` =
`Tile.last_saved_in_BNC`, `f6` = count of `TST.TileRowInfo` populating field 6
(`cell_storage_buffer`) out of total row infos. "unresolved type ids" = `TSP.MessageInfo.type`
values with no name in `research/type-registry.json` for that app.

| file | app | `fileFormatVersion` | app build (BuildVersionHistory) | container layout | cell storage generation | `styles_for_*` in stylesheets | unresolved type ids |
|---|---|---|---|---|---|---|---|
| `numbers-parser-v26.1-date-formats.numbers` | numbers | 26.1.0 | Template: Blank (dev/15.3) ; M15.2.1-7048.0.3-2 | Index/*.iwa, 43 entries | Tile.sv=[5] bnc=[True] / row.sv=[5] f6=11/11 | 10_0,10_1 | 0 |
| `numbers-parser-v26.1-custom-formats.numbers` | numbers | 26.1.0 | Template: Blank (11.2) ... M15.2.1-7048.0.3-2 (5 entries) | Index/*.iwa, 73 entries | Tile.sv=[5] bnc=[True] / row.sv=[5] f6=163/163 | 10_0,10_1 | 0 |
| `numbers-parser-v26.1-xlsx-lineage.numbers` | numbers | 26.1.0 | xlsx ... M15.2.1-7048.0.3-2 (144 entries) | Index/*.iwa, Data/, 51 entries | Tile.sv=[5] bnc=[True] / row.sv=[5] f6=41/41 | 10_0,10_1 | 0 |
| `numbers-parser-v26.1-form-sheet.numbers` | numbers | 26.1.0 | Template: Blank (11.2) ... M15.2-7046.0.71-2 (180 entries) | Index/*.iwa, 43 entries | Tile.sv=[5] bnc=[True] / row.sv=[5] f6=15/15 | 10_0,10_1 | 0 |
| `issue-131.numbers` | numbers | 26.1.0 | xlsx ... M15.2.1-7048.0.3-2 (67 entries) | Index/*.iwa, Data/, 81 entries | Tile.sv=[5] bnc=[True] / row.sv=[5] f6=22/22 | 10_0,10_1 | 0 |
| `numbers-parser-v26.0-categories.numbers` | numbers | 26.0.0 | Template: Blank (11.2) ... M15.1-7044.0.271-2 (3 entries) | Index/*.iwa, 343 entries | Tile.sv=[5] bnc=[True] / row.sv=[5] f6=341/341 | 10_0,10_1 | 0 |
| `numbers-parser-v26.0-issue102.numbers` | numbers | 26.0.0 | csv ... M15.1-7044.0.271-2 (22 entries) | Index/*.iwa, 43 entries | Tile.sv=[5] bnc=[True] / row.sv=[5] f6=7/7 | 10_0,10_1 | 0 |
| `numbers-parser-v14.4-issue102.numbers` | numbers | 14.4.1 | csv ... M14.5-7045.0.17-4 (21 entries) | Index/*.iwa, 43 entries | Tile.sv=[5] bnc=[True] / row.sv=[5] f6=7/7 | 10_0,10_1 | 0 |
| `test-styles.numbers` | numbers | 14.4.1 | Template: Blank (11.2) ... M14.5-7045.0.17-4 (3 entries) | Index/*.iwa, Data/, 133 entries | Tile.sv=[5] bnc=[True] / row.sv=[5] f6=56/56 | 10_0,10_1 | 0 |
| `iwork-mcp-v14.5-earnings.numbers` | numbers | 14.4.1 | Template: Blank (11.2) ; M14.5-7045.0.17-4 | Index/*.iwa, 223 entries | Tile.sv=[5] bnc=[True] / row.sv=[5] f6=61/61 | 10_0,10_1 | 0 |
| `sample.numbers` | numbers | 14.4.1 | Template: Blank (11.2) ; M14.5-7045.0.17-4 | Index/*.iwa, 43 entries | Tile.sv=[5] bnc=[True] / row.sv=[5] f6=5/5 | 10_0,10_1 | 0 |
| `a.numbers` | numbers | 11.1.2 | csv ; M11.1-7031.0.102-2 | Index/*.iwa, 74 entries | Tile.sv=[5] bnc=[True] / row.sv=[5] f6=21/21 | 10_0,10_1 | 0 |
| `pre-bnc.numbers` | numbers | 13.1.2 | Template: Blank (11.2) ... M13.1-7037.0.101-2 (3 entries) | Index/*.iwa, 44 entries | Tile.sv=[5] bnc=[False, True] / row.sv=[5] f6=1/12 | 10_0,10_1 | 0 |
| `tika-testNumbers2013.numbers` | numbers | 2.0.24 | Template: Blank (2015-09-16 11:33) ; T2.6.1 (2163) | Index/*.iwa, 53 entries | Tile.sv=[0] bnc=[] / row.sv=[4] f6=0/24 | none | - |
| `numbers3-file.numbers` | numbers | 1.5.0 | TE-v1.5.0 (Dec 10 2014) ; M3.5.3-2150-2 | Index/*.iwa, 27 entries | Tile.sv=[0] bnc=[] / row.sv=[3] f6=0/3 | none | 6219 |
| `iwork-mcp-v14.5-sample.pages` | pages | 14.4.1 | Template: Blank (13.2) ; M14.5-7045.0.17-4 | Index/*.iwa, 13 entries | no tiles | 10_0,10_1 | - |
| `a.pages` | pages | 14.1.1 | docx ... M14.1-7040.0.73-4 (3 entries) | Index/*.iwa, Data/, 50 entries | Tile.sv=[5] bnc=[True] / row.sv=[5] f6=11/11 | 10_0,10_1 | - |
| `libetonyek-pages5-extra-dir.pages` | pages | 3.2.13 | Template: 02_Modern_Business_Project_Proposal (2018-07-09 14:14) ; G-r320-3C102 | wrapper `Project Proposal.pages/`, inner Index.zip, Data/, 11 entries | Tile.sv=[5] bnc=[True] / row.sv=[5] f6=6/6 | none | - |
| `tika-testPages2013.pages` | pages | 2.0.24 | Template: Blank (2015-09-16 11:13) ; T2.6.1 (2160) | Index/*.iwa, 26 entries | Tile.sv=[0] bnc=[] / row.sv=[4] f6=0/4 | none | - |
| `libetonyek-pages5-file.pages` | pages | 1.5.0 | Template: Blank (2014-07-09 11:15) ; M5.5.3-2152-2 | Index/*.iwa, 14 entries | no tiles | none | 608 |
| `tika-iwork09-testPages.pages` | pages | None | - | 4 entries | no tiles | none | - |
| `iwork-mcp-v14.5-sample.key` | keynote | 14.4.1 | Template: 21_BasicWhite (13.2) ; M14.5-7045.0.17-4 | Index/*.iwa, Data/, 57 entries | no tiles | 10_0,10_1,12_1 | - |
| `unicode-asset-filename.key` | keynote | 10.1.8 | Template: 21_BasicWhite (10.0) ... M10.1-6913-2 (3 entries) | Index/*.iwa, Data/, 18 entries | no tiles | 10_0,10_1 | - |
| `table.key` | keynote | 4.2.3 | Template: White (4.1) ; M9.2-6520-2 | Index/*.iwa, Data/, 47 entries | Tile.sv=[5] bnc=[True] / row.sv=[] f6=0/0 | none | - |
| `tika-testKeynote2018.key` | keynote | 3.2.13 | Template: New_Template5 (2018-02-21 14:36) ; G-r320-3D139 | wrapper `Presentation.key/`, inner Index.zip, Data/, 7 entries | no tiles | none | - |
| `simple-oneslide.key` | keynote | 3.2.13 | Template: White (2018-02-21 14:41) ; M8.3-5989-2 | Index/*.iwa, Data/, 42 entries | no tiles | none | - |
| `a.key` | keynote | 3.1.2 | Template: Black (2018-02-21 14:27) ; M8.1-5683-2 | Index/*.iwa, Data/, 43 entries | no tiles | none | - |
| `tika-testKeynote2013.key` | keynote | 2.0.24 | Template: White (2015-09-16 11:52) ; T2.6.1 (2180) | Index/*.iwa, Data/, 62 entries | Tile.sv=[0] bnc=[] / row.sv=[4] f6=0/3 | none | - |
| `keynote6-file.key` | keynote | 1.5.0 | Template: White (2014-07-17 17:01) ; M6.5.3-2151-2 | Index/*.iwa, Data/, 42 entries | no tiles | none | - |

Rows named after a bare original filename were inspected but **not** copied into `fixtures/`:
`test-styles.numbers`, `issue-131.numbers`, `pre-bnc.numbers` (masaccio/numbers-parser);
`sample.numbers` (reichenbach/iwork_mcp); `a.numbers`, `a.pages`, `a.key`
(orcastor/iwork-converter); `unicode-asset-filename.key`, `table.key`, `simple-oneslide.key`
(psobot/keynote-parser); `keynote6-file.key`, `numbers3-file.numbers`
(LibreOffice/libetonyek). Every other row is a file now in `fixtures/`.

`masaccio/numbers-parser` holds 89 `.numbers` files in total. Ten of them got the full
structural pass above; the remaining 79 were surveyed for version markers only (see the
appendix), except that seven of those — `test-6`, `test-9`, `test-4`, `test-save-1`,
`date_formats`, `issue-44`, `test-hlinks` — also had a targeted check for the type-`0`
ViewState archive described in section 6.

---

# What changes between eras

Five concrete, independently-checkable era signals emerged. Ordered by how load-bearing they
are for a parser.

## 1. Cell storage generation (the BNC transition)

This is the big one, and the observed timeline is:

| Era (by `fileFormatVersion`) | `Tile.storage_version` (f6) | `Tile.last_saved_in_BNC` (f7) | `TileRowInfo.storage_version` (f5) | `TileRowInfo` field 6 |
|---|---|---|---|---|
| 1.5.0 (Numbers 3.5.3, 2014) | absent | absent | **3** | empty |
| 2.0.24 (iWork 2015/2016) | **0** | absent | **4** | empty |
| 3.2.13 (2018) and everything newer, through 26.1.0 | **5** | **true** | **5** | populated |

So the BNC switch landed between `fileFormatVersion` 2.0.24 (last observed 2016-era save) and
3.2.13 (2018-era save); no file in the corpus sits between those two, so it cannot be dated
more precisely from this evidence.

**The important trap: modern files still write the pre-BNC fields.** Field 3
(`cell_storage_buffer_pre_bnc`) and field 4 (`cell_offsets_pre_bnc`) are `required` in the
schema and are *always present*, in every 26.1.0 file. Concretely, in
`numbers-parser-v26.1-date-formats.numbers` a row with 2 cells has:

```
f3 (cell_storage_buffer_pre_bnc) = 24 bytes   <- 2 cells x 12 bytes, all `04 00 00 00 00 00 00 00 00 00 00 00`
f4 (cell_offsets_pre_bnc)        = 510 bytes  <- 255 x uint16 placeholder offset table
f6 (cell_storage_buffer)         = 56 bytes   <- the real data
f7 (cell_offsets)                = 510 bytes  <- the real offsets
```

Field 3 in modern files is exactly `cell_count x 12` bytes of the repeating placeholder
record `04 00 00 00 00 00 00 00 00 00 00 00` — a "storage version 4, empty cell" stub.
This was verified across `numbers-parser-v26.1-date-formats.numbers`,
`iwork-mcp-v14.5-earnings.numbers` and `numbers-parser-v26.0-categories.numbers`.
By contrast, in the genuinely pre-BNC `tika-testNumbers2013.numbers`, field 3 holds real
variable-length payloads (52 / 124 / 164 bytes for rows of 2 / 6 / 6 cells) and fields 6
and 7 are **zero-length**.

Therefore:

- **Do not** test for BNC with "field 3 is absent/empty" — that is false for every modern file.
- **Do** test `Tile.storage_version == 5` (or `last_saved_in_BNC == true`), and read field 6
  when `TileRowInfo.storage_version == 5`.
- `Tile.storage_version` is a reliable discriminator on its own: `0` in the 2013-era files,
  `5` in every modern one, absent in the 2014 file.

Two corpus caveats worth encoding in tests:

- `numbers-parser`'s own `tests/data/pre-bnc.numbers` (`fileFormatVersion` 13.1.2) is
  **not an Apple-written pre-BNC file**. It is a synthetic mix: three tiles, some with
  `last_saved_in_BNC = false` and some `true`, only 1 of 12 row infos carrying field 6, and
  its field-3 stub is 4 bytes — the UTF-8 encoding of the cowboy emoji, which is literally
  `numbers-parser`'s `DEFAULT_PRE_BNC_BYTES = "\N{FACE WITH COWBOY HAT}".encode()`
  (`src/numbers_parser/constants.py:27`). Use it to test the *rejection* path, not as a
  sample of what Numbers 13 wrote.
- `has_wide_offsets` / `should_use_wide_rows` are **not** era markers. They were observed
  `true` in `test-styles.numbers` (14.4.1) and `pre-bnc.numbers` (13.1.2), and absent from
  every 26.x file examined. They track table width, not version.

## 2. `Properties.plist` key set

A clean, monotonic progression that dates a file without opening any IWA:

| `fileFormatVersion` | keys | change from previous |
|---|---|---|
| 1.5.0 | 8 | baseline + `language`, `locale` |
| 2.0.24 – 10.1.8 | 6 | `language`/`locale` dropped; `documentUUID`, `fileFormatVersion`, `isMultiPage`, `revision`, `shareUUID`, `versionUUID` |
| 11.0.3 – 12.1.1 | 7 | **+ `privateUUID`** |
| 12.2.8 – 14.1.1 | 8 | **+ `stableDocumentUUID`** |
| 14.2.2 – 26.0.0 | 9 | **+ `hasExternalReferenceOrMissingOrUnmaterializedRemoteData`** |
| **26.1.0** | **10** | that key is **split into two**: `hasExternalReferenceOrMissingData` + `hasUnmaterializedRemoteData` |

The 26.1.0 split is the single cheapest way to detect the newest writer, and it is a real
breaking rename — code matching the old combined key literally will silently miss it on
26.1.0 files. Note it does **not** coincide with the 14.x→26.x jump: 26.0.0 still uses the
old combined key.

(One 3.2.13 Pages file, `libetonyek-pages5-extra-dir.pages`, has only 5 keys — it lacks
`isMultiPage`. Pages omits `isMultiPage` where Numbers/Keynote include it, so treat key
count as app-relative.)

## 3. `styles_for_*` versioned-style snapshots

`TSS.StylesheetArchive` gained optional `VersionedStyles` sub-messages at fields 7+
(`styles_for_10_0` = field 7 … `styles_for_14_4` = field 22).

- **Absent entirely** in every file at `fileFormatVersion` ≤ 4.2.3. Those stylesheets use
  only fields `[1, 2, 4, 5, 6]` (and 1.5.0 additionally uses field 3, `parent`, which later
  files stop writing).
- **First observed** at `fileFormatVersion` 10.1.8 (`unicode-asset-filename.key`,
  Keynote 10.1): fields `[1, 2, 4, 5, 6, 7, 8]` → `styles_for_10_0` and `styles_for_10_1`.
- Every modern file — 14.4.1 and 26.0.0/26.1.0 alike — carries **exactly** `styles_for_10_0`
  and `styles_for_10_1` and nothing else. That is stable across the whole 10.1 → 26.1 range.
- The single exception observed: `iwork-mcp-v14.5-sample.key` also sets field 14
  (`styles_for_12_1`), i.e. three snapshots.
- **No file writes a stylesheet field above 22.** No `styles_for_15_*` or `styles_for_26_*`
  was observed, including in the 26.1.0 files. `proto/current/TSSArchives.proto`, which stops
  at `styles_for_14_4`, is therefore sufficient for everything in this corpus. Whether
  Numbers 15.3+ adds new fields is **not observed**.

## 4. Archive type inventory

Comparing the 2013-era files against the newest per app (all resolved through
`research/type-registry.json` with the correct per-app namespace):

Appearing in the 26.x Numbers files but **not** in `tika-testNumbers2013.numbers`:
`TN.FormBasedSheetArchive` (3), `TSA.CaptionInfoArchive` (633), `TSA.CaptionPlacementArchive`
(634), `TSWP.ColumnStyleArchive` (2024), `TSWP.NumberAttachmentArchive` (2043),
`TSD.FreehandDrawingToolkitUIState` (3091), `TSD.StandinCaptionArchive` (3097),
`TSCE.FormulaOwnerDependenciesArchive` (4008), `TSCE.CellRecordTileArchive` (4009),
`TSCE.RangePrecedentsTileArchive` (4010), `TSCE.ReferencesToDirtyArchive` (4011),
`TST.RichTextPayloadArchive` (6218), `TST.SummaryModelArchive` (6316),
`TST.SummaryCellVendorArchive` (6317), `TST.CategoryOrderArchive` (6318),
`TST.HeaderNameMgrTileArchive` (6365), `TST.HeaderNameMgrArchive` (6366),
`TST.CategoryOwnerRefArchive` (6372), `TST.GroupByArchive` (6373),
`TST.GroupByArchive.GroupNodeArchive` (6383), `TSWP.DropCapStyleArchive` (10024),
`TSP.DataMetadata` (11014), `TSP.DataMetadataMap` (11015), `TN.FormSelectionArchive` (12040),
`TN.SheetStyleArchive` (12050).

Present in 2013 but **gone** from the 26.x files: `2011`, `2014`, `5021`
(`TSCH.ChartDrawableArchive`), `5023`, `5025`, `5027`, `5029`, `6206`, `11008`, `12006`.

New in Keynote 14.5 vs 2013: `KN.DesktopUILayoutArchive` (23),
**`KN.MotionBackgroundStyleArchive` (26)**, **`KN.LiveVideoSource` (184)** /
`KN.LiveVideoSourceCollection` (185), `TSD.MovieArchive` (3007), plus the shared
`TSCE.*` / `TSP.DataMetadata*` / `TSWP.DropCapStyleArchive` group.
New in Pages 14.5 vs 2013: `TSK.DocumentSelectionArchive` (219),
`TSK.PencilAnnotationUIState` (258), `TSWP.FlowInfoContainerArchive` (2411),
`TSD.GuideStorageArchive` (3047), `TP.CanvasSelectionArchive` (10132), plus the same shared group.

The `TSCE.*` and `TSP.DataMetadata*` families showing up "new" across all three apps is the
clearest cross-app signal: the calculation-engine dependency graph and the data-asset
metadata map are modern-era additions present in every 14.x/26.x file and in none of the
2013-era ones.

## 5. Container and component naming

- **Legacy iWork '09** (`fileFormatVersion` absent): `index.xml` / `index.apxl` (optionally
  `.gz`), `buildVersionHistory.plist`, `QuickLook/`. No IWA at all. Only
  `tika-iwork09-testPages.pages` in `fixtures/`.
- **Wrapper-dir + inner `Index.zip`**: seen in the 2018-era files (`fileFormatVersion` 3.2.13)
  — `Presentation.key/Index.zip`, `Project Proposal.pages/Index.zip`. **Every** 14.4.1 and
  26.x file examined is instead a flat zip with top-level `Index/*.iwa` (+ `Index/Tables/`).
  The nested variant was not observed in any modern file, but it must still be supported for
  the older ones.
- All 26.x/14.5 files store zip entries **uncompressed** (`compress_type = 0`); the zip is a
  container only, since IWA payloads are already Snappy-compressed.
- **Keynote slide components renamed**: `MasterSlide-*.iwa` in `tika-testKeynote2013.key`
  vs **`TemplateSlide-*.iwa`** in `iwork-mcp-v14.5-sample.key` (18 of them). A parser keying
  off component filenames needs both spellings.
- Directory-form packages (a `.numbers`/`.pages`/`.key` *folder* rather than a zip, containing
  `Index.zip` + `Metadata/`, or an unzipped `Index/`) exist in both `numbers-parser` and
  `libetonyek` test data at 11.0.3–13.2.1. Not observed at 26.x, but nothing suggests it was
  removed — the corpus simply has no modern example.

## 6. A type id of `0` that is not an error

Numbers files at `fileFormatVersion` ≥ 11.0.3 contain, inside `Index/ViewState*.iwa`, a
`TSP.MessageInfo` with **`type = 0`** and the sentinel version triple
**`[65535, 65535, 4294967295]`** (`0xFFFF, 0xFFFF, 0xFFFFFFFF`). Its payload is a single
length-delimited field 28. It is present in every Numbers file from 11.0.3 through 26.1.0
that was checked (11.0.3, 11.1.2, 11.2.9, 12.0.8, 12.1.1, 12.2.8, 13.0.2, 13.1.2, 14.4.1,
26.0.0, 26.1.0) and **absent** from the 2013-era `tika-testNumbers2013.numbers`.

It is the only unresolved type id in any modern file. A parser must tolerate type 0 rather
than treating it as a corrupt archive. The only other unresolved ids in the whole corpus are
in 2014-era files: `608` in `libetonyek-pages5-file.pages` and `6219` in
`numbers3-file.numbers` (both `fileFormatVersion` 1.5.0) — retired types the registry, which
was built from modern-era sources, never learned.

## Things explicitly NOT observed

- No `.pages` or `.key` at `fileFormatVersion` 26.x anywhere.
- No Numbers file at `fileFormatVersion` 26.2 or 26.3, despite `numbers-parser` declaring
  support for them.
- No `TSS.StylesheetArchive` field above 22 (no `styles_for_15_*` / `styles_for_26_*`).
- No change observed in the IWA container framing itself between eras: every file, 2013
  through 26.1.0, uses the same 4-byte chunk header (`0x00` + 3-byte little-endian
  compressed length) wrapping raw-Snappy blocks, and the same
  `varint(len) ArchiveInfo` + concatenated-payloads stream layout.
- No change observed in `Tile` / `TileRowInfo` *message-level* versioning: the
  `TSP.MessageInfo.version` triple for `TST.Tile` (type 6002) is `[1, 0, 5]` in both
  `tika-testNumbers2013.numbers` and the 26.1.0 files, even though the cell storage
  generation inside differs. Message versions are not a usable era signal here.

## Method / reproducing

The analysis scripts (pure stdlib: raw-Snappy decompressor, IWA chunk reader, generic
protobuf field walker, and per-app type resolution against `research/type-registry.json`)
were written to this session's scratchpad, not committed. Rebuilding them needs only
`zipfile` + `plistlib` plus ~120 lines of Snappy/protobuf; no third-party packages, and the
project's own `src/base/snappy.ts` + `src/tsp/iwa.ts` already implement the equivalent.

---

# Appendix: `masaccio/numbers-parser` full version census

All 89 `.numbers` files at commit `2dd9dbe3f8f3440bbd19e23668d5ade72a2e1629`, version markers
only (the five files with no readable `Properties.plist` are deliberate corruption fixtures).
Sorted newest first.

| file | `fileFormatVersion` | last build in BuildVersionHistory | BVH len |
|---|---|---|---|
| `issue-104.numbers` | 26.1.0 | `M15.2-7046.0.71-2` | 180 |
| `issue-131.numbers` | 26.1.0 | `M15.2.1-7048.0.3-2` | 67 |
| `date-format-nospace.numbers` | 26.1.0 | `M15.2.1-7048.0.3-2` | 2 |
| `test-custom-formats.numbers` | 26.1.0 | `M15.2.1-7048.0.3-2` | 5 |
| `issue-121.numbers` | 26.1.0 | `M15.2.1-7048.0.3-2` | 144 |
| `test-categories.numbers` | 26.0.0 | `M15.1-7044.0.271-2` | 3 |
| `issue-102-v15.1.numbers` | 26.0.0 | `M15.1-7044.0.271-2` | 22 |
| `test-styles.numbers` | 14.4.1 | `M14.5-7045.0.17-4` | 3 |
| `test-xref-coverage.numbers` | 14.4.1 | `M14.5-7045.0.17-4` | 2 |
| `issue-102-v14.4.numbers` | 14.4.1 | `M14.5-7045.0.17-4` | 21 |
| `issue-99.numbers` | 14.4.1 | `M14.4-7043.0.93-4` | 2 |
| `test-10.numbers` | 14.2.2 | `M14.3-7042.0.76-4` | 3 |
| `create-formulas.numbers` | 14.2.2 | `M14.3-7042.0.76-4` | 2 |
| `test-issue-93.numbers` | 14.2.2 | `-` | 0 |
| `issue-42.numbers` | 14.2.2 | `M14.3-7042.0.76-4` | 3 |
| `formula-decode-debug.numbers` | 14.2.2 | `M14.3-7042.0.76-4` | 2 |
| `empty.numbers` | 14.1.1 | `M14.1-7040.0.73-4` | 4 |
| `test-titles.numbers` | 14.1.1 | `M14.1-7040.0.73-4` | 4 |
| `issue-96.numbers` | 14.1.1 | `M14.1-7040.0.73-4` | 2 |
| `matches.numbers` | 14.1.1 | `M14.1-7040.0.73-4` | 4 |
| `format-1.numbers` | 14.1.1 | `M14.1-7040.0.73-4` | 4 |
| `issue-80.numbers` | 13.2.1 | `M13.2-7038.0.87-4` | 13 |
| `test-issue-75.numbers` | 13.2.1 | `M13.2-7038.0.87-4` | 2 |
| `test-package.numbers` | 13.2.1 | `M13.2-7038.0.87-4` | 4 |
| `custom-formats1.numbers` | 13.2.1 | `M13.2-7038.0.87-4` | 2 |
| `custom-formats2.numbers` | 13.2.1 | `M13.2-7038.0.87-4` | 2 |
| `issue-77.numbers` | 13.2.1 | `M13.2-7038.0.87-4` | 6 |
| `test-pivot.numbers` | 13.2.1 | `M13.2-7038.0.87-4` | 2 |
| `test-actions.numbers` | 13.2.1 | `M13.2-7038.0.87-4` | 2 |
| `test-issue-74.numbers` | 13.2.1 | `M13.2-7038.0.87-4` | 2 |
| `issue-73.numbers` | 13.2.1 | `M13.2-7038.0.87-4` | 2 |
| `issue-69b.numbers` | 13.2.1 | `M13.2-7038.0.87-4` | 2 |
| `mapping.numbers` | 13.2.1 | `M13.2-7038.0.87-4` | 2 |
| `test-format-save.numbers` | 13.1.2 | `M13.1-7037.0.101-2` | 2 |
| `simple-func.numbers` | 13.1.2 | `M13.1-7037.0.101-2` | 3 |
| `issue-66-collab.numbers` | 13.1.2 | `M13.1-7037.0.101-2` | 112 |
| `custom-format-stress-template.numbers` | 13.1.2 | `M13.1-7037.0.101-2` | 4 |
| `pre-bnc.numbers` | 13.1.2 | `M13.1-7037.0.101-2` | 3 |
| `issue-54.numbers` | 13.1.2 | `M13.1-7037.0.101-2` | 2 |
| `issue-51.numbers` | 13.1.2 | `M13.1-7037.0.101-2` | 3 |
| `test-extra-borders.numbers` | 13.1.2 | `M13.1-7037.0.101-2` | 2 |
| `custom-format-stress.numbers` | 13.1.2 | `M13.1-7037.0.101-2` | 4 |
| `issue-59.numbers` | 13.1.2 | `M13.1-7037.0.101-2` | 4 |
| `issue-60.numbers` | 13.1.2 | `M13.1-7037.0.101-2` | 2 |
| `test-bgcolour.numbers` | 13.1.2 | `M13.1-7037.0.101-2` | 2 |
| `issue-67.numbers` | 13.1.2 | `M13.1-7037.0.101-2` | 2 |
| `badindexzip.numbers` | 13.1.2 | `M13.1-7037.0.101-2` | 3 |
| `test-all-formulas-13.1.numbers` | 13.1.2 | `M13.1-7037.0.101-2` | 5 |
| `test-all-formulas.numbers` | 13.1.2 | `M13.1-7037.0.101-2` | 5 |
| `issue-56.numbers` | 13.1.2 | `M13.1-7037.0.101-2` | 2 |
| `issue-50.numbers` | 13.1.2 | `M13.1-7037.0.101-2` | 4 |
| `test-hlinks.numbers` | 13.0.2 | `M13.0-7036.0.126-2` | 2 |
| `test-bullets.numbers` | 13.0.2 | `M13.0-7036.0.126-2` | 3 |
| `empty-1.numbers` | 12.2.8 | `M12.2-7035.0.159-2` | 2 |
| `empty-3.numbers` | 12.2.8 | `M12.2-7035.0.159-2` | 2 |
| `empty-2.numbers` | 12.2.8 | `M12.2-7035.0.159-2` | 2 |
| `test-extra-formulas.numbers` | 12.2.8 | `M12.2-7035.0.159-2` | 3 |
| `issue-49.numbers` | 12.2.8 | `M12.2.1-7035.0.161-2` | 2 |
| `issue-43.numbers` | 12.2.8 | `M12.2-7035.0.159-2` | 2 |
| `issue-69.numbers` | 12.2.8 | `M12.2.1-7035.0.161-2` | 3 |
| `issue-44.numbers` | 12.2.8 | `M12.2-7035.0.159-2` | 2 |
| `date_formats.numbers` | 12.1.1 | `M12.1-7034.0.86-2` | 2 |
| `duration_112.numbers` | 12.1.1 | `M12.1-7034.0.86-2` | 3 |
| `issue-32.numbers` | 12.1.1 | `G-r1210-12B122` | 3 |
| `corrupted.numbers` | 12.0.8 | `M12.0-7033.0.134-2` | 2 |
| `issue-10.numbers` | 12.0.8 | `M12.0-7033.0.134-2` | 4 |
| `test-2.numbers` | 12.0.8 | `M12.0-7033.0.134-2` | 23 |
| `issue-35.numbers` | 12.0.8 | `M12.0-7033.0.134-2` | 2 |
| `test-save-1.numbers` | 12.0.8 | `M12.0-7033.0.134-2` | 4 |
| `test-4.numbers` | 11.2.9 | `M11.2-7032.0.145-2` | 4 |
| `test-new-formulas.numbers` | 11.2.9 | `M11.2-7032.0.145-2` | 2 |
| `issue-7.numbers` | 11.2.9 | `M11.2-7032.0.145-2` | 18 |
| `test-formats.numbers` | 11.2.9 | `M11.2-7032.0.145-2` | 2 |
| `issue-4.numbers` | 11.2.9 | `M11.2-7032.0.145-2` | 2 |
| `test-8.numbers` | 11.2.9 | `M11.2-7032.0.145-2` | 68 |
| `issue-3.numbers` | 11.2.9 | `M11.2-7032.0.145-2` | 3 |
| `issue-14.numbers` | 11.2.9 | `M11.2-7032.0.145-2` | 2 |
| `issue-9.numbers` | 11.2.9 | `M11.2-7032.0.145-2` | 3 |
| `test-empty-rows.numbers` | 11.1.2 | `M11.1-7031.0.102-2` | 2 |
| `issue-37.numbers` | 11.1.2 | `M11.1-7031.0.102-2` | 2 |
| `test-9.numbers` | 11.1.2 | `M11.1-7031.0.102-2` | 4 |
| `test-1.numbers` | 11.0.3 | `M11.0-7030.0.94-2` | 3 |
| `test-3.numbers` | 11.0.3 | `M11.0-7030.0.94-2` | 3 |
| `test-6.numbers` | 11.0.3 | `M11.0-7030.0.94-2` | 2 |
| `issue-17.numbers` | (unreadable) | `-` | 0 |
| `invalid-missing.numbers` | (unreadable) | `-` | 0 |
| `badzipfile.numbers` | (unreadable) | `-` | 0 |
| `corrupted-zip.numbers` | (unreadable) | `-` | 0 |
| `issue-18.numbers` | (unreadable) | `-` | 0 |
