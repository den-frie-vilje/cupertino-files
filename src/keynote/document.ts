/**
 * KeynoteDocument — Apple Keynote (.key), extending the shared
 * IWorkDocument with the KN object graph: the show, its slide tree, slides
 * with their placeholders, speaker notes and transitions.
 *
 * Transitions are deliberately modeled here and not in the shared layer:
 * they are a Keynote-only concept (inline on KN.SlideArchive), unlike
 * geometry, text and styles which every app shares.
 */
import { IWorkDocument } from "../tsa/document.ts";
import { TextStorage } from "../tswp/textstorage.ts";
import { DrawableModel } from "../tsd/drawables.ts";
import { makeRef, refId, SizeFields } from "../tsp/schema.ts";
import { ShapeInfo, StorageKind, TSWP_TYPE } from "../tswp/schema.ts";
import type { IwaObject } from "../tsp/iwa.ts";
import type { RawMessage } from "../base/protobuf.ts";
import { deepCloneObject, defaultFollow } from "../tsp/clone.ts";
import { DrawableContainer } from "../tsd/placement.ts";
import type { IWorkContainer } from "../tsp/package.ts";
import type { ObjectStore } from "../tsp/store.ts";
import {
  AnimationAttributes,
  KEYNOTE_REFERENCE_EXTRACTORS,
  KN_TYPE,
  KNDocument,
  NO_TRANSITION_EFFECT,
  Note,
  Show,
  Slide,
  SlideNode,
  SlideTree,
  SLIDE_TYPES,
  Transition,
  TransitionAttributes,
} from "./schema.ts";

/** TSWP.ShapeInfoArchive.deprecated_storage, still present in older files. */
const SHAPE_DEPRECATED_STORAGE = 2;
/** KN.PlaceholderArchive.kind. */
const PLACEHOLDER_KIND = 2;

/**
 * KN.PlaceholderArchive.Kind, the enum the archive states about itself.
 *
 * Distinct from the *slide field* a placeholder hangs off: the field says
 * which role the slide is filling, the kind says what the archive is. They
 * agree in every corpus deck, and both are exposed so a disagreement is
 * visible rather than resolved silently.
 */
export const PlaceholderKind = {
  GENERIC: 0,
  SLIDE_NUMBER: 1,
  TITLE: 2,
  BODY: 3,
  OBJECT: 4,
} as const;

/** The placeholder roles a slide can carry, and the field each occupies. */
export type PlaceholderRole = "title" | "body" | "object" | "slideNumber";

const PLACEHOLDER_FIELDS: readonly (readonly [PlaceholderRole, number])[] = [
  ["title", Slide.TITLE_PLACEHOLDER],
  ["body", Slide.BODY_PLACEHOLDER],
  ["object", Slide.OBJECT_PLACEHOLDER],
  ["slideNumber", Slide.SLIDE_NUMBER_PLACEHOLDER],
];

/** Slide transition parameters, as shown in Keynote's inspector. */
export interface SlideTransition {
  /**
   * Effect identifier. `"none"` means no transition — Keynote encodes that
   * explicitly rather than omitting the transition.
   */
  effect: string;
  /** True when {@link effect} is anything other than "none". */
  enabled: boolean;
  /** Seconds. */
  duration: number | undefined;
  /** Auto-advance delay in seconds. */
  delay: number | undefined;
  /** Opaque numeric direction code (effect-specific). */
  direction: number | undefined;
  /** Start automatically rather than on click. */
  automatic: boolean | undefined;
}

export class KeynoteSlide {
  readonly document: KeynoteDocument;
  /** The KN.SlideArchive object. */
  readonly object: IwaObject;
  /** The KN.SlideNodeArchive that placed this slide in the tree. */
  readonly node: IwaObject;
  /** Presentation order, counting skipped slides. */
  readonly index: number;
  /** Outline depth (1 = top level; >1 = indented under a parent). */
  readonly depth: number;

  constructor(
    document: KeynoteDocument,
    object: IwaObject,
    node: IwaObject,
    index: number,
    depth: number,
  ) {
    this.document = document;
    this.object = object;
    this.node = node;
    this.index = index;
    this.depth = depth;
  }

  get id(): bigint {
    return this.object.identifier;
  }

  private get store(): ObjectStore {
    return this.document.store;
  }

