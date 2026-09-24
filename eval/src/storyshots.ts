// Renders two static HTML views for the build-story doc: a synthetic KYC page as the user sees it,
// and the sanitized screen map the server receives for that same page. Also a dashboard from a real run CSV.
import { PlaceholderMap, sanitize, parseCsv, type TextMatch } from '@ouroboros/core';
import { NerDetector } from '@ouroboros/ner';
import { Window } from 'happy-dom';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { NodeRegistry, observe } from '../../extension/lib/observe';
import { renderDashboard } from '../../extension/lib/dashboard';
import { generatePages } from './generate';

const out = process.argv[2] ?? '/tmp/shots';
mkdirSync(out, { recursive: true });
const page = generatePages(40, 1111).find((p) => p.template === 'kyc')!;
const win = new Window({ url: 'https://kyc.example.in/form', width: 1280, height: 800 });
const g = globalThis as Record<string, unknown>;
for (const k of ['HTMLInputElement', 'HTMLTextAreaElement', 'HTMLSelectElement', 'NodeFilter', 'CSS', 'Event', 'InputEvent', 'MutationObserver']) g[k] = (win as unknown as Record<string, unknown>)[k];
win.document.body.innerHTML = page.html;
let k = 0;
const raw = observe(win.document as unknown as Document, new NodeRegistry(), () => ({ x: 10, y: 10 + 30 * k++, w: 400, h: 24 }));
const ner = await NerDetector.create({ localModelPath: new URL('../../models/', import.meta.url).pathname });
await ner.prime(raw.elements.flatMap((e) => [e.name, e.text, e.value]).filter(Boolean));
const map = new PlaceholderMap();
const { screen } = sanitize(raw, map, { extraDetectors: [(t: string): TextMatch[] => ner.lookup(t)] });
const css = 'body{font:15px/1.45 -apple-system,Segoe UI,Roboto,sans-serif;margin:28px;color:#1f1d1e;background:#fff}h2{font-size:17px;margin:0 0 12px}';
writeFileSync(`${out}/page.html`, `<!doctype html><meta charset=utf-8><style>${css}input,select{font:inherit;padding:4px 6px;margin:2px 0 8px;width:320px}label{display:block}</style><h2>What the user sees (synthetic KYC page, seed 1111)</h2>${page.html}`);
const rows = screen.elements.map((e) => `<tr><td>${e.id}</td><td>${e.role}</td><td>${esc(e.label)}</td><td>${esc(e.value ?? '')}</td></tr>`).join('');
writeFileSync(`${out}/screen.html`, `<!doctype html><meta charset=utf-8><style>${css}table{border-collapse:collapse;font:13px/1.35 ui-monospace,Menlo,monospace}td,th{border:1px solid #e3e1e3;padding:5px 9px;text-align:left}th{background:#f4efec}</style><h2>What the server receives for the same page (sanitized screen map)</h2><table><tr><th>id</th><th>role</th><th>label / text</th><th>value</th></tr>${rows}</table>`);
const csv = readFileSync(new URL('../results/phase10-unseen-13579.csv', import.meta.url), 'utf8');
writeFileSync(`${out}/dashboard.html`, `<!doctype html><meta charset=utf-8><style>${css}table{border-collapse:collapse}td,th{border:1px solid #ddd;padding:4px 8px}</style><h2>Extension metrics dashboard, loaded with the fresh-seed 13579 replay CSV</h2>${renderDashboard(parseCsv(csv))}`);
console.log(JSON.stringify({ truth: page.truth.map((t) => t.type), placeholders: map.size ?? null }));
function esc(s: string) { return s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]!); }
process.exit(0);
