/**
 * TSD.ImageArchive — images placed in any iWork document, including the
 * "image filters" Pages/Keynote/Numbers expose in the Adjust Image panel
 * (`TSD.ImageAdjustmentsArchive`) and instant-alpha/shape masks.
 *
 * Adjustments are plain scalars stored alongside the original media, so
 * they are safe to read *and* write: the apps re-render from the untouched
 * source bytes plus these parameters.
 */
import { protoFields } from "../proto/fields.ts";
import type { IwaObject } from "../tsp/iwa.ts";
import type { Component, ObjectStore } from "../tsp/store.ts";
import { RawMessage } from "../base/protobuf.ts";
import { makeDataRef, makeRef, Point, refId, SizeFields } from "../tsp/schema.ts";
import { imageDimensions } from "../base/imagesize.ts";
import { DrawableModel } from "./drawables.ts";
import { buildTextWrap, Drawable, Geometry, Image, TSD_TYPE } from "./schema.ts";
import { buildRectangularMask, MaskModel, rectanglePath, type ImageCrop, type Rect } from "./masks.ts";

/** TSD.ImageArchive: imageAdjustments = 14, plus the media variants. */
const IMAGE_ADJUSTMENTS = 14;
const IMAGE_ADJUSTED_DATA = 15;
const IMAGE_ENHANCED_DATA = 17;
const IMAGE_THUMBNAIL_DATA = 12;
/** `traced_path` — the source-extent outline the mask editor uses. */
const TRACED_PATH = 19;

/** TSD.ImageAdjustmentsArchive field numbers. */
export const ImageAdjustments = protoFields("TSD.ImageAdjustmentsArchive", {
  EXPOSURE: "exposure",
  SATURATION: "saturation",
  CONTRAST: "contrast",
  HIGHLIGHTS: "highlights",
  SHADOWS: "shadows",
  SHARPNESS: "sharpness",
  DENOISE: "denoise",
  TEMPERATURE: "temperature",
  TINT: "tint",
  BOTTOM_LEVEL: "bottom_level",
  TOP_LEVEL: "top_level",
  GAMMA: "gamma",
  ENHANCE: "enhance",
  REPRESENTS_SAGE_ADJUSTMENTS: "represents_sage_adjustments",
});

/**
 * The image-filter parameters as shown in the apps' Adjust Image panel.
 * All are optional — an absent value means "not adjusted".
 */
export interface ImageFilters {
  exposure?: number;
  saturation?: number;
  contrast?: number;
  highlights?: number;
  shadows?: number;
  sharpness?: number;
  denoise?: number;
  temperature?: number;
  tint?: number;
  /** Black point of the levels control. */
  bottomLevel?: number;
  /** White point of the levels control (default 1). */
  topLevel?: number;
  gamma?: number;
  /** The "Enhance" one-click auto-adjustment. */
  enhance?: boolean;
}

const FILTER_FIELDS: readonly [keyof ImageFilters, number, "float" | "bool"][] = [
  ["exposure", ImageAdjustments.EXPOSURE, "float"],
  ["saturation", ImageAdjustments.SATURATION, "float"],
  ["contrast", ImageAdjustments.CONTRAST, "float"],
  ["highlights", ImageAdjustments.HIGHLIGHTS, "float"],
  ["shadows", ImageAdjustments.SHADOWS, "float"],
  ["sharpness", ImageAdjustments.SHARPNESS, "float"],
  ["denoise", ImageAdjustments.DENOISE, "float"],
  ["temperature", ImageAdjustments.TEMPERATURE, "float"],
  ["tint", ImageAdjustments.TINT, "float"],
  ["bottomLevel", ImageAdjustments.BOTTOM_LEVEL, "float"],
  ["topLevel", ImageAdjustments.TOP_LEVEL, "float"],
  ["gamma", ImageAdjustments.GAMMA, "float"],
  ["enhance", ImageAdjustments.ENHANCE, "bool"],
];

export class ImageModel extends DrawableModel {
  constructor(store: ObjectStore, object: IwaObject) {
    if (object.type !== TSD_TYPE.IMAGE) {
      throw new RangeError(`object ${object.identifier} is not a TSD.ImageArchive`);
    }
    super(store, object);
  }

  /** Data-space identifier of the primary backing media, if any. */
  get dataId(): bigint | undefined {
    return this.object.message.getMessage(Image.DATA)?.getVarint(1);
  }

