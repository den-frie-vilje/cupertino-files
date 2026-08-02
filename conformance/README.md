# iWork conformance suite

Language-neutral expectations for implementing iWork (Pages, Numbers,
Keynote) import and export — generated from real Apple-written documents by
[cupertino-files](../README.md), for consumption by *any* implementation:
a C++ filter (libetonyek / Document Liberation), a Java extractor (Tika),
a Rust port, or this library itself.

Everything here is machine-generated and CI-checked against the fixtures
(`npm run conformance` / `--check`), so it cannot drift from the reference
implementation without a test failing. The honest contract that implies:
these files encode **what cupertino-files reads**, verified against Apple's
applications wherever `docs/VERIFICATION.md` says so — not a specification
blessed by Apple.

## Import: `expected/`

One JSON file per fixture (the fixtures themselves are redistributable —
sources, licenses and checksums in
[`fixtures/ATTRIBUTION.md`](../fixtures/ATTRIBUTION.md)). Your reader
should produce the same answers:

| key | meaning |
| --- | --- |
| `sha1` | of the input file — verify you are testing the right bytes |
| `app` | `pages` \| `numbers` \| `keynote` |
| `fileFormatVersion` | from `Metadata/Properties.plist` / package metadata |
| `objects`, `components` | object count per `.iwa` component |
| `storages` | every text storage: kind, character count, full plain text |
| `pages` | section count, paragraph count, page-layout flag |
| `numbers` | sheets → tables → dimensions and cell values (sampled to 30×15, `truncated` says when) |
| `keynote` | slide size, per slide: title, notes, skipped flag, transition effect |

Character offsets are UTF-16 code units throughout, matching both
JavaScript string indexing and what the file format itself stores.

## Export: `profiles.json`

The measured answer to "what does Apple write into an archive of this
type?", for every archive type in the corpus: instance counts, per-field
carry share, and the *sets* of archive types observed pointing at each
type.

This is the artifact for anyone writing iWork files. Every export defect
this project found in an app — fourteen so far — was **well-formed and
incomplete**: schema-valid, round-trippable, and wrong only against what
Apple always writes. A writer in any language can audit its output with
the same three questions our `shape:audit` asks:

1. **Absent field** — the corpus carries it at share ≥ 0.98 across ≥ 20
   instances, and your archive does not.
2. **Invented field** — you write it, no corpus instance carries it.
3. **Unprecedented referrer set** — your object is pointed at by a
   combination of types (possibly none) that no corpus instance is. This
   is the invisible class: the archive itself is perfect, and nothing
   draws it.

A hit is a candidate, not a verdict — the corpus is finite — but every
candidate deserves the treatment described in
[`docs/FORMAT.md`](../docs/FORMAT.md), and the catalog of confirmed
defects there is the map of where these questions have already drawn
blood.

## Verifying against the real applications

Expectations prove a reader agrees with this library; only Pages, Numbers
or Keynote can prove a *writer* right. The ladder scripts
(`npm run pages:docs`, `npm run keynote:docs`) emit minimal documents,
one feature per file, each carrying its own pass criterion in its visible
content — open them in the app and read. The methodology, and why
"well-formed" is not "working", is documented in
[`docs/FORMAT.md`](../docs/FORMAT.md) and the project README.
