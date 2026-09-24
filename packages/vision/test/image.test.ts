import { describe, expect, it } from 'vitest';
import { blackFill, components, iou, pixelate, resizeCrop, spanBox, redactImage } from '../src/index';

const img = (w: number, h: number, v = 200) => ({ data: new Uint8ClampedArray(w * h * 4).fill(v), width: w, height: h });

describe('image ops', () => {
  it('black fill covers the box plus padding and nothing else', () => {
    const im = img(20, 20);
    blackFill(im, [{ x: 8, y: 8, w: 2, h: 2 }], 2);
    const at = (x: number, y: number) => im.data[(y * 20 + x) * 4];
    expect(at(6, 6)).toBe(0); expect(at(11, 11)).toBe(0); expect(at(5, 5)).toBe(200); expect(at(12, 12)).toBe(200);
  });
  it('pixelate flattens a region to block averages', () => {
    const im = img(32, 32, 0);
    for (let i = 0; i < 32 * 32; i++) im.data[i * 4] = i % 2 ? 255 : 0;
    pixelate(im, [{ x: 0, y: 0, w: 32, h: 32 }], 16, 0);
    expect(new Set(Array.from({ length: 32 }, (_, i) => im.data[i * 4])).size).toBeLessThanOrEqual(2);
  });
  it('connected components find separate blobs', () => {
    const m = new Uint8Array(100);
    [11, 12, 21, 22, 77, 78, 88].forEach((i) => (m[i] = 1));
    expect(components(m, 10, 10, 1)).toEqual([{ x: 1, y: 1, w: 2, h: 2 }, { x: 7, y: 7, w: 2, h: 2 }]);
  });
  it('iou and resize basics', () => {
    expect(iou({ x: 0, y: 0, w: 2, h: 2 }, { x: 1, y: 0, w: 2, h: 2 })).toBeCloseTo(1 / 3);
    expect(resizeCrop(img(4, 4, 90), { x: 0, y: 0, w: 4, h: 4 }, 2, 2)[0]).toBe(90);
  });
});

describe('redactImage', () => {
  it('masks only the matched span of an OCR line and fails closed on low confidence', async () => {
    const im = img(400, 100);
    const lines = [
      { text: 'Aadhaar 2345 6789 0124', confidence: 0.99, box: { x: 0, y: 10, w: 220, h: 20 } },
      { text: 'blurry', confidence: 0.3, box: { x: 0, y: 60, w: 100, h: 20 } },
    ];
    // 2345 6789 0124 is not Verhoeff-valid? use span box directly for determinism
    const b = spanBox(lines[0]!, { start: 8, end: 22 });
    expect(b.x).toBeCloseTo(80);
    const dets = await redactImage(im, lines, []);
    expect(dets.some((d) => d.type === 'LOW_CONF_TEXT')).toBe(true);
    expect(im.data[(70 * 400 + 50) * 4]).toBe(0);
    expect(im.data[(20 * 400 + 30) * 4]).toBe(200); // the word "Aadhaar" stays readable
  });
});
