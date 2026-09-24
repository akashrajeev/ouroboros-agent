/**
 * Phase 7 metrics: M1 proxy (screen-map recall + label accuracy vs DOM ground truth)
 * and G1 skip rate / cache hit rate on a replayed session.
 * Usage: npm run screenmap --workspace eval -- [n] [advSeed]
 */
import { Lru, observationKey, PlaceholderMap, sanitize, type ScreenMap } from '@ouroboros/core';
import { mkdirSync, writeFileSync } from 'node:fs';
import { NodeRegistry, observe } from '../../extension/lib/observe';
import { executeOnElement } from '../../extension/lib/execute';
import { generateAdversarial } from './adversarial';
import { generatePages, type Page } from './generate';
import { withDom } from './score';

const INTERACTIVE = 'input:not([type=hidden]),select,textarea,button,a[href],[role=button],[contenteditable=true]';
const clean = (s: string) => s.replace(/\s+/g, ' ').trim().toLowerCase();

function expectedLabel(el: Element, doc: Document): string {
  const aria = el.getAttribute('aria-label');
  if (aria) return aria;
  const id = el.getAttribute('id');
  const lab = id ? doc.querySelector(`label[for="${id}"]`) : null;
  if (lab) return lab.textContent ?? '';
  const wrap = el.closest('label');
  if (wrap) return wrap.textContent ?? '';
  if (el.tagName === 'BUTTON' || el.tagName === 'A') return el.textContent ?? '';
  return el.getAttribute('placeholder') ?? el.getAttribute('name') ?? '';
}

export function scoreScreenMap(page: Page) {
  let n = 0;
  const rect = () => ({ x: 10, y: 10 + 30 * n++, w: 400, h: 24 });
  return withDom(page.html, (doc) => {
    const reg = new NodeRegistry();
    const raw = observe(doc, reg, rect);
    const map = new PlaceholderMap();
    const { screen } = sanitize(raw, map);
    const byNode = new Map<Element, ScreenMap['elements'][number]>();
    for (const e of screen.elements) { const el = reg.get(screen.nodeOf[e.id]!); if (el) byNode.set(el, e); }
    const truth = Array.from(doc.querySelectorAll(INTERACTIVE));
    let found = 0, labelOk = 0;
    const misses: string[] = [];
    for (const el of truth) {
      const e = byNode.get(el);
      if (!e) { misses.push(el.outerHTML.slice(0, 80)); continue; }
      found++;
      const want = clean(expectedLabel(el, doc));
      // Labels may be tokenized if they contained PII; a placeholder counts as correct only if the truth label had PII.
      if (want && clean(e.label).includes(want.slice(0, 24))) labelOk++;
    }
    // Replay: 10 observations with 2 edits (type into first two textboxes) -> how many were unchanged?
    const cache = new Lru<ScreenMap>(64);
    let prev = '', skipped = 0;
    const boxes = truth.filter((el) => el.tagName === 'INPUT' || el.tagName === 'TEXTAREA').slice(0, 2);
    for (let step = 0; step < 10; step++) {
      if (step === 3 && boxes[0]) executeOnElement(boxes[0], 'type', 'x');
      if (step === 6 && boxes[1]) executeOnElement(boxes[1], 'type', 'y');
      n = 0;
      const r = observe(doc, reg, rect);
      const k = observationKey(r);
      if (k === prev || cache.get(k)) skipped++;
      else cache.set(k, sanitize(r, map).screen);
      prev = k;
    }
    return { truth: truth.length, found, labelOk, misses, skipped, steps: 10 };
  });
}

export function run(n: number, advSeed: number) {
  const sets: [string, Page[]][] = [['tuning', generatePages(n) as Page[]], [`adversarial-${advSeed}`, generateAdversarial(n, advSeed) as Page[]]];
  const pct = (a: number, b: number) => ((100 * a) / Math.max(1, b)).toFixed(1);
  let md = `# Eval: screen map (M1 proxy) and G1 gating\n\nGround truth = every interactive DOM element (\`${INTERACTIVE}\`) and its label from aria-label / label[for] / wrapping label / button text. Replay = 10 observations per page with 2 edits (typing into two fields), the rest unchanged.\n\n| Set | Pages | Interactive | In screen map | Recall % | Label correct % | Replay steps skipped by G1 % |\n|---|--:|--:|--:|--:|--:|--:|\n`;
  const allMisses: string[] = [];
  for (const [name, pages] of sets) {
    const s = pages.map(scoreScreenMap);
    const t = s.reduce((a, x) => ({ truth: a.truth + x.truth, found: a.found + x.found, labelOk: a.labelOk + x.labelOk, skipped: a.skipped + x.skipped, steps: a.steps + x.steps }), { truth: 0, found: 0, labelOk: 0, skipped: 0, steps: 0 });
    md += `| ${name} | ${pages.length} | ${t.truth} | ${t.found} | ${pct(t.found, t.truth)} | ${pct(t.labelOk, t.found)} | ${pct(t.skipped, t.steps)} |\n`;
    s.forEach((x) => allMisses.push(...x.misses));
  }
  md += `\nThe ceiling is 70% on pages with two or more text fields (7 of 10 observations unchanged) and 90% on pages with no text fields (table and narrative templates), so the blended ceiling is above 70%.\n\n## Caveats\n\n- Pages are self-generated; recall here says the observer handles our templates, not arbitrary sites. The label check is a prefix match.\n- The replay measures the DOM half of the change gate only; the pixel half (dHash tiles) is unit-tested but not in this replay.\n${allMisses.length ? `\n## Missed elements (first 10)\n\n${allMisses.slice(0, 10).map((m) => `- \`${m.replace(/`/g, "'")}\``).join('\n')}\n` : ''}`;
  const dir = new URL('../results/', import.meta.url).pathname;
  mkdirSync(dir, { recursive: true });
  writeFileSync(`${dir}screenmap.md`, md);
  console.log(md);
}

if (import.meta.url === `file://${process.argv[1]}`) run(Number(process.argv[2] ?? 100), Number(process.argv[3] ?? 778));
