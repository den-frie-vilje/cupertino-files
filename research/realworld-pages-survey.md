# Real-world Pages documents on public GitHub — survey

Survey date: **2026-07-30**. Goal: find `.pages` documents that were *authored in Pages by real
people and committed to public GitHub repositories* (CVs, theses, lab reports, newsletters,
manuals, course handouts) and add the most feature-rich, clearly-licensed ones to
`fixtures/`. This complements the parallel effort on formal parser corpora
(libetonyek / LibreOffice / Tika), which is deliberately not duplicated here.

Everything below was measured with `node scripts/feature-probe.ts`; **no feature was ever
inferred from a filename**. Every candidate was downloaded, verified to be a real zip
(`file` / `PK` magic) and then probed. Files that turned out to be iWork '09 XML, mkdocs
`.pages` YAML, .NET `*.Pages/` directories or byte-stubs were discarded and are called out
at the end.

## 1. How the documents were found

GitHub code search (`path:*.pages`) requires a logged-in session and the sandbox's GitHub API
is scoped to the session's own repositories, so file-level search was unavailable. Search
engines were also a dead end: `.pages` is swamped by "GitHub Pages", and blob pages for binary
files are effectively unreachable by phrase search. Three channels did work:

1. **GH Archive on ClickHouse** (`https://play.clickhouse.com/?user=play`, table
   `github_events`). Two uses:
   - Mining PR/issue titles for GitHub-web-UI commit messages such as
     `Create Hunter Spence Resume.pages` / `Delete Meeting Minutes.pages`
     (`match(title, '(?i)^(add|create|update|delete|rename|upload)[a-z]* [^/]{0,60}\.pages$')`).
     Precise but low volume — most `.pages` commits never go through a PR.
   - Harvesting **candidate repository names** by pattern (`*/resume`, `*/university`,
     `*/cs3600`, `*/thesis`, `*/handbook`, `*/lecture-notes`, government orgs, …). This was
     the workhorse.
2. **Bulk blobless scanning.** For each candidate repo:
   `git clone --bare --filter=blob:none --depth 1 --single-branch` then
   `git ls-tree -r --name-only HEAD | grep -i '\.pages$'`. ~2 s per repo, ~40 repos/s at
   `xargs -P 24`, and it never downloads a blob until a hit is confirmed.
   **132,641 repositories were scanned this way**, yielding **129 `.pages` files across 54
   repositories** (hit rate ≈ 1 repo in 2,450).
3. **GitHub topic pages via WebFetch** (`/topics/apple-pages`, `/topics/iwork`) for
   iWork-adjacent tooling repos that ship example documents.

Sourcegraph, Bing, DuckDuckGo, Wayback CDX, searchcode and BigQuery were all tried and are
documented as dead ends in section 5.

## 2. Every file probed

Sorted by feature-probe score. `_none_` in the licence column means the repository has **no
`LICENSE`/`COPYING` file at all** (checked by fetching `LICENSE`, `LICENSE.md`, `LICENSE.txt`,
`LICENCE`, `COPYING`, `UNLICENSE` from the default branch) — i.e. all rights reserved, so the
file was **not** added to the corpus no matter how good it is.

