# Open-web survey of real iWork documents

Compiled 2026-07-30. Scope: iWork documents published on the **open web** — public data
repositories, institutional archives and ordinary websites — deliberately *excluding* git forges,
which an earlier pass (`research/version-survey.md`) had already covered.

Goal: find `.pages` / `.numbers` / `.key` written by recent app versions (`fileFormatVersion`
26.x) that can legally be redistributed inside an MIT-licensed repository.

Every candidate was verified the same way: download (or HTTP range-read), confirm the first two
bytes are `PK`, then read `Metadata/Properties.plist` and `Metadata/BuildVersionHistory.plist`
and run `node scripts/feature-probe.ts`. Files too large to download whole were probed with a
range-request reader that fetches only the zip central directory and the two metadata plists
(`scratchpad/zprobe.py`), so a 1.4 GB Keynote costs a couple of megabytes.

---

## Headline answer

**Yes — 26.x Keynote documents were found on the open web, and three are now in `fixtures/`.**
They are the first `26.x` `.key` files in the corpus; before this pass the newest `.key`
anywhere was `fileFormatVersion` 14.4.1 (Keynote 14.5).

**No 26.x `.pages` was found on the open web.** Across every repository searched, the newest
`.pages` found outside a code forge is `fileFormatVersion` **14.1.1** (Pages 14.1). Every 26.1.0
`.pages` in `fixtures/` (`gomap-v26.1-newest-writer.pages`, `patrickomatic-pages26-*.pages`,
`patrickomatic-termpaper-*.pages`) still comes from GitHub. See "Negative results" for how
thoroughly this was checked.

No `.numbers` better than what the corpus already has (26.1.0) exists on the open web either —
the newest open-web `.numbers` found is 14.4.1.

Newest writers observed anywhere in this survey:

| App | Newest `fileFormatVersion` | Newest build string | Where |
|---|---|---|---|
| Keynote | **26.1.0** | `M15.2.1-7048.0.3-2` | Zenodo (CC BY 4.0) and Harvard Dataverse (CC0) |
| Keynote (iOS/iPadOS) | **26.0.0** | `T15.1 (7373.0.281)` | Zenodo record 18500468 (CC BY 4.0) |
| Pages | 14.1.1 | `M14.1-7040.0.73-4` | TU Dortmund (CC BY 4.0), Harvard Dataverse (CC0) |
| Numbers | 14.4.1 | `M14.4-7043.0.93-4` | Harvard Dataverse (CC0) |

Two build strings not previously recorded anywhere in this project turned up:
**`M15.1.1-7044.0.273-2`** (Keynote 15.1.1, writes 26.0.0) and **`T15.1 (7373.0.281)`**
(iPadOS Keynote 15.1, writes 26.0.0). Also new: origin-template stamps of the form
`Template: 20_BasicBlack (release/iwork/15.0)` and `Template: 33_DynamicLight (dev/15.3)` —
branch names rather than version numbers, and in the `dev/15.3` case a template from a *newer*
train than the writer that saved the file.

---

## Added to fixtures

All six are redistributable under an explicit CC grant recorded in the deposit record. Full
citations, checksums and licence quotes are in `fixtures/ATTRIBUTION.md` § "Open-web fixtures".

