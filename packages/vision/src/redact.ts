import { detectPatterns, type PiiType, type TextMatch } from '@ouroboros/core';

export type AsyncTextDetector = (text: string) => TextMatch[] | Promise<TextMatch[]>;
import type { Face } from './faces';
import { blackFill, pixelate, type Box, type Img } from './image';
import type { OcrLine } from './ocr';

export interface ImageDetection { type: PiiType | 'LOW_CONF_TEXT'; box: Box; source: 'ocr' | 'face'; text?: string }

export interface RedactImageOptions {
  extraDetectors?: AsyncTextDetector[];
  /** Fail-closed: OCR lines under this confidence are masked whole. */
  minLineConfidence?: number;
  padding?: number;
}

/** Proportional sub-box for a character span of an OCR line (monospace approximation, padded later). */
export function spanBox(line: OcrLine, m: { start: number; end: number }): Box {
  const n = Math.max(1, line.text.length);
  // Proportional fonts break the monospace estimate by up to a character either way, so widen by one
  // average character on each side (clamped to the line). Found visually in Phase 9 E4: first digit showed.
  const cw = line.box.w / n;
  const x0 = Math.max(line.box.x, line.box.x + cw * m.start - cw);
  const x1 = Math.min(line.box.x + line.box.w, line.box.x + cw * m.end + cw);
  return { x: x0, y: line.box.y, w: x1 - x0, h: line.box.h };
}

/**
 * A6 for pixels: run the same text detectors on OCR lines, black-fill matched spans,
 * black-fill low-confidence lines whole (fail-closed), pixelate faces. Mutates `img`.
 */
export async function redactImage(img: Img, lines: OcrLine[], faces: Face[], opts: RedactImageOptions = {}): Promise<ImageDetection[]> {
  const dets: ImageDetection[] = [];
  const minConf = opts.minLineConfidence ?? 0.6;
  for (const line of lines) {
    if (line.confidence < minConf) {
      dets.push({ type: 'LOW_CONF_TEXT', box: line.box, source: 'ocr' });
      continue;
    }
    const extra = await Promise.all((opts.extraDetectors ?? []).map((d) => d(line.text)));
    const matches: TextMatch[] = [detectPatterns(line.text), ...extra].flat();
    for (const m of matches) dets.push({ type: m.type, box: spanBox(line, m), source: 'ocr', text: m.value });
  }
  blackFill(img, dets.map((d) => d.box), opts.padding ?? 4);
  // YuNet boxes are tight on the face; grow 30% so hair/jaw outline is also pixelated.
  const faceDets = faces.map((f) => {
    const g = 0.3, b = f.box;
    return { type: 'FACE' as const, source: 'face' as const, box: { x: b.x - (b.w * g) / 2, y: b.y - (b.h * g) / 2, w: b.w * (1 + g), h: b.h * (1 + g) } };
  });
  pixelate(img, faceDets.map((f) => f.box), 16, opts.padding ?? 4);
  return [...dets, ...faceDets];
}

/** Fraction of image pixels that were masked (over-redaction proxy for M3). */
export function maskedFraction(dets: ImageDetection[], W: number, H: number): number {
  const m = new Uint8Array(W * H);
  for (const d of dets) {
    const x0 = Math.max(0, Math.floor(d.box.x - 4)), y0 = Math.max(0, Math.floor(d.box.y - 4));
    const x1 = Math.min(W, Math.ceil(d.box.x + d.box.w + 4)), y1 = Math.min(H, Math.ceil(d.box.y + d.box.h + 4));
    for (let y = y0; y < y1; y++) m.fill(1, y * W + x0, y * W + x1);
  }
  let s = 0;
  for (let i = 0; i < m.length; i++) s += m[i]!;
  return s / m.length;
}
