/** Minimal RGBA image ops shared by Node (eval) and the extension (OffscreenCanvas ImageData). */
export interface Img { data: Uint8Array | Uint8ClampedArray; width: number; height: number }
export interface Box { x: number; y: number; w: number; h: number }

/** Bilinear resize of a crop to (outW, outH). */
export function resizeCrop(img: Img, crop: Box, outW: number, outH: number): Uint8ClampedArray {
  const out = new Uint8ClampedArray(outW * outH * 4);
  const sx = crop.w / outW, sy = crop.h / outH;
  for (let y = 0; y < outH; y++) {
    const fy = Math.min(img.height - 1, Math.max(0, crop.y + (y + 0.5) * sy - 0.5));
    const y0 = Math.floor(fy), y1 = Math.min(img.height - 1, y0 + 1), wy = fy - y0;
    for (let x = 0; x < outW; x++) {
      const fx = Math.min(img.width - 1, Math.max(0, crop.x + (x + 0.5) * sx - 0.5));
      const x0 = Math.floor(fx), x1 = Math.min(img.width - 1, x0 + 1), wx = fx - x0;
      for (let c = 0; c < 4; c++) {
        const a = img.data[(y0 * img.width + x0) * 4 + c]!, b = img.data[(y0 * img.width + x1) * 4 + c]!;
        const d = img.data[(y1 * img.width + x0) * 4 + c]!, e = img.data[(y1 * img.width + x1) * 4 + c]!;
        out[(y * outW + x) * 4 + c] = (a * (1 - wx) + b * wx) * (1 - wy) + (d * (1 - wx) + e * wx) * wy;
      }
    }
  }
  return out;
}

/** RGBA -> CHW float32 with per-channel (v/255 - mean)/std. `bgr` swaps channel order. */
export function toCHW(rgba: ArrayLike<number>, w: number, h: number, mean: number[], std: number[], scale = 1 / 255, bgr = false): Float32Array {
  const out = new Float32Array(3 * w * h);
  const plane = w * h;
  for (let i = 0; i < plane; i++) {
    for (let c = 0; c < 3; c++) {
      const src = bgr ? 2 - c : c;
      out[c * plane + i] = (rgba[i * 4 + src]! * scale - mean[c]!) / std[c]!;
    }
  }
  return out;
}

export const pad = (b: Box, p: number, W: number, H: number): Box => {
  const x = Math.max(0, Math.floor(b.x - p)), y = Math.max(0, Math.floor(b.y - p));
  return { x, y, w: Math.min(W, Math.ceil(b.x + b.w + p)) - x, h: Math.min(H, Math.ceil(b.y + b.h + p)) - y };
};

/** A6 image redaction: solid black fill (not blur - blur is reversible and OCR-readable). */
export function blackFill(img: Img, boxes: Box[], padding = 4): void {
  for (const b0 of boxes) {
    const b = pad(b0, padding, img.width, img.height);
    for (let y = b.y; y < b.y + b.h; y++) for (let x = b.x; x < b.x + b.w; x++) {
      const i = (y * img.width + x) * 4;
      img.data[i] = 0; img.data[i + 1] = 0; img.data[i + 2] = 0; img.data[i + 3] = 255;
    }
  }
}

/** Faces: coarse pixelation with 16 px cells, then a black-fill fallback is not needed for identity removal at this size. */
export function pixelate(img: Img, boxes: Box[], cell = 16, padding = 4): void {
  for (const b0 of boxes) {
    const b = pad(b0, padding, img.width, img.height);
    const c = Math.max(cell, Math.ceil(Math.max(b.w, b.h) / 6));
    for (let by = b.y; by < b.y + b.h; by += c) for (let bx = b.x; bx < b.x + b.w; bx += c) {
      const ex = Math.min(b.x + b.w, bx + c), ey = Math.min(b.y + b.h, by + c);
      const sum = [0, 0, 0]; let n = 0;
      for (let y = by; y < ey; y++) for (let x = bx; x < ex; x++) { const i = (y * img.width + x) * 4; sum[0]! += img.data[i]!; sum[1]! += img.data[i + 1]!; sum[2]! += img.data[i + 2]!; n++; }
      for (let y = by; y < ey; y++) for (let x = bx; x < ex; x++) { const i = (y * img.width + x) * 4; for (let k = 0; k < 3; k++) img.data[i + k] = sum[k]! / n; }
    }
  }
}

export function iou(a: Box, b: Box): number {
  const x1 = Math.max(a.x, b.x), y1 = Math.max(a.y, b.y), x2 = Math.min(a.x + a.w, b.x + b.w), y2 = Math.min(a.y + a.h, b.y + b.h);
  const inter = Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
  return inter / (a.w * a.h + b.w * b.h - inter || 1);
}

/** A1 pixel half: 64-bit difference hash of a region (9x8 grayscale, horizontal gradients). */
export function dHash(img: Img, region: Box = { x: 0, y: 0, w: img.width, h: img.height }): bigint {
  const px = resizeCrop(img, region, 9, 8);
  let h = 0n;
  for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
    const i = (y * 9 + x) * 4, j = i + 4;
    const a = px[i]! * 0.299 + px[i + 1]! * 0.587 + px[i + 2]! * 0.114;
    const b = px[j]! * 0.299 + px[j + 1]! * 0.587 + px[j + 2]! * 0.114;
    h = (h << 1n) | (a > b ? 1n : 0n);
  }
  return h;
}

export function hamming(a: bigint, b: bigint): number {
  let x = a ^ b, n = 0;
  while (x) { n += Number(x & 1n); x >>= 1n; }
  return n;
}

/** G2: 8x8 tile grid of dHashes; compare two grids to get dirty tiles. */
export function tileHashes(img: Img, grid = 8): bigint[] {
  const tw = img.width / grid, th = img.height / grid, out: bigint[] = [];
  for (let ty = 0; ty < grid; ty++) for (let tx = 0; tx < grid; tx++) out.push(dHash(img, { x: tx * tw, y: ty * th, w: tw, h: th }));
  return out;
}

export function dirtyTiles(prev: bigint[] | undefined, next: bigint[], W: number, H: number, grid = 8, maxDist = 2): Box[] {
  const tw = W / grid, th = H / grid, out: Box[] = [];
  next.forEach((h, i) => {
    if (!prev || hamming(prev[i]!, h) > maxDist) out.push({ x: (i % grid) * tw, y: Math.floor(i / grid) * th, w: tw, h: th });
  });
  return out;
}

export function intersects(a: Box, b: Box): boolean {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

/** G4 key: exact FNV-1a over a region's pixels (no perceptual hashing: a near-match must never reuse boxes). */
export function hashPixels(img: Img): string {
  let h1 = 0x811c9dc5, h2 = 0x01000193 ^ img.width;
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const v = d[i]! | (d[i + 1]! << 8) | (d[i + 2]! << 16);
    h1 = Math.imul(h1 ^ v, 0x01000193) >>> 0;
    h2 = Math.imul(h2 ^ (v + i), 0x5bd1e995) >>> 0;
  }
  return `${img.width}x${img.height}:${h1.toString(16)}${h2.toString(16)}`;
}