| fixture | source URL | publisher | license | app | ffv | build | score | notable features |
|---|---|---|---|---|---|---|---|---|
| `zenodo-v26.1-hyperlinks-masks.key` | <https://zenodo.org/records/20810526> | Krug, R.M. (SIB Swiss Inst. of Bioinformatics) | CC BY 4.0 | keynote | **26.1.0** | `M15.2.1-7048.0.3-2` | 4 | 9 images / 7 masks, **7 hyperlinks**, 7 smart fields, 4 inline attachments, 1035 objects |
| `zenodo-v26.1-pptx-lineage.key` | <https://zenodo.org/records/20813233> | Krug, R.M.; Ruch, P. | CC BY 4.0 | keynote | **26.1.0** | `M15.2.1-7048.0.3-2` | 2 | **origin marker `pptx`** (PowerPoint import), 13 images, 11 inline attachments |
| `zenodo-v26.0-ios-writer.key` | <https://zenodo.org/records/18500468> | Böhn, Livana | CC BY 4.0 | keynote | **26.0.0** | **`T15.1 (7373.0.281)`** | 4 | only **iPadOS/iOS-written** modern fixture; 14 images / 9 masks, 4 hyperlinks; 4.83 MiB |
| `zenodo-v13.1-tables-images.key` | <https://zenodo.org/records/18975601> | Amit Chauhan (Udai Pratap College, Varanasi) | CC BY 4.0 | keynote | 13.1.2 | `M13.1-7037.0.101-2` | 4 | only `.key` with **readable BNC-v5 table cells** (2 tables), 8 images / 7 masks |
| `tudortmund-v4.2-footers-table.pages` | <https://doi.org/10.17877/TUDODATA-2025-MC06WAYR> | Remes, D. (TU Dortmund) | CC BY 4.0 | pages | 4.2.3 | `M8.2-6520-2` | 4 | only Pages 8.2 / `4.2.x` writer in the set; 3 non-empty footers, 1 readable BNC-v5 table |
| `tudortmund-v14.1-footers-table.pages` | same dataset | Remes, D. (TU Dortmund) | CC BY 4.0 | pages | 14.1.1 | `M14.1-7040.0.73-4` | 4 | **same document as the row above, re-saved 8 years later** — a matched 4.2.3 → 14.1.1 upgrade pair |

The upgrade pair is the most useful Pages result here: both files carry
`Template: Blank (4.2)` as BuildVersionHistory element 0 and `M8.2-6520-2` as element 1; the
English one simply appends `M14.1-7040.0.73-4`. Everything semantic is identical (63 text
storages, 1 BNC-v5 table, 3 non-empty footers, 3 inline attachments), so any structural diff
between them is attributable to the format upgrade rather than to content.

---

## Found but not redistributable, or not worth adding

### Probed in full (downloaded, `feature-probe` run)

