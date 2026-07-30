/**
 * Placing drawables in the containers each app uses.
 *
 * Every app holds its floating objects in a repeated list of references,
 * and every app names that list something different: a Keynote slide has
 * `owned_drawables` plus a separate z-order list, a Numbers sheet has
 * `drawable_infos`, a Pages section has `floating_drawables`. The operation
 * — put this object on that page, take it off, reorder it — is identical.
 *
 * {@link DrawableContainer} is that operation, parameterised by where the
 * list lives, so adding a shape to a slide and adding one to a sheet are
 * the same code path rather than three near-copies.
 *
 * New drawables are made by **copying** an existing one. A drawable that
 * the apps will render needs a geometry, a style, and app-specific wiring
 * that varies by kind; synthesizing that set from nothing produces objects
 * the apps quietly drop. Copying inherits a working one — the same reason
 * slides and sheets are created by copying.
 */
import type { IwaObject } from "../tsp/iwa.ts";
import type { ObjectStore } from "../tsp/store.ts";
import { makeRef, refId } from "../tsp/schema.ts";
import { deepCloneObject, defaultFollow } from "../tsp/clone.ts";
import { DrawableModel } from "./drawables.ts";
import { RawMessage, WireType } from "../base/protobuf.ts";

export interface DrawablePlacement {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  /** Radians. */
  angle?: number;
}

/**
 * A list of drawables belonging to one page, slide or sheet.
 *
 * `zOrderField` is separate where the app keeps one: Keynote records
 * ownership and paint order independently, and a drawable added to only
 * the first is owned but never drawn.
 */
export class DrawableContainer {
  readonly store: ObjectStore;
  /** The slide, sheet or section that owns the list. */
  readonly owner: IwaObject;
  private readonly listField: number;
  private readonly zOrderField: number | undefined;

  /**
   * `host` is the message the lists actually live in, when that is not the
   * owner's own message. Pages nests its floating drawables inside a
   * per-page group submessage; the object that must be marked dirty and
   * whose reference list must stay current is still the owner.
   */
  private readonly host: RawMessage | undefined;

  /**
   * Where the identifier sits inside a list entry.
   *
   * Two shapes exist. Keynote and Numbers list bare `TSP.Reference`
   * messages — the identifier is field 1 of the entry. Pages wraps each in
   * a `TP.DrawableEntry` whose field 1 is *itself* a reference, so the
   * identifier is one level further down. Reading tolerates both; writing
   * has to be told which to produce.
   */
  private readonly entryReferenceField: number | undefined;

  constructor(
    store: ObjectStore,
    owner: IwaObject,
    listField: number,
    zOrderField?: number,
    host?: RawMessage,
    entryReferenceField?: number,
  ) {
    this.store = store;
    this.owner = owner;
    this.listField = listField;
    this.zOrderField = zOrderField;
    this.host = host;
    this.entryReferenceField = entryReferenceField;
  }

  /** Identifier from a list entry, whichever of the two shapes it is. */
  private entryId(entry: RawMessage): bigint | undefined {
    if (entry.fieldWire(1) === WireType.Varint) return entry.getVarint(1);
    const field = this.entryReferenceField ?? 1;
    try {
      return entry.getMessage(field)?.getVarint(1);
    } catch {
      return undefined;
    }
  }

  private makeEntry(id: bigint): RawMessage {
    if (this.entryReferenceField === undefined) return makeRef(id);
    const entry = RawMessage.create();
    entry.setMessage(this.entryReferenceField, makeRef(id));
    return entry;
  }

  private get message(): RawMessage {
    return this.host ?? this.owner.message;
  }

  /** Object ids in the container, in the order the app stores them. */
  ids(): bigint[] {
    return this.message.getMessages(this.listField).flatMap((entry) => {
      const id = this.entryId(entry);
      return id === undefined ? [] : [id];
    });
  }

  drawables(): DrawableModel[] {
    return this.ids().flatMap((id) => {
      const object = this.store.object(id);
      return object ? [new DrawableModel(this.store, object)] : [];
    });
  }

  /**
   * Copy a drawable into this container.
   *
   * The copy is deep, so the two drawables are independent — a shallow one
   * would leave both sharing a text storage or an image reference, and
   * editing either would change the other. Styles, stylesheets and themes
   * are shared rather than copied, so the copy still looks like the
   * document it lives in.
   */
  addCopyOf(source: DrawableModel | IwaObject, placement: DrawablePlacement = {}): DrawableModel {
    const object = source instanceof DrawableModel ? source.object : source;
    const component = this.store.componentOf(this.owner.identifier);
    const { clone } = deepCloneObject(this.store, object, {
      ...(component ? { component } : {}),
      follow: (candidate, depth) =>
        defaultFollow(candidate, this.store.typeNameOf(candidate)) && depth <= 8,
    });
    const model = new DrawableModel(this.store, clone);
    if (Object.keys(placement).length > 0) model.setGeometry(placement);
    this.attach(clone.identifier);
    return model;
  }

