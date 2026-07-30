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
