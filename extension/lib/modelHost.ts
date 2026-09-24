import type { TextDetector, TextMatch } from '@ouroboros/core';
import { Lru } from '@ouroboros/core';
import { PaddleOcr, YuNet, processScreenshot, type Box, type Img, type Ort, type RegionResult } from '@ouroboros/vision';

/**
 * On-device model host (A3c + A3d). Runs in the Chrome offscreen document or the
 * Firefox background page; environment-agnostic so Node tests drive it with onnxruntime-node.
 * G4 caches: text -> NER matches, opaque-region pixel hash -> OCR lines/faces.
 * G6: sessions are created once and kept warm.
 */
export interface HostDeps {
  ort: Ort;
  /** Returns model bytes by repo-relative path under models/ (e.g. 'paddleocr/det.onnx'). */
  bytes(path: string): Promise<Uint8Array>;
  text(path: string): Promise<string>;
  /** Optional NER: async detector over one string. */
  ner?: () => Promise<{ detect(t: string): Promise<TextMatch[]> }>;
}

export interface VisualResult { imageText: string; detections: number; regions: number; cacheHits: number; ms: Record<string, number> }

export class ModelHost {
  private ocr?: PaddleOcr;
  private faces?: YuNet;
  private ner?: { detect(t: string): Promise<TextMatch[]> };
  readonly nerCache = new Lru<TextMatch[]>(4096);
  /** G4: opaque-region results keyed by exact pixel hash. */
  readonly regionCache = new Lru<RegionResult>(128);
  readonly loadMs: Record<string, number> = {};
  constructor(private d: HostDeps) {}

  async warm(): Promise<void> {
    let t = performance.now();
    if (!this.ocr) {
      this.ocr = await PaddleOcr.create(this.d.ort, await this.d.bytes('paddleocr/det.onnx'), await this.d.bytes('paddleocr/rec.onnx'), await this.d.text('paddleocr/dict.txt'));
      this.faces = await YuNet.create(this.d.ort, await this.d.bytes('yunet/face_detection_yunet_2023mar.onnx'));
      this.loadMs.vision = performance.now() - t;
    }
    t = performance.now();
    if (!this.ner && this.d.ner) { this.ner = await this.d.ner(); this.loadMs.ner = performance.now() - t; }
  }

  /** A3c: batch the strings the sanitizer will read; afterwards `lookup` answers synchronously. */
  async prime(texts: string[]): Promise<void> {
    if (!this.d.ner) return;
    await this.warm();
    for (const s of new Set(texts)) {
      if (!s || s.trim().length < 4 || this.nerCache.get(s)) continue;
      this.nerCache.set(s, await this.ner!.detect(s));
    }
  }

  readonly lookup: TextDetector = (t) => this.nerCache.get(t) ?? [];

  /** A3d + A6: mask opaque regions of the screenshot in place, return re-OCR text for the leak gate. */
  async visual(shot: Img, regions: Box[]): Promise<VisualResult> {
    await this.warm();
    const r = await processScreenshot(shot, regions, this.ocr!, this.faces, { extraDetectors: this.ner ? [(t) => this.ner!.detect(t)] : [], cache: this.regionCache });
    return { imageText: r.imageText, detections: r.detections.length, regions: r.regionsProcessed, cacheHits: r.cacheHits, ms: r.ms };
  }
}

/** Scale CSS-pixel opaque boxes to screenshot pixels (devicePixelRatio / zoom). */
export function toShotBoxes(boxes: { x: number; y: number; w: number; h: number }[], viewportW: number, shotW: number): Box[] {
  const s = shotW / Math.max(1, viewportW);
  return boxes.map((b) => ({ x: b.x * s, y: b.y * s, w: b.w * s, h: b.h * s }));
}
