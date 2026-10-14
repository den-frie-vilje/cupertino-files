/**
 * A text box written from a donor.
 *
 * No document in the corpus was built from nothing, and a text box is a
 * `TSWP.ShapeInfoArchive` over a `TSD.ShapeArchive` over a
 * `TSD.DrawableArchive`, with its own `TSWP.StorageArchive`, a path, a
 * shape style from the theme and the title and caption stand-ins every
 * drawable carries — a shape that only an app-written box states whole.
 * So a new box is a deep copy of one the document already has (the
 * container's own copy, storage included), repointed at its new parent,
 * given its text, and its rectangular path rewritten to its frame the
 * way {@link DrawableModel.setPathRectangle} explains. Keynote's blank
 * deck carries a box on its first slide; a Pages document needs one of
 * its own, which the app's templates and letterheads have.
 */
import { ShapeInfo, TSWP_TYPE } from "./schema.ts";
import { TextStorage } from "./textstorage.ts";
import { Drawable } from "../tsd/schema.ts";
import { DrawableModel, findDrawableCore } from "../tsd/drawables.ts";
import type { DrawableContainer, DrawablePlacement } from "../tsd/placement.ts";
import type { IwaObject } from "../tsp/iwa.ts";
import type { ObjectStore } from "../tsp/store.ts";
import { makeRef, refId } from "../tsp/schema.ts";

/** Whether an object is a text box: a shape-info archive flagged as one. */
export function isTextBox(object: IwaObject | undefined): boolean {
  return (
    object?.type === TSWP_TYPE.SHAPE_INFO &&
    (object.message.getBool(ShapeInfo.IS_TEXT_BOX) ?? false) &&
    object.message.has(ShapeInfo.OWNED_STORAGE)
  );
}

/** The first text box among the store's objects, or nothing. */
export function anyTextBox(store: ObjectStore): IwaObject | undefined {
  for (const { obj } of store.allObjects()) if (isTextBox(obj)) return obj;
  return undefined;
}

/**
 * Copy `donor` into `container` as a new text box saying `text`, placed
 * and sized by `placement`. A Keynote box is owned by its slide, so
 * `parentId` repoints the copy — in the archive only, since a drawable's
 * parent is never declared among its object references. A Pages floating
 * box carries no parent (45 of 45 in the corpus), so `undefined` clears
 * the field: a donor found elsewhere in the document may be a group
 * member whose parent is its group.
 */
export function addTextBoxFrom(
  store: ObjectStore,
  container: DrawableContainer,
  donor: IwaObject,
  parentId: bigint | undefined,
  text: string,
  placement: DrawablePlacement,
): DrawableModel {
  if (!isTextBox(donor)) throw new RangeError(`object ${donor.identifier} is not a text box`);
  const copy = container.addCopyOf(donor, placement);
  const core = findDrawableCore(copy.object.message);
  if (!core) throw new RangeError("copied text box has no drawable archive");
  if (parentId === undefined) core.remove(Drawable.PARENT);
  else core.setMessage(Drawable.PARENT, makeRef(parentId));
  const storageId = refId(copy.object.message, ShapeInfo.OWNED_STORAGE);
  const storage = storageId === undefined ? undefined : store.object(storageId);
  if (!storage) throw new RangeError("copied text box has no storage of its own");
  new TextStorage(store, storage).setText(text);
  const geometry = copy.geometry();
  if (
    geometry?.width !== undefined &&
    geometry.height !== undefined &&
    (placement.width !== undefined || placement.height !== undefined)
  ) {
    copy.setPathRectangle(geometry.width, geometry.height);
  }
  return copy;
}
