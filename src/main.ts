#!/usr/bin/env node
/**
 * The `cupertino-files` command — the package name is the entry point, so
 * `npx -y cupertino-files <subcommand>` works without ceremony.
 *
 *   cupertino-files mcp                 the Model Context Protocol server (stdio)
 *   cupertino-files tools               list the tools, with their descriptions
 *   cupertino-files call <tool> <json>  run one tool from the shell
 *   cupertino-files export <file> …     Markdown, CSV or plain text to stdout
 *   cupertino-files import <src> <doc>  a document written from a Markdown or CSV file
 *   cupertino-files dump …              the inspection CLI (same as `cupertino-dump`)
 *
 * `tools` and `call` dispatch the same registry the MCP server serves, so
 * the CLI's editing surface is the MCP's — one registry, no drift.
 * Everything else prints usage. The dump subcommand hands over to the
 * existing CLI by splicing itself out of argv and importing it, which is
 * also why the import is dynamic: `cli.ts` runs on import.
 */
const subcommand = process.argv[2];

if (subcommand === "mcp") {
  const { serve } = await import("./mcp/server.ts");
  serve();
} else if (subcommand === "tools") {
  const { TOOLS } = await import("./mcp/server.ts");
  for (const tool of TOOLS) {
    console.log(tool.name);
    console.log(`  ${tool.description}\n`);
  }
} else if (subcommand === "call") {
  const { TOOLS } = await import("./mcp/server.ts");
  const name = process.argv[3];
  const tool = TOOLS.find((t) => t.name === name);
  if (!tool) {
    console.error(`unknown tool ${String(name)}; \`cupertino-files tools\` lists them`);
    process.exit(2);
  }
  let args: Record<string, unknown>;
  try {
    args = JSON.parse(process.argv[4] ?? "{}") as Record<string, unknown>;
  } catch {
    console.error("arguments must be one JSON object, e.g. '{\"path\":\"a.numbers\"}'");
    process.exit(2);
  }
  try {
    console.log(tool.handler(args));
  } catch (error) {
    console.error((error as Error).message);
    process.exit(1);
  }
} else if (subcommand === "export") {
  const { TOOLS } = await import("./mcp/server.ts");
  const file = process.argv[3];
  if (!file) {
    console.error("usage: cupertino-files export <file> [--format markdown|csv|text] [--table <index|name>] [--out <path>] [--assets <dir>]");
    process.exit(2);
  }
  const args: Record<string, unknown> = { path: file };
  const rest = process.argv.slice(4);
  for (let i = 0; i < rest.length; i += 2) {
    const flag = rest[i];
    const value = rest[i + 1];
    if (flag === "--format") args.format = value;
    else if (flag === "--table") args.table = value;
    else if (flag === "--out") args.output = value;
    else if (flag === "--assets") args.assets = value;
    else {
      console.error(`unknown option ${String(flag)}`);
      process.exit(2);
    }
  }
  try {
    console.log(TOOLS.find((t) => t.name === "export_document")!.handler(args));
  } catch (error) {
    console.error((error as Error).message);
    process.exit(1);
  }
} else if (subcommand === "import") {
  const { TOOLS } = await import("./mcp/server.ts");
  const { readFileSync } = await import("node:fs");
  const { dirname } = await import("node:path");
  const source = process.argv[3];
  const target = process.argv[4];
  if (!source || !target) {
    console.error("usage: cupertino-files import <source.md|source.csv> <new.pages|new.numbers|new.key> [--template <doc>] [--layout <name>]");
    process.exit(2);
  }
  const extra: Record<string, unknown> = {};
  const rest = process.argv.slice(5);
  for (let i = 0; i < rest.length; i += 2) {
    if (rest[i] === "--template") extra.template = rest[i + 1];
    else if (rest[i] === "--layout") extra.layout = rest[i + 1];
    else {
      console.error(`unknown option ${String(rest[i])}`);
      process.exit(2);
    }
  }
  try {
    const content = readFileSync(source, "utf8");
    const format = source.toLowerCase().endsWith(".csv") ? "csv" : "markdown";
    console.log(
      TOOLS.find((t) => t.name === "create_document")!.handler({ path: target, content, format, imageRoot: dirname(source), ...extra }),
    );
  } catch (error) {
    console.error((error as Error).message);
    process.exit(1);
  }
} else if (subcommand === "dump") {
  process.argv.splice(2, 1);
  await import("./cli.ts");
} else {
  console.error("usage: cupertino-files <mcp|tools|call|export|import|dump> …");
  console.error("  mcp                 Model Context Protocol server over stdio, for AI agents");
  console.error("  tools               list the editing tools and what they do");
  console.error("  call <tool> <json>  run one tool from the shell");
  console.error("  export <file> …     Markdown (default), CSV (--format csv --table n) or text");
  console.error("  import <src> <doc>  write a new document from a Markdown or CSV file");
  console.error("  dump …              inspect a document (try `dump info <file>`)");
  process.exit(subcommand === undefined || subcommand === "--help" ? 0 : 2);
}
