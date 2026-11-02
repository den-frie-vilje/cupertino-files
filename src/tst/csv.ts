/** CSV rendering of a table's cells, beside the model it reads. */
import type { TableModel } from "./tables.ts";

function cellRows(table: TableModel): string[][] {
  const rows: string[][] = [];
  for (let row = 0; row < table.rowCount; row++) {
    const cells: string[] = [];
    for (let column = 0; column < table.columnCount; column++) cells.push(table.cellText(row, column));
    rows.push(cells);
  }
  return rows;
}

const csvField = (text: string): string =>
  /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;

/** RFC 4180 CSV: comma-separated, fields quoted when they need it. */
export function tableToCsv(table: TableModel): string {
  return cellRows(table)
    .map((cells) => cells.map(csvField).join(","))
    .join("\n");
}


/** RFC 4180 CSV read back into rows; a trailing line break adds no row. */
export function parseCsv(source: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < source.length; i++) {
    const ch = source[i]!;
    if (quoted) {
      if (ch === '"') {
        if (source[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += ch;
      continue;
    }
    if (ch === '"') quoted = true;
    else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && source[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else field += ch;
  }
  if (field !== "" || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

/**
 * Fit a table to `rows` and write them: the row and column counts grow or
 * shrink to the data's, every cell is set — numbers and TRUE/FALSE as
 * such, the rest as text — and empty cells are cleared.
 */
export function fillTable(table: TableModel, rows: readonly (readonly string[])[]): void {
  const rowCount = Math.max(1, rows.length);
  const columnCount = Math.max(1, ...rows.map((r) => r.length));
  if (table.rowCount < rowCount) table.insertRows(table.rowCount, rowCount - table.rowCount);
  else if (table.rowCount > rowCount) table.deleteRows(rowCount, table.rowCount - rowCount);
  if (table.columnCount < columnCount) table.insertColumns(table.columnCount, columnCount - table.columnCount);
  else if (table.columnCount > columnCount) table.deleteColumns(columnCount, table.columnCount - columnCount);
  for (let r = 0; r < rowCount; r++) {
    for (let c = 0; c < columnCount; c++) {
      const text = rows[r]?.[c] ?? "";
      if (text === "") table.clearCell(r, c);
      else table.setCell(r, c, csvCellValue(text));
    }
  }
}

/**
 * A CSV cell as the value a table cell takes: a number, TRUE/FALSE, an
 * ISO date (as the export writes one) or text.
 */
export function csvCellValue(text: string): string | number | boolean | Date {
  if (/^-?\d+(\.\d+)?$/.test(text)) return Number(text);
  if (/^(TRUE|FALSE)$/i.test(text)) return text.toUpperCase() === "TRUE";
  if (/^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})?)?$/.test(text)) {
    const date = new Date(text);
    if (!Number.isNaN(date.getTime())) return date;
  }
  return text;
}
