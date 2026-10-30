/**
 * A small Markdown reader for building documents: headings, paragraphs,
 * bullet and numbered lists, block quotes, pipe tables, images on a
 * line of their own and thematic breaks — the blocks
 * `toMarkdown()` writes, so a document survives a round trip. Inline
 * emphasis, code spans and links are reduced to their text; anything
 * else stays as written.
 */
/** A run of text with the links and footnote references it carried, by offset into `text`. */
export interface InlineText {
  text: string;
  links: { start: number; end: number; url: string }[];
  /** Footnote references, by the label after the caret and the offset the mark sits at. */
  footnotes: { index: number; label: string }[];
  /** Ranges set in bold (`**` or `__`) and in italic (`*` or `_`); the two may overlap. */
  bold: { start: number; end: number }[];
  italic: { start: number; end: number }[];
}

export type MarkdownBlock =
  | { kind: "heading"; level: number; text: string }
  | { kind: "paragraph"; text: string; inline: InlineText }
  | { kind: "list"; ordered: boolean; items: InlineText[] }
  | { kind: "quote"; text: string }
  | { kind: "table"; rows: string[][] }
  | { kind: "image"; alt: string; src: string }
  | { kind: "footnote"; label: string; text: string }
  | { kind: "rule" };

/** Supplies a picture's bytes for an image block, by the source it names; undefined skips it. */
export type ImageResolver = (src: string) => Uint8Array | undefined;

const HEADING = /^(#{1,6})\s+(.*)/;
const BULLET = /^\s*[-*+]\s+(.*)/;
const NUMBERED = /^\s*\d+[.)]\s+(.*)/;
const QUOTE = /^>\s?(.*)$/;
const IMAGE = /^\s*!\[([^[\]]*)\]\(([^()\s]+)(?:\s[^()]*)?\)\s*$/;
const RULE = /^\s*([-*_])(\s*\1){2,}\s*$/;
const FOOTNOTE = /^\[\^([^[\]]+)\]:\s*(.*)/;
// Every class stops at the next bracket, so a scan that fails never rescans
// what an earlier start already covered: the whole pass is linear.
const INLINE = /\[\^([^[\]]+)\]|!\[([^[\]]*)\]\((?:[^()\s]*)(?:\s[^()]*)?\)|\[([^[\]]*)\]\(([^()\s]+)(?:\s[^()]*)?\)/g;

/**
 * Emphasis markers and code spans taken out of `pre`: the plain text, the
 * bold and italic ranges in it, and for every offset of `pre` the offset
 * of the plain text it maps to. An unclosed marker is dropped.
 */
