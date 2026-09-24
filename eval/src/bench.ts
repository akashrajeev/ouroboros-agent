/**
 * G6/G4 benchmark (CPU only, no GPU here): onnxruntime-node vs onnxruntime-web WASM (the runtime
 * the extension ships) on the vision stage, plus G4 region-cache savings on a 10-step replay.
 * WebGPU needs a real browser with a GPU: use the extension's bench page for that row.
 * Usage: npm run bench --workspace eval
 */
import { fakerEN_IN as f } from '@faker-js/faker';
import { Lru } from '@ouroboros/core';
import { PaddleOcr, YuNet, processScreenshot, type Img, type RegionResult } from '@ouroboros/vision';
import sharp from 'sharp';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import { makeCard } from './images';

const M = new URL('../../models/', import.meta.url).pathname;
const dict = readFileSync(`${M}paddleocr/dict.txt`, 'utf8');
const buf = (p: string) => new Uint8Array(readFileSync(M + p));
const q = (xs: number[], p: number) => [...xs].sort((a, b) => a - b)[Math.min(xs.length - 1, Math.floor(p * xs.length))]!;

async function toImg(png: Buffer): Promise<Img> {
  const { data, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return { data: new Uint8ClampedArray(data), width: info.width, height: info.height };
}

async function timeRuntime(name: string, ort: any, cards: Img[]) {
  const t0 = performance.now();
  const ocr = await PaddleOcr.create(ort, buf('paddleocr/det.onnx'), buf('paddleocr/rec.onnx'), dict);
  const yn = await YuNet.create(ort, buf('yunet/face_detection_yunet_2023mar.onnx'));
  const load = performance.now() - t0;
  const ms: number[] = [];
  for (const c of cards) {
    const shot = { ...c, data: new Uint8ClampedArray(c.data) };
    const t = performance.now();
    await processScreenshot(shot, [{ x: 0, y: 0, w: c.width, h: c.height }], ocr, yn);
    ms.push(performance.now() - t);
  }
  ms.shift(); // first run includes kernel warm-up
  return { name, load, p50: q(ms, 0.5), p95: q(ms, 0.95), ocr, yn };
}

export async function run() {
  f.seed(4242);
  const face = readFileSync(`${M}samples/lena.jpg`);
  const cards: Img[] = [];
  for (let i = 0; i < 11; i++) cards.push(await toImg((await makeCard(face)).png));

  const rows = [];
  const node = await import('onnxruntime-node');
  rows.push(await timeRuntime('onnxruntime-node CPU (default threads)', node, cards));
  const web = await import('onnxruntime-web');
  for (const th of [1, 4]) {
    web.env.wasm.numThreads = th;
    rows.push(await timeRuntime(`onnxruntime-web WASM, ${th} thread${th > 1 ? 's' : ''} (extension runtime)`, web, cards));
  }

  // G4: a 10-step session where the same ID-card image stays on screen; it changes once at step 5.
  const { ocr, yn } = rows[0]!;
  const cache = new Lru<RegionResult>(64);
  const withCache: number[] = [], without: number[] = [];
  let hits = 0;
  for (let step = 0; step < 10; step++) {
    const c = cards[step < 5 ? 1 : 2]!;
    const region = [{ x: 0, y: 0, w: c.width, h: c.height }];
    let t = performance.now();
    hits += (await processScreenshot({ ...c, data: new Uint8ClampedArray(c.data) }, region, ocr, yn, { cache })).cacheHits;
    withCache.push(performance.now() - t);
    t = performance.now();
    await processScreenshot({ ...c, data: new Uint8ClampedArray(c.data) }, region, ocr, yn);
    without.push(performance.now() - t);
  }
  const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

  const md = `# Benchmark: vision runtime (G6) and region cache (G4)

Machine: ${os.cpus()[0]?.model ?? 'unknown'} x${os.cpus().length} (sandbox, shared), Node ${process.version}. Workload: 10 synthetic 720x440 ID cards (PP-OCRv3 det + PP-OCRv5 rec + YuNet + masking + re-OCR), whole card as one opaque region; first run excluded as warm-up.

| Runtime | Model load ms | p50 ms / image | p95 ms / image |
|---|--:|--:|--:|
${rows.map((r) => `| ${r.name} | ${r.load.toFixed(0)} | ${r.p50.toFixed(0)} | ${r.p95.toFixed(0)} |`).join('\n')}
| onnxruntime-web WebGPU | - | not measured | not measured |

WebGPU is not available in this sandbox (no GPU, no browser). The extension bench page (\`bench.html\`) runs the same workload with \`executionProviders: ['webgpu']\` vs \`['wasm']\` on a real machine.

## G4 region cache

10 steps with the same card on screen, one change at step 5 (onnxruntime-node): **${hits} of 10 regions served from cache** (ceiling 8). Total vision time ${sum(withCache).toFixed(0)} ms with the cache vs ${sum(without).toFixed(0)} ms without (${(100 * (1 - sum(withCache) / sum(without))).toFixed(0)}% saved). A hit still masks the frame; it skips OCR, face detection and re-OCR. The key is an exact pixel hash, so any changed pixel is a miss.

## Caveats

- Shared sandbox CPU; absolute numbers will differ on a student laptop. The ratio between rows is the useful part.
- Extension pages run WASM single-threaded unless the page is cross-origin isolated, so the 1-thread WASM row is the realistic in-browser CPU number.
`;
  const dir = new URL('../results/', import.meta.url).pathname;
  mkdirSync(dir, { recursive: true });
  writeFileSync(`${dir}bench-vision.md`, md);
  console.log(md);
}

if (import.meta.url === `file://${process.argv[1]}`) await run();
