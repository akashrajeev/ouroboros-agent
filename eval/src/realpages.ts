/**
 * Real-page eval (Phase 11). Opens real public sign-up / KYC / credential pages in headless Chrome,
 * fills visible inputs with synthetic Faker en_IN values (never submits), then runs the Ouroboros
 * device pipeline on the live DOM: observe -> sanitize (rules + NER) -> independent leak check,
 * plus the image path on a viewport screenshot (OCR + mask + two-pass) with OCR readability before/after.
 * Ground truth = the values we typed, classified by our own keyword map (separate from the product's detectors).
 * Usage: npx tsx src/realpages.ts [urls-file] [seed] [tag]
 */
import { fakerEN_IN as f } from '@faker-js/faker';
import { PlaceholderMap, normalizeValue, sanitize, wireScreenMap, type RawObservation, type TextMatch } from '@ouroboros/core';
import { NerDetector } from '@ouroboros/ner';
import { PaddleOcr, YuNet, redactImage, type Img } from '@ouroboros/vision';
import * as ort from 'onnxruntime-node';
import puppeteer from 'puppeteer-core';
import sharp from 'sharp';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import * as id from './ids';

const M = new URL('../../models/', import.meta.url).pathname;
const [urlsFile = 'realpages.txt', seedArg = '1101', tag = 'realpages'] = process.argv.slice(2);
f.seed(Number(seedArg));
const OUT = new URL(`../results/${tag}/`, import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });
const inpage = readFileSync('/tmp/rp-inpage.js', 'utf8');
const lines = readFileSync(urlsFile, 'utf8').split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('#'));

type T = 'NAME' | 'EMAIL' | 'PHONE' | 'AADHAAR' | 'PAN' | 'DOB' | 'PINCODE' | 'ADDRESS' | 'PASSWORD' | 'OTP' | 'ACCOUNT' | 'IFSC' | 'CARD';
function classify(e: RawObservation['elements'][number]): T | null {
  if (!['input', 'textarea'].includes(e.tag)) return null;
  const it = (e.inputType ?? 'text').toLowerCase();
  if (['checkbox', 'radio', 'submit', 'button', 'file', 'hidden', 'image', 'reset', 'range', 'color', 'search'].includes(it)) return null;
  if (e.disabled) return null;
  if (it === 'password') return 'PASSWORD';
  const s = [e.name, e.htmlName, e.htmlId, e.placeholder, e.autocomplete].filter(Boolean).join(' ').toLowerCase();
  if (/captcha|security code|verification code shown|search/.test(s)) return null;
  if (/e-?mail/.test(s)) return 'EMAIL';
  if (/aadha?ar|\buid\b|vid\b/.test(s)) return 'AADHAAR';
  if (/\bpan\b|pan card|pan number|pan no/.test(s)) return 'PAN';
  if (/ifsc/.test(s)) return 'IFSC';
  if (/card number|card no|cardnumber/.test(s)) return 'CARD';
  if (/account (number|no)|acc(ount)?_?no/.test(s)) return 'ACCOUNT';
  if (/\botp\b|one.time/.test(s)) return 'OTP';
  if (/mobile|phone|contact (number|no)|whatsapp|\btel\b/.test(s) || it === 'tel') return 'PHONE';
  if (/date of birth|\bdob\b|birth ?date|bday/.test(s)) return 'DOB';
  if (/pin ?code|postal|zip/.test(s)) return 'PINCODE';
  if (/address|street|locality|house|flat/.test(s)) return 'ADDRESS';
  if (/user ?name|login id|user id/.test(s)) return null;
  if (/name/.test(s)) return 'NAME';
  return null;
}
function valueFor(t: T, e: RawObservation['elements'][number]): string {
  const s = [e.name, e.htmlName, e.htmlId, e.placeholder].join(' ').toLowerCase();
  switch (t) {
    case 'NAME': return /first|given/.test(s) ? f.person.firstName() : /last|sur|family/.test(s) ? f.person.lastName() : `${f.person.firstName()} ${f.person.lastName()}`;
    case 'EMAIL': return `${f.person.firstName().toLowerCase()}.${f.number.int({ min: 10, max: 99 })}@gmail.com`;
    case 'PHONE': return id.mobile(f);
    case 'AADHAAR': return id.aadhaar(f);
    case 'PAN': return id.pan(f);
    case 'DOB': { const d = f.date.birthdate({ min: 18, max: 70, mode: 'age' }); return e.inputType === 'date' ? d.toISOString().slice(0, 10) : `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`; }
    case 'PINCODE': return String(f.number.int({ min: 110001, max: 855999 }));
    case 'ADDRESS': return `${f.location.buildingNumber()}, ${f.location.street()}`;
    case 'PASSWORD': return `Qx${f.string.alphanumeric(8)}#7`;
    case 'OTP': return String(f.number.int({ min: 100000, max: 999999 }));
    case 'ACCOUNT': return String(f.number.int({ min: 10000000000, max: 99999999999 }));
    case 'IFSC': return id.ifsc(f);
    case 'CARD': return id.card(f);
  }
}
const toImg = async (png: Buffer): Promise<Img> => { const { data, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true }); return { data: new Uint8ClampedArray(data), width: info.width, height: info.height }; };
const readable = (txt: string, v: string) => normalizeValue(txt).includes(normalizeValue(v));
const PH = /<[A-Z_]+_\d+>/g;

