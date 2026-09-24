// @vitest-environment node
import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ModelHost, toShotBoxes } from '../lib/modelHost';

const M = `${process.cwd().replace(/\/extension$/, '')}/models/`;
const have = existsSync(`${M}paddleocr/rec.onnx`) && existsSync(`${M}yunet/face_detection_yunet_2023mar.onnx`);

describe('toShotBoxes', () => {
  it('scales CSS px to screenshot px (devicePixelRatio 2)', () => {
    expect(toShotBoxes([{ x: 10, y: 20, w: 30, h: 40 }], 800, 1600)).toEqual([{ x: 20, y: 40, w: 60, h: 80 }]);
  });
});

describe.skipIf(!have)('ModelHost (onnxruntime-node stands in for onnxruntime-web)', () => {
  it('masks a PAN inside an opaque region and caches NER results per string', async () => {
    const ort = await import('onnxruntime-node');
    const sharp = (await import('sharp')).default;
    let nerCalls = 0;
    const host = new ModelHost({
      ort: ort as never,
      bytes: async (p) => new Uint8Array(readFileSync(M + p)),
      text: async (p) => readFileSync(M + p, 'utf8'),
      ner: async () => ({ detect: async (t: string) => { nerCalls++; return /Ravi Kumar/.test(t) ? [{ type: 'NAME' as const, start: t.indexOf('Ravi'), end: t.indexOf('Ravi') + 10, value: 'Ravi Kumar', confidence: 0.9, source: 'ner' as const }] : []; } }),
    });
    await host.prime(['Holder: Ravi Kumar', 'Holder: Ravi Kumar', 'Submit']);
    await host.prime(['Holder: Ravi Kumar']);
    expect(nerCalls).toBe(2); // 'Holder: Ravi Kumar' once (dedup + cache) and 'Submit' once
    expect(host.nerCache.hitRate).toBeGreaterThan(0);
    expect(host.lookup('Holder: Ravi Kumar')).toHaveLength(1);
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="200"><rect width="600" height="200" fill="#fff"/>
<text x="20" y="80" font-family="DejaVu Sans" font-size="26">PAN: ABCPE1234F</text></svg>`;
    const { data, info } = await sharp(Buffer.from(svg)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const shot = { data: new Uint8ClampedArray(data), width: info.width, height: info.height };
    const r = await host.visual(shot, [{ x: 0, y: 0, w: 600, h: 200 }]);
    expect(r.detections).toBeGreaterThan(0);
    expect(r.imageText).not.toContain('ABCPE1234F');
  }, 30000);
});
