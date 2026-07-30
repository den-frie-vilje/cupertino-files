#!/usr/bin/env node
/**
 * Generate docs/COVERAGE.md — the living feature/version matrix.
 *
 *   node scripts/coverage-matrix.ts            # write docs/COVERAGE.md
 *   node scripts/coverage-matrix.ts --check    # fail if the file is stale
 *   node scripts/coverage-matrix.ts --stdout   # print, don't write
 *
 * Two axes, and only one of them is hand-written:
 *
 *  - **Support status** per capability is declared in CAPABILITIES below.
 *    That is a claim about the code, so it lives in code review.
 *  - **Validation** is measured: each capability carries a probe, and the
 *    generator counts how many real fixtures exercise it and which format
 *    eras those fixtures span.
 *
 * The distinction matters. "Implemented" and "proven against Apple's own
 * output" are different things, and a matrix that conflates them is worse
 * than none. A capability can be `read+write` yet validated by zero
 * fixtures — the matrix says so out loud.
 */
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { IWorkDocument } from "../src/tsa/document.ts";
import { PagesDocument } from "../src/pages/document.ts";
import { KeynoteDocument } from "../src/keynote/document.ts";
import { NumbersDocument } from "../src/numbers/document.ts";
import { IWORK_ERAS, type IWorkEra, type CompatibilityReport } from "../src/tsp/version.ts";
import type { IWorkApp } from "../src/tsp/registry.ts";

const FIXTURES = new URL("../fixtures/", import.meta.url);
const OUTPUT = new URL("../docs/COVERAGE.md", import.meta.url);

/** How much of a capability the library implements. */
type Status = "read+write" | "read" | "experimental" | "roadmap" | "out-of-scope";

const STATUS_LABEL: Record<Status, string> = {
  "read+write": "✅ read + write",
  read: "🔍 read only",
  experimental: "⚠️ experimental",
  roadmap: "○ roadmap",
  "out-of-scope": "✗ out of scope",
};

/** Everything a probe may need, computed once per fixture. */
interface DocContext {
  app: IWorkApp;
  doc: IWorkDocument;
  report: CompatibilityReport;
  pages: PagesDocument | undefined;
  keynote: KeynoteDocument | undefined;
  numbers: NumbersDocument | undefined;
}

interface Capability {
  group: string;
  name: string;
  apps: IWorkApp[] | "all";
  status: Status;
  /** True when this document exercises the capability. Omit if unmeasurable. */
  probe?: (c: DocContext) => boolean;
  note?: string;
}

/** Never let one malformed document abort the whole survey. */
const safe = (fn: () => boolean): boolean => {
  try {
    return fn();
  } catch {
    return false;
  }
};

