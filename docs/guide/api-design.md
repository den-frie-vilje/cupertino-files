# API design

Good tools feel familiar. The public shape follows the conventions that
pdf-lib, exceljs, docx and SheetJS converge on, so it reads like the
libraries it sits beside in a `package.json`:

- **Static `load(bytes)` on each app class; instance `save(): Uint8Array`.**
  Bytes in, bytes out, no filesystem coupling — the one shape that behaves
  identically in Node, browsers and workers. `IWorkDocument.open(bytes)`
  auto-detects the app.
- **`add*` creates, attaches and returns the created child** (`addSheet`,
  `addSlide`, `addFootnote`). `insert*` is the positional variant
  (`insertRows(at)`, `insertLink(start, end)`), `remove*`/`delete*`
  mirror them, and `create*` mints detached named things
  (`createParagraphStyle`).
- **Primary payload positional, the rest in a trailing options object**
  whose defaults are measured from how the apps themselves write
  documents. Where Apple has a convention — the hyperlink character
  style, the footnote mark — the option accepts `false` to opt out and
  an id to override.
- **A "the" accessor throws with guidance; the soft twin says so in its
  name** — `doc.body` explains page-layout documents in its error,
  `doc.bodyOrUndefined` never throws. Collection methods return plain,
  possibly-empty arrays.
- **A mutable object graph**, because every library that round-trips
  existing files exposes one.

Two deliberate divergences, both consequences of this being pure compute:
**everything is synchronous** (no I/O, no workers — promises would be
ceremony), and **cells are edited through the table**
(`table.setCell(r, c, v)`) rather than by assignment on a live cell
object, because Numbers cells are records inside compressed tiles and a
cheap-looking handle would lie about what a write costs.
