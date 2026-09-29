/** Live DOM exhibit: re-runs the observe->fill->sanitize steps of the LinkedIn clean2-v013 run
 *  (same seed 1102 -> same synthetic values) and dumps the real DOM tags + sanitized screen-map JSON. */
import { fakerEN_IN as f } from '@faker-js/faker';
import { PlaceholderMap, sanitize, type RawObservation } from '@ouroboros/core';
import { NerDetector } from '@ouroboros/ner';
import puppeteer from 'puppeteer-core';
import { readFileSync } from 'node:fs';

const M = new URL('../../models/', import.meta.url).pathname;
f.seed(1102);
const EMAIL = `${f.person.firstName().toLowerCase()}.${f.number.int({ min: 10, max: 99 })}@gmail.com`;
const PW = `Qx${f.string.alphanumeric(8)}#7`;
const inpage = readFileSync('/tmp/rp-inpage.js', 'utf8');

const browser = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: true, args: ['--no-sandbox', '--disable-gpu', '--lang=en-IN'] });
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 900 });
await page.setUserAgent('Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36');
await page.goto('https://www.linkedin.com/signup', { waitUntil: 'domcontentloaded', timeout: 30000 });
await new Promise((r) => setTimeout(r, 7000));
await page.evaluate(inpage);

const pre = (await page.evaluate('window.__ouro.observe()')) as RawObservation;
const emailEl = pre.elements.find((e: any) => (e.inputType ?? '').toLowerCase() === 'email' || /e-?mail/i.test([e.name, e.htmlName, e.htmlId, e.placeholder, e.autocomplete].filter(Boolean).join(' ')));
const pwEl = pre.elements.find((e: any) => (e.inputType ?? '').toLowerCase() === 'password');
if (!emailEl || !pwEl) throw new Error('inputs not found');
await page.evaluate(`window.__ouro.fill(${(emailEl as any).nodeId ? JSON.stringify((emailEl as any).nodeId) : 'undefined'}, ${JSON.stringify(EMAIL)})`);
await page.evaluate(`window.__ouro.fill(${JSON.stringify((pwEl as any).nodeId)}, ${JSON.stringify(PW)})`);

const rawHtml = await page.evaluate(`(() => {
  const em = document.querySelector('input[type=email], input[name*=mail i], input[autocomplete=username]');
  const pw = document.querySelector('input[type=password]');
  const ser = (el) => { if (!el) return null; const c = el.cloneNode(); c.setAttribute('value', el.value); return c.outerHTML; };
  return { email: ser(em), pw: ser(pw) };
})()`);

const post = (await page.evaluate('window.__ouro.observe()')) as RawObservation;
const ner = await NerDetector.create({ localModelPath: M });
const texts: string[] = [];
for (const e of post.elements as any[]) { if (e.value) texts.push(e.value); if (e.label) texts.push(e.label); }
await ner.prime(texts);
const map = new PlaceholderMap();
const out = sanitize(post, map, { extraDetectors: [ner.lookup] });
const san = out.screen.elements.filter((e: any) => e.value);
console.log(JSON.stringify({ EMAIL, PW, rawHtml, san }, null, 1));
await browser.close();
