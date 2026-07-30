/**
 * Keynote-specific (KN family) type IDs and field numbers, layered on the
 * shared families. Field numbers from proto/keynote-14.4/KNArchives.proto;
 * see research/keynote-slides.md for the verified object graph.
 *
 * Transitions are the canonical example of app-specific behavior that does
 * NOT belong in the shared layer: they are inline on KN.SlideArchive and
 * have no counterpart in Pages or Numbers.
 */
import type { ReferenceExtractor } from "../tsp/store.ts";
import { pushRef } from "../tsp/schema.ts";
import { SHARED_REFERENCE_EXTRACTORS } from "../tsp/extractors.ts";

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
export const KNDocument = { SHOW: 2, SUPER: 3 } as const;

/** KN.ShowArchive. */
export const Show = {
  UI_STATE: 1,
  THEME: 2,
  SLIDE_TREE: 3, // inline KN.SlideTreeArchive
  SIZE: 4, // TSP.Size — the slide canvas size
  STYLESHEET: 5,
  SLIDE_NUMBERS_VISIBLE: 6,
  LOOP_PRESENTATION: 8,
  MODE: 9,
  AUTOPLAY_TRANSITION_DELAY: 10,
  AUTOPLAY_BUILD_DELAY: 11,
  IDLE_TIMER_ACTIVE: 15,
  IDLE_TIMER_DELAY: 16,
  SOUNDTRACK: 17,
  AUTOMATICALLY_PLAYS_UPON_OPEN: 18,
  SLIDE_LIST: 19,
} as const;

/** KN.SlideTreeArchive. */
export const SlideTree = { ROOT_SLIDE_NODE: 1, SLIDES: 2 } as const;

/** KN.SlideNodeArchive. */
export const SlideNode = {
  CHILDREN: 1,
  SLIDE: 2,
  IS_SKIPPED: 4,
  HAS_TRANSITION: 7,
  HAS_NOTE: 8,
  DEPTH: 21,
} as const;

/** KN.SlideArchive. */
export const Slide = {
  STYLE: 1,
  BUILDS: 2,
  /** Inline KN.TransitionArchive — always present, even for "no transition". */
  TRANSITION: 4,
  TITLE_PLACEHOLDER: 5,
  BODY_PLACEHOLDER: 6,
  OWNED_DRAWABLES: 7,
  NAME: 10,
  /** Reference to the master slide this one is based on (absent on masters). */
  TEMPLATE_SLIDE: 17,
  IN_DOCUMENT: 19,
  SLIDE_NUMBER_PLACEHOLDER: 20,
  NOTE: 27,
  OBJECT_PLACEHOLDER: 30,
  DRAWABLES_Z_ORDER: 42,
  BUILD_CHUNKS: 43,
} as const;

/** KN.NoteArchive. */
export const Note = { CONTAINED_STORAGE: 1 } as const;

/** KN.TransitionArchive → KN.TransitionAttributesArchive. */
export const Transition = { ATTRIBUTES: 2 } as const;
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
export const AnimationAttributes = {
  ANIMATION_TYPE: 1,
  EFFECT: 2,
  DURATION: 3,
  DIRECTION: 4,
  DELAY: 5,
  IS_AUTOMATIC: 6,
  COLOR: 7,
  RANDOM_NUMBER_SEED: 11,
  CUSTOM_DETAIL: 12,
} as const;

/** `effect` value meaning "no transition" (an explicit encoding, not absence). */
export const NO_TRANSITION_EFFECT = "none";

export const TimingCurve = {
  LINEAR: 1,
  EASE_IN: 2,
  EASE_OUT: 3,
  EASE_IN_EASE_OUT: 4,
  CUSTOM: 5,
} as const;

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
export const Build = { DRAWABLE: 1, TYPE: 2, ANIMATION_ATTRIBUTES: 3 } as const;

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

/** Shared extractors plus the KN types this library mutates. */
export const KEYNOTE_REFERENCE_EXTRACTORS: ReadonlyMap<number, ReferenceExtractor> = new Map([
  ...SHARED_REFERENCE_EXTRACTORS,
  [KN_TYPE.SLIDE, slideExtractor],
  [KN_TYPE.SLIDE_LEGACY_MASTER, slideExtractor],
  [KN_TYPE.SLIDE_NODE, slideNodeExtractor],
  [KN_TYPE.NOTE, noteExtractor],
]);