| score | repo | file | licence | fmt | era | app build | bytes | objs | notable features |
|---|---|---|---|---|---|---|---|---|---|
| 8 | `chongpig/CS2100` | `lab8/Lab08-Zhu Chongqiao-v1.pages` | _none_ | 14.4.1 | modern | M14.4-7043.0.93-4 | 966,341 | 1623 | imagesWithMask=1 nonEmptyFooters=1 bookmarks=1 readableTableCells=1 textBoxes=159 images=3 |
| 7 | `claycle/fl-publisher-pages-templates` | `FbL Workshop Pages.pages` | _none_ | 12.2.8 | modern | M12.2.1-7035.0.161-2 | 3,044,507 | 1368 | sections=3 imagesWithMask=3 readableTableCells=2 textBoxes=98 images=18 isPageLayout=True |
| 6 | `TheFebrin/UNIVERSITY` | `Statistics and Linear Models/Task1/Report.pages` | _none_ | 11.1.2 | modern | M11.1-7031.0.102-2 | 3,481,415 | 1559 | charts=2 nonEmptyFooters=2 readableTableCells=9 images=91 |
| 6 | `ZetoOfficial/university` | `3sem/moad/lab7/lab7.pages` | _none_ | 11.2.9 | modern | M11.2-7032.0.145-2 | 1,745,715 | 928 | imagesWithMask=2 readableTableCells=1 textBoxes=1 images=11 |
| 6 | `ZetoOfficial/university` | `3sem/sakod/lab4/lab4.pages` | _none_ | 11.2.9 | modern | M11.2-7032.0.145-2 | 1,004,078 | 2521 | sections=2 readableTableCells=1 textBoxes=291 images=6 |
| 6 | `patrickomatic/iwork` | `examples/pages/eternal_sunshine.pages` | **MIT** | 26.1.0 | current | M15.2.1-7048.0.3-2 | 205,537 | 721 | sections=6 imagesWithMask=2 textBoxes=4 images=2 |
| 6 | `patrickomatic/iwork` | `examples/pages/modern_novel.pages` | **MIT** | 26.1.0 | current | M15.2.1-7048.0.3-2 | 422,700 | 682 | sections=6 imagesWithMask=2 textBoxes=4 images=2 |
| 6 | `probablytom/Thesis` | `supporting_docs/Tom Wallis 2025138 Extension Request (Jan 2023).pages` | _none_ | 13.1.2 | modern | M13.1-7037.0.101-2 | 874,932 | 1139 | hyperlinks=2 readableTableCells=5 textBoxes=1 images=1 |
| 5 | `CompPhysics/ThesisProjects` | `doc/PhD/phd_students/former/Ben/Pairing Model QPE | Poster.pages` | **CC0-1.0** | 2.2.4 | iwork16 | M6.2-4582-1 | 1,650,801 | 489 | imagesWithMask=9 textBoxes=48 images=29 |
| 5 | `TheFebrin/UNIVERSITY` | `Statistics and Linear Models/Task4/Report.pages` | _none_ | 11.1.2 | modern | M11.1-7031.0.102-2 | 1,802,208 | 902 | nonEmptyFooters=2 readableTableCells=2 images=43 |
| 5 | `desmarais-patrick/notes` | `src/review-assets.pages` | **MIT** | 4.1.7 | iwork19 | M8.1-6369-2 | 8,307,450 | 537 | imagesWithMask=3 readableTableCells=1 images=22 |
| 5 | `jmschultz/resume` | `Justin Murphy Resume.pages` | **MIT** | 12.0.8 | modern | M12.0-7033.0.134-2 | 290,151 | 436 | hyperlinks=7 bookmarks=1 textBoxes=2 |
| 5 | `maddieebeck/ist263` | `lab03/unit_03-links_images_video.pages` | _none_ | 13.1.2 | modern | M13.1-7037.0.101-2 | 928,274 | 810 | hyperlinks=3 readableTableCells=1 images=4 |
| 5 | `maddieebeck/ist263` | `project/BECK-ist263 project4.pages` | _none_ | 13.2.1 | modern | M13.2-7038.0.87-4 | 1,379,197 | 790 | hyperlinks=4 readableTableCells=1 images=3 |
| 5 | `pSuchi/Dissertation` | `Synopsis.pages` | _none_ | 13.1.2 | modern | M13.1-7037.0.101-2 | 2,554,049 | 655 | imagesWithFilters=1 textBoxes=13 images=1 |
| 5 | `patrickomatic/iwork` | `examples/pages/term_paper.pages` | **MIT** | 26.1.0 | current | M15.2.1-7048.0.3-2 | 221,011 | 492 | imagesWithMask=2 nonEmptyFooters=2 images=2 |
| 4 | `cds-hooks/docs` | `docs/cheat-sheet/CDS Hooks Cheat Sheet.pages` | **Apache-2.0** | 4.0.13 | iwork19 | M8.0-6194-2 | 8,396,126 | 439 | textBoxes=5 images=1 isPageLayout=True |
| 4 | `desmarais-patrick/notes` | `src/review-01.pages` | **MIT** | 4.1.7 | iwork19 | M8.1-6369-2 | 132,018 | 669 | comments=6 readableTableCells=4 |
| 4 | `desmarais-patrick/notes` | `src/review-02.pages` | **MIT** | 4.1.7 | iwork19 | M8.1-6369-2 | 213,565 | 629 | sections=8 hyperlinks=5 |
| 4 | `maddieebeck/ist263` | `lab04/lab_04-tables_forms.pages` | _none_ | 13.1.2 | modern | M13.1-7037.0.101-2 | 938,623 | 739 | hyperlinks=5 images=9 |
| 4 | `xifanyan/iwork-redline-detector` | `testdata/pages/comments.track.pages` | _none_ | 26.0.0 | current | M15.1.1-7044.0.273-2 | 95,590 | 576 | comments=1 storagesWithChangeTracking=1 |
| 3 | `SixPivot/handbook` | `.gitbook/assets/Your first day.pages` | _none_ | 12.1.1 | modern | M12.1-7034.0.86-2 | 208,761 | 709 | readableTableCells=2 |
| 3 | `Veronike98/Master-Thesis` | `Immagini/DALLE-bh-area/DALLE-bh-area.pages` | _none_ | 3.2.13 | iwork19 | M7.3-5989-2 | 1,845,021 | 411 | images=3 |
| 3 | `ZetoOfficial/university` | `3sem/moad/lab6/moad_6_lab.pages` | _none_ | 11.2.9 | modern | M11.2-7032.0.145-2 | 888,491 | 1015 | readableTableCells=2 |
| 3 | `akki-g/Thesis` | `Report.pages` | _none_ | 14.4.1 | modern | M14.4-7043.0.93-4 | 1,801,309 | 591 | images=4 |
| 3 | `apgrieser/resume` | `Andrea Grieser Resume.pages` | _none_ | 13.1.2 | modern | M13.1-7037.0.101-2 | 256,518 | 441 | nonEmptyHeaders=1 |
| 3 | `dxy159/COMP322` | `assignments/Assignment1/Runtime.pages` | _none_ | 2.0.24 | iwork16 | M5.6.1-2562-1 | 122,597 | 310 | images=1 |
| 3 | `hspence00/AlgoTrading_Project` | `Hunter Spence Resume.pages` | _none_ | 11.2.9 | modern | M11.2-7032.0.145-2 | 862,759 | 721 | textBoxes=3 |
| 3 | `i2docode/IT_140` | `IT_140_Design_Document_project (1) 3.pages` | _none_ | 12.1.1 | modern | M12.1-7034.0.86-2 | 791,985 | 825 | textBoxes=25 |
| 3 | `orcastor/iwork-converter` | `testdata/a.pages` | **MIT** | 14.1.1 | modern | M14.1-7040.0.73-4 | 762,153 | 865 | readableTableCells=1 |
| 3 | `sahasatvik/assignments` | `CH1202/conductometry.pages` | _none_ | 4.2.3 | iwork19 | M8.2.1-6529-2 | 119,888 | 423 | images=1 |
| 3 | `sahasatvik/assignments` | `LS1102/diversity.pages` | _none_ | 4.1.7 | iwork19 | M8.1-6369-2 | 906,428 | 444 | images=11 |
| 3 | `sahasatvik/assignments` | `CH1202/reaction_order.pages` | _none_ | 4.2.3 | iwork19 | M8.2.1-6529-2 | 221,709 | 427 | images=4 |
| 3 | `samipope/CS6011` | `CS6015/Lab2/Lab2SamiReport.pages` | _none_ | 13.0.2 | modern | M13.0-7036.0.126-2 | 803,183 | 824 | readableTableCells=1 |
| 3 | `tinnguyen1372/FYP` | `docs/source/images/editables/abcs.pages` | **GPL-3.0** | 1.5.0 | iwork13 | M5.5.3-2152-2 | 130,531 | 335 | imagesWithMask=1 images=1 isPageLayout=True |
| 3 | `xifanyan/iwork-redline-detector` | `testdata/pages2013/comments.2013.pages` | _none_ | 26.0.0 | current | M15.1.1-7044.0.273-2 | 81,835 | 574 | comments=1 |
| 3 | `xifanyan/iwork-redline-detector` | `testdata/pages/comments.no-tracking.pages` | _none_ | 26.0.0 | current | M15.1.1-7044.0.273-2 | 95,386 | 574 | comments=1 |
| 3 | `xifanyan/iwork-redline-detector` | `testdata/pages/tracking.insert.deletion.pages` | _none_ | 26.0.0 | current | M15.1.1-7044.0.273-2 | 102,623 | 578 | storagesWithChangeTracking=1 |
| 2 | `Katsevich-Lab/sceptre2-manuscript` | `revision/response_to_reviewers.pages` | **GPL (LICENSE.md)** | 13.1.2 | modern | M13.1-7037.0.101-2 | 406,952 | 592 | — |
| 2 | `alearcyber/SeniorProject` | `P02_Ticket_Reservations.pages` | _none_ | 13.0.2 | modern | M13.0-7036.0.126-2 | 844,890 | 704 | — |
| 2 | `cthuff/CS147` | `Homework/Homework III.pages` | _none_ | 2.1.7 | iwork16 | M6.1.1-4338-1 | 228,192 | 339 | — |
| 2 | `kashvibalanibatch2025-ship-it/kashvi-tinkerlab-b2` | `TINKER LAB/Anatomy of ms-excel.pages` | _none_ | 14.4.1 | modern | M14.4-7043.0.93-4 | 187,052 | 568 | — |
| 2 | `migh6544/COMP-3421` | `Assessments/6/Michael_Ghattas_Assignment_6.pages` | _none_ | 12.1.1 | modern | M12.1-7034.0.86-2 | 181,948 | 586 | — |
| 2 | `xifanyan/iwork-redline-detector` | `testdata/pages/normal.pages` | _none_ | 26.0.0 | current | M15.1.1-7044.0.273-2 | 95,068 | 571 | — |
| 2 | `xifanyan/iwork-redline-detector` | `testdata/pages/normal.track.accepted.pages` | _none_ | 26.0.0 | current | M15.1.1-7044.0.273-2 | 94,160 | 573 | — |

