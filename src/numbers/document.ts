/**
 * NumbersDocument — Apple Numbers (.numbers), extending the shared
 * IWorkDocument. The full spreadsheet model (tables, tiles, formulas) is a
 * later milestone; today this subclass provides app detection, the shared
 * text/stylesheet/drawable machinery, sheet enumeration and round-trip save.
 */
import { IWorkDocument } from "../tsa/document.ts";
import { SHARED_REFERENCE_EXTRACTORS } from "../tsp/extractors.ts";
import type { IwaObject } from "../tsp/iwa.ts";
import type { IWorkContainer } from "../tsp/package.ts";
import type { ObjectStore } from "../tsp/store.ts";
import { tablesOf, TST_TYPE, type TableModel } from "../tst/tables.ts";
import { makeRef, refId } from "../tsp/schema.ts";
import { deepCloneObject, defaultFollow } from "../tsp/clone.ts";
import { DrawableContainer } from "../tsd/placement.ts";

/** TN.DocumentArchive (type 1 in the Numbers registry): sheets = 1. */
const TN_TYPE_DOCUMENT = 1;
const TN_DOCUMENT_SHEETS = 1;
/** TN.SheetArchive: name = 1. */
const TN_TYPE_SHEET = 2;
const TN_SHEET_NAME = 1;
const TN_SHEET_DRAWABLE_INFOS = 2;

export interface SheetInfo {
  id: bigint;
  name: string | undefined;
}

export class NumbersDocument extends IWorkDocument {
  private docObject: IwaObject;

  private constructor(container: IWorkContainer, store: ObjectStore, docObject: IwaObject) {
    super(container, store);
    this.docObject = docObject;
  }

  static load(bytes: Uint8Array): NumbersDocument {
    const { container, store } = IWorkDocument.loadStore(
      bytes,
      "numbers",
      SHARED_REFERENCE_EXTRACTORS,
    );
    const docObject = store.findByType(TN_TYPE_DOCUMENT);
    if (!docObject) throw new RangeError("TN.DocumentArchive not found — not a Numbers document?");
    return new NumbersDocument(container, store, docObject);
  }

  /** Tables of one sheet, or of the whole document when no sheet is given. */
  override tables(sheetId?: bigint): TableModel[] {
    if (sheetId === undefined) return tablesOf(this.store);
    const sheet = this.store.object(sheetId);
    if (!sheet) throw new RangeError(`sheet ${sheetId} not found`);
    const drawableIds: bigint[] = [];
    for (const ref of sheet.message.getMessages(TN_SHEET_DRAWABLE_INFOS)) {
      const id = ref.getVarint(1);
      if (id !== undefined) drawableIds.push(id);
    }
    return tablesOf(this.store, drawableIds);
  }

  /** The document's sheets (id + name), in tab order. */
  sheets(): SheetInfo[] {
    const out: SheetInfo[] = [];
    for (const ref of this.docObject.message.getMessages(TN_DOCUMENT_SHEETS)) {
      const obj = this.store.resolve(ref.getVarint(1));
      if (obj?.type === TN_TYPE_SHEET) {
        out.push({ id: obj.identifier, name: obj.message.getString(TN_SHEET_NAME) });
      }
    }
    return out;
  }

  /**
   * A sheet's drawable list — tables, charts, shapes and images alike.
   *
   * Numbers keeps one list with no separate z-order, so paint order is the
   * list order.
   */
  sheetContainer(sheetId: bigint): DrawableContainer {
    const sheet = this.store.object(sheetId);
    if (!sheet) throw new RangeError(`sheet ${sheetId} not found`);
    return new DrawableContainer(this.store, sheet, TN_SHEET_DRAWABLE_INFOS);
  }

  // ------------------------------------------------------ sheet management

