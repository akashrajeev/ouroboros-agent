import { describe, expect, it } from 'vitest';
import { runTask, type LoopEvent } from '../lib/agentLoop';
import { executeOnElement } from '../lib/execute';
import { NodeRegistry, observe } from '../lib/observe';

const rect = () => ({ x: 10, y: 20, w: 100, h: 30 });
const TASK = 'Fill the KYC form: mobile 9876543210, PAN ABCPE1234F';
const SECRETS = ['9876543210', 'ABCPE1234F', 'abcpe1234f'];

/** Mirrors server/app/planner.py StubPlanner closely enough for the device contract. */
function fakeServer(bodies: string[]) {
  return async (body: string) => {
    bodies.push(body);
    const req = JSON.parse(body) as { screen_map: { id: string; role: string; label: string; field_type?: string; value: string }[]; legend: Record<string, string>; history: { op: string; element_id: string | null }[] };
    const tokenOf = (t: string) => Object.keys(req.legend).find((k) => req.legend[k] === t);
    for (const el of req.screen_map) {
      if (el.role !== 'textbox' || el.value) continue;
      const want = el.field_type === 'tel' ? 'PHONE' : /pan/i.test(el.label) ? 'PAN' : null;
      const tok = want && tokenOf(want);
      if (tok) return { action: { op: 'type', element_id: el.id, text: tok } };
    }
    const btn = req.screen_map.find((e) => e.role === 'button' && /submit/i.test(e.label));
    if (btn && !req.history.some((h) => h.op === 'click')) return { action: { op: 'click', element_id: btn.id } };
    return { action: { op: 'done', reason: 'submitted' } };
  };
}

function mount() {
  document.body.innerHTML = `
    <form id="kyc">
      <label for="m">Mobile</label><input id="m" type="tel">
      <label for="p">PAN</label><input id="p" name="pan">
      <button type="button" id="s">Submit</button>
    </form>`;
  let submitted = 0;
  document.getElementById('s')!.addEventListener('click', () => submitted++);
  const reg = new NodeRegistry();
  return {
    reg,
    submitted: () => submitted,
    deps: {
      observe: async () => observe(document, reg, rect),
      execute: async (nodeId: string, op: string, text?: string) => executeOnElement(reg.get(nodeId), op, text),
    },
  };
}

describe('end-to-end device loop (stub planner)', () => {
  it('fills real values locally while the server only ever sees placeholders', async () => {
    const m = mount();
    const bodies: string[] = [];
    const events: LoopEvent[] = [];
    const confirmed: string[] = [];
    const r = await runTask(TASK, { ...m.deps, post: fakeServer(bodies), confirm: async (l) => { confirmed.push(l); return true; }, log: (e) => events.push(e) });

    expect(r.status).toBe('done');
    expect((document.getElementById('m') as HTMLInputElement).value).toBe('9876543210');
    expect((document.getElementById('p') as HTMLInputElement).value).toBe('ABCPE1234F');
    expect(m.submitted()).toBe(1);
    expect(confirmed).toEqual(['Submit']);
    expect(bodies.length).toBe(4);
    for (const b of bodies) for (const s of SECRETS) expect(b).not.toContain(s);
    expect(bodies[0]).toContain('<PHONE_1>');
    expect(events.filter((e) => e.kind === 'sent').every((e) => e.kind === 'sent' && /^[0-9a-f]{64}$/.test(e.sha256))).toBe(true);
  });

  it('declined confirmation stops before the consequential click', async () => {
    const m = mount();
    const r = await runTask(TASK, { ...m.deps, post: fakeServer([]), confirm: async () => false });
    expect(r.status).toBe('declined');
    expect(m.submitted()).toBe(0);
  });

  it('a malicious planner cannot type a token into the wrong field', async () => {
    const m = mount();
    const r = await runTask(TASK, { ...m.deps, post: async (b: string) => {
      const pan = (JSON.parse(b).screen_map as { id: string; label: string }[]).find((e) => e.label === 'PAN')!;
      return { action: { op: 'type', element_id: pan.id, text: '<PHONE_1>' } };
    }, confirm: async () => true });
    expect(r).toMatchObject({ status: 'rejected', reason: 'token_type_mismatch' });
    expect((document.getElementById('p') as HTMLInputElement).value).toBe('');
  });

  it('blocks egress when a raw value survives sanitization (canary)', async () => {
    const m = mount();
    document.body.insertAdjacentHTML('beforeend', '<p>ref CANARY-ZX81</p>');
    const bodies: string[] = [];
    const r = await runTask(TASK, { ...m.deps, post: fakeServer(bodies), confirm: async () => true, canaries: ['CANARY-ZX81'] });
    expect(r.status).toBe('blocked');
    expect(bodies).toHaveLength(0);
  });

  it('attaches a masked screenshot only after need_visual, and gates its re-OCR text', async () => {
    const m = mount();
    const bodies: string[] = [];
    let calls = 0;
    const post = async (b: string) => { bodies.push(b); return { action: bodies.length === 1 ? { op: 'need_visual' } : { op: 'done', reason: 'seen' } }; };
    const visual = async () => { calls++; return { jpegB64: 'AAAA', imageText: 'Order 22405156', detections: 2 }; };
    const events: LoopEvent[] = [];
    const r = await runTask(TASK, { ...m.deps, post, confirm: async () => true, visual, log: (e) => events.push(e) });
    expect(r.status).toBe('done');
    expect(calls).toBe(1);
    expect(JSON.parse(bodies[0]!).image_jpeg_b64).toBeUndefined();
    expect(JSON.parse(bodies[1]!).image_jpeg_b64).toBe('AAAA');
    expect(events.find((e) => e.kind === 'sent' && e.step === 2)).toMatchObject({ image: { detections: 2 } });
  });

  it('blocks the step if PII survives in the masked image text', async () => {
    const m = mount();
    const bodies: string[] = [];
    const post = async (b: string) => { bodies.push(b); return { action: { op: 'need_visual' } }; };
    const visual = async () => ({ jpegB64: 'AAAA', imageText: 'PAN BXYPK5678Q', detections: 0 });
    const r = await runTask(TASK, { ...m.deps, post, confirm: async () => true, visual });
    expect(r.status).toBe('blocked');
    expect(bodies).toHaveLength(1);
  });
});
