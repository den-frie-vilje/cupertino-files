/**
 * Assemble the language-neutral release artifact: everything another
 * implementation needs, nothing that only runs in Node.
 *
 * Produces `release/iwork-format-<YYYY.MM>.tar.gz` containing:
 *
 *   - `proto/`        — the vendored schema dumps, with provenance
 *   - `docs/`         — FORMAT.md and the verification/manual-work ledgers
 *   - `conformance/`  — import expectations + export shape profiles
 *   - `FIXTURES.md`   — sources and checksums of the test corpus
 *                       (the bytes stay upstream; ~29 MB of documents do
 *                       not belong in a spec bundle, and every file is
 *                       pinned by commit and md5)
 *   - `README.md`     — what the bundle is and how to consume it
 *
 * Calendar-versioned (`2026.08`), deliberately decoupled from the npm
 * package version: this artifact tracks the *format as measured*, which
 * moves when Apple ships, not when this library's API does.
 *
 * Usage: `npm run bundle:format` (writes into `release/`, gitignored).
 */
import { cpSync, mkdirSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = new URL("../", import.meta.url);
const RELEASE = fileURLToPath(new URL("release/", ROOT));

function main(): number {
  const now = new Date();
  const version = `${now.getUTCFullYear()}.${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
  const name = `iwork-format-${version}`;
  const stage = `${RELEASE}${name}`;

  if (existsSync(stage)) rmSync(stage, { recursive: true });
  mkdirSync(stage, { recursive: true });

  const copy = (rel: string, to = rel): void =>
    cpSync(fileURLToPath(new URL(rel, ROOT)), `${stage}/${to}`, { recursive: true });

  copy("proto");
  copy("conformance");
  mkdirSync(`${stage}/docs`);
  for (const doc of ["FORMAT.md", "VERIFICATION.md", "BLOCKERS.md"]) {
    copy(`docs/${doc}`, `docs/${doc}`);
  }
  copy("fixtures/ATTRIBUTION.md", "FIXTURES.md");

  writeFileSync(
    `${stage}/README.md`,
    `# iwork-format ${version}

Measured documentation of Apple's iWork file format (Pages, Numbers,
Keynote — the 2013+ IWA/protobuf era), packaged for implementers in any
language. Generated and CI-checked by
https://github.com/den-frie-vilje/cupertino-files — see that repository for
the reference implementation, the verification methodology, and issues.

- \`proto/\` — protobuf schema dumps per app version, with provenance
  (see \`proto/README.md\`). Extracted for interoperability.
- \`docs/FORMAT.md\` — the format as measured: container, object graph,
  text, styles, tables, and the catalog of **well-formed-but-wrong**
  defects — documents every schema accepts and the apps do not.
- \`docs/VERIFICATION.md\` — which claims are app-verified and which are
  not. Treat anything unverified accordingly.
- \`conformance/\` — machine-readable import expectations per fixture and
  export shape profiles per archive type (\`conformance/README.md\`).
- \`FIXTURES.md\` — where to fetch the test corpus, pinned by commit and
  checksum. The bytes live upstream (Apache Tika, libetonyek).

License: documentation and generated data under the repository's MIT
license; fixture documents remain under their upstream licenses as
listed in FIXTURES.md.
`,
  );

  execFileSync("tar", ["-czf", `${RELEASE}${name}.tar.gz`, "-C", RELEASE, name]);
  console.log(`release/${name}.tar.gz`);
  return 0;
}

if (import.meta.filename === process.argv[1]) process.exit(main());