  /** Put an existing object into this container without copying it. */
  attach(id: bigint): void {
    const ids = this.ids();
    if (!ids.includes(id)) {
      this.message.addMessage(this.listField, this.makeEntry(id));
    }
    if (this.zOrderField !== undefined) {
      const order = this.zOrder();
      if (!order.includes(id)) this.message.addMessage(this.zOrderField, this.makeEntry(id));
    }
    this.refreshOwnerReferences();
  }

  /**
   * Take a drawable out of the container.
   *
   * The object itself is left in the package: something else may still
   * reference it, and this library never garbage-collects the graph.
   */
  remove(id: bigint): boolean {
    const ids = this.ids();
    if (!ids.includes(id)) return false;
    this.writeList(
      this.listField,
      ids.filter((existing) => existing !== id),
    );
    if (this.zOrderField !== undefined) {
      this.writeList(
        this.zOrderField,
        this.zOrder().filter((existing) => existing !== id),
      );
    }
    this.refreshOwnerReferences();
    return true;
  }

  /** Paint order, where the container keeps one separately. */
  zOrder(): bigint[] {
    if (this.zOrderField === undefined) return this.ids();
    return this.message.getMessages(this.zOrderField).flatMap((entry) => {
      const id = this.entryId(entry);
      return id === undefined ? [] : [id];
    });
  }

  /** Move a drawable within the paint order; higher index paints later. */
  moveInZOrder(id: bigint, to: number): void {
    const field = this.zOrderField ?? this.listField;
    const order = this.zOrder();
    const from = order.indexOf(id);
    if (from < 0) throw new RangeError(`drawable ${id} is not in this container`);
    const bounded = Math.max(0, Math.min(to, order.length - 1));
    order.splice(from, 1);
    order.splice(bounded, 0, id);
    this.writeList(field, order);
    this.refreshOwnerReferences();
  }

  /** Send to the back / bring to the front of the paint order. */
  bringToFront(id: bigint): void {
    this.moveInZOrder(id, this.zOrder().length - 1);
  }

  sendToBack(id: bigint): void {
    this.moveInZOrder(id, 0);
  }

  private writeList(field: number, ids: readonly bigint[]): void {
    this.message.setMessages(
      field,
      ids.map((id) => this.makeEntry(id)),
    );
  }

  /**
   * Keep the owner's `object_references` in step.
   *
   * Slides, sheets and sections are not all covered by a registered
   * reference extractor, and a container whose reference list omits a
   * drawable it owns is a component the apps may fail to load lazily.
   */
  private refreshOwnerReferences(): void {
    const existing = this.owner.getObjectReferences();
    const wanted = new Set<bigint>(existing);
    for (const id of this.ids()) wanted.add(id);
    for (const id of this.zOrder()) wanted.add(id);
    // Drop ids no longer referenced anywhere in the owner's message.
    const live = new Set<bigint>([...this.ids(), ...this.zOrder()]);
    const kept = [...wanted].filter(
      (id) => live.has(id) || stillReferenced(this.owner.message, id),
    );
    this.owner.setObjectReferences(kept);
  }
}

/**
 * True when an identifier still appears as a reference inside a message.
 *
 * Used to decide whether removing a drawable from one list should also
 * drop it from the owner's reference set, or whether some other field
 * still points at it.
 */
function stillReferenced(message: RawMessage, id: bigint, depth = 0): boolean {
  if (depth > 8) return false;
  const lengthDelimited = new Set(
    message.fields.filter((field) => field.wire === WireType.Bytes).map((field) => field.no),
  );
  for (const fieldNo of lengthDelimited) {
    let children: RawMessage[];
    try {
      children = message.getMessages(fieldNo);
    } catch {
      continue; // not a submessage, e.g. a string or raw bytes
    }
    for (const child of children) {
      if (child.fields.length === 1 && child.fields[0]!.no === 1) {
        let target: bigint | undefined;
        try {
          target = child.getVarint(1);
        } catch {
          target = undefined;
        }
        if (target === id) return true;
      }
      if (stillReferenced(child, id, depth + 1)) return true;
    }
  }
  return false;
}

/** Convenience for callers holding an id rather than a container. */
export function drawableById(store: ObjectStore, id: bigint): DrawableModel | undefined {
  const object = store.object(id);
  return object ? new DrawableModel(store, object) : undefined;
}

/** Resolve a container's owner from a reference field, for app models. */
export function containerFromReference(
  store: ObjectStore,
  owner: RawMessage,
  field: number,
  listField: number,
  zOrderField?: number,
): DrawableContainer | undefined {
  const target = store.resolve(refId(owner, field));
  return target ? new DrawableContainer(store, target, listField, zOrderField) : undefined;
}
