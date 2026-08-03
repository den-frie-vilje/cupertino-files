# Non-git source survey: package registries, other code hosts, web archives, test corpora

Compiled 2026-07-30. Scope: find iWork documents written by **recent** app versions in sources
**outside GitHub** — other code hosts, package registries, software distributions, web archives,
document-conversion test corpora, and digital-preservation / format registries. Complements
`research/openweb-survey.md` (general open web) and `research/version-survey.md` (format eras).

Every candidate was verified the same way: first two bytes must be `PK`, then
`node scripts/feature-probe.ts <file>`. `fileFormatVersion` is read from
`Metadata/Properties.plist`, the build string from the **last** element of
`Metadata/BuildVersionHistory.plist`. For large remote files a range-request reader
(`rzip.py`, scratchpad) pulled only the ZIP central directory and the two `Metadata/*.plist`
members, so a 941 MB `.key` cost a few tens of KB to version-check.

## Headline results

- **Nothing outside GitHub beat the corpus.** The newest Pages/Keynote found through these
  channels is **14.4.1 / Pages 14.4** (a LibreOffice bug attachment). No `26.x` `.pages` or
  `.key` exists in any package registry, other code host, or web archive surveyed.
- **Two files added**, both from package registries, both chosen for reasons other than
  novelty: a MIT-licensed minimal Numbers `14.1.1` (fills a version gap) and an ISC-licensed
  Keynote `2.0.24` written by **macOS** Keynote 6.6.2 (a writer-platform control for the
  existing iOS-written file at the identical format version).
