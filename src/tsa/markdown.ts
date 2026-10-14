/**
 * Markdown renderings of the document model: text storages as
 * paragraphs, headings and list items; tables as pipe tables; charts as
 * a table of their series. Each document kind assembles these into its
 * own structure in `toMarkdown()`; CSV lives beside the table model.
 */
import type { ChartModel, ChartValue } from "../tsch/charts.ts";
import { tablesOf, type TableModel } from "../tst/tables.ts";
import { ImageModel } from "../tsd/images.ts";
import type { ObjectStore } from "../tsp/store.ts";
import { FOOTNOTE_MARK_CHARACTER, OBJECT_REPLACEMENT_CHARACTER, type TextStorage } from "../tswp/textstorage.ts";

/** Characters that mark attachments and notes in the text, not words. */
const MARKS = new RegExp(`[\\u2029${FOOTNOTE_MARK_CHARACTER}${OBJECT_REPLACEMENT_CHARACTER}]`, "g");

/**
 * A paragraph's heading level from its named style, read up the style
 * chain to the first named ancestor: the template identifiers are
 * locale-free ("…paragraphstyle-Heading 2") where the names are not.
 * "Title" is level 1, "Heading" level 2, "Heading N" level N + 1.
 */
export function headingLevel(storage: TextStorage, styleId: bigint | undefined): number | undefined {
  const sheet = storage.sheet();
  const seen = new Set<bigint>();
  let id = styleId;
  while (id !== undefined && !seen.has(id)) {
    seen.add(id);
    const info = sheet?.style(id)?.info;
    if (!info) break;
    const level = levelOf(info.identifier) ?? levelOf(info.name);
    if (level !== undefined) return level;
    if (info.name !== undefined) return undefined;
    id = info.parentId;
  }
  return undefined;
}

function levelOf(label: string | undefined): number | undefined {
  if (!label) return undefined;
  const tail = label.replace(/^.*paragraphstyle-/, "");
  if (/^title$/i.test(tail)) return 1;
  const heading = /^heading(?:\s*(\d))?$/i.exec(tail);
  if (heading) return Math.min(6, (heading[1] ? Number(heading[1]) : 1) + 1);
  return undefined;
}

/**
 * Where an exported picture goes: given its file name and bytes, returns
 * the link target to write, or nothing to leave the picture out.
 */
export type ImageSink = (image: { fileName: string; data: Uint8Array }) => string | undefined;

export interface MarkdownOptions {
  images?: ImageSink;
}

/** A picture as a Markdown image, through the sink; nothing without one. */
export function imageToMarkdown(image: ImageModel, options: MarkdownOptions): string {
  const data = image.data();
  if (!options.images || !data) return "";
  const fileName = image.fileName ?? `image-${image.id}`;
  const target = options.images({ fileName, data });
  return target === undefined ? "" : `![${fileName}](${target})`;
}

/**
 * What an attachment at a U+FFFC renders as: a pipe table for a table,
 * an image link for a picture, nothing for the rest.
 */
export function attachmentToMarkdown(store: ObjectStore, drawableId: bigint, options: MarkdownOptions): string {
  const object = store.object(drawableId);
  if (!object) return "";
  if (object.type === 3005) return imageToMarkdown(new ImageModel(store, object), options);
  if (object.type === 6000) {
    const table = tablesOf(store, [drawableId])[0];
    return table ? joinBlocks([table.name ? `### ${table.name}` : "", tableToMarkdown(table)]) : "";
  }
  return "";
}

/** List styles that number their items, by the template's locale-free identifier or name. */
const ORDERED_LIST = /number|harvard|letter/i;

/**
 * Paragraphs, headings and list items, separated by blank lines. A list
 * paragraph is an item: "- " under a bullet style, "1. " under a numbered
 * or lettered one, and a run of items of one kind is one list.
 */
