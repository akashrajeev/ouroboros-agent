/**
 * Phase 9 E4: does the masked image help? Each page holds an uploaded ID-card image
 * (src/images.ts cards) and a "Document type" select. The only source for the right option
 * is the card header, which exists only in the pixels. PII on the card is masked on-device
 * before anything is sent; the header is not PII and survives masking.
 * Arms: text-only (no visual hook) vs visual (masked JPEG after need_visual).
 * Usage: OURO_SERVER=... npx tsx src/visual.ts [n] [seed]
 */
import { fakerEN_IN as f } from '@faker-js/faker';
import { normalizeValue, type StepRecord } from '@ouroboros/core';
import { NerDetector } from '@ouroboros/ner';
import { PaddleOcr, YuNet, redactImage } from '@ouroboros/vision';
import * as ort from 'onnxruntime-node';
import sharp from 'sharp';
import { Window } from 'happy-dom';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { runTask } from '../../extension/lib/agentLoop';
import { executeOnElement } from '../../extension/lib/execute';
import { NodeRegistry, observe } from '../../extension/lib/observe';
import { makeCard, toImg, HEADERS } from './images';

const SERVER = process.env.OURO_SERVER ?? 'http://127.0.0.1:8000';
const M = new URL('../../models/', import.meta.url).pathname;
const OPTION: Record<string, string> = { 'GOVERNMENT OF INDIA': 'Government ID card', 'e-KYC CARD': 'e-KYC card', 'ACCOUNT HOLDER': 'Bank account holder card' };

