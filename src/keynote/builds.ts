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
 * `docs/BLOCKERS.md` (the animated.key ask).
 */
import { protoEnum, protoFields } from "../proto/fields.ts";
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
export const BuildFields = protoFields("KN.BuildArchive", {
  DRAWABLE: "drawable",
  DELIVERY: "delivery",
  DURATION_DEPRECATED: "duration",
  ATTRIBUTES: "attributes",
  CHUNK_ID_SEED: "chunk_id_seed",
});

/** KN.BuildChunkArchive. */
export const BuildChunkFields = protoFields("KN.BuildChunkArchive", {
  BUILD: "build",
  DELAY: "delay",
  DURATION: "duration",
  AUTOMATIC: "automatic",
  REFERENT: "referent",
  BUILD_ID: "build_id",
});

/** KN.BuildAttributesArchive — the subset that describes the effect. */
export const BuildAttributesFields = protoFields("KN.BuildAttributesArchive", {
  DATABASE_ANIMATION_TYPE: "database_animationType",
  DATABASE_EFFECT: "database_effect",
  DATABASE_DIRECTION: "database_direction",
  EVENT_TRIGGER: "eventTrigger",
  DATABASE_DELAY: "database_delay",
  DATABASE_DURATION: "database_duration",
  ACTION_ROTATION_ANGLE: "action_rotationAngle",
  ACTION_ROTATION_DIRECTION: "action_rotationDirection",
  ACTION_SCALE_SIZE: "action_scaleSize",
  ACTION_COLOR_ALPHA: "action_colorAlpha",
  ACTION_ACCELERATION: "action_acceleration",
  CURVE_STYLE: "curveStyle",
  ANIMATION_ATTRIBUTES: "animationAttributes",
  CUSTOM_BOUNCE: "custom_bounce",
  CUSTOM_TEXT_DELIVERY: "custom_textDelivery",
  CUSTOM_DELIVERY_OPTION: "custom_deliveryOption",
  START_OFFSET: "startOffset",
  END_OFFSET: "endOffset",
  CUSTOM_MOTION_BLUR: "custom_motion_blur",
});

/** KN.BuildAttributesArchive.BuildAttributesTextDelivery. */
export const TextDelivery = protoEnum("KN.BuildAttributesArchive.BuildAttributesTextDelivery", {
  UNDEFINED: "kTextDeliveryUndefined",
  BY_OBJECT: "kTextDeliveryByObject",
  BY_WORD: "kTextDeliveryByWord",
  BY_CHARACTER: "kTextDeliveryByCharacter",
  BY_LINE: "kTextDeliveryByLine",
});

/** KN.BuildAttributesArchive.BuildAttributesDeliveryOption. */
export const DeliveryOption = protoEnum("KN.BuildAttributesArchive.BuildAttributesDeliveryOption", {
  UNDEFINED: "kDeliveryOptionUndefined",
  FORWARD: "kDeliveryOptionForward",
  BACKWARD: "kDeliveryOptionBackward",
  FROM_CENTER: "kDeliveryOptionFromCenter",
  FROM_EDGES: "kDeliveryOptionFromEdges",
  RANDOM: "kDeliveryOptionRandom",
});

/** KN.BuildAttributesArchive.BuildAttributesAcceleration. */
export const Acceleration = protoEnum("KN.BuildAttributesArchive.BuildAttributesAcceleration", {
  NONE: "kNone",
  EASE_IN: "kEaseIn",
  EASE_OUT: "kEaseOut",
  EASE_BOTH: "kEaseBoth",
  CUSTOM: "kCustom",
});

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