- **One genuinely novel specimen, not addable:** a Pages **collaboration-mode** package
  (`fileFormatVersion` 14.4.1) whose `Index/OperationStorage.iwa` is **LZFSE-compressed
  (`bvxn` … `bvx$`), not Snappy** — see [Collaboration-mode Pages](#collaboration-mode-pages-a-format-variant-the-loader-rejects).
  It is a bug-tracker attachment with no redistribution grant, so it is reported, not shipped.
- **`web.archive.org` is unreachable from this environment** (connection reset on every
  request, including via the fetch tool), so the Wayback CDX / URL-pattern route could not be
  exercised at all. `archive.org` itself (metadata, advancedsearch, item downloads) worked and
  was used. This is an environment limit, not a negative finding about the Wayback index.

## Added to `fixtures/`

| file | source (channel) | licence | app | `fileFormatVersion` | build | layout | objs | score |
|---|---|---|---|---|---|---|---|---|
| `pypi-numbers-parser-v14.1.1-empty-template.numbers` | PyPI sdist `numbers_parser-4.18.5.tar.gz` → `src/numbers_parser/data/empty.numbers` | **MIT** (`LICENSE.rst` inside the same tarball) | numbers | **14.1.1** | `M14.1-7040.0.73-4` | flat | 643 | 2 |
| `npm-keynote-extractor-v2.0.24-macos-images-masks.key` | npm `keynote-extractor-2.1.0.tgz` → `package/test/test-data/presentation.key` | **ISC** (`package.json` field; no `LICENSE` file shipped) | keynote | 2.0.24 | `M6.6.2-2571-1` | flat | 498 | 3 |

Feature lines:

```
pypi-numbers-parser-v14.1.1-empty-template.numbers
  numbers | era=modern | format=14.1.1 | build=M14.1-7040.0.73-4 | flat | 643 objects | score=2
  textStorages=7 nonEmptyStorages=1 tables=1 tableCellStorage=v5 readableTableCells=1
  inlineAttachments=1 listStyledParagraphs=7

npm-keynote-extractor-v2.0.24-macos-images-masks.key
  keynote | era=iwork16 | format=2.0.24 | build=M6.6.2-2571-1 | flat | 498 objects | score=3
  textStorages=62 nonEmptyStorages=34 images=7 imagesWithMask=7 tableCellStorage=none
  inlineAttachments=3 listStyledParagraphs=62
```

Rationale, stated plainly: neither is newer than what the corpus already has. The Numbers file
is the **seed template `numbers-parser` writes from** — the canonical minimal modern package —
and `14.1.x` was an unoccupied slot between the existing `2.0.24`, `14.4.1`, `26.0.0`, `26.1.0`
Numbers files. The Keynote file has the *same* `fileFormatVersion` as `tika-testKeynote2013.key`
but a **macOS** writer where that one has an **iOS** writer (`M6.6.2-2571-1` vs `T2.6.1 (2180)`),
which separates "what the format version dictates" from "what the writing platform dictates".

## Probed but NOT redistributable

Licence status is recorded for each. None of these were copied into `fixtures/`.

### LibreOffice / TDF Bugzilla attachments — licence: **none granted**

`bugs.documentfoundation.org` attachments are user-uploaded reproduction files. The upload form
carries no licence grant and TDF publishes no blanket licence for attachments, so these are
"unclear" under the hard constraint. Found by querying the REST API with the boolean-chart
field `attachments.filename` (`f1=attachments.filename&o1=substring&v1=.pages`), plus every
attachment on all 44 bugs in the `libetonyek` component. Download requires `curl -L` —
`attachment.cgi` 302s to `bug-attachments.documentfoundation.org`.

| bug / att | file | app | `fileFormatVersion` | build (last) | score / notable |
|---|---|---|---|---|---|
| 166298 / 200502 | `Test LibreOffice.pages.zip` | pages | **14.4.1** | `M14.4-7043.0.93-4`, then `G-r1440-14E123` | **loader fails** — collaboration mode, see below |
| 170824 / 205542 | `2025_Books_read.numbers` | numbers | 13.2.1 | `M13.2-7038.0.87-4` | 2 — 10 tables, BNC v5 |
| 170824 / 205543 | `Test1.numbers` | numbers | 13.2.1 | `M13.2-7038.0.87-4` | 2 |
| 170824 / 205544 | `Test2.numbers` | numbers | 13.2.1 | `M13.2-7038.0.87-4` | 2 |
| 156643 / 188812 | `Untitled.pages` | pages | 13.1.2 | `M13.1-7037.0.101-2` | 2 — 3 TOC objects |
| 146218 / 176918 | `quote.key` | keynote | 11.1.2 | `M11.1-7031.0.102-2` | 3 |
| 143301 / 173493 | `Aufgabe 5.pages` | pages | 11.1.2 | `M11.1-7031.0.102-2` | 2 |
| 161409 / 194535 | animated Keynote deck | keynote | 11.0.3 | `M11.0.1-7030.1.2-4` | 4 |
| 161408 / 194533 | animated Keynote deck | keynote | 3.2.13 | `M8.3-5989-2` | 4 |
| 123571 / 162231 | `Žlutá_řeka.pages` | pages | 10.0.10 | **`G-r1000-10A161`** (iCloud web writer) | 4 |

The 2026-dated bug (170824, filed 2026-02-16) turned out to carry **13.2.1** files, not 26.x —
a useful reminder that report date and document age are unrelated.

### Apache Tika JIRA attachments — licence: **unclear**

ASF JIRA attachments are covered at most by a grant *to the ASF* (Apache License §5), which is
not a public redistribution grant, and none of these were committed into `apache/tika`'s
`test-documents`. Found with the JIRA REST search
(`project=TIKA AND (summary ~ "iwork" OR summary ~ "keynote" …)`), reading the `attachment`
field.

| issue | file | app | `fileFormatVersion` | build | score / notable |
|---|---|---|---|---|---|
| TIKA-4464 (2025-08-12) | `sample.key` (4.9 MB) | keynote | 13.2.1 | `M13.2-7038.0.87-4` | 4 — **`imagesWithFilters=13`**, 42 images, 9 masks |
| TIKA-4464 | `sample.numbers` | numbers | 13.2.1 | **`G-r1320-13C165`** (iCloud web) | 2 |
| TIKA-4464 | `sample.pages` | pages | 2.3.4 | `M6.3.1-5249-2` | 3 — 75 text boxes |
| TIKA-4464 | `sample-2.pages` | pages | 2.3.4 | `M6.3.1-5249-2` | 3 — 76 text boxes |
| TIKA-3634 | `brochure.pages` | pages | 1.5.0 | `M5.5.2-2120-1` | 5 — page-layout, 24 smart fields, 2 sections |
| TIKA-3634 | `keynotecreated.key` | keynote | 1.5.0 | `M6.5.2-2119-1` | 3 |
| TIKA-3634 | `mortgagecalculator.numbers` | numbers | 1.5.0 | `M3.5.2-2118-1` | 1 — pre-BNC cell storage |
| TIKA-3517 | `SSN.pages` | pages | 11.1.2 | `M11.1-7031.0.102-2` | 2 |
| TIKA-3517 | `SSN.numbers` | numbers | 11.1.2 | `M11.1-7031.0.102-2` | 2 |
| TIKA-2981 | `example.numbers` | numbers | 4.1.7 | `M6.1-6369-2` | 2 |

`TIKA-4464/sample.key` is the strongest *feature* find of the whole pass: **13 images carrying
`TSD.ImageArchive.imageAdjustments`**, against a corpus best of 1
(`rougier-v13.1-image-filters-masks.pages`). If a licensed 13.x-era Keynote with image filters
ever turns up, it is worth the slot.

### archive.org items — licence: CC0 / CC BY-SA / none, all rejected on size or licence

Found via `archive.org/advancedsearch.php` (`subject:"keynote" AND mediatype:data`,
`collection:opensource_media AND keynote`, `"iwork" AND mediatype:software`, plus
`format:"Unknown"` sweeps), then `archive.org/metadata/<id>` for file listings and a
range-request read of each file's ZIP directory for the version.

| item / file | licence | size | `fileFormatVersion` | build | why rejected |
|---|---|---|---|---|---|
| `keynote-rosary-sacred-art-glorious-vol1-nomusic.key` | **CC0 1.0** | 103.2 MB | 14.1.1 | `M14.1-7040.0.73-4` | 20× the 5 MB cap |
| `keynote-rosary-sacred-art-luminous-vol1-nomusic-revised.key` | **CC0 1.0** | 115.7 MB | 14.1.1 | `M14.1-7040.0.73-4` | size |
| `keynote-rosary-sacred-art-sorrowful-vol1-nomusic.key` | **CC0 1.0** | 91.0 MB | 14.1.1 | `M14.1-7040.0.73-4` | size |
| `keynote-rosary-sacred-art-joyful-vol1-nomusic-revised.key` | **CC0 1.0** | 75.2 MB | 14.1.1 | `M14.1-7040.0.73-4` | size |
| `keynote-rosary-sacred-art-joyful-vol1-debussy-revised.key` | CC BY-SA 4.0 | 104.8 MB | 14.1.1 | `M14.1-7040.0.73-4` | size + share-alike |
| `designanappicon-project.key` ("Apple Everyone Can Code / Today at Apple", creator *Apple, Inc.*) | none — proprietary | 46.7 MB | 12.2.8 | `M12.2.1-7035.0.161-2` | licence |
| `211cffd5-…_holiday-cards-downloadable.key` ("Today at Apple 2021 Holiday Cards", creator *Apple, Inc.*) | none — proprietary | 42.3 MB | 11.2.9 | `M11.2-7032.0.145-2` | licence |
| `Geko OS 3 Expedition.key` | none | 47.3 MB | 12.2.8 | **`T12.2.1 (7364.0.3)`** (iPadOS writer) | licence + size |
| `Sunday Slides.key` | none | 941.7 MB | 12.2.8 | `M12.2.1-7035.0.161-2` | licence + size |

The five CC0/CC-BY-SA rosary decks are the only cleanly-licensed iWork documents archive.org
turned up, and every one is a 75–116 MB photo-heavy deck at `14.1.1` — a licence win the size
cap makes unusable. Worth noting for anyone who later relaxes the cap: they are all
`M14.1-7040.0.73-4`, i.e. still older than the corpus's 14.5 files.

### Package-registry files rejected

| registry / package | file | licence | app | `fileFormatVersion` | build | why rejected |
|---|---|---|---|---|---|---|
| npm `keynote-parser@1.0.0` | `package/test/fixtures/test.key` | **none** (no `license` field, no `LICENSE` file) | keynote | 2.4.4 | `M8.0-5576-2` | licence **and** 12.79 MB |
| RubyGems `rapinoe@0.0.4` | `test/fixtures/ice-cream.key` | **none** — gemspec `licenses:` is empty | keynote | 2.0.24 | `M6.6.1-2560-1` | licence |
| Go module proxy `github.com/orcastor/iwork-converter@v0.0.0-20251015073750` | `testdata/a.pages` | Apache-2.0 (module) | pages | 14.1.1 | `M14.1-7040.0.73-4` | older than `iwork-mcp-v14.5-sample.pages`; already rejected via the git route |
| same | `testdata/a.key` | Apache-2.0 | keynote | 3.1.2 | `M8.1-5683-2` | older than existing `.key` fixtures |
| same | `testdata/a.numbers` | Apache-2.0 | numbers | 11.1.2 | `M11.1-7031.0.102-2` | older than existing `.numbers` fixtures |
| CPAN `Image-ExifTool` (all versions) | `t/images/iWork.numbers` | Perl/Artistic | — | — | — | **1,359 bytes** — a deliberately truncated ExifTool test stub, not a real package |

## Collaboration-mode Pages: a format variant the loader rejects

> **Update 2026-08-03: no longer true — all three recommendations below are
> implemented.** A component that fails to decode goes opaque instead of
> failing the document, `bvx*` magic is reported as LZFSE framing with a
> collaboration-mode explanation, and the bytes are preserved verbatim
> through edits and saves. `test/collaboration-mode.test.ts` rebuilds this
> section's byte shape from the measurements below and pins the behaviour.
> The section stands as the record of the finding.

This is the most useful thing the pass found, and it is a **bug report, not a fixture**.

Source: The Document Foundation Bugzilla
[bug 166298](https://bugs.documentfoundation.org/show_bug.cgi?id=166298),
attachment 200502 (`Test LibreOffice.pages.zip`, 114,997 bytes, uploaded 2025-04-24). The
reporter's finding: LibreOffice opens their Pages documents fine *until* they switch on Pages'
**Collaboration / share** mode, after which import fails. `cupertino-files` fails on it too.

What the package actually is:

- Not a flat `.pages` zip — a `.pages` **directory package**, zipped for upload (so the
  outer zip has a `Test LibreOffice.pages/` root plus `__MACOSX/` noise).
- Inside: `preview.jpg` / `preview-web.jpg` / `preview-micro.jpg`, an **empty `Data/`**,
  `Metadata/{DocumentIdentifier,Properties.plist,BuildVersionHistory.plist}`, and a nested
  **`Index.zip`** (the second of the three supported container layouts).
- `Properties.plist`: `fileFormatVersion` **14.4.1**, `revision` `1::2DEB657F-…`, and
  `shareUUID == documentUUID == stableDocumentUUID` — plus the *pre-26.1* combined key
  `hasExternalReferenceOrMissingOrUnmaterializedRemoteData` (`false`).
- `BuildVersionHistory.plist`: `['Template: Blank (13.2)', 'M14.4-7043.0.93-4', 'G-r1440-14E123']`
  — saved by **macOS Pages 14.4**, then touched by the **iCloud web** writer, which is what
  turning on collaboration does.
- `Index.zip` holds 8 components, **all stored uncompressed** (`compress_type == 0`):
  `Document.iwa`, `DocumentStylesheet.iwa`, `Metadata.iwa`, `DocumentMetadata.iwa`,
  `CalculationEngine-1732611.iwa`, `AnnotationAuthorStorage-1732610.iwa`, and two components
  that appear in **no other file in the corpus**: **`OperationStorage.iwa`** and
  **`ActivityStream.iwa`**.

Why the loader dies — and it is not the wrapper directory or `__MACOSX` (repacking the inner
package flat reproduces the failure exactly):

```
ERROR: iwa: unsupported chunk type 0x62 at offset 0
```

`0x62` is `b`. Seven of the eight components start with the normal IWA chunk header
(`0x00` + 3-byte LE length). `Index/OperationStorage.iwa` starts with **`62 76 78 6e`** =
**`bvxn`** and ends with **`bvx$`**:

```
Index/OperationStorage.iwa   203 bytes
  magic  b'bvxn'   n_raw_bytes 214   n_payload_bytes 187
  tail   ... 00 00 00 00 62 76 78 24      (b'bvx$', LZFSE end-of-stream)
  12 + 187 + 4 = 203  ✓
```

That is Apple's **LZFSE** container carrying a single **LZVN** block — not Snappy. So a
collaboration-enabled Pages document mixes compression codecs *within one `Index.zip`*: the
document graph stays Snappy-framed, while the collaboration operation log is LZFSE-framed.

Actionable for the parser, in priority order:

1. **Do not hard-fail the document.** A component whose first byte is not a known IWA chunk
   type should be skipped and surfaced through `compatibility().unsupportedFeatures`, the same
   way pre-BNC cell storage is. Today one unreadable component takes the whole file down, and
   the six components that *do* parse are lost with it.
2. Recognise `bvxn` / `bvx-` / `bvx1` / `bvx2` / `bvx$` at offset 0 and report it as
   "LZFSE-framed component (collaboration mode)" rather than "unsupported chunk type".
3. Treat `OperationStorage.iwa` + `ActivityStream.iwa` as the collaboration-mode marker;
   `shareUUID == documentUUID` in `Properties.plist` corroborates it.

The attachment carries no redistribution grant, so it is **not** in `fixtures/`. Anyone wanting
to reproduce this locally can turn on Collaboration in Pages and save — the reporter's recipe
in the bug works, and per the bug's own comments the trigger is the share flag, not the content.

## Source categories: what paid, what did not

### 1. Other code hosts — **dead end**

| host | how searched | result |
|---|---|---|
| GitLab (gitlab.com) | `/api/v4/projects?search=` for `iwork`, `keynote-parser`, `numbers-parser`, `apple pages`, `iworkfile`, `pages-parser`; then `/repository/tree?recursive=true` on every plausible hit | nothing. Global **blob** search needs a paid/authenticated Advanced Search tier, so file-content search is simply unavailable unauthenticated. The one lead (`ubports/marketing/UBports-Keynotes`, 7 projects) is `.odp`/`.pdf` — "Keynotes" as in conference talks |
| Codeberg | `/api/v1/repos/search` for `iwork`, `keynote`, `pages`, `numbers-parser`, `etonyek`; `/explore/code?q=` scrape | nothing iWork-related; the code-search route returned no usable results unauthenticated |
| Bitbucket | no public repo/code search API remains; attempted via search engines with `site:bitbucket.org` | nothing |
| SourceForge | directory search (scrape + fetch tool) for `iwork`, `keynote`, `pages converter`, `etonyek` | one hit, **DocWire SDK** (a ~100-format extraction SDK). Its SourceForge "source code" downloads are interstitial HTML, and its real test tree lives on GitHub, so nothing usable through this channel |
| Gitee | `/api/v5/search/repositories?q=iwork` (with and without a browser UA) | empty array |
| Launchpad | `api.launchpad.net` project search for `iwork`, `keynote` | only `ubuntu-keynotes` (a bug-tracker project, no code) |
| KDE `invent.kde.org`, Debian `salsa.debian.org` (both GitLab) | project search for `calligra`, `etonyek`, `tika` | only packaging/fork repos; `libreoffice-team/document-liberation/libetonyek` mirrors upstream test data already in the corpus |
| Software Heritage | `/api/1/origin/search/{iwork,keynote-parser,numbers-parser,etonyek,keynote}` | origin **name** search only — SWH exposes no filename or content search, so it cannot be used for discovery. Every relevant origin it returned was a GitHub or PyPI/npm mirror already covered |

### 2. Package registries / software distributions — **thin but non-empty**

| registry | how searched | iWork documents found |
|---|---|---|
| npm | `/-/v1/search` for `iwork`, `keynote`, `apple pages`, `keynote-parser`, `iwork convert`, `keynote to pdf`, `iwa snappy`, `protobuf iwork`; downloaded and `tar -tzf`'d 10 candidate tarballs | 2 — `keynote-parser@1.0.0` (`test.key`, 12.8 MB, unlicensed) and `keynote-extractor@2.1.0` (`presentation.key`, **added**). `iwork-mcp@0.8.8` publishes only `dist/` + screenshots, **no `examples/`** — the git tree is the only place its sample documents exist |
| PyPI | JSON API for `numbers-parser`, `keynote-parser`, `iwork`, `keynote`, + HTML search | 1 — `numbers_parser` sdist's `data/empty.numbers` (**added**). `keynote-parser` 1.14.4.0's sdist ships tests but **no `.key` data** |
| RubyGems | `/api/v1/search.json` for `iwork`, `keynote`, `pages`, `numbers` | 1 — `rapinoe@0.0.4` `ice-cream.key`, rejected (empty `licenses:`) |
| crates.io | `/api/v1/crates?q=` for `iwork`, `keynote`, `pages`, `numbers`, `apple` | `litchi@0.0.1` is a real Office/ODF/**iWork** parser, but its `.crate` ships **only `.proto` and `.rs`** — no documents |
| Go module proxy | `proxy.golang.org` `@latest` + `@v/<ver>.zip` for `orcastor/iwork-converter`, `ehowe/keynote-parser-go` | 3 documents in `iwork-converter` `testdata/`, all older than the corpus |
| CPAN | MetaCPAN `file/_search` **wildcard on `name`** — a genuine filename search across the whole registry: `*.pages` → 0, `*.numbers` → 78, `*.key` → 10,000 (all TLS/SSH keys) | only `Image-ExifTool`'s 1,359-byte truncated `iWork.numbers` stub |
| Maven Central | `solrsearch` for `iwork`, `keynote`, `etonyek`, `pages-parser` | zero artifacts |
| Packagist, NuGet | `search.json` / `azuresearch-usnc` for `iwork`, `keynote` | nothing (all false positives on "I work…") |

Worth recording as method: **MetaCPAN is the only registry surveyed that exposes a
cross-registry filename search.** npm, PyPI, RubyGems, crates.io and Maven all forced
keyword-guess-then-download-and-list, which is why the coverage here is "plausible packages",
not "all packages".

### 3. Web archives — **partly blocked, otherwise a dead end**

- **`web.archive.org` is unreachable from this environment.** Every request — CDX API, timemap,
  even the site root, over both HTTP and HTTPS, via curl and via the fetch tool — returns
  `Recv failure: Connection reset by peer` / `unable to fetch`. The planned technique (CDX
  `matchType=domain` + `filter=original:.*\.(pages|key|numbers)$` against `gitlab.com`,
  `codeberg.org`, `bitbucket.org`, `sourceforge.net` — i.e. using the archive as a filename
  index for the hosts that have no code search) **could not be tested**. This is the single
  biggest untried lead in the whole survey and is worth retrying from a network that can reach
  it.
- **`archive.org` proper worked** and was searched hard: `advancedsearch.php` across
  `format:`, `subject:`, `collection:`, `licenseurl:`, `uploader:` and free text; ~340 candidate
  items then fetched through `archive.org/metadata/<id>` and grepped for iWork extensions.
  Yield: the nine `.key` files tabulated above, newest `14.1.1`. Sustained querying trips
  archive.org's `429` rate limiter, so sweeps need throttling.
- Search-index caveat worth writing down: **archive.org does not index filenames**, and it
  labels `.key`/`.pages`/`.numbers` files `format:"Unknown"`. So there is no way to ask "which
  items contain a Keynote file" — the only workable path is guess-items-then-fetch-metadata,
  which is what was done.
- **Software Heritage** (also an archive) — no content or filename search; see the code-host
  table.

### 4. Document-conversion / test corpora — **the productive category**

- **The Document Foundation Bugzilla (libetonyek)** — by far the richest vein: 10 real
  user-authored documents spanning `10.0.10` → `14.4.1`, including the collaboration-mode
  specimen and two **iCloud-web-written** files (`G-r1000-10A161`, and `G-r1440-14E123` on the
  collaboration package). Reproducible query recipe is in the section above. Licence blocks
  reuse, but as a *characterisation* source it beats every registry combined.
- **Apache Tika JIRA** — 10 documents, `1.5.0` → `13.2.1`, including the 13-image-filter
  Keynote. Same licence problem.
- **LibreOffice crash-test corpus** (`dev-builds.libreoffice.org/crashtest/`) — the published
  tree is per-run **result** directories keyed by commit SHA; the input document corpus itself
  is not published. Dead end.
- **Calligra, AbiWord, pandoc** — none has an iWork import filter, hence no iWork test data.
  `libetonyek` is the only free-software iWork reader, and its own test files are already in
  the corpus via the git route.
- **DocWire SDK** (found via SourceForge) — see the code-host table.

### 5. Digital preservation / format registries — **dead end**

- **PRONOM** describes iWork PUIDs but publishes **no specimen files**; TNA's signature
  development materials are not exposed as downloadable samples.
- **Just Solve the File Format Problem** (`fileformats.archiveteam.org`) — the wiki returned
  HTTP 503 on every attempt during this pass, so its Apple Pages / Keynote pages could not be
  read. Untested rather than negative.
- **Open Preservation Foundation `format-corpus`** — confirmed again to contain **no** iWork
  documents (consistent with `research/version-survey.md`).
- No national-library or national-archive sample set surfaced an iWork specimen through these
  channels.

## Leads left on the table

1. **Wayback CDX as a filename index** for `gitlab.com` / `codeberg.org` / `bitbucket.org` /
   `sourceforge.net` — blocked by network here; the highest-value retry.
2. **Common Crawl's columnar URL index** — same idea (find `.pages`/`.key` URLs at web scale)
   without depending on `web.archive.org`; needs S3/Parquet querying, not attempted.
3. **`TIKA-4464/sample.key`'s 13 image-filter images** — if a permissively-licensed 13.x-era
   Keynote with `imageAdjustments` ever appears, it fills the corpus's weakest feature slot.
4. **Reproducing collaboration mode locally** (turn on share in Pages, save) would produce a
   clean-licence specimen of the LZFSE variant that this pass could only borrow from a bug
   tracker.
