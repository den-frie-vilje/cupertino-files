/**
 * Keynote builds (`KN.BuildArchive`) — the per-object animations.
 *
 * A build animates one drawable on or off a slide, or animates it in place.
 * `KN.SlideArchive.builds` lists them; each names its drawable, a delivery
 * mode, and an attributes bag holding the effect and its parameters. A
 * build with several stages — text arriving line by line — additionally has
 * `KN.BuildChunkArchive`s carrying the per-stage delay and duration.
 *
 * ```proto
 * message KN.BuildArchive {                 // type 8
 *   optional TSP.Reference drawable = 1;
 *   required string delivery = 2;           // "byObject", "byWord", …
 *   required KN.BuildAttributesArchive attributes = 4;
 *   optional int32 chunk_id_seed = 5;
 * }
 * message KN.BuildChunkArchive {            // type 153
 *   optional TSP.Reference build = 1;
 *   optional double delay = 3;
 *   optional double duration = 4;
 *   optional bool automatic = 5;
 * }
 * ```
 *
 * **No fixture contains a build.** Eight Keynote decks span 2013 to 26.1 and
 * not one has an animation, so unlike everything else in this library the
 * reading here is checked against the schema alone. That distinction is
 * load-bearing, and it is why this module:
 *
 *  - reads and **edits** existing builds, where the risk is a field number
 *    being wrong and the damage is visible immediately in the app;
 *  - does **not** create builds from nothing, because a build the apps drop
 *    silently is indistinguishable from one that never existed;
 *  - exposes `effect` as the raw string Apple stores rather than an enum of
 *    invented names.
 *
 * `scripts/probe-builds.ts` prints everything a deck's builds contain, so
 * one deck with animations — made in five minutes on any Mac — either
 * confirms this reading or shows exactly where it is wrong. See
 * `docs/MANUAL-WORK.md` protocol 5.
 */
import type { IwaObject } from "../tsp/iwa.ts";
import type { ObjectStore } from "../tsp/store.ts";
import { refId } from "../tsp/schema.ts";
import { Slide } from "./schema.ts";

/** KN archive types in the build graph. */
export const BUILD_TYPE = {
  BUILD: 8,
  BUILD_CHUNK: 153,
} as const;

/** KN.BuildArchive. */
export const BuildFields = {
  DRAWABLE: 1,
  DELIVERY: 2,
  DURATION_DEPRECATED: 3,
  ATTRIBUTES: 4,
  CHUNK_ID_SEED: 5,
} as const;

/** KN.BuildChunkArchive. */
export const BuildChunkFields = {
  BUILD: 1,
  DELAY: 3,
  DURATION: 4,
  AUTOMATIC: 5,
  REFERENT: 6,
  BUILD_ID: 8,
} as const;

/** KN.BuildAttributesArchive — the subset that describes the effect. */
export const BuildAttributesFields = {
  DATABASE_ANIMATION_TYPE: 1,
  DATABASE_EFFECT: 2,
  DATABASE_DIRECTION: 3,
  EVENT_TRIGGER: 4,
  DATABASE_DELAY: 5,
  DATABASE_DURATION: 8,
  ACTION_ROTATION_ANGLE: 9,
  ACTION_ROTATION_DIRECTION: 10,
  ACTION_SCALE_SIZE: 11,
  ACTION_COLOR_ALPHA: 12,
  ACTION_ACCELERATION: 13,
  CURVE_STYLE: 14,
  ANIMATION_ATTRIBUTES: 18,
  CUSTOM_BOUNCE: 19,
  CUSTOM_TEXT_DELIVERY: 20,
  CUSTOM_DELIVERY_OPTION: 21,
  START_OFFSET: 27,
  END_OFFSET: 28,
  CUSTOM_MOTION_BLUR: 29,
} as const;

/** KN.BuildAttributesArchive.BuildAttributesTextDelivery. */
export const TextDelivery = {
  UNDEFINED: 0,
  BY_OBJECT: 1,
  BY_WORD: 2,
  BY_CHARACTER: 3,
  BY_LINE: 4,
} as const;

/** KN.BuildAttributesArchive.BuildAttributesDeliveryOption. */
export const DeliveryOption = {
  UNDEFINED: 0,
  FORWARD: 1,
  BACKWARD: 2,
  FROM_CENTER: 3,
  FROM_EDGES: 4,
  RANDOM: 5,
} as const;

/** KN.BuildAttributesArchive.BuildAttributesAcceleration. */
export const Acceleration = {
  NONE: 0,
  EASE_IN: 1,
  EASE_OUT: 2,
  EASE_BOTH: 3,
  CUSTOM: 4,
} as const;

/** One stage of a multi-part build. */
export interface BuildChunk {
  id: bigint;
  /** Seconds before this stage starts. */
  delay: number | undefined;
  duration: number | undefined;
  /** True when the stage runs without a click. */
  automatic: boolean | undefined;
}