## 3. What was added, and why

Six files were copied into `fixtures/` (full provenance, md5 and probe output in
`fixtures/ATTRIBUTION.md`). They were chosen for **complementary** coverage rather than raw
score, and every one comes from a repository with an explicit permissive licence.

Note on baseline: when this survey started, no fixture in `fixtures/` had image
filters/masks, header/footer text, footnotes, comments, hyperlinks, multiple sections, charts
or change tracking. A parallel effort on formal/open-web corpora landed fixtures for several
of those while this survey was running, so the value of the six files below is that they are
**real-world, human-authored documents** with independent provenance and a different
format-version spread — not that they are the only carriers of each feature.

| fixture | licence | what it contributes |
|---|---|---|
| `desmarais-notes-comments-tables.pages` | MIT | **comments (6)** on a genuine review document, 4 readable v5 table cells, 3 TOC objects |
| `desmarais-notes-sections-hyperlinks.pages` | MIT | **8 document sections**, hyperlinks, smart fields |
| `patrickomatic-pages26-sections-masks.pages` | MIT | **fileFormatVersion 26.1.0** (era `current`), 6 sections, image masks, 25 smart fields |
| `patrickomatic-termpaper-footers-masks.pages` | MIT | **non-empty footers (real running-footer text)** on a 26.1.0 document |
| `compphysics-poster-images-masks.pages` | CC0-1.0 | **29 images / 9 image masks**, 48 floating text boxes, `iwork16` era |
| `jmschultz-resume-hyperlinks-bookmarks.pages` | MIT | **7 hyperlinks**, a bookmark, fills the 12.x format gap |