export function storageToMarkdown(storage: TextStorage, options: MarkdownOptions = {}): string {
  const blocks: string[] = [];
  let items: string[] = [];
  let ordered = false;
  const flush = (): void => {
    if (items.length > 0) blocks.push(items.join("\n"));
    items = [];
  };
  const attachments = storage.attachments();
  const links = storage.links();
  const footnotes = storage.footnotes();
  const marks = new Map(footnotes.map((note, i) => [note.anchorIndex, `[^${i + 1}]`]));
  const full = storage.text;
  // Bold and italic per character, from the character style in effect:
  // bit 1 bold, bit 2 italic.
  const emphasis = new Uint8Array(full.length);
  const sheet = storage.sheet();
  const faces = new Map<bigint, number>();
  for (const run of storage.characterStyleRuns()) {
    if (run.objectId === undefined) continue;
    let face = faces.get(run.objectId);
    if (face === undefined) {
      const character = sheet?.style(run.objectId)?.resolved().character;
      face = (character?.bold ? 1 : 0) | (character?.italic ? 2 : 0);
      faces.set(run.objectId, face);
    }
    if (face) emphasis.fill(face, run.start, Math.min(run.end, full.length));
  }
  const wrap = (piece: string, face: number): string => {
    if (!face || piece.trim() === "") return piece;
    const lead = piece.length - piece.trimStart().length;
    const trail = piece.length - piece.trimEnd().length;
    let core = piece.slice(lead, piece.length - trail);
    if (face & 2) core = `*${core}*`;
    if (face & 1) core = `**${core}**`;
    return piece.slice(0, lead) + core + piece.slice(piece.length - trail);
  };
  // A stretch of the text, its emphasis runs wrapped.
  const spans = (from: number, to: number): string => {
    let out = "";
    let at = from;
    while (at < to) {
      const face = emphasis[at] ?? 0;
      let end = at;
      while (end < to && (emphasis[end] ?? 0) === face) end++;
      out += wrap(plainRange(at, end), face);
      at = end;
    }
    return out;
  };
  // A range of the text with its links as links, its footnote anchors as
  // references, its emphasis as markers and the other marks dropped.
  const render = (from: number, to: number): string => {
    let out = "";
    let i = from;
    for (const link of links.filter((l) => l.start >= from && l.end <= to).sort((a, b) => a.start - b.start)) {
      out += spans(i, link.start);
      out += `[${spans(link.start, link.end)}](${link.url})`;
      i = link.end;
    }
    return out + spans(i, to);
  };
  function plainRange(from: number, to: number): string {
    let out = "";
    for (let k = from; k < to; k++) {
      const mark = marks.get(k);
      if (mark !== undefined) out += mark;
      else if (!MARKS.test(full[k]!)) out += full[k]!;
      MARKS.lastIndex = 0;
    }
    return out;
  }
  for (const paragraph of storage.paragraphs()) {
    // Pictures and tables anchored in this paragraph follow its text.
    const anchored = attachments
      .filter((a) => a.drawableId !== undefined && a.index >= paragraph.start && a.index <= paragraph.end)
      .map((a) => attachmentToMarkdown(storage.store, a.drawableId!, options))
      .filter((block) => block.length > 0);
    const text = render(paragraph.start, paragraph.end).trim();
    if (text === "") {
      flush();
      blocks.push(...anchored);
      continue;
    }
    const level = headingLevel(storage, paragraph.styleId);
    if (level !== undefined) {
      flush();
      blocks.push(`${"#".repeat(level)} ${text}`);
      continue;
    }
    const list = storage.paragraph(paragraph.index).listStyleName;
    if (list !== undefined && !/^none$/i.test(list)) {
      const numbered = ORDERED_LIST.test(list);
      if (items.length > 0 && numbered !== ordered) flush();
      ordered = numbered;
      items.push(numbered ? `${items.length + 1}. ${text}` : `- ${text}`);
      continue;
    }
    flush();
    blocks.push(text, ...anchored);
  }
  flush();
  for (const [i, note] of footnotes.entries()) {
    blocks.push(`[^${i + 1}]: ${note.storage.text.replace(MARKS, "").trim()}`);
  }
  return blocks.join("\n\n");
}

function cellRows(table: TableModel): string[][] {
  const rows: string[][] = [];
  for (let row = 0; row < table.rowCount; row++) {
    const cells: string[] = [];
    for (let column = 0; column < table.columnCount; column++) cells.push(table.cellText(row, column));
    rows.push(cells);
  }
  return rows;
}

const pipeCell = (text: string): string => text.replace(/\|/g, "\\|").replace(/\r?\n/g, "<br>");

/**
 * A pipe table. Markdown has one header row, so the table's first row
 * is the header whether or not the table marks header rows; the rest
 * are body rows. Pipes and line breaks in cells are escaped.
 */
export function tableToMarkdown(table: TableModel): string {
  const rows = cellRows(table);
  if (rows.length === 0 || table.columnCount === 0) return "";
  const line = (cells: string[]): string => `| ${cells.map(pipeCell).join(" | ")} |`;
  const separator = `| ${rows[0]!.map(() => "---").join(" | ")} |`;
  return [line(rows[0]!), separator, ...rows.slice(1).map(line)].join("\n");
}

function chartValueText(value: ChartValue): string {
  switch (value.type) {
    case "empty":
      return "";
    case "number":
      return String(value.value);
    case "date":
      return value.value.toISOString();
    case "duration":
      return `${value.seconds}s`;
  }
}

/** A chart as its type and a table of its series over its categories. */
export function chartToMarkdown(chart: ChartModel): string {
  const categories = chart.columnNames();
  const series = chart.series();
  const width = Math.max(categories.length, ...series.map((s) => s.values.length));
  const header = [""];
  for (let i = 0; i < width; i++) header.push(categories[i] ?? "");
  const line = (cells: string[]): string => `| ${cells.map(pipeCell).join(" | ")} |`;
  const rows = series.map((s) => {
    const cells = [s.name ?? ""];
    for (let i = 0; i < width; i++) cells.push(s.values[i] ? chartValueText(s.values[i]!) : "");
    return line(cells);
  });
  const title = `*${chart.chartType} chart*`;
  if (width === 0) return title;
  return [title, "", line(header), `| ${header.map(() => "---").join(" | ")} |`, ...rows].join("\n");
}

/** Blocks joined with blank lines, empties dropped. */
export function joinBlocks(blocks: readonly string[]): string {
  return blocks.filter((b) => b.length > 0).join("\n\n");
}
