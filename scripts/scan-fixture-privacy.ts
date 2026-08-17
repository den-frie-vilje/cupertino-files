#!/usr/bin/env node
/**
 * Screen the fixture corpus for personal data.
 *
 * A permissive licence makes a document redistributable; it does not make it
 * appropriate as a test fixture. Real-world documents can carry contact
 * details, and those should not be vendored into this repository — see the
 * "Fixture privacy policy" section of fixtures/ATTRIBUTION.md.
 *
 *   node scripts/scan-fixture-privacy.ts [--json]
 *
 * Exits non-zero when a fixture carries contact data that is not on the
 * reviewed-and-accepted list, so it can run in CI.
 */
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { IWorkDocument } from "../src/tsa/document.ts";

const FIXTURES = new URL("../fixtures/", import.meta.url);

/**
 * Fixtures whose contact data has been reviewed and judged acceptable, with
 * the reason. Anything else is a finding.
 */
const REVIEWED: Readonly<Record<string, string>> = {
  "rougier-v13.1-image-filters-masks.pages":
    "institutional academic addresses printed on a published scholarly poster",
  "olekristensen-v26.3-seed-picture-wrap-returned.pages":
    "the studio's own published contact address, on its own letterhead template, contributed by its owner",
};

const EMAIL = /[\w.+-]+@[\w.-]+\.[a-z]{2,}/gi;
// Deliberately conservative: reduces false positives on figures and dates.
const PHONE = /(?:\+\d{1,3}[ -]?)?\(?\d{3}\)?[ .-]\d{3}[ .-]\d{4}\b/g;

export interface PrivacyFinding {
  file: string;
  emails: string[];
  phones: number;
  reviewed: string | undefined;
}

function redact(address: string): string {
  return address.replace(/^(.{2}).*(@.*)$/, "$1***$2");
}

function scan(): PrivacyFinding[] {
  const dir = fileURLToPath(FIXTURES);
  const findings: PrivacyFinding[] = [];
  for (const name of readdirSync(dir).sort()) {
    if (!/\.(pages|numbers|key)$/.test(name)) continue;
    let text: string;
    try {
      const doc = IWorkDocument.open(new Uint8Array(readFileSync(new URL(name, FIXTURES))));
      text = doc
        .textStorages()
        .map((s) => {
          try {
            return s.text;
          } catch {
            return "";
          }
        })
        .join(" ");
    } catch {
      continue; // not a modern IWA document (e.g. the iWork '09 contrast file)
    }
    const emails = [...new Set(text.match(EMAIL) ?? [])];
    const phones = new Set(text.match(PHONE) ?? []).size;
    if (emails.length > 0 || phones > 0) {
      findings.push({ file: name, emails, phones, reviewed: REVIEWED[name] });
    }
  }
  return findings;
}

function main(): void {
  const findings = scan();
  if (process.argv.includes("--json")) {
    console.log(
      JSON.stringify(
        findings.map((f) => ({ ...f, emails: f.emails.map(redact) })),
        null,
        2,
      ),
    );
  } else if (findings.length === 0) {
    console.log("No contact data found in any fixture.");
  } else {
    for (const f of findings) {
      const status = f.reviewed ? `REVIEWED — ${f.reviewed}` : "UNREVIEWED";
      console.log(`${f.file}\n  ${status}\n  emails: ${f.emails.map(redact).join(", ") || "none"}  phones: ${f.phones}`);
    }
  }
  const unreviewed = findings.filter((f) => f.reviewed === undefined);
  if (unreviewed.length > 0) {
    console.error(
      `\n${unreviewed.length} fixture(s) carry unreviewed contact data. Either remove them, ` +
        `or add them to REVIEWED in this script with the reason they are acceptable ` +
        `(see the Fixture privacy policy in fixtures/ATTRIBUTION.md).`,
    );
    process.exit(1);
  }
}

main();