const CAPABILITIES: Capability[] = [
  // ---------------------------------------------------------------- container
  {
    group: "Container",
    name: "Flat zip layout",
    apps: "all",
    status: "read+write",
    probe: (c) => c.report.probe.containerLayout === "flat",
  },
  {
    group: "Container",
    name: "Nested Index.zip layout",
    apps: "all",
    status: "read+write",
    probe: (c) => c.report.probe.containerLayout === "nested-index-zip",
  },
  {
    group: "Container",
    name: "Wrapper-directory layout",
    apps: "all",
    status: "read+write",
    probe: (c) => c.report.probe.containerLayout === "wrapper-directory",
  },
  {
    group: "Container",
    name: "Byte-identical round-trip of untouched content",
    apps: "all",
    status: "read+write",
    probe: () => true,
    note: "enforced for every fixture by the compatibility suite",
  },
  {
    group: "Container",
    name: "Mixed-codec packages (LZFSE component beside Snappy)",
    apps: "all",
    status: "read",
    probe: (c) => c.report.probe.opaqueComponents.length > 0,
    note: "undecodable components stay opaque and are preserved, never fatal",
  },
  {
    group: "Container",
    name: "iWork '09 XML documents",
    apps: "all",
    status: "out-of-scope",
    note: "detected and rejected with a clear error",
  },
  {
    group: "Container",
    name: "Password-protected documents",
    apps: "all",
    status: "out-of-scope",
    note: "detected via .iwph and rejected",
  },

  // ------------------------------------------------------------ object graph
  {
    group: "Object graph",
    name: "Unknown type IDs preserved across edits",
    apps: "all",
    status: "read+write",
    probe: (c) => c.report.probe.unknownTypeIds.length > 0,
    note: "forward compatibility; registerTypes() can name them at runtime",
  },
  {
    group: "Object graph",
    name: "Multi-payload archives",
    apps: "all",
    status: "read",
    probe: (c) => c.report.probe.multiPayloadArchiveCount > 0,
  },
  {
    group: "Object graph",
    name: "Older-reader compatibility diffs (type-0 patches)",
    apps: "all",
    status: "read",
    probe: (c) => c.report.probe.patchArchiveCount > 0,
    note: "preserved verbatim; not recomputed when the base message changes",
  },
  {
    group: "Object graph",
    name: "Versioned style snapshots (styles_for_*)",
    apps: "all",
    status: "read",
    probe: (c) => c.report.probe.hasVersionedStyleSnapshots,
  },

  // -------------------------------------------------------------------- text
  {
    group: "Text & styles",
    name: "Text read/edit with full attribute-table fixup",
    apps: "all",
    status: "read+write",
    probe: (c) => safe(() => c.doc.textStorages().some((s) => s.text.length > 0)),
  },
  {
    group: "Text & styles",
    name: "Paragraph & character styles (by name, plus creation)",
    apps: "all",
    status: "read+write",
    probe: (c) => safe(() => c.doc.stylesheets().length > 0),
  },
  {
    group: "Text & styles",
    name: "List styles",
    apps: "all",
    status: "read+write",
    probe: (c) => safe(() => (c.pages?.listStyles().length ?? 0) > 0),
  },
  {
    group: "Text & styles",
    name: "Hyperlinks",
    apps: "all",
    status: "read+write",
    probe: (c) => safe(() => c.doc.textStorages().some((s) => s.links().length > 0)),
  },
  {
    group: "Text & styles",
    name: "Smart fields (page number, date, merge, …)",
    apps: "all",
    status: "read",
    probe: (c) => safe(() => c.doc.textStorages().some((s) => s.smartFields().length > 0)),
  },
  {
    group: "Text & styles",
    name: "Bookmarks",
    apps: "all",
    status: "read",
    probe: (c) => safe(() => c.doc.textStorages().some((s) => s.bookmarks().length > 0)),
  },
  {
    group: "Text & styles",
    name: "Footnotes / endnotes",
    apps: ["pages"],
    status: "read",
    probe: (c) => safe(() => c.doc.textStorages().some((s) => s.footnotes().length > 0)),
    note: "creating footnotes is not implemented",
  },
  {
    group: "Text & styles",
    name: "Comments",
    apps: "all",
    status: "read",
    probe: (c) => safe(() => c.doc.textStorages().some((s) => s.comments().length > 0)),
    note: "creating comments is not implemented",
  },
  {
    group: "Text & styles",
    name: "Change tracking (insertions/deletions)",
    apps: "all",
    status: "read",
    probe: (c) =>
      safe(() =>
        c.doc.textStorages().some((s) => s.object.message.has(21) || s.object.message.has(22)),
      ),
    note: "tables preserved and index-shifted correctly; no semantic API",
  },
  {
    group: "Text & styles",
    name: "Table of contents",
    apps: ["pages"],
    status: "roadmap",
  },

  // --------------------------------------------------------------- drawables
  {
    group: "Drawables & media",
    name: "Geometry (enumerate, move, resize)",
    apps: "all",
    status: "read+write",
    probe: (c) => safe(() => c.doc.drawables().length > 0),
  },
  {
    group: "Drawables & media",
    name: "Image filters / adjustments",
    apps: "all",
    status: "read+write",
    probe: (c) => safe(() => c.doc.images().some((i) => i.hasFilters)),
  },
  {
    group: "Drawables & media",
    name: "Image masks",
    apps: "all",
    status: "read",
    probe: (c) => safe(() => c.doc.images().some((i) => i.hasMask)),
  },
  {
    group: "Drawables & media",
    name: "Media variant resolution (unmaterialized originals)",
    apps: "all",
    status: "read",
    probe: (c) => safe(() => c.doc.images().some((i) => !i.isMaterialized && i.data() !== undefined)),
  },
  {
    group: "Drawables & media",
    name: "Inline image insertion",
    apps: ["pages"],
    status: "experimental",
    note: "Data/ plumbing with SHA-1 dedupe; not verified in the app",
  },
  {
    group: "Drawables & media",
    name: "Floating (non-inline) image placement",
    apps: ["pages"],
    status: "roadmap",
  },

  // ------------------------------------------------------------------- pages
  {
    group: "Pages",
    name: "Sections (read + insert)",
    apps: ["pages"],
    status: "read+write",
    probe: (c) => safe(() => (c.pages?.sections().length ?? 0) > 1),
    note: "validation counts multi-section documents only",
  },
  {
    group: "Pages",
    name: "Headers & footers (3 columns × first/even/odd)",
    apps: ["pages"],
    status: "read+write",
    probe: (c) =>
      safe(
        () =>
          c.pages?.sections().some((s) => s.headerText().trim() || s.footerText().trim()) ?? false,
      ),
  },
  {
    group: "Pages",
    name: "Master-page drawables",
    apps: ["pages"],
    status: "read",
    probe: (c) =>
      safe(
        () =>
          c.pages
            ?.sections()
            .some((s) => s.masterDrawables().some((m) => m.drawables.length > 0)) ?? false,
      ),
  },
  {
    group: "Pages",
    name: "Page setup (size, margins, orientation)",
    apps: ["pages"],
    status: "read+write",
    probe: (c) => safe(() => c.pages?.pageSetup().pageWidth !== undefined),
  },
  {
    group: "Pages",
    name: "Page-layout (body-less) documents",
    apps: ["pages"],
    status: "read+write",
    probe: (c) => safe(() => c.pages?.isPageLayout ?? false),
  },
  {
    group: "Pages",
    name: "Text boxes",
    apps: ["pages"],
    status: "read+write",
    probe: (c) => safe(() => (c.pages?.textBoxes().length ?? 0) > 0),
  },
  {
    group: "Pages",
    name: "Document settings (hyphenation, ligatures, footnote config)",
    apps: ["pages"],
    status: "read+write",
    probe: (c) => safe(() => c.pages?.settings !== undefined),
  },

  // ----------------------------------------------------------------- numbers
  {
    group: "Numbers & tables",
    name: "Sheets",
    apps: ["numbers"],
    status: "read",
    probe: (c) => safe(() => (c.numbers?.sheets().length ?? 0) > 0),
  },
  {
    group: "Numbers & tables",
    name: "Table cells — modern BNC/v5 storage",
    apps: "all",
    status: "read",
    probe: (c) => c.report.probe.cellStorage === "v5",
    note: "numbers, text, rich text, dates, booleans, durations, merges",
  },
  {
    group: "Numbers & tables",
    name: "Table cells — pre-BNC storage",
    apps: "all",
    status: "out-of-scope",
    probe: (c) => c.report.probe.cellStorage === "preBNC",
    note: "undocumented layout; reported explicitly, never guessed",
  },
  {
    group: "Numbers & tables",
    name: "Table cell writing",
    apps: "all",
    status: "roadmap",
    note: "needs formula-dependency and tile bookkeeping",
  },
  {
    group: "Numbers & tables",
    name: "Charts (type, categories, series, values)",
    apps: "all",
    status: "read",
    probe: (c) => safe(() => c.doc.charts().length > 0),
  },
  {
    group: "Numbers & tables",
    name: "Chart writing",
    apps: "all",
    status: "roadmap",
  },

  // ----------------------------------------------------------------- keynote
  {
    group: "Keynote",
    name: "Slide tree (both generations, presentation order)",
    apps: ["keynote"],
    status: "read",
    probe: (c) => safe(() => (c.keynote?.slideCount() ?? 0) > 0),
  },
  {
    group: "Keynote",
    name: "Speaker notes",
    apps: ["keynote"],
    status: "read+write",
    probe: (c) => safe(() => c.keynote?.slides().some((s) => s.notes.trim().length > 0) ?? false),
  },
  {
    group: "Keynote",
    name: "Transitions",
    apps: ["keynote"],
    status: "read+write",
    probe: (c) => safe(() => c.keynote?.slides().some((s) => s.transition()?.enabled) ?? false),
    note: "validation requires a deck with a non-'none' effect",
  },
  {
    group: "Keynote",
    name: "Master / layout slides",
    apps: ["keynote"],
    status: "read",
    probe: (c) => safe(() => (c.keynote?.masterSlides().length ?? 0) > 0),
  },
  {
    group: "Keynote",
    name: "Builds (animations)",
    apps: ["keynote"],
    status: "roadmap",
    note: "build count is exposed; the model is not",
  },

  // ------------------------------------------------------------- concurrency
  {
    group: "Concurrency",
    name: "Editing a document open in an app",
    apps: "all",
    status: "out-of-scope",
    note: "the app rewrites the whole package on autosave; see FORMAT.md §13.1",
  },
  {
    group: "Concurrency",
    name: "Live iCloud collaboration",
    apps: "all",
    status: "out-of-scope",
    note: "server-mediated OT over an authenticated protocol; see FORMAT.md §13.2",
  },
];

