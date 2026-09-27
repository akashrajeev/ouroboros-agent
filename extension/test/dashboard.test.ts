import { describe, expect, it } from 'vitest';
import type { StepRecord } from '@ouroboros/core';
import { renderDashboard } from '../lib/dashboard';

const rec = (i: number): StepRecord => ({ run_id: 'r<1>', step: i, ts: i, origin: 'https://a.test', outcome: i === 3 ? 'done' : 'sent', action: 'x', reused: i > 1, elements: 5, opaque: 0, placeholders: 2, image_detections: 0, image_sent: false, bytes: 300, tokens_est: 75, gate_hits: 0, ms_observe: 1, ms_sanitize: 2, ms_vision: 0, ms_gate: 1, ms_server: 5, ms_validate: 1, ms_confirm: 0, ms_execute: 2, ms_total: 9, model_load_ms: 0 });

describe('dashboard', () => {
  it('renders headline numbers and escapes run ids', () => {
    const html = renderDashboard([1, 2, 3].map(rec));
    expect(html).toContain('66.7%');
    expect(html).toContain('r&lt;1&gt;');
    expect(html).not.toContain('<1>');
  });
  it('handles no data', () => { expect(renderDashboard([])).toContain('No metrics'); });
});