  /**
   * Every media variant this image references, in preference order:
   * the primary image, then the original, adjusted, enhanced and thumbnail
   * variants the apps keep alongside it.
   */
  dataVariants(): { role: string; dataId: bigint; fileName: string | undefined }[] {
    const roles: [string, number][] = [
      ["data", Image.DATA],
      ["originalData", Image.ORIGINAL_DATA],
      ["adjustedImageData", IMAGE_ADJUSTED_DATA],
      ["enhancedImageData", IMAGE_ENHANCED_DATA],
      ["thumbnailData", IMAGE_THUMBNAIL_DATA],
    ];
    const out: { role: string; dataId: bigint; fileName: string | undefined }[] = [];
    for (const [role, field] of roles) {
      const id = this.object.message.getMessage(field)?.getVarint(1);
      if (id !== undefined) out.push({ role, dataId: id, fileName: this.store.dataFileName(id) });
    }
    return out;
  }

  /**
   * File name of the primary backing media within `Data/`.
   *
   * Note this is `TSP.DataInfo.file_name` when set (the real on-disk name,
   * which the apps disambiguate by appending the data identifier), falling
   * back to `preferred_file_name`.
   */
  get fileName(): string | undefined {
    const id = this.dataId;
    return id === undefined ? undefined : this.store.dataFileName(id);
  }

  /**
   * True when the primary media is actually present in the package. Apple
   * documents can reference media that was never materialized (optimized
   * storage, template assets); those images render in the app but have no
   * bytes to extract here.
   */
  get isMaterialized(): boolean {
    return this.bytesFor(this.fileName) !== undefined;
  }

  private bytesFor(name: string | undefined): Uint8Array | undefined {
    if (name === undefined) return undefined;
    return (
      this.store.pendingFiles.get(`Data/${name}`) ??
      this.store.container.otherFiles().get(`Data/${name}`)
    );
  }

  /**
   * Raw bytes of the backing media. Falls back to any other materialized
   * variant (original/adjusted/enhanced/thumbnail) when the primary is not
   * present in the package; `dataSource()` reports which one was used.
   */
  data(): Uint8Array | undefined {
    for (const variant of this.dataVariants()) {
      const bytes = this.bytesFor(variant.fileName);
      if (bytes !== undefined) return bytes;
    }
    return undefined;
  }

  /** Which media variant {@link data} would return, if any. */
  dataSource(): { role: string; dataId: bigint; fileName: string | undefined } | undefined {
    for (const variant of this.dataVariants()) {
      if (this.bytesFor(variant.fileName) !== undefined) return variant;
    }
    return undefined;
  }

  /** Intrinsic pixel size recorded by the app, if present. */
  get originalSize(): { width: number; height: number } | undefined {
    const size = this.object.message.getMessage(Image.ORIGINAL_SIZE);
    const width = size?.getFloat(SizeFields.WIDTH);
    const height = size?.getFloat(SizeFields.HEIGHT);
    return width !== undefined && height !== undefined ? { width, height } : undefined;
  }

  /** True when the image is clipped by a mask (shape crop / instant alpha). */
  get hasMask(): boolean {
    return this.object.message.has(Image.MASK);
  }

  /** The mask drawable defining the crop, if the image has one. */
  mask(): MaskModel | undefined {
    const target = this.store.resolve(refId(this.object.message, Image.MASK));
    return target ? new MaskModel(this.store, target) : undefined;
  }

  /**
   * The crop, in both the spaces that matter.
   *
   * `window` is the visible rectangle in the image's own coordinates —
   * which part of the picture shows. `visible` is where that lands in the
   * image's parent, which is `image.position + mask.position` (see
   * `docs/FORMAT.md` §8.2). An uncropped image has no crop at all.
   */
  crop(): ImageCrop | undefined {
    const mask = this.mask();
    const image = this.geometry();
    const window = mask?.geometry();
    if (!mask || !image || !window) return undefined;
    const full = {
      x: image.x ?? 0,
      y: image.y ?? 0,
      width: image.width ?? 0,
      height: image.height ?? 0,
    };
    const rect = {
      x: window.x ?? 0,
      y: window.y ?? 0,
      width: window.width ?? 0,
      height: window.height ?? 0,
    };
    return {
      window: rect,
      visible: { x: full.x + rect.x, y: full.y + rect.y, width: rect.width, height: rect.height },
      full,
      isRectangular: mask.isRectangular,
    };
  }

