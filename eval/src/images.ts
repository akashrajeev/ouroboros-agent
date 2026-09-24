/**
 * Synthetic ID-card image eval for the vision stage (Phase 6).
 * Renders Faker en_IN cards (text PII + a face photo + look-alike decoys) to PNG with sharp,
 * then measures what an OCR attacker can still read before/after redactImage.
 * Usage: npm run images --workspace eval -- [n] [seed]
 */
import { fakerEN_IN as f } from '@faker-js/faker';
import { normalizeValue, leakGate, PlaceholderMap } from '@ouroboros/core';
import { NerDetector } from '@ouroboros/ner';
import { PaddleOcr, YuNet, redactImage, maskedFraction, type Img } from '@ouroboros/vision';
import * as ort from 'onnxruntime-node';
import sharp from 'sharp';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import * as id from './ids';

const M = new URL('../../models/', import.meta.url).pathname;
const FONTS = ['DejaVu Sans', 'DejaVu Serif', 'DejaVu Sans Mono', 'Carlito', 'Caladea'];
const BGS = ['#f4f1e8', '#e8f0f7', '#ffffff', '#f7e9e4', '#eef6ea'];

export interface Card { png: Buffer; values: { type: string; value: string }[]; decoys: string[]; faceBox: { x: number; y: number; w: number; h: number }; header: string }

export const HEADERS = ['GOVERNMENT OF INDIA', 'e-KYC CARD', 'ACCOUNT HOLDER'];
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');