/** A build, as far as the schema describes one. */
export interface BuildInfo {
  id: bigint;
  /** The drawable being animated. */
  drawableId: bigint | undefined;
  /**
   * How the object is delivered, as the raw string Apple stores — an enum
   * of invented names would be a guess, and this one is human-readable
   * already.
   */
  delivery: string | undefined;
  /** Effect name, from the attributes bag, when it carries one. */
  effect: string | undefined;
  duration: number | undefined;
  delay: number | undefined;
  /** One of {@link TextDelivery}, for text animated piece by piece. */
  textDelivery: number | undefined;
  /** One of {@link DeliveryOption}. */
  deliveryOption: number | undefined;
  /** Stages, for a build delivered in parts. */
  chunks: BuildChunk[];
}

export class BuildModel {
  readonly store: ObjectStore;
  readonly object: IwaObject;

  constructor(store: ObjectStore, object: IwaObject) {
    this.store = store;
    this.object = object;
  }

  get id(): bigint {
    return this.object.identifier;
  }

  private attributes(): ReturnType<IwaObject["message"]["getMessage"]> {
    return this.object.message.getMessage(BuildFields.ATTRIBUTES);
  }

  read(): BuildInfo {
    const attributes = this.attributes();
    return {
      id: this.id,
      drawableId: refId(this.object.message, BuildFields.DRAWABLE),
      delivery: this.object.message.getString(BuildFields.DELIVERY),
      effect: attributes?.getString(BuildAttributesFields.DATABASE_EFFECT),
      duration:
        attributes?.getDouble(BuildAttributesFields.DATABASE_DURATION) ??
        this.object.message.getDouble(BuildFields.DURATION_DEPRECATED),
      delay: attributes?.getDouble(BuildAttributesFields.DATABASE_DELAY),
      textDelivery: attributes?.getUint(BuildAttributesFields.CUSTOM_TEXT_DELIVERY),
      deliveryOption: attributes?.getUint(BuildAttributesFields.CUSTOM_DELIVERY_OPTION),
      chunks: this.chunks(),
    };
  }

  /**
   * The build's stages.
   *
   * Chunks reference their build rather than the other way round, so they
   * are found by scanning — a slide has a handful, and the alternative is
   * assuming a list field the schema does not have.
   */
  chunks(): BuildChunk[] {
    const out: BuildChunk[] = [];
    for (const { obj } of this.store.allObjects()) {
      if (obj.type !== BUILD_TYPE.BUILD_CHUNK) continue;
      if (refId(obj.message, BuildChunkFields.BUILD) !== this.id) continue;
      out.push({
        id: obj.identifier,
        delay: obj.message.getDouble(BuildChunkFields.DELAY),
        duration: obj.message.getDouble(BuildChunkFields.DURATION),
        automatic: obj.message.getBool(BuildChunkFields.AUTOMATIC),
      });
    }
    return out;
  }

  /**
   * Adjust an existing build's timing and delivery.
   *
   * Editing what is already there is safe in a way creation is not: the
   * fields are the ones Apple wrote, and a mistake shows up the moment the
   * deck is played. Only the properties given are changed.
   */
  set(update: {
    duration?: number;
    delay?: number;
    delivery?: string;
    textDelivery?: number;
    deliveryOption?: number;
  }): void {
    if (update.delivery !== undefined) {
      this.object.message.setString(BuildFields.DELIVERY, update.delivery);
    }
    const attributes = this.attributes();
    if (!attributes) {
      if (
        update.duration !== undefined ||
        update.delay !== undefined ||
        update.textDelivery !== undefined ||
        update.deliveryOption !== undefined
      ) {
        throw new RangeError(
          `build ${this.id} has no attributes archive; timing cannot be set without one`,
        );
      }
      return;
    }
    if (update.duration !== undefined) {
      attributes.setDouble(BuildAttributesFields.DATABASE_DURATION, update.duration);
    }
    if (update.delay !== undefined) {
      attributes.setDouble(BuildAttributesFields.DATABASE_DELAY, update.delay);
    }
    if (update.textDelivery !== undefined) {
      attributes.setVarint(BuildAttributesFields.CUSTOM_TEXT_DELIVERY, update.textDelivery);
    }
    if (update.deliveryOption !== undefined) {
      attributes.setVarint(BuildAttributesFields.CUSTOM_DELIVERY_OPTION, update.deliveryOption);
    }
  }
}

/**
 * The builds on one slide.
 *
 * Returns an empty list for a slide with no animations, which is every
 * slide in the corpus — see the module note.
 */
export function buildsOfSlide(store: ObjectStore, slide: IwaObject): BuildModel[] {
  const out: BuildModel[] = [];
  for (const ref of slide.message.getMessages(Slide.BUILDS)) {
    const object = store.resolve(ref.getVarint(1));
    if (object?.type === BUILD_TYPE.BUILD) out.push(new BuildModel(store, object));
  }
  return out;
}

/** Take a build off a slide. The archive stays; the slide stops listing it. */
export function removeBuild(slide: IwaObject, buildId: bigint): boolean {
  const kept = slide.message
    .getMessages(Slide.BUILDS)
    .filter((ref) => ref.getVarint(1) !== buildId);
  if (kept.length === slide.message.getMessages(Slide.BUILDS).length) return false;
  slide.message.setMessages(Slide.BUILDS, kept);
  slide.setObjectReferences(slide.getObjectReferences().filter((id) => id !== buildId));
  return true;
}
