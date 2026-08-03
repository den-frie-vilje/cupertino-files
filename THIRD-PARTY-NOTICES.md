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

- `proto/current/` and `proto/numbers-14.4/`, `proto/keynote-14.4/`:
  published by [masaccio/numbers-parser](https://github.com/masaccio/numbers-parser)
  (MIT, © 2021 Jon Connell), extracted from Numbers.app 14.4.
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

The repository's test fixtures are real iWork documents redistributed
from two open-source test suites, with per-file provenance (source
repository, commit, license, md5) in
[`fixtures/ATTRIBUTION.md`](fixtures/ATTRIBUTION.md):

- [Apache Tika](https://github.com/apache/tika) — Apache License 2.0
  ([`LICENSES/Apache-2.0.txt`](LICENSES/Apache-2.0.txt))
- [libetonyek](https://github.com/LibreOffice/libetonyek) (Document
  Liberation Project) — MPL-2.0+
  ([`LICENSES/MPL-2.0.txt`](LICENSES/MPL-2.0.txt))

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

## Licenses

Full texts of every license named above are in
[`LICENSES/`](LICENSES/): `MIT.txt`, `Apache-2.0.txt`, `MPL-2.0.txt`,
`BSD-3-Clause-lzfse.txt`.
