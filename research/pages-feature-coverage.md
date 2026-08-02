# Pages feature coverage — fixture survey

Survey date: 2026-07-30. Tool: `node scripts/feature-probe.ts <file> [--json]`.
Goal: find **modern IWA** `.pages` documents that exercise document features the existing
fixture set does not (image filters/masks, headers & footers with text, footnotes,
comments, hyperlinks, multiple sections, charts, change tracking, v5/BNC table cells).

Parser state when these numbers were taken: commit `8ef56e4` plus an uncommitted edit to
`src/tswp/textstorage.ts`. `src/` was under active development while this survey ran and
two counters shifted mid-sweep (`inlineAttachments`, `listStyledParagraphs`); everything
here is the post-change re-probe. No priority-feature counter changed, so the selection
below is unaffected — but re-run the probe before trusting an exact count.

## Method

1. Exhausted the classic format-conversion / preservation corpora by cloning them and
   listing every `.pages` blob (`git ls-tree -r HEAD --name-only | grep -i '\.pages$'`).
   These yielded almost nothing usable — see *Corpus-by-corpus results* below.
2. Widened to a **whole-of-GitHub file-name sweep** using Sourcegraph's public streaming
   search API (`file:\w\.pages$ count:all select:file fork:yes archived:yes`), which
   returned **1,154** candidate `(repo, path)` pairs across 322 repositories.
   The `\w` prefix is load-bearing: a plain `\.pages$` match is swamped by mkdocs
   `awesome-pages` config files that are literally named `.pages`.
3. Downloaded all of them from `raw.githubusercontent.com/<repo>/HEAD/<path>` with a 6 MB
   cap (**1,038** fetched; the rest were >6 MB, deleted upstream, or in `__MACOSX/`),
   and probed every single one.
4. Ranked by the probe's feature score, filtered to files with a **clear repository
   license**, and picked a complementary set.

## Headline result

Of the 1,038 swept files, **874 were modern IWA Pages documents** and 164 were not
(iWork '09 XML, password-protected, or truncated/LFS-pointer blobs).
Feature availability across those 874 modern documents:

| priority feature | probe field | docs containing it | in a licensed doc? |
|---|---|---:|---|
| 1. Image filters/adjustments | `imagesWithFilters` | 4 | yes — CC BY 4.0 + Apache-2.0 |
| 1. Image masks | `imagesWithMask` | 168 | yes — CC BY 4.0, MIT, Apache-2.0 |
| 2. Headers with text | `nonEmptyHeaders` | 176 | yes — Apache-2.0, MIT, LGPL-3.0 |
| 2. Footers with text | `nonEmptyFooters` | 569 | yes — many |
| 3. Footnotes | `footnotes` | 13 | yes — MIT |
| 4. Comments/annotations | `comments` | 4 | yes — MIT (only 1 of the 4 hits is licensed) |
| 5. Hyperlinks | `hyperlinks` | 553 | yes — many |
| 7. Charts (TSCH) — probe counter, see caveat | `charts` | 0 | probe reports 0 for every file — **the counter is broken** |
| 8. Change tracking | `storagesWithChangeTracking` | 1 | yes — LGPL-3.0 (the single hit) |
| 9. Readable table cells (v5/BNC) | `readableTableCells` | 270 | yes — many |
| 9. List-styled paragraphs | `listStyledParagraphs` | 874 | yes — universal |
| 9. Text boxes | `textBoxes` | 177 | yes — many |
| 9. TOC objects | `tocObjects` | 873 | yes — universal |
| 6. Multiple sections (>1) | `sections` | 27 | yes — Apache-2.0, MIT |

### Correction: the probe's `charts` counter never fires

`scripts/feature-probe.ts` counts charts with
`/^TSCH\..*(ChartArchive|ChartInfo)$/`. That pattern matches **none** of the 64 `TSCH.*`
names in `research/type-registry.json` — the registry has no name ending in `ChartArchive`,
and its only `ChartInfo` name is `TSCH.PreUFF.ChartInfoArchive`, which ends in `Archive`
so the `$` anchor fails. `charts=0` is therefore a **probe bug, not a corpus fact**, and
no `charts` figure produced by the probe (including every one in the tables below) is
meaningful. The probe was left unmodified, as instructed.

Re-scanning independently for *instance-level* chart archives — `TSCH.ChartDrawableArchive`,
`TSCH.ChartMediatorArchive`, `TSCH.*NonStyleArchive`, `TSCH.PreUFF.Chart{Info,Grid}Archive`
— gives the real answer. (The `TSCH.*StyleArchive` / `ChartStylePreset` families are *not*
usable evidence: every iWork document carries ~78 of them as theme defaults, chart or no
chart.) **4 of the 874 modern Pages documents contain a real chart:**

| charts | fmt | license | repo :: path |
|---:|---|---|---|
| 3 | `2.0.24` | LICENSE? | `TheAxeC/machine-learning-…-intrusion-detection-systems` :: `documents/poster.pages` |
| 2 | `2.0.43` | LICENSE? | `ailzy/RISKIM` :: `res.pages` |
| 1 | `2.3.4` | MIT | `thibaudcolas/draftjs-filters` :: `pasting/documents/Draft.js paste test document.pages` **← TAKEN** |
| 1 | `3.2.13` | MIT | `ToFuProject/tofu` :: `Notes_Upgrades/Eurofusion/EEG-Interim_Report_template_2MS6HK_v2_0.pages` |

So **priority 7 is covered after all**, by `draftjs-v2.3-comments.pages`, which carries
one `TSCH.ChartDrawableArchive` plus its instance-level axis/legend/series non-style
archives. The two richer chart documents both lack a license file.

## Fixtures after this pass

Existing fixtures are unchanged; eight files were added. Column legend: `filt`=images with
`TSD.ImageArchive.imageAdjustments` (field 14), `mask`=images with a mask (field 5),
`hdr`/`ftr`=headers/footers whose text is non-empty, `fnote`=footnotes, `cmt`=comments,
`link`=hyperlinks, `sect`=sections, `trk`=storages with change-tracking tables,
`cell`=tables with readable cells, `tbox`=text boxes, `bkm`=bookmarks. Blank = 0.

| file | upstream path | fmt | app build | score | filt | mask | img | hdr | ftr | fnote | cmt | link | sect | chart | trk | cell | tbox | toc | list | bkm |
|---|---|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| threatconnect-v11.1-headers-footers-sections.pages **NEW** | fixtures/threatconnect-v11.1-headers-footers-sections.pages | `11.1.2` | `M11.1-7031.0.102-2` | 11 |  | 1 | 7 | 3 | 3 |  |  | 2 | 3 |  |  | 1 | 26 | 1 | 86 | 1 |
| picopalette-v3.2-multisection-footnotes.pages **NEW** | fixtures/picopalette-v3.2-multisection-footnotes.pages | `3.2.13` | `M7.2-5869-2` | 10 |  | 3 | 18 | 13 | 1 | 8 |  | 1 | 14 |  |  | 4 |  | 7 | 292 |  |
| ndpi-v10.0-change-tracking.pages **NEW** | fixtures/ndpi-v10.0-change-tracking.pages | `10.0.10` | `M10.0-6748-2` | 9 |  |  | 1 | 2 | 2 |  |  | 7 | 1 |  | 1 | 1 |  | 1 | 168 | 2 |
| picodocs-v14.4-headers-tables.pages **NEW** | fixtures/picodocs-v14.4-headers-tables.pages | `14.4.1` | `M14.5-7045.0.17-4` | 8 |  |  | 1 | 2 | 2 |  |  | 1 | 2 |  |  | 3 |  | 1 | 88 |  |
| draftjs-v2.3-comments.pages **NEW** | fixtures/draftjs-v2.3-comments.pages | `2.3.4` | `M6.3.1-5249-2` | 7 |  |  | 4 |  |  |  | 3 | 3 | 1 |  |  |  | 3 | 1 | 33 | 1 |
| libetonyek-pages5-extra-dir.pages | fixtures/libetonyek-pages5-extra-dir.pages | `3.2.13` | `G-r320-3C102` | 7 |  | 1 | 1 |  |  |  |  |  | 1 |  |  | 1 | 5 | 1 | 34 |  |
| rougier-v13.1-image-filters-masks.pages **NEW** | fixtures/rougier-v13.1-image-filters-masks.pages | `13.1.2` | `M13.1-7037.0.101-2` | 7 | 1 | 12 | 17 |  |  |  |  | 1 | 1 |  |  |  | 121 | 1 | 141 |  |
| vertx-v2.2-image-filters.pages **NEW** | fixtures/vertx-v2.2-image-filters.pages | `2.2.4` | `M6.2-4582-1` | 5 | 1 |  | 1 |  |  |  |  |  | 1 |  |  |  | 2 | 1 | 21 |  |
| gomap-v26.1-newest-writer.pages **NEW** | fixtures/gomap-v26.1-newest-writer.pages | `26.1.0` | `M15.2.1-7048.0.3-2` | 3 |  |  |  |  |  |  |  |  | 1 |  |  |  | 29 | 1 | 49 |  |
| iwork-mcp-v14.5-sample.pages | fixtures/iwork-mcp-v14.5-sample.pages | `14.4.1` | `M14.5-7045.0.17-4` | 2 |  |  |  |  |  |  |  |  | 1 |  |  |  |  | 1 | 19 |  |
| libetonyek-pages5-file.pages | fixtures/libetonyek-pages5-file.pages | `1.5.0` | `M5.5.3-2152-2` | 2 |  |  |  |  |  |  |  |  | 1 |  |  |  |  | 1 | 19 |  |
| tika-testPages2013.pages | fixtures/tika-testPages2013.pages | `2.0.24` | `T2.6.1 (2160)` | 2 |  |  |  |  |  |  |  |  | 1 |  |  |  |  | 1 | 20 |  |

- `tika-iwork09-testPages.pages` — not modern IWA: iWork '09 `index.xml` package (kept as a negative/contrast fixture).

### What each new fixture adds

| fixture | unique contribution |
|---|---|
| `ndpi-v10.0-change-tracking.pages` | **the only document with change tracking** found in 1,038 candidates (`TSWP.StorageArchive` insertion/deletion tables); also headers+footers with text, 7 hyperlinks, bookmarks, a v5 table. 130 KB. |
| `rougier-v13.1-image-filters-masks.pages` | **image filters** (`imageAdjustments`) plus 12 masked images and 121 text boxes; page-layout (not word-processing) document. |
| `vertx-v2.2-image-filters.pages` | image filters again, but from an **iWork '16-era writer** (fmt 2.2.4) — lets the adjustments payload be diffed across a decade of writers. |
| `picopalette-v3.2-multisection-footnotes.pages` | **14 sections**, **13 non-empty headers**, 8 footnotes, 7 TOC objects, 4 v5 tables, 18 images. The broadest single document found. |
| `threatconnect-v11.1-headers-footers-sections.pages` | highest score (11): 3 sections × (header+footer with text), 26 text boxes, 36 inline attachments, v5 table, bookmark. |
| `draftjs-v2.3-comments.pages` | **comments/annotations** — the only licensed document with them; purpose-built as a rich paste-test document. |
| `picodocs-v14.4-headers-tables.pages` | headers+footers+2 sections+3 v5 tables from a Pages 14.5 writer (`M14.5-7045.0.17-4`); the incumbent fixture on that same build, `iwork-mcp-v14.5-sample.pages`, scores only 2. |
| `gomap-v26.1-newest-writer.pages` | **era, not features** (score 3): `fileFormatVersion` **26.1.0**, build `M15.2.1-7048.0.3-2` — the newest Pages writer found anywhere, and the same build as the newest Numbers fixture. Disproves the note in `fixtures/ATTRIBUTION.md` that no 26.x `.pages` exists in open source. |

### Newest writers seen (bonus finding)

The sweep also moves the corpus's *newest-writer* ceiling for Pages. Ranked by
`fileFormatVersion`, the newest Pages documents in existence anywhere surveyed are:

| fmt | app build | repo :: path | license |
|---|---|---|---|
| `26.1.0` | `M15.2.1-7048.0.3-2` | `bryceco/GoMap` :: `Architecture.pages` | ISC |
| `14.4.1` | `M14.4-7043.0.93-4` | `ContextLab/experimental-psychology` :: `admin/syllabus/PSYC_11_EXPERIMENTAL_PSYCHOLOGY.pages` | not checked |
| `14.4.1` | `M14.5-7045.0.17-4` | `PicoMLX/PicoDocs` :: `Tests/PicoDocsTests/Resources/sample.pages` | MIT |
| `14.4.1` | `M14.4-7043.0.93-4` | `andy489/Empirical_Methods_and_Statistics` :: `_asset/Combinatorics 102 (Andrescu, Feng)/Combinator` | not checked |

`fixtures/ATTRIBUTION.md` previously recorded that **no** `.pages` with a 26.x
`fileFormatVersion` exists in any open-source repository. That is now false:
`bryceco/GoMap` `Architecture.pages` is 26.1.0 on build `M15.2.1-7048.0.3-2` — the very
same build as `numbers-parser-v26.1-date-formats.numbers`. It has been added as
`gomap-v26.1-newest-writer.pages`. No 26.x `.key` was found, so Keynote's ceiling
(14.4.1 / `M14.5-7045.0.17-4`) is unchanged.

## Corpus-by-corpus results (dedicated test corpora)

Every `.pages` file in these corpora was probed. Nearly all are either iWork '09 XML or
near-empty smoke-test documents — which is why the GitHub-wide sweep was necessary.

| file | upstream path | fmt | app build | score | filt | mask | img | hdr | ftr | fnote | cmt | link | sect | chart | trk | cell | tbox | toc | list | bkm |
|---|---|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| isoparametric/python-pages | src/pages/data/default.pages | `26.0.0` | `M15.1.1-7044.0.273-2` | 3 |  |  | 1 |  |  |  |  |  | 1 |  |  |  |  | 1 | 19 |  |
| orcastor/iwork-converter | testdata/a.pages | `14.1.1` | `M14.1-7040.0.73-4` | 3 |  |  |  |  |  |  |  |  | 1 |  |  | 1 |  | 1 | 45 |  |
| LibreOffice/core | writerperfect/qa/unit/data/writer/libetonyek/pass/Pages_5.pages | `1.5.0` | `M5.5.3-2152-2` | 2 |  |  |  |  |  |  |  |  | 1 |  |  |  |  | 1 | 19 |  |
| LibreOffice/libetonyek | src/test/data/pages5-package.pages/Index.zip | `None` | `None` | 2 |  |  |  |  |  |  |  |  | 1 |  |  |  |  | 1 | 19 |  |
| LibreOffice/libetonyek | src/test/data/pages5.zip | `None` | `None` | 2 |  |  |  |  |  |  |  |  | 1 |  |  |  |  | 1 | 19 |  |
| alfredchiesa/nim-iwork | tests/fixtures/simple.pages | `14.4.1` | `M14.5-7045.0.17-4` | 2 |  |  |  |  |  |  |  |  | 1 |  |  |  |  | 1 | 19 |  |

Non-modern / unreadable files in those same corpora:

| file | upstream path | fmt | app build | status |
|---|---|---|---|---|
| LibreOffice/libetonyek | src/test/data/pages4-file.pages | — | — | **not modern IWA (iWork '09 XML)** |
| LibreOffice/core | writerperfect/qa/unit/data/writer/libetonyek/pass/Pages_4.pages | — | — | **not modern IWA (iWork '09 XML)** |
| openpreserve/format-corpus | variations/variations/application/x-iwork-pages-sffpages/09-4.1-923/lorem-ipsu | — | — | **not modern IWA (iWork '09 XML)** |
| xberg-io/test_documents | iwork/test.pages | — | — | **unreadable zip** |
| sindresorhus/file-type | fixture/fixture.pages | — | — | **unreadable zip** |
| richardlehane/siegfried | cmd/sf/testdata/skeleton-suite/containers/fmt-1439-container-signature-id-2103 | — | — | **not modern IWA (iWork '09 XML)** |

Notes on these:

- **apache/tika** — the invitingly-named `testPagesComments.pages`,
  `testPagesHeadersFootersFootnotes.pages` and the four `testPagesHeadersFooters*` files are
  **all iWork '09 `index.xml` packages**, not IWA. They are parsed by Tika's
  `IWorkPackageParser`, not `IWork13PackageParser`. `testPagesPwdProtected.pages` is
  encrypted. `testPages2013.pages` (already a fixture) is the only modern one.
- **LibreOffice/libetonyek** — only 3 `.pages` test files exist; 2 are already fixtures and
  `pages4-file.pages` is '09 XML. `pages5-package.pages/Index.zip` and `pages5.zip` are
  repackagings of the same near-empty document.
- **LibreOffice/core** — `writerperfect/qa/unit/data/writer/libetonyek/pass/` holds exactly
  two `.pages`; `Pages_5.pages` is a 9-character iwork13 smoke test.
- **openpreserve/format-corpus** — one Pages sample only, iWork '09 4.1.
- **richardlehane/siegfried**, **sindresorhus/file-type**, **xberg-io/test_documents** —
  100–300 byte synthetic skeleton/stub files that only carry a signature, not a document.
- **6over3/WorkKit**, **openpreserve/fido**, **harvard-lts/fits**, **gabriel-vasile/mimetype**,
  **h2non/filetype**, **artefactual/archivematica-sampledata**, **dunhamsteve/iwork**,
  **matchaxnb/pyiwa**, **cyberbryce/iwork**, **marcelrgberger/pages-cli** — cloned and
  scanned; ship **no** `.pages` documents at all.

## GitHub-wide sweep — best candidates

Everything scoring ≥ 6, with license status. `LICENSE?` = no LICENSE/COPYING file at the
repository root, so the file could not be attributed and was **not** taken regardless of score.

| score | fmt | size | license | repo :: path |
|---:|---|---:|---|---|
| 11 | `11.1.2` | 615 KB | Apache-2.0 | `ThreatConnect-Inc/threatconnect-playbooks` :: `apps/TCPB_-_Expressions/doc/Expressions.pages` **← TAKEN** |
| 10 | `3.2.13` | 3237 KB | MIT | `picopalette/phishing-detection-plugin` :: `artifacts/report.pages` **← TAKEN** |
| 9 | `10.0.10` | 129 KB | LGPL-3.0 | `ntop/nDPI` :: `doc/guide/nDPI_QuickStartGuide.pages` **← TAKEN** |
| 9 | `10.0.10` | 728 KB | LICENSE? | `sde-skills/meetupHandoutsAndCode` :: `2020-04-18-Strings/2020-04-18 Handout Strings.pages` |
| 9 | `10.1.8` | 1065 KB | CC BY-SA 4.0 | `freeDSP/freeDSP-aurora` :: `DOCUMENTATION/AN001 Firmware Update EN.pages` |
| 9 | `10.1.8` | 1066 KB | CC BY-SA 4.0 | `freeDSP/freeDSP-aurora` :: `DOCUMENTATION/AN001 Firmware Update DE.pages` |
| 9 | `4.2.3` | 1281 KB | CC BY-SA 4.0 | `freeDSP/freeDSP-aurora` :: `DOCUMENTATION/AN002 Updating from 1.x.x DE.pages` |
| 9 | `4.2.3` | 1281 KB | CC BY-SA 4.0 | `freeDSP/freeDSP-aurora` :: `DOCUMENTATION/AN002 Updating from 1.x.x EN.pages` |
| 8 | `4.2.3` | 212 KB | LICENSE? | `VueFileManager/vuefilemanager` :: `storage/demo/documents/School Report.pages` |
| 8 | `13.0.2` | 275 KB | LICENSE? | `nerds-odd-e/scrummaster-checklist` :: `source_documents/ScrumMaster-Checklist-2022-02-08-jp.pages` |
| 8 | `12.1.1` | 560 KB | not checked | `andy489/Software_Engineering_State_Exam` :: `assets/12/12 Java.pages` |
| 8 | `12.2.8` | 785 KB | not checked | `andy489/Software_Engineering_State_Exam` :: `assets/08/08.pages` |
| 8 | `4.2.3` | 835 KB | MIT | `iamjakewarner/jdf` :: `JDF2.2-Starter.pages` |
| 8 | `14.4.1` | 838 KB | MIT | `PicoMLX/PicoDocs` :: `Tests/PicoDocsTests/Resources/sample.pages` **← TAKEN** |
| 8 | `3.2.13` | 923 KB | MIT | `ToFuProject/tofu` :: `Notes_Upgrades/Eurofusion/EEG-Interim_Report_template_2MS6HK_v2_0.page` |
| 8 | `11.1.2` | 1018 KB | not checked | `andy489/Data_Structures_and_Algorithms` :: `assets/3 – Algorithms/Lowest common ancestor (LCA)/Lowest Common Ances` |
| 8 | `12.1.1` | 1262 KB | not checked | `andy489/Software_Engineering_State_Exam` :: `assets/15/15.pages` |
| 8 | `12.2.8` | 1339 KB | not checked | `andy489/Software_Engineering_State_Exam` :: `assets/05/05.pages` |
| 8 | `3.2.13` | 1447 KB | CC BY-SA 4.0 | `freeDSP/freeDSP-aurora` :: `DOCUMENTATION/SpecSheet.pages` |
| 8 | `13.1.2` | 2078 KB | not checked | `andy489/Software_Engineering_State_Exam` :: `assets/11/11.pages` |
| 8 | `12.1.1` | 2117 KB | not checked | `andy489/Software_Engineering_State_Exam` :: `assets/09/09.pages` |
| 8 | `12.2.8` | 3047 KB | not checked | `kishanrajput23/Training-Schedule-Management` :: `Project_Flies/docs/documentation.pages` |
| 8 | `4.1.7` | 3547 KB | LICENSE? | `xg1990/GCP-Data-Engineer-Study-Guide` :: `GCP Data Engineer-editable.pages` |
| 8 | `1.5.0` | 5334 KB | not checked | `FyberLabs/FlexModule` :: `processors/nRF51822/3dB/documents/designreview/3dBBLEReview.pages` |
| 7 | `3.2.13` | 255 KB | LICENSE? | `nerds-odd-e/scrummaster-checklist` :: `source_documents/ScrumMaster_Checklist_th.pages` |
| 7 | `3.2.13` | 276 KB | LICENSE? | `nerds-odd-e/scrummaster-checklist` :: `source_documents/ScrumMaster-Checklist-2016-jp.pages` |
| 7 | `11.1.2` | 284 KB | not checked | `andy489/Data_Structures_and_Algorithms` :: `assets/1 – FMI Data Structures & Algorithms/15–2020–01–24-exam/04 Prof` |
| 7 | `11.2.9` | 301 KB | LICENSE? | `nerds-odd-e/scrummaster-checklist` :: `source_documents/ScrumMaster-Checklist-2022-02-08.pages` |
| 7 | `11.2.9` | 310 KB | LICENSE? | `nerds-odd-e/scrummaster-checklist` :: `source_documents/ScrumMaster-Checklist-2022-02-08-nl.pages` |
| 7 | `12.1.1` | 369 KB | not checked | `andy489/Software_Engineering_State_Exam` :: `assets/past exams/2010/2010-09-08/6.pages` |
| 7 | `12.1.1` | 409 KB | not checked | `andy489/Software_Engineering_State_Exam` :: `assets/past exams/2015/2015-07-14/6.pages` |
| 7 | `11.1.2` | 418 KB | not checked | `andy489/Data_Structures_and_Algorithms` :: `assets/6 – Practice/code forces/0913B Christmas Spruce.pages` |
| 7 | `11.1.2` | 426 KB | not checked | `andy489/Data_Structures_and_Algorithms` :: `assets/6 – Practice/code forces/1325C Ehab and Path-etic MEXs.pages` |
| 7 | `12.1.1` | 435 KB | not checked | `andy489/Software_Engineering_State_Exam` :: `assets/past exams/2010/2010-07-15/6.pages` |
| 7 | `11.1.2` | 443 KB | not checked | `andy489/Data_Structures_and_Algorithms` :: `assets/1 – FMI Data Structures & Algorithms/08–week/08–08 Edge removal` |
| 7 | `12.1.1` | 449 KB | not checked | `andy489/Software_Engineering_State_Exam` :: `assets/06/06.pages` |
| 7 | `12.1.1` | 453 KB | not checked | `andy489/Software_Engineering_State_Exam` :: `assets/12/12 CPP.pages` |
| 7 | `1.5.0` | 455 KB | not checked | `SwiftEducation/teaching-app-dev-swift` :: `Level 4/Journal/Journal Lesson01.pages` |
| 7 | `2.0.24` | 456 KB | not checked | `SwiftEducation/teaching-app-dev-swift` :: `Level 4/RSSReader/RSSReader Lesson01.pages` |
| 7 | `1.5.0` | 469 KB | not checked | `SwiftEducation/teaching-app-dev-swift` :: `Level 4/Journal/Journal Lesson02.pages` |
| 7 | `12.2.8` | 470 KB | not checked | `andy489/Software_Engineering_State_Exam` :: `assets/past exams/2020/2020-09-16/3.pages` |
| 7 | `1.5.0` | 471 KB | not checked | `SwiftEducation/teaching-app-dev-swift` :: `Level 4/RSSReader/RSSReader Lesson02.pages` |
| 7 | `2.0.24` | 476 KB | not checked | `SwiftEducation/teaching-app-dev-swift` :: `Level 4/Flashcards/Flashcards Lesson02.pages` |
| 7 | `11.1.2` | 479 KB | not checked | `andy489/Data_Structures_and_Algorithms` :: `assets/6 – Practice/code forces/0580C Kefa and Park.pages` |
| 7 | `1.5.0` | 482 KB | not checked | `SwiftEducation/teaching-app-dev-swift` :: `Level 4/Journal/Journal Lesson07.pages` |
| 7 | `2.0.24` | 488 KB | not checked | `SwiftEducation/teaching-app-dev-swift` :: `Level 4/Flashcards/Flashcards Lesson03.pages` |
| 7 | `2.0.24` | 490 KB | not checked | `SwiftEducation/teaching-app-dev-swift` :: `Level 4/Journal/Journal Lesson03.pages` |
| 7 | `2.0.24` | 492 KB | not checked | `SwiftEducation/teaching-app-dev-swift` :: `Level 4/Flashcards/Flashcards Lesson06.pages` |
| 7 | `1.5.0` | 494 KB | not checked | `SwiftEducation/teaching-app-dev-swift` :: `Level 3/Found/Found Lesson02.pages` |
| 7 | `11.1.2` | 496 KB | not checked | `andy489/Data_Structures_and_Algorithms` :: `assets/6 – Practice/code forces/0120F Spiders.pages` |
| 7 | `2.0.24` | 499 KB | not checked | `SwiftEducation/teaching-app-dev-swift` :: `Level 4/Flashcards/Flashcards Lesson04.pages` |
| 7 | `1.5.0` | 502 KB | not checked | `SwiftEducation/teaching-app-dev-swift` :: `Level 4/RSSReader/RSSReader Lesson07.pages` |
| 7 | `1.5.0` | 503 KB | not checked | `SwiftEducation/teaching-app-dev-swift` :: `Level 4/Journal/Journal Lesson08.pages` |
| 7 | `1.5.0` | 507 KB | not checked | `SwiftEducation/teaching-app-dev-swift` :: `Level 3/Found/Found Lesson01.pages` |
| 7 | `2.0.24` | 508 KB | not checked | `SwiftEducation/teaching-app-dev-swift` :: `Level 4/Flashcards/Flashcards Lesson05.pages` |
| 7 | `2.0.24` | 509 KB | not checked | `SwiftEducation/teaching-app-dev-swift` :: `Level 4/Journal/Journal Lesson04.pages` |
| 7 | `2.0.24` | 511 KB | not checked | `SwiftEducation/teaching-app-dev-swift` :: `Level 4/Journal/Journal Lesson05.pages` |
| 7 | `2.0.24` | 511 KB | not checked | `SwiftEducation/teaching-app-dev-swift` :: `Level 4/RSSReader/RSSReader Lesson06.pages` |
| 7 | `2.0.24` | 512 KB | not checked | `SwiftEducation/teaching-app-dev-swift` :: `Level 2/Stopwatch/Stopwatch Lesson05.pages` |
| 7 | `2.0.24` | 513 KB | not checked | `SwiftEducation/teaching-app-dev-swift` :: `Level 2/Stopwatch/Stopwatch Lesson04.pages` |
| 7 | `2.0.24` | 514 KB | not checked | `SwiftEducation/teaching-app-dev-swift` :: `Level 2/Stopwatch/Stopwatch Lesson03.pages` |
| 7 | `1.5.0` | 519 KB | not checked | `SwiftEducation/teaching-app-dev-swift` :: `Level 2/UnitConverter/UnitConverter Lesson01.pages` |
| 7 | `2.0.24` | 519 KB | not checked | `SwiftEducation/teaching-app-dev-swift` :: `Level 3/Found/Found Lesson04.pages` |
| 7 | `2.0.24` | 519 KB | not checked | `SwiftEducation/teaching-app-dev-swift` :: `Level 2/Stopwatch/Stopwatch Lesson06.pages` |
| 7 | `1.5.0` | 519 KB | not checked | `SwiftEducation/teaching-app-dev-swift` :: `Level 2/Stopwatch/Stopwatch Lesson02.pages` |
| 7 | `2.0.24` | 520 KB | not checked | `SwiftEducation/teaching-app-dev-swift` :: `Level 2/Stopwatch/Stopwatch Lesson07.pages` |
| 7 | `1.5.0` | 524 KB | not checked | `SwiftEducation/teaching-app-dev-swift` :: `Level 3/Found/Found Lesson05.pages` |
| 7 | `2.0.24` | 526 KB | not checked | `SwiftEducation/teaching-app-dev-swift` :: `Level 2/UnitConverter/UnitConverter Lesson08.pages` |
| 7 | `1.5.0` | 526 KB | not checked | `SwiftEducation/teaching-app-dev-swift` :: `Level 2/UnitConverter/UnitConverter Lesson02.pages` |
| 7 | `1.5.0` | 526 KB | not checked | `SwiftEducation/teaching-app-dev-swift` :: `Level 2/UnitConverter/UnitConverter Lesson05.pages` |
| 7 | `2.0.24` | 528 KB | not checked | `SwiftEducation/teaching-app-dev-swift` :: `Level 2/UnitConverter/UnitConverter Lesson04.pages` |
| 7 | `1.5.0` | 529 KB | not checked | `SwiftEducation/teaching-app-dev-swift` :: `Level 2/UnitConverter/UnitConverter Lesson11.pages` |
| 7 | `1.5.0` | 530 KB | not checked | `SwiftEducation/teaching-app-dev-swift` :: `Level 4/Journal/Journal Lesson09.pages` |
| 7 | `1.5.0` | 533 KB | not checked | `SwiftEducation/teaching-app-dev-swift` :: `Level 4/Journal/Journal Lesson10.pages` |
| 7 | `1.5.0` | 535 KB | not checked | `SwiftEducation/teaching-app-dev-swift` :: `Level 2/UnitConverter/UnitConverter Lesson09.pages` |
| 7 | `11.1.2` | 538 KB | not checked | `andy489/Data_Structures_and_Algorithms` :: `assets/3 – Algorithms/Recursion and Backtracking/Generate snakes.pages` |
| 7 | `1.5.0` | 541 KB | not checked | `SwiftEducation/teaching-app-dev-swift` :: `Level 2/UnitConverter/UnitConverter Lesson06.pages` |
| 7 | `11.1.2` | 543 KB | not checked | `andy489/Data_Structures_and_Algorithms` :: `assets/3 – Algorithms/Lowest common ancestor (LCA)/LCA – Lowest Common` |
| 7 | `1.5.0` | 552 KB | not checked | `SwiftEducation/teaching-app-dev-swift` :: `Level 2/UnitConverter/UnitConverter Lesson10.pages` |
| 7 | `1.5.0` | 563 KB | not checked | `SwiftEducation/teaching-app-dev-swift` :: `Level 4/RSSReader/RSSReader Lesson05.pages` |
| 7 | `12.1.1` | 568 KB | not checked | `AlexHarker/HISSTools_Freeze` :: `manual/HISSTools_Freeze_User_Guide.pages` |
| 7 | `1.5.0` | 568 KB | not checked | `SwiftEducation/teaching-app-dev-swift` :: `Level 3/Found/Found Lesson03.pages` |
| 7 | `11.2.9` | 572 KB | LICENSE? | `andrejHurynovic/bsuirLabs` :: `term6/СА/СА, ЛР № 1/СА, ЛР № 1.pages` |
| 7 | `2.0.24` | 573 KB | not checked | `SwiftEducation/teaching-app-dev-swift` :: `Level 3/NoiseMaker/NoiseMaker Lesson06.pages` |
| 7 | `2.0.24` | 573 KB | not checked | `SwiftEducation/teaching-app-dev-swift` :: `Level 3/NoiseMaker/NoiseMaker Lesson08.pages` |
| 7 | `2.0.24` | 574 KB | not checked | `SwiftEducation/teaching-app-dev-swift` :: `Level 4/Journal/Journal Lesson06.pages` |
| 7 | `1.5.0` | 575 KB | not checked | `SwiftEducation/teaching-app-dev-swift` :: `Level 3/NoiseMaker/NoiseMaker Lesson02.pages` |
| 7 | `2.0.24` | 577 KB | not checked | `SwiftEducation/teaching-app-dev-swift` :: `Level 3/NoiseMaker/NoiseMaker Lesson04.pages` |
| 7 | `2.0.24` | 586 KB | not checked | `SwiftEducation/teaching-app-dev-swift` :: `Level 3/NoiseMaker/NoiseMaker Lesson05.pages` |
| 7 | `2.0.24` | 588 KB | not checked | `SwiftEducation/teaching-app-dev-swift` :: `Level 3/NoiseMaker/NoiseMaker Lesson03.pages` |
| 7 | `2.0.24` | 592 KB | not checked | `SwiftEducation/teaching-app-dev-swift` :: `Level 3/NoiseMaker/NoiseMaker Lesson07.pages` |
| 7 | `1.5.0` | 595 KB | not checked | `SwiftEducation/teaching-app-dev-swift` :: `Level 4/Journal/Journal Lesson11.pages` |
| 7 | `11.1.2` | 598 KB | not checked | `andy489/Data_Structures_and_Algorithms` :: `assets/1 – FMI Data Structures & Algorithms/05–week/05–06 Rotten from ` |
| 7 | `1.5.0` | 608 KB | not checked | `SwiftEducation/teaching-app-dev-swift` :: `Level 3/NoiseMaker/NoiseMaker Lesson09.pages` |
| 7 | `1.5.0` | 610 KB | not checked | `SwiftEducation/teaching-app-dev-swift` :: `Level 2/Stopwatch/Stopwatch Lesson01.pages` |
| 7 | `1.5.0` | 610 KB | not checked | `SwiftEducation/teaching-app-dev-swift` :: `Level 3/EasyBrowser/EasyBrowser Lesson03.pages` |
| 7 | `2.0.24` | 610 KB | not checked | `SwiftEducation/teaching-app-dev-swift` :: `Level 2/UnitConverter/UnitConverter Lesson07.pages` |
| 7 | `11.1.2` | 618 KB | not checked | `andy489/Data_Structures_and_Algorithms` :: `assets/1 – FMI Data Structures & Algorithms/09–week/09–04 Maze escape.` |
| 7 | `2.0.24` | 620 KB | not checked | `SwiftEducation/teaching-app-dev-swift` :: `Level 3/Gesturizer/Gesturizer Lesson09.pages` |
| 7 | `1.5.0` | 622 KB | not checked | `SwiftEducation/teaching-app-dev-swift` :: `Level 4/RSSReader/RSSReader Lesson04.pages` |
| 7 | `11.1.2` | 627 KB | not checked | `andy489/Data_Structures_and_Algorithms` :: `assets/6 – Practice/code forces/1143C Queen.pages` |
| 7 | `1.5.0` | 627 KB | not checked | `SwiftEducation/teaching-app-dev-swift` :: `Level 3/EasyBrowser/EasyBrowser Lesson01.pages` |
| 7 | `2.0.24` | 627 KB | not checked | `SwiftEducation/teaching-app-dev-swift` :: `Level 3/Gesturizer/Gesturizer Lesson03.pages` |
| 7 | `2.0.24` | 628 KB | not checked | `SwiftEducation/teaching-app-dev-swift` :: `Level 3/Gesturizer/Gesturizer Lesson04.pages` |
| 7 | `2.0.24` | 629 KB | not checked | `SwiftEducation/teaching-app-dev-swift` :: `Level 3/Gesturizer/Gesturizer Lesson07.pages` |
| 7 | `2.0.24` | 629 KB | not checked | `SwiftEducation/teaching-app-dev-swift` :: `Level 3/Gesturizer/Gesturizer Lesson06.pages` |
| 7 | `2.0.24` | 630 KB | not checked | `SwiftEducation/teaching-app-dev-swift` :: `Level 3/Gesturizer/Gesturizer Lesson05.pages` |
| 7 | `2.0.24` | 631 KB | not checked | `SwiftEducation/teaching-app-dev-swift` :: `Level 3/FingerPainter/FingerPainter Lesson05.pages` |
| 7 | `2.0.24` | 631 KB | not checked | `SwiftEducation/teaching-app-dev-swift` :: `Level 3/Gesturizer/Gesturizer Lesson08.pages` |
| 7 | `2.0.24` | 636 KB | not checked | `SwiftEducation/teaching-app-dev-swift` :: `Level 3/Gesturizer/Gesturizer Lesson01.pages` |
| 7 | `2.0.24` | 636 KB | not checked | `SwiftEducation/teaching-app-dev-swift` :: `Level 3/FingerPainter/FingerPainter Lesson06.pages` |
| 7 | `1.5.0` | 639 KB | not checked | `SwiftEducation/teaching-app-dev-swift` :: `Level 3/EasyBrowser/EasyBrowser Lesson02.pages` |
| 7 | `1.5.0` | 640 KB | not checked | `SwiftEducation/teaching-app-dev-swift` :: `Level 3/NoiseMaker/NoiseMaker Lesson01.pages` |
| 7 | `1.5.0` | 641 KB | not checked | `SwiftEducation/teaching-app-dev-swift` :: `Level 3/EasyBrowser/EasyBrowser Lesson05.pages` |
| 7 | `2.0.24` | 643 KB | not checked | `SwiftEducation/teaching-app-dev-swift` :: `Level 3/Gesturizer/Gesturizer Lesson02.pages` |
| 7 | `2.0.24` | 644 KB | not checked | `SwiftEducation/teaching-app-dev-swift` :: `Level 3/FingerPainter/FingerPainter Lesson04.pages` |
| 7 | `2.0.24` | 649 KB | not checked | `SwiftEducation/teaching-app-dev-swift` :: `Level 3/EasyBrowser/EasyBrowser Lesson04.pages` |
| 7 | `1.5.0` | 654 KB | not checked | `SwiftEducation/teaching-app-dev-swift` :: `Level 3/NoiseMaker/NoiseMaker Lesson10.pages` |
| 7 | `11.1.2` | 660 KB | not checked | `andy489/Data_Structures_and_Algorithms` :: `assets/6 – Practice/code forces/0981C Useful Decomposition.pages` |
| 7 | `2.0.24` | 661 KB | not checked | `SwiftEducation/teaching-app-dev-swift` :: `Level 2/Clock/Clock Lesson04.pages` |
| 7 | `2.0.24` | 662 KB | not checked | `SwiftEducation/teaching-app-dev-swift` :: `Level 4/Flashcards/Flashcards Lesson01.pages` |
| 7 | `2.0.24` | 667 KB | not checked | `SwiftEducation/teaching-app-dev-swift` :: `Level 4/RSSReader/RSSReader Lesson03.pages` |
| 7 | `1.5.0` | 668 KB | not checked | `SwiftEducation/teaching-app-dev-swift` :: `Level 1/WordCollage/WordCollage Lesson01.pages` |
| 7 | `11.1.2` | 670 KB | not checked | `andy489/Data_Structures_and_Algorithms` :: `assets/6 – Practice/code forces/1139C Edgy Trees.pages` |
| 7 | `1.5.0` | 672 KB | not checked | `SwiftEducation/teaching-app-dev-swift` :: `Level 2/Clock/Clock Lesson05.pages` |
| 7 | `1.5.0` | 674 KB | not checked | `SwiftEducation/teaching-app-dev-swift` :: `Level 2/Clock/Clock Lesson02.pages` |
| 7 | `2.0.24` | 676 KB | not checked | `SwiftEducation/teaching-app-dev-swift` :: `Level 2/Clock/Clock Lesson01.pages` |
| 7 | `2.0.24` | 677 KB | not checked | `SwiftEducation/teaching-app-dev-swift` :: `Level 3/FingerPainter/FingerPainter Lesson01.pages` |
| 7 | `2.0.24` | 689 KB | not checked | `SwiftEducation/teaching-app-dev-swift` :: `Level 4/Flashcards/Flashcards Lesson08.pages` |
| 7 | `2.0.24` | 701 KB | not checked | `SwiftEducation/teaching-app-dev-swift` :: `Level 2/UnitConverter/UnitConverter Lesson03.pages` |
| 7 | `1.5.0` | 714 KB | not checked | `SwiftEducation/teaching-app-dev-swift` :: `Level 1/WordCollage/WordCollage Lesson03.pages` |
| 7 | `2.0.24` | 717 KB | not checked | `SwiftEducation/teaching-app-dev-swift` :: `Level 4/Flashcards/Flashcards Lesson07.pages` |
| 7 | `2.0.24` | 761 KB | not checked | `SwiftEducation/teaching-app-dev-swift` :: `Level 3/FingerPainter/FingerPainter Lesson02.pages` |
| 7 | `1.5.0` | 775 KB | not checked | `SwiftEducation/teaching-app-dev-swift` :: `Level 1/WordCollage/WordCollage Lesson04.pages` |
| 7 | `2.0.24` | 779 KB | not checked | `SwiftEducation/teaching-app-dev-swift` :: `Level 3/FingerPainter/FingerPainter Lesson03.pages` |
| 7 | `12.1.1` | 794 KB | not checked | `andy489/Software_Engineering_State_Exam` :: `assets/17/17.pages` |
| 7 | `2.0.24` | 803 KB | not checked | `SwiftEducation/teaching-app-dev-swift` :: `Level 2/Clock/Clock Lesson03.pages` |
| 7 | `2.0.24` | 811 KB | not checked | `SwiftEducation/teaching-app-dev-swift` :: `Level 2/Clock/Clock Lesson06.pages` |
| 7 | `11.1.2` | 822 KB | not checked | `andy489/Data_Structures_and_Algorithms` :: `assets/1 – FMI Data Structures & Algorithms/05–week/05–05 Los binares.` |
| 7 | `11.1.2` | 846 KB | not checked | `andy489/Data_Structures_and_Algorithms` :: `assets/1 – FMI Data Structures & Algorithms/08–week/08–12 Green school` |
| 7 | `11.1.2` | 855 KB | not checked | `andy489/Data_Structures_and_Algorithms` :: `assets/1 – FMI Data Structures & Algorithms/06–week/06–03 k-th ancesto` |
| 7 | `12.2.8` | 861 KB | not checked | `andy489/Software_Engineering_State_Exam` :: `assets/17/Paired Testing.pages` |
| 7 | `14.1.1` | 868 KB | LICENSE? | `nerds-odd-e/scrummaster-checklist` :: `source_documents/ScrumMaster-Checklist-2022-02-08-ro.pages` |
| 7 | `2.0.24` | 979 KB | not checked | `SwiftEducation/teaching-app-dev-swift` :: `Level 1/WordCollage/WordCollage Lesson02.pages` |
| 7 | `2.3.4` | 990 KB | not checked | `ntop/n2disk` :: `doc/pdf/n2disk-UsersGuide.pages` |
| 7 | `11.1.2` | 1108 KB | not checked | `andy489/Data_Structures_and_Algorithms` :: `assets/1 – FMI Data Structures & Algorithms/08–week/08–09 API.pages` |
| 7 | `12.2.8` | 1349 KB | not checked | `andy489/Software_Engineering_State_Exam` :: `assets/past exams/2016/2016-09-09/6.pages` |
| 7 | `12.2.8` | 1399 KB | not checked | `andy489/Software_Engineering_State_Exam` :: `assets/past exams/2016/2016-07-12/6.pages` |
| 7 | `12.1.1` | 1404 KB | not checked | `andy489/Software_Engineering_State_Exam` :: `assets/18/18.pages` |
| 7 | `12.2.8` | 1546 KB | not checked | `andy489/Software_Engineering_State_Exam` :: `assets/past exams/2018/2018-07-13/3.pages` |
| 7 | `12.2.8` | 1700 KB | not checked | `andy489/Software_Engineering_State_Exam` :: `assets/past exams/2010/2010-09-08/1.pages` |
| 7 | `12.2.8` | 1776 KB | not checked | `andy489/Software_Engineering_State_Exam` :: `assets/past exams/2019/2019-09-10/3.pages` |
| 7 | `12.2.8` | 1846 KB | not checked | `andy489/Software_Engineering_State_Exam` :: `assets/past exams/2017/2017-07-11/7.pages` |
| 7 | `12.2.8` | 1918 KB | not checked | `andy489/Software_Engineering_State_Exam` :: `assets/past exams/2014/2014-07-15/1.pages` |
| 7 | `11.1.2` | 1943 KB | not checked | `andy489/Data_Structures_and_Algorithms` :: `assets/1 – FMI Data Structures & Algorithms/10–week/10–02 Floyd – City` |
| 7 | `12.2.8` | 2359 KB | not checked | `andy489/Software_Engineering_State_Exam` :: `assets/03/Brzozowski's algorithm.pages` |
| 7 | `14.0.1` | 2515 KB | not checked | `andy489/Empirical_Methods_and_Statistics` :: `_asset/_exer/week 01/1. Sol 10.pages` |
| 7 | `11.2.9` | 2844 KB | LICENSE? | `NeutrinoSys/java-foundations-solutions` :: `Professional Java Developer Career Starter Java Foundations Exercises ` |
| 7 | `1.5.0` | 2865 KB | not checked | `FyberLabs/FlexModule` :: `power/USBBiPower/OTG/documents/designreview/USBBiPowerOTGreview.pages` |
| 7 | `13.1.2` | 2976 KB | CC BY 4.0 | `rougier/scientific-posters` :: `src/2023-iBAGS.pages` **← TAKEN** |
| 7 | `12.1.1` | 3213 KB | not checked | `andy489/Software_Engineering_State_Exam` :: `assets/07/07.pages` |
| 7 | `12.2.8` | 3226 KB | not checked | `andy489/Software_Engineering_State_Exam` :: `assets/past exams/2020/2020-08-05/3.pages` |
| 7 | `2.3.4` | 3711 KB | MIT | `thibaudcolas/draftjs-filters` :: `pasting/documents/Draft.js paste test document.pages` **← TAKEN** |
| 7 | `14.4.1` | 3792 KB | not checked | `andy489/Empirical_Methods_and_Statistics` :: `_asset/_additional/_inter/musicians_concerts.pages` |
| 7 | `10.0.10` | 4075 KB | not checked | `SharifiZarchi/Algorithms_Design` :: `Covid Challenge/covid-challenge.pages` |
| 7 | `12.2.8` | 4302 KB | not checked | `andy489/Software_Engineering_State_Exam` :: `assets/past exams/2014/2014-09-11/1.pages` |
| 7 | `12.2.8` | 4324 KB | not checked | `andy489/Software_Engineering_State_Exam` :: `assets/past exams/2017/2017-09-09/4.pages` |
| 7 | `2.0.24` | 4387 KB | not checked | `SwiftEducation/teaching-app-dev-swift` :: `Level 4/RSSReader/RSSReader Lesson08.pages` |
| 7 | `12.1.1` | 4428 KB | not checked | `andy489/Software_Engineering_State_Exam` :: `assets/13/13.pages` |
| 7 | `14.2.2` | 4716 KB | not checked | `jamf/JamfSync` :: `User Guide/Jamf Sync User Guide.pages` |
| 7 | `12.2.8` | 5076 KB | not checked | `andy489/Software_Engineering_State_Exam` :: `assets/past exams/2017/2017-07-11/5.pages` |
| 7 | `11.1.2` | 5147 KB | not checked | `andy489/Linux_Shell` :: `assets/Project/Image editor.pages` |
| 7 | `13.1.2` | 5183 KB | not checked | `andy489/Empirical_Methods_and_Statistics` :: `_asset/_additional/_inter/Math Interview Solutions.pages` |
| 6 | `12.2.8` | 122 KB | not checked | `pmichaillat/intermediate-macro` :: `problemsets/ps1.pages` |
| 6 | `11.2.9` | 209 KB | LICENSE? | `abentele/Erbele` :: `Erbele-Manual.pages` |
| 6 | `1.5.0` | 230 KB | not checked | `SwiftEducation/teaching-app-dev-swift` :: `Level 1/SpaceAdventure/SpaceAdventure Lesson04.pages` |
| 6 | `13.1.2` | 281 KB | not checked | `huckor/wxwidgets-vscode` :: `doc/win.pages` |
| 6 | `11.1.2` | 283 KB | not checked | `andy489/Data_Structures_and_Algorithms` :: `assets/1 – FMI Data Structures & Algorithms/05–week/05–15 Falling leav` |
| 6 | `2.3.4` | 285 KB | not checked | `GothenburgBitFactory/taskwarrior` :: `doc/ref/task-ref.pages` |
| 6 | `12.2.8` | 288 KB | not checked | `andy489/Software_Engineering_State_Exam` :: `assets/past exams/2019/2019-09-10/6.pages` |
| 6 | `14.4.1` | 295 KB | not checked | `hollance/krunch` :: `UserGuide.pages` |
| 6 | `12.2.8` | 296 KB | not checked | `andy489/Software_Engineering_State_Exam` :: `assets/past exams/2015/2015-09-10/7.pages` |
| 6 | `11.1.2` | 296 KB | not checked | `andy489/Data_Structures_and_Algorithms` :: `assets/1 – FMI Data Structures & Algorithms/02–week/02–08 String arran` |
| 6 | `12.2.8` | 316 KB | not checked | `andy489/Software_Engineering_State_Exam` :: `assets/past exams/2017/2017-07-11/6.pages` |
| 6 | `11.1.2` | 317 KB | not checked | `andy489/Data_Structures_and_Algorithms` :: `assets/1 – FMI Data Structures & Algorithms/02–week/02–11 Permutations` |
| 6 | `12.2.8` | 326 KB | not checked | `andy489/Software_Engineering_State_Exam` :: `assets/past exams/2017/2017-09-09/5.pages` |
| 6 | `11.1.2` | 333 KB | not checked | `andy489/Data_Structures_and_Algorithms` :: `assets/6 – Practice/code forces/1325D Ehab the Xorcist.pages` |
| 6 | `11.1.2` | 342 KB | not checked | `andy489/Data_Structures_and_Algorithms` :: `assets/1 – FMI Data Structures & Algorithms/01–week/01–14 First Missin` |
| 6 | `11.1.2` | 343 KB | not checked | `andy489/Data_Structures_and_Algorithms` :: `assets/1 – FMI Data Structures & Algorithms/11–week/11–05 Mail Deliver` |
| 6 | `11.1.2` | 344 KB | not checked | `andy489/Data_Structures_and_Algorithms` :: `assets/2 – Data Structures/Sparse Table/01 – RMQSQ – Range Minimum Que` |
| 6 | `11.1.2` | 346 KB | not checked | `andy489/Data_Structures_and_Algorithms` :: `assets/1 – FMI Data Structures & Algorithms/01–week/01–07 Encoding pas` |
| 6 | `11.1.2` | 349 KB | not checked | `andy489/Data_Structures_and_Algorithms` :: `assets/1 – FMI Data Structures & Algorithms/06–week/06–10 Online marke` |
| 6 | `11.1.2` | 351 KB | not checked | `andy489/Data_Structures_and_Algorithms` :: `assets/3 – Algorithms/Recursion and Backtracking/Combine Sum.pages` |
| 6 | `11.1.2` | 355 KB | not checked | `andy489/Data_Structures_and_Algorithms` :: `assets/1 – FMI Data Structures & Algorithms/04–week/04–21 Hikers.pages` |
| 6 | `12.2.8` | 359 KB | not checked | `Tensegritics/ClojureDart` :: `doc/ClojureDart Cheatsheet.pages` |
| 6 | `11.2.9` | 360 KB | LICENSE? | `andrejHurynovic/bsuirLabs` :: `term6/СА/СА, ЛР № 2/СА, ЛР № 2.pages` |
| 6 | `12.2.8` | 363 KB | not checked | `andy489/Software_Engineering_State_Exam` :: `assets/past exams/2015/2015-09-10/5.pages` |
| 6 | `11.1.2` | 363 KB | not checked | `andy489/Data_Structures_and_Algorithms` :: `assets/1 – FMI Data Structures & Algorithms/05–week/05–22 Tree–specifi` |
| 6 | `11.1.2` | 365 KB | not checked | `andy489/Data_Structures_and_Algorithms` :: `assets/1 – FMI Data Structures & Algorithms/02–week/02–19 Constrol tes` |
| 6 | `11.1.2` | 365 KB | not checked | `andy489/Data_Structures_and_Algorithms` :: `assets/1 – FMI Data Structures & Algorithms/01–week/01–04 Palindromic ` |
| 6 | `12.2.8` | 366 KB | not checked | `andy489/Software_Engineering_State_Exam` :: `assets/past exams/2021/2021-07-13/2.pages` |
| 6 | `11.1.2` | 369 KB | not checked | `andy489/Data_Structures_and_Algorithms` :: `assets/1 – FMI Data Structures & Algorithms/01–week/01–02 Substring pe` |
| 6 | `11.1.2` | 375 KB | not checked | `andy489/Data_Structures_and_Algorithms` :: `assets/1 – FMI Data Structures & Algorithms/01–week/01–10 Cloning sock` |
| 6 | `12.2.8` | 376 KB | not checked | `andy489/Software_Engineering_State_Exam` :: `assets/past exams/2016/2016-09-09/7.pages` |
| 6 | `12.2.8` | 378 KB | not checked | `andy489/Software_Engineering_State_Exam` :: `assets/past exams/2019/2019-07-09/6.pages` |
| 6 | `11.1.2` | 384 KB | not checked | `andy489/Data_Structures_and_Algorithms` :: `assets/1 – FMI Data Structures & Algorithms/07–week/07–07 Commandos.pa` |
| 6 | `11.1.2` | 385 KB | not checked | `andy489/Data_Structures_and_Algorithms` :: `assets/1 – FMI Data Structures & Algorithms/02–week/02–18 Visualise so` |
| 6 | `12.2.8` | 389 KB | not checked | `andy489/Software_Engineering_State_Exam` :: `assets/past exams/2018/2018-09-10/7.pages` |
| 6 | `12.2.8` | 389 KB | not checked | `andy489/Software_Engineering_State_Exam` :: `assets/past exams/2021/2021-09-08/3.pages` |
| 6 | `11.1.2` | 391 KB | not checked | `andy489/Data_Structures_and_Algorithms` :: `assets/3 – Algorithms/Lowest common ancestor (LCA)/DISQUERY –Distance ` |
| 6 | `12.2.8` | 393 KB | not checked | `andy489/Software_Engineering_State_Exam` :: `assets/past exams/2010/2010-07-15/5.pages` |
| 6 | `11.1.2` | 393 KB | not checked | `andy489/Data_Structures_and_Algorithms` :: `assets/6 – Practice/code forces/0522A Reports.pages` |
| 6 | `12.2.8` | 396 KB | not checked | `andy489/Software_Engineering_State_Exam` :: `assets/past exams/2016/2016-07-12/7.pages` |
| 6 | `12.1.1` | 397 KB | not checked | `andy489/Software_Engineering_State_Exam` :: `assets/22/22.pages` |
| 6 | `11.1.2` | 398 KB | not checked | `andy489/Data_Structures_and_Algorithms` :: `assets/1 – FMI Data Structures & Algorithms/07–week/07–06 Bonus – Text` |
| 6 | `12.2.8` | 400 KB | not checked | `andy489/Software_Engineering_State_Exam` :: `assets/19/19.pages` |
| 6 | `4.2.3` | 401 KB | LICENSE? | `VueFileManager/vuefilemanager` :: `storage/demo/documents/Stories of the Night Skies.pages` |
| 6 | `12.2.8` | 403 KB | not checked | `pmichaillat/intermediate-macro` :: `problemsets/ps3.pages` |
| 6 | `11.1.2` | 403 KB | not checked | `andy489/Data_Structures_and_Algorithms` :: `assets/1 – FMI Data Structures & Algorithms/07–week/07–02 Administrati` |
| 6 | `11.1.2` | 413 KB | not checked | `andy489/Data_Structures_and_Algorithms` :: `assets/1 – FMI Data Structures & Algorithms/02–week/02–16 The jeweller` |
| 6 | `11.1.2` | 413 KB | not checked | `andy489/Data_Structures_and_Algorithms` :: `assets/6 – Practice/code forces/1057A Bmail Computer Network.pages` |
| 6 | `11.1.2` | 416 KB | not checked | `andy489/Data_Structures_and_Algorithms` :: `assets/1 – FMI Data Structures & Algorithms/04–week/04–03 Linked list ` |
| 6 | `11.1.2` | 417 KB | not checked | `andy489/Data_Structures_and_Algorithms` :: `assets/1 – FMI Data Structures & Algorithms/06–week/06–07 Elitism.page` |
| 6 | `11.1.2` | 417 KB | not checked | `andy489/Data_Structures_and_Algorithms` :: `assets/1 – FMI Data Structures & Algorithms/02–week/02–17 Visualise so` |
| 6 | `11.1.2` | 417 KB | not checked | `andy489/Data_Structures_and_Algorithms` :: `assets/6 – Practice/code forces/1325E Ehab's REAL Number Theory Proble` |
| 6 | `11.1.2` | 420 KB | not checked | `andy489/Data_Structures_and_Algorithms` :: `assets/2 – Data Structures/Sparse Table/03 – THRBL – Catapult that bal` |
| 6 | `11.1.2` | 423 KB | not checked | `andy489/Data_Structures_and_Algorithms` :: `assets/1 – FMI Data Structures & Algorithms/07–week/07–01 567D One-Dim` |
| 6 | `12.1.1` | 423 KB | not checked | `andy489/Software_Engineering_State_Exam` :: `assets/past exams/2014/2014-07-15/2.pages` |
| 6 | `12.2.8` | 426 KB | not checked | `andy489/Software_Engineering_State_Exam` :: `assets/past exams/2018/2018-07-13/7.pages` |
| 6 | `11.1.2` | 429 KB | not checked | `andy489/Data_Structures_and_Algorithms` :: `assets/1 – FMI Data Structures & Algorithms/06–week/06–06 Attacking vi` |
| 6 | `11.1.2` | 431 KB | not checked | `andy489/Data_Structures_and_Algorithms` :: `assets/1 – FMI Data Structures & Algorithms/02–week/02–15 Quick select` |
| 6 | `12.1.1` | 432 KB | not checked | `andy489/Software_Engineering_State_Exam` :: `assets/20/20.pages` |
| 6 | `11.1.2` | 435 KB | not checked | `andy489/Data_Structures_and_Algorithms` :: `assets/1 – FMI Data Structures & Algorithms/06–week/06–11 Online marke` |
| 6 | `14.4.1` | 435 KB | not checked | `nerds-odd-e/doughnut` :: `e2e_test/fixtures/book_reading/refactoring.pages` |
| 6 | `11.1.2` | 440 KB | not checked | `andy489/Data_Structures_and_Algorithms` :: `assets/6 – Practice/code forces/1325B CopyCopyCopyCopyCopy.pages` |
| 6 | `11.1.2` | 446 KB | not checked | `andy489/Data_Structures_and_Algorithms` :: `assets/1 – FMI Data Structures & Algorithms/05–week/05–07 Student's qu` |
| 6 | `11.1.2` | 447 KB | not checked | `andy489/Data_Structures_and_Algorithms` :: `assets/1 – FMI Data Structures & Algorithms/02–week/02–06 Couples pass` |
| 6 | `11.1.2` | 447 KB | not checked | `andy489/Data_Structures_and_Algorithms` :: `assets/3 – Algorithms/Recursion and Backtracking/Mixed Words.pages` |
| 6 | `11.1.2` | 448 KB | not checked | `andy489/Data_Structures_and_Algorithms` :: `assets/1 – FMI Data Structures & Algorithms/01–week/01–05 Super reduce` |
| 6 | `12.2.8` | 454 KB | not checked | `andy489/Software_Engineering_State_Exam` :: `assets/03/Determinization of finite automaton with e-transitions.pages` |
| 6 | `12.0.8` | 458 KB | LICENSE? | `andrejHurynovic/bsuirLabs` :: `term6/СА/СА, ЛР № 4/СА, ЛР № 4.pages` |
| 6 | `11.1.2` | 472 KB | not checked | `andy489/Data_Structures_and_Algorithms` :: `assets/6 – Practice/code forces/0862B Mahmoud and Ehab and the biparti` |
| 6 | `12.2.8` | 473 KB | not checked | `andy489/Software_Engineering_State_Exam` :: `assets/21/21.pages` |
| 6 | `11.1.2` | 475 KB | not checked | `andy489/Data_Structures_and_Algorithms` :: `assets/1 – FMI Data Structures & Algorithms/07–week/07–08 Schedules.pa` |
| 6 | `11.1.2` | 476 KB | not checked | `andy489/Data_Structures_and_Algorithms` :: `assets/6 – Practice/code forces/0115A Party.pages` |
| 6 | `11.1.2` | 481 KB | not checked | `andy489/Data_Structures_and_Algorithms` :: `assets/1 – FMI Data Structures & Algorithms/03–week/03–02 Searching fo` |
| 6 | `11.1.2` | 483 KB | not checked | `andy489/Data_Structures_and_Algorithms` :: `assets/1 – FMI Data Structures & Algorithms/05–week/05–24 Penultimate ` |
| 6 | `11.1.2` | 483 KB | not checked | `andy489/Data_Structures_and_Algorithms` :: `assets/3 – Algorithms/Dynamic programming/Minimum Cost to Cut a Stick.` |
| 6 | `11.1.2` | 489 KB | not checked | `andy489/Data_Structures_and_Algorithms` :: `assets/6 – Practice/code forces/1325A Ehab and GCD.pages` |
| 6 | `11.1.2` | 498 KB | not checked | `andy489/Data_Structures_and_Algorithms` :: `assets/1 – FMI Data Structures & Algorithms/05–week/05–23 Print–specif` |
| 6 | `12.2.8` | 499 KB | not checked | `andy489/Software_Engineering_State_Exam` :: `assets/past exams/2016/2016-07-12/3.pages` |
| 6 | `11.1.2` | 506 KB | not checked | `andy489/Data_Structures_and_Algorithms` :: `assets/1 – FMI Data Structures & Algorithms/14–2019–01–27–exam/04 Cycl` |
| 6 | `11.1.2` | 509 KB | not checked | `andy489/Data_Structures_and_Algorithms` :: `assets/6 – Practice/code forces/0839C Journey.pages` |
| 6 | `11.1.2` | 516 KB | not checked | `andy489/Data_Structures_and_Algorithms` :: `assets/1 – FMI Data Structures & Algorithms/09–week/09–03 Christmas de` |
| 6 | `11.1.2` | 517 KB | not checked | `andy489/Data_Structures_and_Algorithms` :: `assets/1 – FMI Data Structures & Algorithms/01–week/01–09 Water suppli` |
| 6 | `11.1.2` | 525 KB | not checked | `andy489/Data_Structures_and_Algorithms` :: `assets/6 – Practice/code forces/1325E Ehab's REAL Number Theory Proble` |
| 6 | `11.1.2` | 528 KB | not checked | `andy489/Data_Structures_and_Algorithms` :: `assets/1 – FMI Data Structures & Algorithms/05–week/05–04 Magic number` |
| 6 | `12.2.8` | 530 KB | not checked | `andy489/Software_Engineering_State_Exam` :: `assets/past exams/2021/2021-09-08/5.pages` |
| 6 | `11.1.2` | 539 KB | not checked | `andy489/Data_Structures_and_Algorithms` :: `assets/5 – DAA/Starcraft 2.pages` |
| 6 | `11.1.2` | 542 KB | not checked | `andy489/Data_Structures_and_Algorithms` :: `assets/1 – FMI Data Structures & Algorithms/04–week/04–10 Delete a nod` |
| 6 | `11.1.2` | 545 KB | not checked | `andy489/Data_Structures_and_Algorithms` :: `assets/1 – FMI Data Structures & Algorithms/02–week/02–23 Pair sum.pag` |
| 6 | `11.1.2` | 545 KB | not checked | `andy489/Data_Structures_and_Algorithms` :: `assets/1 – FMI Data Structures & Algorithms/07–week/07–05 File system.` |
| 6 | `11.1.2` | 546 KB | not checked | `andy489/Data_Structures_and_Algorithms` :: `assets/1 – FMI Data Structures & Algorithms/08–week/08–13 Egyptin Frac` |
| 6 | `11.1.2` | 549 KB | not checked | `andy489/Data_Structures_and_Algorithms` :: `assets/1 – FMI Data Structures & Algorithms/02–week/02–10 Software reg` |
| 6 | `11.1.2` | 550 KB | not checked | `andy489/Data_Structures_and_Algorithms` :: `assets/6 – Practice/code forces/0429A Xor–tree.pages` |
| 6 | `11.1.2` | 558 KB | not checked | `andy489/Data_Structures_and_Algorithms` :: `assets/1 – FMI Data Structures & Algorithms/03–week/03–07 Cows.pages` |
| 6 | `11.1.2` | 559 KB | not checked | `andy489/Data_Structures_and_Algorithms` :: `assets/1 – FMI Data Structures & Algorithms/08–week/08–11 Toll tax.pag` |
| 6 | `11.1.2` | 559 KB | not checked | `andy489/Data_Structures_and_Algorithms` :: `assets/1 – FMI Data Structures & Algorithms/04–week/04–06 Pistols.page` |
| 6 | `12.2.8` | 572 KB | not checked | `andy489/Software_Engineering_State_Exam` :: `assets/past exams/2021/2021-07-13/5.pages` |
| 6 | `11.1.2` | 574 KB | not checked | `andy489/Data_Structures_and_Algorithms` :: `assets/1 – FMI Data Structures & Algorithms/06–week/06–08 Closest apar` |
| 6 | `11.1.2` | 579 KB | not checked | `andy489/Data_Structures_and_Algorithms` :: `assets/1 – FMI Data Structures & Algorithms/02–week/02–14 Events.pages` |
| 6 | `11.1.2` | 588 KB | not checked | `andy489/Data_Structures_and_Algorithms` :: `assets/1 – FMI Data Structures & Algorithms/15–2020–01–24-exam/03 Coun` |
| 6 | `11.1.2` | 600 KB | not checked | `andy489/Data_Structures_and_Algorithms` :: `assets/6 – Practice/code forces/0755C PolandBall and Forest.pages` |
| 6 | `11.1.2` | 601 KB | not checked | `andy489/Data_Structures_and_Algorithms` :: `assets/1 – FMI Data Structures & Algorithms/15–2020–01–24-exam/02 Find` |
| 6 | `11.1.2` | 605 KB | not checked | `andy489/Data_Structures_and_Algorithms` :: `assets/1 – FMI Data Structures & Algorithms/02–week/02–09 Scrooge's gi` |
| 6 | `13.1.2` | 608 KB | not checked | `huckor/wxwidgets-vscode` :: `doc/mac.pages` |
| 6 | `11.1.2` | 609 KB | not checked | `andy489/Data_Structures_and_Algorithms` :: `assets/1 – FMI Data Structures & Algorithms/01–week/01–11 Darts 501.pa` |
| 6 | `11.1.2` | 609 KB | not checked | `andy489/Data_Structures_and_Algorithms` :: `assets/1 – FMI Data Structures & Algorithms/12–week/12–03 SUBMERGE - S` |
| 6 | `2.0.24` | 619 KB | not checked | `andyRon/LearniOSByProject` :: `P075-QuickLookDemo/QuickLookDemo/AppCoda-Pages.pages` |
| 6 | `11.1.2` | 631 KB | not checked | `andy489/Data_Structures_and_Algorithms` :: `assets/1 – FMI Data Structures & Algorithms/04–week/04–11 Merge two so` |
| 6 | `11.1.2` | 631 KB | not checked | `andy489/Data_Structures_and_Algorithms` :: `assets/1 – FMI Data Structures & Algorithms/01–week/01–08 SDA mission.` |
| 6 | `11.1.2` | 647 KB | not checked | `andy489/Data_Structures_and_Algorithms` :: `assets/1 – FMI Data Structures & Algorithms/03–week/03–04 Building ali` |
| 6 | `11.1.2` | 654 KB | not checked | `andy489/Data_Structures_and_Algorithms` :: `assets/1 – FMI Data Structures & Algorithms/04–week/04–16 Welcome to t` |
| 6 | `14.2.2` | 656 KB | not checked | `OpenKneeboard/OpenKneeboard` :: `docs/Quick Start.pages` |
| 6 | `11.1.2` | 661 KB | not checked | `andy489/Data_Structures_and_Algorithms` :: `assets/1 – FMI Data Structures & Algorithms/02–week/02–25 Office print` |
| 6 | `12.1.1` | 662 KB | not checked | `andy489/Software_Engineering_State_Exam` :: `assets/past exams/2015/2015-09-10/3.pages` |
| 6 | `11.1.2` | 664 KB | not checked | `andy489/Data_Structures_and_Algorithms` :: `assets/2 – Data Structures/Sparse Table/07 – D. R2D2 and Droid Army.pa` |
| 6 | `11.1.2` | 665 KB | not checked | `andy489/Data_Structures_and_Algorithms` :: `assets/1 – FMI Data Structures & Algorithms/04–week/04–04 List pairs.p` |
| 6 | `11.1.2` | 672 KB | not checked | `andy489/Data_Structures_and_Algorithms` :: `assets/1 – FMI Data Structures & Algorithms/03–week/03–01 Chocolate ch` |
| 6 | `11.1.2` | 672 KB | not checked | `andy489/Data_Structures_and_Algorithms` :: `assets/1 – FMI Data Structures & Algorithms/07–week/07–03 Autocomplete` |
| 6 | `11.1.2` | 679 KB | not checked | `andy489/Data_Structures_and_Algorithms` :: `assets/2 – Data Structures/Sparse Table/04 – Matchsticks.pages` |
| 6 | `11.1.2` | 696 KB | not checked | `andy489/Data_Structures_and_Algorithms` :: `assets/1 – FMI Data Structures & Algorithms/01–week/01–01 Store discou` |
| 6 | `11.1.2` | 699 KB | not checked | `andy489/Data_Structures_and_Algorithms` :: `assets/1 – FMI Data Structures & Algorithms/04–week/04–15 Truck orderi` |
| 6 | `11.1.2` | 715 KB | not checked | `andy489/Data_Structures_and_Algorithms` :: `assets/1 – FMI Data Structures & Algorithms/03–week/03–09 Monster truc` |
| 6 | `11.1.2` | 722 KB | not checked | `andy489/Data_Structures_and_Algorithms` :: `assets/1 – FMI Data Structures & Algorithms/01–week/01–03 Pipi's socks` |
| 6 | `11.1.2` | 723 KB | not checked | `andy489/Data_Structures_and_Algorithms` :: `assets/1 – FMI Data Structures & Algorithms/02–week/02–13 Electrical e` |
| 6 | `11.1.2` | 735 KB | not checked | `andy489/Data_Structures_and_Algorithms` :: `assets/1 – FMI Data Structures & Algorithms/02–week/02–21 Pairs.pages` |
| 6 | `11.1.2` | 741 KB | not checked | `andy489/Data_Structures_and_Algorithms` :: `assets/6 – Practice/code forces/0886C Petya and Catacombs.pages` |
| 6 | `11.1.2` | 750 KB | not checked | `andy489/Data_Structures_and_Algorithms` :: `assets/2 – Data Structures/Sparse Table/09 – TNVFC1M – Miraculous.page` |
| 6 | `11.1.2` | 770 KB | not checked | `andy489/Data_Structures_and_Algorithms` :: `assets/1 – FMI Data Structures & Algorithms/04–week/04–17 Optimal team` |
| 6 | `14.2.2` | 771 KB | not checked | `ynagatomo/evolution-Metal-ARKit-RealityKit-sheet` :: `files/List_of_ShaderGraph_Nodes_in_visionOS2_Nov2024.pages` |
| 6 | `11.1.2` | 777 KB | not checked | `andy489/Data_Structures_and_Algorithms` :: `assets/1 – FMI Data Structures & Algorithms/02–week/02–07 Shoe shoppin` |
| 6 | `11.1.2` | 778 KB | not checked | `andy489/Data_Structures_and_Algorithms` :: `assets/2 – Data Structures/Sparse Table/00 – Sparse Table RMQ overview` |
| 6 | `11.1.2` | 778 KB | not checked | `andy489/Data_Structures_and_Algorithms` :: `assets/1 – FMI Data Structures & Algorithms/12–week/12–05 E. Bertown r` |
| 6 | `11.1.2` | 779 KB | not checked | `andy489/Data_Structures_and_Algorithms` :: `assets/1 – FMI Data Structures & Algorithms/05–week/05–02 Lilly's ston` |
| 6 | `12.2.8` | 787 KB | not checked | `andy489/Software_Engineering_State_Exam` :: `assets/past exams/2020/2020-08-05/5.pages` |
| 6 | `11.1.2` | 792 KB | not checked | `andy489/Data_Structures_and_Algorithms` :: `assets/1 – FMI Data Structures & Algorithms/05–week/05–01 Josephus pro` |
| 6 | `11.1.2` | 804 KB | not checked | `andy489/Data_Structures_and_Algorithms` :: `assets/1 – FMI Data Structures & Algorithms/04–week/04–09 Node at pos.` |
| 6 | `3.2.13` | 810 KB | not checked | `PostHog/posthog.com` :: `contents/images/templates/employee_offer_letter.pages` |
| 6 | `3.2.13` | 810 KB | not checked | `PostHog/posthog.com` :: `static/wp-content/uploads/2020/templates/employee_offer_letter.pages` |
| 6 | `2.3.4` | 813 KB | not checked | `f-zyj/ACM` :: `ACM 模版-f_zyj 更新至 v 2.1/v 2.1/ACM模板-f_zyj v 2.1.pages` |
| 6 | `12.1.1` | 819 KB | not checked | `andy489/Software_Engineering_State_Exam` :: `assets/09/ER Diagrams.pages` |
| 6 | `12.1.1` | 831 KB | not checked | `AlexHarker/HISSTools_Granular` :: `manual/HISSTools_Granular_User_Guide.pages` |
| 6 | `11.1.2` | 836 KB | not checked | `andy489/Data_Structures_and_Algorithms` :: `assets/1 – FMI Data Structures & Algorithms/04–week/04–12 Reverse link` |
| 6 | `11.1.2` | 842 KB | not checked | `andy489/Data_Structures_and_Algorithms` :: `assets/1 – FMI Data Structures & Algorithms/12–week/12–07 E. Cactus ex` |
| 6 | `11.1.2` | 845 KB | not checked | `andy489/Data_Structures_and_Algorithms` :: `assets/1 – FMI Data Structures & Algorithms/03–week/03–03 Drying cloth` |
| 6 | `11.1.2` | 860 KB | not checked | `andy489/Data_Structures_and_Algorithms` :: `assets/2 – Data Structures/Sparse Table/02 – RPLN – Negative Score.pag` |
| 6 | `11.1.2` | 886 KB | not checked | `andy489/Data_Structures_and_Algorithms` :: `assets/1 – FMI Data Structures & Algorithms/05–week/05–08 Bonus Min-Ma` |
| 6 | `11.1.2` | 897 KB | not checked | `andy489/Data_Structures_and_Algorithms` :: `assets/2 – Data Structures/Sparse Table/06 – D. CGCDSSQ.pages` |
| 6 | `11.1.2` | 906 KB | not checked | `andy489/Data_Structures_and_Algorithms` :: `assets/1 – FMI Data Structures & Algorithms/02–week/02–12 Monster worl` |
| 6 | `11.1.2` | 933 KB | not checked | `andy489/Data_Structures_and_Algorithms` :: `assets/1 – FMI Data Structures & Algorithms/03–week/03–06 Strawberries` |
| 6 | `11.1.2` | 937 KB | not checked | `andy489/Data_Structures_and_Algorithms` :: `assets/1 – FMI Data Structures & Algorithms/01–week/01–06 The power su` |
| 6 | `11.1.2` | 954 KB | not checked | `andy489/Data_Structures_and_Algorithms` :: `assets/1 – FMI Data Structures & Algorithms/09–week/09–07 Bonus BDZ.pa` |
| 6 | `11.1.2` | 965 KB | not checked | `andy489/Data_Structures_and_Algorithms` :: `assets/1 – FMI Data Structures & Algorithms/05–week/05–03 Shortest pat` |
| 6 | `11.1.2` | 967 KB | not checked | `andy489/Data_Structures_and_Algorithms` :: `assets/1 – FMI Data Structures & Algorithms/07–week/07–04 Grand hotel.` |
| 6 | `11.1.2` | 979 KB | not checked | `andy489/Data_Structures_and_Algorithms` :: `assets/1 – FMI Data Structures & Algorithms/15–2020–01–24-exam/01 Road` |
| 6 | `11.1.2` | 995 KB | not checked | `andy489/Data_Structures_and_Algorithms` :: `assets/1 – FMI Data Structures & Algorithms/03–week/03–08 Balloons and` |
| 6 | `3.2.13` | 1009 KB | not checked | `jgagneastro/coffeegrindsize` :: `Help/coffee_grind_size_installation.pages` |
| 6 | `11.1.2` | 1028 KB | not checked | `andy489/Data_Structures_and_Algorithms` :: `assets/1 – FMI Data Structures & Algorithms/09–week/09–06 Bonus Tunnel` |
| 6 | `11.1.2` | 1037 KB | not checked | `andy489/Data_Structures_and_Algorithms` :: `assets/2 – Data Structures/Sparse Table/11 – D. Animals and Puzzle.pag` |
| 6 | `11.1.2` | 1037 KB | not checked | `andy489/Data_Structures_and_Algorithms` :: `assets/1 – FMI Data Structures & Algorithms/12–week/12–02 EC_P – Criti` |
| 6 | `12.2.8` | 1081 KB | not checked | `andy489/Software_Engineering_State_Exam` :: `assets/past exams/2019/2019-07-09/3.pages` |
| 6 | `11.2.9` | 1157 KB | LICENSE? | `andrejHurynovic/bsuirLabs` :: `term6/СА/СА, ЛР № 3/СА, ЛР № 3.pages` |
| 6 | `11.1.2` | 1194 KB | not checked | `andy489/Data_Structures_and_Algorithms` :: `assets/1 – FMI Data Structures & Algorithms/10–week/10–01 Minimal fore` |
| 6 | `11.1.2` | 1201 KB | not checked | `andy489/Data_Structures_and_Algorithms` :: `assets/1 – FMI Data Structures & Algorithms/15–2020–01–24-exam/05 Shor` |
| 6 | `2.3.4` | 1205 KB | not checked | `ntop/PF_RING` :: `doc/pdf/PF_RING-UsersGuide.pages` |
| 6 | `11.1.2` | 1258 KB | not checked | `andy489/Data_Structures_and_Algorithms` :: `assets/1 – FMI Data Structures & Algorithms/08–week/08–01 Components i` |
| 6 | `11.1.2` | 1285 KB | not checked | `andy489/Data_Structures_and_Algorithms` :: `assets/1 – FMI Data Structures & Algorithms/10–week/10–04 Kruskal (MST` |
| 6 | `11.1.2` | 1285 KB | not checked | `andy489/Data_Structures_and_Algorithms` :: `assets/1 – FMI Data Structures & Algorithms/06–week/06–09 Bonus 94.pag` |
| 6 | `11.1.2` | 1285 KB | not checked | `andy489/Data_Structures_and_Algorithms` :: `assets/1 – FMI Data Structures & Algorithms/03–week/03–05 Gems.pages` |
| 6 | `11.1.2` | 1300 KB | not checked | `andy489/Data_Structures_and_Algorithms` :: `assets/2 – Data Structures/Sparse Table/08 – B. Maximum of Maximums of` |
| 6 | `13.1.2` | 1300 KB | not checked | `andy489/Empirical_Methods_and_Statistics` :: `_asset/_additional/B3 54th Putnam 1993.pages` |
| 6 | `12.2.8` | 1321 KB | not checked | `andy489/Software_Engineering_State_Exam` :: `assets/past exams/2015/2015-07-14/7.pages` |
| 6 | `13.1.2` | 1415 KB | not checked | `andy489/Empirical_Methods_and_Statistics` :: `_asset/_additional/_inter/Math Interview Tasks.pages` |
| 6 | `11.1.2` | 1423 KB | not checked | `andy489/Data_Structures_and_Algorithms` :: `assets/1 – FMI Data Structures & Algorithms/01–week/01–12 Climbing the` |
| 6 | `11.1.2` | 1454 KB | not checked | `andy489/Data_Structures_and_Algorithms` :: `assets/1 – FMI Data Structures & Algorithms/12–week/12–07 E. Cactus.pa` |
| 6 | `11.1.2` | 1502 KB | not checked | `andy489/Data_Structures_and_Algorithms` :: `assets/1 – FMI Data Structures & Algorithms/08–week/08–02 Snakes and l` |
| 6 | `12.2.8` | 1665 KB | not checked | `pbloem/pca-book` :: `cover/titlepage.pages` |
| 6 | `12.2.8` | 1687 KB | not checked | `andy489/Software_Engineering_State_Exam` :: `assets/past exams/2020/2020-09-16/6.pages` |
| 6 | `12.2.8` | 1775 KB | not checked | `andy489/Software_Engineering_State_Exam` :: `assets/past exams/2018/2018-09-10/3.pages` |
| 6 | `12.2.8` | 1891 KB | not checked | `andy489/Software_Engineering_State_Exam` :: `assets/past exams/2021/2021-07-13/3.pages` |
| 6 | `12.1.1` | 1898 KB | not checked | `andy489/Software_Engineering_State_Exam` :: `assets/16/16.pages` |
| 6 | `12.2.8` | 2072 KB | not checked | `andy489/Software_Engineering_State_Exam` :: `assets/past exams/2015/2015-09-10/6.pages` |
| 6 | `12.2.8` | 2093 KB | not checked | `andy489/Software_Engineering_State_Exam` :: `assets/past exams/2020/2020-08-05/7.pages` |
| 6 | `11.1.2` | 2210 KB | not checked | `andy489/Data_Structures_and_Algorithms` :: `assets/1 – FMI Data Structures & Algorithms/04–week/04–05 Cloning snow` |
| 6 | `3.2.13` | 2267 KB | not checked | `USCbiostats/software-dev` :: `happy_scientist/seminars/2018-02_intro-tidyverse/material/HappyScienti` |
| 6 | `11.1.2` | 2319 KB | not checked | `andy489/Data_Structures_and_Algorithms` :: `assets/1 – FMI Data Structures & Algorithms/09–week/09–05 Discos.pages` |
| 6 | `11.2.9` | 2385 KB | LICENSE? | `loaydatrain/Optimizing_Millimeter_Wave_Communication` :: `reports/Wireless Communication Project Report.pages` |
| 6 | `11.1.2` | 2419 KB | not checked | `andy489/Data_Structures_and_Algorithms` :: `assets/5 – DAA/DAA Theory and Problems/2021-12-03 DAA.pages` |
| 6 | `11.1.2` | 2459 KB | not checked | `andy489/Empirical_Methods_and_Statistics` :: `_asset/_exer/week 04/4. Cond prob bis - sols 5-8.pages` |
| 6 | `11.1.2` | 2590 KB | not checked | `andy489/Data_Structures_and_Algorithms` :: `assets/2 – Data Structures/Sparse Table/00 – Sparse Table.pages` |
| 6 | `12.0.8` | 2803 KB | not checked | `andy489/Empirical_Methods_and_Statistics` :: `_asset/_additional/2X-3Y.pages` |
| 6 | `11.1.2` | 2875 KB | not checked | `andy489/Data_Structures_and_Algorithms` :: `assets/2 – Data Structures/Disjoint Set Union/Disjoint Set Union.pages` |
| 6 | `12.2.8` | 3172 KB | not checked | `andy489/Software_Engineering_State_Exam` :: `assets/past exams/2021/2021-07-13/6.pages` |
| 6 | `11.1.2` | 3425 KB | not checked | `andy489/Data_Structures_and_Algorithms` :: `assets/2 – Data Structures/Stack/Towers of Hanoi.pages` |
| 6 | `1.5.0` | 4272 KB | not checked | `SwiftEducation/teaching-app-dev-swift` :: `Level 1/Level01.pages` |
| 6 | `13.2.1` | 4320 KB | not checked | `ChilliHugger/The-Lords-Of-Midnight` :: `guides/Lords of Midnight_guide_v2.pages` |
| 6 | `13.2.1` | 4686 KB | not checked | `ChilliHugger/The-Lords-Of-Midnight` :: `guides/Doomdark's Revenge_guide_v2.pages` |
| 6 | `1.5.0` | 4846 KB | not checked | `anilallewar/microservices-basics-spring-boot` :: `understanding_notes.pages` |
| 6 | `1.5.0` | 4846 KB | not checked | `rohitghatol/spring-boot-microservices` :: `understanding_notes.pages` |
| 6 | `11.1.2` | 4950 KB | not checked | `andy489/Data_Structures_and_Algorithms` :: `assets/5 – DAA/DAA Theory and Problems/2021-10-05 DAA.pages` |
| 6 | `11.1.2` | 5234 KB | not checked | `andy489/Data_Structures_and_Algorithms` :: `assets/4 – DSA project/DSA Project Airline Connections.pages` |

### Rare-feature holders (all of them, licensed or not)

**Image filters (`imageAdjustments`) — 4 documents**

| count | score | fmt | license | repo :: path |
|---:|---:|---|---|---|
| 2 | 6 | `11.2.9` | LICENSE? | `loaydatrain/Optimizing_Millimeter_Wave_Communication` :: `reports/Wireless Communication Project Report.pages` |
| 1 | 6 | `11.2.9` | LICENSE? | `abentele/Erbele` :: `Erbele-Manual.pages` |
| 1 | 7 | `13.1.2` | CC BY 4.0 | `rougier/scientific-posters` :: `src/2023-iBAGS.pages` **← TAKEN** |
| 1 | 5 | `2.2.4` | Apache-2.0 | `vert-x3/vertx-guide-for-java-devs` :: `cover.pages` **← TAKEN** |

**Comments/annotations — 4 documents**

| count | score | fmt | license | repo :: path |
|---:|---:|---|---|---|
| 17 | 7 | `11.2.9` | LICENSE? | `NeutrinoSys/java-foundations-solutions` :: `Professional Java Developer Career Starter Java Foundations Ex` |
| 3 | 7 | `2.3.4` | MIT | `thibaudcolas/draftjs-filters` :: `pasting/documents/Draft.js paste test document.pages` **← TAKEN** |
| 1 | 4 | `11.2.9` | LICENSE? | `andrejHurynovic/bsuirLabs` :: `term5/ИиПУ/ИиПУ, № 2/ИиПУ, 2.pages` |
| 1 | 8 | `13.0.2` | LICENSE? | `nerds-odd-e/scrummaster-checklist` :: `source_documents/ScrumMaster-Checklist-2022-02-08-jp.pages` |

**Change tracking — 1 document**

| count | score | fmt | license | repo :: path |
|---:|---:|---|---|---|
| 1 | 9 | `10.0.10` | LGPL-3.0 | `ntop/nDPI` :: `doc/guide/nDPI_QuickStartGuide.pages` **← TAKEN** |

**Footnotes — 13 documents**

| count | score | fmt | license | repo :: path |
|---:|---:|---|---|---|
| 14 | 8 | `13.0.2` | LICENSE? | `nerds-odd-e/scrummaster-checklist` :: `source_documents/ScrumMaster-Checklist-2022-02-08-jp.pages` |
| 14 | 7 | `11.2.9` | LICENSE? | `nerds-odd-e/scrummaster-checklist` :: `source_documents/ScrumMaster-Checklist-2022-02-08-nl.pages` |
| 13 | 7 | `11.2.9` | LICENSE? | `nerds-odd-e/scrummaster-checklist` :: `source_documents/ScrumMaster-Checklist-2022-02-08.pages` |
| 12 | 7 | `3.2.13` | LICENSE? | `nerds-odd-e/scrummaster-checklist` :: `source_documents/ScrumMaster-Checklist-2016-jp.pages` |
| 12 | 7 | `14.1.1` | LICENSE? | `nerds-odd-e/scrummaster-checklist` :: `source_documents/ScrumMaster-Checklist-2022-02-08-ro.pages` |
| 10 | 5 | `2.0.24` | not checked | `SR0725/ziphus-open` :: `packages/pdf-to-markdown/examples/ExamplePdf.pages` |
| 10 | 5 | `2.0.24` | not checked | `jzillmann/pdf-to-markdown` :: `examples/ExamplePdf.pages` |
| 8 | 10 | `3.2.13` | MIT | `picopalette/phishing-detection-plugin` :: `artifacts/report.pages` **← TAKEN** |
| 7 | 8 | `4.1.7` | LICENSE? | `xg1990/GCP-Data-Engineer-Study-Guide` :: `GCP Data Engineer-editable.pages` |
| 2 | 8 | `4.2.3` | MIT | `iamjakewarner/jdf` :: `JDF2.2-Starter.pages` |
| 2 | 5 | `3.1.2` | MIT | `picopalette/phishing-detection-plugin` :: `artifacts/abstract.pages` |
| 1 | 8 | `3.2.13` | MIT | `ToFuProject/tofu` :: `Notes_Upgrades/Eurofusion/EEG-Interim_Report_template_2MS6HK_v` |
| 1 | 6 | `14.4.1` | not checked | `nerds-odd-e/doughnut` :: `e2e_test/fixtures/book_reading/refactoring.pages` |

## Remaining uncovered features

### 7. Charts (TSCH) — covered, but only just, and the probe cannot see it

Charts exist in exactly **4 of the 874** modern Pages documents (see *Correction* above).
`draftjs-v2.3-comments.pages` is one of them, so the fixture set does cover charts — but:

- The probe reports `charts=0` for it and for everything else, because its regex matches no
  registered `TSCH.*` name. **Fix the regex before relying on this counter** — anchoring on
  `TSCH.ChartDrawableArchive` (and the `*NonStyleArchive` instance families) is what works.
- The fixture holds a single chart. The two documents with more (`TheAxeC` poster, 3;
  `ailzy/RISKIM`, 2) have **no license file** and were rejected.
- If a stronger chart fixture is wanted, `ToFuProject/tofu` 
  `Notes_Upgrades/Eurofusion/EEG-Interim_Report_template_2MS6HK_v2_0.pages` is **MIT**,
  945 KB, scores 8, and combines a chart with a footnote, 4 readable table cells, a
  non-empty footer and a master drawable. It is the best un-taken candidate in the sweep.

### Partially covered / thin

- **Comments (priority 4)** — only 4 documents in 1,038 have any, and only
  `draftjs-filters` (MIT) is attributable. Its comment count is 3. The richest comment
  document found, `NeutrinoSys/java-foundations-solutions` (17 comments), has **no license
  file** and was rejected on that ground.
- **Change tracking (priority 8)** — exactly **one** document in the entire sweep
  (`ntop/nDPI`, LGPL-3.0) has insertion/deletion tables, and only in a single storage.
  There is no second sample to cross-check the encoding against.
- **Image filters (priority 1)** — 4 documents, 2 licensed (both taken). Every hit has
  `imagesWithFilters=1` or `2`, so no document stresses many adjusted images at once.
- **Endnotes specifically** — the probe counts footnotes and endnotes through the same
  `footnotes()` accessor, so no fixture here is *known* to use endnote (rather than
  footnote) numbering. Worth a follow-up if the distinction matters.

### Also worth knowing

- **Password-protected Pages**: 6 documents in the sweep plus tika's
  `testPagesPwdProtected.pages` fail with *"document is password-protected (.iwph …)"*.
  If encrypted-document handling ever needs a fixture, they exist and are easy to re-fetch.
- **Page-layout vs word-processing**: `rougier-v13.1-image-filters-masks.pages` and
  `vertx-v2.2-image-filters.pages` both report `isPageLayout=true`; every other fixture is
  a word-processing document. That split was previously untested.

## Appendix — every `.pages` file probed

All 1038 files from the GitHub sweep (the 25 in the dedicated corpora are in the
*Corpus-by-corpus* tables above). Sorted by score descending, then size ascending.

| file | upstream path | fmt | app build | score | filt | mask | img | hdr | ftr | fnote | cmt | link | sect | chart | trk | cell | tbox | toc | list | bkm |
|---|---|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| ThreatConnect-Inc/threatconnect-playbooks | apps/TCPB_-_Expressions/doc/Expressions.pages | `11.1.2` | `M11.1-7031.0.102-2` | 11 |  | 1 | 7 | 3 | 3 |  |  | 2 | 3 |  |  | 1 | 26 | 1 | 86 | 1 |
| picopalette/phishing-detection-plugin | artifacts/report.pages | `3.2.13` | `M7.2-5869-2` | 10 |  | 3 | 18 | 13 | 1 | 8 |  | 1 | 14 |  |  | 4 |  | 7 | 292 |  |
| ntop/nDPI | doc/guide/nDPI_QuickStartGuide.pages | `10.0.10` | `M10.0-6748-2` | 9 |  |  | 1 | 2 | 2 |  |  | 7 | 1 |  | 1 | 1 |  | 1 | 168 | 2 |
| sde-skills/meetupHandoutsAndCode | 2020-04-18-Strings/2020-04-18 Handout Strings.pages | `10.0.10` | `M10.0-6748-2` | 9 |  | 1 | 5 | 1 | 2 |  |  | 4 | 1 |  |  |  |  | 1 | 26 | 3 |
| freeDSP/freeDSP-aurora | DOCUMENTATION/AN001 Firmware Update EN.pages | `10.1.8` | `M10.1-6913-2` | 9 |  | 3 | 11 | 2 | 2 |  |  | 5 | 1 |  |  | 1 | 1 | 3 | 26 |  |
| freeDSP/freeDSP-aurora | DOCUMENTATION/AN001 Firmware Update DE.pages | `10.1.8` | `M10.1-6913-2` | 9 |  | 3 | 11 | 2 | 2 |  |  | 5 | 1 |  |  | 1 | 1 | 3 | 28 |  |
| freeDSP/freeDSP-aurora | DOCUMENTATION/AN002 Updating from 1.x.x DE.pages | `4.2.3` | `M8.2.1-6529-2` | 9 |  | 3 | 13 | 2 | 2 |  |  | 4 | 1 |  |  | 1 | 1 | 3 | 28 |  |
| freeDSP/freeDSP-aurora | DOCUMENTATION/AN002 Updating from 1.x.x EN.pages | `4.2.3` | `M8.2.1-6529-2` | 9 |  | 3 | 13 | 2 | 2 |  |  | 4 | 1 |  |  | 1 | 1 | 3 | 26 |  |
| VueFileManager/vuefilemanager | storage/demo/documents/School Report.pages | `4.2.3` | `M8.2.1-6529-2` | 8 |  | 4 | 4 |  | 1 |  |  |  | 2 |  |  |  | 6 | 1 | 43 |  |
| nerds-odd-e/scrummaster-checklist | source_documents/ScrumMaster-Checklist-2022-02-08-jp.pages | `13.0.2` | `M13.0-7036.0.126-2` | 8 |  |  |  |  | 1 | 14 | 1 | 7 | 3 |  |  |  | 1 | 1 | 103 |  |
| andy489/Software_Engineering_State_Exam | assets/12/12 Java.pages | `12.1.1` | `M12.1-7034.0.86-2` | 8 |  |  | 1 |  | 3 |  |  | 1 | 1 |  |  | 3 | 37 | 1 | 210 | 1 |
| andy489/Software_Engineering_State_Exam | assets/08/08.pages | `12.2.8` | `M12.2.1-7035.0.161-2` | 8 |  |  | 13 |  | 3 |  |  | 1 | 1 |  |  | 20 | 10 | 1 | 91 | 6 |
| iamjakewarner/jdf | JDF2.2-Starter.pages | `4.2.3` | `M8.2.1-6529-2` | 8 |  | 1 | 2 |  | 1 | 2 |  | 8 | 1 |  |  | 1 |  | 1 | 82 |  |
| PicoMLX/PicoDocs | Tests/PicoDocsTests/Resources/sample.pages | `14.4.1` | `M14.5-7045.0.17-4` | 8 |  |  | 1 | 2 | 2 |  |  | 1 | 2 |  |  | 3 |  | 1 | 88 |  |
| ToFuProject/tofu | Notes_Upgrades/Eurofusion/EEG-Interim_Report_template_2MS6HK_v2_0.pages | `3.2.13` | `M7.3-5989-2` | 8 |  |  | 3 |  | 1 | 1 |  | 1 | 1 |  |  | 4 |  | 1 | 56 |  |
| andy489/Data_Structures_and_Algorithms | assets/3 – Algorithms/Lowest common ancestor (LCA)/Lowest Common Ancestor (LCA | `11.1.2` | `M11.1-7031.0.102-2` | 8 |  |  | 44 |  | 1 |  |  | 6 | 1 |  |  | 1 | 19 | 1 | 42 | 1 |
| andy489/Software_Engineering_State_Exam | assets/15/15.pages | `12.1.1` | `M12.1-7034.0.86-2` | 8 |  |  | 24 |  | 3 |  |  | 1 | 1 |  |  | 2 | 98 | 1 | 243 | 4 |
| andy489/Software_Engineering_State_Exam | assets/05/05.pages | `12.2.8` | `M12.2.1-7035.0.161-2` | 8 |  |  | 35 |  | 3 |  |  | 1 | 1 |  |  | 2 | 15 | 1 | 72 | 11 |
| freeDSP/freeDSP-aurora | DOCUMENTATION/SpecSheet.pages | `3.2.13` | `M7.3-5989-2` | 8 |  | 2 | 4 | 1 | 2 |  |  |  | 1 |  |  | 1 | 33 | 1 | 57 |  |
| andy489/Software_Engineering_State_Exam | assets/11/11.pages | `13.1.2` | `M13.1-7037.0.101-2` | 8 |  |  | 80 |  | 3 |  |  | 1 | 1 |  |  | 10 | 3 | 1 | 67 | 17 |
| andy489/Software_Engineering_State_Exam | assets/09/09.pages | `12.1.1` | `M12.1-7034.0.86-2` | 8 |  |  | 73 |  | 3 |  |  | 1 | 1 |  |  | 47 | 10 | 1 | 72 | 10 |
| kishanrajput23/Training-Schedule-Management | Project_Flies/docs/documentation.pages | `12.2.8` | `M12.2.1-7035.0.161-2` | 8 |  | 1 | 6 | 1 | 2 |  |  |  | 2 |  |  |  | 2 | 1 | 90 |  |
| xg1990/GCP-Data-Engineer-Study-Guide | GCP Data Engineer-editable.pages | `4.1.7` | `M8.1-6369-2` | 8 |  | 3 | 5 |  |  | 7 |  | 31 | 1 |  |  | 1 | 1 | 1 | 260 |  |
| FyberLabs/FlexModule | processors/nRF51822/3dB/documents/designreview/3dBBLEReview.pages | `1.5.0` | `M5.5.2-2120-1` | 8 |  | 2 | 10 |  | 2 |  |  | 8 | 2 |  |  |  |  | 1 | 43 |  |
| nerds-odd-e/scrummaster-checklist | source_documents/ScrumMaster_Checklist_th.pages | `3.2.13` | `M7.3-5989-2` | 7 |  |  |  | 1 | 1 |  |  | 2 | 1 |  |  | 4 | 42 | 1 | 106 |  |
| nerds-odd-e/scrummaster-checklist | source_documents/ScrumMaster-Checklist-2016-jp.pages | `3.2.13` | `M7.3-5989-2` | 7 |  |  |  |  | 1 | 12 |  | 4 | 5 |  |  |  | 3 | 1 | 135 |  |
| andy489/Data_Structures_and_Algorithms | assets/1 – FMI Data Structures & Algorithms/15–2020–01–24-exam/04 Profile of a | `11.1.2` | `M11.1-7031.0.102-2` | 7 |  |  | 1 |  | 1 |  |  | 2 | 1 |  |  | 1 | 19 | 1 | 38 |  |
| nerds-odd-e/scrummaster-checklist | source_documents/ScrumMaster-Checklist-2022-02-08.pages | `11.2.9` | `M11.2-7032.0.145-2` | 7 |  |  |  |  | 1 | 13 |  | 5 | 5 |  |  |  | 3 | 1 | 134 |  |
| nerds-odd-e/scrummaster-checklist | source_documents/ScrumMaster-Checklist-2022-02-08-nl.pages | `11.2.9` | `M11.2-7032.0.145-2` | 7 |  |  |  |  | 1 | 14 |  | 7 | 5 |  |  |  | 3 | 1 | 134 |  |
| andy489/Software_Engineering_State_Exam | assets/past exams/2010/2010-09-08/6.pages | `12.1.1` | `M12.1-7034.0.86-2` | 7 |  |  | 6 |  | 2 |  |  | 1 | 1 |  |  | 6 | 1 | 1 | 34 |  |
| andy489/Software_Engineering_State_Exam | assets/past exams/2015/2015-07-14/6.pages | `12.1.1` | `M12.1-7034.0.86-2` | 7 |  |  | 12 |  | 2 |  |  | 1 | 1 |  |  | 5 | 36 | 1 | 65 |  |
| andy489/Data_Structures_and_Algorithms | assets/6 – Practice/code forces/0913B Christmas Spruce.pages | `11.1.2` | `M11.1-7031.0.102-2` | 7 |  |  | 7 |  | 1 |  |  | 3 | 1 |  |  | 1 | 19 | 1 | 41 |  |
| andy489/Data_Structures_and_Algorithms | assets/6 – Practice/code forces/1325C Ehab and Path-etic MEXs.pages | `11.1.2` | `M11.1-7031.0.102-2` | 7 |  |  | 12 |  | 1 |  |  | 2 | 1 |  |  | 1 | 6 | 1 | 27 |  |
| andy489/Software_Engineering_State_Exam | assets/past exams/2010/2010-07-15/6.pages | `12.1.1` | `M12.1-7034.0.86-2` | 7 |  |  | 6 |  | 2 |  |  | 1 | 1 |  |  | 6 | 1 | 1 | 34 |  |
| andy489/Data_Structures_and_Algorithms | assets/1 – FMI Data Structures & Algorithms/08–week/08–08 Edge removal.pages | `11.1.2` | `M11.1-7031.0.102-2` | 7 |  |  | 5 |  | 1 |  |  | 2 | 1 |  |  | 1 | 14 | 1 | 33 |  |
| andy489/Software_Engineering_State_Exam | assets/06/06.pages | `12.1.1` | `M12.1-7034.0.86-2` | 7 |  |  | 7 |  | 3 |  |  | 1 | 1 |  |  |  | 24 | 1 | 64 | 8 |
| andy489/Software_Engineering_State_Exam | assets/12/12 CPP.pages | `12.1.1` | `M12.1-7034.0.86-2` | 7 |  |  |  |  | 3 |  |  | 1 | 1 |  |  | 1 | 23 | 1 | 108 | 21 |
| SwiftEducation/teaching-app-dev-swift | Level 4/Journal/Journal Lesson01.pages | `1.5.0` | `M5.5.3-2152-2` | 7 |  | 3 | 3 | 1 | 1 |  |  | 12 | 1 |  |  |  |  | 1 | 36 |  |
| SwiftEducation/teaching-app-dev-swift | Level 4/RSSReader/RSSReader Lesson01.pages | `2.0.24` | `M5.6-2553-2` | 7 |  | 3 | 3 | 1 | 1 |  |  | 12 | 1 |  |  |  |  | 1 | 36 |  |
| SwiftEducation/teaching-app-dev-swift | Level 4/Journal/Journal Lesson02.pages | `1.5.0` | `M5.5.3-2152-2` | 7 |  | 3 | 4 | 1 | 1 |  |  | 5 | 1 |  |  |  |  | 1 | 32 |  |
| andy489/Software_Engineering_State_Exam | assets/past exams/2020/2020-09-16/3.pages | `12.2.8` | `M12.2-7035.0.159-2` | 7 |  |  | 5 |  | 2 |  |  | 1 | 1 |  |  | 1 | 33 | 1 | 65 |  |
| SwiftEducation/teaching-app-dev-swift | Level 4/RSSReader/RSSReader Lesson02.pages | `1.5.0` | `M5.5.3-2152-2` | 7 |  | 3 | 4 | 1 | 1 |  |  | 5 | 1 |  |  |  |  | 1 | 32 |  |
| SwiftEducation/teaching-app-dev-swift | Level 4/Flashcards/Flashcards Lesson02.pages | `2.0.24` | `M5.6-2553-2` | 7 |  | 3 | 3 | 1 | 1 |  |  | 5 | 1 |  |  |  |  | 1 | 46 |  |
| andy489/Data_Structures_and_Algorithms | assets/6 – Practice/code forces/0580C Kefa and Park.pages | `11.1.2` | `M11.1-7031.0.102-2` | 7 |  |  | 13 |  | 1 |  |  | 2 | 1 |  |  | 1 | 11 | 1 | 32 |  |
| SwiftEducation/teaching-app-dev-swift | Level 4/Journal/Journal Lesson07.pages | `1.5.0` | `M5.5.3-2152-2` | 7 |  | 3 | 4 | 1 | 1 |  |  | 6 | 1 |  |  |  |  | 1 | 31 |  |
| SwiftEducation/teaching-app-dev-swift | Level 4/Flashcards/Flashcards Lesson03.pages | `2.0.24` | `M5.6.1-2562-1` | 7 |  | 3 | 3 | 1 | 1 |  |  | 7 | 1 |  |  |  |  | 1 | 48 |  |
| SwiftEducation/teaching-app-dev-swift | Level 4/Journal/Journal Lesson03.pages | `2.0.24` | `M5.6.1-2562-1` | 7 |  | 3 | 5 | 1 | 1 |  |  | 8 | 1 |  |  |  |  | 1 | 44 |  |
| SwiftEducation/teaching-app-dev-swift | Level 4/Flashcards/Flashcards Lesson06.pages | `2.0.24` | `M5.6-2553-2` | 7 |  | 3 | 3 | 1 | 1 |  |  | 2 | 1 |  |  |  |  | 1 | 33 |  |
| SwiftEducation/teaching-app-dev-swift | Level 3/Found/Found Lesson02.pages | `1.5.0` | `M5.5.3-2152-2` | 7 |  | 3 | 3 | 1 | 1 |  |  | 5 | 1 |  |  |  |  | 1 | 30 |  |
| andy489/Data_Structures_and_Algorithms | assets/6 – Practice/code forces/0120F Spiders.pages | `11.1.2` | `M11.1-7031.0.102-2` | 7 |  |  | 8 |  | 1 |  |  | 2 | 1 |  |  | 1 | 14 | 1 | 36 |  |
| SwiftEducation/teaching-app-dev-swift | Level 4/Flashcards/Flashcards Lesson04.pages | `2.0.24` | `M5.6.1-2562-1` | 7 |  | 3 | 5 | 1 | 1 |  |  | 9 | 1 |  |  |  |  | 1 | 42 |  |
| SwiftEducation/teaching-app-dev-swift | Level 4/RSSReader/RSSReader Lesson07.pages | `1.5.0` | `M5.5.3-2152-2` | 7 |  | 3 | 3 | 1 | 1 |  |  | 7 | 1 |  |  |  |  | 1 | 35 |  |
| SwiftEducation/teaching-app-dev-swift | Level 4/Journal/Journal Lesson08.pages | `1.5.0` | `M5.5.3-2152-2` | 7 |  | 3 | 3 | 1 | 1 |  |  | 12 | 1 |  |  |  |  | 1 | 43 |  |
| SwiftEducation/teaching-app-dev-swift | Level 3/Found/Found Lesson01.pages | `1.5.0` | `M5.5.3-2152-2` | 7 |  | 3 | 3 | 1 | 1 |  |  | 7 | 1 |  |  |  |  | 1 | 34 |  |
| SwiftEducation/teaching-app-dev-swift | Level 4/Flashcards/Flashcards Lesson05.pages | `2.0.24` | `M5.6.1-2562-1` | 7 |  | 3 | 4 | 1 | 1 |  |  | 7 | 1 |  |  |  |  | 1 | 45 |  |
| SwiftEducation/teaching-app-dev-swift | Level 4/Journal/Journal Lesson04.pages | `2.0.24` | `M5.6.1-2562-1` | 7 |  | 3 | 3 | 1 | 1 |  |  | 11 | 1 |  |  |  |  | 1 | 48 |  |
| SwiftEducation/teaching-app-dev-swift | Level 4/Journal/Journal Lesson05.pages | `2.0.24` | `M5.6.1-2562-1` | 7 |  | 3 | 3 | 1 | 1 |  |  | 8 | 1 |  |  |  |  | 1 | 40 |  |
| SwiftEducation/teaching-app-dev-swift | Level 4/RSSReader/RSSReader Lesson06.pages | `2.0.24` | `M5.6.1-2562-1` | 7 |  | 3 | 3 | 1 | 1 |  |  | 11 | 1 |  |  |  |  | 1 | 40 |  |
| SwiftEducation/teaching-app-dev-swift | Level 2/Stopwatch/Stopwatch Lesson05.pages | `2.0.24` | `M5.6.1-2562-1` | 7 |  | 3 | 3 | 1 | 1 |  |  | 6 | 1 |  |  |  |  | 1 | 39 |  |
| SwiftEducation/teaching-app-dev-swift | Level 2/Stopwatch/Stopwatch Lesson04.pages | `2.0.24` | `M5.6.1-2562-1` | 7 |  | 3 | 3 | 1 | 1 |  |  | 6 | 1 |  |  |  |  | 1 | 38 |  |
| SwiftEducation/teaching-app-dev-swift | Level 2/Stopwatch/Stopwatch Lesson03.pages | `2.0.24` | `M5.6.1-2562-1` | 7 |  | 3 | 3 | 1 | 1 |  |  | 8 | 1 |  |  |  |  | 1 | 38 |  |
| SwiftEducation/teaching-app-dev-swift | Level 2/UnitConverter/UnitConverter Lesson01.pages | `1.5.0` | `M5.5.3-2152-2` | 7 |  | 3 | 7 | 1 | 1 |  |  | 3 | 1 |  |  |  |  | 1 | 30 |  |
| SwiftEducation/teaching-app-dev-swift | Level 3/Found/Found Lesson04.pages | `2.0.24` | `M5.6.1-2562-1` | 7 |  | 3 | 4 | 1 | 1 |  |  | 11 | 1 |  |  |  |  | 1 | 44 |  |
| SwiftEducation/teaching-app-dev-swift | Level 2/Stopwatch/Stopwatch Lesson06.pages | `2.0.24` | `M5.6.1-2562-1` | 7 |  | 3 | 3 | 1 | 1 |  |  | 6 | 1 |  |  |  |  | 1 | 37 |  |
| SwiftEducation/teaching-app-dev-swift | Level 2/Stopwatch/Stopwatch Lesson02.pages | `1.5.0` | `M5.5.3-2152-2` | 7 |  | 3 | 3 | 1 | 1 |  |  | 8 | 1 |  |  |  |  | 1 | 43 |  |
| SwiftEducation/teaching-app-dev-swift | Level 2/Stopwatch/Stopwatch Lesson07.pages | `2.0.24` | `M5.6.1-2562-1` | 7 |  | 3 | 3 | 1 | 1 |  |  | 5 | 1 |  |  |  |  | 1 | 34 |  |
| SwiftEducation/teaching-app-dev-swift | Level 3/Found/Found Lesson05.pages | `1.5.0` | `M5.5.3-2152-2` | 7 |  | 3 | 5 | 1 | 1 |  |  | 9 | 1 |  |  |  |  | 1 | 42 |  |
| SwiftEducation/teaching-app-dev-swift | Level 2/UnitConverter/UnitConverter Lesson08.pages | `2.0.24` | `M5.6.1-2562-1` | 7 |  | 3 | 3 | 1 | 1 |  |  | 9 | 1 |  |  |  |  | 1 | 48 |  |
| SwiftEducation/teaching-app-dev-swift | Level 2/UnitConverter/UnitConverter Lesson02.pages | `1.5.0` | `M5.5.3-2152-2` | 7 |  | 3 | 4 | 1 | 1 |  |  | 7 | 1 |  |  |  |  | 1 | 36 |  |
| SwiftEducation/teaching-app-dev-swift | Level 2/UnitConverter/UnitConverter Lesson05.pages | `1.5.0` | `M5.5.3-2152-2` | 7 |  | 3 | 3 | 1 | 1 |  |  | 8 | 1 |  |  |  |  | 1 | 36 |  |
| SwiftEducation/teaching-app-dev-swift | Level 2/UnitConverter/UnitConverter Lesson04.pages | `2.0.24` | `M5.6.1-2562-1` | 7 |  | 3 | 3 | 1 | 1 |  |  | 6 | 1 |  |  |  |  | 1 | 46 |  |
| SwiftEducation/teaching-app-dev-swift | Level 2/UnitConverter/UnitConverter Lesson11.pages | `1.5.0` | `M5.5.3-2152-2` | 7 |  | 3 | 3 | 1 | 1 |  |  | 6 | 1 |  |  |  |  | 1 | 41 |  |
| SwiftEducation/teaching-app-dev-swift | Level 4/Journal/Journal Lesson09.pages | `1.5.0` | `M5.5.3-2152-2` | 7 |  | 3 | 5 | 1 | 1 |  |  | 9 | 1 |  |  |  |  | 1 | 36 |  |
| SwiftEducation/teaching-app-dev-swift | Level 4/Journal/Journal Lesson10.pages | `1.5.0` | `M5.5.3-2152-2` | 7 |  | 3 | 3 | 1 | 1 |  |  | 4 | 1 |  |  |  |  | 1 | 37 |  |
| SwiftEducation/teaching-app-dev-swift | Level 2/UnitConverter/UnitConverter Lesson09.pages | `1.5.0` | `M5.5.3-2152-2` | 7 |  | 3 | 3 | 1 | 1 |  |  | 7 | 1 |  |  |  |  | 1 | 38 |  |
| andy489/Data_Structures_and_Algorithms | assets/3 – Algorithms/Recursion and Backtracking/Generate snakes.pages | `11.1.2` | `M11.1-7031.0.102-2` | 7 |  |  | 21 |  | 1 |  |  | 1 | 1 |  |  | 1 | 122 | 1 | 147 |  |
| SwiftEducation/teaching-app-dev-swift | Level 2/UnitConverter/UnitConverter Lesson06.pages | `1.5.0` | `M5.5.3-2152-2` | 7 |  | 3 | 3 | 1 | 1 |  |  | 7 | 1 |  |  |  |  | 1 | 39 |  |
| andy489/Data_Structures_and_Algorithms | assets/3 – Algorithms/Lowest common ancestor (LCA)/LCA – Lowest Common Ancesto | `11.1.2` | `M11.1-7031.0.102-2` | 7 |  |  | 8 |  | 1 |  |  | 2 | 1 |  |  | 1 | 13 | 1 | 32 |  |
| SwiftEducation/teaching-app-dev-swift | Level 2/UnitConverter/UnitConverter Lesson10.pages | `1.5.0` | `M5.5.3-2152-2` | 7 |  | 3 | 3 | 1 | 1 |  |  | 2 | 1 |  |  |  |  | 1 | 41 |  |
| SwiftEducation/teaching-app-dev-swift | Level 4/RSSReader/RSSReader Lesson05.pages | `1.5.0` | `M5.5.3-2152-2` | 7 |  | 4 | 8 | 1 | 1 |  |  | 4 | 1 |  |  |  |  | 1 | 43 |  |
| AlexHarker/HISSTools_Freeze | manual/HISSTools_Freeze_User_Guide.pages | `12.1.1` | `M12.1-7034.0.86-2` | 7 |  | 1 | 1 |  | 1 |  |  | 3 | 1 |  |  | 1 |  | 3 | 30 |  |
| SwiftEducation/teaching-app-dev-swift | Level 3/Found/Found Lesson03.pages | `1.5.0` | `M5.5.3-2152-2` | 7 |  | 3 | 4 | 1 | 1 |  |  | 4 | 1 |  |  |  |  | 1 | 39 |  |
| andrejHurynovic/bsuirLabs | term6/СА/СА, ЛР № 1/СА, ЛР № 1.pages | `11.2.9` | `M11.2-7032.0.145-2` | 7 |  | 1 | 8 |  | 1 |  |  |  | 1 |  |  | 22 | 4 | 1 | 60 |  |
| SwiftEducation/teaching-app-dev-swift | Level 3/NoiseMaker/NoiseMaker Lesson06.pages | `2.0.24` | `M5.6.1-2562-1` | 7 |  | 3 | 3 | 1 | 1 |  |  | 4 | 1 |  |  |  |  | 1 | 36 |  |
| SwiftEducation/teaching-app-dev-swift | Level 3/NoiseMaker/NoiseMaker Lesson08.pages | `2.0.24` | `M5.6.1-2562-1` | 7 |  | 3 | 3 | 1 | 1 |  |  | 4 | 1 |  |  |  |  | 1 | 37 |  |
| SwiftEducation/teaching-app-dev-swift | Level 4/Journal/Journal Lesson06.pages | `2.0.24` | `M5.6.1-2562-1` | 7 |  | 3 | 3 | 1 | 1 |  |  | 11 | 1 |  |  |  |  | 1 | 54 |  |
| SwiftEducation/teaching-app-dev-swift | Level 3/NoiseMaker/NoiseMaker Lesson02.pages | `1.5.0` | `M5.5.3-2152-2` | 7 |  | 3 | 3 | 1 | 1 |  |  | 6 | 1 |  |  |  |  | 1 | 37 |  |
| SwiftEducation/teaching-app-dev-swift | Level 3/NoiseMaker/NoiseMaker Lesson04.pages | `2.0.24` | `M5.6.1-2562-1` | 7 |  | 3 | 3 | 1 | 1 |  |  | 7 | 1 |  |  |  |  | 1 | 37 |  |
| SwiftEducation/teaching-app-dev-swift | Level 3/NoiseMaker/NoiseMaker Lesson05.pages | `2.0.24` | `M5.6.1-2562-1` | 7 |  | 3 | 3 | 1 | 1 |  |  | 14 | 1 |  |  |  |  | 1 | 39 |  |
| SwiftEducation/teaching-app-dev-swift | Level 3/NoiseMaker/NoiseMaker Lesson03.pages | `2.0.24` | `M5.6.1-2562-1` | 7 |  | 3 | 3 | 1 | 1 |  |  | 7 | 1 |  |  |  |  | 1 | 38 |  |
| SwiftEducation/teaching-app-dev-swift | Level 3/NoiseMaker/NoiseMaker Lesson07.pages | `2.0.24` | `M5.6.1-2562-1` | 7 |  | 3 | 3 | 1 | 1 |  |  | 6 | 1 |  |  |  |  | 1 | 46 |  |
| SwiftEducation/teaching-app-dev-swift | Level 4/Journal/Journal Lesson11.pages | `1.5.0` | `M5.5.3-2152-2` | 7 |  | 3 | 3 | 1 | 1 |  |  | 6 | 1 |  |  |  |  | 1 | 47 |  |
| andy489/Data_Structures_and_Algorithms | assets/1 – FMI Data Structures & Algorithms/05–week/05–06 Rotten from the core | `11.1.2` | `M11.1-7031.0.102-2` | 7 |  |  | 30 |  | 1 |  |  | 2 | 1 |  |  | 1 | 206 | 1 | 225 |  |
| SwiftEducation/teaching-app-dev-swift | Level 3/NoiseMaker/NoiseMaker Lesson09.pages | `1.5.0` | `M5.5.3-2152-2` | 7 |  | 3 | 3 | 1 | 1 |  |  | 6 | 1 |  |  |  |  | 1 | 37 |  |
| SwiftEducation/teaching-app-dev-swift | Level 2/Stopwatch/Stopwatch Lesson01.pages | `1.5.0` | `M5.5.3-2152-2` | 7 |  | 3 | 6 | 1 | 1 |  |  | 9 | 1 |  |  |  |  | 1 | 32 |  |
| SwiftEducation/teaching-app-dev-swift | Level 3/EasyBrowser/EasyBrowser Lesson03.pages | `1.5.0` | `M5.5.3-2152-2` | 7 |  | 3 | 4 | 1 | 1 |  |  | 3 | 1 |  |  |  |  | 1 | 30 |  |
| SwiftEducation/teaching-app-dev-swift | Level 2/UnitConverter/UnitConverter Lesson07.pages | `2.0.24` | `M5.6.1-2562-1` | 7 |  | 3 | 7 | 1 | 1 |  |  | 6 | 1 |  |  |  |  | 1 | 36 |  |
| andy489/Data_Structures_and_Algorithms | assets/1 – FMI Data Structures & Algorithms/09–week/09–04 Maze escape.pages | `11.1.2` | `M11.1-7031.0.102-2` | 7 |  |  | 9 |  | 1 |  |  | 2 | 1 |  |  | 1 | 1 | 1 | 20 |  |
| SwiftEducation/teaching-app-dev-swift | Level 3/Gesturizer/Gesturizer Lesson09.pages | `2.0.24` | `M5.6.1-2562-1` | 7 |  | 3 | 3 | 1 | 1 |  |  | 3 | 1 |  |  |  |  | 1 | 35 |  |
| SwiftEducation/teaching-app-dev-swift | Level 4/RSSReader/RSSReader Lesson04.pages | `1.5.0` | `M5.5.3-2152-2` | 7 |  | 3 | 6 | 1 | 1 |  |  | 8 | 1 |  |  |  |  | 1 | 38 |  |
| andy489/Data_Structures_and_Algorithms | assets/6 – Practice/code forces/1143C Queen.pages | `11.1.2` | `M11.1-7031.0.102-2` | 7 |  |  | 22 |  | 1 |  |  | 3 | 1 |  |  | 1 | 61 | 1 | 84 |  |
| SwiftEducation/teaching-app-dev-swift | Level 3/EasyBrowser/EasyBrowser Lesson01.pages | `1.5.0` | `M5.5.3-2152-2` | 7 |  | 3 | 3 | 1 | 1 |  |  | 7 | 1 |  |  |  |  | 1 | 38 |  |
| SwiftEducation/teaching-app-dev-swift | Level 3/Gesturizer/Gesturizer Lesson03.pages | `2.0.24` | `M5.6-2553-2` | 7 |  | 3 | 3 | 1 | 1 |  |  | 4 | 1 |  |  |  |  | 1 | 51 |  |
| SwiftEducation/teaching-app-dev-swift | Level 3/Gesturizer/Gesturizer Lesson04.pages | `2.0.24` | `M5.6-2553-2` | 7 |  | 3 | 3 | 1 | 1 |  |  | 3 | 1 |  |  |  |  | 1 | 38 |  |
| SwiftEducation/teaching-app-dev-swift | Level 3/Gesturizer/Gesturizer Lesson07.pages | `2.0.24` | `M5.6-2553-2` | 7 |  | 3 | 5 | 1 | 1 |  |  | 5 | 1 |  |  |  |  | 1 | 34 |  |
| SwiftEducation/teaching-app-dev-swift | Level 3/Gesturizer/Gesturizer Lesson06.pages | `2.0.24` | `M5.6-2553-2` | 7 |  | 3 | 5 | 1 | 1 |  |  | 5 | 1 |  |  |  |  | 1 | 36 |  |
| SwiftEducation/teaching-app-dev-swift | Level 3/Gesturizer/Gesturizer Lesson05.pages | `2.0.24` | `M5.6-2553-2` | 7 |  | 3 | 3 | 1 | 1 |  |  | 3 | 1 |  |  |  |  | 1 | 35 |  |
| SwiftEducation/teaching-app-dev-swift | Level 3/FingerPainter/FingerPainter Lesson05.pages | `2.0.24` | `M5.6-2553-2` | 7 |  | 3 | 3 | 1 | 1 |  |  | 7 | 1 |  |  |  |  | 1 | 36 |  |
| SwiftEducation/teaching-app-dev-swift | Level 3/Gesturizer/Gesturizer Lesson08.pages | `2.0.24` | `M5.6-2553-2` | 7 |  | 3 | 6 | 1 | 1 |  |  | 5 | 1 |  |  |  |  | 1 | 34 |  |
| SwiftEducation/teaching-app-dev-swift | Level 3/Gesturizer/Gesturizer Lesson01.pages | `2.0.24` | `M5.6-2553-2` | 7 |  | 3 | 7 | 1 | 1 |  |  | 8 | 1 |  |  |  |  | 1 | 37 |  |
| SwiftEducation/teaching-app-dev-swift | Level 3/FingerPainter/FingerPainter Lesson06.pages | `2.0.24` | `M5.6-2553-2` | 7 |  | 3 | 3 | 1 | 1 |  |  | 5 | 1 |  |  |  |  | 1 | 37 |  |
| SwiftEducation/teaching-app-dev-swift | Level 3/EasyBrowser/EasyBrowser Lesson02.pages | `1.5.0` | `M5.5.3-2152-2` | 7 |  | 3 | 3 | 1 | 1 |  |  | 9 | 1 |  |  |  |  | 1 | 37 |  |
| SwiftEducation/teaching-app-dev-swift | Level 3/NoiseMaker/NoiseMaker Lesson01.pages | `1.5.0` | `M5.5.3-2152-2` | 7 |  | 3 | 5 | 1 | 1 |  |  | 5 | 1 |  |  |  |  | 1 | 35 |  |
| SwiftEducation/teaching-app-dev-swift | Level 3/EasyBrowser/EasyBrowser Lesson05.pages | `1.5.0` | `M5.5.3-2152-2` | 7 |  | 3 | 3 | 1 | 1 |  |  | 3 | 1 |  |  |  |  | 1 | 31 |  |
| SwiftEducation/teaching-app-dev-swift | Level 3/Gesturizer/Gesturizer Lesson02.pages | `2.0.24` | `M5.6-2553-2` | 7 |  | 3 | 5 | 1 | 1 |  |  | 6 | 1 |  |  |  |  | 1 | 33 |  |
| SwiftEducation/teaching-app-dev-swift | Level 3/FingerPainter/FingerPainter Lesson04.pages | `2.0.24` | `M5.6.1-2562-1` | 7 |  | 3 | 3 | 1 | 1 |  |  | 10 | 1 |  |  |  |  | 1 | 44 |  |
| SwiftEducation/teaching-app-dev-swift | Level 3/EasyBrowser/EasyBrowser Lesson04.pages | `2.0.24` | `M5.6.1-2562-1` | 7 |  | 3 | 4 | 1 | 1 |  |  | 11 | 1 |  |  |  |  | 1 | 36 |  |
| SwiftEducation/teaching-app-dev-swift | Level 3/NoiseMaker/NoiseMaker Lesson10.pages | `1.5.0` | `M5.5.3-2152-2` | 7 |  | 3 | 7 | 1 | 1 |  |  | 7 | 1 |  |  |  |  | 1 | 30 |  |
| andy489/Data_Structures_and_Algorithms | assets/6 – Practice/code forces/0981C Useful Decomposition.pages | `11.1.2` | `M11.1-7031.0.102-2` | 7 |  |  | 30 |  | 1 |  |  | 2 | 1 |  |  | 3 | 15 | 1 | 34 |  |
| SwiftEducation/teaching-app-dev-swift | Level 2/Clock/Clock Lesson04.pages | `2.0.24` | `M5.6.1-2562-1` | 7 |  | 3 | 3 | 1 | 1 |  |  | 6 | 1 |  |  |  |  | 1 | 40 |  |
| SwiftEducation/teaching-app-dev-swift | Level 4/Flashcards/Flashcards Lesson01.pages | `2.0.24` | `M5.6-2553-2` | 7 |  | 3 | 7 | 1 | 1 |  |  | 8 | 1 |  |  |  |  | 1 | 32 |  |
| SwiftEducation/teaching-app-dev-swift | Level 4/RSSReader/RSSReader Lesson03.pages | `2.0.24` | `M5.6-2553-2` | 7 |  | 4 | 7 | 1 | 1 |  |  | 9 | 1 |  |  |  |  | 1 | 34 |  |
| SwiftEducation/teaching-app-dev-swift | Level 1/WordCollage/WordCollage Lesson01.pages | `1.5.0` | `M5.5.3-2152-2` | 7 |  | 3 | 4 | 1 | 1 |  |  | 8 | 1 |  |  |  |  | 1 | 30 |  |
| andy489/Data_Structures_and_Algorithms | assets/6 – Practice/code forces/1139C Edgy Trees.pages | `11.1.2` | `M11.1-7031.0.102-2` | 7 |  |  | 34 |  | 1 |  |  | 2 | 1 |  |  | 1 | 7 | 1 | 30 |  |
| SwiftEducation/teaching-app-dev-swift | Level 2/Clock/Clock Lesson05.pages | `1.5.0` | `M5.5.3-2152-2` | 7 |  | 3 | 3 | 1 | 1 |  |  | 6 | 1 |  |  |  |  | 1 | 39 |  |
| SwiftEducation/teaching-app-dev-swift | Level 2/Clock/Clock Lesson02.pages | `1.5.0` | `M5.5.3-2152-2` | 7 |  | 3 | 3 | 1 | 1 |  |  | 12 | 1 |  |  |  |  | 1 | 43 |  |
| SwiftEducation/teaching-app-dev-swift | Level 2/Clock/Clock Lesson01.pages | `2.0.24` | `M5.6.1-2562-1` | 7 |  | 3 | 4 | 1 | 1 |  |  | 10 | 1 |  |  |  |  | 1 | 38 |  |
| SwiftEducation/teaching-app-dev-swift | Level 3/FingerPainter/FingerPainter Lesson01.pages | `2.0.24` | `M5.6-2553-2` | 7 |  | 3 | 4 | 1 | 1 |  |  | 10 | 1 |  |  |  |  | 1 | 42 |  |
| SwiftEducation/teaching-app-dev-swift | Level 4/Flashcards/Flashcards Lesson08.pages | `2.0.24` | `M5.6.1-2562-1` | 7 |  | 3 | 3 | 1 | 1 |  |  | 5 | 1 |  |  |  |  | 1 | 36 |  |
| SwiftEducation/teaching-app-dev-swift | Level 2/UnitConverter/UnitConverter Lesson03.pages | `2.0.24` | `M5.6.1-2562-1` | 7 |  | 3 | 5 | 1 | 1 |  |  | 10 | 1 |  |  |  |  | 1 | 39 |  |
| SwiftEducation/teaching-app-dev-swift | Level 1/WordCollage/WordCollage Lesson03.pages | `1.5.0` | `M5.5.3-2152-2` | 7 |  | 3 | 4 | 1 | 1 |  |  | 11 | 1 |  |  |  |  | 1 | 36 |  |
| SwiftEducation/teaching-app-dev-swift | Level 4/Flashcards/Flashcards Lesson07.pages | `2.0.24` | `M5.6.1-2562-1` | 7 |  | 3 | 5 | 1 | 1 |  |  | 11 | 1 |  |  |  |  | 1 | 43 |  |
| SwiftEducation/teaching-app-dev-swift | Level 3/FingerPainter/FingerPainter Lesson02.pages | `2.0.24` | `M5.6.1-2562-1` | 7 |  | 3 | 4 | 1 | 1 |  |  | 5 | 1 |  |  |  |  | 1 | 38 |  |
| SwiftEducation/teaching-app-dev-swift | Level 1/WordCollage/WordCollage Lesson04.pages | `1.5.0` | `M5.5.3-2152-2` | 7 |  | 3 | 4 | 1 | 1 |  |  | 10 | 1 |  |  |  |  | 1 | 38 |  |
| SwiftEducation/teaching-app-dev-swift | Level 3/FingerPainter/FingerPainter Lesson03.pages | `2.0.24` | `M5.6.1-2562-1` | 7 |  | 3 | 4 | 1 | 1 |  |  | 7 | 1 |  |  |  |  | 1 | 40 |  |
| andy489/Software_Engineering_State_Exam | assets/17/17.pages | `12.1.1` | `M12.1-7034.0.86-2` | 7 |  |  | 9 |  | 3 |  |  | 1 | 1 |  |  | 1 |  | 1 | 118 | 6 |
| SwiftEducation/teaching-app-dev-swift | Level 2/Clock/Clock Lesson03.pages | `2.0.24` | `M5.6.1-2562-1` | 7 |  | 3 | 4 | 1 | 1 |  |  | 11 | 1 |  |  |  |  | 1 | 40 |  |
| SwiftEducation/teaching-app-dev-swift | Level 2/Clock/Clock Lesson06.pages | `2.0.24` | `M5.6.1-2562-1` | 7 |  | 4 | 6 | 1 | 1 |  |  | 8 | 1 |  |  |  |  | 1 | 36 |  |
| andy489/Data_Structures_and_Algorithms | assets/1 – FMI Data Structures & Algorithms/05–week/05–05 Los binares.pages | `11.1.2` | `M11.1-7031.0.102-2` | 7 |  |  | 17 |  | 1 |  |  | 2 | 1 |  |  | 2 | 2 | 1 | 21 |  |
| andy489/Data_Structures_and_Algorithms | assets/1 – FMI Data Structures & Algorithms/08–week/08–12 Green school.pages | `11.1.2` | `M11.1-7031.0.102-2` | 7 |  |  | 19 |  | 1 |  |  | 2 | 1 |  |  | 1 | 5 | 1 | 28 |  |
| andy489/Data_Structures_and_Algorithms | assets/1 – FMI Data Structures & Algorithms/06–week/06–03 k-th ancestor.pages | `11.1.2` | `M11.1-7031.0.102-2` | 7 |  |  | 19 |  | 1 |  |  | 1 | 1 |  |  | 1 | 7 | 1 | 26 |  |
| andy489/Software_Engineering_State_Exam | assets/17/Paired Testing.pages | `12.2.8` | `M12.2.1-7035.0.161-2` | 7 |  |  | 21 |  | 2 |  |  | 1 | 1 |  |  | 3 | 1 | 1 | 23 |  |
| nerds-odd-e/scrummaster-checklist | source_documents/ScrumMaster-Checklist-2022-02-08-ro.pages | `14.1.1` | `M14.1-7040.0.73-4` | 7 |  |  |  |  | 1 | 12 |  | 6 | 5 |  |  |  | 3 | 1 | 116 |  |
| SwiftEducation/teaching-app-dev-swift | Level 1/WordCollage/WordCollage Lesson02.pages | `2.0.24` | `M5.6.1-2562-1` | 7 |  | 3 | 7 | 1 | 1 |  |  | 10 | 1 |  |  |  |  | 1 | 34 |  |
| ntop/n2disk | doc/pdf/n2disk-UsersGuide.pages | `2.3.4` | `M6.3.1-5249-2` | 7 |  |  | 5 | 1 | 1 |  |  | 4 | 1 |  |  |  |  | 3 | 221 | 4 |
| andy489/Data_Structures_and_Algorithms | assets/1 – FMI Data Structures & Algorithms/08–week/08–09 API.pages | `11.1.2` | `M11.1-7031.0.102-2` | 7 |  |  | 31 |  | 1 |  |  | 2 | 1 |  |  | 1 | 5 | 1 | 28 |  |
| andy489/Software_Engineering_State_Exam | assets/past exams/2016/2016-09-09/6.pages | `12.2.8` | `M12.2-7035.0.159-2` | 7 |  |  | 94 |  | 2 |  |  | 1 | 1 |  |  | 1 | 48 | 1 | 92 |  |
| andy489/Software_Engineering_State_Exam | assets/past exams/2016/2016-07-12/6.pages | `12.2.8` | `M12.2-7035.0.159-2` | 7 |  |  | 71 |  | 2 |  |  | 1 | 1 |  |  | 2 | 15 | 1 | 66 |  |
| andy489/Software_Engineering_State_Exam | assets/18/18.pages | `12.1.1` | `M12.1-7034.0.86-2` | 7 |  | 2 | 11 |  | 3 |  |  | 1 | 1 |  |  |  |  | 1 | 126 | 22 |
| andy489/Software_Engineering_State_Exam | assets/past exams/2018/2018-07-13/3.pages | `12.2.8` | `M12.2-7035.0.159-2` | 7 |  |  | 30 |  | 2 |  |  | 1 | 1 |  |  | 1 | 7 | 1 | 45 |  |
| andy489/Software_Engineering_State_Exam | assets/past exams/2010/2010-09-08/1.pages | `12.2.8` | `M12.2-7035.0.159-2` | 7 |  |  | 57 |  | 2 |  |  | 1 | 1 |  |  | 2 | 5 | 1 | 47 |  |
| andy489/Software_Engineering_State_Exam | assets/past exams/2019/2019-09-10/3.pages | `12.2.8` | `M12.2.1-7035.0.161-2` | 7 |  |  | 131 |  | 2 |  |  | 1 | 1 |  |  | 3 | 3 | 1 | 140 |  |
| andy489/Software_Engineering_State_Exam | assets/past exams/2017/2017-07-11/7.pages | `12.2.8` | `M12.2-7035.0.159-2` | 7 |  |  | 129 |  | 2 |  |  | 1 | 1 |  |  | 3 | 3 | 1 | 136 |  |
| andy489/Software_Engineering_State_Exam | assets/past exams/2014/2014-07-15/1.pages | `12.2.8` | `M12.2-7035.0.159-2` | 7 |  |  | 113 |  | 2 |  |  | 1 | 1 |  |  | 2 | 15 | 1 | 111 |  |
| andy489/Data_Structures_and_Algorithms | assets/1 – FMI Data Structures & Algorithms/10–week/10–02 Floyd – City of blin | `11.1.2` | `M11.1-7031.0.102-2` | 7 |  |  | 59 |  | 1 |  |  | 2 | 1 |  |  | 1 | 9 | 1 | 44 |  |
| andy489/Software_Engineering_State_Exam | assets/03/Brzozowski's algorithm.pages | `12.2.8` | `M12.2-7035.0.159-2` | 7 |  |  | 65 |  | 2 |  |  | 1 | 1 |  |  | 1 | 10 | 1 | 50 |  |
| andy489/Empirical_Methods_and_Statistics | _asset/_exer/week 01/1. Sol 10.pages | `14.0.1` | `M14.0-7039.0.94-4` | 7 |  |  | 80 |  | 2 |  |  | 2 | 1 |  |  | 2 | 65 | 1 | 94 |  |
| NeutrinoSys/java-foundations-solutions | Professional Java Developer Career Starter Java Foundations Exercises & Supple | `11.2.9` | `M11.2-7032.0.145-2` | 7 |  |  | 13 |  | 3 |  | 17 | 5 | 1 |  |  | 6 |  | 3 | 67 |  |
| FyberLabs/FlexModule | power/USBBiPower/OTG/documents/designreview/USBBiPowerOTGreview.pages | `1.5.0` | `M5.5.2-2120-1` | 7 |  | 2 | 8 |  | 2 |  |  |  | 2 |  |  |  |  | 1 | 43 |  |
| rougier/scientific-posters | src/2023-iBAGS.pages | `13.1.2` | `M13.1-7037.0.101-2` | 7 | 1 | 12 | 17 |  |  |  |  | 1 | 1 |  |  |  | 121 | 1 | 141 |  |
| andy489/Software_Engineering_State_Exam | assets/07/07.pages | `12.1.1` | `M12.1-7034.0.86-2` | 7 |  |  | 92 |  | 3 |  |  | 1 | 1 |  |  |  | 2 | 1 | 42 | 9 |
| andy489/Software_Engineering_State_Exam | assets/past exams/2020/2020-08-05/3.pages | `12.2.8` | `M12.2-7035.0.159-2` | 7 |  |  | 117 |  | 2 |  |  | 1 | 1 |  |  | 4 | 38 | 1 | 101 |  |
| thibaudcolas/draftjs-filters | pasting/documents/Draft.js paste test document.pages | `2.3.4` | `M6.3.1-5249-2` | 7 |  |  | 4 |  |  |  | 3 | 3 | 1 |  |  |  | 3 | 1 | 33 | 1 |
| andy489/Empirical_Methods_and_Statistics | _asset/_additional/_inter/musicians_concerts.pages | `14.4.1` | `M14.4-7043.0.93-4` | 7 |  |  | 139 |  | 2 |  |  | 1 | 1 |  |  | 7 | 2 | 1 | 81 |  |
| SharifiZarchi/Algorithms_Design | Covid Challenge/covid-challenge.pages | `10.0.10` | `M10.0-6748-2` | 7 |  | 4 | 70 |  |  |  |  | 1 | 1 |  |  | 1 | 3 | 1 | 26 |  |
| andy489/Software_Engineering_State_Exam | assets/past exams/2014/2014-09-11/1.pages | `12.2.8` | `M12.2-7035.0.159-2` | 7 |  |  | 239 |  | 2 |  |  | 1 | 1 |  |  | 5 | 13 | 1 | 214 |  |
| andy489/Software_Engineering_State_Exam | assets/past exams/2017/2017-09-09/4.pages | `12.2.8` | `M12.2-7035.0.159-2` | 7 |  |  | 257 |  | 2 |  |  | 1 | 1 |  |  | 4 | 68 | 1 | 207 |  |
| SwiftEducation/teaching-app-dev-swift | Level 4/RSSReader/RSSReader Lesson08.pages | `2.0.24` | `M5.6.1-2562-1` | 7 |  | 3 | 3 | 1 | 1 |  |  | 12 | 1 |  |  |  |  | 1 | 40 |  |
| andy489/Software_Engineering_State_Exam | assets/13/13.pages | `12.1.1` | `M12.1-7034.0.86-2` | 7 |  |  | 111 |  | 2 |  |  | 7 | 1 |  |  | 1 |  | 1 | 87 | 8 |
| jamf/JamfSync | User Guide/Jamf Sync User Guide.pages | `14.2.2` | `M14.3-7042.0.76-4` | 7 |  |  | 25 |  | 1 |  |  | 8 | 2 |  |  | 2 |  | 3 | 53 |  |
| andy489/Software_Engineering_State_Exam | assets/past exams/2017/2017-07-11/5.pages | `12.2.8` | `M12.2-7035.0.159-2` | 7 |  |  | 262 |  | 2 |  |  | 1 | 1 |  |  | 4 | 68 | 1 | 213 |  |
| andy489/Linux_Shell | assets/Project/Image editor.pages | `11.1.2` | `M11.1-7031.0.102-2` | 7 |  | 1 | 12 |  | 1 |  |  | 5 | 1 |  |  |  | 3 | 1 | 31 |  |
| andy489/Empirical_Methods_and_Statistics | _asset/_additional/_inter/Math Interview Solutions.pages | `13.1.2` | `M13.1-7037.0.101-2` | 7 |  |  | 206 |  | 2 |  |  | 2 | 1 |  |  | 8 | 9 | 1 | 129 |  |
| pmichaillat/intermediate-macro | problemsets/ps1.pages | `12.2.8` | `M12.2.1-7035.0.161-2` | 6 |  |  |  | 1 | 2 |  |  | 1 | 1 |  |  | 2 |  | 1 | 19 |  |
| abentele/Erbele | Erbele-Manual.pages | `11.2.9` | `M11.2-7032.0.145-2` | 6 | 1 |  | 10 |  |  |  |  | 2 | 1 |  |  |  | 1 | 1 | 28 |  |
| SwiftEducation/teaching-app-dev-swift | Level 1/SpaceAdventure/SpaceAdventure Lesson04.pages | `1.5.0` | `M5.5.3-2152-2` | 6 |  |  | 1 | 1 | 1 |  |  | 7 | 1 |  |  |  |  | 1 | 37 |  |
| huckor/wxwidgets-vscode | doc/win.pages | `13.1.2` | `M13.1-7037.0.101-2` | 6 |  |  | 2 | 1 | 1 |  |  | 2 | 1 |  |  |  |  | 1 | 21 |  |
| andy489/Data_Structures_and_Algorithms | assets/1 – FMI Data Structures & Algorithms/05–week/05–15 Falling leaves.pages | `11.1.2` | `M11.1-7031.0.102-2` | 6 |  |  | 2 |  | 1 |  |  | 2 | 1 |  |  | 1 |  | 1 | 19 |  |
| GothenburgBitFactory/taskwarrior | doc/ref/task-ref.pages | `2.3.4` | `M6.3.1-5249-2` | 6 |  | 1 | 2 |  |  |  |  | 4 | 1 |  |  |  | 29 | 1 | 48 |  |
| andy489/Software_Engineering_State_Exam | assets/past exams/2019/2019-09-10/6.pages | `12.2.8` | `M12.2-7035.0.159-2` | 6 |  |  | 1 |  | 2 |  |  | 1 | 1 |  |  |  | 50 | 1 | 78 |  |
| hollance/krunch | UserGuide.pages | `14.4.1` | `M14.4-7043.0.93-4` | 6 |  | 1 | 1 |  |  |  |  | 3 | 3 |  |  |  |  | 1 | 61 |  |
| andy489/Software_Engineering_State_Exam | assets/past exams/2015/2015-09-10/7.pages | `12.2.8` | `M12.2-7035.0.159-2` | 6 |  |  | 14 |  | 2 |  |  | 1 | 1 |  |  |  | 41 | 1 | 60 |  |
| andy489/Data_Structures_and_Algorithms | assets/1 – FMI Data Structures & Algorithms/02–week/02–08 String arrangement.p | `11.1.2` | `M11.1-7031.0.102-2` | 6 |  |  | 1 |  | 1 |  |  | 1 | 1 |  |  | 1 |  | 1 | 20 |  |
| andy489/Software_Engineering_State_Exam | assets/past exams/2017/2017-07-11/6.pages | `12.2.8` | `M12.2-7035.0.159-2` | 6 |  |  | 12 |  | 2 |  |  | 1 | 1 |  |  |  | 44 | 1 | 63 |  |
| andy489/Data_Structures_and_Algorithms | assets/1 – FMI Data Structures & Algorithms/02–week/02–11 Permutations.pages | `11.1.2` | `M11.1-7031.0.102-2` | 6 |  |  | 1 |  | 1 |  |  | 2 | 1 |  |  | 1 |  | 1 | 19 |  |
| andy489/Software_Engineering_State_Exam | assets/past exams/2017/2017-09-09/5.pages | `12.2.8` | `M12.2-7035.0.159-2` | 6 |  |  | 14 |  | 2 |  |  | 1 | 1 |  |  |  | 46 | 1 | 65 |  |
| andy489/Data_Structures_and_Algorithms | assets/6 – Practice/code forces/1325D Ehab the Xorcist.pages | `11.1.2` | `M11.1-7031.0.102-2` | 6 |  |  | 4 |  | 1 |  |  | 3 | 1 |  |  | 1 |  | 1 | 19 |  |
| andy489/Data_Structures_and_Algorithms | assets/1 – FMI Data Structures & Algorithms/01–week/01–14 First Missing Positi | `11.1.2` | `M11.1-7031.0.102-2` | 6 |  |  | 5 |  | 1 |  |  | 2 | 1 |  |  | 1 |  | 1 | 20 |  |
| andy489/Data_Structures_and_Algorithms | assets/1 – FMI Data Structures & Algorithms/11–week/11–05 Mail Delivery.pages | `11.1.2` | `M11.1-7031.0.102-2` | 6 |  |  | 3 |  | 1 |  |  | 2 | 1 |  |  | 1 |  | 1 | 20 |  |
| andy489/Data_Structures_and_Algorithms | assets/2 – Data Structures/Sparse Table/01 – RMQSQ – Range Minimum Query.pages | `11.1.2` | `M11.1-7031.0.102-2` | 6 |  |  | 4 |  | 1 |  |  | 2 | 1 |  |  | 1 |  | 1 | 19 |  |
| andy489/Data_Structures_and_Algorithms | assets/1 – FMI Data Structures & Algorithms/01–week/01–07 Encoding password.pa | `11.1.2` | `M11.1-7031.0.102-2` | 6 |  |  | 2 |  | 1 |  |  | 2 | 1 |  |  | 1 |  | 1 | 19 |  |
| andy489/Data_Structures_and_Algorithms | assets/1 – FMI Data Structures & Algorithms/06–week/06–10 Online market 1.page | `11.1.2` | `M11.1-7031.0.102-2` | 6 |  |  | 2 |  | 1 |  |  | 2 | 1 |  |  | 1 |  | 1 | 19 |  |
| andy489/Data_Structures_and_Algorithms | assets/3 – Algorithms/Recursion and Backtracking/Combine Sum.pages | `11.1.2` | `M11.1-7031.0.102-2` | 6 |  |  | 2 |  | 1 |  |  | 1 | 1 |  |  | 1 |  | 1 | 21 |  |
| andy489/Data_Structures_and_Algorithms | assets/1 – FMI Data Structures & Algorithms/04–week/04–21 Hikers.pages | `11.1.2` | `M11.1-7031.0.102-2` | 6 |  |  | 2 |  | 1 |  |  | 1 | 1 |  |  | 1 |  | 1 | 19 |  |
| Tensegritics/ClojureDart | doc/ClojureDart Cheatsheet.pages | `12.2.8` | `M12.2.1-7035.0.161-2` | 6 |  | 2 | 2 |  |  |  |  |  | 1 |  |  | 1 | 2 | 1 | 29 |  |
| andrejHurynovic/bsuirLabs | term6/СА/СА, ЛР № 2/СА, ЛР № 2.pages | `11.2.9` | `M11.2-7032.0.145-2` | 6 |  |  | 9 |  | 1 |  |  |  | 1 |  |  | 15 | 4 | 1 | 99 |  |
| andy489/Software_Engineering_State_Exam | assets/past exams/2015/2015-09-10/5.pages | `12.2.8` | `M12.2-7035.0.159-2` | 6 |  |  | 1 |  | 2 |  |  | 1 | 1 |  |  |  | 1 | 1 | 22 |  |
| andy489/Data_Structures_and_Algorithms | assets/1 – FMI Data Structures & Algorithms/05–week/05–22 Tree–specific–print. | `11.1.2` | `M11.1-7031.0.102-2` | 6 |  |  | 4 |  | 1 |  |  | 2 | 1 |  |  | 1 |  | 1 | 19 |  |
| andy489/Data_Structures_and_Algorithms | assets/1 – FMI Data Structures & Algorithms/02–week/02–19 Constrol test 01.pag | `11.1.2` | `M11.1-7031.0.102-2` | 6 |  |  | 5 |  | 1 |  |  | 1 | 1 |  |  | 1 |  | 1 | 19 |  |
| andy489/Data_Structures_and_Algorithms | assets/1 – FMI Data Structures & Algorithms/01–week/01–04 Palindromic permutat | `11.1.2` | `M11.1-7031.0.102-2` | 6 |  |  | 3 |  | 1 |  |  | 2 | 1 |  |  | 1 |  | 1 | 19 |  |
| andy489/Software_Engineering_State_Exam | assets/past exams/2021/2021-07-13/2.pages | `12.2.8` | `M12.2-7035.0.159-2` | 6 |  |  | 1 |  | 2 |  |  | 1 | 1 |  |  | 1 |  | 1 | 49 |  |
| andy489/Data_Structures_and_Algorithms | assets/1 – FMI Data Structures & Algorithms/01–week/01–02 Substring permutatio | `11.1.2` | `M11.1-7031.0.102-2` | 6 |  |  | 6 |  | 1 |  |  | 1 | 1 |  |  | 1 |  | 1 | 19 |  |
| andy489/Data_Structures_and_Algorithms | assets/1 – FMI Data Structures & Algorithms/01–week/01–10 Cloning socks.pages | `11.1.2` | `M11.1-7031.0.102-2` | 6 |  |  | 2 |  | 1 |  |  | 2 | 1 |  |  | 1 |  | 1 | 19 |  |
| andy489/Software_Engineering_State_Exam | assets/past exams/2016/2016-09-09/7.pages | `12.2.8` | `M12.2-7035.0.159-2` | 6 |  |  | 15 |  | 2 |  |  | 1 | 1 |  |  |  | 52 | 1 | 71 |  |
| andy489/Software_Engineering_State_Exam | assets/past exams/2019/2019-07-09/6.pages | `12.2.8` | `M12.2-7035.0.159-2` | 6 |  |  | 19 |  | 2 |  |  | 1 | 1 |  |  |  | 56 | 1 | 76 |  |
| andy489/Data_Structures_and_Algorithms | assets/1 – FMI Data Structures & Algorithms/07–week/07–07 Commandos.pages | `11.1.2` | `M11.1-7031.0.102-2` | 6 |  |  | 3 |  | 1 |  |  | 2 | 1 |  |  | 1 |  | 1 | 19 |  |
| andy489/Data_Structures_and_Algorithms | assets/1 – FMI Data Structures & Algorithms/02–week/02–18 Visualise sorting by | `11.1.2` | `M11.1-7031.0.102-2` | 6 |  |  | 4 |  | 1 |  |  | 1 | 1 |  |  | 1 |  | 1 | 20 |  |
| andy489/Software_Engineering_State_Exam | assets/past exams/2018/2018-09-10/7.pages | `12.2.8` | `M12.2-7035.0.159-2` | 6 |  |  | 22 |  | 2 |  |  | 1 | 1 |  |  |  | 68 | 1 | 88 |  |
| andy489/Software_Engineering_State_Exam | assets/past exams/2021/2021-09-08/3.pages | `12.2.8` | `M12.2.1-7035.0.161-2` | 6 |  |  | 1 |  | 2 |  |  | 1 | 1 |  |  | 1 |  | 1 | 37 |  |
| andy489/Data_Structures_and_Algorithms | assets/3 – Algorithms/Lowest common ancestor (LCA)/DISQUERY –Distance Query.pa | `11.1.2` | `M11.1-7031.0.102-2` | 6 |  |  | 4 |  | 1 |  |  | 2 | 1 |  |  | 1 |  | 1 | 19 |  |
| andy489/Software_Engineering_State_Exam | assets/past exams/2010/2010-07-15/5.pages | `12.2.8` | `M12.2-7035.0.159-2` | 6 |  |  | 1 |  | 2 |  |  | 1 | 1 |  |  |  | 56 | 1 | 88 |  |
| andy489/Data_Structures_and_Algorithms | assets/6 – Practice/code forces/0522A Reports.pages | `11.1.2` | `M11.1-7031.0.102-2` | 6 |  |  | 2 |  | 1 |  |  | 2 | 1 |  |  | 1 |  | 1 | 22 |  |
| andy489/Software_Engineering_State_Exam | assets/past exams/2016/2016-07-12/7.pages | `12.2.8` | `M12.2-7035.0.159-2` | 6 |  |  | 20 |  | 2 |  |  | 1 | 1 |  |  |  | 60 | 1 | 79 |  |
| andy489/Software_Engineering_State_Exam | assets/22/22.pages | `12.1.1` | `M12.1-7034.0.86-2` | 6 |  |  |  |  | 3 |  |  | 1 | 1 |  |  |  | 103 | 1 | 243 | 22 |
| andy489/Data_Structures_and_Algorithms | assets/1 – FMI Data Structures & Algorithms/07–week/07–06 Bonus – Text content | `11.1.2` | `M11.1-7031.0.102-2` | 6 |  |  | 2 |  | 1 |  |  | 2 | 1 |  |  | 1 |  | 1 | 19 |  |
| andy489/Software_Engineering_State_Exam | assets/19/19.pages | `12.2.8` | `M12.2.1-7035.0.161-2` | 6 |  |  |  |  | 3 |  |  | 1 | 1 |  |  |  | 29 | 1 | 246 | 42 |
| VueFileManager/vuefilemanager | storage/demo/documents/Stories of the Night Skies.pages | `4.2.3` | `M8.2.1-6529-2` | 6 |  | 2 | 2 |  |  |  |  |  | 6 |  |  |  | 4 | 1 | 113 |  |
| pmichaillat/intermediate-macro | problemsets/ps3.pages | `12.2.8` | `M12.2.1-7035.0.161-2` | 6 |  |  | 1 | 1 | 2 |  |  | 1 | 1 |  |  |  |  | 1 | 21 |  |
| andy489/Data_Structures_and_Algorithms | assets/1 – FMI Data Structures & Algorithms/07–week/07–02 Administration.pages | `11.1.2` | `M11.1-7031.0.102-2` | 6 |  |  | 4 |  | 1 |  |  | 2 | 1 |  |  | 1 |  | 1 | 19 |  |
| andy489/Data_Structures_and_Algorithms | assets/1 – FMI Data Structures & Algorithms/02–week/02–16 The jeweller's probl | `11.1.2` | `M11.1-7031.0.102-2` | 6 |  |  | 5 |  | 1 |  |  | 1 | 1 |  |  | 1 |  | 1 | 19 |  |
| andy489/Data_Structures_and_Algorithms | assets/6 – Practice/code forces/1057A Bmail Computer Network.pages | `11.1.2` | `M11.1-7031.0.102-2` | 6 |  |  | 11 |  | 1 |  |  | 2 | 1 |  |  | 1 |  | 1 | 19 |  |
| andy489/Data_Structures_and_Algorithms | assets/1 – FMI Data Structures & Algorithms/04–week/04–03 Linked list min–max– | `11.1.2` | `M11.1-7031.0.102-2` | 6 |  |  | 6 |  | 1 |  |  | 1 | 1 |  |  | 1 |  | 1 | 19 |  |
| andy489/Data_Structures_and_Algorithms | assets/1 – FMI Data Structures & Algorithms/06–week/06–07 Elitism.pages | `11.1.2` | `M11.1-7031.0.102-2` | 6 |  |  | 2 |  | 1 |  |  | 3 | 1 |  |  | 1 |  | 1 | 19 |  |
| andy489/Data_Structures_and_Algorithms | assets/1 – FMI Data Structures & Algorithms/02–week/02–17 Visualise sorting by | `11.1.2` | `M11.1-7031.0.102-2` | 6 |  |  | 6 |  | 1 |  |  | 1 | 1 |  |  | 1 |  | 1 | 19 |  |
| andy489/Data_Structures_and_Algorithms | assets/6 – Practice/code forces/1325E Ehab's REAL Number Theory Problem.pages | `11.1.2` | `M11.1-7031.0.102-2` | 6 |  |  | 10 |  | 1 |  |  | 2 | 1 |  |  | 1 |  | 1 | 19 |  |
| andy489/Data_Structures_and_Algorithms | assets/2 – Data Structures/Sparse Table/03 – THRBL – Catapult that ball.pages | `11.1.2` | `M11.1-7031.0.102-2` | 6 |  |  | 8 |  | 1 |  |  | 2 | 1 |  |  | 1 |  | 1 | 19 |  |
| andy489/Data_Structures_and_Algorithms | assets/1 – FMI Data Structures & Algorithms/07–week/07–01 567D One-Dimensional | `11.1.2` | `M11.1-7031.0.102-2` | 6 |  |  | 2 |  | 1 |  |  | 2 | 1 |  |  | 3 |  | 1 | 25 |  |
| andy489/Software_Engineering_State_Exam | assets/past exams/2014/2014-07-15/2.pages | `12.1.1` | `M12.1-7034.0.86-2` | 6 |  |  | 1 |  | 2 |  |  | 1 | 1 |  |  |  | 4 | 1 | 27 |  |
| andy489/Software_Engineering_State_Exam | assets/past exams/2018/2018-07-13/7.pages | `12.2.8` | `M12.2-7035.0.159-2` | 6 |  |  | 25 |  | 2 |  |  | 1 | 1 |  |  |  | 81 | 1 | 101 |  |
| andy489/Data_Structures_and_Algorithms | assets/1 – FMI Data Structures & Algorithms/06–week/06–06 Attacking vigorously | `11.1.2` | `M11.1-7031.0.102-2` | 6 |  |  | 2 |  | 1 |  |  | 2 | 1 |  |  | 1 |  | 1 | 21 |  |
| andy489/Data_Structures_and_Algorithms | assets/1 – FMI Data Structures & Algorithms/02–week/02–15 Quick select.pages | `11.1.2` | `M11.1-7031.0.102-2` | 6 |  |  | 7 |  | 1 |  |  | 1 | 1 |  |  | 1 |  | 1 | 19 |  |
| andy489/Software_Engineering_State_Exam | assets/20/20.pages | `12.1.1` | `M12.1-7034.0.86-2` | 6 |  |  |  |  | 3 |  |  | 1 | 1 |  |  |  | 40 | 1 | 126 | 15 |
| andy489/Data_Structures_and_Algorithms | assets/1 – FMI Data Structures & Algorithms/06–week/06–11 Online market 2.page | `11.1.2` | `M11.1-7031.0.102-2` | 6 |  |  | 6 |  | 1 |  |  | 2 | 1 |  |  | 1 |  | 1 | 19 |  |
| nerds-odd-e/doughnut | e2e_test/fixtures/book_reading/refactoring.pages | `14.4.1` | `M14.4-7043.0.93-4` | 6 |  |  | 1 |  | 1 | 1 |  |  | 1 |  |  | 1 |  | 1 | 20 |  |
| andy489/Data_Structures_and_Algorithms | assets/6 – Practice/code forces/1325B CopyCopyCopyCopyCopy.pages | `11.1.2` | `M11.1-7031.0.102-2` | 6 |  |  | 11 |  | 1 |  |  | 2 | 1 |  |  | 1 |  | 1 | 19 |  |
| andy489/Data_Structures_and_Algorithms | assets/1 – FMI Data Structures & Algorithms/05–week/05–07 Student's queue.page | `11.1.2` | `M11.1-7031.0.102-2` | 6 |  |  | 2 |  | 1 |  |  | 2 | 1 |  |  | 1 |  | 1 | 19 |  |
| andy489/Data_Structures_and_Algorithms | assets/1 – FMI Data Structures & Algorithms/02–week/02–06 Couples password.pag | `11.1.2` | `M11.1-7031.0.102-2` | 6 |  |  | 4 |  | 1 |  |  | 1 | 1 |  |  | 1 |  | 1 | 19 |  |
| andy489/Data_Structures_and_Algorithms | assets/3 – Algorithms/Recursion and Backtracking/Mixed Words.pages | `11.1.2` | `M11.1-7031.0.102-2` | 6 |  |  | 3 |  | 1 |  |  | 1 | 1 |  |  | 1 |  | 1 | 26 |  |
| andy489/Data_Structures_and_Algorithms | assets/1 – FMI Data Structures & Algorithms/01–week/01–05 Super reduced string | `11.1.2` | `M11.1-7031.0.102-2` | 6 |  |  | 4 |  | 1 |  |  | 2 | 1 |  |  | 1 |  | 1 | 19 |  |
| andy489/Software_Engineering_State_Exam | assets/03/Determinization of finite automaton with e-transitions.pages | `12.2.8` | `M12.2-7035.0.159-2` | 6 |  |  | 20 |  | 2 |  |  | 1 | 1 |  |  |  | 12 | 1 | 31 |  |
| andrejHurynovic/bsuirLabs | term6/СА/СА, ЛР № 4/СА, ЛР № 4.pages | `12.0.8` | `M12.0-7033.0.134-2` | 6 |  |  | 10 |  | 1 |  |  |  | 1 |  |  | 9 | 4 | 1 | 39 |  |
| andy489/Data_Structures_and_Algorithms | assets/6 – Practice/code forces/0862B Mahmoud and Ehab and the bipartiteness.p | `11.1.2` | `M11.1-7031.0.102-2` | 6 |  |  | 6 |  | 1 |  |  | 4 | 1 |  |  | 1 |  | 1 | 19 |  |
| andy489/Software_Engineering_State_Exam | assets/21/21.pages | `12.2.8` | `M12.2.1-7035.0.161-2` | 6 |  |  | 1 |  | 3 |  |  | 1 | 1 |  |  |  |  | 1 | 91 | 15 |
| andy489/Data_Structures_and_Algorithms | assets/1 – FMI Data Structures & Algorithms/07–week/07–08 Schedules.pages | `11.1.2` | `M11.1-7031.0.102-2` | 6 |  |  | 6 |  | 1 |  |  | 2 | 1 |  |  | 1 |  | 1 | 19 |  |
| andy489/Data_Structures_and_Algorithms | assets/6 – Practice/code forces/0115A Party.pages | `11.1.2` | `M11.1-7031.0.102-2` | 6 |  |  | 11 |  | 1 |  |  | 2 | 1 |  |  | 1 |  | 1 | 24 |  |
| andy489/Data_Structures_and_Algorithms | assets/1 – FMI Data Structures & Algorithms/03–week/03–02 Searching for index. | `11.1.2` | `M11.1-7031.0.102-2` | 6 |  |  | 4 |  | 1 |  |  | 2 | 1 |  |  | 1 |  | 1 | 19 |  |
| andy489/Data_Structures_and_Algorithms | assets/1 – FMI Data Structures & Algorithms/05–week/05–24 Penultimate descenda | `11.1.2` | `M11.1-7031.0.102-2` | 6 |  |  | 6 |  | 1 |  |  | 2 | 1 |  |  | 1 |  | 1 | 19 |  |
| andy489/Data_Structures_and_Algorithms | assets/3 – Algorithms/Dynamic programming/Minimum Cost to Cut a Stick.pages | `11.1.2` | `M11.1-7031.0.102-2` | 6 |  |  | 8 |  | 1 |  |  | 1 | 1 |  |  |  | 141 | 1 | 161 |  |
| andy489/Data_Structures_and_Algorithms | assets/6 – Practice/code forces/1325A Ehab and GCD.pages | `11.1.2` | `M11.1-7031.0.102-2` | 6 |  |  | 14 |  | 1 |  |  | 2 | 1 |  |  | 1 |  | 1 | 19 |  |
| andy489/Data_Structures_and_Algorithms | assets/1 – FMI Data Structures & Algorithms/05–week/05–23 Print–specific–level | `11.1.2` | `M11.1-7031.0.102-2` | 6 |  |  | 7 |  | 1 |  |  | 2 | 1 |  |  | 1 |  | 1 | 19 |  |
| andy489/Software_Engineering_State_Exam | assets/past exams/2016/2016-07-12/3.pages | `12.2.8` | `M12.2.1-7035.0.161-2` | 6 |  |  | 48 |  | 2 |  |  | 1 | 1 |  |  | 2 |  | 1 | 50 |  |
| andy489/Data_Structures_and_Algorithms | assets/1 – FMI Data Structures & Algorithms/14–2019–01–27–exam/04 Cycle detect | `11.1.2` | `M11.1-7031.0.102-2` | 6 |  |  | 10 |  | 1 |  |  | 2 | 1 |  |  | 1 |  | 1 | 19 |  |
| andy489/Data_Structures_and_Algorithms | assets/6 – Practice/code forces/0839C Journey.pages | `11.1.2` | `M11.1-7031.0.102-2` | 6 |  |  | 11 |  | 1 |  |  | 3 | 1 |  |  | 1 |  | 1 | 19 |  |
| andy489/Data_Structures_and_Algorithms | assets/1 – FMI Data Structures & Algorithms/09–week/09–03 Christmas decoration | `11.1.2` | `M11.1-7031.0.102-2` | 6 |  |  | 9 |  | 1 |  |  | 2 | 1 |  |  | 1 |  | 1 | 19 |  |
| andy489/Data_Structures_and_Algorithms | assets/1 – FMI Data Structures & Algorithms/01–week/01–09 Water supplies.pages | `11.1.2` | `M11.1-7031.0.102-2` | 6 |  |  | 7 |  | 1 |  |  | 2 | 1 |  |  | 1 |  | 1 | 19 |  |
| andy489/Data_Structures_and_Algorithms | assets/6 – Practice/code forces/1325E Ehab's REAL Number Theory Problem Explai | `11.1.2` | `M11.1-7031.0.102-2` | 6 |  |  | 10 |  | 1 |  |  | 2 | 1 |  |  | 1 |  | 1 | 23 |  |
| andy489/Data_Structures_and_Algorithms | assets/1 – FMI Data Structures & Algorithms/05–week/05–04 Magic numbers.pages | `11.1.2` | `M11.1-7031.0.102-2` | 6 |  |  | 10 |  | 1 |  |  | 2 | 1 |  |  | 1 |  | 1 | 19 |  |
| andy489/Software_Engineering_State_Exam | assets/past exams/2021/2021-09-08/5.pages | `12.2.8` | `M12.2-7035.0.159-2` | 6 |  |  | 2 |  | 2 |  |  | 1 | 1 |  |  |  | 3 | 1 | 22 |  |
| andy489/Data_Structures_and_Algorithms | assets/5 – DAA/Starcraft 2.pages | `11.1.2` | `M11.1-7031.0.102-2` | 6 |  |  | 4 |  | 1 |  |  | 2 | 1 |  |  | 1 |  | 1 | 19 |  |
| andy489/Data_Structures_and_Algorithms | assets/1 – FMI Data Structures & Algorithms/04–week/04–10 Delete a node.pages | `11.1.2` | `M11.1-7031.0.102-2` | 6 |  |  | 7 |  | 1 |  |  | 3 | 1 |  |  | 1 |  | 1 | 19 |  |
| andy489/Data_Structures_and_Algorithms | assets/1 – FMI Data Structures & Algorithms/02–week/02–23 Pair sum.pages | `11.1.2` | `M11.1-7031.0.102-2` | 6 |  |  | 9 |  | 1 |  |  | 1 | 1 |  |  | 1 |  | 1 | 19 |  |
| andy489/Data_Structures_and_Algorithms | assets/1 – FMI Data Structures & Algorithms/07–week/07–05 File system.pages | `11.1.2` | `M11.1-7031.0.102-2` | 6 |  |  | 2 |  | 1 |  |  | 2 | 1 |  |  | 1 |  | 1 | 21 |  |
| andy489/Data_Structures_and_Algorithms | assets/1 – FMI Data Structures & Algorithms/08–week/08–13 Egyptin Fractions.pa | `11.1.2` | `M11.1-7031.0.102-2` | 6 |  |  | 12 |  | 1 |  |  | 1 | 1 |  |  | 1 |  | 1 | 19 |  |
| andy489/Data_Structures_and_Algorithms | assets/1 – FMI Data Structures & Algorithms/02–week/02–10 Software regulation. | `11.1.2` | `M11.1-7031.0.102-2` | 6 |  |  | 7 |  | 1 |  |  | 1 | 1 |  |  | 2 |  | 1 | 19 |  |
| andy489/Data_Structures_and_Algorithms | assets/6 – Practice/code forces/0429A Xor–tree.pages | `11.1.2` | `M11.1-7031.0.102-2` | 6 |  |  | 22 |  | 1 |  |  | 2 | 1 |  |  | 1 |  | 1 | 21 |  |
| andy489/Data_Structures_and_Algorithms | assets/1 – FMI Data Structures & Algorithms/03–week/03–07 Cows.pages | `11.1.2` | `M11.1-7031.0.102-2` | 6 |  |  | 9 |  | 1 |  |  | 2 | 1 |  |  | 1 |  | 1 | 19 |  |
| andy489/Data_Structures_and_Algorithms | assets/1 – FMI Data Structures & Algorithms/08–week/08–11 Toll tax.pages | `11.1.2` | `M11.1-7031.0.102-2` | 6 |  |  | 11 |  | 1 |  |  | 2 | 1 |  |  | 1 |  | 1 | 21 |  |
| andy489/Data_Structures_and_Algorithms | assets/1 – FMI Data Structures & Algorithms/04–week/04–06 Pistols.pages | `11.1.2` | `M11.1-7031.0.102-2` | 6 |  |  | 10 |  | 1 |  |  | 2 | 1 |  |  | 1 |  | 1 | 19 |  |
| andy489/Software_Engineering_State_Exam | assets/past exams/2021/2021-07-13/5.pages | `12.2.8` | `M12.2-7035.0.159-2` | 6 |  |  | 27 |  | 2 |  |  | 1 | 1 |  |  |  | 61 | 1 | 82 |  |
| andy489/Data_Structures_and_Algorithms | assets/1 – FMI Data Structures & Algorithms/06–week/06–08 Closest apartments.p | `11.1.2` | `M11.1-7031.0.102-2` | 6 |  |  | 4 |  | 1 |  |  | 3 | 1 |  |  | 1 |  | 1 | 19 |  |
| andy489/Data_Structures_and_Algorithms | assets/1 – FMI Data Structures & Algorithms/02–week/02–14 Events.pages | `11.1.2` | `M11.1-7031.0.102-2` | 6 |  |  | 7 |  | 1 |  |  | 2 | 1 |  |  | 1 |  | 1 | 19 |  |
| andy489/Data_Structures_and_Algorithms | assets/1 – FMI Data Structures & Algorithms/15–2020–01–24-exam/03 Counting are | `11.1.2` | `M11.1-7031.0.102-2` | 6 |  |  | 11 |  | 1 |  |  | 2 | 1 |  |  | 1 |  | 1 | 21 |  |
| andy489/Data_Structures_and_Algorithms | assets/6 – Practice/code forces/0755C PolandBall and Forest.pages | `11.1.2` | `M11.1-7031.0.102-2` | 6 |  |  | 19 |  | 1 |  |  | 2 | 1 |  |  | 1 |  | 1 | 20 |  |
| andy489/Data_Structures_and_Algorithms | assets/1 – FMI Data Structures & Algorithms/15–2020–01–24-exam/02 Find element | `11.1.2` | `M11.1-7031.0.102-2` | 6 |  |  | 6 |  | 1 |  |  | 2 | 1 |  |  | 1 |  | 1 | 33 |  |
| andy489/Data_Structures_and_Algorithms | assets/1 – FMI Data Structures & Algorithms/02–week/02–09 Scrooge's gift.pages | `11.1.2` | `M11.1-7031.0.102-2` | 6 |  |  | 12 |  | 1 |  |  | 1 | 1 |  |  | 1 |  | 1 | 19 |  |
| huckor/wxwidgets-vscode | doc/mac.pages | `13.1.2` | `M13.1-7037.0.101-2` | 6 |  |  | 2 | 1 | 1 |  |  | 3 | 1 |  |  |  |  | 1 | 23 |  |
| andy489/Data_Structures_and_Algorithms | assets/1 – FMI Data Structures & Algorithms/01–week/01–11 Darts 501.pages | `11.1.2` | `M11.1-7031.0.102-2` | 6 |  |  | 2 |  | 1 |  |  | 3 | 1 |  |  | 1 |  | 1 | 20 |  |
| andy489/Data_Structures_and_Algorithms | assets/1 – FMI Data Structures & Algorithms/12–week/12–03 SUBMERGE - Submergin | `11.1.2` | `M11.1-7031.0.102-2` | 6 |  |  | 10 |  | 1 |  |  | 2 | 1 |  |  | 1 |  | 1 | 19 |  |
| andyRon/LearniOSByProject | P075-QuickLookDemo/QuickLookDemo/AppCoda-Pages.pages | `2.0.24` | `M5.6.1-2562-1` | 6 |  | 1 | 1 |  | 1 |  |  | 3 | 1 |  |  |  |  | 1 | 26 |  |
| andy489/Data_Structures_and_Algorithms | assets/1 – FMI Data Structures & Algorithms/04–week/04–11 Merge two sorted lin | `11.1.2` | `M11.1-7031.0.102-2` | 6 |  |  | 8 |  | 1 |  |  | 3 | 1 |  |  | 1 |  | 1 | 19 |  |
| andy489/Data_Structures_and_Algorithms | assets/1 – FMI Data Structures & Algorithms/01–week/01–08 SDA mission.pages | `11.1.2` | `M11.1-7031.0.102-2` | 6 |  |  | 7 |  | 1 |  |  | 2 | 1 |  |  | 1 |  | 1 | 19 |  |
| andy489/Data_Structures_and_Algorithms | assets/1 – FMI Data Structures & Algorithms/03–week/03–04 Building alignment.p | `11.1.2` | `M11.1-7031.0.102-2` | 6 |  |  | 12 |  | 1 |  |  | 2 | 1 |  |  | 1 |  | 1 | 19 |  |
| andy489/Data_Structures_and_Algorithms | assets/1 – FMI Data Structures & Algorithms/04–week/04–16 Welcome to the jungl | `11.1.2` | `M11.1-7031.0.102-2` | 6 |  |  | 9 |  | 1 |  |  | 2 | 1 |  |  | 1 |  | 1 | 19 |  |
| OpenKneeboard/OpenKneeboard | docs/Quick Start.pages | `14.2.2` | `M14.2-7041.0.109-4` | 6 |  |  | 1 |  |  |  |  | 11 | 1 |  |  | 1 | 2 | 1 | 27 |  |
| andy489/Data_Structures_and_Algorithms | assets/1 – FMI Data Structures & Algorithms/02–week/02–25 Office printers.page | `11.1.2` | `M11.1-7031.0.102-2` | 6 |  |  | 12 |  | 1 |  |  | 1 | 1 |  |  | 1 |  | 1 | 19 |  |
| andy489/Software_Engineering_State_Exam | assets/past exams/2015/2015-09-10/3.pages | `12.1.1` | `M12.1-7034.0.86-2` | 6 |  |  | 35 |  | 2 |  |  | 1 | 1 |  |  |  | 76 | 1 | 97 |  |
| andy489/Data_Structures_and_Algorithms | assets/2 – Data Structures/Sparse Table/07 – D. R2D2 and Droid Army.pages | `11.1.2` | `M11.1-7031.0.102-2` | 6 |  |  | 16 |  | 1 |  |  | 2 | 1 |  |  | 1 |  | 1 | 19 |  |
| andy489/Data_Structures_and_Algorithms | assets/1 – FMI Data Structures & Algorithms/04–week/04–04 List pairs.pages | `11.1.2` | `M11.1-7031.0.102-2` | 6 |  |  | 14 |  | 1 |  |  | 2 | 1 |  |  | 1 |  | 1 | 19 |  |
| andy489/Data_Structures_and_Algorithms | assets/1 – FMI Data Structures & Algorithms/03–week/03–01 Chocolate chip cooki | `11.1.2` | `M11.1-7031.0.102-2` | 6 |  |  | 13 |  | 1 |  |  | 2 | 1 |  |  | 1 |  | 1 | 19 |  |
| andy489/Data_Structures_and_Algorithms | assets/1 – FMI Data Structures & Algorithms/07–week/07–03 Autocomplete suggest | `11.1.2` | `M11.1-7031.0.102-2` | 6 |  |  | 7 |  | 1 |  |  | 2 | 1 |  |  | 1 |  | 1 | 19 |  |
| andy489/Data_Structures_and_Algorithms | assets/2 – Data Structures/Sparse Table/04 – Matchsticks.pages | `11.1.2` | `M11.1-7031.0.102-2` | 6 |  |  | 12 |  | 1 |  |  | 2 | 1 |  |  | 1 |  | 1 | 19 |  |
| andy489/Data_Structures_and_Algorithms | assets/1 – FMI Data Structures & Algorithms/01–week/01–01 Store discount.pages | `11.1.2` | `M11.1-7031.0.102-2` | 6 |  |  | 12 |  | 1 |  |  | 1 | 1 |  |  | 1 |  | 1 | 21 |  |
| andy489/Data_Structures_and_Algorithms | assets/1 – FMI Data Structures & Algorithms/04–week/04–15 Truck ordering.pages | `11.1.2` | `M11.1-7031.0.102-2` | 6 |  |  | 16 |  | 1 |  |  | 2 | 1 |  |  | 1 |  | 1 | 19 |  |
| andy489/Data_Structures_and_Algorithms | assets/1 – FMI Data Structures & Algorithms/03–week/03–09 Monster trucks.pages | `11.1.2` | `M11.1-7031.0.102-2` | 6 |  |  | 11 |  | 1 |  |  | 2 | 1 |  |  | 1 |  | 1 | 22 |  |
| andy489/Data_Structures_and_Algorithms | assets/1 – FMI Data Structures & Algorithms/01–week/01–03 Pipi's socks.pages | `11.1.2` | `M11.1-7031.0.102-2` | 6 |  |  | 13 |  | 1 |  |  | 1 | 1 |  |  | 1 |  | 1 | 19 |  |
| andy489/Data_Structures_and_Algorithms | assets/1 – FMI Data Structures & Algorithms/02–week/02–13 Electrical energy.pa | `11.1.2` | `M11.1-7031.0.102-2` | 6 |  |  | 11 |  | 1 |  |  | 2 | 1 |  |  | 1 |  | 1 | 19 |  |
| andy489/Data_Structures_and_Algorithms | assets/1 – FMI Data Structures & Algorithms/02–week/02–21 Pairs.pages | `11.1.2` | `M11.1-7031.0.102-2` | 6 |  |  | 14 |  | 1 |  |  | 2 | 1 |  |  | 1 |  | 1 | 19 |  |
| andy489/Data_Structures_and_Algorithms | assets/6 – Practice/code forces/0886C Petya and Catacombs.pages | `11.1.2` | `M11.1-7031.0.102-2` | 6 |  |  | 22 |  | 1 |  |  | 2 | 1 |  |  | 1 |  | 1 | 21 |  |
| andy489/Data_Structures_and_Algorithms | assets/2 – Data Structures/Sparse Table/09 – TNVFC1M – Miraculous.pages | `11.1.2` | `M11.1-7031.0.102-2` | 6 |  |  | 14 |  | 1 |  |  | 2 | 1 |  |  | 1 |  | 1 | 19 |  |
| andy489/Data_Structures_and_Algorithms | assets/1 – FMI Data Structures & Algorithms/04–week/04–17 Optimal teams.pages | `11.1.2` | `M11.1-7031.0.102-2` | 6 |  |  | 19 |  | 1 |  |  | 2 | 1 |  |  | 1 |  | 1 | 19 |  |
| ynagatomo/evolution-Metal-ARKit-RealityKit-sheet | files/List_of_ShaderGraph_Nodes_in_visionOS2_Nov2024.pages | `14.2.2` | `M14.2-7041.0.109-4` | 6 |  |  | 1 |  | 2 |  |  | 3 | 1 |  |  | 2 |  | 1 | 22 |  |
| andy489/Data_Structures_and_Algorithms | assets/1 – FMI Data Structures & Algorithms/02–week/02–07 Shoe shopping.pages | `11.1.2` | `M11.1-7031.0.102-2` | 6 |  |  | 12 |  | 1 |  |  | 2 | 1 |  |  | 1 |  | 1 | 19 |  |
| andy489/Data_Structures_and_Algorithms | assets/2 – Data Structures/Sparse Table/00 – Sparse Table RMQ overview.pages | `11.1.2` | `M11.1-7031.0.102-2` | 6 |  |  | 11 |  | 1 |  |  | 1 | 1 |  |  | 3 |  | 1 | 19 |  |
| andy489/Data_Structures_and_Algorithms | assets/1 – FMI Data Structures & Algorithms/12–week/12–05 E. Bertown roads.pag | `11.1.2` | `M11.1-7031.0.102-2` | 6 |  |  | 15 |  | 1 |  |  | 2 | 1 |  |  | 1 |  | 1 | 22 |  |
| andy489/Data_Structures_and_Algorithms | assets/1 – FMI Data Structures & Algorithms/05–week/05–02 Lilly's stone path.p | `11.1.2` | `M11.1-7031.0.102-2` | 6 |  |  | 20 |  | 1 |  |  | 2 | 1 |  |  | 1 |  | 1 | 19 |  |
| andy489/Software_Engineering_State_Exam | assets/past exams/2020/2020-08-05/5.pages | `12.2.8` | `M12.2-7035.0.159-2` | 6 |  |  | 22 |  | 2 |  |  | 1 | 1 |  |  |  | 63 | 1 | 82 |  |
| andy489/Data_Structures_and_Algorithms | assets/1 – FMI Data Structures & Algorithms/05–week/05–01 Josephus problem.pag | `11.1.2` | `M11.1-7031.0.102-2` | 6 |  |  | 16 |  | 1 |  |  | 2 | 1 |  |  | 3 |  | 1 | 19 |  |
| andy489/Data_Structures_and_Algorithms | assets/1 – FMI Data Structures & Algorithms/04–week/04–09 Node at pos.pages | `11.1.2` | `M11.1-7031.0.102-2` | 6 |  |  | 12 |  | 1 |  |  | 2 | 1 |  |  | 1 |  | 1 | 19 |  |
| PostHog/posthog.com | contents/images/templates/employee_offer_letter.pages | `3.2.13` | `M7.3-5989-2` | 6 |  |  |  |  | 2 |  |  |  | 2 |  |  |  | 4 | 1 | 43 |  |
| PostHog/posthog.com | static/wp-content/uploads/2020/templates/employee_offer_letter.pages | `3.2.13` | `M7.3-5989-2` | 6 |  |  |  |  | 2 |  |  |  | 2 |  |  |  | 4 | 1 | 43 |  |
| f-zyj/ACM | ACM 模版-f_zyj 更新至 v 2.1/v 2.1/ACM模板-f_zyj v 2.1.pages | `2.3.4` | `M6.3-5046-3` | 6 |  |  | 8 |  | 4 |  |  | 1 | 3 |  |  |  |  | 19 | 379 |  |
| andy489/Software_Engineering_State_Exam | assets/09/ER Diagrams.pages | `12.1.1` | `M12.1-7034.0.86-2` | 6 |  |  | 3 |  | 2 |  |  | 1 | 1 |  |  | 1 |  | 1 | 41 |  |
| AlexHarker/HISSTools_Granular | manual/HISSTools_Granular_User_Guide.pages | `12.1.1` | `M12.1-7034.0.86-2` | 6 |  |  | 1 |  | 1 |  |  | 3 | 1 |  |  | 1 |  | 3 | 30 |  |
| andy489/Data_Structures_and_Algorithms | assets/1 – FMI Data Structures & Algorithms/04–week/04–12 Reverse linked list. | `11.1.2` | `M11.1-7031.0.102-2` | 6 |  |  | 18 |  | 1 |  |  | 3 | 1 |  |  | 1 |  | 1 | 20 |  |
| andy489/Data_Structures_and_Algorithms | assets/1 – FMI Data Structures & Algorithms/12–week/12–07 E. Cactus explained. | `11.1.2` | `M11.1-7031.0.102-2` | 6 |  |  | 24 |  | 1 |  |  | 3 | 1 |  |  |  | 26 | 1 | 45 |  |
| andy489/Data_Structures_and_Algorithms | assets/1 – FMI Data Structures & Algorithms/03–week/03–03 Drying clothes.pages | `11.1.2` | `M11.1-7031.0.102-2` | 6 |  |  | 16 |  | 1 |  |  | 2 | 1 |  |  | 1 |  | 1 | 19 |  |
| andy489/Data_Structures_and_Algorithms | assets/2 – Data Structures/Sparse Table/02 – RPLN – Negative Score.pages | `11.1.2` | `M11.1-7031.0.102-2` | 6 |  |  | 28 |  | 1 |  |  | 2 | 1 |  |  | 1 |  | 1 | 25 |  |
| andy489/Data_Structures_and_Algorithms | assets/1 – FMI Data Structures & Algorithms/05–week/05–08 Bonus Min-Max-Interv | `11.1.2` | `M11.1-7031.0.102-2` | 6 |  |  | 18 |  | 1 |  |  | 2 | 1 |  |  | 1 |  | 1 | 19 |  |
| andy489/Data_Structures_and_Algorithms | assets/2 – Data Structures/Sparse Table/06 – D. CGCDSSQ.pages | `11.1.2` | `M11.1-7031.0.102-2` | 6 |  |  | 16 |  | 1 |  |  | 2 | 1 |  |  | 1 |  | 1 | 19 |  |
| andy489/Data_Structures_and_Algorithms | assets/1 – FMI Data Structures & Algorithms/02–week/02–12 Monster world.pages | `11.1.2` | `M11.1-7031.0.102-2` | 6 |  |  | 18 |  | 1 |  |  | 2 | 1 |  |  | 1 |  | 1 | 21 |  |
| andy489/Data_Structures_and_Algorithms | assets/1 – FMI Data Structures & Algorithms/03–week/03–06 Strawberries.pages | `11.1.2` | `M11.1-7031.0.102-2` | 6 |  |  | 20 |  | 1 |  |  | 2 | 1 |  |  | 1 |  | 1 | 19 |  |
| andy489/Data_Structures_and_Algorithms | assets/1 – FMI Data Structures & Algorithms/01–week/01–06 The power sum.pages | `11.1.2` | `M11.1-7031.0.102-2` | 6 |  |  | 20 |  | 1 |  |  | 2 | 1 |  |  | 1 |  | 1 | 22 |  |
| andy489/Data_Structures_and_Algorithms | assets/1 – FMI Data Structures & Algorithms/09–week/09–07 Bonus BDZ.pages | `11.1.2` | `M11.1-7031.0.102-2` | 6 |  |  | 19 |  | 1 |  |  | 2 | 1 |  |  | 1 |  | 1 | 22 |  |
| andy489/Data_Structures_and_Algorithms | assets/1 – FMI Data Structures & Algorithms/05–week/05–03 Shortest path in maz | `11.1.2` | `M11.1-7031.0.102-2` | 6 |  |  | 19 |  | 1 |  |  | 2 | 1 |  |  | 1 |  | 1 | 19 |  |
| andy489/Data_Structures_and_Algorithms | assets/1 – FMI Data Structures & Algorithms/07–week/07–04 Grand hotel.pages | `11.1.2` | `M11.1-7031.0.102-2` | 6 |  |  | 18 |  | 1 |  |  | 2 | 1 |  |  | 1 |  | 1 | 21 |  |
| andy489/Data_Structures_and_Algorithms | assets/1 – FMI Data Structures & Algorithms/15–2020–01–24-exam/01 Road check.p | `11.1.2` | `M11.1-7031.0.102-2` | 6 |  |  | 22 |  | 1 |  |  | 2 | 1 |  |  | 1 |  | 1 | 21 |  |
| andy489/Data_Structures_and_Algorithms | assets/1 – FMI Data Structures & Algorithms/03–week/03–08 Balloons and candy.p | `11.1.2` | `M11.1-7031.0.102-2` | 6 |  |  | 22 |  | 1 |  |  | 2 | 1 |  |  | 1 |  | 1 | 20 |  |
| jgagneastro/coffeegrindsize | Help/coffee_grind_size_installation.pages | `3.2.13` | `M7.3-5989-2` | 6 |  |  | 4 | 2 | 2 |  |  | 3 | 1 |  |  |  |  | 1 | 19 |  |
| andy489/Data_Structures_and_Algorithms | assets/1 – FMI Data Structures & Algorithms/09–week/09–06 Bonus Tunnel maps.pa | `11.1.2` | `M11.1-7031.0.102-2` | 6 |  |  | 21 |  | 1 |  |  | 2 | 1 |  |  | 1 |  | 1 | 22 |  |
| andy489/Data_Structures_and_Algorithms | assets/2 – Data Structures/Sparse Table/11 – D. Animals and Puzzle.pages | `11.1.2` | `M11.1-7031.0.102-2` | 6 |  |  | 23 |  | 1 |  |  | 2 | 1 |  |  | 1 |  | 1 | 19 |  |
| andy489/Data_Structures_and_Algorithms | assets/1 – FMI Data Structures & Algorithms/12–week/12–02 EC_P – Critical Edge | `11.1.2` | `M11.1-7031.0.102-2` | 6 |  |  | 24 |  | 1 |  |  | 2 | 1 |  |  | 1 |  | 1 | 20 |  |
| andy489/Software_Engineering_State_Exam | assets/past exams/2019/2019-07-09/3.pages | `12.2.8` | `M12.2-7035.0.159-2` | 6 |  |  | 24 |  | 2 |  |  | 1 | 1 |  |  | 5 |  | 1 | 27 |  |
| andrejHurynovic/bsuirLabs | term6/СА/СА, ЛР № 3/СА, ЛР № 3.pages | `11.2.9` | `M11.2-7032.0.145-2` | 6 |  |  | 25 |  | 1 |  |  |  | 1 |  |  | 4 | 4 | 1 | 28 |  |
| andy489/Data_Structures_and_Algorithms | assets/1 – FMI Data Structures & Algorithms/10–week/10–01 Minimal forest.pages | `11.1.2` | `M11.1-7031.0.102-2` | 6 |  |  | 31 |  | 1 |  |  | 2 | 1 |  |  | 1 |  | 1 | 21 |  |
| andy489/Data_Structures_and_Algorithms | assets/1 – FMI Data Structures & Algorithms/15–2020–01–24-exam/05 Shortest tou | `11.1.2` | `M11.1-7031.0.102-2` | 6 |  |  | 29 |  | 1 |  |  | 2 | 1 |  |  | 1 |  | 1 | 22 |  |
| ntop/PF_RING | doc/pdf/PF_RING-UsersGuide.pages | `2.3.4` | `M6.3-5046-3` | 6 |  |  | 16 | 2 | 2 |  |  | 2 | 1 |  |  |  |  | 3 | 174 |  |
| andy489/Data_Structures_and_Algorithms | assets/1 – FMI Data Structures & Algorithms/08–week/08–01 Components in a grap | `11.1.2` | `M11.1-7031.0.102-2` | 6 |  |  | 31 |  | 1 |  |  | 2 | 1 |  |  | 1 |  | 1 | 22 |  |
| andy489/Data_Structures_and_Algorithms | assets/1 – FMI Data Structures & Algorithms/10–week/10–04 Kruskal (MST) – Real | `11.1.2` | `M11.1-7031.0.102-2` | 6 |  |  | 24 |  | 1 |  |  | 2 | 1 |  |  | 3 |  | 1 | 27 |  |
| andy489/Data_Structures_and_Algorithms | assets/1 – FMI Data Structures & Algorithms/06–week/06–09 Bonus 94.pages | `11.1.2` | `M11.1-7031.0.102-2` | 6 |  |  | 24 |  | 1 |  |  | 2 | 1 |  |  | 1 |  | 1 | 25 |  |
| andy489/Data_Structures_and_Algorithms | assets/1 – FMI Data Structures & Algorithms/03–week/03–05 Gems.pages | `11.1.2` | `M11.1-7031.0.102-2` | 6 |  |  | 30 |  | 1 |  |  | 2 | 1 |  |  | 1 |  | 1 | 20 |  |
| andy489/Data_Structures_and_Algorithms | assets/2 – Data Structures/Sparse Table/08 – B. Maximum of Maximums of Minimum | `11.1.2` | `M11.1-7031.0.102-2` | 6 |  |  | 30 |  | 1 |  |  | 2 | 1 |  |  | 1 |  | 1 | 19 |  |
| andy489/Empirical_Methods_and_Statistics | _asset/_additional/B3 54th Putnam 1993.pages | `13.1.2` | `M13.1-7037.0.101-2` | 6 |  |  | 75 |  | 2 |  |  | 6 | 1 |  |  |  | 65 | 1 | 85 |  |
| andy489/Software_Engineering_State_Exam | assets/past exams/2015/2015-07-14/7.pages | `12.2.8` | `M12.2-7035.0.159-2` | 6 |  |  | 39 |  | 2 |  |  | 1 | 1 |  |  |  | 16 | 1 | 37 |  |
| andy489/Empirical_Methods_and_Statistics | _asset/_additional/_inter/Math Interview Tasks.pages | `13.1.2` | `M13.1-7037.0.101-2` | 6 |  |  | 44 |  | 2 |  |  |  | 1 |  |  | 1 | 5 | 1 | 38 |  |
| andy489/Data_Structures_and_Algorithms | assets/1 – FMI Data Structures & Algorithms/01–week/01–12 Climbing the leaderb | `11.1.2` | `M11.1-7031.0.102-2` | 6 |  |  | 29 |  | 1 |  |  | 2 | 1 |  |  | 2 |  | 1 | 27 |  |
| andy489/Data_Structures_and_Algorithms | assets/1 – FMI Data Structures & Algorithms/12–week/12–07 E. Cactus.pages | `11.1.2` | `M11.1-7031.0.102-2` | 6 |  |  | 37 |  | 1 |  |  | 2 | 1 |  |  | 1 |  | 1 | 21 |  |
| andy489/Data_Structures_and_Algorithms | assets/1 – FMI Data Structures & Algorithms/08–week/08–02 Snakes and ladders.p | `11.1.2` | `M11.1-7031.0.102-2` | 6 |  |  | 34 |  | 1 |  |  | 3 | 1 |  |  | 1 |  | 1 | 26 |  |
| pbloem/pca-book | cover/titlepage.pages | `12.2.8` | `M12.2.1-7035.0.161-2` | 6 |  | 1 | 2 |  |  |  |  |  | 2 |  |  |  | 6 | 1 | 43 |  |
| andy489/Software_Engineering_State_Exam | assets/past exams/2020/2020-09-16/6.pages | `12.2.8` | `M12.2-7035.0.159-2` | 6 |  |  | 47 |  | 2 |  |  | 1 | 1 |  |  |  | 13 | 1 | 32 |  |
| andy489/Software_Engineering_State_Exam | assets/past exams/2018/2018-09-10/3.pages | `12.2.8` | `M12.2-7035.0.159-2` | 6 |  |  | 89 |  | 2 |  |  | 1 | 1 |  |  |  | 53 | 1 | 77 |  |
| andy489/Software_Engineering_State_Exam | assets/past exams/2021/2021-07-13/3.pages | `12.2.8` | `M12.2-7035.0.159-2` | 6 |  |  | 95 |  | 2 |  |  | 1 | 1 |  |  | 2 |  | 1 | 95 |  |
| andy489/Software_Engineering_State_Exam | assets/16/16.pages | `12.1.1` | `M12.1-7034.0.86-2` | 6 |  |  | 2 |  | 3 |  |  | 1 | 1 |  |  |  |  | 1 | 107 | 26 |
| andy489/Software_Engineering_State_Exam | assets/past exams/2015/2015-09-10/6.pages | `12.2.8` | `M12.2-7035.0.159-2` | 6 |  |  | 50 |  | 2 |  |  | 1 | 1 |  |  | 2 |  | 1 | 34 |  |
| andy489/Software_Engineering_State_Exam | assets/past exams/2020/2020-08-05/7.pages | `12.2.8` | `M12.2-7035.0.159-2` | 6 |  |  | 48 |  | 2 |  |  | 1 | 1 |  |  |  | 16 | 1 | 42 |  |
| andy489/Data_Structures_and_Algorithms | assets/1 – FMI Data Structures & Algorithms/04–week/04–05 Cloning snowmen.page | `11.1.2` | `M11.1-7031.0.102-2` | 6 |  |  | 55 |  | 1 |  |  | 2 | 1 |  |  | 1 |  | 1 | 19 |  |
| USCbiostats/software-dev | happy_scientist/seminars/2018-02_intro-tidyverse/material/HappyScientist 2018  | `3.2.13` | `M7.2-5869-2` | 6 |  | 1 | 3 |  |  |  |  | 1 | 1 |  |  |  | 2 | 1 | 22 |  |
| andy489/Data_Structures_and_Algorithms | assets/1 – FMI Data Structures & Algorithms/09–week/09–05 Discos.pages | `11.1.2` | `M11.1-7031.0.102-2` | 6 |  |  | 70 |  | 1 |  |  | 2 | 1 |  |  | 1 |  | 1 | 25 |  |
| loaydatrain/Optimizing_Millimeter_Wave_Communication | reports/Wireless Communication Project Report.pages | `11.2.9` | `M11.2-7032.0.145-2` | 6 | 2 | 10 | 28 |  |  |  |  |  | 1 |  |  |  | 3 | 1 | 34 |  |
| andy489/Data_Structures_and_Algorithms | assets/5 – DAA/DAA Theory and Problems/2021-12-03 DAA.pages | `11.1.2` | `M11.1-7031.0.102-2` | 6 |  |  | 53 |  | 1 |  |  | 1 | 1 |  |  | 1 |  | 1 | 25 |  |
| andy489/Empirical_Methods_and_Statistics | _asset/_exer/week 04/4. Cond prob bis - sols 5-8.pages | `11.1.2` | `M11.1-7031.0.102-2` | 6 |  |  | 62 |  | 1 |  |  |  | 1 |  |  | 1 | 1 | 1 | 30 |  |
| andy489/Data_Structures_and_Algorithms | assets/2 – Data Structures/Sparse Table/00 – Sparse Table.pages | `11.1.2` | `M11.1-7031.0.102-2` | 6 |  |  | 53 |  | 1 |  |  | 4 | 1 |  |  |  |  | 1 | 21 | 5 |
| andy489/Empirical_Methods_and_Statistics | _asset/_additional/2X-3Y.pages | `12.0.8` | `M12.0-7033.0.134-2` | 6 |  |  | 69 |  | 2 |  |  | 1 | 1 |  |  |  | 32 | 1 | 51 |  |
| andy489/Data_Structures_and_Algorithms | assets/2 – Data Structures/Disjoint Set Union/Disjoint Set Union.pages | `11.1.2` | `M11.1-7031.0.102-2` | 6 |  |  | 80 |  |  |  |  | 10 | 1 |  |  |  | 32 | 1 | 59 | 18 |
| andy489/Software_Engineering_State_Exam | assets/past exams/2021/2021-07-13/6.pages | `12.2.8` | `M12.2-7035.0.159-2` | 6 |  |  | 68 |  | 2 |  |  | 1 | 1 |  |  | 2 |  | 1 | 37 |  |
| andy489/Data_Structures_and_Algorithms | assets/2 – Data Structures/Stack/Towers of Hanoi.pages | `11.1.2` | `M11.1-7031.0.102-2` | 6 |  |  | 58 |  | 1 |  |  | 3 | 1 |  |  | 1 |  | 1 | 23 |  |
| SwiftEducation/teaching-app-dev-swift | Level 1/Level01.pages | `1.5.0` | `M5.5.3-2152-2` | 6 |  | 1 | 3 | 1 | 1 |  |  |  | 1 |  |  |  |  | 1 | 25 |  |
| ChilliHugger/The-Lords-Of-Midnight | guides/Lords of Midnight_guide_v2.pages | `13.2.1` | `M13.2-7038.0.87-4` | 6 |  | 2 | 28 |  |  |  |  |  | 1 |  |  | 9 | 4 | 1 | 133 |  |
| ChilliHugger/The-Lords-Of-Midnight | guides/Doomdark's Revenge_guide_v2.pages | `13.2.1` | `M13.2-7038.0.87-4` | 6 |  | 5 | 26 |  |  |  |  |  | 1 |  |  | 8 | 4 | 1 | 129 |  |
| anilallewar/microservices-basics-spring-boot | understanding_notes.pages | `1.5.0` | `M5.5.3-2152-2` | 6 |  |  | 9 | 1 | 1 |  |  | 3 | 1 |  |  |  |  | 1 | 37 |  |
| rohitghatol/spring-boot-microservices | understanding_notes.pages | `1.5.0` | `M5.5.3-2152-2` | 6 |  |  | 9 | 1 | 1 |  |  | 3 | 1 |  |  |  |  | 1 | 37 |  |
| andy489/Data_Structures_and_Algorithms | assets/5 – DAA/DAA Theory and Problems/2021-10-05 DAA.pages | `11.1.2` | `M11.1-7031.0.102-2` | 6 |  |  | 100 |  | 2 |  |  | 1 | 1 |  |  |  | 5 | 1 | 30 |  |
| andy489/Data_Structures_and_Algorithms | assets/4 – DSA project/DSA Project Airline Connections.pages | `11.1.2` | `M11.1-7031.0.102-2` | 6 |  |  | 35 |  | 1 |  |  | 2 | 1 |  |  |  | 71 | 1 | 99 |  |
| SR0725/ziphus-open | packages/pdf-to-markdown/examples/ExamplePdf.pages | `2.0.24` | `M5.6.2-2573-1` | 5 |  |  |  |  | 1 | 10 |  | 2 | 1 |  |  |  |  | 1 | 56 |  |
| jzillmann/pdf-to-markdown | examples/ExamplePdf.pages | `2.0.24` | `M5.6.2-2573-1` | 5 |  |  |  |  | 1 | 10 |  | 2 | 1 |  |  |  |  | 1 | 56 |  |
| pmichaillat/intermediate-macro | problemsets/ps5.pages | `12.2.8` | `M12.2.1-7035.0.161-2` | 5 |  |  |  | 1 | 2 |  |  | 1 | 1 |  |  |  |  | 1 | 25 |  |
| pmichaillat/intermediate-macro | problemsets/ps4.pages | `12.2.8` | `M12.2.1-7035.0.161-2` | 5 |  |  |  | 1 | 2 |  |  | 1 | 1 |  |  |  |  | 1 | 23 |  |
| pmichaillat/intermediate-macro | problemsets/ps2.pages | `12.2.8` | `M12.2.1-7035.0.161-2` | 5 |  |  |  | 1 | 2 |  |  | 1 | 1 |  |  |  |  | 1 | 29 |  |
| vandadnp/swift-weekly | issue01/swift-weekly-issue-01.pages | `1.5.0` | `M5.5-2109-1` | 5 |  |  |  | 2 | 1 |  |  | 1 | 1 |  |  |  |  | 3 | 34 |  |
| andy489/Data_Structures_and_Algorithms | assets/3 – Algorithms/Dynamic programming/Move Down-Right Sum.pages | `11.1.2` | `M11.1-7031.0.102-2` | 5 |  |  |  |  | 1 |  |  | 1 | 1 |  |  | 1 |  | 1 | 22 |  |
| lzhanforgit/Web-HTML5 | S2-Nodejs/Apache代理nodejs.pages | `2.0.24` | `M5.6.1-2562-1` | 5 |  |  |  | 1 | 1 |  |  | 1 | 1 |  |  |  |  | 1 | 19 |  |
| andy489/Data_Structures_and_Algorithms | assets/1 – FMI Data Structures & Algorithms/05–week/05–17 Sum level rows.pages | `11.1.2` | `M11.1-7031.0.102-2` | 5 |  |  |  |  | 1 |  |  | 1 | 1 |  |  | 1 |  | 1 | 19 |  |
| andy489/Software_Engineering_State_Exam | assets/past exams/2010/2010-07-15/4-CPP.pages | `12.1.1` | `M12.1-7034.0.86-2` | 5 |  |  |  |  | 2 |  |  | 1 | 1 |  |  |  | 2 | 1 | 21 |  |
| andy489/Data_Structures_and_Algorithms | assets/1 – FMI Data Structures & Algorithms/05–week/05–16 Worry beads.pages | `11.1.2` | `M11.1-7031.0.102-2` | 5 |  |  |  |  | 1 |  |  | 2 | 1 |  |  | 1 |  | 1 | 19 |  |
| andy489/Data_Structures_and_Algorithms | assets/1 – FMI Data Structures & Algorithms/05–week/05–14 Left–Right.pages | `11.1.2` | `M11.1-7031.0.102-2` | 5 |  |  |  |  | 1 |  |  | 2 | 1 |  |  | 1 |  | 1 | 19 |  |
| andy489/Software_Engineering_State_Exam | assets/past exams/2010/2010-09-08/4-Java.pages | `12.1.1` | `M12.1-7034.0.86-2` | 5 |  |  |  |  | 2 |  |  | 1 | 1 |  |  |  | 2 | 1 | 21 |  |
| andy489/Software_Engineering_State_Exam | assets/past exams/2010/2010-09-08/4-CPP.pages | `12.1.1` | `M12.1-7034.0.86-2` | 5 |  |  |  |  | 2 |  |  | 1 | 1 |  |  |  | 2 | 1 | 21 |  |
| andy489/Data_Structures_and_Algorithms | assets/2 – Data Structures/Sparse Table/05 – Sereja and D.pages | `11.1.2` | `M11.1-7031.0.102-2` | 5 |  |  |  |  | 1 |  |  | 2 | 1 |  |  | 1 |  | 1 | 21 |  |
| andy489/Data_Structures_and_Algorithms | assets/1 – FMI Data Structures & Algorithms/04–week/04–01 Control test 02 divi | `11.1.2` | `M11.1-7031.0.102-2` | 5 |  |  |  |  | 1 |  |  | 2 | 1 |  |  | 1 |  | 1 | 19 |  |
| pmichaillat/intermediate-macro | quizzes/quiz4.pages | `13.2.1` | `M13.2-7038.0.87-4` | 5 |  |  |  | 1 | 2 |  |  | 1 | 1 |  |  |  |  | 1 | 19 |  |
| SwiftEducation/teaching-app-dev-swift | Level 1/SpaceAdventure/SpaceAdventure Lesson03.pages | `2.0.24` | `M5.6.1-2562-1` | 5 |  |  |  | 1 | 1 |  |  | 6 | 1 |  |  |  |  | 1 | 33 |  |
| SwiftEducation/teaching-app-dev-swift | Level 1/SpaceAdventure/SpaceAdventure Lesson10.pages | `1.5.0` | `M5.5.3-2152-2` | 5 |  |  |  | 1 | 1 |  |  | 7 | 1 |  |  |  |  | 1 | 33 |  |
| pmichaillat/intermediate-macro | quizzes/quiz5.pages | `12.2.8` | `M12.2.1-7035.0.161-2` | 5 |  |  |  | 1 | 2 |  |  | 1 | 1 |  |  |  |  | 1 | 19 |  |
| pmichaillat/intermediate-macro | quizzes/quiz6.pages | `12.2.8` | `M12.2.1-7035.0.161-2` | 5 |  |  |  | 1 | 2 |  |  | 1 | 1 |  |  |  |  | 1 | 19 |  |
| pmichaillat/intermediate-macro | quizzes/quiz1.pages | `12.2.8` | `M12.2.1-7035.0.161-2` | 5 |  |  |  | 1 | 2 |  |  | 1 | 1 |  |  |  |  | 1 | 31 |  |
| andy489/Data_Structures_and_Algorithms | assets/1 – FMI Data Structures & Algorithms/12–week/12–04 Articulation Points  | `11.1.2` | `M11.1-7031.0.102-2` | 5 |  |  |  |  | 1 |  |  | 2 | 1 |  |  | 1 |  | 1 | 19 |  |
| SwiftEducation/teaching-app-dev-swift | Level 1/SpaceAdventure/SpaceAdventure Lesson05.pages | `2.0.24` | `M5.6.1-2562-1` | 5 |  |  |  | 1 | 1 |  |  | 5 | 1 |  |  |  |  | 1 | 36 |  |
| pmichaillat/intermediate-macro | quizzes/quiz2.pages | `12.2.8` | `M12.2.1-7035.0.161-2` | 5 |  |  |  | 1 | 2 |  |  | 1 | 1 |  |  |  |  | 1 | 37 |  |
| pmichaillat/intermediate-macro | quizzes/quiz3.pages | `12.2.8` | `M12.2.1-7035.0.161-2` | 5 |  |  |  | 1 | 2 |  |  | 1 | 1 |  |  |  |  | 1 | 19 |  |
| SwiftEducation/teaching-app-dev-swift | Level 1/SpaceAdventure/SpaceAdventure Lesson01.pages | `2.0.24` | `M5.6.1-2562-1` | 5 |  |  |  | 1 | 1 |  |  | 7 | 1 |  |  |  |  | 1 | 40 |  |
| robaho/seashore | Seashore/support.pages | `3.2.13` | `M7.3-5989-2` | 5 |  | 1 | 1 |  |  |  |  | 1 | 1 |  |  |  |  | 1 | 25 |  |
| SwiftEducation/teaching-app-dev-swift | Level 1/SpaceAdventure/SpaceAdventure Lesson09.pages | `1.5.0` | `M5.5.3-2152-2` | 5 |  |  |  | 1 | 1 |  |  | 9 | 1 |  |  |  |  | 1 | 37 |  |
| SwiftEducation/teaching-app-dev-swift | Level 1/SpaceAdventure/SpaceAdventure Lesson08.pages | `2.0.24` | `M5.6.1-2562-1` | 5 |  |  |  | 1 | 1 |  |  | 9 | 1 |  |  |  |  | 1 | 39 |  |
| SwiftEducation/teaching-app-dev-swift | Level 1/SpaceAdventure/SpaceAdventure Lesson07.pages | `2.0.24` | `M5.6.1-2562-1` | 5 |  |  |  | 1 | 1 |  |  | 8 | 1 |  |  |  |  | 1 | 41 |  |
| andy489/Data_Structures_and_Algorithms | assets/3 – Algorithms/Recursion and Backtracking/Search words in a grid.pages | `11.1.2` | `M11.1-7031.0.102-2` | 5 |  |  |  |  | 1 |  |  | 1 | 1 |  |  | 2 |  | 1 | 19 |  |
| SwiftEducation/teaching-app-dev-swift | Level 1/SpaceAdventure/SpaceAdventure Lesson11.pages | `2.0.24` | `M5.6.1-2562-1` | 5 |  |  |  | 1 | 1 |  |  | 7 | 1 |  |  |  |  | 1 | 41 |  |
| SwiftEducation/teaching-app-dev-swift | Level 1/SpaceAdventure/SpaceAdventure Lesson15.pages | `2.0.24` | `M5.6.1-2562-1` | 5 |  |  |  | 1 | 1 |  |  | 9 | 1 |  |  |  |  | 1 | 39 |  |
| SwiftEducation/teaching-app-dev-swift | Level 1/SpaceAdventure/SpaceAdventure Lesson12.pages | `2.0.24` | `M5.6.1-2562-1` | 5 |  |  |  | 1 | 1 |  |  | 9 | 1 |  |  |  |  | 1 | 35 |  |
| SwiftEducation/teaching-app-dev-swift | Level 1/SpaceAdventure/SpaceAdventure Lesson13.pages | `2.0.24` | `M5.6.1-2562-1` | 5 |  |  |  | 1 | 1 |  |  | 11 | 1 |  |  |  |  | 1 | 40 |  |
| SwiftEducation/teaching-app-dev-swift | Level 1/SpaceAdventure/SpaceAdventure Lesson02.pages | `2.0.24` | `M5.6.1-2562-1` | 5 |  |  |  | 1 | 1 |  |  | 7 | 1 |  |  |  |  | 1 | 35 |  |
| SwiftEducation/teaching-app-dev-swift | Level 1/SpaceAdventure/SpaceAdventure Lesson14.pages | `1.5.0` | `M5.5.3-2152-2` | 5 |  |  |  | 1 | 1 |  |  | 8 | 1 |  |  |  |  | 1 | 39 |  |
| SwiftEducation/teaching-app-dev-swift | Level 1/SpaceAdventure/SpaceAdventure Lesson06.pages | `2.0.24` | `M5.6.1-2562-1` | 5 |  |  |  | 1 | 1 |  |  | 6 | 1 |  |  |  |  | 1 | 45 |  |
| andy489/Data_Structures_and_Algorithms | assets/1 – FMI Data Structures & Algorithms/14–2019–01–27–exam/03 Dundee the c | `11.1.2` | `M11.1-7031.0.102-2` | 5 |  |  |  |  | 1 |  |  | 2 | 1 |  |  | 2 |  | 1 | 19 |  |
| andy489/Software_Engineering_State_Exam | assets/past exams/2010/2010-09-08/7.pages | `12.1.1` | `M12.1-7034.0.86-2` | 5 |  |  |  |  | 2 |  |  | 1 | 1 |  |  |  | 1 | 1 | 20 |  |
| andy489/Data_Structures_and_Algorithms | assets/1 – FMI Data Structures & Algorithms/08–week/08–05 Islands count.pages | `11.1.2` | `M11.1-7031.0.102-2` | 5 |  |  |  |  | 1 |  |  | 2 | 1 |  |  | 1 |  | 1 | 19 |  |
| andy489/Software_Engineering_State_Exam | assets/past exams/2010/2010-07-15/7.pages | `12.1.1` | `M12.1-7034.0.86-2` | 5 |  |  |  |  | 2 |  |  | 1 | 1 |  |  |  | 1 | 1 | 20 |  |
| picopalette/phishing-detection-plugin | artifacts/abstract.pages | `3.1.2` | `M7.1-5683-2` | 5 |  |  |  |  | 4 | 2 |  | 3 | 1 |  |  |  |  | 1 | 21 |  |
| huckor/wxwidgets-vscode | doc/linux.pages | `13.1.2` | `M13.1-7037.0.101-2` | 5 |  |  |  | 1 | 1 |  |  | 1 | 1 |  |  |  |  | 1 | 21 |  |
| force11/force11-scwg | sc-principles/rebuttal/rebuttal-letter.pages | `2.0.24` | `M5.6.2-2573-1` | 5 |  | 1 | 1 |  |  |  |  | 1 | 1 |  |  |  |  | 1 | 20 |  |
| andy489/Data_Structures_and_Algorithms | assets/1 – FMI Data Structures & Algorithms/05–week/05–13 RLD.pages | `11.1.2` | `M11.1-7031.0.102-2` | 5 |  |  |  |  | 1 |  |  | 2 | 1 |  |  | 1 |  | 1 | 19 |  |
| huckor/wxwidgets-vscode | doc/raspbian.pages | `13.1.2` | `M13.1-7037.0.101-2` | 5 |  |  |  | 1 | 1 |  |  | 1 | 1 |  |  |  |  | 1 | 21 |  |
| stpope/CSL6 | Doc/6.0DemoQuickStart.pages | `4.1.7` | `M8.1-6369-2` | 5 |  |  | 1 |  | 1 |  |  |  | 1 |  |  |  | 25 | 1 | 44 |  |
| andy489/Software_Engineering_State_Exam | assets/past exams/2018/2018-09-10/6.pages | `12.2.8` | `M12.2-7035.0.159-2` | 5 |  |  |  |  | 2 |  |  | 1 | 1 |  |  |  | 46 | 1 | 74 |  |
| andy489/Data_Structures_and_Algorithms | assets/3 – Algorithms/Recursion and Backtracking/Matrix Districts.pages | `11.1.2` | `M11.1-7031.0.102-2` | 5 |  |  |  |  | 1 |  |  | 1 | 1 |  |  | 3 |  | 1 | 19 |  |
| WebKit/WebKit | LayoutTests/quicklook/resources/pages.pages | `1.5.0` | `M5.5.3-2152-2` | 5 |  |  | 1 | 1 |  |  |  | 3 | 1 |  |  |  |  | 1 | 19 |  |
| WebKit/WebKit | Tools/TestWebKitAPI/Resources/cocoa/pages.pages | `1.5.0` | `M5.5.3-2152-2` | 5 |  |  | 1 | 1 |  |  |  | 3 | 1 |  |  |  |  | 1 | 19 |  |
| WebKit/WebKit | Tools/TestWebKitAPI/Resources/cocoa/test.pages | `1.5.0` | `M5.5.3-2152-2` | 5 |  |  | 1 | 1 |  |  |  | 3 | 1 |  |  |  |  | 1 | 19 |  |
| WebKit/WebKit-http | LayoutTests/quicklook/resources/pages.pages | `1.5.0` | `M5.5.3-2152-2` | 5 |  |  | 1 | 1 |  |  |  | 3 | 1 |  |  |  |  | 1 | 19 |  |
| WebKit/WebKit-http | Tools/TestWebKitAPI/ios/pages.pages | `1.5.0` | `M5.5.3-2152-2` | 5 |  |  | 1 | 1 |  |  |  | 3 | 1 |  |  |  |  | 1 | 19 |  |
| deadwood2/OdysseyWebBrowser | Tools/TestWebKitAPI/ios/pages.pages | `1.5.0` | `M5.5.3-2152-2` | 5 |  |  | 1 | 1 |  |  |  | 3 | 1 |  |  |  |  | 1 | 19 |  |
| naver/sling | webkit/Tools/TestWebKitAPI/ios/pages.pages | `1.5.0` | `M5.5.3-2152-2` | 5 |  |  | 1 | 1 |  |  |  | 3 | 1 |  |  |  |  | 1 | 19 |  |
| andy489/Data_Structures_and_Algorithms | assets/1 – FMI Data Structures & Algorithms/06–week/06–12 k-th largest element | `11.1.2` | `M11.1-7031.0.102-2` | 5 |  |  | 2 |  | 1 |  |  | 2 | 1 |  |  |  |  | 1 | 19 |  |
| andy489/Software_Engineering_State_Exam | assets/past exams/2014/2014-09-11/5.pages | `12.2.8` | `M12.2-7035.0.159-2` | 5 |  |  |  |  | 2 |  |  | 1 | 1 |  |  |  | 37 | 1 | 58 |  |
| andy489/Data_Structures_and_Algorithms | assets/2 – Data Structures/Sparse Table/10 – DCP–19 – Multiplication Interval. | `11.1.2` | `M11.1-7031.0.102-2` | 5 |  |  |  |  | 1 |  |  | 2 | 1 |  |  | 1 |  | 1 | 19 |  |
| RajaSrinivasan/assignments | src/Snakes.pages | `4.1.7` | `M8.1-6369-2` | 5 |  |  | 2 | 6 |  |  |  | 7 | 1 |  |  |  |  | 1 | 27 |  |
| andy489/Software_Engineering_State_Exam | assets/past exams/2010/2010-09-08/5.pages | `12.1.1` | `M12.1-7034.0.86-2` | 5 |  |  |  |  | 2 |  |  | 2 | 1 |  |  |  | 26 | 1 | 53 |  |
| andy489/Software_Engineering_State_Exam | assets/past exams/2014/2014-07-15/5.pages | `12.1.1` | `M12.1-7034.0.86-2` | 5 |  |  |  |  | 2 |  |  | 1 | 1 |  |  |  | 34 | 1 | 60 |  |
| andy489/Software_Engineering_State_Exam | assets/past exams/2017/2017-07-11/4.pages | `12.2.8` | `M12.2-7035.0.159-2` | 5 |  |  | 1 |  | 2 |  |  | 1 | 1 |  |  |  |  | 1 | 21 |  |
| andy489/Empirical_Methods_and_Statistics | _asset/_exer/week 01/R/R01. Introduction.pages | `13.1.2` | `M13.1-7037.0.101-2` | 5 |  |  | 2 |  | 1 |  |  | 9 | 1 |  |  |  |  | 1 | 42 |  |
| andy489/Software_Engineering_State_Exam | assets/past exams/2015/2015-07-14/3.pages | `12.2.8` | `M12.2-7035.0.159-2` | 5 |  |  |  |  | 2 |  |  | 1 | 1 |  |  |  | 20 | 1 | 50 |  |
| andy489/Software_Engineering_State_Exam | assets/past exams/2016/2016-09-09/3.pages | `12.2.8` | `M12.2-7035.0.159-2` | 5 |  |  | 2 |  | 2 |  |  | 1 | 1 |  |  |  |  | 1 | 31 |  |
| andy489/Data_Structures_and_Algorithms | assets/1 – FMI Data Structures & Algorithms/02–week/02–26 Upper–lower bound.pa | `11.1.2` | `M11.1-7031.0.102-2` | 5 |  |  | 5 |  | 1 |  |  | 1 | 1 |  |  |  |  | 1 | 19 |  |
| andy489/Software_Engineering_State_Exam | assets/past exams/2018/2018-07-13/5.pages | `12.2.8` | `M12.2-7035.0.159-2` | 5 |  |  | 1 |  | 2 |  |  | 1 | 1 |  |  |  |  | 1 | 21 |  |
| andy489/Software_Engineering_State_Exam | assets/past exams/2017/2017-09-09/6.pages | `12.2.8` | `M12.2.1-7035.0.161-2` | 5 |  |  | 3 |  | 2 |  |  | 1 | 1 |  |  |  |  | 1 | 19 |  |
| andy489/Data_Structures_and_Algorithms | assets/1 – FMI Data Structures & Algorithms/04–week/04–02 Singly linked list.p | `11.1.2` | `M11.1-7031.0.102-2` | 5 |  |  |  |  | 1 |  |  | 2 | 1 |  |  | 8 |  | 1 | 19 |  |
| andy489/Software_Engineering_State_Exam | assets/past exams/2016/2016-09-09/5.pages | `12.2.8` | `M12.2-7035.0.159-2` | 5 |  |  | 1 |  | 2 |  |  | 1 | 1 |  |  |  |  | 1 | 21 |  |
| andy489/Software_Engineering_State_Exam | assets/past exams/2015/2015-07-14/5.pages | `12.1.1` | `M12.1-7034.0.86-2` | 5 |  |  | 1 |  | 2 |  |  | 1 | 1 |  |  |  |  | 1 | 21 |  |
| andy489/Data_Structures_and_Algorithms | assets/1 – FMI Data Structures & Algorithms/04–week/04–18 Hamming numbers.page | `11.1.2` | `M11.1-7031.0.102-2` | 5 |  |  | 5 |  | 1 |  |  | 1 | 1 |  |  |  |  | 1 | 19 |  |
| andy489/Software_Engineering_State_Exam | assets/past exams/2016/2016-07-12/5.pages | `12.2.8` | `M12.2-7035.0.159-2` | 5 |  |  | 1 |  | 2 |  |  | 1 | 1 |  |  |  |  | 1 | 21 |  |
| 5T33Z0/Lenovo-T530-Hackintosh-OpenCore | Docs/USB_Ports.pages | `14.2.2` | `M14.3-7042.0.76-4` | 5 |  | 2 | 2 |  |  |  |  |  | 1 |  |  |  | 13 | 1 | 32 |  |
| andy489/Software_Engineering_State_Exam | assets/14/14.pages | `12.1.1` | `M12.1-7034.0.86-2` | 5 |  |  |  |  | 3 |  |  | 1 | 1 |  |  |  |  | 1 | 89 | 5 |
| LeoMobileDeveloper/Blogs | iOS/IAP/images/IAP.pages | `4.0.13` | `M8.0-6194-2` | 5 |  |  | 1 |  |  |  |  |  | 1 |  |  | 3 | 5 | 1 | 24 |  |
| andy489/Data_Structures_and_Algorithms | assets/1 – FMI Data Structures & Algorithms/06–week/06–13 Minimum number of re | `11.1.2` | `M11.1-7031.0.102-2` | 5 |  |  | 3 |  | 1 |  |  | 2 | 1 |  |  |  |  | 1 | 19 |  |
| andy489/Data_Structures_and_Algorithms | assets/1 – FMI Data Structures & Algorithms/05–week/05–20 k-th smallest elemen | `11.1.2` | `M11.1-7031.0.102-2` | 5 |  |  | 6 |  | 1 |  |  | 2 | 1 |  |  |  |  | 1 | 20 |  |
| andy489/Software_Engineering_State_Exam | assets/past exams/2019/2019-07-09/7.pages | `12.2.8` | `M12.2-7035.0.159-2` | 5 |  |  | 5 |  | 2 |  |  | 1 | 1 |  |  |  |  | 1 | 19 |  |
| andy489/Software_Engineering_State_Exam | assets/past exams/2016/2016-07-12/8.pages | `12.2.8` | `M12.2-7035.0.159-2` | 5 |  |  | 4 |  | 2 |  |  | 1 | 1 |  |  |  |  | 1 | 19 |  |
| RajaSrinivasan/assignments | src/random.pages | `10.0.10` | `M10.0-6748-2` | 5 |  |  | 4 |  |  |  |  | 1 | 1 |  |  | 2 |  | 1 | 27 |  |
| ihaveamac/ninfs | resources/MacGettingStarted.pages | `13.2.1` | `M13.2-7038.0.87-4` | 5 |  |  | 1 |  |  |  |  | 2 | 1 |  |  |  | 1 | 1 | 22 |  |
| ASSERT-KTH/ci-hackathon | participants/HarisAdzemovic_JAGARNAKEN/game-piano-hero-html5/doc/piano-hero.pa | `2.0.43` | `M6.0-3507-1` | 5 |  |  | 6 |  | 2 |  |  | 3 | 1 |  |  |  |  | 1 | 28 |  |
| andy489/Software_Engineering_State_Exam | assets/past exams/2018/2018-07-13/6.pages | `12.2.8` | `M12.2-7035.0.159-2` | 5 |  |  |  |  | 2 |  |  | 1 | 1 |  |  |  | 24 | 1 | 49 |  |
| andy489/Software_Engineering_State_Exam | assets/past exams/2021/2021-09-08/1.pages | `12.2.8` | `M12.2-7035.0.159-2` | 5 |  |  | 1 |  | 2 |  |  |  | 1 |  |  | 5 |  | 1 | 26 |  |
| andy489/Software_Engineering_State_Exam | assets/past exams/2021/2021-09-08/7.pages | `12.2.8` | `M12.2-7035.0.159-2` | 5 |  |  | 5 |  | 2 |  |  | 1 | 1 |  |  |  |  | 1 | 19 |  |
| andy489/Software_Engineering_State_Exam | assets/past exams/2019/2019-09-10/7.pages | `12.2.8` | `M12.2-7035.0.159-2` | 5 |  |  | 5 |  | 2 |  |  | 1 | 1 |  |  |  |  | 1 | 19 |  |
| andy489/Software_Engineering_State_Exam | assets/past exams/2018/2018-09-10/8.pages | `12.2.8` | `M12.2-7035.0.159-2` | 5 |  |  | 5 |  | 2 |  |  | 1 | 1 |  |  |  |  | 1 | 19 |  |
| MichaelsPlayground/TalkToYourDESFireCard | docs/Working with Mifare DESFire EV3.pages | `13.1.2` | `M13.1-7037.0.101-2` | 5 |  |  |  |  |  |  |  | 1 | 9 |  |  | 8 |  | 1 | 197 |  |
| AndroidCrypto/MifareDesfireEv3TutorialNFCjLib | docs/Working with Mifare DESFire EV3.pages | `13.1.2` | `M13.1-7037.0.101-2` | 5 |  |  |  |  |  |  |  | 1 | 9 |  |  | 8 |  | 1 | 197 |  |
| glennlopez/CS50.HarvardX | pset4/2018/resize/less/ResizeLess_notes.pages | `2.4.4` | `M7.0-5576-2` | 5 |  |  | 2 | 1 | 1 |  |  |  | 1 |  |  |  |  | 1 | 36 |  |
| checkmarx-ts/CxUtils | CxPythonTools/CxProjectStatisticsReporter1_Tool_Documentation_09102019.pages | `4.1.7` | `M8.1-6369-2` | 5 |  |  | 3 | 1 | 1 |  |  |  | 1 |  |  |  |  | 1 | 19 |  |
| greenblat/vlsistuff | ngspice_verilator/docs/ngspice_verilator.pages | `10.2.3` | `M10.3.5-7029.5.5-2` | 5 |  |  | 4 |  |  |  |  | 2 | 1 |  |  |  | 3 | 1 | 24 |  |
| andy489/Software_Engineering_State_Exam | assets/past exams/2018/2018-07-13/8.pages | `12.2.8` | `M12.2-7035.0.159-2` | 5 |  |  | 6 |  | 2 |  |  | 1 | 1 |  |  |  |  | 1 | 19 |  |
| andy489/Data_Structures_and_Algorithms | assets/1 – FMI Data Structures & Algorithms/04–week/04–07 Smurfieta's writing. | `11.1.2` | `M11.1-7031.0.102-2` | 5 |  |  | 10 |  | 1 |  |  | 2 | 1 |  |  |  |  | 1 | 19 |  |
| andy489/Software_Engineering_State_Exam | assets/past exams/2016/2016-09-09/8.pages | `12.2.8` | `M12.2-7035.0.159-2` | 5 |  |  | 7 |  | 2 |  |  | 1 | 1 |  |  |  |  | 1 | 19 |  |
| PKUanonym/REKCARC-TSC-UHT | 大三上/人机交互理论与技术/hw/2016/6/Fitts' Law Experiment.pages | `2.0.43` | `M6.0.5-4052-1` | 5 |  | 3 | 14 |  | 1 |  |  |  | 1 |  |  |  |  | 1 | 57 |  |
| Salensoft/thu-cst-cracker | 大三上/人机交互理论与技术/hw/2016/6/Fitts' Law Experiment.pages | `2.0.43` | `M6.0.5-4052-1` | 5 |  | 3 | 14 |  | 1 |  |  |  | 1 |  |  |  |  | 1 | 57 |  |
| andy489/Software_Engineering_State_Exam | assets/past exams/2018/2018-09-10/5.pages | `12.2.8` | `M12.2-7035.0.159-2` | 5 |  |  | 14 |  | 2 |  |  | 1 | 1 |  |  |  |  | 1 | 19 |  |
| coolnameismy/dev-tips | deploy/tomcat/Eclipse中的Web项目自动部署到Tomcat.pages | `1.5.0` | `M5.5.2-2120-1` | 5 |  |  | 4 | 1 | 1 |  |  |  | 1 |  |  |  |  | 1 | 22 |  |
| PKUanonym/REKCARC-TSC-UHT | 大三上/人机交互理论与技术/hw/2016/1/唐玉涵课程作业1.pages | `2.0.43` | `M6.0.5-4052-1` | 5 |  | 1 | 1 |  | 1 |  |  |  | 1 |  |  |  |  | 1 | 21 |  |
| Salensoft/thu-cst-cracker | 大三上/人机交互理论与技术/hw/2016/1/唐玉涵课程作业1.pages | `2.0.43` | `M6.0.5-4052-1` | 5 |  | 1 | 1 |  | 1 |  |  |  | 1 |  |  |  |  | 1 | 21 |  |
| andy489/Data_Structures_and_Algorithms | assets/1 – FMI Data Structures & Algorithms/09–week/09–02 Christmas markets.pa | `11.1.2` | `M11.1-7031.0.102-2` | 5 |  |  | 12 |  |  |  |  | 1 | 1 |  |  | 1 |  | 1 | 19 |  |
| PKUanonym/REKCARC-TSC-UHT | 大三下/机器学习概论/hw/2017实验/exp2/实验二/report.pages | `2.2.4` | `M6.2-4582-1` | 5 |  | 1 | 6 |  | 1 |  |  |  | 1 |  |  |  |  | 1 | 26 |  |
| Salensoft/thu-cst-cracker | 大三下/机器学习概论/hw/2017实验/exp2/实验二/report.pages | `2.2.4` | `M6.2-4582-1` | 5 |  | 1 | 6 |  | 1 |  |  |  | 1 |  |  |  |  | 1 | 26 |  |
| stellarkey/912_project | 6 复试/2 笔试/9 机器学习/机器学习概论/hw/2017实验/exp2/实验二/report.pages | `2.2.4` | `M6.2-4582-1` | 5 |  | 1 | 6 |  | 1 |  |  |  | 1 |  |  |  |  | 1 | 26 |  |
| curiositech/some_claude_skills | corpus/books/thinking-in-betspdf.pages | `14.4.1` | `M14.4-7043.0.93-4` | 5 |  |  | 1 |  |  |  |  |  | 15 |  |  |  | 4 | 1 | 322 |  |
| andy489/Data_Structures_and_Algorithms | assets/6 – Practice/code forces/1325D Ehab the Xorcist Explained.pages | `11.1.2` | `M11.1-7031.0.102-2` | 5 |  |  | 20 |  | 1 |  |  | 2 | 1 |  |  |  |  | 1 | 19 |  |
| kthyng/python4geosciences | syllabus.pages | `4.1.7` | `M8.1-6369-2` | 5 |  |  | 1 |  |  |  |  | 3 | 1 |  |  | 1 |  | 1 | 29 |  |
| andy489/Software_Engineering_State_Exam | assets/past exams/2015/2015-09-10/8.pages | `12.1.1` | `M12.1-7034.0.86-2` | 5 |  |  | 12 |  | 2 |  |  | 1 | 1 |  |  |  |  | 1 | 19 |  |
| andy489/Software_Engineering_State_Exam | assets/past exams/2019/2019-07-09/5.pages | `12.2.8` | `M12.2-7035.0.159-2` | 5 |  |  | 22 |  | 2 |  |  | 1 | 1 |  |  |  |  | 1 | 19 |  |
| eigenfoo/tests-as-linear | cheatsheets/linear_tests_cheat_sheet.pages | `2.1.7` | `M6.1.1-4338-1` | 5 |  | 3 | 5 |  |  |  |  | 23 | 1 |  |  |  |  | 1 | 87 |  |
| vert-x3/vertx-guide-for-java-devs | cover.pages | `2.2.4` | `M6.2-4582-1` | 5 | 1 |  | 1 |  |  |  |  |  | 1 |  |  |  | 2 | 1 | 21 |  |
| andy489/Software_Engineering_State_Exam | assets/past exams/2015/2015-07-14/8.pages | `12.2.8` | `M12.2.1-7035.0.161-2` | 5 |  |  | 13 |  | 2 |  |  | 1 | 1 |  |  |  |  | 1 | 21 |  |
| andy489/Data_Structures_and_Algorithms | assets/2 – Data Structures/Sparse Table/06 – 475D – CGCDSSQ explained.pages | `11.1.2` | `M11.1-7031.0.102-2` | 5 |  |  | 17 |  | 1 |  |  | 2 | 1 |  |  |  |  | 1 | 19 |  |
| andy489/Empirical_Methods_and_Statistics | _asset/_exer/week 12/R/R12. Verzani Problem Set.pages | `13.1.2` | `M13.1-7037.0.101-2` | 5 |  |  | 14 |  | 1 |  |  |  | 1 |  |  | 3 |  | 1 | 19 |  |
| PKUanonym/REKCARC-TSC-UHT | 大三上/人机交互理论与技术/hw/2016/4/唐玉涵课程作业4.pages | `2.0.43` | `M6.0.5-4052-1` | 5 |  | 1 | 6 |  | 1 |  |  |  | 1 |  |  |  |  | 1 | 19 |  |
| Salensoft/thu-cst-cracker | 大三上/人机交互理论与技术/hw/2016/4/唐玉涵课程作业4.pages | `2.0.43` | `M6.0.5-4052-1` | 5 |  | 1 | 6 |  | 1 |  |  |  | 1 |  |  |  |  | 1 | 19 |  |
| refraction-networking/tapdance | pfring-framework/doc/PF_RING-UsersGuide.pages | `2.0.24` | `M5.6.2-2573-1` | 5 |  |  | 13 | 2 | 2 |  |  |  | 1 |  |  |  |  | 3 | 164 |  |
| andy489/Software_Engineering_State_Exam | assets/past exams/2021/2021-07-13/7.pages | `12.2.8` | `M12.2-7035.0.159-2` | 5 |  |  | 17 |  | 2 |  |  | 1 | 1 |  |  |  |  | 1 | 19 |  |
| PKUanonym/REKCARC-TSC-UHT | 大三上/计算机网络安全技术/hw/2016/2/366301957_2_2016B-IdentityAuthentication.pages | `2.0.43` | `M6.0.5-4052-1` | 5 |  |  | 3 | 1 | 1 |  |  |  | 1 |  |  |  |  | 1 | 26 |  |
| Salensoft/thu-cst-cracker | 大三上/计算机网络安全技术/hw/2016/2/366301957_2_2016B-IdentityAuthentication.pages | `2.0.43` | `M6.0.5-4052-1` | 5 |  |  | 3 | 1 | 1 |  |  |  | 1 |  |  |  |  | 1 | 26 |  |
| andy489/Empirical_Methods_and_Statistics | _asset/_exer/week 03/R/R02. Verzani Problem Set.pages | `13.1.2` | `M13.1-7037.0.101-2` | 5 |  |  | 42 |  | 1 |  |  |  | 1 |  |  | 1 |  | 1 | 53 |  |
| SwiftEducation/teaching-app-dev-swift | Overview/XcodeKeyboardShortcuts.pages | `1.5.0` | `M5.5.3-2152-2` | 5 |  | 5 | 5 |  | 1 |  |  |  | 1 |  |  |  |  | 1 | 56 |  |
| andy489/Software_Engineering_State_Exam | assets/past exams/2020/2020-08-05/6.pages | `14.0.1` | `M14.0-7039.0.94-4` | 5 |  |  | 23 |  | 2 |  |  | 1 | 1 |  |  |  |  | 1 | 19 |  |
| PKUanonym/REKCARC-TSC-UHT | 大三上/人机交互理论与技术/hw/2016/5/唐玉涵课程作业5.pages | `2.0.43` | `M6.0.5-4052-1` | 5 |  | 1 | 4 |  | 1 |  |  |  | 1 |  |  |  |  | 1 | 21 |  |
| Salensoft/thu-cst-cracker | 大三上/人机交互理论与技术/hw/2016/5/唐玉涵课程作业5.pages | `2.0.43` | `M6.0.5-4052-1` | 5 |  | 1 | 4 |  | 1 |  |  |  | 1 |  |  |  |  | 1 | 21 |  |
| andy489/Software_Engineering_State_Exam | assets/past exams/2021/2021-09-08/6.pages | `12.2.8` | `M12.2-7035.0.159-2` | 5 |  |  | 24 |  | 2 |  |  | 1 | 1 |  |  |  |  | 1 | 21 |  |
| andy489/Empirical_Methods_and_Statistics | _asset/_exer/week 15/R/R15. Verzani Problem Set.pages | `13.1.2` | `M13.1-7037.0.101-2` | 5 |  |  | 36 |  | 1 |  |  | 1 | 1 |  |  |  |  | 1 | 19 |  |
| Finance-And-ML/US-Stock-Prediction-Using-ML-And-Spark | Paper/Stock_Price_Prediction_via_Financial_News_Sentiment_Analysis.pages | `2.2.4` | `M6.2-4582-1` | 5 |  | 4 | 5 |  |  |  |  | 1 | 1 |  |  |  |  | 1 | 39 |  |
| Rustaceans/rust-cologne | meetup-orga/Rust Cologne Today At ThoughtWorks Sign.pages | `3.1.2` | `M7.1-5683-2` | 5 |  |  | 2 |  |  |  |  |  | 2 |  |  |  | 3 | 1 | 40 |  |
| andy489/Data_Structures_and_Algorithms | assets/2 – Data Structures/Sparse Table/08 – B. Maximum of Maximums of Minimum | `11.1.2` | `M11.1-7031.0.102-2` | 5 |  |  | 28 |  | 1 |  |  | 2 | 1 |  |  |  |  | 1 | 25 |  |
| PKUanonym/REKCARC-TSC-UHT | 大三上/人机交互理论与技术/hw/2016/2/唐玉涵课程作业2.pages | `2.0.43` | `M6.0.5-4052-1` | 5 |  | 3 | 3 |  | 1 |  |  |  | 1 |  |  |  |  | 1 | 21 |  |
| Salensoft/thu-cst-cracker | 大三上/人机交互理论与技术/hw/2016/2/唐玉涵课程作业2.pages | `2.0.43` | `M6.0.5-4052-1` | 5 |  | 3 | 3 |  | 1 |  |  |  | 1 |  |  |  |  | 1 | 21 |  |
| rougier/scientific-posters | src/2016-Calculer.pages | `13.1.2` | `M13.1-7037.0.101-2` | 5 |  | 4 | 20 |  |  |  |  |  | 1 |  |  |  | 49 | 1 | 68 |  |
| proyecto26/RestClient | doc/RestClient.pages | `10.1.8` | `M10.1-6913-2` | 5 |  |  | 6 |  |  |  |  | 14 | 1 |  |  | 1 |  | 1 | 45 |  |
| ContextLab/storytelling-with-data | admin/PSYC_81_syllabus.pages | `13.2.1` | `M13.2-7038.0.87-4` | 5 |  | 1 | 4 |  |  |  |  | 17 | 1 |  |  |  |  | 1 | 19 |  |
| andy489/Empirical_Methods_and_Statistics | _asset/_additional/_inter/line_calc.pages | `14.4.1` | `M14.4-7043.0.93-4` | 5 |  |  | 41 |  | 1 |  |  |  | 1 |  |  |  | 1 | 1 | 24 |  |
| andy489/Empirical_Methods_and_Statistics | _asset/_exer/week 05/5. Bayes formula, geom prob - sols 8-9.pages | `11.1.2` | `M11.1-7031.0.102-2` | 5 |  |  | 57 |  | 1 |  |  |  | 1 |  |  |  | 12 | 1 | 31 |  |
| andy489/Empirical_Methods_and_Statistics | _asset/_exer/week 06/R/R06. TasksDiscrete Solutions.pages | `13.1.2` | `M13.1-7037.0.101-2` | 5 |  |  | 40 |  | 2 |  |  | 1 | 1 |  |  |  |  | 1 | 27 |  |
| ContextLab/experimental-psychology | admin/syllabus/PSYC_11_EXPERIMENTAL_PSYCHOLOGY.pages | `14.4.1` | `M14.4-7043.0.93-4` | 5 |  |  | 1 |  |  |  |  | 6 | 1 |  |  |  | 1 | 1 | 28 |  |
| PKUanonym/REKCARC-TSC-UHT | 大三下/机器学习概论/hw/2017实验/exp1/report.pages | `2.0.43` | `M6.0.5-4052-1` | 5 |  | 2 | 11 |  | 1 |  |  |  | 1 |  |  |  |  | 1 | 34 |  |
| PKUanonym/REKCARC-TSC-UHT | 大三下/机器学习概论/hw/2017实验/exp1/报告/report.pages | `2.0.43` | `M6.0.5-4052-1` | 5 |  | 2 | 11 |  | 1 |  |  |  | 1 |  |  |  |  | 1 | 34 |  |
| Salensoft/thu-cst-cracker | 大三下/机器学习概论/hw/2017实验/exp1/report.pages | `2.0.43` | `M6.0.5-4052-1` | 5 |  | 2 | 11 |  | 1 |  |  |  | 1 |  |  |  |  | 1 | 34 |  |
| Salensoft/thu-cst-cracker | 大三下/机器学习概论/hw/2017实验/exp1/报告/report.pages | `2.0.43` | `M6.0.5-4052-1` | 5 |  | 2 | 11 |  | 1 |  |  |  | 1 |  |  |  |  | 1 | 34 |  |
| stellarkey/912_project | 6 复试/2 笔试/9 机器学习/机器学习概论/hw/2017实验/exp1/report.pages | `2.0.43` | `M6.0.5-4052-1` | 5 |  | 2 | 11 |  | 1 |  |  |  | 1 |  |  |  |  | 1 | 34 |  |
| stellarkey/912_project | 6 复试/2 笔试/9 机器学习/机器学习概论/hw/2017实验/exp1/报告/report.pages | `2.0.43` | `M6.0.5-4052-1` | 5 |  | 2 | 11 |  | 1 |  |  |  | 1 |  |  |  |  | 1 | 34 |  |
| devoxx4kids/materials | workshops/minecraft/course/Day1.pages | `1.5.0` | `M5.5.3-2152-2` | 5 |  |  | 1 | 1 |  |  |  | 2 | 1 |  |  |  |  | 1 | 26 |  |
| ivanpirog/vortextracker | Doc/Vortex Tracker.pages | `2.2.4` | `M6.2-4582-1` | 5 |  | 1 | 3 |  | 1 |  |  |  | 1 |  |  |  |  | 1 | 98 |  |
| z00m128/vortextracker25 | Doc/Vortex Tracker.pages | `2.2.4` | `M6.2-4582-1` | 5 |  | 1 | 3 |  | 1 |  |  |  | 1 |  |  |  |  | 1 | 98 |  |
| rougier/scientific-posters | src/2016-Comprendre.pages | `13.1.2` | `M13.1-7037.0.101-2` | 5 |  | 3 | 12 |  |  |  |  |  | 1 |  |  |  | 33 | 1 | 52 |  |
| andy489/Empirical_Methods_and_Statistics | _asset/_exer/week 13/R/R13. Verzani Problem Set.pages | `13.1.2` | `M13.1-7037.0.101-2` | 5 |  |  | 42 |  | 1 |  |  |  | 1 |  |  | 3 |  | 1 | 19 |  |
| andy489/Empirical_Methods_and_Statistics | _asset/_exer/week 03/R/R01. Bivariate Data.pages | `13.1.2` | `M13.1-7037.0.101-2` | 5 |  |  | 66 |  | 1 |  |  | 2 | 1 |  |  |  |  | 1 | 19 |  |
| rougier/scientific-posters | src/2019-iBAGS.pages | `3.2.13` | `M7.3-5989-2` | 5 |  | 3 | 9 |  |  |  |  |  | 1 |  |  |  | 50 | 1 | 70 |  |
| PKUanonym/REKCARC-TSC-UHT | 大三上/人机交互理论与技术/hw/2016/3/唐玉涵课程作业3.pages | `2.0.43` | `M6.0-3507-1` | 5 |  | 2 | 11 |  | 1 |  |  |  | 1 |  |  |  |  | 1 | 21 |  |
| Salensoft/thu-cst-cracker | 大三上/人机交互理论与技术/hw/2016/3/唐玉涵课程作业3.pages | `2.0.43` | `M6.0-3507-1` | 5 |  | 2 | 11 |  | 1 |  |  |  | 1 |  |  |  |  | 1 | 21 |  |
| andy489/Software_Engineering_State_Exam | assets/past exams/2019/2019-09-10/5.pages | `12.2.8` | `M12.2-7035.0.159-2` | 5 |  |  | 79 |  | 2 |  |  | 1 | 1 |  |  |  |  | 1 | 23 |  |
| andy489/Software_Engineering_State_Exam | assets/past exams/2020/2020-09-16/7.pages | `12.2.8` | `M12.2-7035.0.159-2` | 5 |  |  | 65 |  | 2 |  |  | 1 | 1 |  |  |  |  | 1 | 27 |  |
| SiliconDojo/Online-Classes | Raspberry Pi - Introduction/Raspberry Pi - Introduction.pages | `14.2.2` | `M14.3-7042.0.76-4` | 5 |  |  | 3 |  | 3 |  |  | 9 | 1 |  |  |  |  | 1 | 21 |  |
| andy489/Empirical_Methods_and_Statistics | _asset/_additional/Basic Randomization.pages | `13.1.2` | `M13.1-7037.0.101-2` | 5 |  |  | 89 |  | 1 |  |  |  | 1 |  |  |  | 7 | 1 | 33 |  |
| andy489/Data_Structures_and_Algorithms | assets/2 – Data Structures/Sparse Table/00 – 2D RMQ.pages | `11.1.2` | `M11.1-7031.0.102-2` | 5 |  |  | 64 |  | 1 |  |  | 2 | 1 |  |  |  |  | 1 | 21 |  |
| rougier/scientific-posters | src/2015-RLDM.pages | `13.1.2` | `M13.1-7037.0.101-2` | 5 |  | 9 | 15 |  |  |  |  |  | 1 |  |  |  | 31 | 1 | 50 |  |
| andy489/Data_Structures_and_Algorithms | assets/5 – DAA/DAA Theory and Problems/2021-11-26 1st Little Control Test.page | `11.1.2` | `M11.1-7031.0.102-2` | 5 |  |  | 79 |  | 2 |  |  | 1 | 1 |  |  |  |  | 1 | 19 |  |
| andy489/Empirical_Methods_and_Statistics | _asset/_exer/week 11/R/R11. Two-sample Hypothesis Testing – Moodle sols.pages | `13.1.2` | `M13.1-7037.0.101-2` | 5 |  |  | 70 |  | 1 |  |  |  | 1 |  |  | 1 |  | 1 | 19 |  |
| andy489/Empirical_Methods_and_Statistics | _asset/_exer/week 05/5. Sols with pics.pages | `11.1.2` | `M11.1-7031.0.102-2` | 5 |  |  | 111 |  | 1 |  |  |  | 1 |  |  |  | 46 | 1 | 65 |  |
| innovate-sabre/census-sis | choroplethr-course/pre-course documents/Software Installation Instructions.pag | `2.3.4` | `M6.3.1-5249-2` | 5 |  | 1 | 3 |  |  |  |  | 3 | 1 |  |  |  |  | 1 | 19 |  |
| TheAxeC/machine-learning-techniques-for-flow-based-network-intrusion-detection-systems | documents/poster.pages | `2.0.24` | `M5.6.2-2573-1` | 5 |  | 8 | 28 |  |  |  |  | 1 | 1 |  |  |  |  | 1 | 133 |  |
| jgscott/ECO395M | slides/07-clustering/fig/clustering_figs.pages | `3.1.2` | `M7.1-5683-2` | 5 |  |  | 12 |  |  |  |  |  | 7 |  |  |  | 27 | 1 | 154 |  |
| jgscott/STA380 | slides/05_clustering/fig/clustering_figs.pages | `3.1.2` | `M7.1-5683-2` | 5 |  |  | 12 |  |  |  |  |  | 7 |  |  |  | 27 | 1 | 154 |  |
| jgscott/STA380 | slides/05_clustering/old/fig/clustering_figs.pages | `3.1.2` | `M7.1-5683-2` | 5 |  |  | 12 |  |  |  |  |  | 7 |  |  |  | 27 | 1 | 154 |  |
| andy489/Empirical_Methods_and_Statistics | _asset/_exer/week 04/FMI-PTMS 4 - hints and sols.pages | `13.1.2` | `M13.1-7037.0.101-2` | 5 |  |  | 97 |  | 1 |  |  |  | 1 |  |  |  | 4 | 1 | 23 |  |
| andy489/Data_Structures_and_Algorithms | assets/5 – DAA/DAA Theory and Problems/DAA E.pages | `11.1.2` | `M11.1-7031.0.102-2` | 5 |  |  | 109 |  | 1 |  |  | 1 | 1 |  |  |  |  | 1 | 25 |  |
| eseedo/iOSCourse | iOS Basic/iOS12+Swift4.2/Series1/Pages/让不懂编程的人爱上iPhone开发(2018秋iOS12+Swift4.2+X | `3.2.13` | `M7.3-5989-2` | 5 |  | 2 | 25 |  |  |  |  | 3 | 1 |  |  |  |  | 1 | 25 |  |
| andy489/Empirical_Methods_and_Statistics | _asset/_exer/week 03/3. Cond prob, independence - sols.pages | `13.1.2` | `M13.1-7037.0.101-2` | 5 |  |  | 112 |  | 1 |  |  |  | 1 |  |  | 1 |  | 1 | 26 |  |
| andy489/Software_Engineering_State_Exam | assets/past exams/2010/2010-09-08/2.pages | `12.1.1` | `M12.1-7034.0.86-2` | 4 |  |  |  |  | 2 |  |  | 1 | 1 |  |  |  |  | 1 | 19 |  |
| andy489/Data_Structures_and_Algorithms | assets/1 – FMI Data Structures & Algorithms/05–week/05–19 Symmetric tree.pages | `11.1.2` | `M11.1-7031.0.102-2` | 4 |  |  |  |  | 1 |  |  | 2 | 1 |  |  |  |  | 1 | 19 |  |
| andy489/Software_Engineering_State_Exam | assets/past exams/2010/2010-07-15/2.pages | `12.1.1` | `M12.1-7034.0.86-2` | 4 |  |  |  |  | 2 |  |  | 1 | 1 |  |  |  |  | 1 | 19 |  |
| andy489/Data_Structures_and_Algorithms | assets/2 – Data Structures/Stack/Valid Parentheses.pages | `11.1.2` | `M11.1-7031.0.102-2` | 4 |  |  |  |  | 1 |  |  | 2 | 1 |  |  |  |  | 1 | 23 |  |
| dekuNukem/daytripper | resources/daytripper on-air packet.pages | `3.1.2` | `M7.1-5683-2` | 4 |  |  |  |  |  |  |  |  | 1 |  |  | 3 | 5 | 1 | 37 |  |
| fanpan26/LayIM_JavaClient-Deprecated | out/artifacts/LayIM_JavaClient_war_exploded/upload/2016-11-30/e01cfc32-bac0-40 | `1.5.0` | `M5.5.2-2120-1` | 4 |  |  |  | 1 | 1 |  |  |  | 1 |  |  |  |  | 1 | 19 |  |
| grame-cncm/inscore | rsrc/Privacy-policy.pages | `11.2.9` | `M11.2-7032.0.145-2` | 4 |  |  | 1 |  |  |  |  | 1 | 1 |  |  |  |  | 1 | 19 |  |
| andy489/Data_Structures_and_Algorithms | assets/1 – FMI Data Structures & Algorithms/05–week/05–21 Delete node in a BST | `11.1.2` | `M11.1-7031.0.102-2` | 4 |  |  |  |  | 1 |  |  | 2 | 1 |  |  |  |  | 1 | 21 |  |
| nightflyer88/CG_scale | Doc/CG_scale_mechanics.pages | `3.2.13` | `M7.3-5989-2` | 4 |  |  | 2 |  |  |  |  |  | 1 |  |  |  | 42 | 1 | 61 |  |
| andy489/Data_Structures_and_Algorithms | assets/3 – Algorithms/Bubble-Cocktail sort/Bubble-Cocktail Sort.pages | `11.1.2` | `M11.1-7031.0.102-2` | 4 |  |  |  |  | 1 |  |  | 1 | 1 |  |  |  |  | 1 | 19 |  |
| andy489/Software_Engineering_State_Exam | assets/past exams/2010/2010-07-15/3-CPP.pages | `12.1.1` | `M12.1-7034.0.86-2` | 4 |  |  |  |  | 2 |  |  | 1 | 1 |  |  |  |  | 1 | 19 |  |
| rougier/book-mode | article/figures/Fast inverse square root.pages | `10.1.8` | `M10.1-6913-2` | 4 |  |  |  |  |  |  |  |  | 1 |  |  | 1 | 3 | 1 | 32 |  |
| Ajb2k3/UIFlowHandbook | Translations/English/Lesson 01 - Power Cable.pages | `3.2.13` | `M7.3-5989-2` | 4 |  |  |  |  | 5 |  |  | 1 | 1 |  |  |  |  | 1 | 21 |  |
| andy489/Software_Engineering_State_Exam | assets/past exams/2010/2010-07-15/3-Java.pages | `12.1.1` | `M12.1-7034.0.86-2` | 4 |  |  |  |  | 2 |  |  | 1 | 1 |  |  |  |  | 1 | 19 |  |
| andy489/Data_Structures_and_Algorithms | assets/1 – FMI Data Structures & Algorithms/07–week/07–09 Keys and Rooms.pages | `11.1.2` | `M11.1-7031.0.102-2` | 4 |  |  |  |  | 1 |  |  | 2 | 1 |  |  |  |  | 1 | 21 |  |
| andy489/Empirical_Methods_and_Statistics | _asset/_exer/week 01/R/R02. BasicSyntax.pages | `13.1.2` | `M13.1-7037.0.101-2` | 4 |  |  | 1 |  | 1 |  |  |  | 1 |  |  |  |  | 1 | 26 |  |
| andy489/Data_Structures_and_Algorithms | assets/1 – FMI Data Structures & Algorithms/08–week/08–06 Course Schedule II.p | `11.1.2` | `M11.1-7031.0.102-2` | 4 |  |  |  |  | 1 |  |  | 2 | 1 |  |  |  |  | 1 | 21 |  |
| andy489/Software_Engineering_State_Exam | assets/past exams/2014/2014-09-11/2.pages | `12.1.1` | `M12.1-7034.0.86-2` | 4 |  |  |  |  | 2 |  |  | 1 | 1 |  |  |  |  | 1 | 19 |  |
| glennlopez/CS50.HarvardX | pset4/2018/whodunit/whodoneit_notes.pages | `2.4.4` | `M7.0-5576-2` | 4 |  |  |  | 1 | 1 |  |  |  | 1 |  |  |  |  | 1 | 36 |  |
| lazypic/tdcourse | report/report.pages | `3.2.13` | `M7.3-5989-2` | 4 |  |  |  |  | 1 |  |  | 1 | 1 |  |  |  |  | 1 | 19 |  |
| jasonwu0731/AI-Pacman | Pacman/hw2-multiagent/documentation.pages | `2.0.24` | `M5.6.2-2573-1` | 4 |  |  |  | 1 | 1 |  |  |  | 1 |  |  |  |  | 1 | 21 |  |
| ContextLab/human-memory | problem sets/previous years/problem set 3/ps3_2016.pages | `2.0.24` | `M5.6.1-2562-1` | 4 |  |  | 1 | 2 |  |  |  |  | 1 |  |  |  |  | 1 | 25 |  |
| coderdojo-japan/coderdojo.jp | public/docs/questions-to-join-champions.pages | `3.2.13` | `M7.3-5989-2` | 4 |  |  |  | 2 | 1 |  |  |  | 1 |  |  |  |  | 1 | 21 |  |
| ContextLab/human-memory | problem sets/previous years/problem set 1/ps1_2016.pages | `2.0.43` | `M6.0.5-4052-1` | 4 |  |  |  | 2 |  |  |  | 1 | 1 |  |  |  |  | 1 | 31 |  |
| andy489/Empirical_Methods_and_Statistics | _asset/_exer/week 01/R/R06. Packages.pages | `13.1.2` | `M13.1-7037.0.101-2` | 4 |  |  | 1 |  | 1 |  |  |  | 1 |  |  |  |  | 1 | 19 |  |
| RajaSrinivasan/assignments | src/exec.pages | `10.0.10` | `M10.0-6748-2` | 4 |  |  |  |  |  |  |  | 1 | 1 |  |  | 2 |  | 1 | 21 |  |
| RajaSrinivasan/assignments | src/numbers.pages | `10.0.10` | `M10.0-6748-2` | 4 |  |  |  |  |  |  |  | 4 | 1 |  |  | 3 |  | 1 | 19 |  |
| johndbritton/teleport | Readme.pages | `1.5.0` | `M5.5.2-2120-1` | 4 |  |  | 1 |  |  |  |  | 10 | 1 |  |  |  |  | 1 | 73 |  |
| RajaSrinivasan/assignments | src/crc.pages | `4.0.13` | `M8.0-6194-2` | 4 |  |  |  |  |  |  |  | 3 | 1 |  |  | 2 |  | 1 | 19 |  |
| LumingYin/QuickCaption | Caption/Credits/QuickCaption_Acknowledgements.pages | `4.0.13` | `M8.0-6194-2` | 4 |  |  |  |  |  |  |  | 5 | 1 |  |  |  | 3 | 1 | 22 |  |
| rstudio/r-community-survey | 2020/2020 Survey Changes.pages | `10.2.3` | `M10.3.5-7029.5.5-2` | 4 |  |  |  | 1 | 1 |  |  |  | 1 |  |  |  |  | 1 | 21 |  |
| andy489/Empirical_Methods_and_Statistics | _asset/_exer/week 01/R/R10. Verzani Problem Set.pages | `13.1.2` | `M13.1-7037.0.101-2` | 4 |  |  |  |  | 1 |  |  | 1 | 1 |  |  |  |  | 1 | 19 |  |
| pooriaazimi/BetterDictionary | Installers/BetterDictionary-0.992/Installation Guide.pages | `1.5.0` | `M5.5.1-2111-1` | 4 |  |  | 1 |  |  |  |  | 3 | 1 |  |  |  |  | 1 | 19 |  |
| RajaSrinivasan/assignments | src/codex.pages | `10.0.10` | `M10.0-6748-2` | 4 |  |  | 2 |  |  |  |  |  | 1 |  |  | 1 |  | 1 | 23 |  |
| SiliconDojo/Online-Classes | Python - REST API's, Requests and JSON/Python - REST API’s, Requests and JSON  | `14.1.1` | `M14.1-7040.0.73-4` | 4 |  |  |  |  | 3 |  |  | 3 | 1 |  |  |  |  | 1 | 19 |  |
| muscly/UnityCleanEmptyDirectories | Documents/User Guide.pages | `1.5.0` | `M5.5-2109-1` | 4 |  |  | 2 |  |  |  |  | 2 | 1 |  |  |  |  | 3 | 24 |  |
| opetchey/RREEBES | poster/RRJC poster.pages | `1.5.0` | `M5.5.2-2120-1` | 4 |  |  | 1 |  |  |  |  | 1 | 1 |  |  |  |  | 1 | 23 |  |
| SiliconDojo/Online-Classes | Hacking Introduction/Hacking Introduction.pages | `14.2.2` | `M14.2-7041.0.109-4` | 4 |  |  |  |  | 3 |  |  | 8 | 1 |  |  |  |  | 1 | 27 |  |
| BrooksResearchGroup-UM/pyCHARMM-Workshop | Notes/pyCHARMMWorkshop.pages | `12.0.8` | `M12.0-7033.0.134-2` | 4 |  |  |  | 2 | 1 |  |  |  | 1 |  |  |  |  | 1 | 29 |  |
| SwiftEducation/teaching-app-dev-swift | Overview/LessonPlanOverview.pages | `1.5.0` | `M5.5.3-2152-2` | 4 |  |  |  | 1 | 1 |  |  |  | 1 |  |  |  |  | 1 | 27 |  |
| artoolkit/ARToolKit5 | AndroidStudioProjects/Docs/AS_Migration.pages | `2.0.24` | `M5.6.1-2562-1` | 4 |  |  |  |  |  |  |  | 10 | 7 |  |  |  |  | 1 | 194 |  |
| SiliconDojo/Online-Classes | JavaScript - REST API's and User Data on the Client Side/JavaScript - REST API | `14.2.2` | `M14.2-7041.0.109-4` | 4 |  |  |  |  | 3 |  |  | 5 | 1 |  |  |  |  | 1 | 21 |  |
| SiliconDojo/Online-Classes | Python - RegEx and Data Parsing/Python - RegEx and Data Parsing.pages | `14.2.2` | `M14.2-7041.0.109-4` | 4 |  |  |  |  | 3 |  |  |  | 1 |  |  | 3 |  | 1 | 43 |  |
| andy489/Software_Engineering_State_Exam | assets/12/OOP Design Patterns.pages | `12.1.1` | `M12.1-7034.0.86-2` | 4 |  |  |  |  | 2 |  |  | 1 | 1 |  |  |  |  | 1 | 50 |  |
| EnvelopSound/EnvelopForLive | doc/Envelop for Live.pages | `13.1.2` | `M13.1-7037.0.101-2` | 4 |  |  | 1 |  |  |  |  | 2 | 1 |  |  |  |  | 1 | 25 |  |
| andy489/Software_Engineering_State_Exam | assets/past exams/2021/2021-09-08/2.pages | `12.2.8` | `M12.2-7035.0.159-2` | 4 |  |  | 1 |  |  |  |  |  | 1 |  |  | 3 |  | 1 | 23 |  |
| andy489/Software_Engineering_State_Exam | assets/12/SOLID Principles.pages | `12.2.8` | `M12.2.1-7035.0.161-2` | 4 |  |  |  |  | 2 |  |  | 1 | 1 |  |  |  |  | 1 | 27 |  |
| SwiftEducation/teaching-app-dev-swift | Overview/CourseOverview.pages | `2.0.24` | `M5.6.1-2562-1` | 4 |  |  |  | 1 | 1 |  |  |  | 1 |  |  |  |  | 1 | 32 |  |
| scateu/tsv_edl.vim | docs/tsv_edl_refcard.pages | `12.2.8` | `M12.2.1-7035.0.161-2` | 4 |  |  |  |  | 2 |  |  |  | 1 |  |  | 5 |  | 1 | 36 |  |
| hollance/TheKissOfShame | UserGuide.pages | `14.0.1` | `M14.0-7039.0.94-4` | 4 |  |  | 2 |  |  |  |  | 5 | 1 |  |  |  |  | 1 | 23 |  |
| eseedo/iOSCourse | iOS Basic/iOS12+Swift4.2/Series1/Pages/让不懂编程的人爱上iPhone开发(2018秋iOS12+Swift4.2+X | `3.2.13` | `M7.3-5989-2` | 4 |  |  | 3 |  |  |  |  | 3 | 1 |  |  |  |  | 1 | 19 |  |
| andy489/Data_Structures_and_Algorithms | assets/2 – Data Structures/KD Tree/2D Tree.pages | `11.1.2` | `M11.1-7031.0.102-2` | 4 |  |  | 46 |  |  |  |  |  | 1 |  |  |  | 73 | 1 | 92 |  |
| fandango-fuzzer/fandango | docs/Title.pages | `14.4.1` | `M14.4-7043.0.93-4` | 4 |  |  | 1 |  |  |  |  |  | 1 |  |  |  | 4 | 1 | 23 |  |
| andy489/Empirical_Methods_and_Statistics | _asset/_exer/week 02/R/R02. Verzani Problem Set.pages | `13.1.2` | `M13.1-7037.0.101-2` | 4 |  |  | 12 |  | 1 |  |  |  | 1 |  |  |  |  | 1 | 19 |  |
| loyinglin/Codeforces | SAM/SAM.pages | `2.0.24` | `M5.6.2-2573-1` | 4 |  |  | 2 |  |  |  |  | 3 | 1 |  |  |  |  | 1 | 22 |  |
| fan2/FontType | 字体选样/中文字体-OS X.pages | `2.0.24` | `M5.6.2-2573-1` | 4 |  |  | 1 |  |  |  |  | 22 | 1 |  |  |  |  | 1 | 19 |  |
| andrejHurynovic/bsuirLabs | term5/ИиПУ/ИиПУ, № 2/ИиПУ, 2.pages | `11.2.9` | `M11.2-7032.0.145-2` | 4 |  |  | 4 |  |  |  | 1 |  | 1 |  |  |  |  | 3 | 41 |  |
| Rustaceans/rust-cologne | meetup-orga/Rust Cologne Sign.pages | `2.3.4` | `M6.3.1-5249-2` | 4 |  |  | 1 |  |  |  |  |  | 1 |  |  |  | 2 | 1 | 21 |  |
| Rustaceans/rust-cologne | meetup-orga/Rust Cologne Sign for ThoughtWorks.pages | `3.1.2` | `M7.1-5683-2` | 4 |  |  | 1 |  |  |  |  |  | 1 |  |  |  | 3 | 1 | 22 |  |
| eseedo/iOSCourse | iOS Basic/iOS12+Swift4.2/Series1/Pages/让不懂编程的人爱上iPhone开发(2018秋iOS12+Swift4.2+X | `3.2.13` | `M7.3-5989-2` | 4 |  |  | 4 |  |  |  |  | 5 | 1 |  |  |  |  | 1 | 27 |  |
| USCbiostats/software-dev | happy_scientist/seminars/2019-01_rstudio-and-r/material/2019-01_happy-scientis | `3.2.13` | `M7.3-5989-2` | 4 |  |  | 2 |  |  |  |  |  | 1 |  |  |  | 3 | 1 | 22 |  |
| andy489/Empirical_Methods_and_Statistics | _asset/_additional/Dice process.pages | `14.1.1` | `M14.1-7040.0.73-4` | 4 |  |  | 9 |  | 2 |  |  |  | 1 |  |  |  |  | 1 | 19 |  |
| Rustaceans/rust-cologne | meetup-orga/Rust Cologne Open Space.pages | `2.3.4` | `M6.3.1-5249-2` | 4 |  |  | 1 |  |  |  |  |  | 1 |  |  |  | 2 | 1 | 24 |  |
| moevm/oop | 8304/Butko_Artem/lab1/REPORT/report.pages | `4.2.3` | `M8.2.1-6529-2` | 4 |  |  |  |  | 1 |  |  |  | 1 |  |  | 1 |  | 1 | 25 |  |
| moevm/oop | 8304/Butko_Artem/lab4/REPORT/report4.pages | `10.0.10` | `M10.0-6748-2` | 4 |  |  |  |  | 1 |  |  |  | 1 |  |  | 2 |  | 1 | 23 |  |
| moevm/oop | 8304/Butko_Artem/lab7/REPORT/report7.pages | `10.0.10` | `M10.0-6748-2` | 4 |  |  |  |  | 1 |  |  |  | 1 |  |  | 2 |  | 1 | 23 |  |
| moevm/oop | 8304/Butko_Artem/lab5/REPORT/report5.pages | `10.0.10` | `M10.0-6748-2` | 4 |  |  |  |  | 1 |  |  |  | 1 |  |  | 2 |  | 1 | 23 |  |
| moevm/oop | 8304/Butko_Artem/lab6/REPORT/report6.pages | `10.0.10` | `M10.0-6748-2` | 4 |  |  |  |  | 1 |  |  |  | 1 |  |  | 2 |  | 1 | 24 |  |
| moevm/oop | 8304/Butko_Artem/lab3/REPORT/report3.pages | `10.0.10` | `M10.0-6748-2` | 4 |  |  |  |  | 1 |  |  |  | 1 |  |  | 2 |  | 1 | 23 |  |
| moevm/oop | 8304/Butko_Artem/lab2/REPORT/report2.pages | `4.2.3` | `M8.2.1-6529-2` | 4 |  |  |  |  | 1 |  |  |  | 1 |  |  | 2 |  | 1 | 23 |  |
| rougier/scientific-posters | src/2015-SBDM.pages | `1.5.0` | `M5.5.3-2152-2` | 4 |  | 4 | 6 |  |  |  |  |  | 1 |  |  |  |  | 1 | 32 |  |
| andy489/Empirical_Methods_and_Statistics | _asset/_additional/_inter/expected_bonus_win.pages | `14.4.1` | `M14.4-7043.0.93-4` | 4 |  |  | 9 |  | 1 |  |  |  | 1 |  |  |  |  | 1 | 23 |  |
| DreamOfTheRedChamber/system-design-interviews | companyArchitecture/Facebook Onsite 2019 System Design &amp;amp;&amp;amp; BQ.p | `11.2.9` | `M11.2-7032.0.145-2` | 4 |  |  |  |  |  |  |  | 4 | 1 |  |  |  | 3 | 1 | 28 |  |
| andy489/Empirical_Methods_and_Statistics | _asset/_exer/week 09/R/R09. Verzani Problem Set.pages | `13.1.2` | `M13.1-7037.0.101-2` | 4 |  |  | 18 |  | 1 |  |  |  | 1 |  |  |  |  | 1 | 19 |  |
| eseedo/iOSCourse | iOS Basic/iOS12+Swift4.2/Series1/Pages/让不懂编程的人爱上iPhone开发(2018秋iOS12+Swift4.2+X | `3.2.13` | `M7.3-5989-2` | 4 |  |  | 3 |  |  |  |  | 3 | 1 |  |  |  |  | 1 | 19 |  |
| andy489/Empirical_Methods_and_Statistics | _asset/_exer/week 09/R/R09. Confidence Interval Estimation Moodle Taks – Solut | `13.1.2` | `M13.1-7037.0.101-2` | 4 |  |  | 24 |  | 1 |  |  |  | 1 |  |  |  |  | 1 | 19 |  |
| USCbiostats/software-dev | happy_scientist/seminars/2019-02_debugging-and-profiling/materials/2019-02_hap | `3.2.13` | `M7.3-5989-2` | 4 |  |  | 2 |  |  |  |  |  | 1 |  |  |  | 3 | 1 | 22 |  |
| eseedo/iOSCourse | iOS Basic/iOS12+Swift4.2/Series1/Pages/让不懂编程的人爱上iPhone开发(2018秋iOS12+Swift4.2+X | `3.2.13` | `M7.3-5989-2` | 4 |  |  | 6 |  |  |  |  | 3 | 1 |  |  |  |  | 1 | 19 |  |
| eseedo/iOSCourse | iOS Basic/iOS12+Swift4.2/Series1/Pages/让不懂编程的人爱上iPhone开发(2018秋iOS12+Swift4.2+X | `3.2.13` | `M7.3-5989-2` | 4 |  |  | 5 |  |  |  |  | 4 | 1 |  |  |  |  | 1 | 19 |  |
| andrejHurynovic/bsuirLabs | term5/ИиПУ/ИиПУ, № 5/ИиПУ, № 5.pages | `11.2.9` | `M11.2-7032.0.145-2` | 4 |  |  | 3 |  |  |  |  | 9 | 1 |  |  |  |  | 1 | 27 |  |
| andy489/Empirical_Methods_and_Statistics | _asset/_exer/week 06/R/R06. Verzani Problem Set.pages | `13.1.2` | `M13.1-7037.0.101-2` | 4 |  |  | 23 |  | 1 |  |  |  | 1 |  |  |  |  | 1 | 19 |  |
| eseedo/iOSCourse | iOS Basic/iOS12+Swift4.2/Series1/Pages/让不懂编程的人爱上iPhone开发(2018秋iOS12+Swift4.2+X | `3.2.13` | `M7.3-5989-2` | 4 |  |  | 6 |  |  |  |  | 2 | 1 |  |  |  |  | 1 | 19 |  |
| m-soro/Business-Analytics | Welcome-to-the-Nanodegree-Program/project.pages | `10.2.3` | `M10.2-7028.0.88-6` | 4 |  | 1 | 3 |  |  |  |  |  | 1 |  |  |  |  | 1 | 19 |  |
| m-soro/Business-Analytics | _site/Welcome-to-the-Nanodegree-Program/project.pages | `10.2.3` | `M10.2-7028.0.88-6` | 4 |  | 1 | 3 |  |  |  |  |  | 1 |  |  |  |  | 1 | 19 |  |
| fan2/FontType | 字体知识/中文字体分类1.pages | `2.0.24` | `M5.6.2-2573-1` | 4 |  |  | 16 |  |  |  |  | 10 | 1 |  |  |  |  | 3 | 71 |  |
| USCbiostats/software-dev | happy_scientist/seminars/2019-03_building-r-packages/2019-03_happy-scientist-f | `3.2.13` | `M7.3-5989-2` | 4 |  |  | 2 |  |  |  |  |  | 1 |  |  |  | 3 | 1 | 22 |  |
| USCbiostats/software-dev | happy_scientist/seminars/2019-03_building-r-packages/materials/2019-03_happy-s | `3.2.13` | `M7.3-5989-2` | 4 |  |  | 2 |  |  |  |  |  | 1 |  |  |  | 3 | 1 | 22 |  |
| andy489/Empirical_Methods_and_Statistics | _asset/_exer/week 03/R/R04. Moodle Task Solutions.pages | `13.1.2` | `M13.1-7037.0.101-2` | 4 |  |  | 29 |  | 1 |  |  |  | 1 |  |  |  |  | 1 | 26 |  |
| ecocurious2/MultiGeiger | docs/hardware/Heltec_Kit32_Diff.pages | `4.1.7` | `M8.1-6369-2` | 4 |  | 4 | 4 |  |  |  |  |  | 1 |  |  |  |  | 1 | 19 |  |
| andrejHurynovic/bsuirLabs | term5/СхемТ/СхемТ, 2/СхемТ, 2.pages | `11.2.9` | `M11.2-7032.0.145-2` | 4 |  |  | 9 |  |  |  |  | 2 | 1 |  |  |  |  | 3 | 24 |  |
| chenyang1999/MyComputerCollegeCourses | 大学物理/大学物理Ⅱ1A.pages | `2.3.4` | `M6.3.1-5249-2` | 4 |  |  | 36 |  |  |  |  |  | 1 |  |  |  | 2 | 1 | 25 |  |
| stpope/CSL6 | Doc/classes.pages | `4.1.7` | `M8.1-6369-2` | 4 |  |  | 2 |  |  |  |  |  | 1 |  |  |  | 1 | 1 | 20 |  |
| andy489/Empirical_Methods_and_Statistics | _asset/_additional/Dices with same distribution.pages | `13.0.2` | `M13.0-7036.0.126-2` | 4 |  |  | 37 |  |  |  |  |  | 1 |  |  | 1 |  | 1 | 21 |  |
| DjangoGirls/resources | Design/flyer/Flyer-Django.pages | `2.0.24` | `M5.6.1-2562-1` | 4 |  | 1 | 1 |  |  |  |  |  | 1 |  |  |  |  | 1 | 20 |  |
| andy489/Empirical_Methods_and_Statistics | _asset/_exer/week 01/R/R08. DescriptiveStatistics.pages | `13.1.2` | `M13.1-7037.0.101-2` | 4 |  |  | 40 |  | 1 |  |  |  | 1 |  |  |  |  | 1 | 21 |  |
| jeremygibbs/LES | Course Documents/les.pages | `2.0.24` | `M5.6.2-2573-1` | 4 |  | 1 | 1 |  |  |  |  |  | 1 |  |  |  |  | 1 | 23 |  |
| devoxx4kids/materials | workshops/minecraft/course/Day8.pages | `1.5.0` | `M5.5.3-2152-2` | 4 |  |  | 1 | 1 |  |  |  |  | 1 |  |  |  |  | 1 | 37 |  |
| devoxx4kids/materials | workshops/minecraft/course/Day7.pages | `1.5.0` | `M5.5.3-2152-2` | 4 |  |  | 1 | 1 |  |  |  |  | 1 |  |  |  |  | 1 | 30 |  |
| ChangWinde/SouthEastUniversity | 大二/IO/IO实验/汇编实验/71113211.pages | `1.5.0` | `M5.5.2-2120-1` | 4 |  | 1 | 10 |  |  |  |  |  | 1 |  |  |  |  | 1 | 34 |  |
| devoxx4kids/materials | workshops/minecraft/course/Day3.pages | `1.5.0` | `M5.5.3-2152-2` | 4 |  |  | 1 | 1 |  |  |  |  | 1 |  |  |  |  | 1 | 23 |  |
| devoxx4kids/materials | workshops/minecraft/course/Day4.pages | `1.5.0` | `M5.5.3-2152-2` | 4 |  |  | 1 | 1 |  |  |  |  | 1 |  |  |  |  | 1 | 27 |  |
| devoxx4kids/materials | workshops/minecraft/course/Day6.pages | `1.5.0` | `M5.5.3-2152-2` | 4 |  |  | 1 | 1 |  |  |  |  | 1 |  |  |  |  | 1 | 25 |  |
| devoxx4kids/materials | workshops/minecraft/course/Day2.pages | `1.5.0` | `M5.5.3-2152-2` | 4 |  |  | 1 | 1 |  |  |  |  | 1 |  |  |  |  | 1 | 31 |  |
| SiliconDojo/Online-Classes | Coding DIY - Build Network Monitoring Web Apps/Coding DIY - Build Network Moni | `14.1.1` | `M14.1-7040.0.73-4` | 4 |  |  | 10 |  | 3 |  |  |  | 1 |  |  |  |  | 1 | 21 |  |
| devoxx4kids/materials | workshops/minecraft/course/Day5.pages | `1.5.0` | `M5.5.3-2152-2` | 4 |  |  | 1 | 1 |  |  |  |  | 1 |  |  |  |  | 1 | 29 |  |
| devoxx4kids/materials | workshops/minecraft/course/Day9.pages | `1.5.0` | `M5.5.3-2152-2` | 4 |  |  | 1 | 1 |  |  |  |  | 1 |  |  |  |  | 1 | 39 |  |
| andy489/Empirical_Methods_and_Statistics | _asset/_exer/week 02/R/R01. Univariate Data.pages | `13.1.2` | `M13.1-7037.0.101-2` | 4 |  |  | 30 |  | 1 |  |  |  | 1 |  |  |  |  | 1 | 38 |  |
| andy489/Empirical_Methods_and_Statistics | _asset/_exer/week 11/R/R11. Verzani Problem Set.pages | `13.1.2` | `M13.1-7037.0.101-2` | 4 |  |  | 48 |  | 1 |  |  |  | 1 |  |  |  |  | 1 | 19 |  |
| HiveChat/hive-desktop | other_files/release_files/Help Doc.pages | `2.0.24` | `M5.6.2-2573-1` | 4 |  |  | 3 |  |  |  |  | 2 | 1 |  |  |  |  | 1 | 23 |  |
| eseedo/iOSCourse | iOS Basic/iOS12+Swift4.2/Series1/Pages/让不懂编程的人爱上iPhone开发(2018秋iOS12+Swift4.2+X | `3.2.13` | `M7.3-5989-2` | 4 |  |  | 7 |  |  |  |  | 2 | 1 |  |  |  |  | 1 | 27 |  |
| andy489/Empirical_Methods_and_Statistics | _asset/_exer/week 10/R/R10. Verzani Problem Set.pages | `13.1.2` | `M13.1-7037.0.101-2` | 4 |  |  | 67 |  | 1 |  |  |  | 1 |  |  |  |  | 1 | 24 |  |
| Telecominfraproject/OpenCellular | hardware/connect-1/docs/Battery Cable re-work.pages | `2.1.7` | `M6.1.1-4338-1` | 4 |  | 2 | 2 |  |  |  |  |  | 1 |  |  |  |  | 1 | 22 |  |
| DoubleSpeak/GitDiff9 | LineNumberPlugin.pages | `2.1.7` | `M6.1.1-4338-1` | 4 |  |  | 2 |  |  |  |  | 3 | 1 |  |  |  |  | 1 | 23 |  |
| johnno1962/GitDiff | LineNumberPlugin.pages | `2.1.7` | `M6.1.1-4338-1` | 4 |  |  | 2 |  |  |  |  | 3 | 1 |  |  |  |  | 1 | 23 |  |
| Naman-ntc/Action-Recognition | Ground-Truth-Skeletons/reports/midTermReport.pages | `2.3.4` | `M6.3.1-5249-2` | 4 |  |  | 3 |  |  |  |  | 1 | 1 |  |  |  |  | 1 | 21 |  |
| wangshuaidavid/DLNA_iOS_Platinum | pltDescription.pages | `2.0.24` | `M5.6.1-2562-1` | 4 |  | 1 | 8 |  |  |  |  |  | 1 |  |  |  |  | 1 | 19 |  |
| zzamboni/emacs-org-leanpub | covers/20200613.pages | `10.0.10` | `M10.0-6748-2` | 4 |  |  | 1 |  |  |  |  |  | 1 |  |  |  | 1 | 1 | 20 |  |
| andy489/Empirical_Methods_and_Statistics | _asset/_exer/week 04/R/R01. Multivariate Data.pages | `13.1.2` | `M13.1-7037.0.101-2` | 4 |  |  | 96 |  | 1 |  |  |  | 1 |  |  |  |  | 1 | 21 |  |
| eseedo/iOSCourse | iOS Basic/iOS12+Swift4.2/Series1/Pages/让不懂编程的人爱上iPhone开发(2018秋iOS12+Swift4.2+X | `3.2.13` | `M7.3-5989-2` | 4 |  |  | 10 |  |  |  |  | 2 | 1 |  |  |  |  | 1 | 19 |  |
| eseedo/iOSCourse | iOS Basic/iOS12+Swift4.2/Series1/Pages/让不懂编程的人爱上iPhone开发(2018秋iOS12+Swift4.2+X | `3.2.13` | `M7.3-5989-2` | 4 |  |  | 16 |  |  |  |  | 2 | 1 |  |  |  |  | 1 | 19 |  |
| andy489/Empirical_Methods_and_Statistics | _asset/_exer/week 03/Exer 3 - sols 1-7.pages | `11.1.2` | `M11.1-7031.0.102-2` | 4 |  |  | 108 |  | 1 |  |  |  | 1 |  |  |  |  | 1 | 34 |  |
| eseedo/iOSCourse | iOS Basic/iOS12+Swift4.2/Series1/Pages/让不懂编程的人爱上iPhone开发(2018秋iOS12+Swift4.2+X | `3.2.13` | `M7.3-5989-2` | 4 |  |  | 41 |  |  |  |  | 6 | 1 |  |  |  |  | 1 | 19 |  |
| andy489/Empirical_Methods_and_Statistics | _asset/Combinatorics 102 (Andrescu, Feng)/Combinatorics 102.pages | `14.4.1` | `M14.4-7043.0.93-4` | 4 |  |  | 191 |  |  |  |  |  | 1 |  |  |  | 10 | 1 | 53 |  |
| andy489/Empirical_Methods_and_Statistics | _asset/_exer/week 05/5. Bayes formula, geom prob - sols 1-7.pages | `13.1.2` | `M13.1-7037.0.101-2` | 4 |  |  | 145 |  | 1 |  |  |  | 1 |  |  |  |  | 1 | 25 |  |
| ideasonpurpose/ansible-playbooks | envelope.pages | `3.2.13` | `M7.3-5989-2` | 3 |  |  |  |  |  |  |  |  | 1 |  |  |  | 1 | 1 | 20 |  |
| chandan-u/graph-based-recommendation-system | docs/report.pages | `2.0.43` | `M6.0.5-4052-1` | 3 |  |  |  | 6 |  |  |  |  | 1 |  |  |  |  | 1 | 19 |  |
| duartegroup/autodE | autode/common/logo.pages | `4.0.13` | `M8.0-6194-2` | 3 |  |  |  |  |  |  |  |  | 1 |  |  |  | 6 | 1 | 25 |  |
| galaxyproject/training-material | topics/statistics/images/Conv_ReLU.pages | `4.2.3` | `M8.2-6520-2` | 3 |  |  |  |  |  |  |  |  | 1 |  |  | 2 |  | 1 | 19 |  |
| FMSoftCN/hybridos | docs/design/hybridos-gui-shell.pages | `10.1.8` | `M10.1-6913-2` | 3 |  |  |  |  |  |  |  |  | 1 |  |  |  | 8 | 1 | 27 |  |
| stephanrauh/ngx-extended-pdf-viewer | projects/showcase/src/assets/pdfs/Introduction.pages | `4.0.13` | `M8.0-6194-2` | 3 |  |  |  |  |  |  |  | 1 | 1 |  |  |  |  | 1 | 19 |  |
| feature-creeps/observability-workshop | docs/material/olly_as_scale.pages | `10.2.3` | `M10.3.9-7029.9.8-4` | 3 |  |  |  |  |  |  |  |  | 1 |  |  |  | 15 | 1 | 34 |  |
| fan2/FontType | Font-Type/HanHeiSC/macOS_Sierra-PingFangSC.pages | `2.0.24` | `M5.6.2-2573-1` | 3 |  |  |  |  |  |  |  | 1 | 1 |  |  |  |  | 1 | 21 |  |
| algoquant/lecture_slides | figure/CPPI.pages | `11.2.9` | `M11.2-7032.0.145-2` | 3 |  |  |  |  |  |  |  |  | 1 |  |  |  | 21 | 1 | 40 |  |
| galaxyproject/training-material | topics/statistics/images/Conv_single_input_channel.pages | `4.2.3` | `M8.2-6520-2` | 3 |  |  |  |  |  |  |  |  | 1 |  |  | 3 |  | 1 | 19 |  |
| gprMax/gprMax | docs/source/images/editables/abcs.pages | `1.5.0` | `M5.5.3-2152-2` | 3 |  | 1 | 1 |  |  |  |  |  | 1 |  |  |  |  |  | 31 |  |
| andy489/Empirical_Methods_and_Statistics | _asset/_exer/week 01/R/R05. MissingData.pages | `13.1.2` | `M13.1-7037.0.101-2` | 3 |  |  |  |  | 1 |  |  |  | 1 |  |  |  |  | 1 | 21 |  |
| cysouw/pandoc-ling | figure/ExampleStructure.pages | `10.2.3` | `M10.3.5-7029.5.5-2` | 3 |  |  |  |  |  |  |  |  | 1 |  |  |  | 20 | 1 | 39 |  |
| Drapegnik/bsu | numerical-analysis/sem3/lab2/lab2.pages | `2.0.24` | `M5.6-2553-2` | 3 |  |  | 3 |  |  |  |  |  | 1 |  |  |  |  | 1 | 21 |  |
| RajaSrinivasan/assignments | src/spm.pages | `4.1.7` | `M8.1-6369-2` | 3 |  |  |  |  |  |  |  |  | 1 |  |  | 2 |  | 1 | 19 |  |
| UniversityOfPlymouthComputing/MobileDev-XamarinForms | docs/Chapters/Chapter_3_Navigation/img/reference and value types.pages | `4.2.3` | `M8.2.1-6529-2` | 3 |  |  |  |  |  |  |  |  | 1 |  |  |  | 102 | 1 | 121 |  |
| jamessa/Pragmatic | layout/blank layout.pages | `11.2.9` | `M11.2-7032.0.145-2` | 3 |  |  | 6 |  |  |  |  |  | 1 |  |  |  |  | 1 | 19 |  |
| Drapegnik/bsu | numerical-analysis/sem3/lab1/lab1.pages | `2.0.24` | `M5.6-2553-2` | 3 |  |  | 5 |  |  |  |  |  | 1 |  |  |  |  | 1 | 21 |  |
| paulnguyen/cmpe281 | labs/lab3/doc/CMPE 281 - LAB #3 - Docker Grails & MySQL.pages | `10.0.10` | `M10.0-6748-2` | 3 |  |  |  |  |  |  |  | 8 | 1 |  |  |  |  | 1 | 32 |  |
| PacktPublishing/Complete-Python-Course-with-10-Real-World-Projects | Resources/5.The Basics_Functions and Conditionals/5.More String Formatting.pag | `12.2.8` | `M12.2-7035.0.159-2` | 3 |  |  | 1 |  |  |  |  |  | 1 |  |  |  |  | 1 | 19 |  |
| andy489/Empirical_Methods_and_Statistics | _asset/_exer/week 01/R/R03. DataTypes.pages | `13.1.2` | `M13.1-7037.0.101-2` | 3 |  |  |  |  | 1 |  |  |  | 1 |  |  |  |  | 1 | 29 |  |
| m-soro/Business-Analytics | Data-Visualization/L5-Project-Build-Data-Dashboard/Misc/flight-delays/project_ | `10.2.3` | `M10.3.5-7029.5.5-2` | 3 |  |  |  |  |  |  |  | 9 | 1 |  |  |  |  | 1 | 21 |  |
| m-soro/Business-Analytics | _site/Data-Visualization/L5-Project-Build-Data-Dashboard/Misc/flight-delays/pr | `10.2.3` | `M10.3.5-7029.5.5-2` | 3 |  |  |  |  |  |  |  | 9 | 1 |  |  |  |  | 1 | 21 |  |
| ContextLab/computational-neuroscience | misc/evaluation.pages | `3.2.13` | `M7.2-5869-2` | 3 |  |  |  |  |  |  |  |  | 1 |  |  |  | 1 | 1 | 54 |  |
| bryceco/GoMap | Architecture.pages | `26.1.0` | `M15.2.1-7048.0.3-2` | 3 |  |  |  |  |  |  |  |  | 1 |  |  |  | 29 | 1 | 49 |  |
| paulnguyen/cmpe281 | labs/lab5/doc/CMPE 281 - LAB #5 - AWS NoSQL MongoDB Cluster.pages | `10.0.10` | `M10.0-6748-2` | 3 |  |  |  |  |  |  |  | 7 | 1 |  |  |  |  | 1 | 32 |  |
| paulnguyen/cmpe281 | labs/lab8/doc/CMPE 281 - LAB #8 - Go Gumball + API Backing Services.pages | `10.0.10` | `M10.0-6748-2` | 3 |  |  |  |  |  |  |  | 2 | 1 |  |  |  |  | 1 | 35 |  |
| RajaSrinivasan/assignments | src/hello.pages | `3.2.13` | `M7.3-5989-2` | 3 |  |  |  |  |  |  |  |  | 1 |  |  | 2 |  | 1 | 19 |  |
| RajaSrinivasan/assignments | src/diary.pages | `4.1.7` | `M8.1-6369-2` | 3 |  |  |  |  |  |  |  |  | 1 |  |  | 2 |  | 1 | 19 |  |
| andy489/Empirical_Methods_and_Statistics | _asset/_exer/week 01/R/R09. Examples.pages | `13.1.2` | `M13.1-7037.0.101-2` | 3 |  |  |  |  | 1 |  |  |  | 1 |  |  |  |  | 1 | 19 |  |
| paulnguyen/cmpe281 | labs/lab7/doc/CMPE 281 - LAB #7 - Go Gumball + MySQL & Kong.pages | `10.0.10` | `M10.0-6748-2` | 3 |  |  |  |  |  |  |  | 2 | 1 |  |  |  |  | 1 | 52 |  |
| RajaSrinivasan/assignments | src/disign.pages | `4.2.3` | `M8.2.1-6529-2` | 3 |  |  |  |  |  |  |  |  | 1 |  |  | 3 |  | 1 | 19 |  |
| paulnguyen/cmpe281 | labs/lab4/doc/CMPE 281 - LAB #4 - Docker Starbucks API.pages | `10.0.10` | `M10.0-6748-2` | 3 |  |  |  |  |  |  |  | 13 | 1 |  |  |  |  | 1 | 34 |  |
| RajaSrinivasan/assignments | src/ipadr.pages | `4.1.7` | `M8.1-6369-2` | 3 |  |  |  |  |  |  |  |  | 1 |  |  | 2 |  | 1 | 19 |  |
| galaxyproject/training-material | topics/statistics/images/Conv_multiple_input_channel.pages | `4.2.3` | `M8.2-6520-2` | 3 |  |  |  |  |  |  |  |  | 1 |  |  | 10 |  | 1 | 19 |  |
| AlexandruPaul21/CS-UBB | Year01/1st semester/FP/Laborator/Lab7-9/AnalizaFP.pages | `11.2.9` | `M11.2-7032.0.145-2` | 3 |  |  | 1 |  |  |  |  |  | 1 |  |  |  |  | 1 | 19 |  |
| andy489/Linux_Shell | assets/Exam/Examples Task 01 Exam 12-07-2020.pages | `11.1.2` | `M11.1-7031.0.102-2` | 3 |  |  |  |  |  |  |  |  | 1 |  |  |  | 2 | 1 | 21 |  |
| RajaSrinivasan/assignments | src/search.pages | `4.0.13` | `M8.0-6194-2` | 3 |  |  |  |  |  |  |  |  | 1 |  |  | 3 |  | 1 | 19 |  |
| iRASPA/iRASPA-QT | iraspa/datafiles/acknowledgedlicenses.pages | `11.2.9` | `M11.2-7032.0.145-2` | 3 |  |  |  |  |  |  |  | 5 | 1 |  |  |  |  | 1 | 21 |  |
| RajaSrinivasan/assignments | src/cshare.pages | `4.2.3` | `M8.2.1-6529-2` | 3 |  |  |  |  |  |  |  |  | 1 |  |  | 3 |  | 1 | 19 |  |
| paulnguyen/cmpe281 | labs/lab2/doc/CMPE 281 - LAB #2 - Elastic Load Balancer.pages | `10.0.10` | `M10.0-6748-2` | 3 |  |  |  |  |  |  |  | 21 | 1 |  |  |  |  | 1 | 29 |  |
| SiliconDojo/Online-Classes | Cyber Security for Programmers/Cyber Security for Programmers.pages | `14.2.2` | `M14.2-7041.0.109-4` | 3 |  |  |  |  |  |  |  | 8 | 1 |  |  |  |  | 1 | 19 |  |
| RajaSrinivasan/assignments | src/srctrace.pages | `4.2.3` | `M8.2-6520-2` | 3 |  |  |  |  |  |  |  |  | 1 |  |  | 3 |  | 1 | 19 |  |
| paulnguyen/cmpe281 | labs/lab6/doc/CMPE 281 - LAB #6 - AWS NoSQL Riak Cluster.pages | `10.0.10` | `M10.0-6748-2` | 3 |  |  |  |  |  |  |  | 23 | 1 |  |  |  |  | 1 | 35 |  |
| andy489/Empirical_Methods_and_Statistics | _asset/_exer/week 01/R/R07. ReadingData.pages | `13.1.2` | `M13.1-7037.0.101-2` | 3 |  |  |  |  | 1 |  |  |  | 1 |  |  |  |  | 1 | 19 |  |
| SiliconDojo/Online-Classes | Python - Custom Functions and OS Module/Python - Custom Functions and OS Modul | `14.1.1` | `M14.1-7040.0.73-4` | 3 |  |  |  |  | 3 |  |  |  | 1 |  |  |  |  | 1 | 19 |  |
| RajaSrinivasan/assignments | src/dump.pages | `4.2.3` | `M8.2-6520-2` | 3 |  |  |  |  |  |  |  |  | 1 |  |  | 2 |  | 1 | 19 |  |
| SiliconDojo/Online-Classes | AI and Python - Web Scraping with OpenAI/AI and Python - Web Scraping with Ope | `14.1.1` | `M14.1-7040.0.73-4` | 3 |  |  |  |  | 3 |  |  |  | 1 |  |  |  |  | 1 | 19 |  |
| SiliconDojo/Online-Classes | CSS - Intro/CSS Introduction - Lab Book.pages | `14.1.1` | `M14.1-7040.0.73-4` | 3 |  |  |  |  | 3 |  |  |  | 1 |  |  |  |  | 1 | 19 |  |
| SiliconDojo/Online-Classes | TCP IP for Programmers - Online Class/TCP:IP for Programmers - Lab Book.pages | `14.1.1` | `M14.1-7040.0.73-4` | 3 |  |  |  |  | 3 |  |  |  | 1 |  |  |  |  | 1 | 19 |  |
| SiliconDojo/Online-Classes | Python - Bottle Framework for Web App Development/Python - Bottle Framework fo | `14.1.1` | `M14.1-7040.0.73-4` | 3 |  |  |  |  | 3 |  |  |  | 1 |  |  |  |  | 1 | 19 |  |
| tunds/SwiftUIiOSTakeHomeTest | Resources/Take Home Brief.pages | `12.0.8` | `M12.0-7033.0.134-2` | 3 |  |  |  |  |  |  |  | 2 | 1 |  |  |  |  | 1 | 23 |  |
| ContextLab/human-memory | admin/PSYC_51_syllabus.pages | `13.2.1` | `M13.2-7038.0.87-4` | 3 |  |  |  |  |  |  |  | 11 | 1 |  |  |  |  | 1 | 21 |  |
| RajaSrinivasan/assignments | src/password.pages | `4.0.13` | `M8.0-6194-2` | 3 |  |  |  |  |  |  |  |  | 1 |  |  | 3 |  | 1 | 20 |  |
| NinjasCL-archive/guia-webpay | webpay-kcc/examples/Evidencia Comercio.pages | `2.0.24` | `M5.6-2553-2` | 3 |  |  |  |  |  |  |  | 2 | 1 |  |  |  |  | 3 | 20 |  |
| captain-young/WYDocumentBrowser | DocumentBrowserDemo/Resource/Page.pages | `2.1.7` | `M6.1.1-4338-1` | 3 |  |  |  |  | 4 |  |  |  | 1 |  |  |  |  | 1 | 19 |  |
| packagesdev/unexpectedly | Documents Pages/Unexpectedly_Acknowledgements.pages | `2.0.24` | `M5.6.2-2573-1` | 3 |  |  |  |  |  |  |  | 1 | 1 |  |  |  |  | 1 | 20 |  |
| SiliconDojo/Online-Classes | AI and Python - Ollama for Local LLM AI Usage/AI and Python - Ollama for Local | `14.1.1` | `M14.1-7040.0.73-4` | 3 |  |  |  |  | 3 |  |  |  | 1 |  |  |  |  | 1 | 19 |  |
| andy489/Empirical_Methods_and_Statistics | _asset/_exer/week 01/R/R04. DataStructures.pages | `13.1.2` | `M13.1-7037.0.101-2` | 3 |  |  |  |  | 1 |  |  |  | 1 |  |  |  |  | 1 | 35 |  |
| kloimhardt/clj-tiles | docs/videotranscript.pages | `4.2.3` | `M8.2.1-6529-2` | 3 |  |  |  |  |  |  |  | 1 | 1 |  |  |  |  | 1 | 19 |  |
| ContextLab/human-memory | problem sets/previous years/problem set 2/ps2_2018.pages | `2.3.4` | `M6.3.1-5249-2` | 3 |  |  |  | 2 |  |  |  |  | 1 |  |  |  |  | 1 | 24 |  |
| slviajero/tinybasic | docs/components/KeyboardController.pages | `11.1.2` | `M11.1-7031.0.102-2` | 3 |  |  |  |  |  |  |  | 2 | 1 |  |  |  |  | 1 | 19 |  |
| ContextLab/human-memory | problem sets/previous years/problem set 2/ps2_2017.pages | `2.0.43` | `M6.0.5-4052-1` | 3 |  |  |  | 2 |  |  |  |  | 1 |  |  |  |  | 1 | 24 |  |
| SiliconDojo/Online-Classes | Python - SQL Introduction with SQLite/Python - SQL Introduction with SQLite -  | `14.1.1` | `M14.1-7040.0.73-4` | 3 |  |  |  |  | 3 |  |  |  | 1 |  |  |  |  | 1 | 19 |  |
| rsh249/bioinformatics | syllabus/syllabus_notes.pages | `2.4.4` | `M7.0.1-5579-2` | 3 |  |  |  |  |  |  |  | 1 | 1 |  |  |  |  | 1 | 36 |  |
| zhanglizeyi/CSE120 | homework/CSE120HW2.pages | `2.0.43` | `M6.0-3507-1` | 3 |  |  | 1 |  |  |  |  |  | 1 |  |  |  |  | 1 | 21 |  |
| SiliconDojo/Online-Classes | Python - Read and Write Files/Python- Read and Write Files - Lab Book.pages | `14.1.1` | `M14.1-7040.0.73-4` | 3 |  |  |  |  | 3 |  |  |  | 1 |  |  |  |  | 1 | 19 |  |
| SiliconDojo/Online-Classes | Python - Templates with Bottle Web App Framework/Python - Templates with Bottl | `14.2.2` | `M14.3-7042.0.76-4` | 3 |  |  |  |  | 3 |  |  |  | 1 |  |  |  |  | 1 | 19 |  |
| SiliconDojo/Online-Classes | HTML - Introduction/HTML: Introduction - Lab Book.pages | `14.1.1` | `M14.1-7040.0.73-4` | 3 |  |  |  |  | 3 |  |  |  | 1 |  |  |  |  | 1 | 19 |  |
| scateu/tsv_edl.vim | docs/tsv_edl_refcard_zh_CN.pages | `14.0.1` | `M14.0-7039.0.94-4` | 3 |  |  |  |  |  |  |  |  | 1 |  |  | 5 |  | 1 | 33 |  |
| stasi009/TakeHomeDataChallenges | 09.ClusterGrocery/report.pages | `2.0.24` | `M5.6.2-2573-1` | 3 |  |  | 1 |  |  |  |  |  | 1 |  |  |  |  | 1 | 19 |  |
| SiliconDojo/Online-Classes | Cloud Computing Intro/Cloud Computing Intro.pages | `14.2.2` | `M14.2-7041.0.109-4` | 3 |  |  |  |  | 2 |  |  |  | 1 |  |  |  |  | 1 | 23 |  |
| SiliconDojo/Online-Classes | HTML 5 API's with Javascript/HTML 5 API's with Javascript.pages | `14.2.2` | `M14.2-7041.0.109-4` | 3 |  |  |  |  | 3 |  |  |  | 1 |  |  |  |  | 1 | 19 |  |
| SiliconDojo/Online-Classes | Form Validation and Sanitization with Javascript and Python/Form Validation an | `14.2.2` | `M14.2-7041.0.109-4` | 3 |  |  |  |  | 3 |  |  |  | 1 |  |  |  |  | 1 | 21 |  |
| andrejHurynovic/bsuirLabs | term5/ИиПУ/ИиПУ, № 5/ИиПУ, 5.pages | `11.2.9` | `M11.2-7032.0.145-2` | 3 |  |  | 10 |  |  |  |  |  | 1 |  |  |  |  | 1 | 28 |  |
| SiliconDojo/Online-Classes | Python - Lists, Dictionaries and Loops/list dict loops lab book.pages | `14.1.1` | `M14.1-7040.0.73-4` | 3 |  |  |  |  | 3 |  |  |  | 1 |  |  |  |  | 1 | 25 |  |
| SiliconDojo/Online-Classes | AI and Python - OpenAI API Introduction /OpenAI API with Python Introduction - | `14.1.1` | `M14.1-7040.0.73-4` | 3 |  |  |  |  | 3 |  |  |  | 1 |  |  |  |  | 1 | 19 |  |
| hadley/stats337 | week-05/quotes.pages | `2.4.4` | `M7.0.1-5579-2` | 3 |  |  |  |  |  |  |  | 18 | 1 |  |  |  |  | 1 | 19 |  |
| PacktPublishing/Complete-Python-Course-with-10-Real-World-Projects | Resources/20.Interactive Data Visualization with Python and Bokeh/8.Solution_  | `12.2.8` | `M12.2-7035.0.159-2` | 3 |  |  | 1 |  |  |  |  |  | 1 |  |  |  |  | 1 | 19 |  |
| ChangWinde/SouthEastUniversity | 大二/OS/实验/71113211魏远卓2.pages | `1.5.0` | `M5.5.3-2152-2` | 3 |  |  | 1 |  |  |  |  |  | 1 |  |  |  |  | 1 | 21 |  |
| neondatabase/pgrag | exts/rag/test_res/test.pages | `14.1.1` | `M14.1-7040.0.73-4` | 3 |  |  | 1 |  |  |  |  |  | 1 |  |  |  |  | 1 | 21 |  |
| ChangWinde/SouthEastUniversity | 大二/Network/Network Experiment/魏远卓组/计算机网络实验报告1.pages | `1.5.0` | `M5.5.2-2120-1` | 3 |  |  | 1 |  |  |  |  |  | 1 |  |  |  |  | 1 | 19 |  |
| zhanglizeyi/CSE120 | StudyGuide.pages | `2.0.43` | `M6.0-3507-1` | 3 |  |  | 1 |  |  |  |  |  | 1 |  |  |  |  | 1 | 19 |  |
| andrejHurynovic/bsuirLabs | term5/ИиПУ/ИиПУ, № 4/ИиПУ, 4.pages | `11.2.9` | `M11.2-7032.0.145-2` | 3 |  |  | 11 |  |  |  |  |  | 1 |  |  |  |  | 1 | 19 |  |
| PacktPublishing/Complete-Python-Course-with-10-Real-World-Projects | Resources/20.Interactive Data Visualization with Python and Bokeh/5.Solution_  | `12.2.8` | `M12.2-7035.0.159-2` | 3 |  |  | 2 |  |  |  |  |  | 1 |  |  |  |  | 1 | 19 |  |
| PacktPublishing/Complete-Python-Course-with-10-Real-World-Projects | Resources/16.App 2_Building an English Thesaurus/16.Solution- Making Version 1 | `12.2.8` | `M12.2-7035.0.159-2` | 3 |  |  | 1 |  |  |  |  |  | 1 |  |  |  |  | 1 | 19 |  |
| PacktPublishing/Complete-Python-Course-with-10-Real-World-Projects | Resources/16.App 2_Building an English Thesaurus/14. Solution-Making Version 1 | `12.2.8` | `M12.2-7035.0.159-2` | 3 |  |  | 1 |  |  |  |  |  | 1 |  |  |  |  | 1 | 19 |  |
| Alfresco/alfresco-ng2-components | e2e/resources/adf/allFileTypes/file_unsupported.pages | `2.3.4` | `M6.3-5046-3` | 3 |  |  | 1 |  |  |  |  |  | 1 |  |  |  |  | 1 | 19 |  |
| peteryuanpan/notebook | 深入理解数据结构与算法/Codeforces/contest1187_problemD_任意升序排序数列A的子串能否变成B/data/1.pages | `2.3.4` | `M6.3.1-5249-2` | 3 |  |  |  |  |  |  |  |  | 1 |  |  |  | 36 | 1 | 55 |  |
| eseedo/iOSCourse | iOS Basic/iOS12+Swift4.2/Series1/Pages/让不懂编程的人爱上iPhone开发(2018秋iOS12+Swift4.2+X | `3.2.13` | `M7.3-5989-2` | 3 |  |  | 7 |  |  |  |  |  | 1 |  |  |  |  | 1 | 19 |  |
| leeqiang250/note | 知识点/BTC/BTC.pages | `4.1.7` | `M8.1-6369-2` | 3 |  |  |  |  |  |  |  | 2 | 1 |  |  |  |  | 1 | 19 |  |
| innovate-sabre/census-sis | choroplethr-course/pre-course documents/Participant Intro.pages | `2.3.4` | `M6.3.1-5249-2` | 3 |  |  |  |  |  |  |  | 3 | 1 |  |  |  |  | 1 | 19 |  |
| OmarElgabry/DesignPatterns | oo_design_patterns.pages | `1.5.0` | `M5.5.3-2152-2` | 3 |  |  | 15 |  |  |  |  |  | 1 |  |  |  |  | 1 | 55 |  |
| PacktPublishing/Complete-Python-Course-with-10-Real-World-Projects | Resources/15.App 1_Web Mapping with Python_Interactive Mapping of Population a | `12.2.8` | `M12.2-7035.0.159-2` | 3 |  |  | 2 |  |  |  |  |  | 1 |  |  |  |  | 1 | 19 |  |
| charlieblue17/timeseries2018 | syllabus.pages | `2.3.4` | `M6.3.1-5249-2` | 3 |  |  |  |  |  |  |  | 4 | 1 |  |  |  |  | 1 | 23 |  |
| andrejHurynovic/bsuirLabs | term5/СхемТ/СхемТ, 3 /СхемТ, 3.pages | `11.2.9` | `M11.2-7032.0.145-2` | 3 |  |  | 7 |  |  |  |  |  | 1 |  |  |  |  | 3 | 24 |  |
| Nikhil-Kasukurthi/Counting-people-video | Museum Analytics.pages | `2.3.4` | `M6.3.1-5249-2` | 3 |  |  |  |  |  |  |  | 2 | 1 |  |  |  |  | 1 | 19 |  |
| muxin-4/muxin-note | IT/前端/CSS/CSS3/base属性/1.盒子模型/未命名副本 2.pages | `2.2.4` | `M6.2-4582-1` | 3 |  |  | 6 |  |  |  |  |  | 1 |  |  |  |  | 1 | 19 |  |
| andy489/Linux_Shell | assets/Exam/Task 01 Exam 12-07-2020.pages | `11.1.2` | `M11.1-7031.0.102-2` | 3 |  |  | 12 |  |  |  |  |  | 1 |  |  |  |  | 1 | 30 |  |
| fan2/FontType | 字体知识/中文字体分类2.pages | `2.0.24` | `M5.6.2-2573-1` | 3 |  |  |  |  |  |  |  | 4 | 1 |  |  |  |  | 1 | 19 |  |
| gleb812/pch2csd | docs/PCH2CSD STATUS.pages | `14.1.1` | `M14.1-7040.0.73-4` | 3 |  |  |  |  |  |  |  |  | 1 |  |  | 1 |  | 1 | 85 |  |
| andy489/Empirical_Methods_and_Statistics | _asset/_additional/_R/Въпроси от тестове по R.pages | `11.1.2` | `M11.1-7031.0.102-2` | 3 |  |  | 24 |  |  |  |  |  | 1 |  |  |  |  | 1 | 48 |  |
| andrejHurynovic/bsuirLabs | term5/СхемТ/СхемТ, 1/СхемТ, 1.pages | `11.2.9` | `M11.2-7032.0.145-2` | 3 |  |  | 4 |  |  |  |  |  | 1 |  |  |  |  | 1 | 19 |  |
| jadugarmjadugar/aws-ppt | Mobaxterm.pages | `12.2.8` | `M12.2.1-7035.0.161-2` | 3 |  |  | 4 |  |  |  |  |  | 1 |  |  |  |  | 1 | 19 |  |
| andy489/Empirical_Methods_and_Statistics | _asset/_exer/week 15/Control test 2 SEM - prep.pages | `11.1.2` | `M11.1-7031.0.102-2` | 3 |  |  | 30 |  |  |  |  |  | 1 |  |  |  |  | 1 | 19 |  |
| andy489/Empirical_Methods_and_Statistics | _asset/_exer/week 14/R/R14. Verzani Problem Set.pages | `11.1.2` | `M11.1-7031.0.102-2` | 3 |  |  | 39 |  |  |  |  |  | 1 |  |  |  |  | 1 | 19 |  |
| andy489/Empirical_Methods_and_Statistics | _asset/_additional/_R/2021-01-04 Linear Regression 1.pages | `10.2.3` | `M10.3.9-7029.9.8-4` | 3 |  |  | 26 |  |  |  |  |  | 1 |  |  |  |  | 1 | 37 |  |
| ElizaLo/NLP-Natural-Language-Processing | Sentiment Analysis/BERT/img/BERT_diagrams.pages | `4.1.7` | `M8.1-6369-2` | 3 |  |  | 3 |  |  |  |  |  | 1 |  |  |  |  | 1 | 19 |  |
| ashishpatel26/Coursera-Guided-Projects-2021 | Sentiment Analysis with Deep Learning using BERT/Images/BERT_diagrams.pages | `4.1.7` | `M8.1-6369-2` | 3 |  |  | 3 |  |  |  |  |  | 1 |  |  |  |  | 1 | 19 |  |
| LibreOffice/core | writerperfect/qa/unit/data/writer/libetonyek/pass/Pages_5.pages | `1.5.0` | `M5.5.3-2152-2` | 2 |  |  |  |  |  |  |  |  | 1 |  |  |  |  | 1 | 19 |  |
| chaskiq/ex-marcel | test/fixtures/name/application/vnd.apple.pages/vnd.apple.pages.pages | `2.0.43` | `M6.0.5-4052-1` | 2 |  |  |  |  |  |  |  |  | 1 |  |  |  |  | 1 | 19 |  |
| rails/marcel | test/fixtures/name/application/vnd.apple.pages/vnd.apple.pages.pages | `2.0.43` | `M6.0.5-4052-1` | 2 |  |  |  |  |  |  |  |  | 1 |  |  |  |  | 1 | 19 |  |
| papyrussolution/OpenPapyrus | Src/OSF/xapian/xapian-applications/omega/testfiles/pages/test-pages.pages | `1.5.0` | `M5.5.3-2152-2` | 2 |  |  |  |  |  |  |  |  | 1 |  |  |  |  | 1 | 19 |  |
| xapian/xapian | xapian-omega/testfiles/iwork/test-pages.pages | `1.5.0` | `M5.5.3-2152-2` | 2 |  |  |  |  |  |  |  |  | 1 |  |  |  |  | 1 | 19 |  |
| Alfresco/alfresco-community-repo | repository/src/test/resources/quick/quick.pages | `2.0.43` | `M6.0.5-4052-1` | 2 |  |  |  |  |  |  |  |  | 1 |  |  |  |  | 1 | 19 |  |
| AlfrescoArchive/alfresco-repository | src/test/resources/quick/quick.pages | `2.0.43` | `M6.0.5-4052-1` | 2 |  |  |  |  |  |  |  |  | 1 |  |  |  |  | 1 | 19 |  |
| GKWenBo/WBCollectOCThirdLib | Socket编程/ServerTest/服务端(node.js)/ReadMe.pages | `2.0.24` | `M5.6.2-2573-1` | 2 |  |  |  |  |  |  |  |  | 1 |  |  |  |  | 1 | 19 |  |
| tuyaohui/IM_iOS | iOS即时通讯，从入门到“放弃”？/服务端(node.js)/ReadMe.pages | `2.0.24` | `M5.6.2-2573-1` | 2 |  |  |  |  |  |  |  |  | 1 |  |  |  |  | 1 | 19 |  |
| zzhanghub/alfred-template-file | default_templates/pages.pages | `12.0.8` | `M12.0-7033.0.134-2` | 2 |  |  |  |  |  |  |  |  | 1 |  |  |  |  | 1 | 19 |  |
| demisto/content | Packs/CommonScripts/Scripts/ZipFile/test_data/test_txt.pages | `14.0.1` | `M14.0-7039.0.94-4` | 2 |  |  |  |  |  |  |  |  | 1 |  |  |  |  | 1 | 19 |  |
| suitenumerique/ui-kit | public/storybook/preview-files/coucou.pages | `11.2.9` | `M11.2-7032.0.145-2` | 2 |  |  |  |  |  |  |  |  | 1 |  |  |  |  | 1 | 19 |  |
| GarfieldFluffJr/MacNewFile | MacNewFileFinderExtension/Blank.pages | `14.2.2` | `M14.2-7041.0.109-4` | 2 |  |  |  |  |  |  |  |  | 1 |  |  |  |  | 1 | 19 |  |
| RohanAlexander/tswd | inputs/pdfs/first_example.pages | `10.0.10` | `M10.0-6748-2` | 2 |  |  |  |  |  |  |  |  | 1 |  |  |  |  | 1 | 19 |  |
| protonpass/proton-pass-common | proton-pass-common/test_data/file_format/sample.pages | `14.1.1` | `M14.1-7040.0.73-4` | 2 |  |  |  |  |  |  |  |  | 1 |  |  |  |  | 1 | 19 |  |
| igorkasyanchuk/active_storage_validations | test/dummy/public/most_common_mime_types/example.pages | `14.1.1` | `M14.1-7040.0.73-4` | 2 |  |  |  |  |  |  |  |  | 1 |  |  |  |  | 1 | 19 |  |
| WebKit/WebKit | LayoutTests/fast/forms/file/entries-api/resources/documents/document.pages | `11.2.9` | `M11.2-7032.0.145-2` | 2 |  |  |  |  |  |  |  |  | 1 |  |  |  |  | 1 | 19 |  |
| kylebebak/Requester | assets/requester_logo.pages | `1.5.0` | `M5.5-2109-1` | 2 |  |  |  |  |  |  |  |  | 1 |  |  |  |  | 1 | 19 |  |
| parrt/msds501 | notes/plans/plan.pages | `2.0.24` | `M5.6.2-2573-1` | 2 |  |  |  |  |  |  |  |  | 1 |  |  |  |  | 1 | 33 |  |
| dekuNukem/daytripper | resources/daytripper light meaning table.pages | `3.1.2` | `M7.1-5683-2` | 2 |  |  |  |  |  |  |  |  | 1 |  |  |  |  | 1 | 19 |  |
| stevencurtis/SwiftCoding | Theory/CleanArchitectureLayers/Layers.pages | `13.2.1` | `M13.2-7038.0.87-4` | 2 |  |  |  |  |  |  |  |  | 1 |  |  |  |  | 1 | 19 |  |
| DinisCruz/Book_Software_Quality | code/files/Threat-Model/Simple Threat Model - 1 Page Template.pages | `2.0.24` | `M5.6.1-2562-1` | 2 |  |  |  |  |  |  |  |  | 1 |  |  |  |  | 1 | 28 |  |
| ply-ct/ply | docs/brand/dict.pages | `10.2.3` | `M10.3.9-7029.9.8-4` | 2 |  |  |  |  |  |  |  |  | 1 |  |  |  |  | 1 | 19 |  |
| bonyadmitr/XcodeProjects | _objc/WebViewTest/WebViewTest/files/8.pages | `2.0.24` | `M5.6-2553-2` | 2 |  |  |  |  |  |  |  |  | 1 |  |  |  |  | 1 | 19 |  |
| sbccas/c-programming-tutorials | 7_submission/Array/#include stdio.h 2.pages | `13.2.1` | `T13.2 (7367.0.77)` | 2 |  |  |  |  |  |  |  |  | 1 |  |  |  |  | 1 | 19 |  |
| fish-shell/fish-site | artwork/4.x/fish_4_ascii.pages | `14.4.1` | `M14.4-7043.0.93-4` | 2 |  |  |  |  |  |  |  |  | 1 |  |  |  |  | 1 | 19 |  |
| parrt/msds501 | notes/plans/line-function.pages | `2.0.24` | `M5.6.2-2573-1` | 2 |  |  |  |  |  |  |  |  | 1 |  |  |  |  | 1 | 29 |  |
| rstudio-education/teach-tidy | handouts/quiz-sheet.pages | `3.2.13` | `M7.3-5989-2` | 2 |  |  |  |  |  |  |  |  | 1 |  |  |  |  | 1 | 19 |  |
| turingschool/backend-curriculum-site | module1/lessons/assets/number_systems_strips.pages | `1.5.0` | `M5.5.3-2152-2` | 2 |  |  |  |  |  |  |  |  | 1 |  |  |  |  | 1 | 19 |  |
| turingschool/lesson_plans | ruby_01-object_oriented_programming_with_ruby/assets/number_systems_strips.pag | `1.5.0` | `M5.5.3-2152-2` | 2 |  |  |  |  |  |  |  |  | 1 |  |  |  |  | 1 | 19 |  |
| parrt/msds501 | notes/plans/function-plan.pages | `2.0.24` | `M5.6.2-2573-1` | 2 |  |  |  |  |  |  |  |  | 1 |  |  |  |  | 1 | 35 |  |
| parrt/msds501 | notes/plans/average.pages | `2.0.24` | `M5.6.2-2573-1` | 2 |  |  |  |  |  |  |  |  | 1 |  |  |  |  | 1 | 29 |  |
| fan2/FontType | Font-Type/HanHeiSC/macOS_Sierra-HanHeiSC.pages | `2.0.24` | `M5.6.2-2573-1` | 2 |  |  |  |  |  |  |  |  | 1 |  |  |  |  | 1 | 21 |  |
| parrt/msds501 | notes/plans/unit-price-average.pages | `2.0.24` | `M5.6.2-2573-1` | 2 |  |  |  |  |  |  |  |  | 1 |  |  |  |  | 1 | 31 |  |
| dekuNukem/duckyPad | resources/deadkey tables.pages | `3.1.2` | `M7.1-5683-2` | 2 |  |  |  |  |  |  |  |  | 1 |  |  |  |  | 1 | 19 |  |
| parrt/msds501 | notes/plans/function2-plan.pages | `2.0.24` | `M5.6.2-2573-1` | 2 |  |  |  |  |  |  |  |  | 1 |  |  |  |  | 1 | 35 |  |
| parrt/msds501 | notes/plans/rainfall-average.pages | `2.0.24` | `M5.6.2-2573-1` | 2 |  |  |  |  |  |  |  |  | 1 |  |  |  |  | 1 | 31 |  |
| parrt/msds501 | notes/plans/power-to-weight.pages | `2.0.24` | `M5.6.2-2573-1` | 2 |  |  |  |  |  |  |  |  | 1 |  |  |  |  | 1 | 31 |  |
| parrt/msds501 | notes/plans/noisy-rainfall-average.pages | `2.0.24` | `M5.6.2-2573-1` | 2 |  |  |  |  |  |  |  |  | 1 |  |  |  |  | 1 | 31 |  |
| lychees/ACM-Training | Note/集训队作业/2016/作业1/试题准备/illyyasviel/solution/cntdsets.pages | `1.5.0` | `M5.5.3-2152-2` | 2 |  |  |  |  |  |  |  |  | 1 |  |  |  |  | 1 | 26 |  |
| stevencurtis/SwiftCoding | Theory/SRP/Short.pages | `13.2.1` | `M13.2-7038.0.87-4` | 2 |  |  |  |  |  |  |  |  | 1 |  |  |  |  | 1 | 19 |  |
| parrt/msds501 | notes/plans/average-function.pages | `2.0.24` | `M5.6.2-2573-1` | 2 |  |  |  |  |  |  |  |  | 1 |  |  |  |  | 1 | 31 |  |
| haplo-org/haplo | test/fixtures/files/example_iworks15.pages | `2.0.24` | `M5.6-2553-2` | 2 |  |  |  |  |  |  |  |  | 1 |  |  |  |  | 1 | 23 |  |
| haplo-org/haplo | test/fixtures/files/example_iworks13.pages | `1.5.0` | `M5.5.2-2120-1` | 2 |  |  |  |  |  |  |  |  | 1 |  |  |  |  | 1 | 23 |  |
| andy489/Empirical_Methods_and_Statistics | _asset/_additional/_R/08. More Functions.pages | `11.1.2` | `M11.1-7031.0.102-2` | 2 |  |  |  |  |  |  |  |  | 1 |  |  |  |  | 1 | 19 |  |
| Cee/Leetcode | Google.pages | `3.1.2` | `M7.1-5683-2` | 2 |  |  |  |  |  |  |  |  | 1 |  |  |  |  | 1 | 19 |  |
| stefanbund/311 | prior terms/fall 18 assignments/phase 1 assignment.pages | `3.1.2` | `M7.1-5683-2` | 2 |  |  |  |  |  |  |  |  | 1 |  |  |  |  | 1 | 21 |  |
| jgagneastro/coffeegrindsize | Help/menu_cafe_japon.pages | `3.2.13` | `M7.3-5989-2` | 2 |  |  |  |  |  |  |  |  | 1 |  |  |  |  | 1 | 19 |  |
| devoxx4kids/materials | workshops/minecraft/course/Day1-Instructor.pages | `1.5.0` | `M5.5.3-2152-2` | 2 |  |  |  |  |  |  |  |  | 1 |  |  |  |  | 1 | 20 |  |
| zhanglizeyi/CSE120 | homework2_zeli.pages | `2.0.43` | `M6.0.5-4052-1` | 2 |  |  |  |  |  |  |  |  | 1 |  |  |  |  | 1 | 21 |  |
| ailzy/RISKIM | res.pages | `2.0.43` | `M6.0.5-4052-1` | 2 |  |  |  |  |  |  |  |  | 1 |  |  |  |  | 1 | 19 |  |
| packagesdev/packages | documents/License_iWorks.pages | `2.0.24` | `M5.6.2-2573-1` | 2 |  |  |  |  |  |  |  |  | 1 |  |  |  |  | 1 | 26 |  |
| ChangWinde/SouthEastUniversity | 大二/OS/讨论题/讨论题目二 0413.pages | `1.5.0` | `M5.5.2-2120-1` | 2 |  |  |  |  |  |  |  |  | 1 |  |  |  |  | 1 | 19 |  |
| olivierzach/GTx_6501 | Homework 9/homework9_isye6501.pages | `3.1.2` | `M7.1-5683-2` | 2 |  |  |  |  |  |  |  |  | 1 |  |  |  |  | 1 | 21 |  |
| olivierzach/GTx_6501 | Course Project/course_project_isye6501.pages | `3.1.2` | `M7.1-5683-2` | 2 |  |  |  |  |  |  |  |  | 1 |  |  |  |  | 1 | 21 |  |
| olivierzach/GTx_6501 | Homework 8/homework8_isye6501.pages | `3.1.2` | `M7.1-5683-2` | 2 |  |  |  |  |  |  |  |  | 1 |  |  |  |  | 1 | 21 |  |
| apache/tika | tika-parsers/tika-parsers-standard/tika-parsers-standard-modules/tika-parser-a | `2.0.24` | `T2.6.1 (2160)` | 2 |  |  |  |  |  |  |  |  | 1 |  |  |  |  | 1 | 20 |  |
| zhanglizeyi/CSE120 | note.pages | `2.0.43` | `M6.0-3507-1` | 2 |  |  |  |  |  |  |  |  | 1 |  |  |  |  | 1 | 19 |  |
| iRASPA/iRASPA-QT | iraspa/datafiles/license-gpl.pages | `10.2.3` | `M10.2-7028.0.88-6` | 2 |  |  |  |  |  |  |  |  | 1 |  |  |  |  | 1 | 19 |  |
| LeonardoRaiz/FATEC | Aulas/Gestao de Projetos - Gestao Agil/PPT/Aula 04/Exemplo Scrum.pages | `14.1.1` | `M14.1-7040.0.73-4` | 2 |  |  |  |  |  |  |  |  | 1 |  |  |  |  | 1 | 30 |  |
| packagesdev/unexpectedly | Documents Pages/Unexpectedly_License.pages | `2.0.24` | `M5.6.2-2573-1` | 2 |  |  |  |  |  |  |  |  | 1 |  |  |  |  | 1 | 20 |  |
| andy489/Empirical_Methods_and_Statistics | _asset/_additional/_R/LREG Kan.pages | `13.1.2` | `M13.1-7037.0.101-2` | 2 |  |  |  |  |  |  |  |  | 1 |  |  |  |  | 1 | 19 |  |
| lychees/ACM-Training | Note/集训队作业/2016/作业1/试题准备/illyyasviel/solution/tourbus.pages | `2.0.24` | `M5.6-2553-2` | 2 |  |  |  |  |  |  |  |  | 1 |  |  |  |  | 1 | 19 |  |
| Telenav/kivakit | documentation/pdf/modules.pages | `12.1.1` | `M12.1-7034.0.86-2` | 2 |  |  |  |  |  |  |  |  | 1 |  |  |  |  | 1 | 24 |  |
| andy489/Empirical_Methods_and_Statistics | _asset/_additional/_R/R7 Distributions.pages | `10.2.3` | `M10.3.5-7029.5.5-2` | 2 |  |  |  |  |  |  |  |  | 1 |  |  |  |  | 1 | 19 |  |
| lychees/ACM-Training | Note/集训队作业/2016/作业1/试题准备/illyyasviel/solution/tapair.pages | `1.5.0` | `M5.5.3-2152-2` | 2 |  |  |  |  |  |  |  |  | 1 |  |  |  |  | 1 | 34 |  |
| andrejHurynovic/bsuirLabs | term6/Социология/Тесты в СЭО/Социология, тест № 1.pages | `12.0.8` | `M12.0-7033.0.134-2` | 2 |  |  |  |  |  |  |  |  | 1 |  |  |  |  | 1 | 19 |  |
| zhanglizeyi/CSE120 | homework/CSE120HW1.pages | `2.0.24` | `M5.6.2-2573-1` | 2 |  |  |  |  |  |  |  |  | 1 |  |  |  |  | 1 | 19 |  |
| RohanAlexander/tswd | inputs/pdfs/second_example.pages | `10.0.10` | `M10.0-6748-2` | 2 |  |  |  |  |  |  |  |  | 1 |  |  |  |  | 1 | 19 |  |
| BrooksResearchGroup-UM/pyCHARMM-Workshop | Notes/BuildingpyCHARMM.pages | `12.0.8` | `M12.0-7033.0.134-2` | 2 |  |  |  |  |  |  |  |  | 1 |  |  |  |  | 1 | 21 |  |
| hadley/stats337 | week-05/conversational-roles.pages | `2.4.4` | `M7.0.1-5579-2` | 2 |  |  |  |  |  |  |  |  | 1 |  |  |  |  | 1 | 19 |  |
| packagesdev/packages | documents/Acknowledgments_iWorks.pages | `2.0.24` | `M5.6.2-2573-1` | 2 |  |  |  |  |  |  |  |  | 1 |  |  |  |  | 1 | 56 |  |
| RohanAlexander/tswd | inputs/pdfs/third_example.pages | `10.0.10` | `M10.0-6748-2` | 2 |  |  |  |  |  |  |  |  | 1 |  |  |  |  | 1 | 19 |  |
| hadley/stats337 | week-04/quotes.pages | `2.4.4` | `M7.0-5576-2` | 2 |  |  |  |  |  |  |  |  | 1 |  |  |  |  | 1 | 19 |  |
| zhanglizeyi/CSE120 | homework 2015.pages | `2.0.24` | `M5.6.1-2562-1` | 2 |  |  |  |  |  |  |  |  | 1 |  |  |  |  | 1 | 19 |  |
| momja/Code-Club | 2015-16/Meeting_2/TurtleFunctions.pages | `2.0.24` | `M5.6.1-2562-1` | 2 |  |  |  |  |  |  |  |  | 1 |  |  |  |  | 1 | 19 |  |
| RetroStack/TRS-80-Model-I-G-E1 | Latest/TRS80_Model_I_G_E1_AssemblyGuide.pages | `13.2.1` | `M13.2-7038.0.87-4` | 2 |  |  |  |  |  |  |  |  | 1 |  |  |  |  | 1 | 23 |  |
| zhanglizeyi/CSE120 | CSE120CHEATSHEET.pages | `2.0.43` | `M6.0-3507-1` | 2 |  |  |  |  |  |  |  |  | 1 |  |  |  |  | 1 | 33 |  |
| leeqiang250/note | 知识点/ETH/ETH.pages | `4.1.7` | `M8.1-6369-2` | 2 |  |  |  |  |  |  |  |  | 1 |  |  |  |  | 1 | 19 |  |
| leeqiang250/note | 知识点/EOS/EOS.pages | `2.3.4` | `M6.3.1-5249-2` | 2 |  |  |  |  |  |  |  |  | 1 |  |  |  |  | 1 | 19 |  |
| leeqiang250/note | 知识点/iOS/WKWebView.pages | `2.3.4` | `M6.3.1-5249-2` | 2 |  |  |  |  |  |  |  |  | 1 |  |  |  |  | 1 | 19 |  |
| dodiku/music-synthesis-with-python | SuperCollider+FoxDot/instructions.pages | `2.2.4` | `M6.2-4582-1` | 2 |  |  |  |  |  |  |  |  | 1 |  |  |  |  | 1 | 19 |  |
| dekuNukem/exixe | resources/spi cmd.pages | `2.2.4` | `M6.2-4582-1` | 2 |  |  |  |  |  |  |  |  | 1 |  |  |  |  | 1 | 19 |  |
| loyinglin/LearnVideoToolBox | Tutorialtmp-FFmpeg/FFmpeg.pages | `2.4.4` | `M7.0-5576-2` | 2 |  |  |  |  |  |  |  |  | 1 |  |  |  |  | 1 | 19 |  |
| audulus/docs | Audulus Getting Started Guide.pages | `2.2.4` | `M6.2-4582-1` | 2 |  |  |  |  |  |  |  |  | 1 |  |  |  |  | 1 | 21 |  |
| audulus/docs | Pages Docs/Audulus Getting Started Guide.pages | `2.2.4` | `M6.2-4582-1` | 2 |  |  |  |  |  |  |  |  | 1 |  |  |  |  | 1 | 21 |  |
| leeqiang250/note | 知识点/iOS/NSTimer.pages | `2.3.4` | `M6.3.1-5249-2` | 2 |  |  |  |  |  |  |  |  | 1 |  |  |  |  | 1 | 25 |  |
| dekuNukem/exixe | resources/spec_table.pages | `2.3.4` | `M6.3.1-5249-2` | 2 |  |  |  |  |  |  |  |  | 1 |  |  |  |  | 1 | 19 |  |
| urvi2095/multithreading-projects-java | Maze_Solver/Code_Design&Specifications/Design-and-Specifications.pages | `2.1.7` | `M6.1.1-4338-1` | 2 |  |  |  |  |  |  |  |  | 1 |  |  |  |  | 1 | 20 |  |
| NuclearTalent/MachineLearningECT | doc/Admin/Talent2020PosterText_Draft.pages | `4.2.3` | `M8.2-6520-2` | 2 |  |  |  |  |  |  |  |  | 1 |  |  |  |  | 1 | 21 |  |
| xubo245/CarbonDataLearning | docs/develop/supportBinary/CarbonData support binary data type.pages | `2.3.4` | `M6.3.1-5249-2` | 2 |  |  |  |  |  |  |  |  | 1 |  |  |  |  | 1 | 26 |  |
| sambacha/compendium | legal/termsfeed-eula-docx-english.pages | `2.1.7` | `M6.1.1-4338-1` | 2 |  |  |  |  |  |  |  |  | 1 |  |  |  |  | 1 | 19 |  |

### Swept files that are not modern IWA Pages documents

| file | upstream path | fmt | app build | status |
|---|---|---|---|---|
| 3monkeys/play.rules | play.rules.2.rsrc/play.rules.return.pages | — | — | **not modern IWA (iWork '09 XML)** |
| Alfresco/alfresco-community-repo | repository/src/test/resources/quick/quick2009.pages | — | — | **not modern IWA (iWork '09 XML)** |
| AlfrescoArchive/alfresco-repository | src/test/resources/quick/quick2009.pages | — | — | **not modern IWA (iWork '09 XML)** |
| Asuralo/SRAD-PM | Reference/Teacher_Usecase.pages | — | — | **not modern IWA (iWork '09 XML)** |
| Asuralo/SRAD-PM | Reference/功能性checklist 草稿2.pages | — | — | **not modern IWA (iWork '09 XML)** |
| Asuralo/SRAD-PM | Reference/功能性checklist.pages | — | — | **not modern IWA (iWork '09 XML)** |
| Asuralo/SRAD-PM | Reference/教师test case.pages | — | — | **not modern IWA (iWork '09 XML)** |
| ComparativeGenomicsToolkit/cactus | doc/README.pages | — | — | **not modern IWA (iWork '09 XML)** |
| ContextLab/computational-neuroscience | data_analysis_1/data_analysis_assignment.pages | — | — | **not modern IWA (iWork '09 XML)** |
| ContextLab/computational-neuroscience | data_analysis_1/data_analysis_assignment_answers.pages | — | — | **not modern IWA (iWork '09 XML)** |
| ContextLab/computational-neuroscience | integrate_and_fire_advanced/integrate_and_fire_advanced_answers.pages | — | — | **not modern IWA (iWork '09 XML)** |
| ContextLab/computational-neuroscience | matlab_intro/Matlab_intro_assignment.pages | — | — | **not modern IWA (iWork '09 XML)** |
| ContextLab/computational-neuroscience | matlab_intro/Matlab_intro_assignment_answers.pages | — | — | **not modern IWA (iWork '09 XML)** |
| EiffelSoftware/EiffelStudio | Src/tools/objc2eif/documentation/Documentation Source/Cover Page Source/Cover  | — | — | **not modern IWA (iWork '09 XML)** |
| GRMrGecko/VoiceMac | VoiceMac Documentation.pages | — | — | **not modern IWA (iWork '09 XML)** |
| GuanceCloud/datakit | internal/export/doc/en/datakit.pages | — | — | **unreadable zip** |
| GuanceCloud/datakit | internal/export/doc/zh/datakit.pages | — | — | **unreadable zip** |
| Heliosearch/heliosearch | solr/contrib/morphlines-core/src/test-files/test-documents/testPages.pages | — | — | **not modern IWA (iWork '09 XML)** |
| ITHit/WebDAVServerSamples | CS/HttpListener/HttpListenerShared/App_Data/WebDAV/Storage/Document.pages | — | — | **not modern IWA (iWork '09 XML)** |
| ITHit/WebDAVServerSamples | CS/WebDAVServer.FileSystemStorage.AspNet/App_Data/WebDav/Storage/Document.page | — | — | **not modern IWA (iWork '09 XML)** |
| ITHit/WebDAVServerSamples | CS/WebDAVServer.FileSystemStorage.AspNetCore.Cookies/App_Data/WebDav/Storage/D | — | — | **not modern IWA (iWork '09 XML)** |
| ITHit/WebDAVServerSamples | CS/WebDAVServer.FileSystemStorage.AspNetCore/App_Data/WebDav/Storage/Document. | — | — | **not modern IWA (iWork '09 XML)** |
| ITHit/WebDAVServerSamples | CS/WebDAVServer.FileSystemStorage.HttpListener/App_Data/WebDav/Storage/Documen | — | — | **not modern IWA (iWork '09 XML)** |
| ITHit/WebDAVServerSamples | CS/WebDAVServer.FileSystemSynchronization.AspNetCore/App_Data/WebDav/Storage/D | — | — | **not modern IWA (iWork '09 XML)** |
| ITHit/WebDAVServerSamples | VB/WebDAVServer.FileSystemStorage.AspNet/App_Data/WebDav/Storage/Document.page | — | — | **not modern IWA (iWork '09 XML)** |
| ITHit/WebDAVServerSamples | VB/WebDAVServer.FileSystemStorage.HttpListener/App_Data/WebDav/Storage/Documen | — | — | **not modern IWA (iWork '09 XML)** |
| ITHit/WebDAVServerSamplesJava | Java/android/androidfsstorage/app/src/main/assets/Storage/Document.pages | — | — | **not modern IWA (iWork '09 XML)** |
| ITHit/WebDAVServerSamplesJava | Java/jakarta/collectionsync/src/main/storageresources/Storage/Document.pages | — | — | **not modern IWA (iWork '09 XML)** |
| ITHit/WebDAVServerSamplesJava | Java/jakarta/filesystemstorage/src/main/storageresources/Storage/Document.page | — | — | **not modern IWA (iWork '09 XML)** |
| ITHit/WebDAVServerSamplesJava | Java/jakarta/springboot3fsstorage/src/main/resources/Storage/Document.pages | — | — | **not modern IWA (iWork '09 XML)** |
| ITHit/WebDAVServerSamplesJava | Java/javax/collectionsync/src/main/storageresources/Storage/Document.pages | — | — | **not modern IWA (iWork '09 XML)** |
| ITHit/WebDAVServerSamplesJava | Java/javax/filesystemstorage/src/main/storageresources/Storage/Document.pages | — | — | **not modern IWA (iWork '09 XML)** |
| ITHit/WebDAVServerSamplesJava | Java/javax/springbootfsstorage/src/main/resources/Storage/Document.pages | — | — | **not modern IWA (iWork '09 XML)** |
| ITHit/WebDAVServerSamplesJava | Kotlin/javax/filesystemstorage/src/main/storageresources/Storage/Document.page | — | — | **not modern IWA (iWork '09 XML)** |
| LibreOffice/core | writerperfect/qa/unit/data/writer/libetonyek/pass/Pages_4.pages | — | — | **not modern IWA (iWork '09 XML)** |
| Machx/Xcode-Keyboard-Shortcuts | Xcode_Shortcuts.pages | — | — | **not modern IWA (iWork '09 XML)** |
| Machx/Xcode-Keyboard-Shortcuts | Xcode_Shortcuts_27imac.pages | — | — | **not modern IWA (iWork '09 XML)** |
| Machx/Xcode-Keyboard-Shortcuts | Xcode_Shortcuts_8.5x11.pages | — | — | **not modern IWA (iWork '09 XML)** |
| Machx/Xcode-Keyboard-Shortcuts | Xcode_Shortcuts_A4.pages | — | — | **not modern IWA (iWork '09 XML)** |
| Machx/Xcode-Keyboard-Shortcuts | Xcode_Shortcuts_Tables_for_Widget.pages | — | — | **not modern IWA (iWork '09 XML)** |
| PLplot/PLplot | src/README.pages | — | — | **unreadable zip** |
| Robert-van-Engelen/unix-tools | learn/ch1.pages | — | — | **unreadable zip** |
| Robert-van-Engelen/unix-tools | learn/ch10.pages | — | — | **unreadable zip** |
| Robert-van-Engelen/unix-tools | learn/ch14.pages | — | — | **unreadable zip** |
| Robert-van-Engelen/unix-tools | learn/ch15.pages | — | — | **unreadable zip** |
| Robert-van-Engelen/unix-tools | learn/ch2.pages | — | — | **unreadable zip** |
| Robert-van-Engelen/unix-tools | learn/ch3.pages | — | — | **unreadable zip** |
| Robert-van-Engelen/unix-tools | learn/ch4.pages | — | — | **unreadable zip** |
| Robert-van-Engelen/unix-tools | learn/ch5.pages | — | — | **unreadable zip** |
| Robert-van-Engelen/unix-tools | learn/ch6.pages | — | — | **unreadable zip** |
| Robert-van-Engelen/unix-tools | learn/ch7.pages | — | — | **unreadable zip** |
| Robert-van-Engelen/unix-tools | learn/ch8.pages | — | — | **unreadable zip** |
| Robert-van-Engelen/unix-tools | learn/demo.pages | — | — | **unreadable zip** |
| Robert-van-Engelen/unix-tools | learn/gdb.pages | — | — | **unreadable zip** |
| SilentCircle/silent-text | Documentation/Cloud Storage paper.pages | — | — | **not modern IWA (iWork '09 XML)** |
| SilentCircle/silent-text | Documentation/SCIMP API.pages | — | — | **not modern IWA (iWork '09 XML)** |
| SilentCircle/silent-text | Documentation/SCIMP paper.pages | — | — | **not modern IWA (iWork '09 XML)** |
| SilentCircle/silent-text | Documentation/Siren Spec.pages | — | — | **not modern IWA (iWork '09 XML)** |
| SlavaBushtruk/Alterplay-iOS-dev-tips | iPhone hand templates/iPhone app design templates.pages | — | — | **not modern IWA (iWork '09 XML)** |
| TALKDATA/JavaBigData | code/flume-ng-sinks/flume-ng-morphline-solr-sink/src/test/resources/test-docum | — | — | **not modern IWA (iWork '09 XML)** |
| UCLA-Plasma-Simulation-Group/UPIC-2.0 | mbeps1/Documents/BEPS1Design.pages | — | — | **not modern IWA (iWork '09 XML)** |
| UCLA-Plasma-Simulation-Group/UPIC-2.0 | mbeps1/Documents/BEPS1OverView.pages | — | — | **not modern IWA (iWork '09 XML)** |
| UCLA-Plasma-Simulation-Group/UPIC-2.0 | mbeps1/Documents/BEPS1inputs.pages | — | — | **not modern IWA (iWork '09 XML)** |
| UCLA-Plasma-Simulation-Group/UPIC-2.0 | mpbeps3/Documents/BEPS3Design.pages | — | — | **not modern IWA (iWork '09 XML)** |
| UCLA-Plasma-Simulation-Group/UPIC-2.0 | mpbeps3/Documents/BEPS3OverView.pages | — | — | **not modern IWA (iWork '09 XML)** |
| WebKit/WebKit | LayoutTests/http/tests/quicklook/resources/secure-document-with-subresources.p | — | — | **not modern IWA (iWork '09 XML)** |
| WebKit/WebKit | LayoutTests/quicklook/resources/pages-09.pages | — | — | **not modern IWA (iWork '09 XML)** |
| WebKit/WebKit | LayoutTests/quicklook/resources/password-protected.pages | — | — | **password-protected** |
| WebKit/WebKit | Tools/TestWebKitAPI/Resources/cocoa/password-protected.pages | — | — | **password-protected** |
| WebKit/WebKit-http | LayoutTests/http/tests/quicklook/resources/secure-document-with-subresources.p | — | — | **not modern IWA (iWork '09 XML)** |
| WebKit/WebKit-http | LayoutTests/quicklook/resources/pages-09.pages | — | — | **not modern IWA (iWork '09 XML)** |
| WebKit/WebKit-http | LayoutTests/quicklook/resources/password-protected.pages | — | — | **password-protected** |
| WebKit/WebKit-http | Tools/TestWebKitAPI/Tests/WebKitCocoa/password-protected.pages | — | — | **password-protected** |
| alvinj/Sarah | docs/Installing-Sarah.pages | — | — | **not modern IWA (iWork '09 XML)** |
| alvinj/Sarah | docs/Sarah-Users-Manual.pages | — | — | **not modern IWA (iWork '09 XML)** |
| apache/stanbol | enhancement-engines/tika/src/test/resources/test.pages | — | — | **not modern IWA (iWork '09 XML)** |
| apache/tika | tika-parsers/tika-parsers-standard/tika-parsers-standard-modules/tika-parser-a | — | — | **not modern IWA (iWork '09 XML)** |
| apache/tika | tika-parsers/tika-parsers-standard/tika-parsers-standard-modules/tika-parser-a | — | — | **not modern IWA (iWork '09 XML)** |
| apache/tika | tika-parsers/tika-parsers-standard/tika-parsers-standard-modules/tika-parser-a | — | — | **not modern IWA (iWork '09 XML)** |
| apache/tika | tika-parsers/tika-parsers-standard/tika-parsers-standard-modules/tika-parser-a | — | — | **not modern IWA (iWork '09 XML)** |
| apache/tika | tika-parsers/tika-parsers-standard/tika-parsers-standard-modules/tika-parser-a | — | — | **not modern IWA (iWork '09 XML)** |
| apache/tika | tika-parsers/tika-parsers-standard/tika-parsers-standard-modules/tika-parser-a | — | — | **not modern IWA (iWork '09 XML)** |
| apache/tika | tika-parsers/tika-parsers-standard/tika-parsers-standard-modules/tika-parser-a | — | — | **not modern IWA (iWork '09 XML)** |
| apache/tika | tika-parsers/tika-parsers-standard/tika-parsers-standard-modules/tika-parser-a | — | — | **not modern IWA (iWork '09 XML)** |
| apache/tika | tika-parsers/tika-parsers-standard/tika-parsers-standard-modules/tika-parser-a | — | — | **unreadable zip** |
| apple-open-source/macos | cddafs/Documentation/CDDA ERD.pages | — | — | **not modern IWA (iWork '09 XML)** |
| apple-open-source/macos | cddafs/Documentation/CDDA MDS.pages | — | — | **not modern IWA (iWork '09 XML)** |
| apple-open-source/macos | cddafs/Documentation/CDDA MRD.pages | — | — | **not modern IWA (iWork '09 XML)** |
| apple-open-source/macos | cddafs/Documentation/CDDA MRS.pages | — | — | **not modern IWA (iWork '09 XML)** |
| borismus/DevTools-Lab | cheatsheet/chromedev-cheatsheet.pages | — | — | **not modern IWA (iWork '09 XML)** |
| ccrraaiigg/context | context.app/Contents/Resources/context processor.app/Contents/Resources/contex | — | — | **not modern IWA (iWork '09 XML)** |
| chrismattmann/imagecat | solr4/contrib/morphlines-core/src/test-files/test-documents/testPages.pages | — | — | **not modern IWA (iWork '09 XML)** |
| code4craft/jsoup-learning | blogs/images/compiler.pages | — | — | **not modern IWA (iWork '09 XML)** |
| codice/ddf | distribution/test/itests/test-itests-common/src/main/resources/tika/testPages. | — | — | **not modern IWA (iWork '09 XML)** |
| cookiengineer/retrokit | Tools/TestWebKitAPI/Tests/WebKitCocoa/password-protected.pages | — | — | **password-protected** |
| deadwood2/OdysseyWebBrowser | Tools/TestWebKitAPI/Tests/WebKitCocoa/password-protected.pages | — | — | **password-protected** |
| docwire/docwire | tests/1.pages | — | — | **not modern IWA (iWork '09 XML)** |
| docwire/docwire | tests/2.pages | — | — | **not modern IWA (iWork '09 XML)** |
| docwire/docwire | tests/3.pages | — | — | **not modern IWA (iWork '09 XML)** |
| docwire/docwire | tests/4.pages | — | — | **not modern IWA (iWork '09 XML)** |
| docwire/docwire | tests/5.pages | — | — | **not modern IWA (iWork '09 XML)** |
| docwire/docwire | tests/6.pages | — | — | **not modern IWA (iWork '09 XML)** |
| docwire/docwire | tests/7.pages | — | — | **not modern IWA (iWork '09 XML)** |
| docwire/docwire | tests/8.pages | — | — | **not modern IWA (iWork '09 XML)** |
| docwire/docwire | tests/9.pages | — | — | **not modern IWA (iWork '09 XML)** |
| docwire/docwire | tests/password_protected.pages | — | — | **unreadable zip** |
| drichardson/examples | Mac/CoreAnimation/Flash Cards.pages | — | — | **not modern IWA (iWork '09 XML)** |
| drichardson/examples | Mac/LanguageAndProtocolEvaluation/Language & Protocol Evaluation.pages | — | — | **not modern IWA (iWork '09 XML)** |
| duomark/erlangsp | apps/coop/docs/coops_poster.pages | — | — | **not modern IWA (iWork '09 XML)** |
| emoon/Score | old/doc/ScoreOverview.pages | — | — | **not modern IWA (iWork '09 XML)** |
| ericdodds/the-little-freelancer | Web_development_contract/Web_development_contract_BLANK.pages | — | — | **not modern IWA (iWork '09 XML)** |
| ericdodds/the-little-freelancer | Web_development_contract/Web_development_contract_with_explanations.pages | — | — | **not modern IWA (iWork '09 XML)** |
| ericdodds/the-little-freelancer | Web_development_proposal/Web_development_proposal_BLANK.pages | — | — | **not modern IWA (iWork '09 XML)** |
| gillesbertaux/bootsy | PM/1. SPECIFICATIONS/MODELS/specs.pages | — | — | **not modern IWA (iWork '09 XML)** |
| gillesbertaux/bootsy | PM/2. REPORTS/MODELS/reports.pages | — | — | **not modern IWA (iWork '09 XML)** |
| goosman-lei/php-eae | php-eae.pages | — | — | **not modern IWA (iWork '09 XML)** |
| grame-cncm/guidolib | doc/refcard/GMNRefCard.pages | — | — | **not modern IWA (iWork '09 XML)** |
| guardianproject/GuardianProjectPublic | Graphics/Fdroid/fdroid qr.pages | — | — | **not modern IWA (iWork '09 XML)** |
| haplo-org/haplo | test/fixtures/files/example.pages | — | — | **not modern IWA (iWork '09 XML)** |
| haplo-org/haplo | test/fixtures/files/example_with_prototype_text.pages | — | — | **not modern IWA (iWork '09 XML)** |
| heyigor/miniBAE | minibae/Documentation/miniBAE text.pages | — | — | **not modern IWA (iWork '09 XML)** |
| horosproject/horos | Binaries/Horos Report.pages | — | — | **not modern IWA (iWork '09 XML)** |
| horosproject/horos | Binaries/Horos Report.pages09.pages | — | — | **not modern IWA (iWork '09 XML)** |
| javaee/javaee7-samples | lab/javaee7-hol.pages | — | — | **not modern IWA (iWork '09 XML)** |
| jeradesign/CVFunhouse | Assets/Descriptions.pages | — | — | **not modern IWA (iWork '09 XML)** |
| jessegrosjean/DropboxSync | Tests/DropboxTestFolderFixture/4 ぜら/test.pages | — | — | **not modern IWA (iWork '09 XML)** |
| jfroy/rivenx | Riven X Acknowledgments.pages | — | — | **not modern IWA (iWork '09 XML)** |
| k-pet-group/BlueJ-Greenfoot | greenfoot/doc/Greenfoot-API.pages | — | — | **not modern IWA (iWork '09 XML)** |
| kirbyfern/awesome-kirby | being_freelancer/Web_development_contract/Web_development_contract_BLANK.pages | — | — | **not modern IWA (iWork '09 XML)** |
| kirbyfern/awesome-kirby | being_freelancer/Web_development_contract/Web_development_contract_with_explan | — | — | **not modern IWA (iWork '09 XML)** |
| kirbyfern/awesome-kirby | being_freelancer/Web_development_proposal/Web_development_proposal_BLANK.pages | — | — | **not modern IWA (iWork '09 XML)** |
| kite-sdk/kite | kite-morphlines/kite-morphlines-core/src/test/resources/test-documents/testPag | — | — | **not modern IWA (iWork '09 XML)** |
| kite-sdk/kite-examples | kite-examples-morphlines/src/test/resources/test-documents/testPages.pages | — | — | **not modern IWA (iWork '09 XML)** |
| kshaffer/musicianshipResources | Graphics/melodies-Sep12.pages | — | — | **not modern IWA (iWork '09 XML)** |
| kshaffer/musicianshipResources | _site/Graphics/melodies-Sep12.pages | — | — | **not modern IWA (iWork '09 XML)** |
| markqvist/MidiKatapult | Documentation/Katapult Documentation.pages | — | — | **not modern IWA (iWork '09 XML)** |
| master-nevi/WWDC-2010 | DocView/DocExamples/PagesDoc.pages | — | — | **not modern IWA (iWork '09 XML)** |
| nerds-odd-e/scrumprimer | primer_source_files/Scrum Primer v2.0.pages | — | — | **not modern IWA (iWork '09 XML)** |
| nipy/PySurfer | doc/logo_files/banner.pages | — | — | **not modern IWA (iWork '09 XML)** |
| nuxeo/nuxeo | modules/platform/nuxeo-platform-convert/src/test/resources/test-docs/hello-wit | — | — | **not modern IWA (iWork '09 XML)** |
| nuxeo/nuxeo | modules/platform/nuxeo-platform-convert/src/test/resources/test-docs/hello.pag | — | — | **not modern IWA (iWork '09 XML)** |
| obophenotype/uberon | docs/resources/modeling-the-middle-ear.pages | — | — | **not modern IWA (iWork '09 XML)** |
| omniti-labs/pgtreats | tools/check.zero.pages | — | — | **unreadable zip** |
| openpreserve/format-corpus | variations/variations/application/x-iwork-pages-sffpages/09-4.1-923/lorem-ipsu | — | — | **not modern IWA (iWork '09 XML)** |
| openwisp/OpenWISP-User-Management-System | doc/OWUMS-RESTful API.pages | — | — | **not modern IWA (iWork '09 XML)** |
| pixmeo/osirix | Binaries/OsiriX Report.pages | — | — | **not modern IWA (iWork '09 XML)** |
| pnnl/NWGraph | docker/Dockerfile.pages | — | — | **unreadable zip** |
| pyushkevich/itksnap | Documentation/Shortcuts/Shortcuts_SNAP3.pages | — | — | **not modern IWA (iWork '09 XML)** |
| sebrenner/Mit-6.00-OCW-Problem-Set-Solutions | ps12WriteUp.pages | — | — | **not modern IWA (iWork '09 XML)** |
| serenity-bdd/serenity-core | design/thucydides-web-design-specs.pages | — | — | **not modern IWA (iWork '09 XML)** |
| simsong/bulk_extractor | src/tests/iwork_09.pages | — | — | **not modern IWA (iWork '09 XML)** |
| st3fan/osx-10.9 | cddafs-252/Documentation/CDDA ERD.pages | — | — | **not modern IWA (iWork '09 XML)** |
| st3fan/osx-10.9 | cddafs-252/Documentation/CDDA MDS.pages | — | — | **not modern IWA (iWork '09 XML)** |
| st3fan/osx-10.9 | cddafs-252/Documentation/CDDA MRD.pages | — | — | **not modern IWA (iWork '09 XML)** |
| st3fan/osx-10.9 | cddafs-252/Documentation/CDDA MRS.pages | — | — | **not modern IWA (iWork '09 XML)** |
| stevensouza/jamonapi | src/docs/jamon271.pages | — | — | **not modern IWA (iWork '09 XML)** |
| stevensouza/jamonapi | src/docs/jamon272.pages | — | — | **not modern IWA (iWork '09 XML)** |
| teamcfadvance/ValidateThis | ValidateThis/docs/BOIntegrationGuide-v0.91.pages | — | — | **not modern IWA (iWork '09 XML)** |
| thucydides-webtests/thucydides | design/thucydides-web-design-specs.pages | — | — | **not modern IWA (iWork '09 XML)** |
| wujun728/jun_java_plugin | jun_java_plugins/jun_jsoup/doc/images/compiler.pages | — | — | **not modern IWA (iWork '09 XML)** |
| ydb-platform/nbs | contrib/ydb/core/tablet_flat/test/data/002_full_part.pages | — | — | **unreadable zip** |
| ydb-platform/ydb | ydb/core/tablet_flat/test/data/002_full_part.pages | — | — | **unreadable zip** |
| yomurb/yomu | spec/samples/sample filename with spaces.pages | — | — | **not modern IWA (iWork '09 XML)** |
| yomurb/yomu | spec/samples/sample.pages | — | — | **not modern IWA (iWork '09 XML)** |

