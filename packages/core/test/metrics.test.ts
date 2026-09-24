import { describe, expect, it } from 'vitest';
import { parseCsv, quantile, summarizeSteps, toCsv, type StepRecord } from '../src/index';

const rec = (i: number, o: Partial<StepRecord> = {}): StepRecord => ({
  run_id: 'r1', step: i, ts: 1000 + i, origin: 'https://a.test', outcome: 'sent', action: 'type', reused: i % 2 === 0,
  elements: 10, opaque: 1, placeholders: 3, image_detections: 0, image_sent: false, bytes: 400, tokens_est: 100, gate_hits: 0,
  ms_observe: i, ms_sanitize: 2 * i, ms_vision: 0, ms_gate: 1, ms_server: 10, ms_total: 13 + 3 * i, model_load_ms: i === 1 ? 900 : 0, ...o,
});

describe('A12 metrics', () => {
  it('CSV round-trips, including quoted fields', () => {
    const rows = [rec(1), rec(2, { action: 'ask_user,"x"', outcome: 'blocked' })];
    const back = parseCsv(toCsv(rows));
    expect(back).toEqual(rows);
  });
  it('quantiles interpolate', () => {
    expect(quantile([1, 2, 3, 4], 0.5)).toBe(2.5);
    expect(quantile([], 0.95)).toBe(0);
  });
  it('summary covers skip rate, blocks and stage percentiles', () => {
    const s = summarizeSteps([1, 2, 3, 4].map((i) => rec(i, i === 4 ? { outcome: 'blocked' } : {})));
    expect(s.g1SkipPct).toBe(50);
    expect(s.blocked).toBe(1);
    expect(s.stages.total.p50).toBe(20.5);
    expect(s.modelLoadMs).toBe(900);
  });
  it('never has a column for raw values', () => {
    expect(toCsv([rec(1)]).split('\n')[0]).not.toMatch(/value|label|text|url/);
  });
});