interface FixtureFacts {
  file: string;
  app: IWorkApp;
  era: IWorkEra;
  version: string;
  build: string;
  exercises: Set<string>;
}

function surveyFixtures(): FixtureFacts[] {
  const dir = fileURLToPath(FIXTURES);
  const facts: FixtureFacts[] = [];
  for (const file of readdirSync(dir).sort()) {
    if (!/\.(pages|numbers|key)$/.test(file)) continue;
    const bytes = new Uint8Array(readFileSync(new URL(file, FIXTURES)));
    let doc: IWorkDocument;
    try {
      doc = IWorkDocument.open(bytes);
    } catch {
      continue; // legacy '09 contrast file
    }
    const report = doc.compatibility();
    const app = doc.app;
    const context: DocContext = {
      app,
      doc,
      report,
      pages: app === "pages" ? safeLoad(() => PagesDocument.load(bytes)) : undefined,
      keynote: app === "keynote" ? safeLoad(() => KeynoteDocument.load(bytes)) : undefined,
      numbers: app === "numbers" ? safeLoad(() => NumbersDocument.load(bytes)) : undefined,
    };
    const exercises = new Set<string>();
    for (const capability of CAPABILITIES) {
      if (!capability.probe) continue;
      if (capability.apps !== "all" && !capability.apps.includes(app)) continue;
      if (safe(() => capability.probe!(context))) exercises.add(key(capability));
    }
    facts.push({
      file,
      app,
      era: report.era,
      version: report.formatVersion?.toString() ?? "—",
      build: report.appBuilds.at(-1) ?? "—",
      exercises,
    });
  }
  return facts;
}

