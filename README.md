# cupertino-files

Read, inspect and edit Apple iWork documents — Pages, Numbers, Keynote —
in pure TypeScript. Zero runtime dependencies, no Apple software
required.

**Docs: <https://den-frie-vilje.github.io/cupertino-files/>**

The format is undocumented, so this is an ongoing reverse-engineering
effort: the library attempts to cover it feature by feature, claims only
what its tests and real documents prove, and refuses what it cannot do
safely rather than guessing. [`docs/COVERAGE.md`](docs/COVERAGE.md) —
generated from the code — is the honest, current answer to "does it do
X?".

```sh
npm install cupertino-files
```

```ts
import { readFileSync, writeFileSync } from "node:fs";
import { PagesDocument, NumbersDocument } from "cupertino-files";

const doc = PagesDocument.load(new Uint8Array(readFileSync("report.pages")));
doc.replaceText("2024", "2025");
doc.appendParagraph("Conclusion", "Heading 1");
writeFileSync("report-2025.pages", doc.save());

const sheet = NumbersDocument.load(new Uint8Array(readFileSync("budget.numbers")));
const table = sheet.tables()[0]!;
table.setCell(1, 1, 143_800);
table.setFormula(1, 2, "=B2*1.25", { value: 179_750 });
writeFileSync("budget.numbers", sheet.save());
```

Works in Node ≥ 18 and modern browsers (bytes in, bytes out). Everything
you don't touch is preserved byte-for-byte; for documents written by
current apps, an edited save is typically byte-for-byte what the app
itself would have written ([how](https://den-frie-vilje.github.io/cupertino-files/guide/fidelity)).

## What works

| Area | Status |
|---|---|
| Pages text, styles, sections, headers/footers, comments, footnotes, fields | read + write, app-confirmed |
| Tables: cells, styling, formats, rows/columns, formulas, merges | read + write |
| Numbers sheets; Keynote slides, notes, skip/advance | read + write |
| Drawables (move, resize, style), image crops, chart data + appearance | read + write |
| Conditional formatting, filters, categories, controls, builds | read |
| iWork '09 XML, password-protected files | detected and refused |

The short version — [`docs/COVERAGE.md`](docs/COVERAGE.md) has the full
matrix, [`docs/BLOCKERS.md`](docs/BLOCKERS.md) what each gap waits on,
and [`docs/FORMAT.md`](docs/FORMAT.md) is the format writeup itself,
with schema dumps in [`proto/`](proto/) and a language-neutral
[conformance suite](conformance/README.md) for other implementations.

## Command line and agents

```sh
npx -y cupertino-files dump info file.pages   # inspect: info|ls|text|styles|object|extract
npx -y cupertino-files mcp                    # MCP server over stdio, for AI agents
```

The MCP server gives agents document editing and formatting without
writing code; the package also ships a Claude Code
[skill](skills/cupertino-files/SKILL.md). Details:
[For AI agents](https://den-frie-vilje.github.io/cupertino-files/guide/agents).

## Development

```sh
npm install && npm test   # unit + fixture suite; never launches an app
npm run test:e2e          # macOS only: drives the real apps
```

See [CONTRIBUTING.md](CONTRIBUTING.md). Fixtures are real Apple-written
documents from the Apache Tika and libetonyek test suites
([attribution](fixtures/ATTRIBUTION.md)).

Built on the shoulders of
[iWorkFileFormat](https://github.com/obriensp/iWorkFileFormat),
[keynote-parser](https://github.com/psobot/keynote-parser),
[numbers-parser](https://github.com/masaccio/numbers-parser) and
[WorkKit](https://github.com/6over3/WorkKit).

## Legal

An independent project, not affiliated with or endorsed by Apple Inc.
Apple, iWork, Pages, Numbers and Keynote are trademarks of Apple Inc.,
used only to name the formats this library interoperates with. It
contains no Apple code and refuses encrypted documents by design;
details in [docs/LEGAL.md](docs/LEGAL.md).

## License

[MIT](LICENSE) © Ole Kristensen
