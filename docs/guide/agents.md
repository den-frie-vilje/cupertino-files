# For AI agents

cupertino-files speaks agent natively, three ways: an MCP server, a
Claude Code skill that ships in the package, and a plain TypeScript API
that models read fluently. Pick the door that fits.

## The MCP server

One command, no install step:

```sh
npx -y cupertino-files mcp
```

For Claude Code, Claude Desktop, Cursor, or anything else that speaks
the Model Context Protocol over stdio, that's the whole configuration:

```json
{
  "mcpServers": {
    "cupertino-files": {
      "command": "npx",
      "args": ["-y", "cupertino-files", "mcp"]
    }
  }
}
```

The server exposes twenty tools. Start with `describe_document` — it
tells the agent a document's shape before anything reads or writes it.

| Tool | What it does |
| --- | --- |
| `create_document` | A new blank document — Pages, Numbers or Keynote — at a path |
| `describe_document` | The document's shape: app, tables, slides, charts |
| `read_text` | A Pages body, or a Keynote deck slide by slide |
| `read_table` | Cells as display text, capped and honest about it |
| `list_formulas` | Every formula, with its address and rendered text |
| `set_cells` | Write values; the cells keep their formatting |
| `set_formula` | Write a formula, with the value it shows meanwhile |
| `format_cells` | Fill, borders, alignment and wrap for a block of cells |
| `merge_cells` | Merge a rectangle, or split one with `unmerge` |
| `modify_table` | Insert or delete rows and columns; set column widths |
| `append_paragraph` | Add a paragraph to a Pages body, styled by name |
| `replace_text` | Style-preserving find and replace in a Pages body |
| `format_text` | Bold, italics, fonts and color for a phrase |
| `set_slide_text` | Rewrite a Keynote slide's title, body or notes |
| `manage_slides` | Add, duplicate, move, remove slides; set the slide size |
| `manage_sheets` | Add, rename, move, remove Numbers sheets; add tables |
| `set_cell_format` | Number, currency, date, duration display formats |
| `set_table_bands` | Header and footer bands, freeze and repeat |
| `set_page_setup` | Margins, page size, orientation for Pages |
| `insert_link` | Turn a phrase in a Pages body into a hyperlink |

Rows and columns are 0-based throughout. Writes save over the input —
the same thing the apps do — unless `output` names somewhere else. A
failed call comes back as a readable result, not a dead server, so the
agent can adjust and retry.

The server is part of the library's zero-dependency promise: the
protocol layer is a few hundred lines of newline-delimited JSON-RPC,
written the same way as the Snappy codec and the zip reader. Nothing to
audit but this package.

## The Claude Code skill

`npm install cupertino-files` puts a skill at
`node_modules/cupertino-files/skills/cupertino-files/` that teaches
Claude Code the library's API, its refusals, and its verification
habits. Claude Code discovers package skills on its own; there is
nothing to configure.

## The API, for agents that write code

Everything the MCP tools do — and a great deal they don't — is the
public API:

```ts
import { NumbersDocument } from "cupertino-files";

const doc = NumbersDocument.load(bytes);
const table = doc.tables()[0];
table.setFormula(6, 2, "=SUM(C3:K6)", { value: 1500 });
const saved = doc.save();
```

The [getting started guide](/guide/getting-started) is written for
people, which makes it work for agents too.

## One more thing …

Agents care about provenance more than most. Every claim in this
library traces to a measurement — the [coverage
matrix](/COVERAGE) says what is proven, what is experimental
and what is refused — and a document the library edits and saves is,
for modern files, byte-for-byte what the app itself would have written.
An agent that checks its work has never had an easier audit.
