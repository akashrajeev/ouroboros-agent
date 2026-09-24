import { mkdirSync, writeFileSync } from 'node:fs';
import { generateAdversarial } from './adversarial';
import { generatePages, type Page } from './generate';
import { NerDetector } from '@ouroboros/ner';
import { existsSync } from 'node:fs';
import { scorePage, summarize, type Summary } from './score';

const pct = (x: number) => (x * 100).toFixed(1);

export function toMarkdown(name: string, s: Summary): string {
  const rows = Object.entries(s.perType)
    .map(([t, v]) => `| ${t} | ${v.tp + v.fn} | ${v.tp} | ${v.fp} | ${v.fn} | ${pct(v.precision)} | ${pct(v.recall)} | ${pct(v.f1)} |`)
    .join('\n');
  return `# Eval: ${name}

${s.pages} synthetic Faker en_IN pages (seed 26171, generated with \`npm run metrics --workspace eval -- ${s.pages}\`; templates: kyc, profile, bank, checkout, narrative). A detection counts only if both the value and the type match.

## PII detection (M2)

| Type | Support | TP | FP | FN | Precision % | Recall % | F1 % |
|------|--------:|---:|---:|---:|------------:|---------:|-----:|
${rows}

- **Micro, all types:** P ${pct(s.micro.precision)}%, R ${pct(s.micro.recall)}%, F1 ${pct(s.micro.f1)}%
- **Micro, structured types (without NAME/ADDRESS):** P ${pct(s.structured.precision)}%, R ${pct(s.structured.recall)}%, F1 ${pct(s.structured.f1)}%
- **Decoys flagged (look-alike non-PII: invalid checksums, order ids, prices, non-DOB dates):** ${s.decoysFlagged} of ${s.decoysTotal}

## Leakage (what would reach the server)

- Values present in the sanitized payload before the gate: **${s.leakedValues} of ${s.totalValues}** (${s.pagesWithLeak} pages)${Object.keys(s.leakedByType).length ? ` - by type: ${Object.entries(s.leakedByType).map(([t, n]) => `${t} ${n}`).join(', ')}` : ''}
- Production-mode leak gate (map + regex only): passed ${s.gateProdPass}/${s.pages} pages; **passed pages that still leaked: ${s.gateProdPassWithLeak}**
- Test-mode leak gate (+ ground-truth canaries): passed ${s.gateTestPass}/${s.pages} pages; passed pages that still leaked: ${s.gateTestPassWithLeak}

## Cost

- Observe + sanitize per page (Node, happy-dom, no models): mean ${s.msMean.toFixed(2)} ms, p95 ${s.msP95.toFixed(2)} ms
- Mean sanitized payload: ${Math.round(s.bytesMean)} bytes

## Caveats

- The page generator and the detectors come from the same team, so label wording and value formats overlap. Treat structured-type scores as an upper bound until the held-out adversarial set (unseen label variants, OCR noise, mixed scripts) is scored.
- NAME and ADDRESS are expected to be 0% here: they need the NER model (Phase 6). This is the "rules only" row of the ablation.
- Production-mode leak gate can only catch values it knows (map + patterns), so unmapped names pass it. Test mode plants the ground truth as canaries and blocks every leaking page.
`;
}

async function main() {
  const adv = process.argv[2] === 'adversarial';
  const n = adv ? 50 : Number(process.argv[2] ?? 60);
  const advSeed = Number(process.argv[3] ?? 777);
  const pages = (adv ? generateAdversarial(n, advSeed) : generatePages(n)) as Page[];
  const dir = new URL('../results/', import.meta.url).pathname;
  mkdirSync(dir, { recursive: true });
  const tag = adv ? `-adversarial-${advSeed}` : n === 60 ? '' : `-${n}`;
  const models = new URL('../../models/', import.meta.url).pathname;

  const configs: { file: string; title: string; ner?: NerDetector }[] = [{ file: 'baseline-rules', title: 'rules + patterns baseline (no models)' }];
  if (existsSync(`${models}bert-small-pii/onnx/model_quantized.onnx`)) {
    configs.push({ file: 'rules-ner', title: 'rules + patterns + NER (bert-small-pii int8)', ner: await NerDetector.create({ localModelPath: models }) });
  } else {
    console.warn('NER model not found; run scripts/fetch-models.sh for the +NER row');
  }

  const rows: string[] = [];
  for (const c of configs) {
    const scores = [];
    for (const p of pages) scores.push(await scorePage(p, c.ner));
    const s = summarize(scores, pages[0]!.decoys.length);
    const advRow: string[] = [];
    if (adv) {
      const byTpl: Record<string, { tp: number; n: number; leaks: number }> = {};
      scores.forEach((sc) => { const b = (byTpl[sc.template] ??= { tp: 0, n: 0, leaks: 0 }); b.tp += sc.tp.length; b.n += sc.tp.length + sc.fn.length; b.leaks += sc.leakedTypes.length; });
      advRow.push(`|  - by template: ${Object.entries(byTpl).map(([k, v]) => `${k} R ${pct(v.tp / v.n)}% leaks ${v.leaks}/${v.n}`).join('; ')} | | | | | | | |`);
    }
    writeFileSync(`${dir}${c.file}${tag}.json`, JSON.stringify(s, null, 2));
    writeFileSync(`${dir}${c.file}${tag}.md`, toMarkdown(c.title, s));
    const r = (t: string) => { const v = s.perType[t]; return v && v.tp + v.fn > 0 ? pct(v.recall) : '-'; };
    rows.push(`| ${c.title} | ${pct(s.structured.precision)} / ${pct(s.structured.recall)} | ${pct(s.micro.precision)} / ${pct(s.micro.recall)} | ${r('NAME')} | ${r('ADDRESS')} | ${s.decoysFlagged}/${s.decoysTotal} | ${s.leakedValues}/${s.totalValues} | ${s.msMean.toFixed(1)} / ${s.msP95.toFixed(1)} |`);
    rows.push(...advRow);
    if (c.ner) rows.push(`|  - NER model calls: ${c.ner.stats.calls}, cache hits: ${c.ner.stats.cacheHits}, model ms per call: ${(c.ner.stats.ms / Math.max(1, c.ner.stats.calls)).toFixed(1)} | | | | | | | |`);
  }
  const advNote = !adv ? '' : `\n\n${advSeed === 777 ? 'Seed 777 was inspected once (the first held-out run) and drove the generic fixes, so it is no longer clean; fresh seeds are the clean numbers.' : 'Fresh seed, never inspected before this run.'} Categories: label variants, Hindi labels, values split across elements, odd formats, headerless tables. Scored as-is.`;
  const table = `# ${adv ? 'HELD-OUT adversarial set' : 'Ablation'} (${n} pages, seed ${adv ? advSeed : 26171})${advNote}

| Config | Structured P / R % | All types P / R % | NAME R % | ADDRESS R % | Decoys flagged | Values leaked pre-gate | ms/page mean / p95 |
|---|---|---|---|---|---|---|---|
${rows.join('\n')}

Timing is Node + happy-dom on a CPU sandbox (onnxruntime-node for NER), not the in-browser WebGPU/WASM path. Browser numbers come from the extension metrics logger.
`;
  writeFileSync(`${dir}ablation${tag}.md`, table);
  console.log(table);
}

void main();
