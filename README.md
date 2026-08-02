# cupertino-files

**Read, inspect, and edit Apple iWork documents — Pages, Numbers, Keynote —
in pure TypeScript. Zero runtime dependencies, no Apple software required.**

Apple's modern document format (2013 → today) is a ZIP package of
Snappy-compressed protobuf object graphs. This library implements the whole
stack from bytes up — Snappy codec, protobuf wire layer, ZIP container, IWA
archives, object store — and puts a typed document model on top, so you can
do this anywhere Node ≥ 18 or a modern browser runs:

```ts
import { readFileSync, writeFileSync } from "node:fs";
import { PagesDocument } from "cupertino-files";

const doc = PagesDocument.load(new Uint8Array(readFileSync("report.pages")));

doc.bodyText;                                   // "Quarterly report\nRevenue grew…"
doc.paragraphs();                               // text + style name per paragraph
doc.replaceText("2024", "2025");                // style-preserving find/replace
doc.appendParagraph("Conclusion", "Heading 1"); // styles addressed by name
doc.applyCharacterFormatting(0, 9, { bold: true, fontColor: { r: 0.8, g: 0, b: 0 } });
doc.createParagraphStyle({ name: "Callout", basedOn: "Body", paragraph: { alignment: 2 } });
doc.setPageSetup({ topMargin: 72 });            // points; margins, size, orientation
doc.sections()[0].setHeaderText("Confidential");
doc.drawables()[1].setGeometry({ x: 100, y: 50 });

writeFileSync("report-2025.pages", doc.save());
```