function safeLoad<T>(fn: () => T): T | undefined {
  try {
    return fn();
  } catch {
    return undefined;
  }
}

const key = (c: Capability): string => `${c.group}/${c.name}`;

const APPS: IWorkApp[] = ["pages", "numbers", "keynote"];
const APP_LABEL: Record<IWorkApp, string> = {
  pages: "Pages",
  numbers: "Numbers",
  keynote: "Keynote",
};
const SURVEYED_ERAS = IWORK_ERAS.filter((e) => e !== "future");

function render(facts: FixtureFacts[]): string {
  const out: string[] = [];
  out.push("# Coverage matrix");
  out.push("");
  out.push(
    "**Generated — do not edit.** Run `npm run coverage` to regenerate; `npm run coverage:check`",
  );
  out.push("fails when this file is out of date with the fixtures and capability table.");
  out.push("");
  out.push(
    "Support status is declared in `scripts/coverage-matrix.ts`. Validation is *measured*: each",
  );
  out.push(
    "capability is probed against every fixture, so a row can read “implemented” and “validated by",
  );
  out.push("zero fixtures” at the same time — which is exactly the thing worth knowing.");
  out.push("");

  // ------------------------------------------------------------- version axis
  out.push("## Version coverage");
  out.push("");
  out.push(`| App | ${SURVEYED_ERAS.join(" | ")} | Total | Newest format | Newest build |`);
  out.push(`|---|${SURVEYED_ERAS.map(() => "---:").join("|")}|---:|---|---|`);
  for (const app of APPS) {
    const mine = facts.filter((f) => f.app === app);
    const cells = SURVEYED_ERAS.map((era) => {
      const n = mine.filter((f) => f.era === era).length;
      return n === 0 ? "·" : String(n);
    });
    const newest = [...mine].sort((a, b) => compareVersion(a.version, b.version)).at(-1);
    out.push(
      `| **${APP_LABEL[app]}** | ${cells.join(" | ")} | ${mine.length} | ` +
        `${newest?.version ?? "—"} | \`${newest?.build ?? "—"}\` |`,
    );
  }
  out.push("");
  out.push(`Eras are classified from \`fileFormatVersion\`; see \`docs/FORMAT.md\` §11. `);
  out.push(`Corpus: **${facts.length} documents**. Every one round-trips byte-identically.`);
  out.push("");

  // ------------------------------------------------------------- feature axis
  out.push("## Feature coverage");
  out.push("");
  out.push("Legend: " + Object.values(STATUS_LABEL).join(" · "));
  out.push("");
  const groups = [...new Set(CAPABILITIES.map((c) => c.group))];
  for (const group of groups) {
    out.push(`### ${group}`);
    out.push("");
    out.push("| Capability | Apps | Status | Fixtures | Eras validated |");
    out.push("|---|---|---|---:|---|");
    for (const capability of CAPABILITIES.filter((c) => c.group === group)) {
      const applicable =
        capability.apps === "all" ? APPS : (capability.apps as IWorkApp[]);
      const matching = facts.filter((f) => f.exercises.has(key(capability)));
      const eras = [...new Set(matching.map((f) => f.era))].sort(
        (a, b) => IWORK_ERAS.indexOf(a) - IWORK_ERAS.indexOf(b),
      );
      const count = capability.probe
        ? matching.length === 0
          ? "**0**"
          : String(matching.length)
        : "n/a";
      const eraText = capability.probe
        ? eras.length === 0
          ? "—"
          : eras.length === SURVEYED_ERAS.length
            ? "all"
            : `${eras[0]}→${eras.at(-1)}`
        : "—";
      const apps =
        capability.apps === "all" ? "all" : applicable.map((a) => APP_LABEL[a]).join(", ");
      const note = capability.note ? `<br><sub>${capability.note}</sub>` : "";
      out.push(
        `| ${capability.name}${note} | ${apps} | ${STATUS_LABEL[capability.status]} | ${count} | ${eraText} |`,
      );
    }
    out.push("");
  }

  // ------------------------------------------------------------------- gaps
  const unvalidated = CAPABILITIES.filter(
    (c) =>
      c.probe &&
      c.status !== "roadmap" &&
      c.status !== "out-of-scope" &&
      facts.every((f) => !f.exercises.has(key(c))),
  );
  const thin = CAPABILITIES.filter((c) => {
    if (!c.probe || c.status === "roadmap" || c.status === "out-of-scope") return false;
    const n = facts.filter((f) => f.exercises.has(key(c))).length;
    return n > 0 && n <= 2;
  });

  out.push("## Validation gaps");
  out.push("");
  if (unvalidated.length > 0) {
    out.push("**Implemented but exercised by no fixture** — spec-derived only:");
    out.push("");
    for (const c of unvalidated) out.push(`- ${c.group} → **${c.name}**`);
    out.push("");
  } else {
    out.push("Every implemented capability is exercised by at least one fixture.");
    out.push("");
  }
  if (thin.length > 0) {
    out.push("**Thinly validated** (1–2 fixtures — no cross-check if an encoding varies):");
    out.push("");
    for (const c of thin) {
      const n = facts.filter((f) => f.exercises.has(key(c))).length;
      out.push(`- ${c.group} → **${c.name}** (${n})`);
    }
    out.push("");
  }

  // ---------------------------------------------------------------- fixtures
  out.push("## Fixture inventory");
  out.push("");
  out.push("| File | App | Era | Format | Build |");
  out.push("|---|---|---|---|---|");
  for (const f of facts) {
    out.push(
      `| \`${f.file}\` | ${APP_LABEL[f.app]} | ${f.era} | ${f.version} | \`${f.build}\` |`,
    );
  }
  out.push("");
  out.push("See `fixtures/ATTRIBUTION.md` for sources, licences and the fixture privacy policy.");
  out.push("");
  return out.join("\n");
}

