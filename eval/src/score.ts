import { leakGate, normalizeValue, PlaceholderMap, sanitize, wireScreenMap, type PiiType, type TextDetector } from '@ouroboros/core';
import { Window } from 'happy-dom';
import type { NerDetector } from '@ouroboros/ner';
import { NodeRegistry, observe } from '../../extension/lib/observe';
import type { Page } from './generate';

export interface PageScore {
  id: string;
  template: string;
  tp: { type: PiiType }[];
  fn: { type: PiiType }[];
  fp: { type: PiiType; decoy: boolean }[];
  leakedTypes: PiiType[];
  gateProd: boolean;
  gateTest: boolean;
  ms: number;
  bytes: number;
}

function withDom<T>(html: string, fn: (doc: Document) => T): T {
  const win = new Window({ url: 'https://test.example.in/page', width: 1280, height: 800 });
  const g = globalThis as Record<string, unknown>;
  const keys = ['HTMLInputElement', 'HTMLTextAreaElement', 'HTMLSelectElement', 'NodeFilter', 'CSS', 'Event', 'InputEvent', 'MutationObserver'];
  const saved = keys.map((k) => g[k]);
  keys.forEach((k) => { g[k] = (win as unknown as Record<string, unknown>)[k]; });
  try {
    win.document.body.innerHTML = html;
    return fn(win.document as unknown as Document);
  } finally {
    keys.forEach((k, i) => { g[k] = saved[i]; });
    void win.happyDOM.close();
  }
}

function inWire(wire: string, normWire: string, value: string): boolean {
  const nv = normalizeValue(value);
  if (nv.length >= 6) return normWire.includes(nv);
  const re = new RegExp(`(?<![A-Za-z0-9]|\\d[.,])${value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![A-Za-z0-9]|[.,]\\d)`, 'i');
  return re.test(wire);
}

export async function scorePage(page: Page, ner?: NerDetector): Promise<PageScore> {
  const map = new PlaceholderMap();
  let n = 0;
  const rect = () => ({ x: 10, y: 10 + 30 * n++, w: 400, h: 24 });
  const t0 = performance.now();
  const obs = withDom(page.html, (doc) => observe(doc, new NodeRegistry(), rect));
  const extra: TextDetector[] = [];
  if (ner) {
    await ner.prime(obs.elements.flatMap((e) => [e.name, e.text, e.value]).filter(Boolean));
    extra.push(ner.lookup);
  }
  const wireObj = wireScreenMap(sanitize(obs, map, { extraDetectors: extra }).screen);
  const ms = performance.now() - t0;
  const wire = JSON.stringify(wireObj);
  const normWire = normalizeValue(wire);

  const preds = map.values().map((p) => ({ type: p.type, norm: normalizeValue(p.value) }));
  const truthNorm = page.truth.map((t) => ({ ...t, norm: normalizeValue(t.value) }));
  const decoyNorm = new Set(page.decoys.map(normalizeValue));

  const tp: PageScore['tp'] = [];
  const fn: PageScore['fn'] = [];
  for (const t of truthNorm) {
    if (preds.some((p) => p.type === t.type && p.norm === t.norm)) tp.push({ type: t.type });
    else fn.push({ type: t.type });
  }
  const fp: PageScore['fp'] = [];
  for (const p of preds) {
    if (!truthNorm.some((t) => t.type === p.type && t.norm === p.norm)) fp.push({ type: p.type, decoy: decoyNorm.has(p.norm) });
  }
  const leakedTypes = page.truth
    .filter((t) => {
      const frags = (t as { fragments?: string[] }).fragments;
      return frags ? frags.every((fr) => inWire(wire, normWire, fr)) : inWire(wire, normWire, t.value);
    })
    .map((t) => t.type);
  const gateProd = (await leakGate(wire, map)).pass;
  const gateTest = (await leakGate(wire, map, { canaries: page.truth.map((t) => t.value).filter((v) => normalizeValue(v).length >= 6) })).pass;
  return { id: page.id, template: page.template, tp, fn, fp, leakedTypes, gateProd, gateTest, ms, bytes: wire.length };
}