Format-version spread added: `2.2.4`, `4.1.7` (×2), `12.0.8`, `26.1.0` (×2). The pre-existing
corpus covered only `1.5.0`, `2.0.24`, `3.2.13`, `14.4.1`.

Runner-up not taken: `patrickomatic/iwork examples/pages/modern_novel.pages` (MIT, score 6) is
a near-duplicate of `eternal_sunshine.pages` — same template family, same feature profile —
so only one of the pair was taken.

## 4. Priority features: found vs not found

| # | Wanted feature | Result |
|---|---|---|
| 1 | **Image filters / adjustments** | ⚠️ Found exactly **once** in the whole survey: `pSuchi/Dissertation Synopsis.pages` (`imagesWithFilters=1`). That repo has **no licence**, so it could not be taken. |
| 1 | **Image masks** | ✅ Added — `compphysics-poster` (9 masks), both `patrickomatic` files (2 each). |
| 2 | **Headers/footers with real text** | ✅ Footers added (`patrickomatic-termpaper`, 2 non-empty footers). ⚠️ **Non-empty *headers* were found only once** (`apgrieser/resume`, `nonEmptyHeaders=1`) and that repo is unlicensed. |
| 3 | **Footnotes / endnotes** | ❌ **Not found at all.** `footnotes=0` on all 45 documents probed, including four theses, three dissertations/synopses and an academic term paper. |
| 4 | **Comments** | ✅ Added — `desmarais-notes-comments-tables` (6 comments). Also present in the unlicensed `xifanyan/iwork-redline-detector` corpus (1 comment per file). |
| 5 | **Hyperlinks** | ✅ Added — `jmschultz-resume` (7), `desmarais-notes-sections-hyperlinks` (5). |
| 6 | **Multiple sections** | ✅ Added — 8 sections (`desmarais-notes-sections-hyperlinks`) and 6 sections (`patrickomatic-pages26`). |
| 7 | **Charts** | ⚠️ Found exactly **once**: `TheFebrin/UNIVERSITY .../Task1/Report.pages` (`charts=2`, plus 91 images, 9 readable v5 tables, 2 non-empty footers — score 6). Repo has **no licence**; also 3.4 MB. This is the single biggest gap left. |
| 8 | **Change tracking** | ⚠️ Found only in `xifanyan/iwork-redline-detector` (`storagesWithChangeTracking=1` in `comments.track.pages` and `tracking.insert.deletion.pages`, format 26.0.0). Repo has **no licence**. |
| 9 | Tables with v5 cell storage | ✅ Added — `desmarais-notes-comments-tables` (4 readable cells). |
| 9 | Lists | ✅ Everywhere (`listStyledParagraphs` > 0 on every file). |
| 9 | Text boxes | ✅ Added — `compphysics-poster` (48), `patrickomatic-pages26` (4), `jmschultz-resume` (2). |
| 9 | TOC | ✅ Added — `desmarais-notes-comments-tables` has 3 TOC objects (all pre-existing fixtures had exactly 1). |