function scanEmphasis(pre: string): { text: string; map: number[]; bold: { start: number; end: number }[]; italic: { start: number; end: number }[] } {
  let text = "";
  const map: number[] = new Array<number>(pre.length + 1).fill(0);
  const bold: { start: number; end: number }[] = [];
  const italic: { start: number; end: number }[] = [];
  let boldAt: number | undefined;
  let italicAt: { at: number; marker: string } | undefined;
  const boundaryBefore = (i: number): boolean => i === 0 || /[\s(["']/.test(pre[i - 1]!);
  const boundaryAfter = (i: number): boolean => i >= pre.length || /[\s.,;:!?)\]"']/.test(pre[i]!);
  let i = 0;
  while (i < pre.length) {
    map[i] = text.length;
    const ch = pre[i]!;
    if (ch === "`") {
      const close = pre.indexOf("`", i + 1);
      if (close > i) {
        for (let k = i + 1; k < close; k++) {
          map[k] = text.length;
          text += pre[k]!;
        }
        map[close] = text.length;
        i = close + 1;
        continue;
      }
    }
    const pair = pre.slice(i, i + 2);
    if (pair === "**" || pair === "__") {
      map[i + 1] = text.length;
      if (boldAt === undefined) boldAt = text.length;
      else {
        if (text.length > boldAt) bold.push({ start: boldAt, end: text.length });
        boldAt = undefined;
      }
      i += 2;
      continue;
    }
    if (ch === "*" || ch === "_") {
      const opens = italicAt === undefined && !/\s/.test(pre[i + 1] ?? " ") && (ch === "*" || boundaryBefore(i));
      const closes = italicAt?.marker === ch && (ch === "*" || boundaryAfter(i + 1));
      if (opens) {
        italicAt = { at: text.length, marker: ch };
        i++;
        continue;
      }
      if (closes) {
        if (text.length > italicAt!.at) italic.push({ start: italicAt!.at, end: text.length });
        italicAt = undefined;
        i++;
        continue;
      }
    }
    text += ch;
    i++;
  }
  // An opener nothing closed was a literal character after all.
  const restore = (at: number, marker: string): void => {
    text = text.slice(0, at) + marker + text.slice(at);
    for (let k = 0; k <= pre.length; k++) if ((map[k] ?? 0) > at) map[k] = (map[k] ?? 0) + marker.length;
    for (const r of [...bold, ...italic]) {
      if (r.start > at) r.start += marker.length;
      if (r.end > at) r.end += marker.length;
    }
  };
  if (italicAt !== undefined) restore(italicAt.at, italicAt.marker);
  if (boldAt !== undefined) restore(boldAt, "**");
  map[pre.length] = text.length;
  return { text, map, bold, italic };
}

/** The text of a run with its links, footnote references and emphasis lifted out by offset. */
export function inlineText(raw: string): InlineText {
  // First the structures with their own syntax, in the raw text's offsets.
  let pre = "";
  const links: { start: number; end: number; url: string }[] = [];
  const notes: { index: number; label: string }[] = [];
  let last = 0;
  for (const m of raw.matchAll(INLINE)) {
    pre += raw.slice(last, m.index);
    if (m[1] !== undefined) notes.push({ index: pre.length, label: m[1] });
    else if (m[2] !== undefined) pre += m[2];
    else {
      const start = pre.length;
      pre += m[3] ?? "";
      links.push({ start, end: pre.length, url: m[4] ?? "" });
    }
    last = m.index + m[0].length;
  }
  pre += raw.slice(last);
  // Then the emphasis, which may sit inside a link's label.
  const scanned = scanEmphasis(pre);
  const lead = scanned.text.length - scanned.text.trimStart().length;
  const text = scanned.text.trim();
  const at = (offset: number): number => Math.max(0, Math.min(text.length, (scanned.map[offset] ?? scanned.text.length) - lead));
  const range = (r: { start: number; end: number }): { start: number; end: number } => ({ start: r.start - lead, end: Math.min(text.length, r.end - lead) });
  return {
    text,
    links: links.map((l) => ({ start: at(l.start), end: at(l.end), url: l.url })).filter((l) => l.end > l.start),
    footnotes: notes.map((n) => ({ index: at(n.index), label: n.label })),
    bold: scanned.bold.map(range).filter((r) => r.end > r.start),
    italic: scanned.italic.map(range).filter((r) => r.end > r.start),
  };
}
const TABLE_ROW = /^\s*\|.*\|\s*$/;
const SEPARATOR_CELL = /^:?-{3,}:?$/;
const isTableSeparator = (line: string): boolean =>
  line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .every((cell) => SEPARATOR_CELL.test(cell.trim()));

/** A heading's text without its closing hashes, which count only after a space. */
function headingText(rest: string): string {
  const text = rest.trimEnd();
  let i = text.length;
  while (i > 0 && text[i - 1] === "#") i--;
  if (i === text.length) return text;
  return i === 0 || text[i - 1] === " " || text[i - 1] === "\t" ? text.slice(0, i).trimEnd() : text;
}

/** Inline markup reduced to its text. */
export function plainInline(text: string): string {
  return text
    .replace(/!\[([^[\]]*)\]\([^()]*\)/g, "$1")
    .replace(/\[([^[\]]*)\]\([^()]*\)/g, "$1")
    .replace(/`([^`]*)`/g, "$1")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/__([^_]+)__/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/(^|\s)_([^_]+)_(?=\s|$)/g, "$1$2")
    .trim();
}

function splitRow(line: string): string[] {
  const inner = line.trim().replace(/^\|/, "").replace(/\|$/, "");
  const cells: string[] = [];
  let current = "";
  for (let i = 0; i < inner.length; i++) {
    const ch = inner[i]!;
    if (ch === "\\" && (inner[i + 1] === "|" || inner[i + 1] === "\\")) {
      current += inner[i + 1]!;
      i++;
    } else if (ch === "|") {
      cells.push(current);
      current = "";
    } else current += ch;
  }
  cells.push(current);
  return cells.map((c) => plainInline(c.replace(/<br\s*\/?>/g, "\n")));
}

/**
 * A YAML-style front matter block — \`---\`, \`key: value\` lines, \`---\` — split
 * off the top of the source; only flat string values are read.
 */
export function splitFrontMatter(source: string): { meta: Record<string, string>; body: string } {
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(source);
  if (!m) return { meta: {}, body: source };
  const meta: Record<string, string> = {};
  for (const line of m[1]!.split(/\r?\n/)) {
    const pair = /^([A-Za-z_][\w-]*)\s*:\s*(.*)/.exec(line);
    if (pair) meta[pair[1]!] = pair[2]!.replace(/^(["'])(.*)\1$/, "$2").trim();
  }
  return { meta, body: source.slice(m[0].length) };
}

export function parseMarkdown(source: string): MarkdownBlock[] {
  const blocks: MarkdownBlock[] = [];
  const lines = splitFrontMatter(source).body.split(/\r?\n/);
  let paragraph: string[] = [];
  let list: { ordered: boolean; items: string[] } | undefined;
  let quote: string[] = [];
  let table: string[][] = [];
  const flush = (): void => {
    if (paragraph.length) {
      const inline = inlineText(paragraph.join(" "));
      blocks.push({ kind: "paragraph", text: inline.text, inline });
    }
    if (list) blocks.push({ kind: "list", ordered: list.ordered, items: list.items.map((item) => inlineText(item)) });
    if (quote.length) blocks.push({ kind: "quote", text: quote.join("\n").trim() });
    if (table.length) blocks.push({ kind: "table", rows: table });
    paragraph = [];
    list = undefined;
    quote = [];
    table = [];
  };
  for (const line of lines) {
    if (line.trim() === "") {
      flush();
      continue;
    }
    const heading = HEADING.exec(line);
    if (heading) {
      flush();
      blocks.push({ kind: "heading", level: heading[1]!.length, text: plainInline(headingText(heading[2]!)) });
      continue;
    }
    if (RULE.test(line)) {
      flush();
      blocks.push({ kind: "rule" });
      continue;
    }
    const footnote = FOOTNOTE.exec(line);
    if (footnote) {
      flush();
      blocks.push({ kind: "footnote", label: footnote[1]!, text: plainInline(footnote[2]!) });
      continue;
    }
    const image = IMAGE.exec(line);
    if (image) {
      flush();
      blocks.push({ kind: "image", alt: image[1]!, src: image[2]! });
      continue;
    }
    if (TABLE_ROW.test(line)) {
      if (paragraph.length || list || quote.length) flush();
      if (!isTableSeparator(line)) table.push(splitRow(line));
      continue;
    }
    if (table.length) flush();
    const bullet = BULLET.exec(line);
    const numbered = bullet ? undefined : NUMBERED.exec(line);
    if (bullet || numbered) {
      const ordered = numbered !== undefined && numbered !== null;
      const text = (bullet ?? numbered)![1]!;
      if (paragraph.length || quote.length || (list && list.ordered !== ordered)) flush();
      list ??= { ordered, items: [] };
      list.items.push(text);
      continue;
    }
    const quoted = QUOTE.exec(line);
    if (quoted) {
      if (paragraph.length || list) flush();
      quote.push(plainInline(quoted[1]!));
      continue;
    }
    if (list) {
      // A continuation line of the last item.
      list.items[list.items.length - 1] = `${list.items[list.items.length - 1] ?? ""} ${line.trim()}`;
      continue;
    }
    if (quote.length) flush();
    paragraph.push(line.trim());
  }
  flush();
  return blocks;
}
