/** Data reduction on REAL pages: rendered DOM bytes vs sanitized wire payload bytes.
 *  Headless Chrome -> observe() in page -> sanitize (rules+NER) -> wireScreenMap JSON. */
import { PlaceholderMap, sanitize, wireScreenMap, type RawObservation, type TextMatch } from '@ouroboros/core';
import { NerDetector } from '@ouroboros/ner';
import puppeteer from 'puppeteer-core';
import { readFileSync, writeFileSync } from 'node:fs';

const URLS: [string, string][] = [
  ['zerodha-signup', 'https://signup.zerodha.com/'],
  ['groww-login', 'https://groww.in/login'],
  ['flipkart-signup', 'https://www.flipkart.com/account/login?signup=true'],
  ['naukri-registration', 'https://www.naukri.com/registration/createAccount'],
  ['linkedin-signup', 'https://www.linkedin.com/signup'],
];
const M = new URL('../../models/', import.meta.url).pathname;
const ner = await NerDetector.create({ localModelPath: M });
const inpage = readFileSync('/tmp/rp-inpage.js', 'utf8');
const browser = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: true, args: ['--no-sandbox', '--disable-gpu', '--lang=en-IN'] });
const out: any[] = [];
for (const [slug, url] of URLS) {
  const page = await browser.newPage();
  try {
    const resp = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => null);
    await new Promise((r) => setTimeout(r, 2500));
    await page.evaluate(inpage);
    const obs = (await page.evaluate('window.__ouro.observe()')) as RawObservation;
    const rawHtml: string = await page.evaluate(() => document.documentElement.outerHTML);
    const map = new PlaceholderMap();
    const { screen } = sanitize(obs, map, { extraDetectors: [(t: string): TextMatch[] => ner.lookup(t)] });
    const wire = JSON.stringify(wireScreenMap(screen));
    out.push({ slug, status: resp?.status() ?? 0, rawBytes: Buffer.byteLength(rawHtml, 'utf8'), wireBytes: wire.length, elements: obs.elements.length });
    console.log(slug, resp?.status(), 'raw', out[out.length - 1].rawBytes, 'wire', wire.length);
  } catch (e) { console.log(slug, 'ERR', String(e).slice(0, 120)); }
  await page.close();
}
await browser.close();
writeFileSync('/tmp/deck/datared-real.json', JSON.stringify(out, null, 1));
