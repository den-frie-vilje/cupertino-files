#!/usr/bin/env node
/**
 * The `cupertino-files` command — the package name is the entry point, so
 * `npx -y cupertino-files <subcommand>` works without ceremony.
 *
 *   cupertino-files mcp          run the Model Context Protocol server (stdio)
 *   cupertino-files dump …       the inspection CLI (same as `cupertino-dump`)
 *
 * Everything else prints usage. The dump subcommand hands over to the
 * existing CLI by splicing itself out of argv and importing it, which is
 * also why the import is dynamic: `cli.ts` runs on import.
 */
const subcommand = process.argv[2];

if (subcommand === "mcp") {
  const { serve } = await import("./mcp/server.ts");
  serve();
} else if (subcommand === "dump") {
  process.argv.splice(2, 1);
  await import("./cli.ts");
} else {
  console.error("usage: cupertino-files <mcp|dump> …");
  console.error("  mcp        Model Context Protocol server over stdio, for AI agents");
  console.error("  dump …     inspect a document (cupertino-dump; try `dump info <file>`)");
  process.exit(subcommand === undefined || subcommand === "--help" ? 0 : 2);
}
