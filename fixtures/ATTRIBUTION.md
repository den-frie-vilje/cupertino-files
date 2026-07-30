# Fixture provenance and attribution

Test fixtures for the iWork parser, sourced from open-source test suites.
All files were fetched on 2026-07-30 from the git commits listed below and are
byte-identical copies (md5 given per file). Fixture naming: `<source-repo>-<original-basename>`.

## Sources

| Source | Repo | Commit | License |
|---|---|---|---|
| tika | https://github.com/apache/tika | `c42b10873ce7cfede66a5315dc2ca2baba1a39c4` (2026-07-29) | Apache-2.0 (repo `LICENSE.txt`) |
| libetonyek | https://github.com/LibreOffice/libetonyek (read-only mirror of `git://gerrit.libreoffice.org/libetonyek`) | `37704aa6ac808fe7f7a14b4515503c3de3bc0dbf` (2026-05-24) | MPL-2.0+ (repo `COPYING`, README "License" section) |

Tika path prefix (abbreviated below as `<tika-docs>`):
`tika-parsers/tika-parsers-standard/tika-parsers-standard-modules/tika-parser-apple-module/src/test/resources/test-documents`

Format check used for every file: `unzip -l` (modern = `Index/*.iwa` or inner `Index.zip`;
old '09 = `index.xml`), plus hex dump of the first 16 bytes of `Index/Document.iwa`
(`od -A x -t x1z`). Modern IWA chunks start with byte `0x00` (chunk type 0) followed by a
3-byte little-endian length of the Snappy-compressed protobuf stream that follows.

---

## Modern .pages (2013+ IWA format)

### tika-testPages2013.pages
- Original: `<tika-docs>/testPages2013.pages` (apache/tika, Apache-2.0)
- 237,567 bytes, md5 `caca448ae4361cf14f7ca629f6d8db74`
- Structure: 26 zip entries, `Index/*.iwa` at top level (no inner Index.zip). 20 .iwa
  components: `Document.iwa`, `Metadata.iwa`, `DocumentMetadata.iwa`, `DocumentStylesheet.iwa`,
  `CalculationEngine.iwa`, `ViewState.iwa`, `AnnotationAuthorStorage.iwa`,
  `Tables/DataList.iwa` + `DataList-1..9`, `Tables/Tile.iwa`, `Tables/HeaderStorageBucket.iwa` + `-1`.
  Plus `Metadata/{Properties.plist,DocumentIdentifier,BuildVersionHistory.plist}` and
  `preview.jpg` / `preview-web.jpg` / `preview-micro.jpg`. No `Data/` media.
- Content (from Snappy literals): "Sample pages document", a text box, a Pages TOC, and
  styled paragraphs about iWork/Pages/Keynote. Created 2016; used by Tika's
  `IWork13PackageParser` tests.
- Verification (`Index/Document.iwa`, first 16 bytes):
  `00 15 16 00 d0 48 f0 52 27 08 01 12 23 08 90 4e`

### libetonyek-pages5-file.pages
- Original: `src/test/data/pages5-file.pages` (LibreOffice/libetonyek, MPL-2.0+)
- 65,728 bytes, md5 `f21763c5cfe4f03a4fa51e9ff7c872b5`
- Structure: 14 zip entries, `Index/*.iwa` at top level. 8 .iwa components:
  `Document.iwa`, `Metadata.iwa`, `DocumentStylesheet.iwa`, `ThemeStylesheet.iwa`,
  `CalculationEngine.iwa`, `ViewState.iwa`, `AnnotationAuthorStorage.iwa`, `Tables/DataList.iwa`.
  Plus `Metadata/` plists and the three `preview*.jpg` files. No `Data/` media.
- Content: blank-template (ISO A4) document with "Standard TOC" and the multilingual test
  sentence "My hovercraft is full of eels." (English, Czech, Polish, ...). Smallest modern
  .pages fixture in the set.
- Verification (`Index/Document.iwa`, first 16 bytes):
  `00 95 0f 00 a4 36 f0 a5 34 08 01 12 30 08 90 4e`

### libetonyek-pages5-extra-dir.pages
- Original: `src/test/data/pages5-extra-dir.pages` (LibreOffice/libetonyek, MPL-2.0+)
- 148,376 bytes, md5 `6fc66c5a7f498361d89dcc5651a817f2`
- Structure: the "extra directory + inner Index.zip" variant of the modern format — all
  content nested under a wrapper dir `Project Proposal.pages/` inside the zip:
  `Project Proposal.pages/Index.zip` (contains `Index/Document.iwa`,
  `Index/CalculationEngine-4705.iwa`, `Index/Tables/{Tile,DataList,HeaderStorageBucket}-45xx/46xx.iwa`,
  stylesheets, `Metadata-4706.iwa`, etc.), `Project Proposal.pages/Data/aa043252_750x683-small-12.jpeg`
  (embedded image), `Metadata/` plists, `preview*.jpg`.
- Content: Apple "Modern Business Project Proposal" template (na-letter), placeholder
  authors "Trenz Pruca" / "Urna Semper", dated 2018-10-18; includes one JPEG media asset.
  Exercises both the wrapper-directory and inner-`Index.zip` code paths plus `Data/` media.
- Verification (inner `Index.zip` -> `Index/Document.iwa`, first 16 bytes):
  `00 7d 22 00 e8 78 68 3b 08 01 12 37 08 90 4e 12`

## Modern .numbers / .key (for future work)

### tika-testNumbers2013.numbers
- Original: `<tika-docs>/testNumbers2013.numbers` (apache/tika, Apache-2.0)
- 179,147 bytes, md5 `36914271e14a6330507b0638d634e372`
- Structure: 53 zip entries, top-level `Index/*.iwa` (47 .iwa incl. `Document.iwa`,
  `CalculationEngine.iwa`, many `Tables/DataList-*.iwa`, `Tables/Tile*.iwa`,
  `Tables/HeaderStorageBucket*.iwa`), `Metadata/` plists, `preview*.jpg`. No `Data/` media.
- Content: en_GB checking-account style spreadsheet ("Checking", "Account: ...").
- Verification (`Index/Document.iwa`): `00 df 10 00 93 36 f0 4e 23 08 01 12 1f 08 01 12`

### tika-testKeynote2013.key
- Original: `<tika-docs>/testKeynote2013.key` (apache/tika, Apache-2.0)
- 274,397 bytes, md5 `572a65f6dfbc23d4fdf7d5ce8b2a5c7c`
- Structure: 62 zip entries, top-level `Index/*.iwa` (37 .iwa incl. `Document.iwa`,
  `Slide*.iwa`, `MasterSlide-*.iwa`, `Tables/*`), `Metadata/` plists, and a `Data/`
  directory with ~15 JPEG assets (`girl_and_snowcone-small-107.jpg`, `mt-*.jpg` master
  thumbnails, ...). en_GB, "White" theme.
- Verification (`Index/Document.iwa`): `00 b1 12 00 ab 3a c8 1b 08 01 12 17 08 01 12 03`

### tika-testKeynote2018.key
- Original: `<tika-docs>/testKeynote2018.key` (apache/tika, Apache-2.0)
- 54,228 bytes, md5 `32fd01bedfffb5209a6eac14b1ea210b`
- Structure: wrapper dir + inner-Index.zip variant, Keynote 2018 vintage:
  `Presentation.key/Index.zip` (contains `Index/Document.iwa`, `Index/MasterSlide-9xxx.iwa`, ...),
  `Presentation.key/Metadata/{BuildVersionHistory.plist,DocumentIdentifier,Properties.plist}`,
  empty `Presentation.key/Data/`. Companion to the extra-dir .pages fixture for the
  inner-`Index.zip` code path.
- Verification (inner `Index.zip` -> `Index/Document.iwa`):
  `00 d8 10 00 b0 43 c0 19 08 01 12 15 08 01 12 03`

## Old iWork '09 format (contrast file — NOT the IWA format)

### tika-iwork09-testPages.pages
- Original: `<tika-docs>/testPages.pages` (apache/tika, Apache-2.0)
- 134,152 bytes, md5 `38fb734aecda25de2b38f577f4b4771a`
- Structure: iWork '09 XML package — `index.xml` (370,769 bytes),
  `buildVersionHistory.plist`, `QuickLook/Thumbnail.jpg`, `QuickLook/Preview.pdf`.
  No `Index/*.iwa`. Kept only as a negative/contrast fixture so the parser can detect and
  reject (or route) the legacy format; parsed by Tika's `IWorkPackageParser`, not the
  2013 IWA parser.

## Notes

- Also available upstream but intentionally NOT copied: Tika's remaining `.pages` test files
  (`testPagesComments`, `testPagesHeadersFooters*`, `testPagesLayout`, `testPagesPwdProtected`)
  are all iWork '09 `index.xml` format; openpreserve/format-corpus (checked at HEAD) contains
  only an iWork '09 Pages sample (`variations/.../x-iwork-pages-sffpages/09-4.1-923/lorem-ipsum.pages`).
  libetonyek additionally ships non-zipped *package-directory* variants
  (`pages5-package.pages/` with `Index.zip` + `Metadata/`) and loose `.iwa` files under
  `src/test/data/unsupported/` if directory-package fixtures are ever needed.
- License note: the Tika files are Apache-2.0. The two libetonyek files are MPL-2.0+
  (file-level weak copyleft); keeping them as unmodified test fixtures with this attribution
  satisfies MPL section 3.2 (they remain available from the upstream repo). If the project
  ever needs strictly-permissive fixtures only, drop the two libetonyek files —
  `tika-testPages2013.pages` alone still covers the modern format.

---

## 2026-era / modern fixtures

Added 2026-07-30. Goal: exercise the *current* iWork writers alongside the 2013-era files
above. Everything in this section was located by scanning open-source test corpora for
`Metadata/Properties.plist` → `fileFormatVersion` and `Metadata/BuildVersionHistory.plist`
(the latter names the actual app build that last saved the file, e.g. `M15.2.1-7048.0.3-2`
= Numbers 15.2.1, build 7048.0.3).

Newest thing found anywhere, by app:

| App | Newest `fileFormatVersion` | Newest app build (BuildVersionHistory) |
|---|---|---|
| Numbers | **26.1.0** | **`M15.2.1-7048.0.3-2`** |
| Pages | 14.4.1 | `M14.5-7045.0.17-4` |
| Keynote | 14.4.1 | `M14.5-7045.0.17-4` |

No `.pages` or `.key` file with a 26.x `fileFormatVersion` was found in any open-source
repository surveyed — see `research/version-survey.md` for the repos checked.

### Sources

| Source | Repo | Commit | License |
|---|---|---|---|
| numbers-parser | https://github.com/masaccio/numbers-parser | `2dd9dbe3f8f3440bbd19e23668d5ade72a2e1629` (2026-07-30) | MIT (repo `LICENSE.rst`, "Copyright 2021 Jon Connell"; `pyproject.toml` `license = "MIT"`) |
| iwork-mcp | https://github.com/reichenbach/iwork_mcp | `f26bb077ca684f4ce39958b9bdb01667a5a22b6d` (2026-07-19) | MIT — **declared only in `package.json` (`"license": "MIT"`); the repo ships no `LICENSE`/`COPYING` file.** See caveat under Notes. |

Common layout for every file in this section (none use the wrapper-dir or inner-`Index.zip`
variants): a flat zip, entries stored **uncompressed** (`compress_type=0`, the zip is just a
container — the IWA payloads are already Snappy-compressed), with
`Index/*.iwa` (+ `Index/Tables/*.iwa` for documents containing tables),
`Metadata/{Properties.plist,DocumentIdentifier,BuildVersionHistory.plist}`, and
`preview.jpg` / `preview-web.jpg` / `preview-micro.jpg`.

### Numbers — 26.x era (BNC v5 cell storage)

All seven Numbers files below are **modern BNC v5**: every `TST.Tile` carries
`storage_version = 5` and `last_saved_in_BNC = true`, and *every* `TST.TileRowInfo`
populates field 6 (`cell_storage_buffer`) and field 7 (`cell_offsets`).

#### numbers-parser-v26.1-date-formats.numbers
- Original: `tests/data/date-format-nospace.numbers` (masaccio/numbers-parser, MIT)
- 157,178 bytes, md5 `4e7d2039787bbb406630d621b5c04c5e`
- `fileFormatVersion` **26.1.0**
- BuildVersionHistory: `['Template: Blank (dev/15.3)', 'M15.2.1-7048.0.3-2']`
  — the newest build seen anywhere in this survey, and the template is a **dev/15.3** build.
- Layout: 43 entries; `Index/` (7 .iwa) + `Index/Tables/` (30 .iwa); no `Data/`.
- Exercises: 2 tables / 2 tiles / 11 rows; date-and-time custom cell formats
  (the regression is a date format with no space separator). Table + cell styles,
  `TST.HeaderNameMgrArchive`, `TSCE` formula dependency graph. No images, no charts.
- **Best single "newest writer" fixture** — smallest 26.1.0 file available.

#### numbers-parser-v26.1-custom-formats.numbers
- Original: `tests/data/test-custom-formats.numbers` (masaccio/numbers-parser, MIT)
- 248,731 bytes, md5 `3abc2bed8958b17ef4d3f546499a2045`
- `fileFormatVersion` **26.1.0**
- BuildVersionHistory: `['Template: Blank (11.2)', 'M12.1-7034.0.86-2', 'M12.2-7035.0.159-2', 'M13.1-7037.0.101-2', 'M15.2.1-7048.0.3-2']`
  — a doc migrated Numbers 12.1 → 12.2 → 13.1 → 15.2.1.
- Layout: 73 entries; `Index/` + `Index/Tables/`; no `Data/`.
- Exercises: 4 tiles / 163 rows. Heavy **custom number/date/duration format** coverage,
  including formats containing embedded quotes and `#,###.##` patterns
  (`Day #036 of 2022: aa 'bb' cc'cc "dd" cc`). Good stress test for format-string decoding.

#### numbers-parser-v26.1-xlsx-lineage.numbers
- Original: `tests/data/issue-121.numbers` (masaccio/numbers-parser, MIT)
- 722,647 bytes, md5 `4fe0e2653e3e0ce0524d4ba3d36448de`
- `fileFormatVersion` **26.1.0**
- BuildVersionHistory: **144 entries**, beginning `['xlsx', 'M5.1-5683-2', 'T4.1 (5782)', ...]`
  and ending `[..., 'G-r1520-15B74', 'G-r1520-15B75', 'M15.2.1-7048.0.3-2']`.
  Originally imported from `.xlsx`, then round-tripped through roughly a decade of
  macOS (`M*`), iOS (`T*`) and iCloud/web (`G-r*`) builds. The single best fixture for
  "document carries a long migration history".
- Layout: 51 entries; `Index/` (8 .iwa) + `Index/Tables/` (30 .iwa); **has `Data/`** with 7
  entries (`PresetImageFill0-10.jpg` … `PresetImageFill5-15.jpg`) — exercises the media
  path and `TSP.DataMetadata` / `TSP.DataMetadataMap`.
- Exercises: 2 tiles / 41 rows; `TST.ConditionalStyleSetArchive` (conditional formatting)
  and `TST.RichTextPayloadArchive` (rich text in cells) — neither appears in the other
  Numbers fixtures.

#### numbers-parser-v26.1-form-sheet.numbers
- Original: `tests/data/issue-104.numbers` (masaccio/numbers-parser, MIT)
- 445,078 bytes, md5 `0da847d33e602408abeb1badabc8d2f5`
- `fileFormatVersion` **26.1.0**
- BuildVersionHistory: **180 entries**, `['Template: Blank (11.2)', 'M14.1-7040.0.73-4', 'T14.1 (7369.0.73)', ...]`
  ending `[..., 'G-r1520-15B73', 'G-r1520-15B74', 'M15.2-7046.0.71-2']` — long
  macOS/iOS alternation, last saved by Numbers 15.2.
- Layout: 43 entries; `Index/` + `Index/Tables/`; no `Data/`.
- Exercises: the only fixture containing a **Numbers form sheet** —
  `TN.FormBasedSheetArchive` (numbers type id 3) and `TN.FormSelectionArchive` (12040).
  2 tiles / 15 rows. 1,017 archives, 69 distinct type ids.

#### numbers-parser-v26.0-categories.numbers
- Original: `tests/data/test-categories.numbers` (masaccio/numbers-parser, MIT)
- 389,386 bytes, md5 `3202ee641287dd1daa29c51b07064df6`
- `fileFormatVersion` **26.0.0**
- BuildVersionHistory: `['Template: Blank (11.2)', 'M14.4-7043.0.93-4', 'M15.1-7044.0.271-2']`
- Layout: 343 entries; `Index/` + `Index/Tables/`; no `Data/`.
- Exercises: the largest table set here — 22 tiles / 341 rows / 2,561 archives.
  **Row categories / grouping**: `TST.GroupByArchive`, `TST.GroupByArchive.GroupNodeArchive`,
  `TST.CategoryOrderArchive`, `TST.CategoryOwnerRefArchive`, `TST.SummaryModelArchive`,
  `TST.SummaryCellVendorArchive`, plus `TST.RichTextPayloadArchive`.

#### numbers-parser-v26.0-issue102.numbers  /  numbers-parser-v14.4-issue102.numbers
An **A/B pair**: the same source document saved by two different app generations. This is
the highest-value pair for a version-compatibility matrix because everything except the
writer version is held constant.

- Originals: `tests/data/issue-102-v15.1.numbers` and `tests/data/issue-102-v14.4.numbers`
  (masaccio/numbers-parser, MIT)
- `...v26.0-issue102.numbers` — 134,314 bytes, md5 `61c4949c4d8d59196652537476299982`,
  `fileFormatVersion` **26.0.0**, BuildVersionHistory 22 entries beginning `'csv'` and
  ending `[..., 'G-r1440-14E130', 'M14.5-7045.0.17-4', 'M15.1-7044.0.271-2']`
- `...v14.4-issue102.numbers` — 133,529 bytes, md5 `9b8dca63a5ec24c120359cc7425fc5ea`,
  `fileFormatVersion` **14.4.1**, BuildVersionHistory 21 entries, same `'csv'` origin,
  ending `[..., 'G-r1440-14E128', 'G-r1440-14E130', 'M14.5-7045.0.17-4']`
- Both: 43 zip entries, `Index/` + `Index/Tables/`, no `Data/`, 2 tiles / 7 rows,
  originally imported from CSV.
- Diff between the two is small and version-attributable: 670 vs 667 archives,
  66 vs 67 distinct type ids, and the `Properties.plist` key set is **identical**
  (both still use the older combined `hasExternalReferenceOrMissingOrUnmaterializedRemoteData`
  key — see `research/version-survey.md`, that key only splits at 26.1.0).

### Pages / Keynote — 14.5 era (newest available)

#### iwork-mcp-v14.5-sample.pages
- Original: `examples/sample.pages` (reichenbach/iwork_mcp, MIT-declared)
- 133,005 bytes, md5 `3f0a84f96ef9cc3213f3207329bf2031`
- `fileFormatVersion` **14.4.1**
- BuildVersionHistory: `['Template: Blank (13.2)', 'M14.5-7045.0.17-4']` — **Pages 14.5**,
  ~6 years newer than the previous newest `.pages` fixture (`libetonyek-pages5-extra-dir.pages`, 2018).
- Layout: 13 entries; `Index/` with exactly 7 .iwa —
  `Document.iwa`, `ViewState.iwa`, `CalculationEngine-1732611.iwa`,
  `AnnotationAuthorStorage-1732610.iwa`, `DocumentStylesheet.iwa`, `DocumentMetadata.iwa`,
  `Metadata.iwa`. No `Index/Tables/`, no `Data/`.
- Exercises: word-processing body text with headings, a bulleted action-item list and
  inline styling — a "Engineering Team" meeting-notes document dated February 10, 2026.
  575 archives, 52 type ids. Contains `TSWP.DropCapStyleArchive`, `TSK.DocumentSelectionArchive`,
  `TSK.PencilAnnotationUIState`, `TSWP.FlowInfoContainerArchive`, `TSD.GuideStorageArchive`,
  `TP.CanvasSelectionArchive` — none of which appear in the 2013-era `.pages` fixtures.
  No tables, no charts, no media.

#### iwork-mcp-v14.5-sample.key
- Original: `examples/sample.key` (reichenbach/iwork_mcp, MIT-declared)
- 476,581 bytes, md5 `69f2fc878255daf19b8ea79e81d3e19c`
- `fileFormatVersion` **14.4.1**
- BuildVersionHistory: `['Template: 21_BasicWhite (13.2)', 'M14.5-7045.0.17-4']` — **Keynote 14.5**,
  vs. 2018 (`tika-testKeynote2018.key`) and 2020 (keynote-parser's newest) previously.
- Layout: 57 entries; `Index/` with 27 .iwa — **18 × `TemplateSlide-*.iwa`** plus
  `Slide.iwa`, `Slide-2652150.iwa`, `Slide-2652584-2.iwa`, `Document.iwa`, `ViewState.iwa`,
  `CalculationEngine.iwa`, `AnnotationAuthorStorage.iwa`, `DocumentStylesheet.iwa`,
  `DocumentMetadata.iwa`, `Metadata.iwa`. **Has `Data/`** with 24 assets
  (`mt-<UUID>-90xx.jpg` master thumbnails, `st-<UUID>-9058.jpg`, five large
  `*-small-*.jpeg` photos, `blankMoviePosterImage-8945.png`).
- Note the component naming: modern Keynote writes **`TemplateSlide-*.iwa`** where the
  2013-era `tika-testKeynote2013.key` writes `MasterSlide-*.iwa`.
- Exercises: richest feature set of any fixture here — `TSD.ImageArchive`,
  `TSD.MovieArchive`, `TSWP.ShapeInfoArchive`, and the two Keynote-modern-only archives
  **`KN.MotionBackgroundStyleArchive`** (id 26) and **`KN.LiveVideoSource` /
  `KN.LiveVideoSourceCollection`** (ids 184/185), plus `KN.DesktopUILayoutArchive` (23).
  999 archives, 58 type ids. Also the only fixture whose stylesheet carries a
  `styles_for_12_1` snapshot (field 14) in addition to `styles_for_10_0` / `styles_for_10_1`.

#### iwork-mcp-v14.5-earnings.numbers
- Original: `examples/Apple Q1 FY2026 Earnings.numbers` (reichenbach/iwork_mcp, MIT-declared)
- 235,762 bytes, md5 `76885a906dd9dce19d79def5ebbb045b`
- `fileFormatVersion` **14.4.1**
- BuildVersionHistory: `['Template: Blank (11.2)', 'M14.5-7045.0.17-4']`
- Layout: 223 entries; `Index/` + `Index/Tables/`; no `Data/`.
- Exercises: 14 tiles / 61 rows / 1,137 archives — a multi-table financial-summary
  spreadsheet ("Fiscal Quarter Ended December 27, 2025"). BNC v5 like the rest.
  Included mainly for **provenance diversity**: it is the only modern Numbers fixture not
  produced by the numbers-parser maintainer's own test workflow, so it independently
  corroborates what a 14.5-era writer emits.
- This is a **synthetic demo document generated by the iwork-mcp server**, not an authentic
  Apple financial statement; do not treat its contents as a real record.

### Notes

- Naming for this section is `<source>-v<app-version>-<what>.<ext>`, where the version is
  the app version from BuildVersionHistory (`v26.x` for the Numbers files whose
  `fileFormatVersion` is 26.x, `v14.5` for the Pages/Keynote/Numbers files last saved by
  build `M14.5-7045.0.17-4`). Note `fileFormatVersion` and the app version are **not** the
  same number — Numbers 15.1/15.2 write `fileFormatVersion` 26.0.0/26.1.0.
- No existing fixture was modified or removed; all files above are byte-identical copies.
- **iwork-mcp licensing caveat:** the repository declares MIT in `package.json` but ships no
  `LICENSE` file, so the grant is weaker evidence than numbers-parser's explicit
  `LICENSE.rst`. All three iwork-mcp files are kept unmodified with this attribution.
  If strictly-documented licensing is required, the three `iwork-mcp-*` files are the ones
  to drop — but doing so removes the *only* modern `.pages` and `.key` in the set.
- Considered and rejected: `orcastor/iwork-converter` `testdata/` (`a.pages` is
  `fileFormatVersion` 14.1.1 / Pages 14.1 — older than iwork-mcp's; `a.key` is 3.1.2 / 2018;
  `a.numbers` is 11.1.2); `psobot/keynote-parser` `tests/data/` (newest is
  `unicode-asset-filename.key`, 10.1.8 / Keynote 10.1); `6over3/WorkKit` and
  `openpreserve/format-corpus` (ship no iWork documents at all).
