import type { InferenceSession, Tensor } from 'onnxruntime-common';
import { resizeCrop, toCHW, type Box, type Img } from './image';

/** Minimal ORT surface so the same code runs on onnxruntime-node and onnxruntime-web. */
export interface Ort {
  InferenceSession: { create(path: string | Uint8Array): Promise<InferenceSession> };
  Tensor: new (type: 'float32', data: Float32Array, dims: number[]) => Tensor;
}

export interface OcrLine { box: Box; text: string; confidence: number }

/**
 * A3d OCR: PP-OCRv3 DB text detector + PP-OCR English CTC recognizer.
 * Detection: ImageNet-normalized input, side multiple of 32, prob map > 0.3,
 * connected components -> boxes, expanded (DB "unclip") and scaled back.
 */
export class PaddleOcr {
  private constructor(private ort: Ort, private det: InferenceSession, private rec: InferenceSession, private dict: string[]) {}

  static async create(ort: Ort, det: string | Uint8Array, rec: string | Uint8Array, dictText: string): Promise<PaddleOcr> {
    const dict = ['', ...dictText.split(/\r?\n/).filter((l, i, a) => l.length > 0 || i < a.length - 1), ' '];
    return new PaddleOcr(ort, await ort.InferenceSession.create(det), await ort.InferenceSession.create(rec), dict);
  }

  async detect(img: Img, maxSide = 960, thresh = 0.3, minArea = 12): Promise<Box[]> {
    const r = Math.min(1, maxSide / Math.max(img.width, img.height));
    const W = Math.max(32, Math.round((img.width * r) / 32) * 32), H = Math.max(32, Math.round((img.height * r) / 32) * 32);
    const px = resizeCrop(img, { x: 0, y: 0, w: img.width, h: img.height }, W, H);
    const input = new this.ort.Tensor('float32', toCHW(px, W, H, [0.485, 0.456, 0.406], [0.229, 0.224, 0.225]), [1, 3, H, W]);
    const out = await this.det.run({ [this.det.inputNames[0]!]: input });
    const prob = out[this.det.outputNames[0]!]!.data as Float32Array;
    const mask = new Uint8Array(W * H);
    for (let i = 0; i < W * H; i++) mask[i] = prob[i]! > thresh ? 1 : 0;
    const boxes = components(mask, W, H, minArea);
    const sx = img.width / W, sy = img.height / H;
    return boxes.map((b) => {
      // Unclip: DB shrinks text regions; expand by area/perimeter * 1.5.
      const d = ((b.w * b.h) / (2 * (b.w + b.h))) * 1.5;
      const x = Math.max(0, (b.x - d) * sx), y = Math.max(0, (b.y - d) * sy);
      return { x, y, w: Math.min(img.width - x, (b.w + 2 * d) * sx), h: Math.min(img.height - y, (b.h + 2 * d) * sy) };
    }).sort((a, b) => a.y - b.y || a.x - b.x);
  }

  async recognize(img: Img, box: Box): Promise<{ text: string; confidence: number }> {
    const H = 48;
    const W = Math.min(960, Math.max(16, Math.ceil(((box.w / Math.max(1, box.h)) * H) / 8) * 8));
    const px = resizeCrop(img, box, W, H);
    const input = new this.ort.Tensor('float32', toCHW(px, W, H, [0.5, 0.5, 0.5], [0.5, 0.5, 0.5]), [1, 3, H, W]);
    const out = await this.rec.run({ [this.rec.inputNames[0]!]: input });
    const t = out[this.rec.outputNames[0]!]!;
    const [, T, C] = t.dims as number[];
    const d = t.data as Float32Array;
    let text = '', prev = -1; const confs: number[] = [];
    for (let i = 0; i < T!; i++) {
      let best = 0, bv = -Infinity;
      for (let c = 0; c < C!; c++) { const v = d[i * C! + c]!; if (v > bv) { bv = v; best = c; } }
      if (best !== 0 && best !== prev) { text += this.dict[best] ?? ''; confs.push(bv); }
      prev = best;
    }
    return { text: text.trim(), confidence: confs.length ? confs.reduce((a, b) => a + b, 0) / confs.length : 0 };
  }

  async read(img: Img, region?: Box): Promise<OcrLine[]> {
    const sub = region ? cropImg(img, region) : img;
    const lines: OcrLine[] = [];
    for (const b of await this.detect(sub)) {
      const r = await this.recognize(sub, b);
      if (!r.text) continue;
      lines.push({ box: region ? { ...b, x: b.x + region.x, y: b.y + region.y } : b, ...r });
    }
    return lines;
  }
}

export function cropImg(img: Img, b: Box): Img {
  const x0 = Math.max(0, Math.floor(b.x)), y0 = Math.max(0, Math.floor(b.y));
  const w = Math.min(img.width - x0, Math.ceil(b.w)), h = Math.min(img.height - y0, Math.ceil(b.h));
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) data.set(img.data.subarray(((y0 + y) * img.width + x0) * 4, ((y0 + y) * img.width + x0 + w) * 4), y * w * 4);
  return { data, width: w, height: h };
}

/** 4-connected components on a binary mask -> bounding boxes. */
export function components(mask: Uint8Array, W: number, H: number, minArea: number): Box[] {
  const seen = new Uint8Array(W * H);
  const out: Box[] = [];
  const stack: number[] = [];
  for (let i = 0; i < W * H; i++) {
    if (!mask[i] || seen[i]) continue;
    let minX = W, minY = H, maxX = 0, maxY = 0, area = 0;
    stack.push(i); seen[i] = 1;
    while (stack.length) {
      const p = stack.pop()!;
      const x = p % W, y = (p / W) | 0;
      area++;
      if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y;
      for (const q of [p - 1, p + 1, p - W, p + W]) {
        if (q < 0 || q >= W * H || seen[q] || !mask[q]) continue;
        if ((q === p - 1 && x === 0) || (q === p + 1 && x === W - 1)) continue;
        seen[q] = 1; stack.push(q);
      }
    }
    if (area >= minArea) out.push({ x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 });
  }
  return out;
}
