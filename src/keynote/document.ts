/**
 * KeynoteDocument — Apple Keynote (.key), extending the shared
 * IWorkDocument with the KN object graph: the show, its slide tree, slides
 * with their placeholders, speaker notes and transitions.
 *
 * Transitions are deliberately modeled here and not in the shared layer:
 * they are a Keynote-only concept (inline on KN.SlideArchive), unlike
 * geometry, text and styles which every app shares.
 */
import { protoEnum } from "../proto/fields.ts";
import { IWorkDocument } from "../tsa/document.ts";
import { blankDonorBytes } from "./blank-donor.generated.ts";
import { TextStorage } from "../tswp/textstorage.ts";
import { chartToMarkdown, joinBlocks, storageToMarkdown, tableToMarkdown, imageToMarkdown, type MarkdownOptions } from "../tsa/markdown.ts";
import { ImageModel } from "../tsd/images.ts";
import { parseMarkdown, type ImageResolver } from "../tsa/markdown-parser.ts";
import { graftNeutralTable, uniqueTableName } from "../tsa/table-donor.ts";
import { fillTable } from "../tst/csv.ts";
import { remintTableIdentity, tablesOf, TST_TYPE, type TableModel } from "../tst/tables.ts";
import { DrawableModel } from "../tsd/drawables.ts";
import { buildImageDrawable } from "../tsd/images.ts";
import { Image, TSD_TYPE } from "../tsd/schema.ts";
import { drawableById } from "../tsd/placement.ts";
import { makeRef, pushRef, refId, SizeFields } from "../tsp/schema.ts";
import { ShapeInfo, StorageKind, TSWP_TYPE } from "../tswp/schema.ts";
import { StyleSuper } from "../tss/schema.ts";
import { readFill, writeFill, type Fill } from "../tsd/style.ts";
import type { IwaObject } from "../tsp/iwa.ts";
import { RawMessage } from "../base/protobuf.ts";
import { deepCloneObject, defaultFollow } from "../tsp/clone.ts";
import { DrawableContainer, type DrawablePlacement } from "../tsd/placement.ts";
import { addTextBoxFrom, anyTextBox, isTextBox } from "../tswp/textbox.ts";
import type { IWorkContainer } from "../tsp/package.ts";
import type { ObjectStore, ReferenceExtractor } from "../tsp/store.ts";
import { SHARED_REFERENCE_EXTRACTORS } from "../tsa/extractors.ts";
import {
  AnimationAttributes,
  KN_REFERENCE_EXTRACTORS,
  KN_TYPE,
  KNDocument,
  MASTER_ONLY_FIELDS,
  NO_TRANSITION_EFFECT,
  Note,
  Show,
  Slide,
  SlideNode,
  SlideStyle,
  SlideStyleProperties,
  SlideTree,
  SLIDE_TYPES,
  Transition,
  TransitionAttributes,
} from "./schema.ts";
import {
  BuildModel,
  buildsOfSlide,
  createBuild,
  type NewBuild,
  removeBuild,
} from "./builds.ts";

/** Shared-family extractors plus the KN types this document mutates. */
const KEYNOTE_REFERENCE_EXTRACTORS: ReadonlyMap<number, ReferenceExtractor> = new Map([
  ...SHARED_REFERENCE_EXTRACTORS,
  ...KN_REFERENCE_EXTRACTORS,
]);

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
export const PlaceholderKind = protoEnum("KN.PlaceholderArchive.Kind", {
  GENERIC: "kKindPlaceholder",
  SLIDE_NUMBER: "kKindSlideNumberPlaceholder",
  TITLE: "kKindTitlePlaceholder",
  BODY: "kKindBodyPlaceholder",
  OBJECT: "kKindObjectPlaceholder",
});

/** The placeholder roles a slide can carry, and the field each occupies. */
export type PlaceholderRole = "title" | "body" | "object" | "slideNumber";

const PLACEHOLDER_FIELDS: readonly (readonly [PlaceholderRole, number])[] = [
  ["title", Slide.TITLE_PLACEHOLDER],
  ["body", Slide.BODY_PLACEHOLDER],
  ["object", Slide.OBJECT_PLACEHOLDER],
  ["slideNumber", Slide.SLIDE_NUMBER_PLACEHOLDER],
];

/** KN.ShowArchive.KNShowMode — how the deck advances. */
export const ShowMode = protoEnum("KN.ShowArchive.KNShowMode", {
  /** Advances on click. */
  NORMAL: "kKNShowModeNormal",
  /** Self-playing, using the autoplay delays. */
  AUTOPLAY: "kKNShowModeAutoPlay",
  /** Advances only through hyperlinks — a kiosk deck. */
  HYPERLINKS_ONLY: "kKNShowModeHyperlinksOnly",
});

