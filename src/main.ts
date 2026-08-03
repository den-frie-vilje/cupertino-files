#!/usr/bin/env node
/**
 * The `cupertino-files` command — the package name is the entry point, so
 * `npx -y cupertino-files <subcommand>` works without ceremony.
 *
 *   cupertino-files mcp                 the Model Context Protocol server (stdio)
 *   cupertino-files tools               list the tools, with their descriptions
 *   cupertino-files call <tool> <json>  run one tool from the shell
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
} else if (subcommand === "dump") {
  process.argv.splice(2, 1);
  await import("./cli.ts");
} else {
  console.error("usage: cupertino-files <mcp|tools|call|dump> …");
  console.error("  mcp                 Model Context Protocol server over stdio, for AI agents");
  console.error("  tools               list the editing tools and what they do");
  console.error("  call <tool> <json>  run one tool from the shell");
  console.error("  dump …              inspect a document (try `dump info <file>`)");
  process.exit(subcommand === undefined || subcommand === "--help" ? 0 : 2);
}
