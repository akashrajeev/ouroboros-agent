/**
 * A12 metrics. One row per loop step; no raw values, no labels, no URLs beyond origin.
 * Columns map to the SIH26171 metrics: M1 visual context, M2 PII P/R (offline eval),
 * M3 redaction precision, M4 client resources, M5 end-to-end latency.
 */
export interface StepRecord {
  run_id: string;
  step: number;
  ts: number;
  origin: string;
  outcome: 'sent' | 'blocked' | 'rejected' | 'declined' | 'done' | 'error';
  action: string;
  reused: boolean;          // G1 skip (M4)
  elements: number;         // screen-map size (M1)
  opaque: number;           // opaque regions on screen (M1)
  placeholders: number;     // distinct PII values tokenized so far (M2/M3)
  image_detections: number; // masked boxes in the screenshot (M3)
  image_sent: boolean;      // G5 escalation
  bytes: number;            // payload bytes after gate (M4)
  tokens_est: number;       // bytes / 4 (text) + 1 image = 765 (M4)
  gate_hits: number;        // leak-gate hits (blocked if > 0)
  ms_observe: number; ms_sanitize: number; ms_vision: number; ms_gate: number; ms_server: number; ms_total: number; // M5
  model_load_ms: number;    // first step only (M4)
}

export const STEP_COLUMNS: (keyof StepRecord)[] = [
  'run_id', 'step', 'ts', 'origin', 'outcome', 'action', 'reused', 'elements', 'opaque', 'placeholders', 'image_detections', 'image_sent',
  'bytes', 'tokens_est', 'gate_hits', 'ms_observe', 'ms_sanitize', 'ms_vision', 'ms_gate', 'ms_server', 'ms_total', 'model_load_ms',
];

const cell = (v: unknown) => {
  const s = typeof v === 'number' ? (Number.isInteger(v) ? String(v) : v.toFixed(2)) : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export function toCsv(rows: StepRecord[]): string {
  return [STEP_COLUMNS.join(','), ...rows.map((r) => STEP_COLUMNS.map((c) => cell(r[c])).join(','))].join('\n') + '\n';
}

export function parseCsv(csv: string): StepRecord[] {
  const [head, ...lines] = csv.trim().split('\n');
  const cols = head!.split(',');
  return lines.filter(Boolean).map((line) => {
    const vals: string[] = [];
    let cur = '', q = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i]!;
      if (q) { if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; } else if (ch === '"') q = false; else cur += ch; }
      else if (ch === '"') q = true; else if (ch === ',') { vals.push(cur); cur = ''; } else cur += ch;
    }
    vals.push(cur);
    const o: Record<string, unknown> = {};
    cols.forEach((c, i) => {
      const v = vals[i] ?? '';
      o[c] = v === 'true' ? true : v === 'false' ? false : v !== '' && !isNaN(Number(v)) && c !== 'run_id' && c !== 'origin' ? Number(v) : v;
    });
    return o as unknown as StepRecord;
  });
}

export function quantile(xs: number[], q: number): number {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const i = (s.length - 1) * q, lo = Math.floor(i), hi = Math.ceil(i);
  return s[lo]! + (s[hi]! - s[lo]!) * (i - lo);
}

export interface MetricsSummary {
  runs: number; steps: number;
  g1SkipPct: number; imageStepPct: number; blocked: number;
  bytesMean: number; tokensMean: number; tokensTotal: number;
  stages: Record<'observe' | 'sanitize' | 'vision' | 'gate' | 'server' | 'total', { p50: number; p95: number }>;
  modelLoadMs: number;
}

export function summarizeSteps(rows: StepRecord[]): MetricsSummary {
  const n = Math.max(1, rows.length);
  const st = (k: keyof StepRecord) => { const xs = rows.map((r) => r[k] as number); return { p50: quantile(xs, 0.5), p95: quantile(xs, 0.95) }; };
  return {
    runs: new Set(rows.map((r) => r.run_id)).size,
    steps: rows.length,
    g1SkipPct: (100 * rows.filter((r) => r.reused).length) / n,
    imageStepPct: (100 * rows.filter((r) => r.image_sent).length) / n,
    blocked: rows.filter((r) => r.outcome === 'blocked').length,
    bytesMean: rows.reduce((a, r) => a + r.bytes, 0) / n,
    tokensMean: rows.reduce((a, r) => a + r.tokens_est, 0) / n,
    tokensTotal: rows.reduce((a, r) => a + r.tokens_est, 0),
    stages: { observe: st('ms_observe'), sanitize: st('ms_sanitize'), vision: st('ms_vision'), gate: st('ms_gate'), server: st('ms_server'), total: st('ms_total') },
    modelLoadMs: Math.max(0, ...rows.map((r) => r.model_load_ms)),
  };
}

/** Rough token estimate: ~4 bytes/token for JSON text; a masked JPEG counts as one 765-token image tile set. */
export const estimateTokens = (textBytes: number, image: boolean) => Math.ceil(textBytes / 4) + (image ? 765 : 0);
