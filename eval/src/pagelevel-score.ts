/** Page-level P/R scorer: joins pagelevel-pr captures with manual annotations.
 * TP = annotated positive value masked (token in sanitized output).
 * FN = annotated positive left unmasked (verified verbatim in the wire map).
 * FP = masked token whose value matches no annotated positive.
 * TN = annotated benign lookalike correctly left unmasked.
 * Usage: npx tsx eval/src/pagelevel-score.ts [tag] [annotationDir]  (defaults pagelevel-12131 pagelevel)
 */
import { normalizeValue, wireScreenMap } from '@ouroboros/core';
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';

const [tag = 'pagelevel-12131', annDir = 'pagelevel'] = process.argv.slice(2);
const RES = new URL(`../results/${tag}/`, import.meta.url).pathname;
const ANN = new URL(`../annotation/${annDir}/`, import.meta.url).pathname;
const TOKEN_RE = /<([A-Z]+)_(\d+)>/g;

interface Positive { element: number; field: string; type: string; value: string; note?: string }
interface Benign { element: number; field: string; value: string; kind: string; expect: string }
interface Annotation { site: string; capture: string; positives: Positive[]; benign_lookalikes: Benign[]; notes: string[] }

const sites: any[] = [];
for (const f of readdirSync(ANN).filter((x) => x.endsWith('.json'))) {
  const ann = JSON.parse(readFileSync(ANN + f, 'utf8')) as Annotation;
  const cap = JSON.parse(readFileSync(RES + ann.capture, 'utf8'));
  const wire = JSON.stringify(wireScreenMap({ ...cap, elements: cap.screen } as any)).replace(/"bbox":\[[^\]]*\]/g, '"bbox":[]');
  const normWire = normalizeValue(wire);

  // masked tokens with the elements they appear on
  const masked: { token: string; type: string; value: string; elements: number[] }[] = [];
  for (const p of cap.placeholders as { token: string; type: string; value: string }[]) {
    const els = new Set<number>();
    cap.screen.forEach((s: any, i: number) => {
      const hay = `${s.label ?? ''}\n${s.value ?? ''}\n${(s.options ?? []).join('\n')}`;
      if (hay.includes(p.token)) els.add(i);
    });
    masked.push({ token: p.token, type: p.type, value: p.value, elements: [...els] });
  }

  const rows: any[] = [];
  let tp = 0, fn = 0, typeOk = 0;
  for (const pos of ann.positives) {
    const hit = masked.find((m) => {
      const a = normalizeValue(m.value), b = normalizeValue(pos.value);
      return a === b || (b.length >= 6 && a.includes(b)) || (a.length >= 6 && b.includes(a));
    });
    const leaked = normWire.includes(normalizeValue(pos.value));
    if (hit) { tp++; if (hit.type === pos.type) typeOk++; }
    else fn++;
    rows.push({ kind: 'positive', ...pos, masked: !!hit, token: hit?.token ?? null, tokenType: hit?.type ?? null, typeCorrect: hit ? hit.type === pos.type : null, leakedVerbatim: leaked });
  }
  let fp = 0;
  const fpRows: any[] = [];
  for (const m of masked) {
    const hit = ann.positives.some((pos) => {
      const a = normalizeValue(m.value), b = normalizeValue(pos.value);
      return a === b || (b.length >= 6 && a.includes(b)) || (a.length >= 6 && b.includes(a));
    });
    if (!hit) { fp++; fpRows.push({ kind: 'false_positive', token: m.token, tokenType: m.type, value: m.value, elements: m.elements }); }
  }
  let tn = 0, tnMiss = 0;
  for (const b of ann.benign_lookalikes) {
    const hit = masked.some((m) => normalizeValue(b.value).includes(normalizeValue(m.value)) || normalizeValue(m.value).includes(normalizeValue(b.value)));
    if (hit) tnMiss++; else tn++;
  }
  const precision = tp + fp ? tp / (tp + fp) : null;
  const recall = tp + fn ? tp / (tp + fn) : null;
  sites.push({
    site: ann.site, url: cap.finalUrl, elements: cap.raw.length,
    positives: ann.positives.length, tp, fn, fp, tn,
    benignLookalikesMasked: tnMiss,
    precision, recall, f1: precision !== null && recall !== null && precision + recall > 0 ? (2 * precision * recall) / (precision + recall) : null,
    typeAccuracyOnMasked: tp ? typeOk / tp : null,
    rows: [...rows, ...fpRows],
  });
}
const T = sites.reduce((a, s) => ({ tp: a.tp + s.tp, fn: a.fn + s.fn, fp: a.fp + s.fp, tn: a.tn + s.tn, pos: a.pos + s.positives }), { tp: 0, fn: 0, fp: 0, tn: 0, pos: 0 });
const microP = T.tp / (T.tp + T.fp), microR = T.tp / (T.tp + T.fn);
const macroP = sites.reduce((a, s) => a + (s.precision ?? 0), 0) / sites.length;
const macroR = sites.reduce((a, s) => a + (s.recall ?? 0), 0) / sites.length;
const out = {
  tag, generated: new Date().toISOString(),
  totals: { ...T, microPrecision: microP, microRecall: microR, microF1: (2 * microP * microR) / (microP + microR), macroPrecision: macroP, macroRecall: macroR },
  sites,
};
writeFileSync(`${RES}pagelevel-score.json`, JSON.stringify(out, null, 2));
const pct = (x: number | null) => (x === null ? 'n/a' : `${(x * 100).toFixed(1)}%`);
let md = `# Page-level P/R score (${tag})\n\n| Site | Elements | Positives | TP | FN | FP | Precision | Recall | F1 | Type acc |\n|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|\n`;
for (const s of sites) md += `| ${s.site} | ${s.elements} | ${s.positives} | ${s.tp} | ${s.fn} | ${s.fp} | ${pct(s.precision)} | ${pct(s.recall)} | ${pct(s.f1)} | ${pct(s.typeAccuracyOnMasked)} |\n`;
md += `| **micro total** | | ${T.pos} | ${T.tp} | ${T.fn} | ${T.fp} | ${pct(microP)} | ${pct(microR)} | ${pct(out.totals.microF1)} | |\n`;
md += `\nMacro precision ${pct(macroP)}, macro recall ${pct(macroR)}.\n\n## False positives\n`;
for (const s of sites) for (const r of s.rows.filter((x: any) => x.kind === 'false_positive'))
  md += `- ${s.site}: ${r.token} (${r.tokenType}) = ${JSON.stringify(r.value)} on element(s) ${r.elements.join(', ')}\n`;
md += `\n## False negatives / leaks\n`;
let any = false;
for (const s of sites) for (const r of s.rows.filter((x: any) => x.kind === 'positive' && (!x.masked || x.leakedVerbatim))) { any = true; md += `- ${s.site}: ${JSON.stringify(r.value)} masked=${r.masked} leakedVerbatim=${r.leakedVerbatim}\n`; }
if (!any) md += 'None. No annotated positive appears verbatim in any wire screen map.\n';
writeFileSync(`${RES}pagelevel-score.md`, md);
console.log(md);
