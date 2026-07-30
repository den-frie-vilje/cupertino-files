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
