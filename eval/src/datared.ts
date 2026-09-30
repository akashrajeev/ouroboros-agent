/** Data-reduction measurement: raw page HTML bytes vs sanitized wire payload bytes.
 *  Real pipeline: extension observe() -> core sanitize() -> wireScreenMap() -> JSON.
 *  Shipped config: rules + patterns + NER (bert-small-pii int8). */
import { PlaceholderMap, sanitize, wireScreenMap } from '@ouroboros/core';
import { NerDetector } from '@ouroboros/ner';
import { generatePages } from './generate';
import { withDom } from './score';
import { NodeRegistry, observe } from '../../extension/lib/observe';

const models = new URL('../../models/', import.meta.url).pathname;
const ner = await NerDetector.create({ localModelPath: models });
const pages = generatePages(25); // seed 26171, 5 templates x 5
const rect = () => ({ x: 0, y: 0, w: 100, h: 20 });

const byTemplate: Record<string, { raw: number[]; san: number[] }> = {};
for (const p of pages) {
  await Promise.resolve();
  const raw = Buffer.byteLength(p.html, 'utf8');
  const wire = await withDom(p.html, async (doc) => {
    const obs = observe(doc, new NodeRegistry(), rect);
    await ner.prime(obs.elements.flatMap((e) => [e.name, e.text, e.value]).filter(Boolean) as string[]);
    return JSON.stringify(wireScreenMap(sanitize(obs, new PlaceholderMap(), { extraDetectors: [ner.lookup] }).screen));
  });
  const san = Buffer.byteLength(wire, 'utf8');
  (byTemplate[p.template] ??= { raw: [], san: [] }).raw.push(raw);
  (byTemplate[p.template] ??= { raw: [], san: [] }).san.push(san);
}
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
const out = Object.entries(byTemplate).map(([t, v]) => ({
  template: t, pages: v.raw.length,
  rawMean: Math.round(mean(v.raw)), sanMean: Math.round(mean(v.san)),
  reductionPct: +(100 * (1 - mean(v.san) / mean(v.raw))).toFixed(1),
}));
console.log(JSON.stringify(out, null, 1));