/** The settings behind Keynote's Document inspector. */
export interface PresentationSettings {
  /** One of {@link ShowMode}. */
  mode: number;
  loops: boolean;
  slideNumbersVisible: boolean;
  /** Seconds between slides when self-playing. */
  autoplayTransitionDelay: number;
  /** Seconds between builds when self-playing. */
  autoplayBuildDelay: number;
  /** Restart the show after a period of no input. */
  idleTimerActive: boolean;
  idleTimerDelay: number;
  /** Start presenting as soon as the deck is opened. */
  playsUponOpen: boolean;
}

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

  set isSkipped(value: boolean) {
    this.node.message.setBool(SlideNode.IS_SKIPPED, value);
  }

  /** Master/layout slides carry a name; content slides normally do not. */
  get name(): string | undefined {
    return this.object.message.getString(Slide.NAME);
  }

  /** The master (template) slide this one is based on, if any. */
  get masterId(): bigint | undefined {
    return refId(this.object.message, Slide.TEMPLATE_SLIDE);
  }

  /**
   * The slide's background fill, read up the style chain: a slide with a
   * background of its own carries a variation style whose parent is the
   * master's; one without shares the master's style outright.
   */
  background(): Fill | undefined {
    let style = this.store.resolve(refId(this.object.message, Slide.STYLE));
    for (let depth = 0; style && depth < 8; depth++) {
      const fill = readFill(
        style.message.getMessage(SlideStyle.SLIDE_PROPERTIES)?.getMessage(SlideStyleProperties.FILL),
      );
      if (fill) return fill;
      style = this.store.resolve(refId(style.message.getMessage(SlideStyle.SUPER), StyleSuper.PARENT));
    }
    return undefined;
  }

  /**
   * Set the slide's background, copying on write.
   *
   * A per-slide background is a KN.SlideStyleArchive beside the master's
   * in the stylesheet's component: unnamed, a variation whose parent is
   * the master's style and whose stylesheet is the document's, override
   * count 1, and the fill in its slide properties. Nothing lists it; the
   * slide's own reference is its only referrer. A slide already carrying
   * such a variation of its own has the fill replaced in place; one
   * sharing its style with the master, or with other slides, gets a
   * variation of its own.
   * @agentTool set_slide_background
   */
  setBackground(fill: Fill): void {
    const current = this.store.resolve(refId(this.object.message, Slide.STYLE));
    if (!current) throw new RangeError(`slide ${this.index} has no style`);
    const head = current.message.getMessage(SlideStyle.SUPER);
    const isVariation = head?.getBool(StyleSuper.IS_VARIATION) ?? false;
    const shared = this.store.referrers(current.identifier).some((id) => id !== this.id);
    if (isVariation && !shared) {
      const properties = current.message.getMessage(SlideStyle.SLIDE_PROPERTIES) ?? RawMessage.create();
      properties.setMessage(SlideStyleProperties.FILL, writeFill(fill));
      current.message.setMessage(SlideStyle.SLIDE_PROPERTIES, properties);
      return;
    }
    const component = this.store.componentOf(current.identifier);
    if (!component) throw new RangeError(`slide style ${current.identifier} has no component`);
    // Variations hang off the master's style, never off each other.
    const parent = (isVariation ? refId(head, StyleSuper.PARENT) : undefined) ?? current.identifier;
    const stylesheet = refId(head, StyleSuper.STYLESHEET);
    const message = RawMessage.create();
    const variation = RawMessage.create();
    variation.setMessage(StyleSuper.PARENT, makeRef(parent));
    variation.setBool(StyleSuper.IS_VARIATION, true);
    if (stylesheet !== undefined) variation.setMessage(StyleSuper.STYLESHEET, makeRef(stylesheet));
    message.setMessage(SlideStyle.SUPER, variation);
    message.setVarint(SlideStyle.OVERRIDE_COUNT, 1);
    const properties = RawMessage.create();
    properties.setMessage(SlideStyleProperties.FILL, writeFill(fill));
    message.setMessage(SlideStyle.SLIDE_PROPERTIES, properties);
    const style = this.store.createObject(KN_TYPE.SLIDE_STYLE, component);
    style.setMessageBytes(message.toBytes());
    this.object.message.setMessage(Slide.STYLE, makeRef(style.identifier));
    this.store.retargetReference(this.object, current.identifier, style.identifier);
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
   * The slide's animations.
   *
   * Empty for every deck in the corpus — see `src/keynote/builds.ts` for
   * why that matters to how much this claims.
   */
  builds(): BuildModel[] {
    return buildsOfSlide(this.store, this.object);
  }

  /** Take an animation off this slide. */
  removeBuild(buildId: bigint): boolean {
    return removeBuild(this.object, buildId);
  }

  /**
   * Put a text box on this slide, saying `text`, placed and sized by
   * `placement` (points; the donor's size otherwise). The box is a deep
   * copy of a text box the deck already carries — this slide's first,
   * else any slide's or master's — so it has the theme's own style, its
   * own storage and every field the app writes. Keynote has not yet been
   * seen to open a box added this way; see docs/VERIFICATION.md.
   * @agentTool add_text_box
   */
  addTextBox(text: string, placement: DrawablePlacement = {}): DrawableModel {
    const own = this.container().drawables().find((d) => isTextBox(d.object));
    const donor = own?.object ?? anyTextBox(this.store);
    if (!donor) throw new RangeError("the deck carries no text box to copy");
    return addTextBoxFrom(this.store, this.container(), donor, this.id, text, placement);
  }

  /**
   * Put a table on the slide: the neutral table every app shares (the
   * blank Numbers document's own, Apple-made), its parent the slide, in
   * both of the slide's drawable lists like the corpus's slide tables.
   * `rows` fits and fills it; `name` is made unique among the deck's
   * tables; `x` and `y` place it, else it keeps the donor's position.
   * @agentTool add_table
   */
  addTable(options: { rows?: readonly (readonly string[])[]; name?: string; x?: number; y?: number } = {}): TableModel {
    const component = this.store.componentOf(this.id);
    if (!component) throw new RangeError(`slide ${this.index} has no component`);
    const style = this.store.resolve(refId(this.object.message, Slide.STYLE));
    const stylesheetId = refId(style?.message.getMessage(SlideStyle.SUPER), StyleSuper.STYLESHEET);
    const stylesheet =
      this.document.stylesheets().find((s) => s.id === stylesheetId) ?? this.document.stylesheets()[0];
    const id = graftNeutralTable(this.store, component, this.id, stylesheet);
    this.container().attach(id);
    if (options.x !== undefined || options.y !== undefined) {
      const placement: { x?: number; y?: number } = {};
      if (options.x !== undefined) placement.x = options.x;
      if (options.y !== undefined) placement.y = options.y;
      drawableById(this.store, id)?.setGeometry(placement);
    }
    const table = tablesOf(this.store, [id])[0];
    if (!table) throw new RangeError(`grafted table ${id} did not resolve`);
    remintTableIdentity(this.store, id);
    table.name = uniqueTableName(this.document.tables().filter((t) => t.infoObject?.identifier !== id).map((t) => t.name), options.name);
    if (options.rows) fillTable(table, options.rows);
    return table;
  }

  /**
   * Animate a drawable on this slide: an all-at-once build in the shape
   * the app writes, played on click. Keynote has not yet been seen to play
   * a build this library wrote from nothing; see docs/VERIFICATION.md.
   * @agentTool add_build
   */
  addBuild(spec: NewBuild): BuildModel {
    if (spec.delivery === "byParagraph" && spec.paragraphs === undefined) {
      const storage =
        this.storageOfShape(this.store.resolve(spec.drawableId)) ??
        this.placeholderStorageOf(spec.drawableId);
      if (!storage) throw new RangeError("a by-paragraph build needs a target with text");
      return createBuild(this.store, this.object, { ...spec, paragraphs: storage.paragraphs().length });
    }
    return createBuild(this.store, this.object, spec);
  }

  /** The storage of a placeholder drawable the slide lists, by its id. */
  private placeholderStorageOf(drawableId: bigint): TextStorage | undefined {
    for (const field of [
      Slide.TITLE_PLACEHOLDER,
      Slide.BODY_PLACEHOLDER,
      Slide.OBJECT_PLACEHOLDER,
      Slide.SLIDE_NUMBER_PLACEHOLDER,
    ]) {
      if (refId(this.object.message, field) === drawableId) return this.placeholderStorage(field);
    }
    return undefined;
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
   *
   * The effect string is written verbatim, and only the app's own ids
   * take: both measured families read back from Keynote-authored decks —
   * `apple:ca-push` (CoreAnimation-class, with `direction`) and
   * `com.apple.iWork.Keynote.BLTFadeThruColor` (bespoke, with its own
   * parameter fields) — while a guessed `apple:transition/dissolve` did
   * not survive the app. Reuse an id read from a deck that has the
   * effect; no corpus fixture carries one to copy from.
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
   * How the deck plays: the settings behind Keynote's Document inspector.
   *
   * Defaults come from the schema, not from zero — every corpus deck omits
   * `slideNumbersVisible` and relies on the default, and reading an omitted
   * `autoplay_transition_delay` as 0 rather than 5 would describe a
   * self-playing deck that races through itself.
   */
  presentation(): PresentationSettings {
    const show = this.show().message;
    return {
      mode: show.getUint(Show.MODE) ?? ShowMode.NORMAL,
      loops: show.getBool(Show.LOOP_PRESENTATION) ?? false,
      slideNumbersVisible: show.getBool(Show.SLIDE_NUMBERS_VISIBLE) ?? false,
      autoplayTransitionDelay: show.getDouble(Show.AUTOPLAY_TRANSITION_DELAY) ?? 5,
      autoplayBuildDelay: show.getDouble(Show.AUTOPLAY_BUILD_DELAY) ?? 2,
      idleTimerActive: show.getBool(Show.IDLE_TIMER_ACTIVE) ?? false,
      idleTimerDelay: show.getDouble(Show.IDLE_TIMER_DELAY) ?? 900,
      playsUponOpen: show.getBool(Show.AUTOMATICALLY_PLAYS_UPON_OPEN) ?? false,
    };
  }

  /** Change how the deck plays. Only the properties given are touched. */
  setPresentation(settings: Partial<PresentationSettings>): void {
    const show = this.show().message;
    if (settings.mode !== undefined) show.setVarint(Show.MODE, settings.mode);
    if (settings.loops !== undefined) show.setBool(Show.LOOP_PRESENTATION, settings.loops);
    if (settings.slideNumbersVisible !== undefined) {
      show.setBool(Show.SLIDE_NUMBERS_VISIBLE, settings.slideNumbersVisible);
    }
    if (settings.autoplayTransitionDelay !== undefined) {
      show.setDouble(Show.AUTOPLAY_TRANSITION_DELAY, settings.autoplayTransitionDelay);
    }
    if (settings.autoplayBuildDelay !== undefined) {
      show.setDouble(Show.AUTOPLAY_BUILD_DELAY, settings.autoplayBuildDelay);
    }
    if (settings.idleTimerActive !== undefined) {
      show.setBool(Show.IDLE_TIMER_ACTIVE, settings.idleTimerActive);
    }
    if (settings.idleTimerDelay !== undefined) {
      show.setDouble(Show.IDLE_TIMER_DELAY, settings.idleTimerDelay);
    }
    if (settings.playsUponOpen !== undefined) {
      show.setBool(Show.AUTOMATICALLY_PLAYS_UPON_OPEN, settings.playsUponOpen);
    }
  }

  /**
   * Resize the slide canvas.
   *
   * Changes the coordinate space every drawable on every slide sits in, and
   * nothing is rescaled to match: a deck resized from 1920×1080 to 1024×768
   * keeps its objects where they were, which is what Keynote's own
   * "change slide size" does before you rearrange.
   * @agentTool manage_slides
   */
  setSlideSize(width: number, height: number): void {
    const show = this.show().message;
    let size = show.getMessage(Show.SIZE);
    if (!size) {
      size = RawMessage.create();
      show.setMessage(Show.SIZE, size);
    }
    size.setFloat(SizeFields.WIDTH, width);
    size.setFloat(SizeFields.HEIGHT, height);
  }

  /**
   * Slides in presentation order.
   *
   * Handles both tree generations: modern files list every node flatly in
   * `slideTree.slides`, while the first IWA release left that empty and hung
   * the slides off `rootSlideNode.children`. Indented slides are reached via
   * each node's `children`, walked pre-order to match navigator order.
   */
  /**
   * A new, empty deck built from one you supply.
   *
   * **There is no from-nothing constructor, and there will not be one.** A
   * deck is dozens of interlinked archives — theme, masters, slide styles —
   * and inventing that graph would produce a file nothing offline could
   * validate. Emptying a real one keeps every identity and master exactly
   * as an Apple app wrote it.
   *
   * One slide survives, with its text placeholders emptied. Masters are
   * untouched: they are the template.
   */
  static blankFrom(template: Uint8Array): KeynoteDocument {
    const doc = KeynoteDocument.load(template);
    for (let index = doc.slides().length - 1; index > 0; index--) doc.removeSlide(index);
    if (doc.slides().length === 0) {
      throw new RangeError("template has no slides; nothing to build a blank deck from");
    }
    for (const storage of doc.slides()[0]!.textStorages()) storage.setText("");
    doc.compact();
    return doc;
  }

  /**
   * A new deck written from Markdown: the first heading titles the blank
   * deck's title slide and every later heading adds a "Title & Bullets"
   * slide; the paragraphs and list items under a heading become that
   * slide's body, one line each, its block quotes its presenter notes
   * and its pipe tables tables on the slide; an image on a line of its
   * own lands on the slide when `images` supplies its bytes, and a
   * thematic break (`---`) starts an untitled slide. Text before any
   * heading goes on the title slide.
   */
  static fromMarkdown(markdown: string, options: { images?: ImageResolver } = {}): KeynoteDocument {
    const doc = KeynoteDocument.blank();
    let slide = doc.slides()[0]!;
    let headings = 0;
    // A thematic break asks for a slide; the next heading or content takes it.
    let pending = false;
    const newSlide = (): void => {
      slide = doc.addSlide({ master: "Title & Bullets", after: doc.slideCount() - 1 });
      pending = false;
    };
    const content = (): void => {
      if (pending) newSlide();
    };
    const body: string[] = [];
    const notes: string[] = [];
    const tables: (readonly (readonly string[])[])[] = [];
    const pictures: { data: Uint8Array; fileName: string }[] = [];
    const flush = (): void => {
      if (body.length) slide.body = body.join("\n");
      if (notes.length) slide.notes = notes.join("\n");
      for (const rows of tables) slide.addTable({ rows });
      for (const picture of pictures) doc.addImage(slide.index, picture.data, picture);
      body.length = 0;
      notes.length = 0;
      tables.length = 0;
      pictures.length = 0;
    };
    for (const block of parseMarkdown(markdown)) {
      switch (block.kind) {
        case "heading":
          flush();
          if (headings++ > 0 || pending) newSlide();
          slide.title = block.text;
          break;
        case "rule":
          flush();
          pending = true;
          break;
        case "paragraph":
          content();
          body.push(block.text);
          break;
        case "list":
          content();
          body.push(...block.items.map((item) => item.text));
          break;
        case "footnote":
          break;
        case "quote":
          content();
          notes.push(block.text);
          break;
        case "table":
          content();
          tables.push(block.rows);
          break;
        case "image": {
          content();
          const data = options.images?.(block.src);
          if (data) pictures.push({ data, fileName: block.src.split("/").pop() ?? block.src });
          break;
        }
      }
    }
    flush();
    return doc;
  }

  /**
   * A new, empty Keynote deck — one slide, 16:9 (1920 × 1080), no template
   * file needed.
   *
   * The embedded donor is an Apple-written corpus fixture emptied by
   * {@link blankFrom}, so every master, style, and identity in the "new"
   * deck was authored by an Apple app. `scripts/make-blanks.ts` records
   * its provenance.
   *
   * @agentTool create_document
   */
  static blank(): KeynoteDocument {
    return KeynoteDocument.load(blankDonorBytes());
  }

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

  /**
   * The deck as Markdown: a section per slide headed by its number and
   * title, the body's paragraphs as list items, the slide's pictures and
   * tables, the presenter notes as a block quote; then the tables on no
   * slide, and the charts.
   */
  override toMarkdown(options: MarkdownOptions = {}): string {
    const placed = new Set<bigint>();
    const slides = this.slides().map((slide) => {
      const body = slide.placeholder("body");
      const notes = slide.notes.trim();
      const own = slide.drawables();
      for (const d of own) placed.add(d.id);
      const tables = tablesOf(this.store, own.filter((d) => d.object.type === TST_TYPE.TABLE_INFO).map((d) => d.id));
      const pictures = own.filter((d) => d.object.type === TSD_TYPE.IMAGE).map((d) => new ImageModel(this.store, d.object));
      return joinBlocks([
        `## ${slide.index + 1}. ${(slide.title ?? "").trim() || "(untitled)"}`,
        body ? storageToMarkdown(body, options) : "",
        ...pictures.map((p) => imageToMarkdown(p, options)),
        ...tables.map((t) => joinBlocks([t.name ? `### ${t.name}` : "", tableToMarkdown(t)])),
        notes ? notes.split(/\r?\n/).map((line) => `> ${line}`).join("\n") : "",
      ]);
    });
    return joinBlocks([
      ...slides,
      ...this.tables()
        .filter((t) => !placed.has(t.infoObject?.identifier ?? -1n))
        .map((t) => joinBlocks([t.name ? `### ${t.name}` : "", tableToMarkdown(t)])),
      ...this.charts().map((c) => chartToMarkdown(c)),
    ]);
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
   *
   * `master` instead instantiates a layout — one of {@link masterSlides},
   * by name or id — the way the app's "add slide" does: the master is
   * deep-copied, its decorations and placeholders included, and the copy
   * is made a content slide. The corpus states the difference between a
   * content slide and its master exactly: the slide carries a reference
   * to the master, a note, and the slide-number placeholder's storage
   * holds the number attachment; it never carries the master's name,
   * object placeholder, style lists or thumbnail texts. The title and
   * body are emptied like a copied slide's.
   * @agentTool manage_slides
   */
  addSlide(
    options: { copyOf?: number; after?: number; withContent?: boolean; master?: string | bigint } = {},
  ): KeynoteSlide {
    const slides = this.slides();
    if (slides.length === 0) throw new RangeError("document has no slide to copy");
    if (options.master !== undefined) return this.addSlideFromMaster(options.master, options.after ?? slides.length - 1);
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
    //
    // Content the new slide will not keep must not be *cloned* either.
    // Cloning the note and drawables and then unlinking them left the
    // copies in the package as orphans — objects no corpus document holds,
    // which the shape audit found on this rung's first offline run.
    // A placeholder can sit in owned_drawables AND behind its own slide
    // field. The placeholder fields are kept, so anything they reach must be
    // cloned — excluding it would leave the copy's field pointing at the
    // source's placeholder, and typing into one slide would edit both.
    const kept: bigint[] = [];
    for (const field of [
      Slide.TITLE_PLACEHOLDER,
      Slide.BODY_PLACEHOLDER,
      Slide.OBJECT_PLACEHOLDER,
      Slide.SLIDE_NUMBER_PLACEHOLDER,
    ]) {
      pushRef(kept, source.object.message, field);
    }
    const excluded = new Set<bigint>();
    if (!options.withContent) {
      const stripped: bigint[] = [];
      for (const field of [
        Slide.OWNED_DRAWABLES,
        Slide.BUILDS,
        Slide.BUILD_CHUNKS,
        Slide.DRAWABLES_Z_ORDER,
      ]) {
        pushRef(stripped, source.object.message, field);
      }
      for (const id of stripped) excluded.add(id);
      for (const id of kept) excluded.delete(id);
    }
    const { clone: slide, map } = deepCloneObject(this.store, source.object, {
      follow: (object, depth) =>
        // Never follow the master: a copied slide is *based on* the same
        // layout, and cloning it would fork the layout for one slide.
        object.identifier !== source.masterId &&
        !excluded.has(object.identifier) &&
        defaultFollow(object, this.store.typeNameOf(object)) &&
        depth <= 8,
    });

    if (!options.withContent) {
      // The paint order keeps the placeholders and loses everything else.
      // Whether a placeholder appears in owned_drawables/z-order varies by
      // deck (8 of 12 in one corpus deck, 0 of 33 in another), so the copy
      // follows its own source's convention: an entry that pointed at a kept
      // placeholder survives as its clone, and the rest go. Removing the
      // lists wholesale unlisted the placeholders on decks that paint from
      // them — Keynote showed the added slide entirely empty, our written
      // title and all.
      const keptClones = new Set(kept.map((id) => map.get(id)).filter((id) => id !== undefined));
      for (const field of [Slide.OWNED_DRAWABLES, Slide.DRAWABLES_Z_ORDER]) {
        const survivors = slide.message
          .getMessages(field)
          .map((ref) => ref.getVarint(1))
          .filter((id): id is bigint => id !== undefined && keptClones.has(id));
        if (survivors.length > 0) {
          slide.message.setMessages(field, survivors.map((id) => makeRef(id)));
        } else {
          slide.message.remove(field);
        }
      }
      slide.message.remove(Slide.BUILDS);
      slide.message.remove(Slide.BUILD_CHUNKS);
      // The note stays: every corpus slide carries one, empty or not —
      // removing it is the absent-field defect class, and it left
      // `notes =` on the new slide with nothing to write into. Emptied
      // like the placeholders, it is the app's own fresh-slide shape
      // (note present, hasNote false).
      const note = this.store.resolve(refId(slide.message, Slide.NOTE));
      const noteStorage = note && this.store.resolve(refId(note.message, Note.CONTAINED_STORAGE));
      if (noteStorage) new TextStorage(this.store, noteStorage).setText("");
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
    // The hint stays present as an explicit false: every corpus node
    // carries `hasNote`, and removing a field every writer sets is the
    // absent-field defect class, not a cleanup.
    if (!options.withContent) node.message.setBool(SlideNode.HAS_NOTE, false);

    this.insertSlideNode(node.identifier, options.after ?? sourceIndex);

    // A Keynote-saved deck keeps every slide in a component of its own
    // (`Slide-<slideId>`), and Keynote refuses to save a deck where a
    // second slide squats in another slide's component: it opens and
    // renders, and autosave fails. The app-side control is the reverse
    // proof — a deck whose extra slides Keynote itself made saves fine.
    // So the copy moves into a fresh component named after it, modeled
    // on its source's: same versions and save token, and the same
    // external references, which is right because the copy shares its
    // donor's master and styles. Decks with no per-slide convention
    // (metadata-less packages) keep the clone where it was born.
    if (component.locator === `Slide-${source.object.identifier}`) {
      const fresh = this.store.createComponent(`Slide-${slide.identifier}`, component);
      if (fresh) {
        const movers = [slide.identifier, ...map.values()].filter(
          (id) => this.store.componentOf(id) === component,
        );
        this.store.moveObjectsToComponent(movers, fresh);
        // The document's own info lists each slide component at component
        // level — mirror that row for the new one.
        this.store.declareComponentDependency(nodeComponent, slide.identifier);
      }
    }

    const created = this.slides().find((s) => s.id === slide.identifier);
    if (!created) throw new RangeError("slide was created but is not reachable from the tree");
    return created;
  }

  /** A master by id, by exact name, then by case-insensitive name. */
  private resolveMaster(master: string | bigint): IwaObject {
    const masters = this.masterSlides();
    const found =
      typeof master === "bigint"
        ? masters.find((m) => m.id === master)
        : (masters.find((m) => m.name === master) ??
          masters.find((m) => m.name?.toLowerCase() === master.toLowerCase()));
    const object = found && this.store.object(found.id);
    if (!object) {
      throw new RangeError(
        `no master slide ${String(master)}; the deck offers: ${masters.map((m) => m.name ?? String(m.id)).join(", ")}`,
      );
    }
    return object;
  }

  private addSlideFromMaster(master: string | bigint, after: number): KeynoteSlide {
    const masterObject = this.resolveMaster(master);
    const slides = this.slides();
    // The slide the new one is modelled on for what a master lacks: a
    // note and a per-slide component.
    const model = slides[Math.max(0, Math.min(after, slides.length - 1))]!;
    const modelComponent = this.store.componentOf(model.object.identifier);
    if (!modelComponent) throw new RangeError("slide has no component");

    // The object placeholder stays the master's: no content slide carries
    // one, and cloning it would leave an orphan.
    const excluded = new Set<bigint>();
    const objectPlaceholder = refId(masterObject.message, Slide.OBJECT_PLACEHOLDER);
    if (objectPlaceholder !== undefined) excluded.add(objectPlaceholder);
    const { clone: slide, map } = deepCloneObject(this.store, masterObject, {
      follow: (object, depth) =>
        !excluded.has(object.identifier) && defaultFollow(object, this.store.typeNameOf(object)) && depth <= 8,
    });
    for (const field of MASTER_ONLY_FIELDS) slide.message.remove(field);
    slide.message.setMessage(Slide.TEMPLATE_SLIDE, makeRef(masterObject.identifier));
    for (const field of [Slide.OWNED_DRAWABLES, Slide.DRAWABLES_Z_ORDER]) {
      const kept = slide.message
        .getMessages(field)
        .map((ref) => ref.getVarint(1))
        .filter((id): id is bigint => id !== undefined && !excluded.has(id));
      if (kept.length > 0) slide.message.setMessages(field, kept.map((id) => makeRef(id)));
      else slide.message.remove(field);
    }
    for (const field of [Slide.TITLE_PLACEHOLDER, Slide.BODY_PLACEHOLDER]) {
      this.storageOfPlaceholder(slide, field)?.setText("");
    }
    // A content slide's slide-number placeholder holds the number
    // attachment (40 of 44 in the corpus, the rest emptied by hand); the
    // master's holds nothing.
    const number = this.storageOfPlaceholder(slide, Slide.SLIDE_NUMBER_PLACEHOLDER);
    if (number && number.text === "") number.insertPageNumber(0);

    // The note: the model slide's, copied and emptied.
    const noteIds: bigint[] = [];
    const modelNote = this.store.resolve(refId(model.object.message, Slide.NOTE));
    if (modelNote) {
      const { clone: note, map: noteMap } = deepCloneObject(this.store, modelNote);
      const storage = this.store.resolve(refId(note.message, Note.CONTAINED_STORAGE));
      if (storage) new TextStorage(this.store, storage).setText("");
      slide.message.setMessage(Slide.NOTE, makeRef(note.identifier));
      noteIds.push(...noteMap.values());
    }

    const nodeComponent = this.store.componentOf(model.node.identifier) ?? modelComponent;
    const node = this.store.createObject(model.node.type, nodeComponent, { cloneFrom: model.node });
    node.message.remove(SlideNode.CHILDREN);
    node.message.setMessage(SlideNode.SLIDE, makeRef(slide.identifier));
    node.message.setBool(SlideNode.HAS_NOTE, false);
    this.insertSlideNode(node.identifier, after);

    // Per-slide components, as addSlide keeps them: the clones were born
    // beside the master and the note beside its model, and all of them
    // move into a component of the slide's own, modelled on a content
    // slide's rather than the master's.
    if (modelComponent.locator === `Slide-${model.object.identifier}`) {
      const fresh = this.store.createComponent(`Slide-${slide.identifier}`, modelComponent);
      if (fresh) {
        this.store.moveObjectsToComponent([slide.identifier, ...map.values(), ...noteIds], fresh);
        this.store.declareComponentDependency(nodeComponent, slide.identifier);
      }
    }

    const created = this.slides().find((s) => s.id === slide.identifier);
    if (!created) throw new RangeError("slide was created but is not reachable from the tree");
    return created;
  }

  /**
   * Duplicate a slide, content and all.
   *
   * @agentTool manage_slides
   */
  duplicateSlide(index: number): KeynoteSlide {
    return this.addSlide({ copyOf: index, after: index, withContent: true });
  }

  /**
   * Put a picture on a slide.
   *
   * The archive is the measured slide-image shape, unanimous across the
   * corpus's 22: the drawable's parent is the slide, the exterior wrap
   * is the on-page shape, the aspect ratio is locked, stand-in title
   * and caption ride along, and the style is the theme's
   * `image-0-imageStyle` media style. The image lands in the slide's
   * own package component beside its other content and joins both
   * drawable lists — ownership and paint order. Sized like
   * `insertInlineImage`: explicit `width`/`height` win, otherwise the
   * intrinsic size is fitted to `maxWidth` (default 400 pt). Unless
   * `x`/`y` say otherwise the picture is centered on the slide.
   * @agentTool add_image
   */
  addImage(
    slideIndex: number,
    data: Uint8Array,
    options: {
      fileName: string;
      x?: number;
      y?: number;
      width?: number;
      height?: number;
      maxWidth?: number;
    },
  ): { imageId: bigint; dataId: bigint } {
    const slide = this.slides()[slideIndex];
    if (!slide) throw new RangeError(`no slide at index ${slideIndex}`);
    const component = this.store.componentOf(slide.id);
    if (!component) throw new RangeError(`slide ${slideIndex} has no component`);
    const { image, dataId, width, height } = buildImageDrawable(this.store, component, {
      data,
      fileName: options.fileName,
      parentId: slide.id,
      wrap: "page",
      width: options.width,
      height: options.height,
      maxWidth: options.maxWidth,
      styleId: this.mediaStyleId(),
    });
    slide.container().attach(image.identifier);
    const size = this.slideSize();
    drawableById(this.store, image.identifier)?.setGeometry({
      x: options.x ?? (size ? Math.max(0, (size.width - width) / 2) : 0),
      y: options.y ?? (size ? Math.max(0, (size.height - height) / 2) : 0),
    });
    return { imageId: image.identifier, dataId };
  }

  /**
   * The theme's `image-0-imageStyle`, the media style every corpus
   * slide image points at; failing the identifier, any existing image's
   * style, and failing that none — an unstyled image is valid and never
   * drawn, so the builder leaves the field off rather than invent one.
   */
  private mediaStyleId(): bigint | undefined {
    for (const sheet of this.stylesheets()) {
      const info = sheet.findByIdentifier("image-0-imageStyle");
      if (info) return info.id;
    }
    for (const { obj } of this.store.allObjects()) {
      if (obj.type !== TSD_TYPE.IMAGE) continue;
      const style = refId(obj.message, Image.STYLE);
      if (style !== undefined) return style;
    }
    return undefined;
  }

  /**
   * Remove a slide from the presentation.
   *
   * Only the tree entry is removed. The slide archive itself is left in the
   * package: other objects may still reference it, and this library never
   * garbage-collects the object graph — an orphan is inert, a dangling
   * reference is not.
   * @agentTool manage_slides
   */
  removeSlide(index: number): void {
    const slides = this.slides();
    const slide = slides[index];
    if (!slide) throw new RangeError(`no slide at index ${index}`);
    if (slides.length <= 1) throw new RangeError("a presentation must keep at least one slide");
    this.removeSlideNode(slide.node.identifier);
  }

  /**
   * Move a slide to a new position in presentation order.
   *
   * @agentTool manage_slides
   */
  moveSlide(from: number, to: number): void {
    const slides = this.slides();
    const slide = slides[from];
    if (!slide) throw new RangeError(`no slide at index ${from}`);
    if (to < 0 || to >= slides.length) throw new RangeError(`cannot move to index ${to}`);
    if (from === to) return;
    const nodeId = slide.node.identifier;
    this.removeSlideNode(nodeId);
    // Insert after the element that precedes the target position. In the
    // shortened list that predecessor sits at `to - 1` for a move in either
    // direction: backward moves leave it untouched, forward moves shift it
    // down by exactly the slot the removal freed.
    this.insertSlideNode(nodeId, to - 1);
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