Two capabilities showed up that were not on the list and are worth noting: **page-layout
documents** (`isPageLayout=true`) appeared in `claycle/fl-publisher-pages-templates`
(unlicensed), `cds-hooks/docs` (Apache-2.0 but 8.4 MB, over the size cap) and
`tinnguyen1372/FYP` (GPL-3.0, but format 1.5.0 which the corpus already covers). **No
page-layout fixture was added**; a licensed, small one would be a good future addition.

## 5. Licensing caveats — the binding constraint

This was by far the hardest part of the task, and it is the reason the corpus did not get the
top-scoring documents.

- Of the **54 repositories** found to contain `.pages` files, only **13 had any licence file**
  (≈ 24 %). The rest are personal coursework, résumé and thesis repositories with no licence,
  i.e. all rights reserved.
- Those 13 licensed repositories hold **21 `.pages` paths between them, and every one was
  downloaded and probed** — so the licensed side of this survey is exhaustive, not sampled.
  Six of the 21 were unusable: 5 stubs in `Yiping-Yin/Wiki` (574–901 bytes, fail IWA parsing)
  and 1 mkdocs YAML file (`asterisk/documentation`, mirrored by `ipoddubny/documentation`).
  Two more are duplicate forks (`rizzolol/docs` of `cds-hooks/docs`; `orca-zhang/iwork` of
  `orcastor/iwork-converter`).
- The three highest-scoring documents in the entire survey are all unlicensed:
  - `chongpig/CS2100 lab8/...` — score 8 (masks, footer text, 159 text boxes, format 14.4.1)
  - `claycle/fl-publisher-pages-templates` — score 7 (page layout, 3 sections, 98 text boxes)
  - `TheFebrin/UNIVERSITY .../Task1/Report.pages` — score 6 and **the only file with charts**
