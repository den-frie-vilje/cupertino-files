/**
 * TSD family — the drawable layer shared by all apps: canvas objects with
 * geometry (shapes, images, movies, groups), comment storages. Field
 * numbers from proto/current/TSDArchives.proto.
 */
import { protoFields } from "../proto/fields.ts";
import type { ReferenceExtractor } from "../tsp/store.ts";
import { RawMessage } from "../base/protobuf.ts";
import { pushRef, refId } from "../tsp/schema.ts";

export const TSD_TYPE = {
  IMAGE: 3005,
  MASK: 3006,
  COMMENT_STORAGE: 3056,
  /** Empty placeholder a drawable's title/caption references point at. */
  STANDIN_CAPTION: 3097,
} as const;

/** TSD.DrawableArchive. */
export const Drawable = protoFields("TSD.DrawableArchive", {
  GEOMETRY: "geometry",
  PARENT: "parent",
  EXTERIOR_TEXT_WRAP: "exterior_text_wrap",
  HYPERLINK_URL: "hyperlink_url",
  LOCKED: "locked",
  COMMENT: "comment",
  ASPECT_RATIO_LOCKED: "aspect_ratio_locked",
  ACCESSIBILITY_DESCRIPTION: "accessibility_description",
  TITLE: "title",
  CAPTION: "caption",
  TITLE_HIDDEN: "title_hidden",
  CAPTION_HIDDEN: "caption_hidden",
});

/** TSD.GeometryArchive. */
export const Geometry = protoFields("TSD.GeometryArchive", { POSITION: "position", SIZE: "size", FLAGS: "flags", ANGLE: "angle" });

/**
 * TSD.ExteriorTextWrapArchive — how text behaves around a drawable, and
 * on an inline attachment, whether the drawable rides the text at all.
 *
 * `type` 0 is the in-the-text-flow mode: the drawable sits in the text
 * column, moving with its indent. Every other value places it against
 * the page. Measured across the corpus's 102 inline attachments — all
 * of which carry this archive — where 0 accounts for 56 and appears on
 * none of the 175 floating drawables. Apple's own names for the values
 * appear in no published schema, so only 0 is named here.
 */
export const ExteriorTextWrap = protoFields("TSD.ExteriorTextWrapArchive", {
  TYPE: "type",
  DIRECTION: "direction",
  FIT_TYPE: "fit_type",
  MARGIN: "margin",
  ALPHA_THRESHOLD: "alpha_threshold",
  IS_HTML_WRAP: "is_html_wrap",
});

/** `exterior_text_wrap.type` value that keeps a drawable in the text flow. */
export const TEXT_WRAP_IN_FLOW = 0;

/**
 * `exterior_text_wrap.type` for a drawable placed against the page
 * rather than carried by the text — the most common non-in-flow value on
 * corpus inline images (21 of 46). Which of 1, 2, 4 and 5 Apple's menu
 * calls what is unpublished and unmeasured; only the in-flow/not
 * distinction is established.
 */
export const TEXT_WRAP_ON_PAGE = 4;

/**
 * An `exterior_text_wrap` bag in the shape Apple writes for an inline
 * image: the modal values across the corpus's 56 in-flow attachments —
 * direction 2 (56 of 56), fit_type 1, margin 12, alpha_threshold 0.5,
 * is_html_wrap false (56 of 56).
 */
export function buildTextWrap(mode: "text" | "page"): RawMessage {
  const wrap = RawMessage.create();
  wrap.setVarint(ExteriorTextWrap.TYPE, mode === "text" ? TEXT_WRAP_IN_FLOW : TEXT_WRAP_ON_PAGE);
  wrap.setVarint(ExteriorTextWrap.DIRECTION, 2);
  wrap.setVarint(ExteriorTextWrap.FIT_TYPE, 1);
  wrap.setFloat(ExteriorTextWrap.MARGIN, 12);
  wrap.setFloat(ExteriorTextWrap.ALPHA_THRESHOLD, 0.5);
  wrap.setBool(ExteriorTextWrap.IS_HTML_WRAP, false);
  return wrap;
}

/** TSD.ShapeArchive. */
export const Shape = protoFields("TSD.ShapeArchive", { SUPER: "super", STYLE: "style", PATHSOURCE: "pathsource" });

/**
 * TSD.ImageArchive: super = 1 (TSD.DrawableArchive, directly), style = 3
 * (TSP.Reference to a MediaStyleArchive), originalSize = 4 (TSP.Size),
 * mask = 5, naturalSize = 9, data = 11 (TSP.DataReference),
 * originalData = 13.
 */