  /**
   * Choose which part of the picture shows, in image-local points —
   * the image's *drawn* geometry space, not source pixels: an image
   * scaled to 260 pt wide crops with windows inside 260, wherever the
   * source's pixel count landed. A window outside the drawn frame is
   * one the app renders as a broken top-left crop and refuses to open
   * the mask editor on.
   *
   * The visible rectangle moves with the window: cropping to `{x: 10, …}`
   * shifts what appears on the page 10pt right, because the window is
   * positioned relative to the image. To keep the result where it was, call
   * {@link setVisibleFrame} afterwards — or use it instead, which does both.
   *
   * An image with no mask gets one, built as the rectangle Apple writes.
   */
  setCrop(window: Rect): void {
    const existing = this.mask();
    if (existing) {
      existing.setGeometry({ x: window.x, y: window.y });
      existing.setSize(window.width, window.height);
      return;
    }
    const component = this.store.componentOf(this.object.identifier);
    if (!component) {
      throw new RangeError(`image ${this.id} is not in a component; cannot add a mask`);
    }
    const mask = buildRectangularMask(this.store, window, component, {
      parentId: this.object.identifier,
    });
    this.object.message.setMessage(Image.MASK, makeRef(mask.identifier));
    // A masked image states its resize behavior: all 87 masked corpus
    // images carry aspect_ratio_locked true, and locked is stated on each
    // (false on 85). An already-locked image keeps its lock.
    const drawable = this.object.message.getMessage(Image.SUPER);
    if (drawable) {
      if (drawable.getUint(Drawable.LOCKED) === undefined) {
        drawable.setBool(Drawable.LOCKED, false);
      }
      drawable.setBool(Drawable.ASPECT_RATIO_LOCKED, true);
      this.object.message.markDirty();
    }
    this.object.setObjectReferences([
      ...new Set([...this.object.getObjectReferences(), mask.identifier]),
    ]);
  }

  /**
   * Place the cropped result at a rectangle in the parent's space.
   *
   * Keeps the same part of the picture visible: the image slides so that
   * `image.position + mask.position` lands on `frame`, and the window is
   * resized in place. This is the operation "move and resize the cropped
   * image", as opposed to {@link setCrop}'s "choose what shows".
   */
  setVisibleFrame(frame: Rect): void {
    const crop = this.crop();
    if (!crop) {
      this.setGeometry(frame);
      return;
    }
    this.setGeometry({ x: frame.x - crop.window.x, y: frame.y - crop.window.y });
    this.mask()!.setSize(frame.width, frame.height);
  }

  /**
   * Show the whole picture again.
   *
   * The mask object is left in the package — something else may reference
   * it, and this library never collects the graph — but the image no longer
   * points at it, so the full extent shows at the image's own frame. That
   * frame is larger than the crop was, which is the point.
   */
  removeCrop(): boolean {
    if (!this.hasMask) return false;
    const maskId = refId(this.object.message, Image.MASK);
    this.object.message.remove(Image.MASK);
    this.object.setObjectReferences(
      this.object.getObjectReferences().filter((id) => id !== maskId),
    );
    return true;
  }

  /** True when any image filter is applied. */
  get hasFilters(): boolean {
    return this.object.message.has(IMAGE_ADJUSTMENTS);
  }

  /** Current image-filter settings ({} when none are applied). */
  filters(): ImageFilters {
    const adjustments = this.object.message.getMessage(IMAGE_ADJUSTMENTS);
    const out: ImageFilters = {};
    if (!adjustments) return out;
    for (const [key, field, kind] of FILTER_FIELDS) {
      const value = kind === "float" ? adjustments.getFloat(field) : adjustments.getBool(field);
      if (value !== undefined) {
        (out as Record<string, number | boolean>)[key] = value;
      }
    }
    return out;
  }

  /**
   * Apply image filters. Only the properties given are changed; pass
   * `undefined` for a property to clear it. The apps re-render from the
   * untouched original media, so this is non-destructive.
   */
  setFilters(filters: ImageFilters): void {
    let adjustments = this.object.message.getMessage(IMAGE_ADJUSTMENTS);
    if (!adjustments) {
      adjustments = RawMessage.create();
      this.object.message.setMessage(IMAGE_ADJUSTMENTS, adjustments);
    }
    for (const [key, field, kind] of FILTER_FIELDS) {
      if (!(key in filters)) continue;
      const value = filters[key];
      if (value === undefined) {
        adjustments.remove(field);
      } else if (kind === "float") {
        adjustments.setFloat(field, value as number);
      } else {
        adjustments.setBool(field, value as boolean);
      }
    }
  }

  /** Remove all image filters, restoring the unadjusted rendering. */
  clearFilters(): void {
    this.object.message.remove(IMAGE_ADJUSTMENTS);
  }
}

/** All images in a document. */
export function imagesOf(store: ObjectStore): ImageModel[] {
  const out: ImageModel[] = [];
  for (const { obj } of store.allObjects()) {
    if (obj.type === TSD_TYPE.IMAGE) out.push(new ImageModel(store, obj));
  }
  return out;
}

/**
 * Build a complete `TSD.ImageArchive` the way the apps write one.
 *
 * One builder for every host: the archive is identical whether the image
 * rides a Pages text column or sits on a Keynote slide — geometry with
 * the stated flags and angle, the drawable parent, the exterior wrap,
 * locked false with the aspect ratio locked, stand-in title and caption
 * with both hidden flags stated, both sizes, the traced-path rectangle,
 * the data reference and the media style. Only the parent, the wrap
 * mode, the position and the style differ per host, so the caller names
 * those. Sizing: explicit width/height win; otherwise the intrinsic
 * dimensions (raster pixels, or a PDF's first-page MediaBox) are fitted
 * to `maxWidth` (default 400 pt).
 *
 * The caller anchors the result — a text attachment, a slide's drawable
 * lists — and declares the drawable's references its own way.
 */