export async function makeCard(face: Buffer, hard = false): Promise<Card> {
  const W = 720, H = 440;
  const font = f.helpers.arrayElement(FONTS), bg = f.helpers.arrayElement(BGS);
  const fs = f.number.int({ min: 18, max: 26 });
  const name = `${f.person.firstName()} ${f.person.lastName()}`;
  const values = [
    { type: 'NAME', value: name, label: 'Name' },
    { type: 'DOB', value: id.dob(f), label: 'DOB' },
    { type: 'AADHAAR', value: id.aadhaarFormatted(f), label: 'Aadhaar' },
    { type: 'PAN', value: id.pan(f), label: 'PAN' },
    { type: 'PHONE', value: id.mobile(f), label: 'Mobile' },
  ];
  const decoys = [`Ref ${id.badAadhaar(f)}`, `Order #${f.string.numeric(8)}`];
  const lines = [...values.map((v) => `${v.label}: ${v.value}`), ...decoys];
  f.helpers.shuffle(lines);
  const faceSize = f.number.int({ min: 130, max: 180 });
  const faceBox = { x: W - faceSize - 30, y: 90, w: faceSize, h: Math.round(faceSize * 1.25) };
  const text = lines.map((l, i) => `<text x="30" y="${110 + i * (fs + 18)}" font-family="${font}" font-size="${fs}">${esc(l)}</text>`).join('');
  const header = f.helpers.arrayElement(HEADERS); // drawn here to keep the seeded sequence of earlier runs
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><rect width="${W}" height="${H}" fill="${bg}"/>
<text x="30" y="55" font-family="${font}" font-size="30" font-weight="bold">${header}</text>${text}</svg>`;
  const photo = await sharp(face).resize(faceBox.w, faceBox.h, { fit: 'cover' }).toBuffer();
  let png = await sharp(Buffer.from(svg)).composite([{ input: photo, left: faceBox.x, top: faceBox.y }]).png().toBuffer();
  if (hard) {
    // Phone-photo-ish degradation: small rotation, blur, downscale+upscale, low-quality JPEG.
    const angle = f.number.float({ min: -4, max: 4 });
    const scale = f.number.float({ min: 0.55, max: 0.8 });
    png = await sharp(png).rotate(angle, { background: bg }).blur(f.number.float({ min: 0.4, max: 1.1 })).png().toBuffer();
    const meta = await sharp(png).metadata();
    const small = await sharp(png).resize(Math.round(meta.width! * scale)).jpeg({ quality: f.number.int({ min: 35, max: 60 }) }).toBuffer();
    png = await sharp(small).resize(meta.width!, meta.height!).png().toBuffer();
  }
  return { png, values: values.map(({ type, value }) => ({ type, value })), decoys, faceBox, header };
}

export async function toImg(png: Buffer): Promise<Img> {
  const { data, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return { data: new Uint8ClampedArray(data), width: info.width, height: info.height } as Img;
}

const readable = (ocrText: string, v: string) => normalizeValue(ocrText).includes(normalizeValue(v));

export async function run(n: number, seed: number, hard = false) {
  f.seed(seed);
  const face = readFileSync(`${M}samples/lena.jpg`);
  const ocr = await PaddleOcr.create(ort as any, `${M}paddleocr/det.onnx`, `${M}paddleocr/rec.onnx`, readFileSync(`${M}paddleocr/dict.txt`, 'utf8'));
  const yn = await YuNet.create(ort as any, `${M}yunet/face_detection_yunet_2023mar.onnx`);
  const ner = existsSync(`${M}bert-small-pii/onnx/model_quantized.onnx`) ? await NerDetector.create({ localModelPath: M }) : undefined;
  const byType: Record<string, { n: number; rawReadable: number; afterReadable: number }> = {};
  let facesRaw = 0, facesAfter = 0, decoysRawReadable = 0, decoysAfterReadable = 0, gatePass = 0, gatePassLeak = 0, masked = 0;
  const ms: number[] = [];
  let sample: Buffer | undefined;
  for (let i = 0; i < n; i++) {
    const c = await makeCard(face, hard);
    const img = await toImg(c.png);
    const rawText = (await ocr.read(img)).map((l) => l.text).join('\n');
    const t0 = performance.now();
    const lines = await ocr.read(img);
    const faces = await yn.detect(img);
    const dets = await redactImage(img, lines, faces, { extraDetectors: ner ? [(t) => ner.detect(t)] : [] });
    ms.push(performance.now() - t0);
    if (faces.length) facesRaw++;
    masked += maskedFraction(dets, img.width, img.height);
    const after = await sharp(Buffer.from(img.data.buffer), { raw: { width: img.width, height: img.height, channels: 4 } }).png().toBuffer();
    if (i === 0) sample = after;
    const reImg = await toImg(after);
    const afterText = (await ocr.read(reImg)).map((l) => l.text).join('\n');
    if ((await yn.detect(reImg)).length) facesAfter++;
    let leak = false;
    for (const v of c.values) {
      const b = (byType[v.type] ??= { n: 0, rawReadable: 0, afterReadable: 0 });
      b.n++;
      if (readable(rawText, v.value)) b.rawReadable++;
      if (readable(afterText, v.value)) { b.afterReadable++; leak = true; }
    }
    for (const d of c.decoys) { if (readable(rawText, d)) decoysRawReadable++; if (readable(afterText, d)) decoysAfterReadable++; }
    // Production gate on re-OCR text: empty map (image-only), regex on imageText.
    const g = await leakGate('', new PlaceholderMap(), { imageText: afterText });
    if (g.pass) { gatePass++; if (leak) gatePassLeak++; }
  }
  ms.sort((a, b) => a - b);
  const pct = (x: number) => (x * 100).toFixed(1);
  const rows = Object.entries(byType).map(([t, v]) => `| ${t} | ${v.n} | ${v.rawReadable} | ${v.afterReadable} | ${pct(1 - v.afterReadable / Math.max(1, v.rawReadable))} |`).join('\n');
  const tot = Object.values(byType).reduce((a, v) => ({ raw: a.raw + v.rawReadable, after: a.after + v.afterReadable, n: a.n + v.n }), { raw: 0, after: 0, n: 0 });
  const md = `# Eval: vision stage on synthetic ID-card images${hard ? ' (degraded: rotation, blur, downscale, JPEG)' : ''}

${n} Faker en_IN cards (seed ${seed}, \`npm run images --workspace eval -- ${n} ${seed}${hard ? ' --hard' : ''}\`), 720x440 PNG, 5 fonts, 5 backgrounds, 5 PII fields + 2 look-alike decoys + one face photo each. Pipeline: PaddleOCR PP-OCRv3 det + PP-OCRv5 mobile English rec (ONNX, CPU) -> rules${ner ? ' + NER' : ''} per OCR line -> black-fill matched spans (low-confidence lines masked whole) ; YuNet 2023mar -> pixelate faces. "Readable" = the value appears in PaddleOCR output of the image (normalized). The attacker model is the same OCR, so this is a lower bound on what a stronger reader could recover.

## PII still readable

| Type | Values | Readable before | Readable after | Suppressed % |
|------|------:|------:|------:|------:|
${rows}

- **All values:** ${tot.raw} of ${tot.n} readable before, **${tot.after} readable after masking**
- Faces detected: ${facesRaw}/${n} before, ${facesAfter}/${n} after pixelation
- Decoys readable: ${decoysRawReadable} before, ${decoysAfterReadable} after (lower after = over-redaction)
- Mean masked area: ${pct(masked / n)}% of the image
- Leak gate on re-OCR text: passed ${gatePass}/${n}; passed while a value was still readable: **${gatePassLeak}**

## Cost (Node, onnxruntime-node CPU, sandbox)

- OCR + faces + NER + masking per image: mean ${(ms.reduce((a, b) => a + b, 0) / n).toFixed(0)} ms, p50 ${ms[Math.floor(n / 2)]!.toFixed(0)} ms, p95 ${ms[Math.floor(n * 0.95)]!.toFixed(0)} ms

## Caveats

- Self-generated images with a single reused face photo (OpenCV sample). ${hard ? 'Degradation is simulated (rotation up to 4 deg, blur, 0.55-0.8x downscale, JPEG q35-60); no glare, perspective or real camera noise.' : 'Clean synthetic text: no blur, skew, glare or camera noise.'} Treat these as an upper bound.
- Face "after" re-detection only shows YuNet no longer fires; it is not proof a person is unrecognisable.
`;
  const dir = new URL('../results/', import.meta.url).pathname;
  mkdirSync(dir, { recursive: true });
  writeFileSync(`${dir}vision-cards${hard ? '-hard' : ''}-${seed}.md`, md);
  if (sample) writeFileSync(`${dir}vision-sample${hard ? '-hard' : ''}-${seed}.png`, sample);
  console.log(md);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await run(Number(process.argv[2] ?? 40), Number(process.argv[3] ?? 26171), process.argv.includes('--hard'));
}
