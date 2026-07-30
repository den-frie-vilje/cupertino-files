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
import { tablesOf, type TableModel } from "../tst/tables.ts";
import { refId } from "../tsp/schema.ts";

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
  tables(sheetId?: bigint): TableModel[] {
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

  /** The document's sheets (id + name). */
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
}
