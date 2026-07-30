/**
 * Composition of the per-family reference extractors — the registry the
 * ObjectStore consults to recompute MessageInfo.object_references for dirty
 * objects. App layers extend this with their own types.
 */
import type { ReferenceExtractor } from "./store.ts";
import { TSWP_REFERENCE_EXTRACTORS } from "../tswp/schema.ts";
import { TSS_REFERENCE_EXTRACTORS } from "../tss/schema.ts";
import { TSD_REFERENCE_EXTRACTORS } from "../tsd/schema.ts";

export const SHARED_REFERENCE_EXTRACTORS: ReadonlyMap<number, ReferenceExtractor> = new Map([
  ...TSWP_REFERENCE_EXTRACTORS,
  ...TSS_REFERENCE_EXTRACTORS,
  ...TSD_REFERENCE_EXTRACTORS,
]);
