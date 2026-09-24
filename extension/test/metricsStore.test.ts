import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { describe, expect, it } from 'vitest';
import { parseCsv, type StepRecord } from '@ouroboros/core';
import { MetricsStore } from '../lib/metricsStore';
import { runTask } from '../lib/agentLoop';
import { NodeRegistry, observe } from '../lib/observe';

describe('A12 metrics store', () => {
  it('records one row per step through the loop and exports CSV per run', async () => {
    const store = new MetricsStore(new IDBFactory());
    document.body.innerHTML = '<label for="p">PAN</label><input id="p" value="ABCPE1234F"><img src="x.png" style="width:100px;height:100px">';
    const reg = new NodeRegistry();
    const rect = () => ({ x: 10, y: 20, w: 100, h: 30 });
    const script = [{ op: 'wait' }, { op: 'need_visual' }, { op: 'done', reason: 'ok' }];
    let i = 0;
    const rows: StepRecord[] = [];
    const r = await runTask('check my PAN', {
      observe: async () => observe(document, reg, rect),
      execute: async () => ({ ok: true }),
      post: async () => ({ action: script[i++] }),
      confirm: async () => true,
      settle: async () => {},
      visual: async () => ({ jpegB64: 'AAAA', imageText: '', detections: 1 }),
      modelLoadMs: () => 1234,
      record: (x) => { rows.push(x); void store.add(x); },
    }, { runId: 'run-a' });
    expect(r.status).toBe('done');
    await new Promise((res) => setTimeout(res, 20));
    const back = parseCsv(await store.csv('run-a'));
    expect(back).toHaveLength(3);
    expect(back.map((x) => x.action)).toEqual(['wait', 'need_visual', 'done']);
    expect(back.map((x) => x.reused)).toEqual([false, true, true]);
    expect(back[2]!.image_sent).toBe(true);
    expect(back[0]!.model_load_ms).toBe(1234);
    expect(back[0]!.placeholders).toBe(1);
    expect(await store.csv('run-a')).not.toContain('ABCPE1234F');
    expect(await store.runs()).toEqual(['run-a']);
  });
});