export interface Summary {
  pages: number;
  perType: Record<string, { tp: number; fn: number; fp: number; precision: number; recall: number; f1: number }>;
  micro: { precision: number; recall: number; f1: number };
  structured: { precision: number; recall: number; f1: number };
  decoysFlagged: number;
  decoysTotal: number;
  leakedValues: number;
  totalValues: number;
  leakedByType: Record<string, number>;
  pagesWithLeak: number;
  gateProdPass: number;
  gateProdPassWithLeak: number;
  gateTestPass: number;
  gateTestPassWithLeak: number;
  msMean: number;
  msP95: number;
  bytesMean: number;
}

const prf = (tp: number, fp: number, fn: number) => {
  const precision = tp + fp ? tp / (tp + fp) : 1;
  const recall = tp + fn ? tp / (tp + fn) : 1;
  const f1 = precision + recall ? (2 * precision * recall) / (precision + recall) : 0;
  return { precision, recall, f1 };
};

/** Types that rules are designed for; NAME/ADDRESS/ACCOUNT-in-text need NER (Phase 6). */
export const UNSTRUCTURED: PiiType[] = ['NAME', 'ADDRESS'];

export function summarize(scores: PageScore[], decoysPerPage: number): Summary {
  const agg: Record<string, { tp: number; fn: number; fp: number }> = {};
  const bump = (t: string, k: 'tp' | 'fn' | 'fp') => { (agg[t] ??= { tp: 0, fn: 0, fp: 0 })[k]++; };
  for (const s of scores) {
    s.tp.forEach((x) => bump(x.type, 'tp'));
    s.fn.forEach((x) => bump(x.type, 'fn'));
    s.fp.forEach((x) => bump(x.type, 'fp'));
  }
  const perType: Summary['perType'] = {};
  let T = 0, P = 0, N = 0, sT = 0, sP = 0, sN = 0;
  for (const [t, v] of Object.entries(agg).sort()) {
    perType[t] = { ...v, ...prf(v.tp, v.fp, v.fn) };
    T += v.tp; P += v.fp; N += v.fn;
    if (!UNSTRUCTURED.includes(t as PiiType)) { sT += v.tp; sP += v.fp; sN += v.fn; }
  }
  const leakedByType: Record<string, number> = {};
  scores.forEach((s) => s.leakedTypes.forEach((t) => { leakedByType[t] = (leakedByType[t] ?? 0) + 1; }));
  const ms = scores.map((s) => s.ms).sort((a, b) => a - b);
  return {
    pages: scores.length,
    perType,
    micro: prf(T, P, N),
    structured: prf(sT, sP, sN),
    decoysFlagged: scores.reduce((a, s) => a + s.fp.filter((f) => f.decoy).length, 0),
    decoysTotal: scores.length * decoysPerPage,
    leakedValues: scores.reduce((a, s) => a + s.leakedTypes.length, 0),
    totalValues: scores.reduce((a, s) => a + s.tp.length + s.fn.length, 0),
    leakedByType,
    pagesWithLeak: scores.filter((s) => s.leakedTypes.length).length,
    gateProdPass: scores.filter((s) => s.gateProd).length,
    gateProdPassWithLeak: scores.filter((s) => s.gateProd && s.leakedTypes.length).length,
    gateTestPass: scores.filter((s) => s.gateTest).length,
    gateTestPassWithLeak: scores.filter((s) => s.gateTest && s.leakedTypes.length).length,
    msMean: ms.reduce((a, b) => a + b, 0) / ms.length,
    msP95: ms[Math.min(ms.length - 1, Math.floor(ms.length * 0.95))]!,
    bytesMean: scores.reduce((a, s) => a + s.bytes, 0) / scores.length,
  };
}