Documents saved this way open in current Pages; everything you didn't touch
is preserved **byte-for-byte** (not just semantically — see
[Fidelity](#fidelity--compatibility)).

## Why this exists

The iWork format is undocumented. This repository is both a working library
and a **full reverse-engineering of the format**:

- [`docs/FORMAT.md`](docs/FORMAT.md) — the specification: container
  layouts, Apple's Snappy chunk framing, IWA archive streams, the object
  graph and its invariants, the type registry, the text/style/section
  models, and the complete writer's checklist.
- [`proto/`](proto/) — protobuf schema dumps (current shared families +
  Pages-specific), with provenance.
- [`research/`](research/) — line-cited invariant analysis of prior art and
  the machine-extracted type registry (535 shared + per-app type IDs,
  confirmed against a 2026 live registry dump).

## Install

```sh
npm install cupertino-files
```

No runtime dependencies. No native modules. No shelling out. ESM, typed.

## Feature matrix

> Four documents, one job each — the first two generated and staleness-gated:
> [`docs/COVERAGE.md`](docs/COVERAGE.md) is the authoritative capability matrix
> (the table below is the short version); [`docs/VERIFICATION.md`](docs/VERIFICATION.md)
> lists what only Apple's apps can prove, with the evidence where they already have;
> [`docs/BLOCKERS.md`](docs/BLOCKERS.md) is every open question with the one fact it
> is blocked on and the shortest path to it, plus the ledger of measured findings;
> [`docs/FORMAT.md`](docs/FORMAT.md) is the format itself.

| Capability | Status |
|---|---|
| All three container layouts; byte-identical round-trip of untouched content | ✅ |
| Pages text, styles, sections, page setup, headers/footers, page-layout docs | ✅ app-confirmed |
| Pages links, bookmarks, date/page-number fields, lists, TOC, text boxes, comments, footnotes | ✅ app-confirmed |
| Tables: read + write cells, styling, bands, row/column ops, display formats | ✅ (modern storage) |
| Tables: formulas, merges, cross-table names (`Revenue::A2`) | ✅ read |
| Numbers: sheets and tables (add/remove/rename/reorder); conditional formatting, filters, categories | ✅ write / ✅ read |
| Keynote: slides, placeholders, notes, skip, auto-advance, slide size | ✅ app-confirmed (v26) |
| Drawables: enumerate, move, resize, copy, style (shadow, fill, stroke, opacity); image crops + filters | ✅ |
| Charts | ✅ data only — appearance is roadmap |
| Inline image insertion | ⚠️ experimental |
| Keynote builds (read/retime), Numbers cell controls (read) | 🔍 schema-derived — no fixture contains one |
| Formula/conditional-rule authoring; creating builds or controls | roadmap — [what each waits on](docs/BLOCKERS.md) |
| Version-aware loading (warns, never hard-fails, preserves unknown fields) | ✅ |
| iWork '09 XML; password-protected documents | detected, **rejected** — never mis-parsed |
| Pre-BNC (iWork '13-era) cell storage | read-only, refuses unmeasured shapes |
| Editing a document an app has open; live iCloud collaboration | ✗ out of scope |

## API tour

### Documents

```ts
import { PagesDocument, NumbersDocument, KeynoteDocument, IWorkDocument } from "cupertino-files";

PagesDocument.load(bytes);    // typed loaders …
NumbersDocument.load(bytes);
KeynoteDocument.load(bytes);
IWorkDocument.open(bytes);    // … or auto-detect the app

doc.save();                   // → Uint8Array (bytes in, bytes out — no fs coupling)
doc.format;                   // FormatInfo: file format versions, build history, UUID
doc.stats();                  // components, object count, type histogram
```

All three app classes extend a common `IWorkDocument` base (shared TSWP
text, TSS style, TSD drawable machinery); Pages adds the TP-specific layer
(sections, page setup), Numbers and Keynote currently expose their roots
plus the shared machinery — deeper app models slot in the same way.

### Text (any app)

```ts
const storage = doc.textStorages()[0];   // headers, cells, notes, text boxes…
storage.text;
storage.paragraphs();                    // { start, end, text, styleId }
storage.replaceRange(10, 14, "new");     // UTF-16 offsets == JS string indexes
storage.replaceAll("find", "replace");
storage.appendParagraph("More");
storage.setParagraphStyle(0, styleId);
storage.setCharacterStyleRange(0, 5, styleId);
```

Every edit rewrites the text **and** fixes up all 20+ attribute tables
(styles, smart fields, attachments, sections, change tracking, …) so no
index ever dangles — the app-crash failure mode of naive editors.

### Styles

```ts
const sheet = doc.stylesheet;            // PagesDocument; .stylesheets() on any app
sheet.paragraphStyles();                 // named styles with ids/identifiers
sheet.findByName("Heading 1", 2022);
sheet.createParagraphStyle({ name: "Note", basedOn: "Body",
  character: { italic: true, fontSize: 11 },
  paragraph:  { leftIndent: 24, spaceBefore: 6 } });
sheet.createCharacterStyle({ character: { bold: true } });  // anonymous (direct formatting)

// Editing a named style reaches every run that uses it.
const heading = sheet.style("Heading 1")!;
heading.resolved().character;            // overrides with the parent chain folded in
heading.setParagraph({ backgroundColor: hexColor("#f5f5f0"), spaceBefore: 6 });
```

Fills, gradients, strokes and shadows are one shared vocabulary — the same
values style text, table cells and shapes:

```ts
import { colorFill, linearGradient, solidStroke, hexColor } from "cupertino-files";

colorFill(1, 0.9, 0.2);                                    // flat colour
linearGradient(hexColor("#fff"), hexColor("#0066ff"));     // two-stop gradient
solidStroke({ r: 0, g: 0, b: 0 }, 1);                      // 1pt border
({ color: { r: 0, g: 0, b: 0 }, pattern: [4, 2] });        // dashed
```

### Tables

```ts
const table = doc.tables()[0]!;
table.grid();                            // (CellValue | null)[][]
table.setCell(1, 0, { type: "text", value: "Revenue" });
table.setCell(1, 1, { type: "number", value: 143_800_000_000 });
table.setRow(2, [{ type: "date", value: new Date() }, { type: "bool", value: true }]);

table.setCellFormatting(1, 0, {
  fill: colorFill(0.95, 0.95, 1),
  borders: allBorders(solidStroke({ r: 0.2, g: 0.2, b: 0.2 }, 0.5)),
  padding: { left: 6, right: 6, top: 3, bottom: 3 },
  verticalAlignment: VerticalAlignment.MIDDLE,
  textWrap: true,
});
table.tableStyle()!.setTable({ bandedRows: true, bandedFill: colorFill(0.97, 0.97, 0.97) });

table.setBands({ headerRows: 1, footerRows: 1, freezeHeaderRows: true, repeatHeaderRows: true });
table.setColumnWidth(0, 180);
table.bandTextStyle("headerRow")!.setCharacter({ bold: true });   // the text, not the cell

table.merges();                          // [{ row, column, rowCount, columnCount }]
table.isCovered(0, 1);                   // true when a merge anchored elsewhere swallows it

table.cellFormula(1, 3);                 // "=B2*C2"
table.formulas();                        // [{ row, column, formula }]
```

Three caveats worth knowing. Merges are decoded from the calc engine,
where the apps actually keep them (the documented `merge_region_map` is
empty in every real document), and writing into a covered cell throws.
Formulas are a *table* feature — Pages has them too — and render
per-position because references are stored as offsets. Function names are
not in the file format at all: only measured indexes are named (271 so
far; `npm run harvest` widens the table), the rest render as
`FUNCTION_<id>` rather than a guess.

### Numbers: conditional formatting, filters and categories

```ts
table.conditionalRules(4, 2);      // [{ predicate: { operator: "<", text: "C5<0" }, cellStyleId }]
table.filterSets();                // { rows, columns } — mode, enable state, per-column rules

const categories = table.activeCategories();
categories?.groupColumns();        // [{ column, groupingType, groupingName: "year and month" }]
categories?.groups();              // tree: [{ value, label, rows, children }]
table.staleCategoryGroups();       // groups whose rows no longer match the data
```

Conditions are read from each rule's *formula* (the documented TSCE enum),
not from Apple's unpublished `predicate_type`, so they read correctly even
for type codes never seen; `operator` is `undefined` rather than a guess
when a rule is richer than a comparison. And **nothing here evaluates**:
`conditionalRules()` says what the rules are, not which currently matches —
that needs the calc engine, and a wrong answer would look exactly like a
right one.

### Comments, footnotes and page numbers

```ts
body.addComment(10, 20, "Please double-check this.");   // reuses the document's author
const note = body.addFootnote(30, "See the appendix."); // returns the note's own storage
footer.insertPageNumber(footer.text.length);            // a field, not the digit "1"
footer.insertPageCount(pos);
storage.insertDateField(0, "November 2, 2024", { date, format: "MMMM d, y" });
body.addBookmark(10, 20, "Introduction");
```

The details that decide this API: a page number is **not text** (the value
comes from pagination — it is a placeholder plus an archive), a date field
**is** text (spanning characters the app rewrites), a footnote reference is
a **U+000E**, and `addComment` reuses the document's existing annotation
author rather than minting one per comment.

### Charts and image crops

```ts
const chart = doc.charts()[0]!;
chart.series();                                    // [{ name, values }]
chart.setValue(0, 2, { type: "number", value: 99 });
chart.addSeries("Region 3", values);               // one value per category
chart.removeSeries(0);                             // id map and styles shift with it

image.crop();                                      // { window, visible, full, isRectangular }
image.setCrop({ x: 20, y: 0, width: 200, height: 150 });   // choose what shows
image.setVisibleFrame({ x: 72, y: 90, width: 200, height: 150 }); // place the result
image.removeCrop();
```

Chart *data* is editable; appearance is not yet. Cropping never touches the
media: a mask defines the window, and its frame is in the **image's**
coordinate space (measured across the corpus, not assumed). Drawable styling
— shadow, fill, stroke, opacity, reflection — lives on
`drawable.style().set({...})`; cell and table styles have no shadow field,
because in iWork a shadow belongs to the drawable.

### Low level

```ts
import { IWorkContainer, parseIwaFile, RawMessage, typeName } from "cupertino-files";

const container = IWorkContainer.fromBytes(bytes);   // zip layouts, encryption check
const objects = parseIwaFile(container.iwaFiles.get("Index/Document.iwa")!);
objects[0].identifier;                               // object graph primitives
objects[0].type;                                     // 10000
typeName(objects[0].type, "pages");                  // "TP.DocumentArchive"
objects[0].message.getString(3);                     // schema-light protobuf access
```

The `RawMessage` layer preserves unknown fields byte-for-byte and
re-serializes only along mutated paths — the property that makes editing
future files safe.

### CLI

```sh
npx cupertino-dump info     file.pages     # versions, components, object counts
npx cupertino-dump ls       file.pages     # every object with type names + references
npx cupertino-dump text     file.pages     # extract text
npx cupertino-dump styles   file.pages     # named styles
npx cupertino-dump sections file.pages     # sections, headers, footers
npx cupertino-dump object   file.pages 42  # pretty-print one object's protobuf
npx cupertino-dump extract  file.pages out/  # decompressed .iwa streams
```

## API design

The shape follows the conventions pdf-lib, exceljs, docx and SheetJS
converge on: static `load(bytes)` per app class and instance
`save(): Uint8Array` (no filesystem coupling; `IWorkDocument.open` for
auto-detect); `add*` creates-and-returns, `insert*` is positional,
`create*` mints detached things; primary payload positional with a
trailing options object whose defaults are corpus-measured (`false` opts
out of a convention, an id overrides it); throwing accessors with
`…OrUndefined` twins; a mutable object graph. Two deliberate divergences:
**everything is synchronous** (pure compute — promises would be ceremony),
and **cells are edited through the table**, not by assignment on a live
cell object, because Numbers cells are records inside compressed tiles
and a cheap-looking handle would lie about what a write costs.

## For other implementations

The TypeScript is one consumer of what this repository knows. The
language-neutral parts — for a C++ filter, a Java extractor, a Rust port —
are packaged separately:

- [`conformance/`](conformance/README.md) — per-fixture import
  expectations (text + structure as JSON) and per-archive-type **export
  shape profiles**: what Apple always writes, so a writer in any language
  can catch the well-formed-but-wrong class offline. CI-checked against
  this library, so it cannot silently rot.
- `npm run bundle:format` — assembles `release/iwork-format-<YYYY.MM>.tar.gz`:
  the schema dumps with provenance, `docs/FORMAT.md`, the verification
  ledger, and the conformance suite. Calendar-versioned, because it tracks
  the format as measured, not this library's API.

## Claude skill

The package ships a [Claude skill](skills/cupertino-files/SKILL.md)
(`skills/cupertino-files/SKILL.md`) that teaches AI agents the API and its
guardrails. Point a Claude Code session at an installed copy (or this repo)
and ask it to work with `.pages` files.

## Fidelity & compatibility

**Round-trip guarantee.** Components (`.iwa` files) you don't touch — and
all non-IWA package entries (plists, previews, media) — are emitted
byte-identically. The integration suite enforces this on real Apple-written
fixtures for all three container layouts.

**Write invariants.** Everything the apps validate is maintained on save:
payload lengths, `object_references` recomputation, cross-component
external references, object-ID allocation recorded in `PackageMetadata`,
stylesheet registration. The invariants and their provenance are documented
in [FORMAT.md §10](docs/FORMAT.md).

**Field numbers come from Apple's schema.** The 41 vendored `.proto` dumps
in [`proto/`](proto/README.md) are not documentation — the library reads
them, through `protobufjs` (a devDependency; nothing under `src/` imports
it). A declaration names *fields*, and `npm run proto:embed` resolves the
numbers into a generated table the runtime imports:

```ts
export const Storage = protoFields("TSWP.StorageArchive", {
  KIND: "kind",
  TABLE_PARA_STYLE: "table_para_style",
});
```

A misspelled or invented field throws at import rather than reading the
wrong bytes, and the suite fails if the generated table and `proto/` drift
apart. The schemas ship in the package, so an installed copy carries the
authority for every number in it.

The wire codec is deliberately *not* protobufjs. A typed decoder discards
fields it does not model — encode field 1 plus an unmodelled field 7, decode
and re-encode, and field 7 is gone — and this library models a few dozen of
1468 messages while promising untouched archives come back byte-identical.
`src/base/protobuf.ts` keeps every field as raw bytes for exactly that
reason.

Not everything can be looked up: the dumps are Numbers 14.4 and Pages 5.0,
so fields added since are declared with `measuredFields`, which requires a
sentence saying how the number was established and refuses one the schema
already defines; `protoEnum`/`measuredEnum` are the same pair for enum
values, kept separate because an enum's small integers collide with its
parent message's field numbers. Archive **type ids** (`TSWP_TYPE.STORAGE = 2001`) are the
app's object registry and appear in no `.proto` at all.

**Version awareness.** Apple evolves the format additively (verified
2013 → 2026: no field renumbering, ever). This library addresses fields by
number, preserves everything it doesn't model, treats the type registry as
replaceable data, and warns rather than fails on newer versions — so
documents from future app releases load, edit, and keep their new features
intact. Current app releases (including the 26.x year-based versions) are
supported.

**Semver.** The package follows semantic versioning; commit history uses
Conventional Commits so releases can be cut mechanically.

## Development

```sh
npm install
npm test           # unit + fixture suite (never launches an app)
npm run test:e2e   # macOS only: drives Pages/Numbers/Keynote via osascript
npm run coverage   # regenerate docs/COVERAGE.md
npm run typecheck
npm run lint       # eslint (typescript-eslint, type-checked) over src/test/scripts
npm run build      # tsc → dist/

npm run proto:embed  # after changing anything under proto/
npm run proto:check  # what is still hand-typed vs the schema
npm run shape:audit  # what Apple writes into an archive that we do not
npm run privacy:check # screen fixtures for personal data before committing
npm run conformance   # regenerate conformance/ (import expectations + export profiles)
npm run bundle:format # language-neutral release tarball for other implementations
```

`required:check`, `harvest:check`, `coverage:check`, `proto:embed:check` and
`shape:check` are the CI forms — same work, nonzero exit on regression; the
suite runs the important ones itself.

Refreshing the schemas is `proto:embed` plus `npm test`: a field that has
appeared in a newer dump makes its `measuredFields` declaration throw, which
is how the measured list shrinks rather than being forgotten.

On a Mac with the apps installed, [`npm run test:e2e`](docs/E2E.md) verifies
what no offline test can: that the apps **open** what this library writes,
and that the library reads what they save. It also manufactures coverage the
fixture corpus lacks — Keynote transitions, for instance, exist in no
licensed document but can be created on demand through AppleScript. Skips
with a printed reason everywhere else.

Test fixtures are real Apple-generated documents from the Apache Tika and
libetonyek test suites — see [`fixtures/ATTRIBUTION.md`](fixtures/ATTRIBUTION.md).

## Prior art & thanks

Built on the shoulders of [obriensp/iWorkFileFormat](https://github.com/obriensp/iWorkFileFormat),
[psobot/keynote-parser](https://github.com/psobot/keynote-parser),
[masaccio/numbers-parser](https://github.com/masaccio/numbers-parser) and
[6over3/WorkKit](https://github.com/6over3/WorkKit) — see
[FORMAT.md §13](docs/FORMAT.md) for what each contributed. Schema dumps
originate from Apple's applications, extracted for interoperability.

## Legal

This is an independent open-source project, not affiliated with, endorsed
by, or supported by Apple Inc. Apple, iWork, Pages, Numbers, Keynote and
Creator Studio are trademarks of Apple Inc., used here only to name the
file formats this library interoperates with.

The library contains no Apple code. Format knowledge comes from
measuring real documents and from protocol-buffer schema definitions
recovered from the application binaries by long-standing third-party
open-source projects, redistributed with full provenance and no
copyright claim — see [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md).
Password-protected (encrypted) documents are refused by design
(`EncryptedDocumentError`): this library circumvents no technological
protection measure, and the interoperability it enables is with the
user's own documents. The reasoning and its sources are recorded in
[docs/LEGAL.md](docs/LEGAL.md).

## License

[MIT](LICENSE) © Ole Kristensen
