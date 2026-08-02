/**
 * Keynote-specific (KN family) type IDs and field numbers, layered on the
 * shared families. Field numbers from proto/keynote-14.4/KNArchives.proto;
 * see research/keynote-slides.md for the verified object graph.
 *
 * Transitions are the canonical example of app-specific behavior that does
 * NOT belong in the shared layer: they are inline on KN.SlideArchive and
 * have no counterpart in Pages or Numbers.
 */
import { protoEnum, protoFields } from "../proto/fields.ts";
import type { ReferenceExtractor } from "../tsp/store.ts";
import { pushRef } from "../tsp/schema.ts";

export const KN_TYPE = {
  DOCUMENT: 1,
  SHOW: 2,
  UI_STATE: 3,
  SLIDE_NODE: 4,
  /** Content slides AND masters use this class; id 6 is a legacy slot. */
  SLIDE: 5,
  SLIDE_LEGACY_MASTER: 6,
  PLACEHOLDER: 7,
  BUILD: 8,
  SLIDE_STYLE: 9,
  THEME: 10,
  PLACEHOLDER_ALT: 12,
  NOTE: 15,
  BUILD_CHUNK: 153,
} as const;

/** Both slide type IDs decode as KN.SlideArchive. */
export const SLIDE_TYPES: readonly number[] = [KN_TYPE.SLIDE, KN_TYPE.SLIDE_LEGACY_MASTER];

/** KN.DocumentArchive. */
export const KNDocument = protoFields("KN.DocumentArchive", { SHOW: "show", SUPER: "super" });

/** KN.ShowArchive. */
export const Show = protoFields("KN.ShowArchive", {
  UI_STATE: "uiState",
  THEME: "theme",
  SLIDE_TREE: "slideTree", // inline KN.SlideTreeArchive
  SIZE: "size", // TSP.Size — the slide canvas size
  STYLESHEET: "stylesheet",
  SLIDE_NUMBERS_VISIBLE: "slideNumbersVisible",
  LOOP_PRESENTATION: "loop_presentation",
  MODE: "mode",
  AUTOPLAY_TRANSITION_DELAY: "autoplay_transition_delay",
  AUTOPLAY_BUILD_DELAY: "autoplay_build_delay",
  IDLE_TIMER_ACTIVE: "idle_timer_active",
  IDLE_TIMER_DELAY: "idle_timer_delay",
  SOUNDTRACK: "soundtrack",
  AUTOMATICALLY_PLAYS_UPON_OPEN: "automatically_plays_upon_open",
  SLIDE_LIST: "slideList",
});

/** KN.SlideTreeArchive. */
export const SlideTree = protoFields("KN.SlideTreeArchive", { ROOT_SLIDE_NODE: "rootSlideNode", SLIDES: "slides" });

/** KN.SlideNodeArchive. */
export const SlideNode = protoFields("KN.SlideNodeArchive", {
  CHILDREN: "children",
  SLIDE: "slide",
  IS_SKIPPED: "isSkipped",
  HAS_TRANSITION: "hasTransition",
  HAS_NOTE: "hasNote",
  DEPTH: "depth",
});

/** KN.SlideArchive. */
export const Slide = protoFields("KN.SlideArchive", {
  STYLE: "style",
  BUILDS: "builds",
  /** Inline KN.TransitionArchive — always present, even for "no transition". */
  TRANSITION: "transition",
  TITLE_PLACEHOLDER: "titlePlaceholder",
  BODY_PLACEHOLDER: "bodyPlaceholder",
  OWNED_DRAWABLES: "owned_drawables",
  NAME: "name",
  /** Reference to the master slide this one is based on (absent on masters). */
  TEMPLATE_SLIDE: "template_slide",
  IN_DOCUMENT: "inDocument",
  SLIDE_NUMBER_PLACEHOLDER: "slideNumberPlaceholder",
  NOTE: "note",
  OBJECT_PLACEHOLDER: "objectPlaceholder",
  DRAWABLES_Z_ORDER: "drawables_z_order",
  BUILD_CHUNKS: "buildChunks",
});

/** KN.NoteArchive. */
export const Note = protoFields("KN.NoteArchive", { CONTAINED_STORAGE: "containedStorage" });