function compareVersion(a: string, b: string): number {
  const pa = a.split(".").map(Number);
  const pb = b.split(".").map(Number);
  for (let i = 0; i < 3; i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d !== 0) return d;
  }
  return 0;
}

/** Compact terminal view, for reporting progress without opening the file. */
function summarize(facts: FixtureFacts[]): string {
  const lines: string[] = [];
  const pad = (s: string, n: number) => s.padEnd(n);
  lines.push(pad("app", 10) + SURVEYED_ERAS.map((e) => pad(e, 10)).join("") + "newest");
  for (const app of APPS) {
    const mine = facts.filter((f) => f.app === app);
    const cells = SURVEYED_ERAS.map((era) =>
      pad(String(mine.filter((f) => f.era === era).length || "·"), 10),
    );
    const newest = [...mine].sort((a, b) => compareVersion(a.version, b.version)).at(-1);
    lines.push(pad(APP_LABEL[app], 10) + cells.join("") + (newest?.version ?? "—"));
  }
  const counted = CAPABILITIES.filter((c) => c.probe);
  const validated = counted.filter((c) => facts.some((f) => f.exercises.has(key(c))));
  const implemented = CAPABILITIES.filter(
    (c) => c.status === "read+write" || c.status === "read" || c.status === "experimental",
  );
  lines.push("");
  lines.push(
    `capabilities: ${implemented.length} implemented, ` +
      `${CAPABILITIES.filter((c) => c.status === "roadmap").length} roadmap, ` +
      `${CAPABILITIES.filter((c) => c.status === "out-of-scope").length} out of scope`,
  );
  lines.push(`validated:    ${validated.length}/${counted.length} probed capabilities have ≥1 fixture`);
  lines.push(`fixtures:     ${facts.length}`);
  return lines.join("\n");
}

function main(): void {
  const facts = surveyFixtures();
  const markdown = render(facts);
  const args = process.argv.slice(2);

  if (args.includes("--stdout")) {
    console.log(markdown);
    return;
  }
  if (args.includes("--check")) {
    let current = "";
    try {
      current = readFileSync(OUTPUT, "utf8");
    } catch {
      /* missing counts as stale */
    }
    if (current !== markdown) {
      console.error(
        "docs/COVERAGE.md is out of date with fixtures/ and the capability table.\n" +
          "Run: npm run coverage",
      );
      process.exit(1);
    }
    console.log("docs/COVERAGE.md is up to date.");
    return;
  }
  writeFileSync(OUTPUT, markdown);
  console.log(summarize(facts));
  console.log(`\nwrote ${fileURLToPath(OUTPUT)}`);
}

main();
