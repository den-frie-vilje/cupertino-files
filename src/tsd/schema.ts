/**
 * TSD family — the drawable layer shared by all apps: canvas objects with
 * geometry (shapes, images, movies, groups), comment storages. Field
 * numbers from proto/current/TSDArchives.proto.
 */
import type { ReferenceExtractor } from "../tsp/store.ts";
import { pushRef } from "../tsp/schema.ts";

export const TSD_TYPE = {
  IMAGE: 3005,
  COMMENT_STORAGE: 3056,
} as const;

/** TSD.DrawableArchive. */
export const Drawable = {
  GEOMETRY: 1,
  PARENT: 2,
  EXTERIOR_TEXT_WRAP: 3,
  HYPERLINK_URL: 4,
  LOCKED: 5,
  COMMENT: 6,
  ASPECT_RATIO_LOCKED: 7,
  ACCESSIBILITY_DESCRIPTION: 8,
  TITLE: 10,
  CAPTION: 11,
} as const;

/** TSD.GeometryArchive. */
export const Geometry = { POSITION: 1, SIZE: 2, FLAGS: 3, ANGLE: 4 } as const;

/** TSD.ShapeArchive. */
export const Shape = { SUPER: 1, STYLE: 2, PATHSOURCE: 3 } as const;

/**
 * TSD.ImageArchive: super = 1 (TSD.DrawableArchive, directly), style = 3
 * (TSP.Reference to a MediaStyleArchive), originalSize = 4 (TSP.Size),
 * mask = 5, naturalSize = 9, data = 11 (TSP.DataReference),
 * originalData = 13.
 */
export const Image = {
  SUPER: 1,
  STYLE: 3,
  ORIGINAL_SIZE: 4,
  MASK: 5,
  NATURAL_SIZE: 9,
  DATA: 11,
  ORIGINAL_DATA: 13,
} as const;

/**
 * TSD.CommentStorageArchive: text = 1 (string), creation_date = 2,
 * author = 3 (ref → TSK.AnnotationAuthorArchive), replies = 4.
 */
export const CommentStorage = { TEXT: 1, CREATION_DATE: 2, AUTHOR: 3, REPLIES: 4 } as const;

export const imageExtractor: ReferenceExtractor = (m) => {
  const out: bigint[] = [];
  pushRef(out, m, Image.STYLE);
  pushRef(out, m, Image.MASK);
  const drawable = m.getMessage(Image.SUPER);
  pushRef(out, drawable, Drawable.PARENT);
  pushRef(out, drawable, Drawable.COMMENT);
  pushRef(out, drawable, Drawable.TITLE);
  pushRef(out, drawable, Drawable.CAPTION);
  return out;
};

/** Extractors for TSD-owned archive types this library mutates. */
export const TSD_REFERENCE_EXTRACTORS: ReadonlyMap<number, ReferenceExtractor> = new Map([
  [TSD_TYPE.IMAGE, imageExtractor],
]);
