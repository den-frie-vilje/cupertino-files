/**
 * A small Markdown reader for building documents: headings, paragraphs,
 * bullet and numbered lists, block quotes, pipe tables, images on a
 * line of their own and thematic breaks — the blocks
 * `toMarkdown()` writes, so a document survives a round trip. Inline
 * emphasis, code spans and links are reduced to their text; anything
 * else stays as written.
 */
export type MarkdownBlock =
  | { kind: "heading"; level: number; text: string }
  | { kind: "paragraph"; text: string }
  | { kind: "list"; ordered: boolean; items: string[] }
  | { kind: "quote"; text: string }
  | { kind: "table"; rows: string[][] }
  | { kind: "image"; alt: string; src: string }
  | { kind: "rule" };

/** Supplies a picture's bytes for an image block, by the source it names; undefined skips it. */
export type ImageResolver = (src: string) => Uint8Array | undefined;

const HEADING = /^(#{1,6})\s+(.*?)\s*#*\s*$/;
const BULLET = /^\s*[-*+]\s+(.*)$/;
const NUMBERED = /^\s*\d+[.)]\s+(.*)$/;
const QUOTE = /^>\s?(.*)$/;
const IMAGE = /^\s*!\[([^\]]*)\]\(([^)\s]+)[^)]*\)\s*$/;
const RULE = /^\s*([-*_])(\s*\1){2,}\s*$/;
const TABLE_ROW = /^\s*\|.*\|\s*$/;
const TABLE_SEPARATOR = /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)*\|?\s*$/;

/** Inline markup reduced to its text. */
export function plainInline(text: string): string {
  return text
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
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
    if (ch === "\\" && inner[i + 1] === "|") {
      current += "|";
      i++;
    } else if (ch === "|") {
      cells.push(current);
      current = "";
    } else current += ch;
  }
  cells.push(current);
  return cells.map((c) => plainInline(c.replace(/<br\s*\/?>/g, "\n")));
}

export function parseMarkdown(source: string): MarkdownBlock[] {
  const blocks: MarkdownBlock[] = [];
  const lines = source.split(/\r?\n/);
  let paragraph: string[] = [];
  let list: { ordered: boolean; items: string[] } | undefined;
  let quote: string[] = [];
  let table: string[][] = [];
  const flush = (): void => {
    if (paragraph.length) blocks.push({ kind: "paragraph", text: plainInline(paragraph.join(" ")) });
    if (list) blocks.push({ kind: "list", ordered: list.ordered, items: list.items });
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
      blocks.push({ kind: "heading", level: heading[1]!.length, text: plainInline(heading[2]!) });
      continue;
    }
    if (RULE.test(line)) {
      flush();
      blocks.push({ kind: "rule" });
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
      if (!TABLE_SEPARATOR.test(line)) table.push(splitRow(line));
      continue;
    }
    if (table.length) flush();
    const bullet = BULLET.exec(line);
    const numbered = bullet ? undefined : NUMBERED.exec(line);
    if (bullet || numbered) {
      const ordered = numbered !== undefined && numbered !== null;
      const text = plainInline((bullet ?? numbered)![1]!);
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
      list.items[list.items.length - 1] = `${list.items[list.items.length - 1] ?? ""} ${plainInline(line)}`;
      continue;
    }
    if (quote.length) flush();
    paragraph.push(line.trim());
  }
  flush();
  return blocks;
}
