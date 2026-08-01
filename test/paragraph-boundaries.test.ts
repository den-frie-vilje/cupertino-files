/**
 * Where does a paragraph begin?
 *
 * This library answered "after a `\n`" for its whole life, and that is not
 * Pages' answer. Pages also ends a paragraph on a page break (`U+000C`), a
 * section break (`U+0004`) and `U+0005`, and it does *not* end one on
 * `U+2028`, the soft line break a shift-return inserts.
 *
 * Getting it wrong is invisible from inside. The reader and the writer
 * shared the same wrong rule, so text round-tripped perfectly and every
 * offline check passed. The damage happened in `writeParagraphTable`, which
 * rebuilds `table_para_style` from *our* paragraph starts: a boundary we
 * could not see had its style entry dropped on the next edit, and Pages
 * rendered the body unstyled. One `\f` in a document was enough.
 *
 * The rule below is measured rather than asserted, and this file re-measures
 * it. Apple's own `table_para_style` says where paragraphs begin: an entry
 * at index `i > 0` means a paragraph starts at `i`, so the character at
 * `i - 1` is a terminator by construction. That makes the corpus the
 * authority, and it makes a future Pages that adds a terminator show up as a
 * failure here rather than as a mangled document.
 */
import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "./harness.ts";
import { PagesDocument } from "../src/index.ts";

const FIXTURES = new URL("../fixtures/", import.meta.url);
const TABLE_PARA_STYLE = 5;

/** Every Pages fixture that loads, with its body text. */
function* documents(): Generator<{ name: string; doc: PagesDocument }> {
  for (const name of readdirSync(FIXTURES)) {
    if (!name.endsWith(".pages")) continue;
    try {
      yield { name, doc: PagesDocument.load(new Uint8Array(readFileSync(new URL(name, FIXTURES)))) };
    } catch {
      // unreadable fixtures are another test's problem
    }
  }
}

/** Characters that directly precede a paragraph-style entry, with counts. */
function terminatorsInCorpus(): Map<number, number> {
  const out = new Map<number, number>();
  for (const { doc } of documents()) {
    const text = doc.body.text;
    const table = doc.store.resolve(doc.body.id)?.message.getMessage(TABLE_PARA_STYLE);
    if (!table) continue;
    for (const entry of table.getMessages(1)) {
      const at = entry.getUint(1) ?? 0;
      if (at === 0 || at > text.length) continue;
      const code = text.charCodeAt(at - 1);
      out.set(code, (out.get(code) ?? 0) + 1);
    }
  }
  return out;
}

const hex = (code: number) => `U+${code.toString(16).padStart(4, "0")}`;

describe("paragraph boundaries match Apple's", () => {
  it("recognises every terminator the corpus demonstrates", () => {
    // Anything Apple starts a paragraph after, we must too. A new one
    // appearing in a future fixture fails here.
    const found = [...terminatorsInCorpus().keys()].sort((a, b) => a - b);
    expect(found.length > 0).toBe(true);
    const unhandled = found.filter((code) => {
      const text = `a${String.fromCharCode(code)}b`;
      return !PagesDocument.load(new Uint8Array(readFileSync(new URL("iwork-mcp-v14.5-sample.pages", FIXTURES))))
        .body.paragraphStarts(text)
        .includes(2);
    });
    expect(`unhandled terminators: ${unhandled.map(hex).join(", ")}`).toBe(
      "unhandled terminators: ",
    );
  });

  it("does not treat U+2028 as a paragraph break", () => {
    // The other direction, and the reason the set cannot just be "every
    // control character": U+2028 occurs throughout the corpus and never
    // begins a paragraph. It is a soft line break within one.
    const counts = terminatorsInCorpus();
    expect(`U+2028 precedes ${counts.get(0x2028) ?? 0} entries`).toBe("U+2028 precedes 0 entries");

    const doc = PagesDocument.load(
      new Uint8Array(readFileSync(new URL("iwork-mcp-v14.5-sample.pages", FIXTURES))),
    );
    expect(doc.body.paragraphStarts("a b").join(",")).toBe("0");
    expect(doc.body.paragraphStarts("ab").join(",")).toBe("0,2");
  });

  it("agrees with Apple on where every fixture's paragraphs start", () => {
    // The whole-corpus form: for each document, every paragraph-style entry
    // that is not a trailing terminator should land on a paragraph start we
    // also recognise. Disagreement here is what silently dropped entries.
    const bad: string[] = [];
    for (const { name, doc } of documents()) {
      const text = doc.body.text;
      const table = doc.store.resolve(doc.body.id)?.message.getMessage(TABLE_PARA_STYLE);
      if (!table) continue;
      const starts = new Set(doc.body.paragraphStarts());
      for (const entry of table.getMessages(1)) {
        const at = entry.getUint(1) ?? 0;
        // An entry at exactly text.length is a terminator, not a paragraph.
        if (at === text.length) continue;
        if (!starts.has(at)) bad.push(`${name}@${at}(after ${hex(text.charCodeAt(at - 1))})`);
      }
    }
    expect(`entries on non-starts: ${bad.slice(0, 5).join(" ")}`).toBe("entries on non-starts: ");
  });

  it("keeps the style table intact across an edit, on both ladder bases", () => {
    // The end-to-end consequence. A base containing a page break is the one
    // that exposed this; the plain base is kept as a control.
    for (const base of ["patrickomatic-termpaper-footers-masks.pages", "iwork-mcp-v14.5-sample.pages"]) {
      const bytes = new Uint8Array(readFileSync(new URL(base, FIXTURES)));
      const read = (doc: PagesDocument) =>
        doc.store
          .resolve(doc.body.id)!
          .message.getMessage(TABLE_PARA_STYLE)!
          .getMessages(1)
          .map((e) => `${e.getUint(1) ?? 0}:${e.getMessage(2)?.getUint(1) ?? "none"}`)
          .join(" ");

      const before = read(PagesDocument.load(bytes));
      const edited = PagesDocument.load(bytes);
      edited.appendParagraph("appended");
      const after = read(PagesDocument.load(edited.save()));
      expect(`${base}: ${after}`).toBe(`${base}: ${before}`);
    }
  });
});
