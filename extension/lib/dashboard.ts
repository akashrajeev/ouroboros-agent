import { summarizeSteps, type StepRecord } from '@ouroboros/core';

const esc = (s: string) => s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]!);
const f = (n: number, d = 1) => n.toFixed(d);

/** Renders the A12 CSV as HTML: headline M4/M5 numbers, stage latency bars, per-run table. Pure string output. */
export function renderDashboard(rows: StepRecord[]): string {
  if (!rows.length) return '<p>No metrics yet. Run a task, or load a CSV.</p>';
  const s = summarizeSteps(rows);
  const max = Math.max(1, ...Object.values(s.stages).map((v) => v.p95));
  const bars = (Object.entries(s.stages) as [string, { p50: number; p95: number }][]).map(([k, v]) => `
    <tr><td>${k}</td><td>${f(v.p50)}</td><td>${f(v.p95)}</td>
    <td><svg width="240" height="14"><rect width="${(240 * v.p95) / max}" height="14" fill="#f2b8b5"/><rect width="${(240 * v.p50) / max}" height="14" fill="#c0392b"/></svg></td></tr>`).join('');
  const byRun = new Map<string, StepRecord[]>();
  rows.forEach((r) => byRun.set(r.run_id, [...(byRun.get(r.run_id) ?? []), r]));
  const runs = [...byRun].map(([id, rs]) => {
    const last = rs[rs.length - 1]!;
    return `<tr><td>${esc(id)}</td><td>${esc(last.origin)}</td><td>${rs.length}</td><td>${rs.filter((r) => r.reused).length}</td><td>${rs.filter((r) => r.image_sent).length}</td><td>${Math.max(...rs.map((r) => r.placeholders))}</td><td>${rs.reduce((a, r) => a + r.bytes, 0)}</td><td>${esc(last.outcome)}</td></tr>`;
  }).join('');
  return `
  <section class="cards">
    <div><b>${s.steps}</b><span>steps / ${s.runs} runs</span></div>
    <div><b>${f(s.stages.total.p50, 0)} / ${f(s.stages.total.p95, 0)} ms</b><span>step p50 / p95 (M5)</span></div>
    <div><b>${f(s.g1SkipPct)}%</b><span>steps reusing the sanitized screen (G1)</span></div>
    <div><b>${f(s.imageStepPct)}%</b><span>steps that sent a masked image (G5)</span></div>
    <div><b>${f(s.bytesMean, 0)} B / ${f(s.tokensMean, 0)} tok</b><span>mean payload per step (M4)</span></div>
    <div><b>${s.blocked}</b><span>steps blocked by the leak gate</span></div>
    <div><b>${f(s.modelLoadMs, 0)} ms</b><span>model warm-up (M4)</span></div>
  </section>
  <h2>Stage latency (ms)</h2>
  <table><tr><th>stage</th><th>p50</th><th>p95</th><th></th></tr>${bars}</table>
  <h2>Runs</h2>
  <table><tr><th>run</th><th>origin</th><th>steps</th><th>G1 skips</th><th>images</th><th>PII values</th><th>bytes</th><th>outcome</th></tr>${runs}</table>`;
}
