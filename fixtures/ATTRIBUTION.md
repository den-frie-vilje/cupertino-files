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
| Pages | **26.1.0** | **`M15.2.1-7048.0.3-2`** |
| Keynote | 14.4.1 | `M14.5-7045.0.17-4` |

**Correction.** An earlier pass of this survey concluded that no 26.x `.pages`
existed in open source; that was wrong. A whole-of-GitHub filename sweep found
`gomap-v26.1-newest-writer.pages` (`fileFormatVersion` 26.1.0, build
`M15.2.1-7048.0.3-2` — the same build as the newest Numbers fixtures). Its
`BuildVersionHistory` records edits by three app generations (M12.2.1 → M14.5 →
M15.2.1), so it also exercises multi-generation provenance.

**Keynote remains the one gap**: no `.key` newer than 14.4.1 has been found.
See `research/version-survey.md` and `research/pages-feature-coverage.md` for
the sources checked.

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

---

## Feature-coverage Pages fixtures

Added 2026-07-30. Goal: the corpus's `.pages` files all scored 2–7 on
`scripts/feature-probe.ts` and between them exercised **none** of image
filters/adjustments, headers/footers containing text, footnotes, comments,
hyperlinks, multiple sections, charts, or change tracking. This section adds eight
files chosen for *complementary* feature coverage.

How they were found: the dedicated format corpora (libetonyek, tika, LibreOffice/core,
openpreserve/format-corpus, siegfried, fido, fits, file-type, mimetype, WorkKit,
archivematica-sampledata) were re-checked and are exhausted — see
`research/pages-feature-coverage.md`. The files below came from a whole-of-GitHub
file-name sweep (Sourcegraph public search API, `file:\w\.pages$`), 1,154 candidates
→ 1,038 downloaded → 1,038 probed → 874 modern IWA Pages documents. Selection was
restricted to repositories carrying an unambiguous license file at the repo root.

Every file below is a **byte-identical, unmodified copy**; the blob SHA-1 of each local
copy was checked against `git ls-tree` in the upstream repository at the commit given
(all MATCH), so the provenance is exact rather than approximate.

The probe output quoted per file was taken with the parser at commit `8ef56e4` plus an
uncommitted edit to `src/tswp/textstorage.ts`. `src/` was under active development during
this survey, and two counters moved while it ran (`inlineAttachments`,
`listStyledParagraphs`); the numbers below are the post-change values. No priority-feature
counter (`imagesWithFilters`, `imagesWithMask`, `nonEmptyHeaders`, `nonEmptyFooters`,
`footnotes`, `comments`, `hyperlinks`, `sections`, `charts`, `storagesWithChangeTracking`,
`readableTableCells`) changed, so fixture selection is unaffected — but re-run the probe
before treating any exact count here as current.

### Sources

| Source | Repo | Commit | License |
|---|---|---|---|
| threatconnect | https://github.com/ThreatConnect-Inc/threatconnect-playbooks | `e8115975f456a06a67606a859c254c15823e9a5f` | Apache-2.0 (repo `LICENSE`) |
| picopalette | https://github.com/picopalette/phishing-detection-plugin | `749811b4ef531c9a273e2f86c337b189cea75911` | MIT (repo `LICENSE`, "Copyright (c) 2018 PicoPalette") |
| ndpi | https://github.com/ntop/nDPI | `252e2a5548a1ea4eb54d3089af836207b3ef32e6` | LGPL-3.0 (repo `COPYING`) |
| rougier | https://github.com/rougier/scientific-posters | `00e9acb111d9faa180c75551ad60e3cdd0a7aaa4` | CC BY 4.0 (repo `LICENSE.txt`) |
| draftjs | https://github.com/thibaudcolas/draftjs-filters | `43e68048b60a303a28237edd2ec9af8e58ac2417` | MIT (repo `LICENSE`) |
| picodocs | https://github.com/PicoMLX/PicoDocs | `5c18743d3d8120a76da124bd512a3cf5bcc28e82` | MIT (repo `LICENSE`, "Copyright (c) 2025 Pico MLX") |
| vertx | https://github.com/vert-x3/vertx-guide-for-java-devs | `846b56a5b6187d5368ded6a9bfda73f4549e8b57` | Apache-2.0 (repo `LICENSE`) |
| gomap | https://github.com/bryceco/GoMap | `40a7f781449c75c45f78feba7bb7ddefdc45ed0c` | ISC (repo `LICENSE.md`, "Copyright (c) 2018, Bryce Cogswell and Go Map!! Contributers") |

### threatconnect-v11.1-headers-footers-sections.pages
- Original: `apps/TCPB_-_Expressions/doc/Expressions.pages` (ThreatConnect-Inc/threatconnect-playbooks, Apache-2.0)
- 630,330 bytes, md5 `c456eaa8e4fc17090343acd9485d36ef`
- `fileFormatVersion` **11.1.2**, app build **`M11.1-7031.0.102-2`** (Pages 11.1)
- Full feature-probe output:
  ```
  pages | era=modern | format=11.1.2 | build=M11.1-7031.0.102-2 | flat | 889 objects | score=11
  textStorages=82  nonEmptyStorages=34  images=7  imagesWithMask=1  tables=1  tableCellStorage=v5
  readableTableCells=1  hyperlinks=2  smartFields=2  bookmarks=1  inlineAttachments=36
  listStyledParagraphs=86  bodyChars=29534  paragraphs=438  sections=3  nonEmptyHeaders=3
  nonEmptyFooters=3  textBoxes=26  namedParagraphStyles=28  namedListStyles=9  tocObjects=1
  hasTOC=true  shapeInfos=26
  ```
- **Highest-scoring `.pages` document found anywhere (score 11).** Technical manual for a
  ThreatConnect playbook app. Primary fixture for **multiple sections** (3) where *each*
  section carries a header *and* a footer with real text — the combination the corpus
  previously had zero examples of. Also 26 text boxes, 36 inline attachments, a v5/BNC table,
  and a bookmark.