const ner = await NerDetector.create({ localModelPath: M });
const ocr = await PaddleOcr.create(ort as any, `${M}paddleocr/det.onnx`, `${M}paddleocr/rec.onnx`, readFileSync(`${M}paddleocr/dict.txt`, 'utf8'));
const yn = await YuNet.create(ort as any, `${M}yunet/face_detection_yunet_2023mar.onnx`);
const browser = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: true, args: ['--no-sandbox', '--disable-gpu', '--lang=en-IN'] });
const results: any[] = [];
for (const line of lines) {
  const [cat, url] = line.split(/\s+/, 2) as [string, string];
  const slug = new URL(url).hostname.replace(/^www\./, '').replace(/[^a-z0-9]+/g, '-') + '-' + results.length;
  const r: any = { cat, url, slug };
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 900 });
  await page.setUserAgent('Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36');
  page.setDefaultTimeout(20000);
  const work = (async () => {
    const resp = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => null);
    r.status = resp?.status() ?? 0;
    await new Promise((res) => setTimeout(res, 7000));
    r.title = (await page.title()).slice(0, 80);
    await page.evaluate(inpage);
    const pre = (await page.evaluate('window.__ouro.observe()')) as RawObservation;
    const truth: { type: T; value: string; nodeId: string; label: string }[] = [];
    for (const e of pre.elements) {
      const t = classify(e);
      if (!t) continue;
      const v = valueFor(t, e);
      if (await page.evaluate(`window.__ouro.fill(${JSON.stringify(e.nodeId)}, ${JSON.stringify(v)})`)) truth.push({ type: t, value: v, nodeId: e.nodeId, label: (e.name || e.placeholder || e.htmlName || '').slice(0, 40) });
    }
    r.inputs = pre.elements.filter((e) => e.tag === 'input' || e.tag === 'textarea').length;
    r.elements = pre.elements.length;
    r.filled = truth.length;
    await new Promise((res) => setTimeout(res, 400));
    const t0 = performance.now();
    const raw = (await page.evaluate('window.__ouro.observe()')) as RawObservation;
    const t1 = performance.now();
    await ner.prime(raw.elements.flatMap((e) => [e.name, e.text, e.value]).filter(Boolean));
    const map = new PlaceholderMap();
    const { screen } = sanitize(raw, map, { extraDetectors: [(t: string): TextMatch[] => ner.lookup(t)] });
    const t2 = performance.now();
    r.observeMs = +(t1 - t0).toFixed(1); r.sanitizeMs = +(t2 - t1).toFixed(1);
    const wire = JSON.stringify(wireScreenMap(screen));
    r.bytes = wire.length;
    const scan = wire.replace(/"bbox":\[[^\]]*\]/g, '"bbox":[]');
    const nscan = normalizeValue(scan);
    r.fields = truth.map((t) => {
      const i = raw.elements.findIndex((e) => e.value === t.value);
      const se = i >= 0 ? screen.elements[i] : undefined;
      const leaked = normalizeValue(t.value).length >= 5 ? nscan.includes(normalizeValue(t.value)) : new RegExp(`(?<![A-Za-z0-9])${t.value}(?![A-Za-z0-9])`).test(scan);
      return { type: t.type, label: t.label, found: i >= 0, masked: !!se && (se.value ?? '').match(PH) !== null && !leaked, placeholder: (se?.value ?? '').match(PH)?.[0] ?? null, leaked };
    });
    const filledIdx = new Set(truth.map((t) => raw.elements.findIndex((e) => e.value === t.value)));
    r.falseMasks = screen.elements.flatMap((se, i) => filledIdx.has(i) ? [] : [...`${se.label} ${se.value ?? ''}`.matchAll(PH)].map((m) => ({ ph: m[0], raw: `${raw.elements[i]?.name ?? ''} ${raw.elements[i]?.text ?? ''}`.slice(0, 90) })));
    // Image path on the filled viewport
    const shot = Buffer.from(await page.screenshot({ type: 'png' }));
    writeFileSync(`${OUT}${slug}-filled.png`, shot);
    const img = await toImg(shot);
    const before = (await ocr.read(img)).map((l) => l.text).join('\n');
    const tv = performance.now();
    const ls = await ocr.read(img); const faces = await yn.detect(img);
    const dets = await redactImage(img, ls, faces, { extraDetectors: [(t) => ner.detect(t)] });
    const re = await ocr.read(img);
    dets.push(...(await redactImage(img, re, [], { extraDetectors: [(t) => ner.detect(t)] })));
    r.visionMs = +(performance.now() - tv).toFixed(0);
    const masked = await sharp(Buffer.from(img.data.buffer), { raw: { width: img.width, height: img.height, channels: 4 } }).png().toBuffer();
    writeFileSync(`${OUT}${slug}-masked.png`, masked);
    const after = (await ocr.read(await toImg(masked))).map((l) => l.text).join('\n');
    r.img = { visibleBefore: truth.filter((t) => t.type !== 'PASSWORD' && readable(before, t.value)).length, readableAfter: truth.filter((t) => t.type !== 'PASSWORD' && readable(after, t.value)).map((t) => t.type), boxes: dets.length };
    r.ok = true;
  })();
  try { await Promise.race([work, new Promise((_, rej) => setTimeout(() => rej(new Error('page budget 150s')), 150000))]); }
  catch (e) { r.ok = false; r.error = String(e).slice(0, 160); }
  await page.close().catch(() => {});
  results.push(r);
  console.log(JSON.stringify({ slug: r.slug, status: r.status, filled: r.filled, masked: r.fields?.filter((x: any) => x.masked).length, leaks: r.fields?.filter((x: any) => x.leaked).length, fm: r.falseMasks?.length, img: r.img, err: r.error }));
}
await browser.close();
writeFileSync(`${OUT}results.json`, JSON.stringify(results, null, 1));
process.exit(0);
