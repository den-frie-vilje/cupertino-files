/** Intrinsic pixel dimensions of PNG/JPEG/GIF buffers (header sniffing only). */

export interface ImageDimensions {
  width: number;
  height: number;
  format: "png" | "jpeg" | "gif";
}

export function imageDimensions(data: Uint8Array): ImageDimensions | undefined {
  if (data.length > 24 && data[0] === 0x89 && data[1] === 0x50 && data[2] === 0x4e && data[3] === 0x47) {
    // PNG: IHDR is always the first chunk; width/height big-endian at 16/20.
    const width = (data[16]! << 24) | (data[17]! << 16) | (data[18]! << 8) | data[19]!;
    const height = (data[20]! << 24) | (data[21]! << 16) | (data[22]! << 8) | data[23]!;
    return { width: width >>> 0, height: height >>> 0, format: "png" };
  }
  if (data.length > 10 && data[0] === 0x47 && data[1] === 0x49 && data[2] === 0x46 && data[3] === 0x38) {
    // GIF87a/89a: logical screen size little-endian at 6/8.
    return { width: data[6]! | (data[7]! << 8), height: data[8]! | (data[9]! << 8), format: "gif" };
  }
  if (data.length > 4 && data[0] === 0xff && data[1] === 0xd8) {
    // JPEG: walk markers to the first SOFn frame header.
    let pos = 2;
    while (pos + 9 < data.length) {
      if (data[pos] !== 0xff) {
        pos++;
        continue;
      }
      const marker = data[pos + 1]!;
      if (marker === 0xd8 || (marker >= 0xd0 && marker <= 0xd9)) {
        pos += 2;
        continue;
      }
      const length = (data[pos + 2]! << 8) | data[pos + 3]!;
      const isSOF = marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
      if (isSOF) {
        const height = (data[pos + 5]! << 8) | data[pos + 6]!;
        const width = (data[pos + 7]! << 8) | data[pos + 8]!;
        return { width, height, format: "jpeg" };
      }
      pos += 2 + length;
    }
  }
  return undefined;
}
