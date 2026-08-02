import { defineConfig } from "vitepress";

// The site root is docs/, so the canonical documents — FORMAT.md, the
// generated COVERAGE.md and VERIFICATION.md, BLOCKERS.md, LEGAL.md — are
// pages directly. One source of truth; the repo's staleness guards protect
// the site for free.
export default defineConfig({
  title: "cupertino-files",
  description:
    "Read, inspect and edit Apple Pages, Numbers and Keynote documents in pure TypeScript — zero dependencies, byte-fidelity round trips, measured not guessed.",
  base: "/cupertino-files/",
  lastUpdated: true,
  // Repo-relative links (../fixtures/…, src/…) are for GitHub readers;
  // the site keeps them as-is rather than failing the build over them.
  ignoreDeadLinks: true,
  themeConfig: {
    nav: [
      { text: "Guide", link: "/guide/getting-started" },
      { text: "The Format", link: "/FORMAT" },
      {
        text: "Status",
        items: [
          { text: "Capability matrix", link: "/COVERAGE" },
          { text: "App verification", link: "/VERIFICATION" },
          { text: "Open questions", link: "/BLOCKERS" },
        ],
      },
      { text: "npm", link: "https://www.npmjs.com/package/cupertino-files" },
    ],
    sidebar: [
      {
        text: "Guide",
        items: [
          { text: "Getting started", link: "/guide/getting-started" },
          { text: "Working with documents", link: "/guide/documents" },
          { text: "CLI", link: "/guide/cli" },
          { text: "API design", link: "/guide/api-design" },
        ],
      },
      {
        text: "The format",
        items: [
          { text: "Specification", link: "/FORMAT" },
          { text: "Conformance suite", link: "/guide/conformance" },
          { text: "End-to-end app tests", link: "/E2E" },
        ],
      },
      {
        text: "Status",
        items: [
          { text: "Capability matrix", link: "/COVERAGE" },
          { text: "App verification", link: "/VERIFICATION" },
          { text: "Open questions", link: "/BLOCKERS" },
        ],
      },
      {
        text: "Project",
        items: [
          { text: "Contributing", link: "/guide/contributing" },
          { text: "Legal posture", link: "/LEGAL" },
        ],
      },
    ],
    socialLinks: [{ icon: "github", link: "https://github.com/olekristensen/cupertino-files" }],
    search: { provider: "local" },
    outline: { level: [2, 3] },
    footer: {
      message:
        "MIT licensed. Independently made — not by Apple in California. Not affiliated with or endorsed by Apple Inc.",
    },
    editLink: {
      pattern: "https://github.com/olekristensen/cupertino-files/edit/main/docs/:path",
      text: "Suggest a change to this page",
    },
  },
});