/** KN.TransitionArchive → KN.TransitionAttributesArchive. */
export const Transition = protoFields("KN.TransitionArchive", { ATTRIBUTES: "attributes" });
export const TransitionAttributes = {
  ANIMATION_ATTRIBUTES: 8,
  CUSTOM_TWIST: 9,
  CUSTOM_MOSAIC_SIZE: 10,
  CUSTOM_MOSAIC_TYPE: 11,
  CUSTOM_BOUNCE: 12,
  CUSTOM_MAGIC_MOVE_FADE_UNMATCHED: 13,
  CUSTOM_TIMING_CURVE: 15,
  CUSTOM_TEXT_DELIVERY_TYPE: 16,
  CUSTOM_MOTION_BLUR: 17,
  CUSTOM_TRAVEL_DISTANCE: 18,
} as const;

/** KN.AnimationAttributesArchive — the actual transition parameters. */
export const AnimationAttributes = protoFields("KN.AnimationAttributesArchive", {
  ANIMATION_TYPE: "animation_type",
  EFFECT: "effect",
  DURATION: "duration",
  DIRECTION: "direction",
  DELAY: "delay",
  IS_AUTOMATIC: "is_automatic",
  COLOR: "color",
  RANDOM_NUMBER_SEED: "random_number_seed",
  CUSTOM_DETAIL: "custom_detail",
});

/** `effect` value meaning "no transition" (an explicit encoding, not absence). */
export const NO_TRANSITION_EFFECT = "none";

export const TimingCurve = protoEnum("KN.TransitionAttributesArchive.TransitionCustomAttributesTimingCurveType", {
  LINEAR: "TransitionCustomAttributesTimingCurveTypeLinear",
  EASE_IN: "TransitionCustomAttributesTimingCurveTypeEaseIn",
  EASE_OUT: "TransitionCustomAttributesTimingCurveTypeEaseOut",
  EASE_IN_EASE_OUT: "TransitionCustomAttributesTimingCurveTypeEaseInEaseOut",
  CUSTOM: "TransitionCustomAttributesTimingCurveTypeCustom",
});

export const TextDelivery = {
  BY_OBJECT: 1,
  BY_WORD: 2,
  BY_CHARACTER: 3,
  BY_LINE: 4,
} as const;

/** KN.PlaceholderArchive kinds. */
export const PlaceholderKind = {
  PLACEHOLDER: 0,
  SLIDE_NUMBER: 1,
  TITLE: 2,
  BODY: 3,
  OBJECT: 4,
} as const;

/** KN.BuildArchive (animation builds) — brief. */
export const Build = protoFields("KN.BuildArchive", { DRAWABLE: "drawable", TYPE: "delivery", ANIMATION_ATTRIBUTES: "duration" });

const slideExtractor: ReferenceExtractor = (m) => {
  const out: bigint[] = [];
  pushRef(out, m, Slide.STYLE);
  pushRef(out, m, Slide.BUILDS);
  pushRef(out, m, Slide.TITLE_PLACEHOLDER);
  pushRef(out, m, Slide.BODY_PLACEHOLDER);
  pushRef(out, m, Slide.OWNED_DRAWABLES);
  pushRef(out, m, Slide.TEMPLATE_SLIDE);
  pushRef(out, m, Slide.SLIDE_NUMBER_PLACEHOLDER);
  pushRef(out, m, Slide.NOTE);
  pushRef(out, m, Slide.OBJECT_PLACEHOLDER);
  pushRef(out, m, Slide.DRAWABLES_Z_ORDER);
  pushRef(out, m, Slide.BUILD_CHUNKS);
  return out;
};

const slideNodeExtractor: ReferenceExtractor = (m) => {
  const out: bigint[] = [];
  pushRef(out, m, SlideNode.CHILDREN);
  pushRef(out, m, SlideNode.SLIDE);
  return out;
};

const noteExtractor: ReferenceExtractor = (m) => {
  const out: bigint[] = [];
  pushRef(out, m, Note.CONTAINED_STORAGE);
  return out;
};

/**
 * The KN types this library mutates. Family-local on purpose: schema leaves
 * are importable from every layer, so this map must not pull in the shared
 * composition — `keynote/document.ts` merges it with
 * `SHARED_REFERENCE_EXTRACTORS`, exactly as `tsa/extractors.ts` merges the
 * shared families' own leaf maps.
 */
export const KN_REFERENCE_EXTRACTORS: ReadonlyMap<number, ReferenceExtractor> = new Map([
  [KN_TYPE.SLIDE, slideExtractor],
  [KN_TYPE.SLIDE_LEGACY_MASTER, slideExtractor],
  [KN_TYPE.SLIDE_NODE, slideNodeExtractor],
  [KN_TYPE.NOTE, noteExtractor],
]);
