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
import { refId, SizeFields } from "../tsp/schema.ts";
import { ShapeInfo, StorageKind, TSWP_TYPE } from "../tswp/schema.ts";
import type { IwaObject } from "../tsp/iwa.ts";
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

  /** Body placeholder text, if present. */
  get body(): string | undefined {
    return this.placeholderText(Slide.BODY_PLACEHOLDER);
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

  /** Speaker notes of every slide, in order. */
  allNotes(): { slide: number; notes: string }[] {
    return this.slides().map((s) => ({ slide: s.index, notes: s.notes }));
  }

  /** Every NOTE-kind storage in the document. */
  noteStorages(): TextStorage[] {
    return this.textStorages(StorageKind.NOTE);
  }
}
