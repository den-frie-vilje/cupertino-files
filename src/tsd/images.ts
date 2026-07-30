/**
 * TSD.ImageArchive — images placed in any iWork document, including the
 * "image filters" Pages/Keynote/Numbers expose in the Adjust Image panel
 * (`TSD.ImageAdjustmentsArchive`) and instant-alpha/shape masks.
 *
 * Adjustments are plain scalars stored alongside the original media, so
 * they are safe to read *and* write: the apps re-render from the untouched
 * source bytes plus these parameters.
 */
import type { IwaObject } from "../tsp/iwa.ts";
import type { ObjectStore } from "../tsp/store.ts";
import { RawMessage } from "../base/protobuf.ts";
import { SizeFields } from "../tsp/schema.ts";
import { DrawableModel } from "./drawables.ts";
import { Image, TSD_TYPE } from "./schema.ts";

/** TSD.ImageArchive: imageAdjustments = 14, plus the media variants. */
const IMAGE_ADJUSTMENTS = 14;
const IMAGE_ADJUSTED_DATA = 15;
const IMAGE_ENHANCED_DATA = 17;
const IMAGE_THUMBNAIL_DATA = 12;

/** TSD.ImageAdjustmentsArchive field numbers. */
export const ImageAdjustments = {
  EXPOSURE: 1,
  SATURATION: 2,
  CONTRAST: 3,
  HIGHLIGHTS: 4,
  SHADOWS: 5,
  SHARPNESS: 6,
  DENOISE: 7,
  TEMPERATURE: 8,
  TINT: 9,
  BOTTOM_LEVEL: 10,
  TOP_LEVEL: 11,
  GAMMA: 12,
  ENHANCE: 13,
  REPRESENTS_SAGE_ADJUSTMENTS: 14,
} as const;

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
