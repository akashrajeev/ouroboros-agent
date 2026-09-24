import type { InferenceSession } from 'onnxruntime-common';
import { iou, resizeCrop, type Box, type Img } from './image';
import type { Ort } from './ocr';

export interface Face { box: Box; score: number }

/** A3d faces: OpenCV YuNet 2023mar (640x640 input, BGR 0-255, strides 8/16/32). */
export class YuNet {
  private constructor(private ort: Ort, private s: InferenceSession) {}
  static async create(ort: Ort, model: string | Uint8Array): Promise<YuNet> {
    return new YuNet(ort, await ort.InferenceSession.create(model));
  }

  async detect(img: Img, scoreThresh = 0.6, nmsThresh = 0.3): Promise<Face[]> {
    const S = 640;
    const r = Math.min(S / img.width, S / img.height);
    const w = Math.round(img.width * r), h = Math.round(img.height * r);
    const px = resizeCrop(img, { x: 0, y: 0, w: img.width, h: img.height }, w, h);
    const chw = new Float32Array(3 * S * S);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4, o = y * S + x;
      chw[o] = px[i + 2]!; chw[S * S + o] = px[i + 1]!; chw[2 * S * S + o] = px[i]!; // BGR, raw 0-255
    }
    const out = await this.s.run({ [this.s.inputNames[0]!]: new this.ort.Tensor('float32', chw, [1, 3, S, S]) });
    const faces: Face[] = [];
    for (const stride of [8, 16, 32]) {
      const cls = out[`cls_${stride}`]!.data as Float32Array;
      const obj = out[`obj_${stride}`]!.data as Float32Array;
      const bb = out[`bbox_${stride}`]!.data as Float32Array;
      const cols = S / stride;
      for (let i = 0; i < cls.length; i++) {
        const score = Math.sqrt(Math.min(1, Math.max(0, cls[i]!)) * Math.min(1, Math.max(0, obj[i]!)));
        if (score < scoreThresh) continue;
        const cx = ((i % cols) + bb[i * 4]!) * stride, cy = (Math.floor(i / cols) + bb[i * 4 + 1]!) * stride;
        const bw = Math.exp(bb[i * 4 + 2]!) * stride, bh = Math.exp(bb[i * 4 + 3]!) * stride;
        faces.push({ score, box: { x: (cx - bw / 2) / r, y: (cy - bh / 2) / r, w: bw / r, h: bh / r } });
      }
    }
    faces.sort((a, b) => b.score - a.score);
    const keep: Face[] = [];
    for (const f of faces) if (!keep.some((k) => iou(k.box, f.box) > nmsThresh)) keep.push(f);
    return keep;
  }
}
