# Third-party notices

This package's original code and documentation are © Ole Kristensen and
contributors, licensed under the [MIT License](LICENSE). Two directories
carry material with a different story, told precisely here so every
recipient knows exactly what they hold.

## `proto/` — recovered iWork schema definitions

The `.proto` files under `proto/` are protocol-buffer schema definitions
describing Apple's iWork file format. They were recovered from the iWork
application binaries — where they are embedded as protobuf descriptors —
by third-party open-source projects, and are redistributed here byte-for-
byte as those projects published them:

- `proto/current/` and `proto/numbers-14.4/`: published by
  [masaccio/numbers-parser](https://github.com/masaccio/numbers-parser)
  (MIT, © 2021 Jon Connell), extracted from Numbers.app 14.4.
- `proto/keynote-14.4/`: published by
  [psobot/keynote-parser](https://github.com/psobot/keynote-parser)
  (MIT, © Peter Sobot), extracted from Keynote.app 14.4.
- `proto/pages-2013/`: published by
  [obriensp/iWorkFileFormat](https://github.com/obriensp/iWorkFileFormat)
  (MIT, © 2013 Sean Patrick O'Brien), extracted from Pages 5.x.

Exact source commits and file inventories are in
[`proto/README.md`](proto/README.md).

The maintainer claims no copyright in the recovered schemas and believes
their contents — message names, field names, field numbers, types and
enum values — are unprotectable facts required for interoperability with
the file format. To the extent any rights subsist in these files, they
are redistributed unmodified as received under the MIT terms of the
publishing projects named above. **Apple has not published or endorsed
these files.** They are used and shared solely to achieve
interoperability of independently created software with iWork documents.

## `fixtures/` and `conformance/` — test documents and measurements

The repository's test fixtures are real iWork documents, with per-file
provenance (source, commit or record, license, md5) in
[`fixtures/ATTRIBUTION.md`](fixtures/ATTRIBUTION.md). They come from
open-source test suites and public repositories under a range of
permissive licenses — Apache-2.0 (Apache Tika, threatconnect, vertx),
MPL-2.0+ (libetonyek / Document Liberation Project), MIT
(numbers-parser, iwork-mcp, draftjs, picodocs, picopalette,
patrickomatic, desmarais), ISC, LGPL-3.0 (a document redistributed as
data, not linked), CC BY 4.0 (Zenodo/Dataverse research records,
rougier), and CC0 — plus documents made and donated for this project by
its author (the `olekristensen-*` files). ATTRIBUTION.md names each
file's license exactly; the most common license texts are in
[`LICENSES/`](LICENSES/), and single-file licenses are linked from the
attribution entries themselves.

The JSON files under `conformance/` are this project's own factual
measurements of those documents (text, structure, archive-shape
statistics), licensed MIT, with each expectation file naming the fixture
it measures. Fixtures are not included in the published npm package.

## `src/base/lzfse.ts` — LZVN decoder ported from Apple's lzfse

The LZVN block decoder (opcode table and semantics) is ported to
TypeScript from Apple's open-source
[lzfse](https://github.com/lzfse/lzfse) reference implementation,
© 2015-2016 Apple Inc., BSD-3-Clause
([`LICENSES/BSD-3-Clause-lzfse.txt`](LICENSES/BSD-3-Clause-lzfse.txt)).

## `scripts/assets/` — demo media

Real media used by the generated demo documents (`npm run demos`):

- `earthrise.jpg` — *Earthrise*, Apollo 8, 24 December 1968 (NASA photo
  AS8-14-2383, William Anders). Public domain as a work of NASA; scaled
  copy via
  [Wikimedia Commons](https://commons.wikimedia.org/wiki/File:NASA-Apollo8-Dec24-Earthrise.jpg).
- `great-wave.jpg` — Katsushika Hokusai, *Under the Wave off Kanagawa*
  (1830–32), Metropolitan Museum of Art (JP1847), public domain
  (PD-Art); scaled copy via
  [Wikimedia Commons](https://commons.wikimedia.org/wiki/File:Tsunami_by_hokusai_19th_century.jpg).
- `pipeline.pdf` — vector figure extracted from the
  `rougier-v13.1-image-filters-masks.pages` fixture already in this
  repository; its license and provenance are recorded with that fixture
  in `fixtures/ATTRIBUTION.md`.

## Licenses

The license texts kept in [`LICENSES/`](LICENSES/) are `MIT.txt`,
`Apache-2.0.txt`, `MPL-2.0.txt` and `BSD-3-Clause-lzfse.txt`; licenses
that apply to a single fixture are linked from its
`fixtures/ATTRIBUTION.md` entry.
