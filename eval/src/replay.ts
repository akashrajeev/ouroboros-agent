/**
 * Phase 8 sample: end-to-end replay of the device loop against the real FastAPI stub server.
 * KYC and checkout pages are emptied, the task carries the values, the stub planner fills
 * fields with placeholders, the device rehydrates locally, and every step is logged as an
 * A12 StepRecord. Output: eval/results/metrics-sample.csv + metrics-sample.md.
 * Usage: (cd server && uvicorn app.main:app --port 8000) & npm run replay --workspace eval -- [n]
 */
import { normalizeValue, summarizeSteps, toCsv, type StepRecord, type TextMatch } from '@ouroboros/core';
import { NerDetector } from '@ouroboros/ner';
import { Window } from 'happy-dom';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { runTask } from '../../extension/lib/agentLoop';
import { executeOnElement } from '../../extension/lib/execute';
import { NodeRegistry, observe } from '../../extension/lib/observe';
import { generatePages, type Page } from './generate';

const SERVER = process.env.OURO_SERVER ?? 'http://127.0.0.1:8000';
const TAG = process.env.OURO_TAG ?? 'metrics-sample';
const M = new URL('../../models/', import.meta.url).pathname;

async function withDomAsync<T>(html: string, fn: (doc: Document) => Promise<T>): Promise<T> {
  const win = new Window({ url: 'https://kyc.example.in/form', width: 1280, height: 800 });
  const g = globalThis as Record<string, unknown>;
  const keys = ['HTMLInputElement', 'HTMLTextAreaElement', 'HTMLSelectElement', 'NodeFilter', 'CSS', 'Event', 'InputEvent', 'MutationObserver'];
  const saved = keys.map((k) => g[k]);
  keys.forEach((k) => { g[k] = (win as unknown as Record<string, unknown>)[k]; });
  try {
    win.document.body.innerHTML = html;
    return await fn(win.document as unknown as Document);
  } finally {
    keys.forEach((k, i) => { g[k] = saved[i]; });
    await win.happyDOM.close();
  }
}