  /** Skipped slides are retained in the file but not shown when presenting. */
  get isSkipped(): boolean {
    return this.node.message.getBool(SlideNode.IS_SKIPPED) ?? false;
  }

  /** Master/layout slides carry a name; content slides normally do not. */
  get name(): string | undefined {
    return this.object.message.getString(Slide.NAME);
  }

  /** The master (template) slide this one is based on, if any. */
  get masterId(): bigint | undefined {
    return refId(this.object.message, Slide.TEMPLATE_SLIDE);
  }

  /** Speaker-notes storage, when the slide has one. */
  notesStorage(): TextStorage | undefined {
    const note = this.store.resolve(refId(this.object.message, Slide.NOTE));
    if (!note) return undefined;
    const storage = this.store.resolve(refId(note.message, Note.CONTAINED_STORAGE));
    return storage ? new TextStorage(this.store, storage) : undefined;
  }

  /** Speaker-notes text ("" when the slide has no notes). */
  get notes(): string {
    return this.notesStorage()?.text ?? "";
  }

  set notes(text: string) {
    const storage = this.notesStorage();
    if (!storage) {
      throw new RangeError(
        `slide ${this.index} has no notes storage; creating one is not supported yet`,
      );
    }
    storage.setText(text);
  }

  /** Title placeholder text, if the slide has a title placeholder. */
  get title(): string | undefined {
    return this.placeholderText(Slide.TITLE_PLACEHOLDER);
  }

  set title(text: string) {
    this.setPlaceholderText(Slide.TITLE_PLACEHOLDER, "title", text);
  }

  /** Body placeholder text, if present. */
  get body(): string | undefined {
    return this.placeholderText(Slide.BODY_PLACEHOLDER);
  }

  set body(text: string) {
    this.setPlaceholderText(Slide.BODY_PLACEHOLDER, "body", text);
  }

  /**
   * The slide's placeholders, by role.
   *
   * A placeholder is a box the theme puts on the slide for you to fill —
   * title, body, the slide number, or a media well. It is a
   * `KN.PlaceholderArchive`, which embeds a `TSWP.ShapeInfoArchive` as its
   * `super`, so its text lives one level deeper than a plain shape's.
   *
   * Only placeholders the *slide* owns are listed. A slide showing its
   * master's title box has none of its own until something fills it, which
   * is why a slide can present a title it does not carry.
   */
  placeholders(): {
    role: PlaceholderRole;
    id: bigint;
    /** Raw `KN.PlaceholderArchive.kind`, when the archive states one. */
    kind: number | undefined;
    storage: TextStorage | undefined;
    text: string | undefined;
  }[] {
    const out: {
      role: PlaceholderRole;
      id: bigint;
      kind: number | undefined;
      storage: TextStorage | undefined;
      text: string | undefined;
    }[] = [];
    for (const [role, field] of PLACEHOLDER_FIELDS) {
      const id = refId(this.object.message, field);
      if (id === undefined) continue;
      const storage = this.placeholderStorage(field);
      out.push({
        role,
        id,
        kind: this.placeholderKind(field),
        storage,
        text: storage?.text,
      });
    }
    return out;
  }

  /** The text storage behind one placeholder role, if the slide has it. */
  placeholder(role: PlaceholderRole): TextStorage | undefined {
    const field = PLACEHOLDER_FIELDS.find(([name]) => name === role)?.[1];
    return field === undefined ? undefined : this.placeholderStorage(field);
  }

  /**
   * Set a placeholder's text.
   *
   * Only replaces text in a placeholder the slide already has. Creating one
   * means synthesizing a shape with the theme's geometry and style for that
   * role, which lives in the master — so a slide whose layout has no body
   * box is told so rather than given an unstyled one floating at the origin.
   */
  setPlaceholderText(field: number, role: string, text: string): void {
    const storage = this.placeholderStorage(field);
    if (!storage) {
      throw new RangeError(
        `slide ${this.index} has no ${role} placeholder; it may be using a layout without one, and creating placeholders is not supported`,
      );
    }
    storage.setText(text);
  }

