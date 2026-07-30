/**
 * KeynoteDocument — Apple Keynote (.key), extending the shared
 * IWorkDocument. The full slide model is a later milestone; today this
 * subclass provides app detection, the shared text/stylesheet/drawable
 * machinery, slide counting and round-trip save.
 */
import { IWorkDocument } from "../model/document.ts";
import { SHARED_REFERENCE_EXTRACTORS } from "../model/schema.ts";
import type { IwaObject } from "../iwa.ts";
import type { IWorkContainer } from "../package.ts";
import type { ObjectStore } from "../store.ts";
import { KEYNOTE_TYPES } from "../registry.ts";

/** KN.DocumentArchive is type 1 in the Keynote registry. */
const KN_TYPE_DOCUMENT = 1;

export class KeynoteDocument extends IWorkDocument {
  private docObject: IwaObject;

  private constructor(container: IWorkContainer, store: ObjectStore, docObject: IwaObject) {
    super(container, store);
    this.docObject = docObject;
  }

  static load(bytes: Uint8Array): KeynoteDocument {
    const { container, store } = IWorkDocument.loadStore(
      bytes,
      "keynote",
      SHARED_REFERENCE_EXTRACTORS,
    );
    const docObject = store.findByType(KN_TYPE_DOCUMENT);
    if (!docObject) throw new RangeError("KN.DocumentArchive not found — not a Keynote document?");
    return new KeynoteDocument(container, store, docObject);
  }

  /** Count of slide archives present in the document. */
  slideCount(): number {
    let count = 0;
    for (const { obj } of this.store.allObjects()) {
      if (KEYNOTE_TYPES[obj.type]?.endsWith(".SlideArchive")) count++;
    }
    return count;
  }
}