async function main(n: number, seed: number) {
  f.seed(seed);
  const face = readFileSync(`${M}samples/lena.jpg`);
  const ocr = await PaddleOcr.create(ort as any, `${M}paddleocr/det.onnx`, `${M}paddleocr/rec.onnx`, readFileSync(`${M}paddleocr/dict.txt`, 'utf8'));
  const yn = await YuNet.create(ort as any, `${M}yunet/face_detection_yunet_2023mar.onnx`);
  const ner = await NerDetector.create({ localModelPath: M });
  const cards = [] as Awaited<ReturnType<typeof makeCard>>[];
  for (let i = 0; i < n; i++) cards.push(await makeCard(face, i % 2 === 1));
  const arms = { text: { right: 0, done: 0, visualAsked: 0, leaks: 0, bodies: 0, imgBytes: [] as number[], server: [] as number[], visionMs: [] as number[], outcomes: {} as Record<string, number> }, visual: { right: 0, done: 0, visualAsked: 0, leaks: 0, bodies: 0, imgBytes: [] as number[], server: [] as number[], visionMs: [] as number[], outcomes: {} as Record<string, number> } };
  for (const arm of ['text', 'visual'] as const) {
    const A = arms[arm];
    for (const [i, c] of cards.entries()) {
      const opts = f.helpers.shuffle(HEADERS.map((h) => OPTION[h]!));
      const html = `<h2>Upload verification</h2><p>Your uploaded document:</p><img src="upload-${i}.png" alt="Uploaded document" width="720" height="440">
<label for="dt">Document type</label><select id="dt"><option value="">Select...</option>${opts.map((o) => `<option>${o}</option>`).join('')}</select>`;
      const win = new Window({ url: 'https://kyc.example.in/verify', width: 1280, height: 800 });
      const g = globalThis as Record<string, unknown>;
      const keys = ['HTMLInputElement', 'HTMLTextAreaElement', 'HTMLSelectElement', 'NodeFilter', 'CSS', 'Event', 'InputEvent', 'MutationObserver'];
      const saved = keys.map((k) => g[k]);
      keys.forEach((k) => { g[k] = (win as unknown as Record<string, unknown>)[k]; });
      try {
        const doc = win.document as unknown as Document;
        doc.body.innerHTML = html;
        const reg = new NodeRegistry();
        let k = 0;
        const rect = (el: Element) => (el.tagName === 'IMG' ? { x: 10, y: 60, w: 720, h: 440 } : { x: 10, y: 520 + 30 * k++, w: 400, h: 24 });
        let asked = false;
        const res = await runTask('Set the Document type to match the uploaded card, then finish.', {
          observe: async () => { k = 0; return observe(doc, reg, rect); },
          execute: async (nodeId, op, text) => executeOnElement(reg.get(nodeId), op, text),
          post: async (body) => {
            A.bodies++;
            const nb = normalizeValue(body);
            if (c.values.some((v) => body.includes(v.value) || (normalizeValue(v.value).length >= 6 && nb.includes(normalizeValue(v.value))))) A.leaks++;
            const t = performance.now();
            const r = await fetch(`${SERVER}/step`, { method: 'POST', headers: { 'content-type': 'application/json' }, body });
            A.server.push(performance.now() - t);
            if (!r.ok) throw new Error(`server ${r.status}: ${await r.text()}`);
            const j = await r.json() as { action: unknown };
            if (process.env.OURO_DEBUG) console.error(`ACT ${arm} ${i} ${JSON.stringify(j.action)}${process.env.OURO_DEBUG === '2' ? ' BODY ' + body.slice(0, 1500) : ''}`);
            return j;
          },
          confirm: async () => true,
          settle: async () => {},
          detectText: async (texts) => { await ner.prime(texts); return (t: string) => ner.lookup(t); },
          visual: arm === 'visual' ? async () => {
            asked = true;
            const t = performance.now();
            const img = await toImg(c.png);
            const dets = await redactImage(img, await ocr.read(img), await yn.detect(img), { extraDetectors: [(t) => ner.detect(t)] });
            const jpeg = await sharp(Buffer.from(img.data.buffer), { raw: { width: img.width, height: img.height, channels: 4 } }).jpeg({ quality: 70 }).toBuffer();
            const imageText = (await ocr.read(await toImg(await sharp(jpeg).png().toBuffer()))).map((l) => l.text).join('\n');
            A.visionMs.push(performance.now() - t);
            A.imgBytes.push(jpeg.length);
            if (i === 0) writeFileSync(new URL('../results/phase9-e4-sample.jpg', import.meta.url).pathname, jpeg);
            return { jpegB64: jpeg.toString('base64'), imageText, detections: dets.length };
          } : undefined,
          record: (_r: StepRecord) => {},
          log: process.env.OURO_DEBUG ? (e) => { if (e.kind !== 'executed') console.error(`${arm} ${i} ${JSON.stringify(e)}`); } : undefined,
        }, { runId: `e4-${arm}-${i}`, maxSteps: 8 });
        if (asked) A.visualAsked++;
        A.outcomes[res.status] = (A.outcomes[res.status] ?? 0) + 1;
        if (res.status === 'done') A.done++;
        const got = (doc.querySelector('#dt') as HTMLSelectElement).value;
        if (got === OPTION[c.header]) A.right++;
        if (process.env.OURO_DEBUG) console.error(`END ${arm} ${i} ${res.status} header=${c.header} got=${JSON.stringify(got)}`);
      } finally {
        keys.forEach((kk, j) => { g[kk] = saved[j]; });
        await win.happyDOM.close();
      }
    }
  }
  const q = (xs: number[], p: number) => { const s = [...xs].sort((a, b) => a - b); return s.length ? s[Math.min(s.length - 1, Math.floor(s.length * p))]! : 0; };
  const row = (name: string, a: typeof arms.text) => `| ${name} | ${a.right}/${n} | ${a.done}/${n} | ${a.visualAsked}/${n} | ${a.leaks}/${a.bodies} | ${a.imgBytes.length ? `${(q(a.imgBytes, 0.5) / 1024).toFixed(0)} KB` : '-'} | ${a.visionMs.length ? `${q(a.visionMs, 0.5).toFixed(0)} ms` : '-'} | ${q(a.server, 0.5).toFixed(0)} / ${q(a.server, 0.95).toFixed(0)} | ${JSON.stringify(a.outcomes)} |`;
  const health = await fetch(`${SERVER}/health`).then((r) => r.json() as Promise<{ planner: string }>);
  const md = `# E4: does the masked image help? (${n} cards, seed ${seed}, planner ${health.planner})

Task: "Set the Document type to match the uploaded card, then finish." The right option depends only on the card header, which is in the pixels only. Half the cards are degraded (rotation, blur, downscale, JPEG). Chance level with 3 options: ${(n / 3).toFixed(1)}/${n}.

| Arm | Right option | Done | Asked need_visual | Bodies with a card value | Image p50 | Device vision p50 | Round-trip ms p50 / p95 | Outcomes |
|---|--:|--:|--:|--:|--:|--:|--:|---|
${row('text only', arms.text)}
${row('masked image on need_visual', arms.visual)}

Round-trip is measured at the device (includes tunnel). Device vision = OCR + faces + NER + masking + JPEG encode + re-OCR for the gate, Node CPU.
`;
  mkdirSync(new URL('../results/', import.meta.url).pathname, { recursive: true });
  writeFileSync(new URL(`../results/phase9-e4-${seed}.md`, import.meta.url).pathname, md);
  console.log(md);
}

await main(Number(process.argv[2] ?? 12), Number(process.argv[3] ?? 4444));
