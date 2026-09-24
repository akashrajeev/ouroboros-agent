import type { Face, YuNet } from './faces';
import { cropImg, type OcrLine, type PaddleOcr } from './ocr';
import { hashPixels, type Box, type Img } from './image';
import { redactImage, type AsyncTextDetector, type ImageDetection } from './redact';

/** Per-region results in region coordinates, cached by exact pixel hash (G4). */
export interface RegionResult { lines: OcrLine[]; faces: Face[]; reText?: string[] }
export interface RegionCache { get(k: string): RegionResult | undefined; set(k: string, v: RegionResult): void }

export interface ScreenVisionResult {
  detections: ImageDetection[];
  /** Re-OCR of the masked regions; goes to leakGate({ imageText }). */
  imageText: string;
  regionsProcessed: number;
  cacheHits: number;
  ms: { ocr: number; faces: number; reocr: number };
}

const shift = (b: Box, r: Box): Box => ({ x: b.x + r.x, y: b.y + r.y, w: b.w, h: b.h });

/**
 * A3d + A6 on a screenshot: only opaque regions (img/canvas/video/iframe...) are scanned,
 * because DOM text is already handled by A3a-c. Mutates `shot` (black fill + face pixelation)
 * and re-OCRs the masked regions so the leak gate checks pixels, not just the JSON.
 */
export async function processScreenshot(
  shot: Img, regions: Box[], ocr: PaddleOcr, faces: YuNet | undefined,
  opts: { extraDetectors?: AsyncTextDetector[]; minSide?: number; cache?: RegionCache } = {},
): Promise<ScreenVisionResult> {
  const minSide = opts.minSide ?? 48;
  const clip = (b: Box): Box | null => {
    const x = Math.max(0, Math.floor(b.x)), y = Math.max(0, Math.floor(b.y));
    const w = Math.min(shot.width, Math.ceil(b.x + b.w)) - x, h = Math.min(shot.height, Math.ceil(b.y + b.h)) - y;
    return w >= minSide && h >= minSide ? { x, y, w, h } : null;
  };
  const rs = regions.map(clip).filter((r): r is Box => r !== null);
  const lines: OcrLine[] = [], found: Face[] = [];
  const ms = { ocr: 0, faces: 0, reocr: 0 };
  const keys: string[] = [], entries: RegionResult[] = [];
  let cacheHits = 0;
  for (const r of rs) {
    const crop = cropImg(shot, r);
    const key = hashPixels(crop);
    let e = opts.cache?.get(key);
    if (e) cacheHits++;
    else {
      let t = performance.now();
      e = { lines: await ocr.read(crop), faces: [] };
      ms.ocr += performance.now() - t;
      if (faces) { t = performance.now(); e.faces = await faces.detect(crop); ms.faces += performance.now() - t; }
    }
    keys.push(key); entries.push(e);
    for (const l of e.lines) lines.push({ ...l, box: shift(l.box, r) });
    for (const f of e.faces) found.push({ ...f, box: shift(f.box, r) });
  }
  const detections = await redactImage(shot, lines, found, { extraDetectors: opts.extraDetectors });
  const t = performance.now();
  const texts: string[] = [];
  for (const [i, r] of rs.entries()) {
    const e = entries[i]!;
    // Same input pixels + same detectors => same masked pixels, so the re-OCR text is cacheable too.
    if (!e.reText) e.reText = (await ocr.read(cropImg(shot, r))).map((l) => l.text);
    texts.push(...e.reText);
    opts.cache?.set(keys[i]!, e);
  }
  ms.reocr = performance.now() - t;
  return { detections, imageText: texts.join('\n'), regionsProcessed: rs.length, cacheHits, ms };
}
