import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { PaddleOcr, YuNet, redactImage } from '../src/index';

// Real-model checks; skipped in CI unless scripts/fetch-models.sh has run.
const M = new URL('../../../models/', import.meta.url).pathname;
const have = existsSync(`${M}paddleocr/rec.onnx`) && existsSync(`${M}yunet/face_detection_yunet_2023mar.onnx`);

describe.skipIf(!have)('vision models', () => {
  it('reads, masks and re-reads an Aadhaar card line', async () => {
    const ort = await import('onnxruntime-node');
    const sharp = (await import('sharp')).default;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="520" height="160"><rect width="520" height="160" fill="#fff"/>
<text x="20" y="60" font-family="DejaVu Sans" font-size="26">PAN: ABCPE1234F</text>
<text x="20" y="120" font-family="DejaVu Sans" font-size="26">Order 22405156</text></svg>`;
    const { data, info } = await sharp(Buffer.from(svg)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const img = { data: new Uint8ClampedArray(data), width: info.width, height: info.height } as any;
    const ocr = await PaddleOcr.create(ort as any, `${M}paddleocr/det.onnx`, `${M}paddleocr/rec.onnx`, readFileSync(`${M}paddleocr/dict.txt`, 'utf8'));
    const before = (await ocr.read(img)).map((l) => l.text).join(' ');
    expect(before).toContain('ABCPE1234F');
    const yn = await YuNet.create(ort as any, `${M}yunet/face_detection_yunet_2023mar.onnx`);
    await redactImage(img, await ocr.read(img), await yn.detect(img));
    const after = (await ocr.read(img)).map((l) => l.text).join(' ');
    expect(after).not.toContain('ABCPE1234F');
    expect(after).toContain('22405156');
  }, 30000);
});

describe.skipIf(!have)('processScreenshot', () => {
  it('scans only opaque regions and leaves DOM-text areas untouched', async () => {
    const ort = await import('onnxruntime-node');
    const sharp = (await import('sharp')).default;
    const { processScreenshot } = await import('../src/index');
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="300"><rect width="800" height="300" fill="#fff"/>
<text x="20" y="60" font-family="DejaVu Sans" font-size="24">PAN: ABCPE1234F</text>
<rect x="400" y="100" width="380" height="120" fill="#eee"/><text x="420" y="170" font-family="DejaVu Sans" font-size="24">PAN: BXYPK5678Q</text></svg>`;
    const { data, info } = await sharp(Buffer.from(svg)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const shot = { data: new Uint8ClampedArray(data), width: info.width, height: info.height } as any;
    const ocr = await PaddleOcr.create(ort as any, `${M}paddleocr/det.onnx`, `${M}paddleocr/rec.onnx`, readFileSync(`${M}paddleocr/dict.txt`, 'utf8'));
    const r = await processScreenshot(shot, [{ x: 400, y: 100, w: 380, h: 120 }, { x: 0, y: 0, w: 20, h: 20 }], ocr, undefined);
    expect(r.regionsProcessed).toBe(1);
    expect(r.detections.map((d) => d.type)).toContain('PAN');
    expect(r.imageText).not.toContain('BXYPK5678Q');
    const full = (await ocr.read(shot)).map((l) => l.text).join(' ');
    expect(full).toContain('ABCPE1234F'); // outside opaque regions: DOM path's job, not pixels'
  }, 30000);
});
