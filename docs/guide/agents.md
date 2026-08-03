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

Start with `describe_document` — it tells the agent a document's shape
before anything reads or writes it. The rest group by task: reading
(`read_text`, `read_table`, `list_formulas`), table editing
(`set_cells`, `set_formula`, `format_cells`, `merge_cells` and their
kin), Pages text (`append_paragraph`, `replace_text`, `format_text`,
`insert_link`), and structure (`create_document`, `manage_slides`,
`manage_sheets`). The live list, each tool with its full description:
`npx -y cupertino-files tools`.

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