  /**
   * Add a sheet by copying an existing one.
   *
   * A sheet is a container for drawables, and a Numbers document with an
   * empty one is perfectly valid — but the *tables* on a sheet are what
   * make it useful, and building a table from nothing means synthesising
   * tiles, header buckets, data lists and a calc-engine owner. Copying is
   * both simpler and closer to what Numbers does when you duplicate a tab.
   *
   * By default the copy keeps its tables (a duplicate); pass
   * `withContent: false` for an empty sheet.
   */
  addSheet(options: { name?: string; copyOf?: number; at?: number; withContent?: boolean } = {}): SheetInfo {
    const sheets = this.sheets();
    if (sheets.length === 0) throw new RangeError("document has no sheet to copy");
    const sourceIndex = options.copyOf ?? sheets.length - 1;
    const source = this.store.object(sheets[sourceIndex]?.id ?? -1n);
    if (!source) throw new RangeError(`no sheet at index ${sourceIndex}`);

    const withContent = options.withContent ?? true;
    let sheet: IwaObject;
    if (withContent) {
      // Deep copy, so the duplicate's tables are its own — a shallow one
      // would leave both tabs editing the same cells.
      sheet = deepCloneObject(this.store, source, {
        follow: (object, depth) => defaultFollow(object, this.store.typeNameOf(object)) && depth <= 10,
        maxObjects: 4096,
      }).clone;
    } else {
      const component = this.store.componentOf(source.identifier);
      if (!component) throw new RangeError("source sheet has no component");
      sheet = this.store.createObject(source.type, component, { cloneFrom: source });
      sheet.message.remove(TN_SHEET_DRAWABLE_INFOS);
    }
    sheet.message.setString(TN_SHEET_NAME, this.uniqueSheetName(options.name, sheets));

    const ids = sheets.map((s) => s.id);
    const at = options.at ?? ids.length;
    ids.splice(Math.max(0, Math.min(at, ids.length)), 0, sheet.identifier);
    this.writeSheetOrder(ids);
    return { id: sheet.identifier, name: sheet.message.getString(TN_SHEET_NAME) };
  }

  /** Remove a sheet from the document's tab order. */
  removeSheet(index: number): void {
    const sheets = this.sheets();
    const sheet = sheets[index];
    if (!sheet) throw new RangeError(`no sheet at index ${index}`);
    if (sheets.length <= 1) throw new RangeError("a document must keep at least one sheet");
    // Unlinked, not deleted: other objects may still reference the sheet,
    // and an orphan is harmless where a dangling reference is not.
    this.writeSheetOrder(sheets.filter((_, i) => i !== index).map((s) => s.id));
  }

  /** Rename a sheet. Names must be unique, as they are in the app. */
  renameSheet(index: number, name: string): void {
    const sheets = this.sheets();
    const sheet = this.store.object(sheets[index]?.id ?? -1n);
    if (!sheet) throw new RangeError(`no sheet at index ${index}`);
    sheet.message.setString(
      TN_SHEET_NAME,
      this.uniqueSheetName(name, sheets.filter((_, i) => i !== index)),
    );
  }

  /** Move a sheet to a new position in tab order. */
  moveSheet(from: number, to: number): void {
    const ids = this.sheets().map((s) => s.id);
    if (from < 0 || from >= ids.length) throw new RangeError(`no sheet at index ${from}`);
    if (to < 0 || to >= ids.length) throw new RangeError(`cannot move to index ${to}`);
    const [moved] = ids.splice(from, 1);
    ids.splice(to, 0, moved!);
    this.writeSheetOrder(ids);
  }

  private writeSheetOrder(ids: readonly bigint[]): void {
    this.docObject.message.setMessages(
      TN_DOCUMENT_SHEETS,
      ids.map((id) => makeRef(id)),
    );
  }

  // ------------------------------------------------------ table management

  /** The tables on one sheet, in the order the sheet lists them. */
  tablesOnSheet(sheetId: bigint): TableModel[] {
    return tablesOf(this.store, this.sheetContainer(sheetId).ids());
  }