export function buildImageDrawable(
  store: ObjectStore,
  component: Component,
  options: {
    data: Uint8Array;
    fileName: string;
    parentId: bigint;
    wrap: "text" | "page";
    x?: number;
    y?: number;
    width?: number;
    height?: number;
    maxWidth?: number;
    styleId?: bigint;
  },
): { image: IwaObject; dataId: bigint; width: number; height: number } {
  const { dataId } = store.addDataFile(options.data, options.fileName);

  const dims = imageDimensions(options.data);
  const maxWidth = options.maxWidth ?? 400;
  let width = options.width;
  let height = options.height;
  if (width === undefined || height === undefined) {
    const iw = dims?.width ?? 300;
    const ih = dims?.height ?? 200;
    const scale = Math.min(1, maxWidth / iw);
    width = width ?? iw * scale;
    height = height ?? ih * (width / iw);
  }

  const image = store.createObject(TSD_TYPE.IMAGE, component);
  const drawable = RawMessage.create();
  const geometry = RawMessage.create();
  const position = RawMessage.create();
  position.setFloat(Point.X, options.x ?? 0);
  position.setFloat(Point.Y, options.y ?? 0);
  const size = RawMessage.create();
  size.setFloat(SizeFields.WIDTH, width);
  size.setFloat(SizeFields.HEIGHT, height);
  geometry.setMessage(Geometry.POSITION, position);
  geometry.setMessage(Geometry.SIZE, size);
  // Flags 3 and an explicit angle are on 102 of 102 corpus inline
  // drawables, without exception.
  geometry.setVarint(Geometry.FLAGS, 3);
  geometry.setFloat(Geometry.ANGLE, 0);
  drawable.setMessage(Drawable.GEOMETRY, geometry);
  drawable.setMessage(Drawable.PARENT, makeRef(options.parentId));
  drawable.setMessage(Drawable.EXTERIOR_TEXT_WRAP, buildTextWrap(options.wrap));
  // Locked and aspect-ratio-locked are stated, not left absent: 156 of
  // 171 corpus Pages images carry exactly this pair, every masked one
  // and all 22 Keynote slide images state aspect_ratio_locked true.
  drawable.setBool(Drawable.LOCKED, false);
  drawable.setBool(Drawable.ASPECT_RATIO_LOCKED, true);
  // Title and caption point at empty stand-in archives with both hidden
  // flags stated — the unanimous shape on both hosts.
  const title = store.createObject(TSD_TYPE.STANDIN_CAPTION, component);
  const caption = store.createObject(TSD_TYPE.STANDIN_CAPTION, component);
  drawable.setMessage(Drawable.TITLE, makeRef(title.identifier));
  drawable.setMessage(Drawable.CAPTION, makeRef(caption.identifier));
  drawable.setBool(Drawable.TITLE_HIDDEN, false);
  drawable.setBool(Drawable.CAPTION_HIDDEN, false);
  image.message.setMessage(Image.SUPER, drawable);
  if (dims) {
    // `naturalSize` is the source's own extent (pixels, or a PDF's
    // points), `originalSize` the uncropped drawn frame in parent
    // points — the frame the mask editor exposes.
    const natural = RawMessage.create();
    natural.setFloat(SizeFields.WIDTH, dims.width);
    natural.setFloat(SizeFields.HEIGHT, dims.height);
    image.message.setMessage(Image.NATURAL_SIZE, natural);
    const drawn = RawMessage.create();
    drawn.setFloat(SizeFields.WIDTH, width);
    drawn.setFloat(SizeFields.HEIGHT, height);
    image.message.setMessage(Image.ORIGINAL_SIZE, drawn);
    // traced_path: the source-extent rectangle masked images carry,
    // and the mask editor's outline.
    image.message.setMessage(TRACED_PATH, rectanglePath(dims.width, dims.height));
  }
  image.message.setMessage(Image.DATA, makeDataRef(dataId));
  // An image with no style is valid, complete by the schema, and never
  // drawn. Every corpus image points at a TSD.MediaStyleArchive.
  if (options.styleId !== undefined) {
    image.message.setMessage(Image.STYLE, makeRef(options.styleId));
  }
  image.message.setVarint(Image.FLAGS, 0);
  image.message.setBool(Image.UNTAGGED_AS_GENERIC, false);
  image.setDataReferences([dataId]);
  return { image, dataId, width, height };
}
