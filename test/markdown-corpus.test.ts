import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "./harness.ts";
import { KeynoteDocument } from "../src/keynote/document.ts";
import { NumbersDocument } from "../src/numbers/document.ts";
import { PagesDocument } from "../src/pages/document.ts";

const FIXTURES = new URL("../fixtures/", import.meta.url);

describe("Markdown over the corpus", () => {
  it("exports every readable document and builds a document of the same kind back from it", () => {
    const failures: string[] = [];
    let documents = 0;
    for (const name of readdirSync(FIXTURES)) {
      if (!/\.(pages|numbers|key)$/.test(name)) continue;
      const Doc = name.endsWith(".pages") ? PagesDocument : name.endsWith(".numbers") ? NumbersDocument : KeynoteDocument;
      let doc: PagesDocument | NumbersDocument | KeynoteDocument;
      try {
        doc = (Doc as typeof PagesDocument).load(new Uint8Array(readFileSync(new URL(name, FIXTURES))));
      } catch {
        continue; // unreadable fixtures are another test's problem
      }
      documents++;
      try {
        const md = doc.toMarkdown({ images: ({ fileName }) => fileName });
        const back = name.endsWith(".pages")
          ? PagesDocument.fromMarkdown(md)
          : name.endsWith(".numbers")
            ? NumbersDocument.fromMarkdown(md)
            : KeynoteDocument.fromMarkdown(md);
        const again = (Doc as typeof PagesDocument).load(back.save()).toMarkdown();
        // The structure survives a second pass: Numbers its sheets and
        // tables (a table built without a heading shows the app's default
        // name, so deeper headings may grow), the others every heading.
        const headings = (s: string, levels: string): number => s.split("\n").filter((l) => new RegExp(`^#{${levels}} `).test(l)).length;
        const tables = (s: string): number => s.split("\n").filter((l) => /^\| ---/.test(l)).length;
        const levels = name.endsWith(".numbers") ? "1" : "1,6";
        if (headings(again, levels) !== headings(md, levels)) {
          throw new Error(`headings ${headings(md, levels)} → ${headings(again, levels)}`);
        }
        if (tables(again) !== tables(md)) throw new Error(`tables ${tables(md)} → ${tables(again)}`);
      } catch (error) {
        failures.push(`${name}: ${(error as Error).message}`);
      }
    }
    expect(documents > 50).toBe(true);
    expect(`failed: ${failures.join(" | ")}`).toBe("failed: ");
  });
});
