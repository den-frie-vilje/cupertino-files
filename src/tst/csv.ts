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

