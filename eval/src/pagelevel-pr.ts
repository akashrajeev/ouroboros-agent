/** Page-level P/R capture (Track: real-site annotation). For each usable real page:
 * fill seeded synthetic values (same policy as Phase 12C), observe, sanitize with NER,
 * and dump the raw observation, sanitized screen map, detections, and placeholder map
 * so a human-annotated ground truth can be scored at span level.
 * No form submission. Usage: npx tsx eval/src/pagelevel-pr.ts [urlsFile] [seed] [tag]
 */
import { fakerEN_IN as f } from '@faker-js/faker';
import { PlaceholderMap, sanitize, type RawObservation, type RawElement } from '@ouroboros/core';
import { NerDetector } from '@ouroboros/ner';
import puppeteer from 'puppeteer-core';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import * as id from './ids';
const M = new URL('../../models/', import.meta.url).pathname;
const [urlsFile = 'pagelevel-5.txt', seedArg = '12131', tag = `pagelevel-${seedArg}`] = process.argv.slice(2);
f.seed(Number(seedArg));
const OUT = new URL(`../results/${tag}/`, import.meta.url).pathname; mkdirSync(OUT, { recursive: true });
const inpage = readFileSync('/tmp/rp-inpage.js', 'utf8');
const urls = readFileSync(urlsFile, 'utf8').split('\n').map((x) => x.trim()).filter((x) => x.startsWith('https://'));
type T = 'NAME' | 'EMAIL' | 'PHONE' | 'AADHAAR' | 'PAN' | 'DOB' | 'PINCODE' | 'ADDRESS' | 'PASSWORD' | 'OTP' | 'ACCOUNT' | 'IFSC' | 'CARD';
function classify(e: RawElement): T | null {
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
function valueFor(t: T, e: RawElement): string {
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
const slug = (u: string) => new URL(u).hostname.replace(/^www\./, '').split('.')[0]!;
const ner = await NerDetector.create({ localModelPath: M });
const browser = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: true, args: ['--no-sandbox', '--disable-gpu', '--lang=en-IN'] });
for (const [index, url] of urls.entries()) {
  const page = await browser.newPage(); await page.setViewport({ width: 1280, height: 900 });
  page.setDefaultTimeout(7000);
  const site = slug(url);
  try {
    const resp = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 12000 }).catch(() => null);
    await page.evaluate(inpage);
    const pre = await page.evaluate('window.__ouro.observe()') as RawObservation;
    const fills: { type: T; value: string; nodeId: string; label: string }[] = [];
    for (const e of pre.elements) {
      const t = classify(e); if (!t) continue; const value = valueFor(t, e);
      if (await page.evaluate(`window.__ouro.fill(${JSON.stringify(e.nodeId)},${JSON.stringify(value)})`)) fills.push({ type: t, value, nodeId: e.nodeId, label: e.name || e.placeholder || '' });
    }
    const raw = await page.evaluate('window.__ouro.observe()') as RawObservation;
    await ner.prime(raw.elements.flatMap((e) => [e.name, e.text, e.value, e.context ?? '', ...(e.options ?? [])]).filter(Boolean));
    const map = new PlaceholderMap();
    const { screen, detections } = sanitize(raw, map, { extraDetectors: [(s: string) => ner.lookup(s)] });
    await page.screenshot({ path: `${OUT}${site}.png` });
    writeFileSync(`${OUT}${site}.capture.json`, JSON.stringify({
      index, url, finalUrl: page.url(), status: resp?.status() ?? 0, viewport: raw.viewport,
      fills, raw: raw.elements, opaque: raw.opaque, screen: screen.elements, detections,
      placeholders: map.exportLocal(),
    }, null, 2));
    console.log(JSON.stringify({ site, status: resp?.status() ?? 0, elements: raw.elements.length, fills: fills.length, detections: detections.length, tokens: map.size }));
  } catch (e) { console.log(JSON.stringify({ site, error: String(e).slice(0, 200) })); }
  await page.close().catch(() => {});
}
await browser.close();
