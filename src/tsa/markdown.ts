/**
 * Markdown renderings of the document model: text storages as
 * paragraphs, headings and list items; tables as pipe tables; charts as
 * a table of their series. Each document kind assembles these into its
 * own structure in `toMarkdown()`; CSV lives beside the table model.
 */
import type { ChartModel, ChartValue } from "../tsch/charts.ts";
import type { TableModel } from "../tst/tables.ts";
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

/** Paragraphs, headings and list items, separated by blank lines. */
export function storageToMarkdown(storage: TextStorage): string {
  const blocks: string[] = [];
  let items: string[] = [];
  const flush = (): void => {
    if (items.length > 0) blocks.push(items.join("\n"));
    items = [];
  };
  for (const paragraph of storage.paragraphs()) {
    const text = paragraph.text.replace(MARKS, "").trim();
    if (text === "") {
      flush();
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
      items.push(`- ${text}`);
      continue;
    }
    flush();
    blocks.push(text);
  }
  flush();
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