  /**
   * Text storage of a shape-like object. KN.PlaceholderArchive embeds
   * TSWP.ShapeInfoArchive as `super` (field 1), so the storage reference
   * lives one level down; plain ShapeInfoArchives carry it directly.
   */
  private storageOfShape(object: IwaObject | undefined): TextStorage | undefined {
    if (!object) return undefined;
    const candidates = [object.message, object.message.getMessage(ShapeInfo.SUPER)];
    for (const message of candidates) {
      if (!message) continue;
      const storageId =
        refId(message, ShapeInfo.OWNED_STORAGE) ?? refId(message, SHAPE_DEPRECATED_STORAGE);
      const storage = storageId !== undefined ? this.store.object(storageId) : undefined;
      if (storage?.type === TSWP_TYPE.STORAGE) return new TextStorage(this.store, storage);
    }
    return undefined;
  }

  private placeholderStorage(field: number): TextStorage | undefined {
    return this.storageOfShape(this.store.resolve(refId(this.object.message, field)));
  }

  /** Placeholder kind (title/body/object/slide-number), when resolvable. */
  placeholderKind(field: number): number | undefined {
    const placeholder = this.store.resolve(refId(this.object.message, field));
    return placeholder?.message.getUint(PLACEHOLDER_KIND);
  }

  private placeholderText(field: number): string | undefined {
    return this.placeholderStorage(field)?.text;
  }

  /** Every text storage owned by this slide, including placeholders. */
  textStorages(): TextStorage[] {
    const out: TextStorage[] = [];
    const seen = new Set<bigint>();
    const add = (storage: TextStorage | undefined): void => {
      if (storage && !seen.has(storage.id)) {
        seen.add(storage.id);
        out.push(storage);
      }
    };
    for (const field of [
      Slide.TITLE_PLACEHOLDER,
      Slide.BODY_PLACEHOLDER,
      Slide.OBJECT_PLACEHOLDER,
      Slide.SLIDE_NUMBER_PLACEHOLDER,
    ]) {
      add(this.placeholderStorage(field));
    }
    for (const ref of this.object.message.getMessages(Slide.OWNED_DRAWABLES)) {
      add(this.storageOfShape(this.store.resolve(ref.getVarint(1))));
    }
    return out;
  }

  /**
   * The slide's drawable list, for adding, removing and reordering.
   *
   * Keynote keeps ownership and paint order in two lists, so both move
   * together — a drawable added to only the first is owned but never drawn.
   */
  container(): DrawableContainer {
    return new DrawableContainer(
      this.store,
      this.object,
      Slide.OWNED_DRAWABLES,
      Slide.DRAWABLES_Z_ORDER,
    );
  }

  /** All drawables owned by this slide, in z-order where available. */
  drawables(): DrawableModel[] {
    const order = this.object.message.getMessages(Slide.DRAWABLES_Z_ORDER);
    const refs = order.length > 0 ? order : this.object.message.getMessages(Slide.OWNED_DRAWABLES);
    const out: DrawableModel[] = [];
    for (const ref of refs) {
      const obj = this.store.resolve(ref.getVarint(1));
      if (obj) out.push(new DrawableModel(this.store, obj));
    }
    return out;
  }

  private animationAttributes() {
    const transition = this.object.message.getMessage(Slide.TRANSITION);
    const attributes = transition?.getMessage(Transition.ATTRIBUTES);
    return attributes?.getMessage(TransitionAttributes.ANIMATION_ATTRIBUTES);
  }

  /** The slide's transition. `effect === "none"` means no transition. */
  transition(): SlideTransition | undefined {
    const animation = this.animationAttributes();
    if (!animation) return undefined;
    const effect = animation.getString(AnimationAttributes.EFFECT) ?? NO_TRANSITION_EFFECT;
    return {
      effect,
      enabled: effect !== NO_TRANSITION_EFFECT,
      duration: animation.getDouble(AnimationAttributes.DURATION),
      delay: animation.getDouble(AnimationAttributes.DELAY),
      direction: animation.getUint(AnimationAttributes.DIRECTION),
      automatic: animation.getBool(AnimationAttributes.IS_AUTOMATIC),
    };
  }

