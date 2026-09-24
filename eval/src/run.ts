import { mkdirSync, writeFileSync } from 'node:fs';
import { generatePages } from './generate';
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
  const n = Number(process.argv[2] ?? 60);
  const pages = generatePages(n);
  const scores = [];
  for (const p of pages) scores.push(await scorePage(p));
  const s = summarize(scores, pages[0]!.decoys.length);
  const dir = new URL('../results/', import.meta.url).pathname;
  mkdirSync(dir, { recursive: true });
  const tag = n === 60 ? '' : `-${n}`;
  writeFileSync(`${dir}baseline-rules${tag}.json`, JSON.stringify(s, null, 2));
  writeFileSync(`${dir}baseline-rules${tag}.md`, toMarkdown('rules + patterns baseline (no models)', s));
  console.log(toMarkdown('rules + patterns baseline (no models)', s));
}

void main();