- The **only** source of change-tracking and multi-comment Pages files anywhere in the survey,
  `xifanyan/iwork-redline-detector`, has no licence (confirmed: no `LICENSE` file, and its
  README states none). If change tracking becomes a blocking requirement, the realistic
  options are (a) ask that project to add a licence, or (b) author the fixture locally in
  Pages rather than redistributing theirs.
- Licences were verified by **fetching and reading the licence file**, not by trusting GitHub
  metadata. Two licensed candidates were still rejected on other grounds:
  - `cds-hooks/docs docs/cheat-sheet/CDS Hooks Cheat Sheet.pages` — Apache-2.0, page-layout
    document, but **8,396,126 bytes**, over the 5 MB cap.
  - `desmarais-patrick/notes src/review-assets.pages` — MIT, 22 images / 3 masks, but
    **8,307,450 bytes**, over the cap.
  - `Katsevich-Lab/sceptre2-manuscript revision/response_to_reviewers.pages` — GPL-licensed and
    a genuine response-to-reviewers document, but score 2: the reviewer exchange is plain body
    text, with no comments, footnotes or tracked changes.
- `patrickomatic/iwork`'s example documents are derived from stock Pages templates. The repo is
  MIT and we redistribute only the author's own saved documents, but this is noted in
  `ATTRIBUTION.md` for transparency.

## 6. False positives and dead ends (recorded so nobody repeats them)

**Files that look like Pages documents but are not:**
- **mkdocs `awesome-pages` config files** are literally named `.pages` (YAML). They dominate
  every path-based search: `renovatebot/renovate`, `rook/rook`, `kubevirt/user-guide`,
  `autowarefoundation/*`, `polkadot-developers/polkadot-docs`, … Filter with
  `grep -v '/\.pages$'`. `asterisk/documentation overrides/.copy-in/ari.pages` is one of these
  (46 bytes of ASCII) despite the non-dot name.
- **.NET `*.Pages/` directories** (`CityofSantaMonica/OrchardCore`) match `\.pages/` patterns.
- **Byte-stubs in file-type detectors**: `sindresorhus/file-type fixture/fixture.pages` is a
  105-byte zip with no `Index/`; `Yiping-Yin/Wiki macos-app/Loom/Tests/fixtures/slide-deck/*.pages`
  are 574–901 byte hand-made stubs that fail IWA parsing (`unsupported chunk type 0x62`,
  `truncated chunk payload`).
- **iWork '09 XML**: `xifanyan/iwork-redline-detector testdata/pages09/*`,
  `openpreserve/format-corpus .../09-4.1-923/lorem-ipsum.pages`.

**Search channels that do not work for this problem:**
- GitHub code search (`path:*.pages`) — requires login; the sandbox GitHub API is repo-scoped.
- Sourcegraph — does **not** index binary file paths (verified: `libetonyek`'s known
  `pages5-file.pages` is invisible to `type:path file:\.pages$`), so it only ever returns
  mkdocs `.pages`.
- Bing / DuckDuckGo / Mojeek — `.pages` is drowned by "GitHub Pages"; exact-phrase queries such
  as `".pages at master"` return zero results.
- Wayback CDX API — blocked by egress policy.
- BigQuery `github_repos.files` — no usable credentials in the sandbox.
- searchcode.com — repurposed as a per-repository MCP service; no global index any more.

## 7. Repositories worth revisiting

- `xifanyan/iwork-redline-detector` — 20 Pages files purpose-built for **change tracking and
  comments** across '09 / 2013 / modern formats. Needs a licence.
- `patrickomatic/iwork` — MIT, actively developed, also ships
  `examples/numbers/table_and_charts.numbers` (**charts**, for whenever Numbers charts matter)
  and four `.key` files.
- `CompPhysics/ThesisProjects` — CC0-1.0 and huge; currently one `.pages` and one `.key`, but
  new theses land there regularly.
- `cds-hooks/docs` — Apache-2.0 page-layout document; usable if the 5 MB cap is ever relaxed.
