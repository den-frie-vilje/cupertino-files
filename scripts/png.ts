/**
 * Minimal PNG writer for generated documents: a solid-colour block,
 * 8-bit RGB, scanlines stored uncompressed inside a valid zlib wrapper.
 * Enough for a picture whose only job is to show where its edges are.
 */

const CRC_TABLE: number[] = (() => {
  const table: number[] = [];
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(payload: readonly number[]): number {
  let crc = 0xffffffff;
  for (const byte of payload) crc = CRC_TABLE[(crc ^ byte) & 0xff]! ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

const be = (v: number): number[] => [(v >>> 24) & 255, (v >>> 16) & 255, (v >>> 8) & 255, v & 255];

function chunk(type: string, body: readonly number[]): number[] {
  const name = Array.from({ length: type.length }, (_, i) => type.charCodeAt(i));
  const payload = [...name, ...body];
  return [...be(body.length), ...payload, ...be(crc32(payload))];
}

/** A solid-colour PNG block of the given pixel size. */
export function blockPng(
  width: number,
  height: number,
  rgb: readonly [number, number, number] = [0xc0, 0x39, 0x2b],
): Uint8Array {
  const raw: number[] = [];
  for (let y = 0; y < height; y++) {
    raw.push(0); // filter byte
    for (let x = 0; x < width; x++) raw.push(rgb[0], rgb[1], rgb[2]);
  }
  const ihdr = chunk("IHDR", [...be(width), ...be(height), 8, 2, 0, 0, 0]);
  const blocks: number[] = [];
  for (let at = 0; at < raw.length; at += 65535) {
    const slice = raw.slice(at, at + 65535);
    const last = at + 65535 >= raw.length ? 1 : 0;
    blocks.push(
      last,
      slice.length & 255,
      (slice.length >> 8) & 255,
      ~slice.length & 255,
      (~slice.length >> 8) & 255,
      ...slice,
    );
  }
  let a = 1;
  let b = 0;
  for (const byte of raw) {
    a = (a + byte) % 65521;
    b = (b + a) % 65521;
  }
  const idat = chunk("IDAT", [0x78, 0x01, ...blocks, ...be(((b << 16) | a) >>> 0)]);
  return new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, ...ihdr, ...idat, ...chunk("IEND", [])]);
}
