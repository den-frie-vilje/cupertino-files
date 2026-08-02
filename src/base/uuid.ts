/**
 * Version-4 UUID strings, in the shape iWork writes them.
 *
 * Several archives correlate a text attribute with its object through a
 * UUID *string* — `TSWP.HighlightArchive.text_attribute_uuid_string` and
 * its siblings. Apple writes uppercase, hyphenated, version-4 values, and
 * the apps compare them as strings, so the format has to match exactly.
 *
 * Randomness comes from the Web Crypto API, which is a global in Node 18+
 * and every browser. Where it is missing the fallback is a counter, not
 * `Math.random`: these identifiers need to be *unique within a document*,
 * not unguessable, and a counter guarantees that where a weak PRNG only
 * makes it likely.
 */

let counter = 0n;

/** A new uppercase v4 UUID string. */
export function randomUuid(): string {
  const bytes = new Uint8Array(16);
  // Typed structurally rather than as `Crypto`: the DOM lib is not in this
  // package's compilation, and only this one method is needed.
  const webcrypto = (globalThis as { crypto?: { getRandomValues?<T>(array: T): T } }).crypto;
  if (typeof webcrypto?.getRandomValues === "function") {
    webcrypto.getRandomValues(bytes);
  } else {
    fillFromCounter(bytes);
  }
  // Version 4, variant 10xx — the bits the apps' parsers check.
  bytes[6] = (bytes[6]! & 0x0f) | 0x40;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  return formatUuid(bytes);
}

/**
 * Deterministic bytes for environments with no Web Crypto.
 *
 * Mixes a monotonic counter through a 64-bit multiplicative hash so
 * consecutive values do not differ in one byte — a UUID that is only
 * unique in its last digit still collides when a document is merged with
 * another produced the same way.
 */
function fillFromCounter(bytes: Uint8Array): void {
  const view = new DataView(bytes.buffer);
  for (const offset of [0, 8]) {
    counter = (counter + 1n) & 0xffffffffffffffffn;
    // splitmix64's finalizer: cheap, and spreads a counter across all bits.
    let x = (counter * 0x9e3779b97f4a7c15n) & 0xffffffffffffffffn;
    x ^= x >> 30n;
    x = (x * 0xbf58476d1ce4e5b9n) & 0xffffffffffffffffn;
    x ^= x >> 27n;
    x = (x * 0x94d049bb133111ebn) & 0xffffffffffffffffn;
    x ^= x >> 31n;
    view.setBigUint64(offset, x);
  }
}

function formatUuid(bytes: Uint8Array): string {
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0").toUpperCase());
  return [
    hex.slice(0, 4).join(""),
    hex.slice(4, 6).join(""),
    hex.slice(6, 8).join(""),
    hex.slice(8, 10).join(""),
    hex.slice(10, 16).join(""),
  ].join("-");
}

/** True for the uppercase hyphenated form the apps write and compare. */
export function isUuidString(value: string): boolean {
  return /^[0-9A-F]{8}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{12}$/.test(value);
}
