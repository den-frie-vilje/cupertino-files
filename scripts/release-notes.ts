/**
 * Cut a release's changelog: move the Unreleased section under the new
 * version heading and emit its body as the GitHub release notes.
 *
 *   node --experimental-strip-types scripts/release-notes.ts 0.2.0
 *
 * Refuses an empty Unreleased section — a release with nothing to say is
 * a mistake — and leaves a fresh empty Unreleased heading behind. Runs
 * before `npm ci` on the release runner, so it must need nothing beyond
 * Node itself.
 */
import { readFileSync, writeFileSync } from "node:fs";

const version = process.argv[2];
if (version === undefined || !/^\d+\.\d+\.\d+$/.test(version)) {
  console.error(
    `usage: node --experimental-strip-types scripts/release-notes.ts <major.minor.patch> — got ${JSON.stringify(version ?? "")}`,
  );
  process.exit(1);
}
const path = "CHANGELOG.md";
const changelog = readFileSync(path, "utf8");
const match = /^## Unreleased\n([\s\S]*?)(?=^## )/m.exec(changelog);
if (!match) {
  console.error("CHANGELOG.md has no '## Unreleased' section followed by a version section.");
  process.exit(1);
}
const body = (match[1] ?? "").trim();
if (body === "") {
  console.error("The Unreleased section is empty — nothing to release.");
  process.exit(1);
}
const date = new Date().toISOString().slice(0, 10);
const updated = changelog.replace(match[0], `## Unreleased\n\n## ${version} — ${date}\n\n${body}\n\n`);
writeFileSync(path, updated);
writeFileSync("RELEASE_NOTES.md", `${body}\n`);
console.log(`CHANGELOG.md: Unreleased → ${version} — ${date}; notes in RELEASE_NOTES.md`);