### picopalette-v3.2-multisection-footnotes.pages
- Original: `artifacts/report.pages` (picopalette/phishing-detection-plugin, MIT)
- 3,315,498 bytes, md5 `882ffae08a0459f606a5066b4885c877`
- `fileFormatVersion` **3.2.13**, app build **`M7.2-5869-2`** (Pages 7.2, iWork '19 era)
- Full feature-probe output:
  ```
  pages | era=iwork19 | format=3.2.13 | build=M7.2-5869-2 | flat | 1222 objects | score=10
  textStorages=274  nonEmptyStorages=36  images=18  imagesWithMask=3  tables=4
  tableCellStorage=v5  readableTableCells=4  hyperlinks=1  smartFields=1  footnotes=8
  inlineAttachments=47  listStyledParagraphs=292  bodyChars=34223  paragraphs=329
  sections=14  nonEmptyHeaders=13  nonEmptyFooters=1  namedParagraphStyles=27
  namedListStyles=10  tocObjects=7  hasTOC=true
  ```
- A student project report. The **structurally richest** document in the set:
  **14 sections**, **13 non-empty headers**, **8 footnotes**, **7 TOC objects**,
  4 v5 tables with readable cells, 18 images (3 masked), 274 text storages.
  Primary fixture for **footnotes** and for section/header iteration at scale.

### ndpi-v10.0-change-tracking.pages
- Original: `doc/guide/nDPI_QuickStartGuide.pages` (ntop/nDPI, LGPL-3.0)
- 133,048 bytes, md5 `920b959ab455237e565eb94302eeb0d2`
- `fileFormatVersion` **10.0.10**, app build **`M10.0-6748-2`** (Pages 10.0)
- Full feature-probe output:
  ```
  pages | era=modern | format=10.0.10 | build=M10.0-6748-2 | flat | 709 objects | score=9
  textStorages=23  nonEmptyStorages=9  images=1  tables=1  tableCellStorage=v5
  readableTableCells=1  hyperlinks=7  smartFields=8  bookmarks=2  inlineAttachments=3
  listStyledParagraphs=168  storagesWithChangeTracking=1  bodyChars=21281  paragraphs=582
  sections=1  nonEmptyHeaders=2  nonEmptyFooters=2  namedParagraphStyles=61
  namedListStyles=55  tocObjects=1  hasTOC=true
  ```
- **The only document with change tracking** (`TSWP.StorageArchive` insertion/deletion
  tables, probe field `storagesWithChangeTracking`) out of all 874 modern Pages documents
  probed. Also headers *and* footers with text, 7 hyperlinks, 8 smart fields, 2 bookmarks,
  55 named list styles — and only 130 KB. Highest value-per-byte fixture in the set.
- License note: LGPL-3.0, i.e. weak copyleft, same posture as the existing MPL-2.0
  libetonyek fixtures — kept unmodified with this attribution and available upstream.

### rougier-v13.1-image-filters-masks.pages
- Original: `src/2023-iBAGS.pages` (rougier/scientific-posters, CC BY 4.0)
- 3,048,375 bytes, md5 `2ad35243d7d50f07271db9ff4ce0f1e6`
- `fileFormatVersion` **13.1.2**, app build **`M13.1-7037.0.101-2`** (Pages 13.1)
- Full feature-probe output:
  ```
  pages | era=modern | format=13.1.2 | build=M13.1-7037.0.101-2 | flat | 1260 objects | score=7
  textStorages=140  nonEmptyStorages=45  images=17  imagesWithFilters=1  imagesWithMask=12
  tableCellStorage=none  hyperlinks=1  smartFields=1  inlineAttachments=1
  listStyledParagraphs=141  isPageLayout=true  paragraphs=1  sections=1  textBoxes=121
  namedParagraphStyles=23  namedListStyles=10  tocObjects=1  hasTOC=true  shapeInfos=121
  ```
- A scientific conference poster. Primary fixture for **priority 1**: carries
  `TSD.ImageArchive.imageAdjustments` (field 14) *and* 12 masked images (field 5) in one
  document. Also the first **page-layout** (`isPageLayout=true`) fixture in the corpus —
  every previous `.pages` fixture is a word-processing document — plus 121 text boxes /
  shape infos, by far the most of any file surveyed.
- Attribution required by CC BY 4.0: © Nicolas P. Rougier, from
  https://github.com/rougier/scientific-posters, unmodified.

### vertx-v2.2-image-filters.pages
- Original: `cover.pages` (vert-x3/vertx-guide-for-java-devs, Apache-2.0)
- 934,324 bytes, md5 `619708c4548e4e77a2fd1b927e26df99`
- `fileFormatVersion` **2.2.4**, app build **`M6.2-4582-1`** (Pages 6.2, iWork '16 era)
- Full feature-probe output:
  ```
  pages | era=iwork16 | format=2.2.4 | build=M6.2-4582-1 | flat | 315 objects | score=5
  textStorages=21  nonEmptyStorages=2  images=1  imagesWithFilters=1  tableCellStorage=none
  listStyledParagraphs=21  isPageLayout=true  paragraphs=1  sections=1  textBoxes=2
  namedParagraphStyles=24  namedListStyles=9  tocObjects=1  hasTOC=true  shapeInfos=2
  ```
- The **second** image-filters sample, deliberately from a much older writer (Pages 6.2,
  2017) than the rougier poster (Pages 13.1, 2023). Only four documents in the whole sweep
  carry `imageAdjustments` at all; having two from ~6 years apart is what makes the
  adjustments payload diffable across writer generations. Also a second page-layout document.

### draftjs-v2.3-comments.pages
- Original: `pasting/documents/Draft.js paste test document.pages` (thibaudcolas/draftjs-filters, MIT)
- 3,800,965 bytes, md5 `c6de7a990dfe8b8a74fc5e0b3131d12b`
- `fileFormatVersion` **2.3.4**, app build **`M6.3.1-5249-2`** (Pages 6.3.1, iWork '16 era)
- Full feature-probe output:
  ```
  pages | era=iwork16 | format=2.3.4 | build=M6.3.1-5249-2 | flat | 410 objects | score=7
  textStorages=22  nonEmptyStorages=2  images=4  tables=1  tableCellStorage=preBNC
  hyperlinks=3  smartFields=4  comments=3  bookmarks=1  inlineAttachments=11
  listStyledParagraphs=33  bodyChars=1823  paragraphs=118  sections=1  textBoxes=3
  namedParagraphStyles=24  namedListStyles=9  tocObjects=1  hasTOC=true  shapeInfos=3
  unsupported: pre-BNC table cell storage (iWork '13-era): cell values cannot be decoded
  ```
- Primary (and only attributable) fixture for **comments/annotations**. Purpose-built
  upstream as a rich-content paste-test document, so it deliberately packs comments,
  hyperlinks, smart fields, images, a table, text boxes and 11 inline attachments into
  1.8 KB of body text. Only 4 of the 874 modern documents surveyed contain comments at all,
  and this is the only one whose repository carries a license file.
- Also the corpus's second `preBNC` table-storage sample (after `tika-testPages2013.pages`),
  and — not visible in the probe line above — **the corpus's only document containing a real
  chart**: 1 × `TSCH.ChartDrawableArchive` plus its instance-level `ChartNonStyleArchive`,
  `ChartAxisNonStyleArchive` (×3) and `LegendNonStyleArchive`. The probe prints no `charts=`
  field for it because its chart regex is broken; see the Notes below.

### picodocs-v14.4-headers-tables.pages
- Original: `Tests/PicoDocsTests/Resources/sample.pages` (PicoMLX/PicoDocs, MIT)
- 858,258 bytes, md5 `72ad84015dafe437164c6e3dc6e0b4f8`
- `fileFormatVersion` **14.4.1**, app build **`M14.5-7045.0.17-4`** (Pages 14.5)
- Full feature-probe output:
  ```
  pages | era=modern | format=14.4.1 | build=M14.5-7045.0.17-4 | flat | 1095 objects | score=8
  textStorages=85  nonEmptyStorages=53  images=1  tables=3  tableCellStorage=v5
  readableTableCells=3  hyperlinks=1  smartFields=1  inlineAttachments=4
  listStyledParagraphs=88  bodyChars=1430  paragraphs=27  sections=2  nonEmptyHeaders=2
  nonEmptyFooters=2  namedParagraphStyles=37  namedListStyles=16  tocObjects=1  hasTOC=true
  ```
- Same writer build as the incumbent `iwork-mcp-v14.5-sample.pages` (`M14.5-7045.0.17-4`)
  but score 8 vs 2: it actually exercises 2 sections, headers *and* footers with text, and
  3 v5/BNC tables with readable cells. Keep both — the pair isolates "what a 14.5 writer
  emits for a feature-rich document" against "…for a plain one".

### gomap-v26.1-newest-writer.pages
- Original: `Architecture.pages` (bryceco/GoMap, ISC)
- 200,315 bytes, md5 `44fffddff3487d8061389af6912a7536`
- `fileFormatVersion` **26.1.0**, app build **`M15.2.1-7048.0.3-2`** (Pages 15.2.1)
- Full feature-probe output:
  ```
  pages | era=current | format=26.1.0 | build=M15.2.1-7048.0.3-2 | flat | 768 objects | score=3
  textStorages=49  nonEmptyStorages=27  tableCellStorage=none  listStyledParagraphs=49
  paragraphs=1  sections=1  textBoxes=29  namedParagraphStyles=24  namedListStyles=9
  tocObjects=1  hasTOC=true  shapeInfos=29
  ```
- Added for **era** rather than feature coverage. This **corrects a claim made earlier in
  this file**: the "2026-era / modern fixtures" section states that no `.pages` with a 26.x
  `fileFormatVersion` was found in any open-source repository. One exists. `Architecture.pages`
  is `fileFormatVersion` **26.1.0**, written by build `M15.2.1-7048.0.3-2` — the *same*
  newest-anywhere build as `numbers-parser-v26.1-date-formats.numbers`, so the corpus now
  pins the current writer generation for Numbers *and* Pages.
- Content: the Go Map!! (OpenStreetMap editor) architecture notes — a diagram-style
  page-layout document, 29 text boxes / shape infos, no tables or media.
- Revised "newest thing found anywhere, by app": Numbers **26.1.0** / `M15.2.1-7048.0.3-2`;
  Pages **26.1.0** / `M15.2.1-7048.0.3-2`; Keynote 14.4.1 / `M14.5-7045.0.17-4` (unchanged —
  no 26.x `.key` was found).

### Notes

- **Charts (TSCH) are covered — by `draftjs-v2.3-comments.pages` — but the probe cannot see
  them.** `scripts/feature-probe.ts` matches charts with `/^TSCH\..*(ChartArchive|ChartInfo)$/`,
  which matches **none** of the 64 `TSCH.*` names in `research/type-registry.json`: no name ends
  in `ChartArchive`, and the only `ChartInfo` name — `TSCH.PreUFF.ChartInfoArchive` — ends in
  `Archive`, so the `$` anchor fails. Every `charts=` figure the probe prints is 0 regardless
  of content. Scanning instead for *instance-level* archives (`TSCH.ChartDrawableArchive`,
  `TSCH.*NonStyleArchive`, `TSCH.PreUFF.Chart{Info,Grid}Archive` — **not** the `*StyleArchive`
  families, of which every iWork document carries ~78 as theme defaults) shows 4 of the 874
  modern documents have a real chart, `draftjs-v2.3-comments.pages` among them. The two
  chart-richer documents found have no license file:
  `TheAxeC/machine-learning-…-intrusion-detection-systems` `documents/poster.pages` (3 charts)
  and `ailzy/RISKIM` `res.pages` (2). Best licensed un-taken chart candidate: `ToFuProject/tofu`
  `Notes_Upgrades/Eurofusion/EEG-Interim_Report_template_2MS6HK_v2_0.pages` (MIT, 945 KB,
  chart + footnote + 4 readable table cells + footer). The probe was left unmodified as
  instructed — see `research/pages-feature-coverage.md`.
- Rejected despite good scores, for lack of any license file at the repository root:
  `nerds-odd-e/scrummaster-checklist` (14 footnotes + comments + 5 sections),
  `NeutrinoSys/java-foundations-solutions` (**17 comments**, the richest comment document
  found), `abentele/Erbele` (image filters, only 210 KB),
  `loaydatrain/Optimizing_Millimeter_Wave_Communication` (2 image filters + 10 masks),
  `xg1990/GCP-Data-Engineer-Study-Guide` (7 footnotes + 31 hyperlinks).
  If licensing is ever clarified upstream, the scrummaster and NeutrinoSys files are the
  two best remaining upgrades.
- No existing fixture was modified or removed.

---

## Real-world Pages fixtures

Modern IWA `.pages` documents that were **authored in Pages by real users and committed to
public GitHub repositories** (as opposed to the synthetic files in formal parser test suites).
Fetched 2026-07-30 with `curl -L` from `raw.githubusercontent.com`; every file is a
byte-identical copy of the upstream blob (md5 given per file) and every source repository
carries an explicit open licence — candidates from unlicensed repositories were rejected and
are listed in `research/realworld-pages-survey.md` instead.

Container check for all six: zip with top-level `Index/*.iwa` (`flat` layout), confirmed by
`unzip -l` and by `scripts/feature-probe.ts` parsing them without error.

| Source repo | Commit | Branch | Licence |
|---|---|---|---|
| https://github.com/desmarais-patrick/notes | `fdd027e083cfab79fe721741c6a6a15c579b3a94` | `master` | MIT (`LICENSE`, © 2019 Patrick Desmarais) |
| https://github.com/patrickomatic/iwork | `e0f4f297cbbd8e98e38396d3dbc97828ea804a4f` | `main` | MIT (`LICENSE`, © 2026) |
| https://github.com/CompPhysics/ThesisProjects | `4a752449e8824927b29b724bf873fc82766f23f0` | `master` | CC0-1.0 (`LICENSE`) |

### desmarais-notes-comments-tables.pages
- Source: https://github.com/desmarais-patrick/notes/blob/master/src/review-01.pages
- Repo `desmarais-patrick/notes` @ `fdd027e083cfab79fe721741c6a6a15c579b3a94`, licence **MIT**
- 132,018 bytes, md5 `418d037294781dc3c076a26220ebf5fc`
- fileFormatVersion **4.1.7**, app build **M8.1-6369-2** (Pages 8.1, "iwork19" era), flat `Index/*.iwa`
- Content: a personal technical review write-up with reviewer annotations left in the document.
- Value: **real reviewer comments (6)** on a genuine, human-written document, plus readable v5
  table cells and **3 TOC objects** (every fixture predating this survey had exactly 1).
- feature-probe:
  ```
  pages | era=iwork19 | format=4.1.7 | build=M8.1-6369-2 | flat | 669 objects | score=4
  textStorages=20  nonEmptyStorages=2  tables=4  tableCellStorage=v5  readableTableCells=4  comments=6  inlineAttachments=5  listStyledParagraphs=22  bodyChars=15612  paragraphs=170  sections=1  namedParagraphStyles=23  namedListStyles=9  tocObjects=3  hasTOC=true
  ```

### desmarais-notes-sections-hyperlinks.pages
- Source: https://github.com/desmarais-patrick/notes/blob/master/src/review-02.pages
- Repo `desmarais-patrick/notes` @ `fdd027e083cfab79fe721741c6a6a15c579b3a94`, licence **MIT**
- 213,565 bytes, md5 `0cb388a59ea78db63ba677a0c75a8461`
- fileFormatVersion **4.1.7**, app build **M8.1-6369-2**, flat `Index/*.iwa`
- Content: long-form structured notes (156 paragraphs, ~14.6k chars) split across **8 document
  sections** with external hyperlinks and smart fields.
- Value: **highest section count of any fixture in the set (8)**; every fixture predating this
  survey had exactly 1 section.
- feature-probe:
  ```
  pages | era=iwork19 | format=4.1.7 | build=M8.1-6369-2 | flat | 629 objects | score=4
  textStorages=145  nonEmptyStorages=1  tableCellStorage=none  hyperlinks=5  smartFields=5  listStyledParagraphs=151  bodyChars=14589  paragraphs=156  sections=8  namedParagraphStyles=23  namedListStyles=9  tocObjects=1  hasTOC=true
  ```

### patrickomatic-pages26-sections-masks.pages
- Source: https://github.com/patrickomatic/iwork/blob/main/examples/pages/eternal_sunshine.pages
- Repo `patrickomatic/iwork` @ `e0f4f297cbbd8e98e38396d3dbc97828ea804a4f`, licence **MIT**
- 205,537 bytes, md5 `c3f17ba8c699e101af9c24c6798b6394`
- fileFormatVersion **26.1.0**, app build **M15.2.1-7048.0.3-2** (Pages 15.2.1, "current" era), flat `Index/*.iwa`
- Content: a long-form narrative document (6 sections, ~9k chars) built from one of the shipped
  Pages book/novel templates, with masked images, 25 smart fields and floating text boxes.
- Value: a **real-world `26.x` document** (era `current`) that combines multi-section layout,
  image masks and a large smart-field population — the only real-world, human-authored file in
  the set on the newest format generation.
- feature-probe:
  ```
  pages | era=current | format=26.1.0 | build=M15.2.1-7048.0.3-2 | flat | 721 objects | score=6
  textStorages=113  nonEmptyStorages=4  images=2  imagesWithMask=2  tableCellStorage=none  smartFields=25  inlineAttachments=2  listStyledParagraphs=119  bodyChars=9044  paragraphs=51  sections=6  textBoxes=4  namedParagraphStyles=23  namedListStyles=5  tocObjects=1  hasTOC=true  shapeInfos=4
  ```

### patrickomatic-termpaper-footers-masks.pages
- Source: https://github.com/patrickomatic/iwork/blob/main/examples/pages/term_paper.pages
- Repo `patrickomatic/iwork` @ `e0f4f297cbbd8e98e38396d3dbc97828ea804a4f`, licence **MIT**
- 221,011 bytes, md5 `fbe5f47ea346151d2843ee55478dbf92`
- fileFormatVersion **26.1.0**, app build **M15.2.1-7048.0.3-2**, flat `Index/*.iwa`
- Content: an academic term-paper document with **two non-empty page footers** (running
  footer text on the section templates) and masked images.
- Value: **running-footer text on a `26.x` document** — section-template footers as Pages 15.2.1
  writes them, which no other real-world file in this survey provided.
- feature-probe:
  ```
  pages | era=current | format=26.1.0 | build=M15.2.1-7048.0.3-2 | flat | 492 objects | score=5
  textStorages=19  nonEmptyStorages=3  images=2  imagesWithMask=2  tableCellStorage=none  smartFields=10  inlineAttachments=3  listStyledParagraphs=19  bodyChars=872  paragraphs=18  sections=1  nonEmptyFooters=2  namedParagraphStyles=23  namedListStyles=6  tocObjects=1  hasTOC=true
  ```

### compphysics-poster-images-masks.pages
- Source: https://github.com/CompPhysics/ThesisProjects/blob/master/doc/PhD/phd_students/former/Ben/Pairing%20Model%20QPE%20%7C%20Poster.pages
- Repo `CompPhysics/ThesisProjects` @ `4a752449e8824927b29b724bf873fc82766f23f0`, licence **CC0-1.0**
- 1,650,801 bytes, md5 `6243a50657bd28c072ab3b3928c81dfb`
- fileFormatVersion **2.2.4**, app build **M6.2-4582-1** (Pages 6.2, "iwork16" era), flat `Index/*.iwa`
- Content: a physics conference poster ("Pairing Model QPE") from a University of Oslo
  computational-physics PhD project — 29 images of which **9 carry image masks**, laid out in
  48 floating text boxes.
- Value: **densest image/mask document in this survey** (29 images, 9 masked) and the only
  real-world poster-style layout; also the only CC0-licensed file in the set.
- feature-probe:
  ```
  pages | era=iwork16 | format=2.2.4 | build=M6.2-4582-1 | flat | 489 objects | score=5
  textStorages=67  nonEmptyStorages=22  images=29  imagesWithMask=9  tableCellStorage=none  inlineAttachments=17  listStyledParagraphs=67  bodyChars=72  paragraphs=54  sections=1  textBoxes=48  namedParagraphStyles=24  namedListStyles=9  tocObjects=1  hasTOC=true  shapeInfos=48
  ```

### Licence notes for this section
- Four of the six files are MIT, one is CC0-1.0. All licences are repository-level `LICENSE`
  files that were fetched and read, not inferred from GitHub metadata.
- `desmarais-patrick/notes` is a personal repository whose owner chose MIT explicitly; the
  documents are project write-ups containing no contact details (verified by scan).
- `patrickomatic/iwork` is an MIT-licensed Rust crate whose `examples/pages/*` documents are
  derived from stock Pages templates; only the crate author's own rendering is redistributed.
- Substantially better-scoring real-world documents exist on GitHub but were **rejected for
  lack of any licence** — see `research/realworld-pages-survey.md` for the full list, including
  the only files found anywhere that exercise change tracking and image adjustments.

## Open-web fixtures

Six files added on 2026-07-30 from an **open-web** hunt (public repositories and ordinary
websites, deliberately excluding git forges — see `research/openweb-survey.md` for the full
survey, including everything probed but *not* shipped and why).

Licensing rule applied: a file was only copied here when its deposit record carries an explicit
CC-BY / CC0 / public-domain grant. Every file below was downloaded from its publisher's own API
and its MD5 checked against the checksum the publisher publishes; the local copies are
byte-identical to the deposited originals.

**Headline result: the first `26.x` Keynote fixtures in the corpus.** Before this pass the
newest `.key` anywhere in the set was `fileFormatVersion` 14.4.1 (Keynote 14.5). There are now
three `26.x` Keynote documents, including one written by **iPadOS/iOS Keynote**, which no other
fixture in the corpus is.

### zenodo-v26.1-hyperlinks-masks.key

- Source URL: <https://zenodo.org/records/20810526> —
  file `WS - Rainer.key` via `https://zenodo.org/api/records/20810526/files/WS%20-%20Rainer.key/content`
- Publisher / creator: Krug, Rainer M (SIB Swiss Institute of Bioinformatics).
  "Building Together: The SIB — Senckenberg Collaboration", Zenodo, 2026-06-14.
  DOI [10.5281/zenodo.20810526](https://doi.org/10.5281/zenodo.20810526)
- License: Zenodo record metadata states `"license": {"id": "cc-by-4.0"}` — **Creative Commons
  Attribution 4.0 International**, <https://creativecommons.org/licenses/by/4.0/>. Attribution
  as above; the file is redistributed unmodified.
- 1,475,724 bytes, md5 `38ba0df2c577e5c73fe032d777eaeae4` (matches Zenodo's published checksum)
- `fileFormatVersion` **26.1.0**; BuildVersionHistory
  `['Template: 33_DynamicLight (dev/15.3)', 'M15.2.1-7048.0.3-2']` — Keynote 15.2.1 on macOS.
  Note the origin template is stamped `dev/15.3`, a *newer* train than the writer, the same
  pattern `numbers-parser-v26.1-date-formats.numbers` shows.
- Layout: 69 entries, `Index/` + `Data/` + `Metadata/`, three `preview*.jpg`.
- feature-probe:
  ```
  keynote | era=current | format=26.1.0 | build=M15.2.1-7048.0.3-2 | flat | 1035 objects | score=4
  textStorages=98  nonEmptyStorages=47  images=9  imagesWithMask=7  tableCellStorage=none  hyperlinks=7  smartFields=7  inlineAttachments=4  listStyledParagraphs=98
  ```
- Why it is here: highest-scoring `26.x` Keynote found anywhere. It is the only `26.x` `.key`
  in the corpus that exercises **hyperlinks + smart fields + image masks** together.

### zenodo-v26.1-pptx-lineage.key

- Source URL: <https://zenodo.org/records/20813233> — file
  `The Role of AI in IPBES Assessments and Biodiversity Literature Analysis - hype or Salvation.key`
- Publisher / creators: Krug, Rainer M (SIB Swiss Institute of Bioinformatics); Ruch, Patrick
  (HES-SO Genève). Zenodo, 2026-06-23.
  DOI [10.5281/zenodo.20813233](https://doi.org/10.5281/zenodo.20813233)
- License: `"license": {"id": "cc-by-4.0"}` — **CC BY 4.0**,
  <https://creativecommons.org/licenses/by/4.0/>. Redistributed unmodified.
- 1,277,157 bytes, md5 `6a20bf85e13e19999e7600d6e8835bb9` (matches Zenodo's checksum)
- `fileFormatVersion` **26.1.0**; BuildVersionHistory `['pptx', 'M15.2.1-7048.0.3-2']`
- Layout: 51 entries, `Index/` + `Data/` + `Metadata/`.
- feature-probe:
  ```
  keynote | era=current | format=26.1.0 | build=M15.2.1-7048.0.3-2 | flat | 1111 objects | score=2
  textStorages=130  nonEmptyStorages=74  images=13  tableCellStorage=none  inlineAttachments=11  listStyledParagraphs=130
  ```
- Why it is here: **import lineage**. Element 0 of BuildVersionHistory is the literal string
  `pptx`, so this is a PowerPoint deck imported into Keynote and re-saved at 26.1.0. The corpus
  had `xlsx`/`csv`/`docx` origin markers only on Numbers/Pages files; this is the first
  `pptx`-origin Keynote, and the first non-template origin marker on any `.key`.

### zenodo-v26.0-ios-writer.key

- Source URL: <https://zenodo.org/records/18500468> — file `final slides.key`
- Publisher / creator: Böhn, Livana. "Insulin discourse" (dataset), Zenodo, 2026-02-06.
  DOI [10.5281/zenodo.18500468](https://doi.org/10.5281/zenodo.18500468)
- License: `"license": {"id": "cc-by-4.0"}` — **CC BY 4.0**,
  <https://creativecommons.org/licenses/by/4.0/>. Redistributed unmodified.
- 5,060,510 bytes (4.83 MiB), md5 `26c91f17012f11602facb0dcfd4bc95c` (matches Zenodo's checksum).
  **Size note:** this is under 5 MiB but marginally over 5 × 10⁶ bytes. It is the largest file
  in `fixtures/` after `draftjs-v2.3-comments.pages` (3.80 MB). If the size budget is strict
  decimal, this is the one file in this section to drop — nothing else here exceeds 1.5 MB.
- `fileFormatVersion` **26.0.0**; BuildVersionHistory
  `['Template: 36_DynamicWavesLight (release/iwork/15.0)', 'T15.1 (7373.0.281)']`
- Layout: 88 entries, `Index/` + `Data/` + `Metadata/`.
- feature-probe:
  ```
  keynote | era=current | format=26.0.0 | build=T15.1 (7373.0.281) | flat | 1272 objects | score=4
  textStorages=136  nonEmptyStorages=67  images=14  imagesWithMask=9  tableCellStorage=none  hyperlinks=4  smartFields=4  inlineAttachments=10  listStyledParagraphs=136
  ```
- Why it is here: two firsts. It is the only **`26.0.0`** `.key` found, and the only
  **iPadOS/iOS-written** document in the modern half of the corpus — build string `T15.1
  (7373.0.281)`, the `T<ver> (<build>)` form, rather than the macOS `M<ver>-<build>-<n>` form
  every other modern fixture carries. Its origin template is stamped
  `release/iwork/15.0`, a branch-name form not seen on any other fixture.

### zenodo-v13.1-tables-images.key

- Source URL: <https://zenodo.org/records/18975601> — file `Role of toxins in dis development.key`
- Publisher / creator: Amit Chauhan (Udai Pratap College (Autonomous), Varanasi).
  "Role of toxins in disease development" (lesson), Zenodo, 2026-03-12.
  DOI [10.5281/zenodo.18975601](https://doi.org/10.5281/zenodo.18975601)
- License: `"license": {"id": "cc-by-4.0"}` — **CC BY 4.0**,
  <https://creativecommons.org/licenses/by/4.0/>. Redistributed unmodified.
- 926,463 bytes, md5 `ed969467dbd98f0e69cb5e172bb4ec6d` (matches Zenodo's checksum)
- `fileFormatVersion` **13.1.2**; BuildVersionHistory `['Template: White (12.2)', 'M13.1-7037.0.101-2']`
- Layout: 122 entries, `Index/` + `Data/` + `Metadata/`.
- feature-probe:
  ```
  keynote | era=modern | format=13.1.2 | build=M13.1-7037.0.101-2 | flat | 1139 objects | score=4
  textStorages=107  nonEmptyStorages=54  images=8  imagesWithMask=7  tables=2  tableCellStorage=v5  readableTableCells=2  inlineAttachments=10  listStyledParagraphs=112
  ```
- Why it is here: the only `.key` in the corpus with **readable (BNC v5) table cells**. The
  existing Keynote table fixture, `tika-testKeynote2013.key`, is pre-BNC and its cell values
  cannot be decoded at all; `iwork-mcp-v14.5-sample.key` and `tika-testKeynote2018.key` have no
  tables. It also fills the empty 10.x–14.x band in Keynote version coverage.

### tudortmund-v4.2-footers-table.pages and tudortmund-v14.1-footers-table.pages

Both files come from the **same dataset and are the same document in two format eras** — see the
note below, which is the reason both were taken.

- Source URLs:
  `https://data.tu-dortmund.de/api/access/datafile/58415` (`Telemann-Summary-Deutsch.pages`) and
  `https://data.tu-dortmund.de/api/access/datafile/58416` (`Telemann-Summary-English.pages`),
  dataset <https://doi.org/10.17877/TUDODATA-2025-MC06WAYR>
- Publisher / creator: Remes, Derek (TU Dortmund University). G. P. Telemann's *"Exercises in
  Singing, Keyboard-Playing, and Thoroughbass"*, TUDoData (TU Dortmund research data
  repository), 2025-06-17.
- License: the Dataverse dataset record carries
  `"license": {"name": "CC BY 4.0", "uri": "http://creativecommons.org/licenses/by/4.0", ...}`
  — **Creative Commons Attribution 4.0 International**,
  <https://creativecommons.org/licenses/by/4.0/>. Both files redistributed unmodified.
- `tudortmund-v4.2-footers-table.pages`: 310,177 bytes, md5 `2993169fa65d06aef774070168d7c068`;
  `fileFormatVersion` **4.2.3**; BuildVersionHistory `['Template: Blank (4.2)', 'M8.2-6520-2']`
  (Pages 8.2, iWork '19 era); 43 zip entries, `Index/` + `Metadata/`, no `Data/`.
  ```
  pages | era=iwork19 | format=4.2.3 | build=M8.2-6520-2 | flat | 580 objects | score=4
  textStorages=63  nonEmptyStorages=48  tables=1  tableCellStorage=v5  readableTableCells=1  inlineAttachments=3  listStyledParagraphs=63  bodyChars=91  paragraphs=4  sections=1  nonEmptyFooters=3  namedParagraphStyles=21  namedListStyles=9  tocObjects=1  hasTOC=true
  ```
- `tudortmund-v14.1-footers-table.pages`: 324,161 bytes, md5 `2874ee73d6762c65be08897ae1a13859`;
  `fileFormatVersion` **14.1.1**; BuildVersionHistory
  `['Template: Blank (4.2)', 'M8.2-6520-2', 'M14.1-7040.0.73-4']`; 43 zip entries,
  `Index/` + `Metadata/`, no `Data/`.
  ```
  pages | era=modern | format=14.1.1 | build=M14.1-7040.0.73-4 | flat | 621 objects | score=4
  textStorages=63  nonEmptyStorages=48  tables=1  tableCellStorage=v5  readableTableCells=1  inlineAttachments=3  listStyledParagraphs=63  bodyChars=100  paragraphs=4  sections=1  nonEmptyFooters=3  namedParagraphStyles=23  namedListStyles=9  tocObjects=1  hasTOC=true
  ```
- Why they are here: **a matched upgrade pair.** The two files share the same origin template
  (`Template: Blank (4.2)`) and the same first writer (`M8.2-6520-2`); the English one was then
  re-saved by Pages 14.1 and its BuildVersionHistory simply *appends* that build. So the pair
  isolates exactly what a 4.2.3 → 14.1.1 upgrade changes in a document that is otherwise the
  same: same 63 text storages, same single BNC-v5 table, same 3 non-empty footers, same 3 inline
  attachments, +41 archives and +2 named paragraph styles. `4.2.3` is also the only
  Pages 8.2 / `4.2.x` writer in the set — the neighbouring
  `desmarais-notes-*.pages` pair is `4.1.7` / Pages 8.1, so the two together bracket the
  8.1 → 8.2 point release within the same format era.

### Notes on this section

- Naming follows `<source>-v<fileFormatVersion>-<features>.<ext>`; here the version really is
  `fileFormatVersion` from `Metadata/Properties.plist`, not the app version (Keynote 15.2.1
  writes `26.1.0`, Keynote 15.1 on iPadOS writes `26.0.0`).
- No existing fixture was modified or removed by this pass.
- CC BY 4.0 requires attribution and an indication of changes. No file above was changed; the
  creator, title, source and license are recorded per file, which satisfies the notice
  requirement for verbatim redistribution inside an MIT-licensed repository (the MIT grant
  covers this project's own code, not these third-party documents — the documents stay under
  their own CC licenses).
- Files deliberately **not** taken despite being downloadable — copyright unclear or
  incompatible — are listed in `research/openweb-survey.md`. The most notable exclusion is
  Harvard Dataverse `doi:10.7910/DVN/YFY5HI`, whose three `.pages` files are
  **CC BY-NC-ND 4.0** (the NC clause is incompatible with this repository).

## Non-git / archive fixtures

Files in this section were obtained **outside any git host** — from package registries
(npm, PyPI, RubyGems, crates.io, Go module proxy, CPAN, Packagist, NuGet, Maven Central),
web archives (archive.org), and bug-tracker / test-corpus sources. Survey method,
every file probed (including the ones deliberately **not** taken), and the dead-end source
categories are written up in `research/archive-survey.md`.

Verification applied to every candidate: first two bytes are `PK`, then
`node scripts/feature-probe.ts <file>`. `fileFormatVersion` comes from
`Metadata/Properties.plist` and the build string from the **last** element of
`Metadata/BuildVersionHistory.plist`, both read as binary plists.

### pypi-numbers-parser-v14.1.1-empty-template.numbers

- Source: **PyPI sdist**, not the git repo —
  `https://files.pythonhosted.org/packages/04/95/0c2086cabd2b65efaafa2ad0a8fd87434ea7463eebac228c974cf22e08cd/numbers_parser-4.18.5.tar.gz`
  (`numbers_parser` 4.18.5, uploaded 2026-05-18). Obtained with
  `curl https://pypi.org/pypi/numbers-parser/json` → sdist URL → `curl` → `tar -xzf`;
  member `numbers_parser-4.18.5/src/numbers_parser/data/empty.numbers`. Nothing was installed.
- License: **MIT** — `numbers_parser-4.18.5/LICENSE.rst` is inside the same tarball
  ("Copyright 2021 Jon Connell … Permission is hereby granted, free of charge …").
  This is a stronger grant than a bare `license:` field: the licence text ships with the file.
- 90,601 bytes, md5 `35f7c069ab7cec68d426ca2857fe6ff5`
- `fileFormatVersion` **14.1.1**; BuildVersionHistory last entry **`M14.1-7040.0.73-4`**
  (Numbers 14.1, macOS).
- feature-probe: `numbers | era=modern | format=14.1.1 | build=M14.1-7040.0.73-4 | flat |
  643 objects | score=2` —
  `textStorages=7 nonEmptyStorages=1 tables=1 tableCellStorage=v5 readableTableCells=1
  inlineAttachments=1 listStyledParagraphs=7`
- Why it is here: it is the **seed template `numbers-parser` itself writes from** when creating
  a new document, i.e. the canonical minimal modern Numbers package — one empty table, BNC v5
  storage, no media. It also fills a real version gap: the other Numbers fixtures are
  `2.0.24`, `14.4.1`, `26.0.0` and `26.1.0`, with nothing at `14.1.x`.

### npm-keynote-extractor-v2.0.24-macos-images-masks.key

- Source: **npm tarball**, not the git repo —
  `https://registry.npmjs.org/keynote-extractor/-/keynote-extractor-2.1.0.tgz`;
  member `package/test/test-data/presentation.key`. Obtained by resolving `dist.tarball`
  from `https://registry.npmjs.org/keynote-extractor` and `tar -xzf`. Nothing was installed.
- License: **ISC**, declared as `"license": "ISC"` in the published `package/package.json`.
  Caveat, recorded for honesty: the tarball ships **no `LICENSE` file**, so the grant rests on
  the manifest field alone — the same strength of evidence as the `iwork-mcp-*` files above,
  and weaker than `numbers-parser`'s bundled `LICENSE.rst`.
- 398,401 bytes, md5 `f84f5f8218c2943bf6d4c3f3b6e905be`
- `fileFormatVersion` **2.0.24**; BuildVersionHistory last entry **`M6.6.2-2571-1`**
  (Keynote 6.6.2, macOS, 2016).
- feature-probe: `keynote | era=iwork16 | format=2.0.24 | build=M6.6.2-2571-1 | flat |
  498 objects | score=3` —
  `textStorages=62 nonEmptyStorages=34 images=7 imagesWithMask=7 tableCellStorage=none
  inlineAttachments=3 listStyledParagraphs=62`
- Why it is here: it is **not** newer than anything in the set — it is a *writer-platform
  control*. `tika-testKeynote2013.key` has the identical `fileFormatVersion` 2.0.24 but was
  written by **iOS** Keynote (`T2.6.1 (2180)`); this one was written by **macOS** Keynote
  (`M6.6.2-2571-1`). The pair isolates what varies with the writing platform at a fixed
  format version, which is exactly the confound `research/version-survey.md` otherwise has to
  guess at. It is also the only file the package-registry channel yielded that is both
  licensed and under 5 MB.

### Notes on this section

- Naming follows `<source>-v<fileFormatVersion>-<features>.<ext>`, with the source being the
  **registry**, not a repo, because that is where the bytes came from.
- No existing fixture was modified or removed by this pass.
- Everything else this pass probed was rejected for licence (bug-tracker attachments carry no
  redistribution grant), size (the CC0 archive.org Keynotes are 75–116 MB), or age. The full
  list with versions and builds is in `research/archive-survey.md` — including the one genuinely
  novel specimen found, a **Pages 14.4 collaboration-mode package** whose
  `Index/OperationStorage.iwa` is **LZFSE-framed (`bvxn` … `bvx$`), not Snappy**, and which the
  current loader therefore rejects outright.


## Donated fixtures (olekristensen)

Made and donated for this project by Ole Kristensen (github.com/olekristensen),
who granted their inclusion here. Except for the first (an app-template
document), each began as a library-generated seed document (`npm run seeds`),
was edited in the app exactly as its embedded instructions asked, and
returned — so every one is an app-written artifact over library-authored
bytes, carrying the measurement it settled. Screened: no personal data; the
only annotation author string is `cupertino-files`.

### olekristensen-v14.4-placeholders-image.pages
- 219,971 bytes, md5 `31ecb294510c15d071e421ae028ead5e`
- Saved by M14.4-7043.0.93-4 (macOS Pages, format 14.4.1). A template-derived
  document with 9 `TSWP.PlaceholderSmartFieldArchive` fields, one of them
  spanning an image's U+FFFC — the body-document image-placeholder mechanism.
  Danish template ghost text ("Tryk eller klik på denne eksempeltekst …").

### olekristensen-v26.3-ios-placeholder-consumed.pages
- 176,953 bytes, md5 `46c3ecd9f61799c109e25d2806b2940d`
- Saved by T15.3 (7375.0.54) (iOS Pages, format 26.3.1) — the corpus's first
  iOS-written file. The seed-placeholder round trip: a library-defined
  placeholder was tapped and typed through in the app, and the resave shows
  the field consumed; the library-filled line remained plain text.

### olekristensen-v26.3-ios-rtl-direction.pages
- 226,240 bytes, md5 `14e7bdd69cca535497c87e16910fe499`
- Saved by T15.3 (iOS Pages). A Hebrew paragraph flipped with the app's own
  paragraph-direction control: the storage's bidi pair reads `(1, 0)` on that
  paragraph with the style untouched — the file that named the direction
  mechanism.

### olekristensen-v26.3-ios-borders-logical.pages
- 240,218 bytes, md5 `d458800c1f4a6d10ad1f7ea7f4e98525`
- Saved by T15.3 (iOS Pages). Red left-only (4) and blue right-only (8)
  borders on LTR paragraphs, and a green left-edge border on a
  library-written RTL paragraph storing 8 — the file that measured the side
  bits as logical (4 leading, 8 trailing). The library's `(1, 0)` direction
  pair survived the app's resave untouched.

### olekristensen-v26.3-mac-builds-effects.key
- 547,036 bytes, md5 `6e6c7a056f2ed53845e99d4161af1b7c`
- Saved by M15.3-7050.0.24-2 (macOS Keynote, format 26.3.1). The corpus's
  only deck with builds: three Build In effects added in the app — Dissolve
  (`apple:dissolve character`), Move In (`apple:move in character`) and
  Anvil (`com.apple.iWork.Keynote.BUKAnvil`), the third delivered "By
  Paragraph" with two automatic chunks (delay 1 s, duration 1.75 s). The
  file that decoded `KN.AnimationAttributesArchive` — effect and timing on
  modern builds.

### olekristensen-v26.3-mac-filters.numbers
- 110,397 bytes, md5 `8fc8d76fe1e18262b09f16e01346d293`
- Saved by M15.3-7050.0.24-2 (macOS Numbers). The corpus's only populated
  filter set: two enabled row rules on one table — column A `>10`
  (predicate_type 7) and column B text-contains "ko" (type 3, the
  `NOT(ISERROR(f_296(...)))` compilation) — mode "all", parallel arrays
  consistent.

### olekristensen-v26.3-mac-conditional-rules.numbers
- 134,729 bytes, md5 `4c36d9dcad8cfc184280d21b4a49402d`
- Saved by M15.3-7050.0.24-2 (macOS Numbers). Conditional-formatting rule
  sets covering `>5` (type 7), `>=7` (type 8), text-contains "pear"
  (type 3) and is-blank (type 34) — the corpus evidence behind the
  completed comparison enum.

### olekristensen-v26.3-mac-borders-logical.pages
- 237,404 bytes, md5 `d6b84be56ca88145e60de7164d8d94f3`
- Saved by M15.3-7050.0.24-2 (macOS Pages). The macOS re-measurement of the
  border side bits: the same red/blue/green paragraph ladder as the iOS
  file, storing {4, 8, 8} with the green visual-left edge on the RTL
  paragraph at 8 — both writers agree the bits are logical.

### olekristensen-v26.3-mac-placeholder-consumed.pages
- 177,949 bytes, md5 `c8e521e41af68fa274695fbddf03d694`
- Saved by M15.3-7050.0.24-2 (macOS Pages). The macOS placeholder round
  trip: the library-defined placeholder consumed by clicking and typing
  ("Jeg skriver noget"), zero placeholder fields in the resave.

### olekristensen-v26.3-seed-checkbox-returned.numbers
- 119,297 bytes, md5 `b8073d3b70cacf73aa1af7642a2fbd86`
- Saved by macOS Numbers (format 26.3). The checkbox one-delta seed: a
  library-written TRUE cell toggled to Dataformat ▸ Afkrydsningsfelt in the
  app and saved with no other change. The app's write names the whole
  mechanism: bool format `{format_type: 263}`, the record's control id, a
  control-spec entry (`interaction_type` 8) in the type-12 list, and
  extras 0x20 — the format without the control had shown as Automatic.

### olekristensen-v26.3-demo07-rules-returned.numbers
- 167,230 bytes, md5 `55e989d9ea78650abaa7274d5dfc6868`
- Saved by macOS Numbers (26.3) after reviewing demo-07's conditional
  rules and controls. The decisive measurement for the engine's
  dependency ledger: the demo was written with rules on seven cells but
  no `CellRecordTileArchive` records, and the app showed every rule in
  the inspector without evaluating one until a cell was deleted and
  re-typed. The file carries the aftermath — exactly the five
  re-committed cells registered under the kind-3 owner, each record one
  edge naming the cell itself in the table's kind-1 owner — proving
  registration happens on commit, that partial ledgers are app-real,
  and that a written rule needs its record before the app will draw a
  fill. Also the app-side confirmation that pop-up menus this library
  writes survive editing, and that library-written number cells
  right-align only after the same re-commit.

### olekristensen-v26.3-demo07-rules-round2.numbers
- 161,113 bytes, md5 `f913adbb4ef40fdd9b8c52211b7f2f81`
- Saved by macOS Numbers (26.3) after reviewing the rebuilt demo-07 —
  the round that confirmed library-written ledger registration end to
  end. All seven rule cells drew their fills on open with no cell
  touched, and the app's save kept every one of the seven
  library-written `CellRecordExpandedArchive`s intact under the kind-3
  owner. The same save shows the app's record normalization: every
  value cell gains its type's format id, `suggest_id`, and (on rule
  cells) `cond_rule_style_id`. The reviewer's remaining notes — »Ikke
  højrestillet« on exactly the number cells no rule matched plus the
  slider and stepper cells — are what isolated the missing default
  format as its own fault, separate from rule evaluation.

### olekristensen-v26.3-demo11-shadows-returned.pages
- 334,274 bytes, md5 `1d96fb972ebbad30416079be06aacea1`
- Saved by macOS Pages (15.3.1) after reviewing demo-11's shadow rungs.
  Carries three app-written shadow states beside this library's own:
  the popup's fresh drop-shadow preset (stored angle 90 = inspector
  270°, offset 2, blur 5, 50 % opacity — written over our disabled
  archive when the reviewer re-enabled it), a contact shadow with the
  reviewer's 40 pt blur and its `contactShadow` sub-archive (one float
  at sub-field 2), and a curved shadow adjusted inward, the corpus's
  first `curvedShadow` sub-archive (one float at sub-field 1,
  negative). The file is also the app-side confirmation that a shadow
  this library writes survives the app's own shadow popup.

### olekristensen-v26.3-seed-crop-returned.pages
- 537,381 bytes, md5 `88fff560167af5c5f739c9450667c852`
- Saved by macOS Pages (format 26.3.1). The crop-delta seed: one
  library-inserted photo (Hokusai's Great Wave, public domain), cropped in
  the app with its own mask editor and saved with no other change. The
  app's crop flow left the original image object anchored, wrote a *new*
  image beside it — z-ordered, wrap type 2, real page position, generated
  thumbnail — and the new mask matches this library's `setCrop` output
  field for field: window in the image's drawn space, parent back-pointer,
  wrap type 4 with the 12 pt margin, the six-element rectangle path. The
  file that confirmed the mask editor engages on a library-inserted image
  and that the authored mask shape is the app's own.

### olekristensen-v26.3-seed-picture-wrap-returned.pages
- 209,645 bytes, md5 `645fad3da9356e0cc32f12624a9fbefe`
- Saved by macOS Pages (last writer `M15.3.1-7050.1.1-2`, the same build as
  the other v26.3 seeds). The wrap-delta seed, and the document that settled
  the inline-image placement fault reported on 2026-08-03 (`docs/BLOCKERS.md`)
  and closed as the wrap law in #65: **two identical library-inserted
  pictures, one corrected by hand in the app, then diffed field by field
  against the untouched one.** The entire difference was
  `exterior_text_wrap`. A picture this library inserts carries none, so the
  app supplies its own on first save and that default floats the drawable,
  drawn from the page margin, ignoring the paragraph's indent, with the next
  paragraph running up its side. No width and no geometry moves it, because
  the wrap is what decides.
- It is a *negative* control as much as a positive one: the untouched picture
  is preserved in the file, so the fault and its fix sit in one document and
  the question is repeatable rather than re-derivable.
- Provenance: built while typesetting a client manual with this library, in
  `den-frie-vilje/gosscounselling.co.uk`. Moved here because the evidence for
  a library law belongs with the library, not in the site repository that
  happened to hit it. Contains only Den Frie Vilje's own logo and two
  generated probe images; no client content.

## Fixture privacy policy

A permissive licence makes a document *redistributable*; it does not make it *appropriate*
as a test fixture. Documents are additionally screened for personal data, and one that
carries it is not included even when the licence would allow it.

**Removed under this policy**

- A CV/résumé from an MIT-licensed personal repository (Pages 12.0.8, 7 hyperlinks — it was
  the highest hyperlink count found). It contained a private individual's personal email
  address, phone number and employment history. The repository owner published a repository;
  they did not publish their contact details for redistribution into unrelated projects.
  Hyperlink coverage is retained through other fixtures.

**Screened and retained**

- `rougier-v13.1-image-filters-masks.pages` contains two *institutional* academic addresses
  (`@u-bordeaux.fr`, `@ensc.fr`) printed on a published scholarly poster — professional
  contact information published for that purpose, not private data. Retained deliberately,
  recorded here so the decision is explicit rather than an oversight.
- `patrickomatic-*.pages` contain only Apple's stock template placeholder text
  ("Author Name", "To get started, just tap or click this placeholder text").
- `compphysics-poster-images-masks.pages` is CC0 published academic work with normal
  scholarly authorship.

**Re-run the screen** after adding fixtures:

```sh
node scripts/scan-fixture-privacy.ts
```