| file | source | publisher | license status | app | ffv | build | score | notes |
|---|---|---|---|---|---|---|---|---|
| `Workshop Feedback.key` | [zenodo 20811703](https://zenodo.org/records/20811703) | Krug, R.M. | CC BY 4.0 — **redistributable** | keynote | **26.1.0** | `M15.2.1-7048.0.3-2` | 4 | 22 images / 7 masks, 1 hyperlink. Skipped **only** for size (15.3 MB). Best fallback if a bigger 26.1 sample is ever wanted. |
| `Sr.Tabassum Maniyar .key` | [zenodo 20719218](https://zenodo.org/records/20719218) | Maniyar, T. | CC BY 4.0 | keynote | 14.4.1 | `T14.4 (7372.0.92)` | 2 | iOS writer, but superseded by the 26.0.0 iOS fixture |
| `Presentation 10.key` | [zenodo 17718344](https://zenodo.org/records/17718344) | — | CC BY 4.0 | keynote | 14.4.1 | `T14.4 (7372.0.92)` | 3 | iOS writer, 7 images / 7 masks |
| `posterdraft2.key` | [zenodo 18177221](https://zenodo.org/records/18177221) | — | CC BY 4.0 | keynote | 14.4.1 | `M14.4-7043.0.93-4` | 3 | 10 images, 2 masks |
| `Teuta Poster24x36.key` | [zenodo 17705372](https://zenodo.org/records/17705372) | — | CC BY 4.0 | keynote | 14.4.1 | `M14.4-7043.0.93-4` | 2 | poster layout, 2 images |
| `fundamentals-QBM-learning.key` | [zenodo 18891509](https://zenodo.org/records/18891509) | — | CC BY 4.0 | keynote | 14.1.1 | `M14.1-7040.0.73-4` | 3 | 71 images, 58 inline attachments |
| `Q-SDPs-rochester.key` | [zenodo 20586897](https://zenodo.org/records/20586897) | — | CC BY 4.0 | keynote | 14.1.1 | `M14.1-7040.0.73-4` | 3 | 259 images, 3130 objects, 12.1 MB |
| `q-neurons.key` | [zenodo 20841650](https://zenodo.org/records/20841650) | — | CC BY 4.0 | keynote | 14.1.1 | `M14.1-7040.0.73-4` | 3 | 193 images, 10.9 MB |
| `q-channel-disc-banff.key` | [zenodo 21404894](https://zenodo.org/records/21404894) | — | CC BY 4.0 | keynote | 14.1.1 | `M14.1-7040.0.73-4` | 3 | 277 images, 3738 objects, 13.4 MB — newest *deposit* date (2026-07-17) but an old writer |
| `Tree_Problem_List.pages` | [Yale Dataverse `doi:10.60600/YU/YL2LSZ`](https://doi.org/10.60600/YU/YL2LSZ) | Brownstein, C. (Yale) | **CC0 1.0 — redistributable** | pages | 11.2.9 | `M11.2-7032.0.145-2` | 2 | 23,516 body chars / 259 paragraphs. Not taken: the corpus already covers Pages 11.x with `threatconnect-v11.1-headers-footers-sections.pages`, which scores 11. |
| `ReadMe File.pages` | [Harvard `doi:10.7910/DVN/ENGP1O`](https://doi.org/10.7910/DVN/ENGP1O) | — | CC0 1.0 — redistributable | pages | 14.1.1 | `M14.1-7040.0.73-4` | 2 | no feature gain over existing 14.4.1 Pages fixtures |
| `replication_code.do.pages` | same dataset | — | CC0 1.0 | pages | 14.1.1 | `M14.1-7040.0.73-4` | 2 | 7,423 body chars, 186 paragraphs |
| `Phenomnoglocial velocity introduction.pages` | [Harvard `doi:10.7910/DVN/YFY5HI`](https://doi.org/10.7910/DVN/YFY5HI) | Yeshuason, P. | **CC BY-NC-ND 4.0 — NOT redistributable** (NC incompatible with MIT repo) | pages | 10.2.3 | `M10.3.5-7029.5.5-2` | 2 | would have been the only 10.2.x Pages |
| `Table of Contents for The Book of Phenomenological Velocity.pages` | same | Yeshuason, P. | CC BY-NC-ND 4.0 — **not** redistributable | pages | 10.2.3 | `M10.3.5-7029.5.5-2` | 2 | |
| `The Book of Phenomenological Velocity Title Page.pages` | same | Yeshuason, P. | CC BY-NC-ND 4.0 — **not** redistributable | pages | 10.2.3 | `M10.3.5-7029.5.5-2` | 2 | |
| `Fatigue study qualitative.pages` | [Harvard `doi:10.7910/DVN/CBOYWO`](https://doi.org/10.7910/DVN/CBOYWO) | Camparo et al. | flagged `canDownloadFile:false` in the search API — treated as **not** clearly redistributable | pages | 10.1.8 | `M10.1-6913-2` | 2 | 12,560 body chars |
| `ALL SCORES.numbers` | [Harvard `doi:10.7910/DVN/QXHYKX`](https://doi.org/10.7910/DVN/QXHYKX) | — | CC0 1.0 | numbers | 14.4.1 | `M14.4-7043.0.93-4` | 2 | corpus already has 26.1 Numbers |
| `Data_final_AI_drugdevelopment.numbers` | [Harvard `doi:10.7910/DVN/LP3DAT`](https://doi.org/10.7910/DVN/LP3DAT) | — | CC0 1.0 | numbers | 14.1.1 | `M14.1-7040.0.73-4` | 2 | |
| `Dataset_VSMI.numbers` | [Harvard `doi:10.7910/DVN/A7A9IT`](https://doi.org/10.7910/DVN/A7A9IT) | — | CC0 1.0 | numbers | 11.2.9 | `M11.2-7032.0.145-2` | 2 | |
| `presentation_001.key` | [zenodo 20393890](https://zenodo.org/records/20393890) | — | MIT | — | — | — | — | **not a zip** — no EOCD record; not an iWork document despite the extension |
| `example_minimal.key`, `alpha/beta/gamma/testA/testB/training.key`, `heat/prod/min.key`, `key.key`, `phyparts_*.node.key`, `CONTROL_CARDS.key`, `PLATE.key` | various Zenodo | — | various | — | — | — | — | false positives: cryptographic keys, phylogenetics `.node.key`, LS-DYNA keyword decks — `.key` collides with several non-Keynote formats |
| `THUMSv4_*.key`, `ExplicitSolver.key`, `Wall.key`, `PARAMETERS.key`, … (24 files) | [DaRUS `doi:10.18419/DARUS-5101`, `-4221`, `-3789`](https://doi.org/10.18419/DARUS-5101) | Univ. Stuttgart | CC BY 4.0 | — | — | — | — | LS-DYNA keyword files, not Keynote |
| `fdaM.pages` | Harvard / UVA LibraData | — | — | — | — | — | — | 120-byte JSON stub, not a document |

### Probed remotely only (range-read; too large to ship)

All are Harvard Dataverse deposits by Alyssa Goodman (Harvard) et al. and are **CC0 1.0 —
legally redistributable**, but 74 MB – 1.4 GB each, far over any sane fixture budget. They are
the strongest independent confirmation that 26.x Keynote is in everyday use.

| file | dataset | size | ffv | build | BuildVersionHistory element 0 |
|---|---|---|---|---|---|
| `rad50alums_goodman.key` | [`doi:10.7910/DVN/BRFLGR`](https://doi.org/10.7910/DVN/BRFLGR) | 74.8 MB | **26.1.0** | `M15.2.1-7048.0.3-2` | `Template: 21_BasicWhite (dev/15.3)` |
| `HAA_Travel_Goodman_Part1.key` | [`doi:10.7910/DVN/9DZ6HW`](https://doi.org/10.7910/DVN/9DZ6HW) | 202.6 MB | **26.1.0** | `M15.2.1-7048.0.3-2` | `Template: 20_BasicBlack (dev/15.3)` |
| `Renaissance_Prediction_2026_AG.key` | [`doi:10.7910/DVN/UNOOJK`](https://doi.org/10.7910/DVN/UNOOJK) | 400.5 MB | **26.0.0** | `M15.1.1-7044.0.273-2` | `Template: White (2018-02-21 14:41)` — 12-entry history reaching back to 2018 |
| `AG StuFf 26.key` | [`doi:10.7910/DVN/O4NQ9Q`](https://doi.org/10.7910/DVN/O4NQ9Q) | 574.0 MB | **26.0.0** | `M15.1-7044.0.271-2` | `Template: 20_BasicBlack (release/iwork/15.0)` |
| `NOIRLab25_AG_MW3D.key` | [`doi:10.7910/DVN/GNAHCG`](https://doi.org/10.7910/DVN/GNAHCG) | 1.30 GB | **26.0.0** | `M15.1.1-7044.0.273-2` | `Template: 20_BasicBlack (13.2)` |
| `WayWayOutThere2026RenWknd.key` | [`doi:10.7910/DVN/VHLAJF`](https://doi.org/10.7910/DVN/VHLAJF) | 1.38 GB | **26.0.0** | `M15.1.1-7044.0.273-2` | `Template: 20_BasicBlack (13.2)` |
| `TEMPO_August25_Goodman_CosmicDS.key` | [`doi:10.7910/DVN/EUG3PF`](https://doi.org/10.7910/DVN/EUG3PF) | 112.5 MB | 14.4.1 | `M14.4-7043.0.93-4` | `pptx` |
| `Conspiracy Beliefs Data RAW .numbers` | [`doi:10.7910/DVN/Y03CF4`](https://doi.org/10.7910/DVN/Y03CF4) | 0.7 MB | 14.1.1 | `M14.1-7040.0.73-4` | `csv` |
| `SGINC_Parity_Master2.numbers` | [`doi:10.7910/DVN/GRE48Q`](https://doi.org/10.7910/DVN/GRE48Q) | 0.34 MB | 14.4.1 | `M14.4-7043.0.93-4` | `csv` |
| `ALL SCORES.numbers` | [`doi:10.7910/DVN/QXHYKX`](https://doi.org/10.7910/DVN/QXHYKX) | 0.83 MB | 14.4.1 | `M14.4-7043.0.93-4` | `xlsx` |
| `DATA_SRL-IBL_validation_openaccess.numbers` | DataverseNL [`doi:10.34894/EOVKRZ`](https://doi.org/10.34894/EOVKRZ) | 0.41 MB | 14.4.1 | `M14.4-7043.0.93-4` | `csv` |

(Two further `.numbers` candidates — DataverseNL `doi:10.34894/OUURRH` and NIE Singapore
`doi:10.25340/R4/1YOTQQ` — returned HTTP 403 to the range reader and could not be probed.)

### Bulk remote survey: all 321 Zenodo `.key` deposits

Zenodo lists 327 `.key` files; 321 were range-probed (6 skipped as sub-3 KB stubs), 14 failed to
read, and 20 more carried no `fileFormatVersion` at all — those are the non-Keynote `.key`
formats. That leaves **287 identifiable Keynote documents**, the broadest version census of
real-world Keynote files in this project.

`fileFormatVersion` distribution (top of the histogram):
`12.1.1` ×37, `2.0.24` ×27, `14.4.1` ×23, `14.2.2` ×20, `13.2.1` ×16, `2.3.4` ×15, … and
**`26.1.0` ×3, `26.0.0` ×1** — i.e. **1.4 % (4/287) of publicly deposited Keynote documents are
26.x** as of July 2026.

Two further findings from that census:

- **66 of the 287 identifiable documents (23 %) have `pptx` as BuildVersionHistory element 0**,
  and 6 more have `potx` — nearly a quarter of publicly deposited Keynote files began life as
  PowerPoint. Import lineage is the common case for `.key`, not the exception. Only one such
  file is 26.x, and it is now `zenodo-v26.1-pptx-lineage.key`.
- **Zero** deposits were written by the iCloud/web writer (`G-r…` build strings), despite the
  corpus containing two such files from other sources. Web-authored iWork files apparently do
  not get deposited.
- Other element-0 markers seen: `key` (Keynote-to-Keynote import) ×3, `kth` ×5,
  `local build-Nov 17 2010` ×16 / `local build-Nov 15 2011` ×4 / `local build-Oct 16 2012` ×3
  (iWork '09-era Keynote 5.x stamps), and opaque hex-ish markers `5E85` ×15, `5D7` ×3.

---

## Negative results, stated plainly

- **No `26.x` `.pages` exists on the open web** as far as this survey can determine. Newest
  found: `14.1.1`. This was checked from three independent directions:
  1. **Zenodo** indexes **zero** `.pages` deposits and **zero** `.numbers` deposits (`filetype:pages`
     → 0 hits, `filetype:numbers` → 0, while `filetype:key` → 233, `filetype:sav` → 3 603,
     `filetype:dta` → 1 128, `filetype:m4v` → 312, so the filetype index does work for arbitrary
     extensions). Researchers deposit slide decks in native format and documents as PDF.
  2. **All 150 Dataverse installations** (from `IQSS/dataverse-installations`) were swept with
     `fileName:*.pages|*.numbers|*.key`. Total `.pages` found worldwide: **12**, at Harvard (7),
     TU Dortmund (2), Yale (2) and UVA (1). Newest writer among them: Pages 14.1.
  3. **DataCite's `formats` index** — searching `formats:"application/x-iwork-pages-sffpages"`
     across every DOI DataCite holds returns **4 records**, all of which the Dataverse sweep had
     already found. (`…-keynote-sffkey` → 68, `…-numbers-sffnumbers` → 28.)
- **No `26.2` or `26.3` file of any kind was found**, for any app. `numbers-parser` declares
  support for those versions but nothing in the wild writes them yet; the newest writer observed
  anywhere is Keynote/Numbers 15.2.1 → `26.1.0`.
- **No `.pages` was found on any `.gov`, `.mil`, state or municipal site.** US federal agencies
  publish in PDF and HTML by policy — the EPA's web standard and the Department of Labor's file
  formats policy both name HTML and PDF as the primary formats and treat proprietary office
  formats as exceptions — and no `.pages` surfaced on any government host through any search
  route tried. Note also that the search routes available here are weak for this case (see
  "Which search strategies actually worked"), so this is "not found", not "does not exist".
- **No OER repository yielded an iWork file.** OER Commons, MERLOT and Open Textbook Library
  distribute PDF/EPUB/Google Docs. SkillsCommons — the largest CC BY 4.0 OER collection, which
  *does* accept native authoring formats — was unreachable during this survey (TLS chain failure
  by `curl`, HTTP 503 by fetch); it remains the single most promising unexplored source and is
  worth retrying.
- **Apple's own education materials could not be probed.** `education.apple.com` resource pages
  bundle their Pages templates as sign-in-gated `.zip` downloads with no direct file URL in the
  HTML. (They would have been probe-only in any case — Apple's content is copyrighted.)
- **`fixtures/` gained no new coverage of charts, footnotes, comments or change tracking.** None
  of the 26.x files found exercise any of them: `feature-probe --json` reports
  `charts=0 footnotes=0 comments=0 bookmarks=0 storagesWithChangeTracking=0 tables=0` for all
  three 26.x Keynote fixtures. Headers/footers and footnotes are Pages-only constructs, so they
  cannot come from a `.key` no matter how new — closing those gaps at 26.x needs a 26.x `.pages`,
  which this survey did not find.

---

## Which search strategies actually worked

**Worked well:**

1. **Repository *file-type* indexes, queried through APIs.** By far the highest yield.
   `https://zenodo.org/api/records?q=filetype:key` alone produced every 26.x file that ended up
   in `fixtures/`. Zenodo's `filetype:` operator matches arbitrary extensions and is exact.
2. **Dataverse's `fileName:*.ext` file search**, run across all 150 known installations from the
   published installation list. This is the only route that found `.pages` at all, and it found
   every `.pages` that exists in the repository world.
3. **DataCite's `formats:"<mime>"` query.** A cheap cross-repository cross-check that confirmed
   the Dataverse sweep was complete, and surfaced the 2026 Harvard Keynote deposits that the
   per-installation search's 50-result page had truncated away.
4. **HTTP range-reading the zip central directory** instead of downloading. Version markers live
   in two small files (`Metadata/Properties.plist`, `Metadata/BuildVersionHistory.plist`), so a
   1.4 GB Keynote can be version-identified for ~2 MB of traffic. This made the 321-file Zenodo
   census and the Harvard gigabyte-scale deposits practical. Script:
   `scratchpad/zprobe.py` (not committed; ~140 lines, stdlib only).
5. **Sorting repository results by deposit date and probing the newest first.** Deposit date is
   a weak but real proxy for writer version — though note `q-channel-disc-banff.key`, deposited
   2026-07-17, was written by Keynote 14.1.

**Did not work at all:**

- **`filetype:pages` / `ext:pages` on any web search engine.** Google and Bing only index file
  types they can extract text from; `.pages` is an opaque zip, so it is never in the index. Bing
  HTML scraping for `site:gov filetype:pages` returned zero `.pages` URLs. This is the single
  biggest reason ordinary-website `.pages` files are effectively unfindable at scale.
- **`intitle:"index of"` open-directory dorks** — returned only articles *about* the Pages format.
- **Web archives.** `web.archive.org` (including the CDX URL index, which does support
  `filter=original:.*\.pages$` and would have been ideal) is unreachable from this environment.
  `archive.org` proper is reachable but indexes item metadata, not file names, and has no
  `format:"Apple Pages"` items.
- **Common Crawl's index** (`index.commoncrawl.org`) is unreachable from this environment; even
  when reachable, its CDX server matches by host/prefix, not by file extension.
- **Full-text search over file names** at figshare (search does not index file names), Dryad and
  Mendeley Data (no file-name search endpoint), and OSF (all `/v2/search/…` routes now 404 —
  OSF's file search API has been withdrawn). These are large repositories that almost certainly
  *do* hold iWork files; there is simply no public way to enumerate them by extension.
- **CKAN portals** including `catalog.data.gov` — `res_format` faceting returned nothing and the
  API path 404s; government open-data portals hold tabular data, not office documents.

**Recommendation if this hunt is repeated:** the productive frontier is (a) SkillsCommons, when
it is reachable, since it is uniformly CC BY 4.0 and accepts native authoring formats; (b) a
re-run of the Zenodo `filetype:key` census in six months, since the 26.x share was 1.2 % in
July 2026 and will grow; and (c) any route that gets an extension-level URL index of the open
web — Common Crawl's columnar index or the Wayback CDX API — which would be the only way to
reach the school, agency and small-business `.pages` files that certainly exist but are
invisible to search engines. Note that almost all of those would be copyrighted and probe-only.