export async function replay(n: number) {
  const pages = (generatePages(n * 3) as Page[]).filter((p) => p.template === 'kyc' || p.template === 'checkout').slice(0, n);
  const health = await fetch(`${SERVER}/health`).then((r) => r.json() as Promise<{ planner: string }>);
  let ner: NerDetector | undefined, loadMs = 0;
  if (existsSync(`${M}bert-small-pii/onnx/model_quantized.onnx`)) {
    const t = performance.now();
    ner = await NerDetector.create({ localModelPath: M });
    loadMs = performance.now() - t;
  }
  const rows: StepRecord[] = [];
  const outcomes: Record<string, number> = {};
  let filledOk = 0, filledTotal = 0, bodies = 0, bodiesWithValue = 0;
  for (const [i, page] of pages.entries()) {
    await withDomAsync(page.html, async (doc) => {
      const inputs = Array.from(doc.querySelectorAll('input,textarea')) as HTMLInputElement[];
      const want = new Map(inputs.map((el) => [el, el.value]));
      inputs.forEach((el) => { el.value = ''; el.removeAttribute('value'); if (el.tagName === 'TEXTAREA') el.textContent = ''; });
      // How a user would type it: labelled values. Secrets (password/OTP) are never put in a task.
      const LABEL: Record<string, string> = { NAME: 'my name is', DOB: 'date of birth', PHONE: 'mobile', EMAIL: 'email', AADHAAR: 'Aadhaar', PAN: 'PAN', ADDRESS: 'address', PINCODE: 'PIN code', CARD: 'card', UPI: 'UPI' };
      const given = page.truth.filter((t) => LABEL[t.type]);
      const task = `Fill this form. ${given.map((t) => `${LABEL[t.type]} ${t.value}`).join('; ')}`;
      const expected = new Set(given.map((t) => t.value));
      const reg = new NodeRegistry();
      let k = 0;
      const rect = () => ({ x: 10, y: 10 + 30 * k++, w: 400, h: 24 });
      const res = await runTask(task, {
        observe: async () => { k = 0; return observe(doc, reg, rect); },
        execute: async (nodeId, op, text) => executeOnElement(reg.get(nodeId), op, text),
        post: async (body) => {
          // Independent of the leak gate: does any real value appear in what we send?
          bodies++;
          const nb = normalizeValue(body);
          if (page.truth.some((t) => body.includes(t.value) || (normalizeValue(t.value).length >= 6 && nb.includes(normalizeValue(t.value))))) bodiesWithValue++;
          const r = await fetch(`${SERVER}/step`, { method: 'POST', headers: { 'content-type': 'application/json' }, body });
          if (!r.ok) throw new Error(`server ${r.status}: ${await r.text()}`);
          return r.json() as Promise<{ action: unknown }>;
        },
        confirm: async () => true,
        settle: async () => {},
        detectText: ner ? async (texts) => { await ner!.prime(texts); return (t: string): TextMatch[] => ner!.lookup(t); } : undefined,
        modelLoadMs: () => (i === 0 ? loadMs : 0),
        record: (r) => rows.push(r),
      }, { runId: `replay-${String(i).padStart(3, '0')}-${page.template}`, maxSteps: 25 });
      outcomes[res.status] = (outcomes[res.status] ?? 0) + 1;
      for (const [el, v] of want) {
        if (!v || !expected.has(v)) continue;
        filledTotal++;
        if (el.value === v) filledOk++;
        else if (process.env.OURO_DEBUG) console.error(`MISS ${page.template} ${el.getAttribute('name')}: want=${JSON.stringify(v)} got=${JSON.stringify(el.value)} inTask=${task.includes(v)}`);
      }
    });
  }
  const s = summarizeSteps(rows);
  const dir = new URL('../results/', import.meta.url).pathname;
  mkdirSync(dir, { recursive: true });
  writeFileSync(`${dir}${TAG}.csv`, toCsv(rows));
  const st = Object.entries(s.stages).map(([k, v]) => `| ${k} | ${v.p50.toFixed(2)} | ${v.p95.toFixed(2)} |`).join('\n');
  const md = `# Metrics sample: end-to-end replay (A12)

${pages.length} emptied KYC/checkout pages from the Faker en_IN generator. The device loop runs in Node (happy-dom) against the real FastAPI server (planner: \`${health.planner}\`). The task text carries the real values; the server only sees placeholders.${ner ? ' NER on.' : ' NER off (model not fetched).'} Rows: \`${TAG}.csv\` (${rows.length} steps), viewable in the extension dashboard (load CSV).

- Run outcomes: ${Object.entries(outcomes).map(([k, v]) => `${k} ${v}`).join(', ')}
- Fields filled with the exact original value after local rehydration: **${filledOk} of ${filledTotal}** (fields whose value the task supplied; password/OTP fields are never filled by design)
- Steps: ${s.steps}; G1 reused the sanitized screen on ${s.g1SkipPct.toFixed(1)}%; masked image sent on ${s.imageStepPct.toFixed(1)}%
- Leak-gate blocks: ${s.blocked}. Independent check over every request body sent: **${bodiesWithValue} of ${bodies}** contained a real value (exact or normalized)
- Payload per step: mean ${s.bytesMean.toFixed(0)} bytes, ~${s.tokensMean.toFixed(0)} tokens (bytes/4 estimate); ${s.tokensTotal} tokens for the whole replay
- Model warm-up (NER): ${s.modelLoadMs.toFixed(0)} ms

| Stage | p50 ms | p95 ms |
|---|--:|--:|
${st}

## Caveats

- ${health.planner.startsWith('stub') ? 'The server stage is the stub planner on localhost, so M5 here excludes real VLM inference and network time. It is a lower bound for the device-side cost only.' : 'The server stage includes the tunnel round-trip to the free-tier GPU, so it overstates what a co-located server would add.'}
- The planner fills one field per step, so many steps see a changed screen; G1 skips here come from the re-observe after each action.
`;
  writeFileSync(`${dir}${TAG}.md`, md);
  console.log(md);
}

if (import.meta.url === `file://${process.argv[1]}`) await replay(Number(process.argv[2] ?? 20));