  /**
   * Add a table to a sheet by copying an existing one.
   *
   * Building a table from nothing means synthesising tiles, header buckets,
   * data lists and a calc-engine owner — the same reason sheets and slides
   * are created by copying. The source defaults to the first table on the
   * target sheet, falling back to any table in the document.
   *
   * The copy is renamed, because **Numbers addresses tables by name**: two
   * tables called "Table 1" on one sheet make every cross-table formula
   * ambiguous. Names must be unique per sheet, not per document, so a copy
   * onto a different sheet can keep the original's name.
   *
   * `withContent: false` clears the cells but keeps the shape, styling and
   * header bands — a blank table laid out like its source, which is what
   * you want far more often than a duplicate of the data.
   */
  addTable(
    sheetId: bigint,
    options: {
      name?: string;
      copyOf?: bigint;
      withContent?: boolean;
      x?: number;
      y?: number;
    } = {},
  ): TableModel {
    const container = this.sheetContainer(sheetId);
    const sourceId = options.copyOf ?? this.defaultTableSource(sheetId);
    if (sourceId === undefined) {
      throw new RangeError(
        "no table to copy: this document contains none, and building one from nothing is not supported",
      );
    }
    const source = this.store.object(sourceId);
    if (source?.type !== TST_TYPE.TABLE_INFO) {
      throw new RangeError(`object ${sourceId} is not a TST.TableInfoArchive`);
    }

    const placement: { x?: number; y?: number } = {};
    if (options.x !== undefined) placement.x = options.x;
    if (options.y !== undefined) placement.y = options.y;
    const copy = container.addCopyOf(source, placement);

    const table = tablesOf(this.store, [copy.id])[0];
    if (!table) throw new RangeError(`copied table ${copy.id} did not resolve`);

    table.name = this.uniqueTableName(options.name, sheetId, copy.id);
    if (options.withContent === false) table.clearAllCells();
    return table;
  }

  /**
   * Take a table off its sheet.
   *
   * The archives stay in the package, as everywhere else here; what removes
   * the table is the sheet no longer listing it.
   */
  removeTable(sheetId: bigint, tableInfoId: bigint): boolean {
    return this.sheetContainer(sheetId).remove(tableInfoId);
  }

  /** The table a copy should be based on when the caller names none. */
  private defaultTableSource(sheetId: bigint): bigint | undefined {
    const onSheet = this.sheetContainer(sheetId)
      .ids()
      .find((id) => this.store.object(id)?.type === TST_TYPE.TABLE_INFO);
    if (onSheet !== undefined) return onSheet;
    for (const { obj } of this.store.allObjects()) {
      if (obj.type === TST_TYPE.TABLE_INFO) return obj.identifier;
    }
    return undefined;
  }

  /**
   * A table name free on this sheet.
   *
   * Scoped to the sheet, not the document: Numbers lets two sheets each
   * have a "Table 1", and forcing global uniqueness would rename tables
   * that were never in conflict.
   */
  private uniqueTableName(preferred: string | undefined, sheetId: bigint, exclude: bigint): string {
    const used = new Set(
      this.tablesOnSheet(sheetId)
        .filter((table) => table.infoObject?.identifier !== exclude)
        .map((table) => table.name)
        .filter((name): name is string => name !== undefined),
    );
    const base = preferred ?? "Table";
    if (!used.has(base)) return base;
    for (let n = 2; ; n++) {
      const candidate = `${base} ${n}`;
      if (!used.has(candidate)) return candidate;
    }
  }

  /** Numbers requires distinct sheet names; suffix until one is free. */
  private uniqueSheetName(preferred: string | undefined, taken: readonly SheetInfo[]): string {
    const used = new Set(taken.map((s) => s.name).filter((n): n is string => n !== undefined));
    const base = preferred ?? "Sheet";
    if (!used.has(base)) return base;
    for (let n = 2; ; n++) {
      const candidate = `${base} ${n}`;
      if (!used.has(candidate)) return candidate;
    }
  }
}