  /**
   * Update the slide's transition. Only the given properties change.
   * Setting `effect: "none"` disables the transition, which is how Keynote
   * itself encodes "no transition".
   */
  setTransition(update: Partial<Omit<SlideTransition, "enabled">>): void {
    const animation = this.animationAttributes();
    if (!animation) {
      throw new RangeError(
        `slide ${this.index} has no transition attributes to update; ` +
          `creating the transition chain from scratch is not supported yet`,
      );
    }
    if (update.effect !== undefined) {
      animation.setString(AnimationAttributes.EFFECT, update.effect);
    }
    if (update.duration !== undefined) {
      animation.setDouble(AnimationAttributes.DURATION, update.duration);
    }
    if (update.delay !== undefined) {
      animation.setDouble(AnimationAttributes.DELAY, update.delay);
    }
    if (update.direction !== undefined) {
      animation.setVarint(AnimationAttributes.DIRECTION, update.direction);
    }
    if (update.automatic !== undefined) {
      animation.setBool(AnimationAttributes.IS_AUTOMATIC, update.automatic);
    }
  }

  /** Number of animation builds on this slide. */
  get buildCount(): number {
    return this.object.message.getMessages(Slide.BUILDS).length;
  }
}

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
      KEYNOTE_REFERENCE_EXTRACTORS,
    );
    const docObject = store.findByType(KN_TYPE.DOCUMENT);
    if (!docObject) throw new RangeError("KN.DocumentArchive not found — not a Keynote document?");
    return new KeynoteDocument(container, store, docObject);
  }

  /** The KN.ShowArchive object. */
  private show(): IwaObject {
    const show = this.store.resolve(refId(this.docObject.message, KNDocument.SHOW));
    if (!show) throw new RangeError("KN.ShowArchive not found");
    return show;
  }

  /** Slide canvas size in points (e.g. 1920×1080). */
  slideSize(): { width: number; height: number } | undefined {
    const size = this.show().message.getMessage(Show.SIZE);
    const width = size?.getFloat(SizeFields.WIDTH);
    const height = size?.getFloat(SizeFields.HEIGHT);
    return width !== undefined && height !== undefined ? { width, height } : undefined;
  }

  get slideNumbersVisible(): boolean {
    return this.show().message.getBool(Show.SLIDE_NUMBERS_VISIBLE) ?? false;
  }

  get loops(): boolean {
    return this.show().message.getBool(Show.LOOP_PRESENTATION) ?? false;
  }

  /**
   * Slides in presentation order.
   *
   * Handles both tree generations: modern files list every node flatly in
   * `slideTree.slides`, while the first IWA release left that empty and hung
   * the slides off `rootSlideNode.children`. Indented slides are reached via
   * each node's `children`, walked pre-order to match navigator order.
   */
  slides(): KeynoteSlide[] {
    const tree = this.show().message.getMessage(Show.SLIDE_TREE);
    if (!tree) return [];
    const out: KeynoteSlide[] = [];
    const visited = new Set<bigint>();

    const walk = (nodeId: bigint | undefined, depth: number): void => {
      if (nodeId === undefined || visited.has(nodeId)) return;
      visited.add(nodeId);
      const node = this.store.object(nodeId);
      if (!node) return;
      const slide = this.store.resolve(refId(node.message, SlideNode.SLIDE));
      if (slide && SLIDE_TYPES.includes(slide.type)) {
        const nodeDepth = node.message.getUint(SlideNode.DEPTH) ?? depth;
        out.push(new KeynoteSlide(this, slide, node, out.length, nodeDepth));
      }
      for (const child of node.message.getMessages(SlideNode.CHILDREN)) {
        walk(child.getVarint(1), depth + 1);
      }
    };

    const flat = tree.getMessages(SlideTree.SLIDES);
    if (flat.length > 0) {
      for (const ref of flat) walk(ref.getVarint(1), 1);
    } else {
      // Legacy: a container node whose children are the real slides.
      const rootId = refId(tree, SlideTree.ROOT_SLIDE_NODE);
      const root = rootId !== undefined ? this.store.object(rootId) : undefined;
      if (root && rootId !== undefined) {
        visited.add(rootId);
        for (const child of root.message.getMessages(SlideNode.CHILDREN)) {
          walk(child.getVarint(1), 1);
        }
      }
    }
    return out;
  }

  /** Slides that will actually be presented (skipped ones removed). */
  presentedSlides(): KeynoteSlide[] {
    return this.slides().filter((s) => !s.isSkipped);
  }

  /** Number of slides reachable from the slide tree. */
  slideCount(): number {
    return this.slides().length;
  }

  /**
   * Master/layout slides: SlideArchives that are not placed in the slide
   * tree. They carry a `name` and are referenced by content slides through
   * `template_slide`.
   */
  masterSlides(): { id: bigint; name: string | undefined }[] {
    const inTree = new Set(this.slides().map((s) => s.id));
    const out: { id: bigint; name: string | undefined }[] = [];
    for (const { obj } of this.store.allObjects()) {
      if (!SLIDE_TYPES.includes(obj.type) || inTree.has(obj.identifier)) continue;
      out.push({ id: obj.identifier, name: obj.message.getString(Slide.NAME) });
    }
    return out;
  }

  // ------------------------------------------------------ slide management

  /**
   * Add a slide, copying an existing one.
   *
   * Keynote slides are not blank canvases — a usable one carries a style, a
   * template-slide reference, placeholders and a transition, and inventing
   * that set from nothing produces a slide the app quietly repairs or
   * rejects. Copying an existing slide inherits a working set, which is
   * also how Keynote's own "new slide" works: it instantiates a master.
   *
   * `after` is a slide index; -1 puts the new slide first. By default the
   * copy is emptied of its drawables, giving a fresh slide on the same
   * layout; pass `withContent` to duplicate outright.
   */
  addSlide(options: { copyOf?: number; after?: number; withContent?: boolean } = {}): KeynoteSlide {
    const slides = this.slides();
    if (slides.length === 0) throw new RangeError("document has no slide to copy");
    const sourceIndex = options.copyOf ?? slides.length - 1;
    const source = slides[sourceIndex];
    if (!source) throw new RangeError(`no slide at index ${sourceIndex}`);

    const component = this.store.componentOf(source.object.identifier);
    if (!component) throw new RangeError("source slide has no component");

    // A slide's content is referenced, not held by value, so a shallow copy
    // would give two slides the same placeholders and drawables — editing
    // either would change both. Deep-clone the content and share the
    // presentation (styles, master, theme), which is what the default
    // policy in tsp/clone.ts encodes.
    const { clone: slide } = deepCloneObject(this.store, source.object, {
      follow: (object, depth) =>
        // Never follow the master: a copied slide is *based on* the same
        // layout, and cloning it would fork the layout for one slide.
        object.identifier !== source.masterId &&
        defaultFollow(object, this.store.typeNameOf(object)) &&
        depth <= 8,
    });

    if (!options.withContent) {
      slide.message.remove(Slide.OWNED_DRAWABLES);
      slide.message.remove(Slide.DRAWABLES_Z_ORDER);
      slide.message.remove(Slide.BUILDS);
      slide.message.remove(Slide.BUILD_CHUNKS);
      slide.message.remove(Slide.NOTE);
      // Placeholders are kept — they are what makes the new slide usable on
      // its layout — but emptied, so it reads as a fresh slide rather than
      // a copy of its neighbour.
      for (const field of [
        Slide.TITLE_PLACEHOLDER,
        Slide.BODY_PLACEHOLDER,
        Slide.OBJECT_PLACEHOLDER,
      ]) {
        this.storageOfPlaceholder(slide, field)?.setText("");
      }
    }

    const nodeComponent = this.store.componentOf(source.node.identifier) ?? component;
    const node = this.store.createObject(source.node.type, nodeComponent, {
      cloneFrom: source.node,
    });
    // A fresh node owns exactly one slide and no children; inheriting the
    // source's children would silently indent a copy of its whole subtree.
    node.message.remove(SlideNode.CHILDREN);
    node.message.setMessage(SlideNode.SLIDE, makeRef(slide.identifier));
    if (!options.withContent) node.message.remove(SlideNode.HAS_NOTE);

    this.insertSlideNode(node.identifier, options.after ?? sourceIndex);
    const created = this.slides().find((s) => s.id === slide.identifier);
    if (!created) throw new RangeError("slide was created but is not reachable from the tree");
    return created;
  }

  /** Duplicate a slide, content and all. */
  duplicateSlide(index: number): KeynoteSlide {
    return this.addSlide({ copyOf: index, after: index, withContent: true });
  }

  /**
   * Remove a slide from the presentation.
   *
   * Only the tree entry is removed. The slide archive itself is left in the
   * package: other objects may still reference it, and this library never
   * garbage-collects the object graph — an orphan is inert, a dangling
   * reference is not.
   */
  removeSlide(index: number): void {
    const slides = this.slides();
    const slide = slides[index];
    if (!slide) throw new RangeError(`no slide at index ${index}`);
    if (slides.length <= 1) throw new RangeError("a presentation must keep at least one slide");
    this.removeSlideNode(slide.node.identifier);
  }

  /** Move a slide to a new position in presentation order. */
  moveSlide(from: number, to: number): void {
    const slides = this.slides();
    const slide = slides[from];
    if (!slide) throw new RangeError(`no slide at index ${from}`);
    if (to < 0 || to >= slides.length) throw new RangeError(`cannot move to index ${to}`);
    if (from === to) return;
    const nodeId = slide.node.identifier;
    this.removeSlideNode(nodeId);
    // After removal the target index refers to the shortened list, so a
    // forward move lands one place earlier than the caller's index.
    this.insertSlideNode(nodeId, to > from ? to - 1 : to - 1);
  }

  /**
   * Text storage behind one of a slide's placeholder fields.
   *
   * KN.PlaceholderArchive embeds TSWP.ShapeInfoArchive as `super`, so the
   * storage reference sits one level down from the placeholder itself.
   */
  private storageOfPlaceholder(slide: IwaObject, field: number): TextStorage | undefined {
    const placeholder = this.store.resolve(refId(slide.message, field));
    if (!placeholder) return undefined;
    for (const message of [placeholder.message, placeholder.message.getMessage(ShapeInfo.SUPER)]) {
      if (!message) continue;
      // Older files keep the storage in `deprecated_storage` instead, and a
      // placeholder that reads through only one of the two silently keeps
      // the text it was supposed to clear.
      const storageId =
        refId(message, ShapeInfo.OWNED_STORAGE) ?? refId(message, SHAPE_DEPRECATED_STORAGE);
      const storage = storageId !== undefined ? this.store.object(storageId) : undefined;
      if (storage?.type === TSWP_TYPE.STORAGE) return new TextStorage(this.store, storage);
    }
    return undefined;
  }

  /** Node ids in presentation order, from whichever tree generation is in use. */
  private slideNodeOrder(): { ids: bigint[]; container: RawMessage; field: number } {
    const tree = this.show().message.getMessage(Show.SLIDE_TREE);
    if (!tree) throw new RangeError("show has no slide tree");
    const flat = tree.getMessages(SlideTree.SLIDES);
    if (flat.length > 0) {
      return {
        ids: flat.flatMap((ref) => {
          const id = ref.getVarint(1);
          return id === undefined ? [] : [id];
        }),
        container: tree,
        field: SlideTree.SLIDES,
      };
    }
    // Legacy generation: the order lives on the root node's children.
    const rootId = refId(tree, SlideTree.ROOT_SLIDE_NODE);
    const root = rootId !== undefined ? this.store.object(rootId) : undefined;
    if (!root) throw new RangeError("slide tree has neither a flat list nor a root node");
    return {
      ids: root.message.getMessages(SlideNode.CHILDREN).flatMap((ref) => {
        const id = ref.getVarint(1);
        return id === undefined ? [] : [id];
      }),
      container: root.message,
      field: SlideNode.CHILDREN,
    };
  }

  private writeSlideNodeOrder(ids: readonly bigint[]): void {
    const { container, field } = this.slideNodeOrder();
    container.setMessages(
      field,
      ids.map((id) => makeRef(id)),
    );
  }

  private insertSlideNode(nodeId: bigint, after: number): void {
    const { ids } = this.slideNodeOrder();
    const at = Math.max(0, Math.min(after + 1, ids.length));
    ids.splice(at, 0, nodeId);
    this.writeSlideNodeOrder(ids);
  }

  private removeSlideNode(nodeId: bigint): void {
    const { ids } = this.slideNodeOrder();
    this.writeSlideNodeOrder(ids.filter((id) => id !== nodeId));
  }

  /** Speaker notes of every slide, in order. */
  allNotes(): { slide: number; notes: string }[] {
    return this.slides().map((s) => ({ slide: s.index, notes: s.notes }));
  }

  /** Every NOTE-kind storage in the document. */
  noteStorages(): TextStorage[] {
    return this.textStorages(StorageKind.NOTE);
  }
}