export const Image = protoFields("TSD.ImageArchive", {
  SUPER: "super",
  STYLE: "style",
  ORIGINAL_SIZE: "originalSize",
  MASK: "mask",
  /** 0 in 75 of 83 corpus images; the other values are crop/adjust states. */
  FLAGS: "flags",
  NATURAL_SIZE: "naturalSize",
  DATA: "data",
  ORIGINAL_DATA: "originalData",
  /** `interpretsUntaggedImageDataAsGeneric` — false in 82 of 83. */
  UNTAGGED_AS_GENERIC: "interpretsUntaggedImageDataAsGeneric",
});

/**
 * TSD.CommentStorageArchive: text = 1 (string), creation_date = 2,
 * author = 3 (ref → TSK.AnnotationAuthorArchive), replies = 4.
 */
export const CommentStorage = protoFields("TSD.CommentStorageArchive", { TEXT: "text", CREATION_DATE: "creation_date", AUTHOR: "author", REPLIES: "replies" });

export const imageExtractor: ReferenceExtractor = (m) => {
  const out: bigint[] = [];
  pushRef(out, m, Image.STYLE);
  pushRef(out, m, Image.MASK);
  const drawable = m.getMessage(Image.SUPER);
  // **Not `parent`.** A drawable points back at its containing group or
  // canvas, and Apple never declares that: across the corpus 151 images
  // carry the field and zero list it, while every style (163/163), mask
  // (79/79), title (80/80) and caption (80/80) is declared. Eighty of those
  // parents are another component's root object.
  //
  // Same rule as `TSWP.StorageArchive` and its stylesheet: an archive
  // declares what it *resolves through*, never the container that holds it.
  // Getting it wrong there made Pages render a whole document unstyled, and
  // this is the same defect one type over — latent only because inserting an
  // image has never been opened in the app.
  pushRef(out, drawable, Drawable.COMMENT);
  pushRef(out, drawable, Drawable.TITLE);
  pushRef(out, drawable, Drawable.CAPTION);
  return out;
};

/** Extractors for TSD-owned archive types this library mutates. */
export const TSD_REFERENCE_EXTRACTORS: ReadonlyMap<number, ReferenceExtractor> = new Map([
  [TSD_TYPE.IMAGE, imageExtractor],
]);

/**
 * How deep `TSD.DrawableArchive` sits in each drawable type's super chain.
 *
 * The container rule — a drawable never declares its `parent` — was fixed
 * in {@link imageExtractor} and applies to every drawable, not just images.
 * The others have no extractor, so a copy of one falls through to the
 * generic scan in `ObjectStore.save`, which finds the parent reference and
 * declares it. Copying a grouped image produced exactly that: the mask
 * declaring the image it masks, and three shapes declaring the group they
 * are in — four back-edges Apple writes in no document here.
 *
 * A depth rather than a predicate because the chain is fixed per type and
 * guessing from shape is how a `TSD.ShapeArchive.style` (also field 2, also
 * a bare reference, and one Apple *does* declare) would get dropped.
 */
export const DRAWABLE_SUPER_DEPTH: ReadonlyMap<number, number> = new Map([
  [3004, 1], // TSD.ShapeArchive
  [3005, 1], // TSD.ImageArchive
  [3006, 1], // TSD.MaskArchive
  [3007, 1], // TSD.MovieArchive
  [3008, 1], // TSD.GroupArchive
  [2011, 2], // TSWP.ShapeInfoArchive → TSD.ShapeArchive → TSD.DrawableArchive
]);

/**
 * Measured, per type: does Apple declare the parent it carries?
 *
 * | archive | carries `parent` | declares it |
 * | --- | ---: | ---: |
 * | `TSWP.ShapeInfoArchive` | 285 | 0 |
 * | `TSD.ImageArchive` | 151 | 0 |
 * | `TSD.MaskArchive` | 79 | 0 |
 * | `TSD.GroupArchive` | 13 | 0 |
 * | `TSD.MovieArchive` | 8 | 0 |
 * | `TSD.ConnectionLineArchive` | 36 | **36** |
 *
 * The connection line is the exception and is deliberately absent from the
 * map above: it is the one drawable whose parent is not merely the box it
 * sits in — a line joins two shapes, and its parent is part of what it
 * means. Assuming the rule was uniform would have dropped 36 references
 * Apple writes, which is the direction that makes an app call a document
 * damaged.
 */

/** The `parent` a drawable of this type points at, if it has one. */
export function drawableParent(type: number, message: RawMessage): bigint | undefined {
  const depth = DRAWABLE_SUPER_DEPTH.get(type);
  if (depth === undefined) return undefined;
  let node: RawMessage | undefined = message;
  for (let i = 0; i < depth && node; i++) {
    try {
      node = node.getMessage(1);
    } catch {
      return undefined;
    }
  }
  return refId(node, Drawable.PARENT);
}
