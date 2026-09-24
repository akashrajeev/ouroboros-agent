import { describe, expect, it } from 'vitest';
import { leakGate } from '../src/leakGate';
import { PlaceholderMap } from '../src/placeholders';

function mapWith() {
  const m = new PlaceholderMap();
  m.tokenFor('PHONE', '9876543210');
  m.tokenFor('PAN', 'ABCPE1234F');
  m.tokenFor('NAME', 'Ravi Kumar');
  m.tokenFor('PIN', '4821');
  return m;
}

describe('leak gate', () => {
  it('passes a clean placeholder payload and hashes it', async () => {
    const payload = JSON.stringify({ task: 'fill form', elements: [{ id: 'e1', value: '<PHONE_1>', bbox: [0.1234, 0.5, 0.2, 0.05] }] });
    const r = await leakGate(payload, mapWith());
    expect(r.pass).toBe(true);
    expect(r.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(r.bytes).toBe(payload.length);
  });

  const leaks: [string, string][] = [
    ['exact', '{"v":"9876543210"}'],
    ['spaced', '{"v":"98765 43210"}'],
    ['dashed', '{"v":"98-765-432-10"}'],
    ['lowercase pan', '{"v":"abcpe1234f"}'],
    ['in a json key', '{"ABCPE1234F":1}'],
    ['name', '{"label":"Welcome, Ravi Kumar"}'],
    ['name odd spacing', '{"label":"ravi   kumar"}'],
    ['short pin exact', '{"v":"4821"}'],
    ['unmapped pattern', '{"v":"call 9123456789"}'],
  ];
  for (const [name, payload] of leaks) {
    it(`blocks ${name}`, async () => expect((await leakGate(payload, mapWith())).pass).toBe(false));
  }

  it('short value does not false-positive inside decimals', async () => {
    const r = await leakGate('{"bbox":[0.4821,0.1]}', mapWith());
    expect(r.pass).toBe(true);
  });

  it('blocks canaries', async () => {
    const r = await leakGate('{"v":"CANARY-7Q2X"}', new PlaceholderMap(), { canaries: ['CANARY-7Q2X'] });
    expect(r.hits.map((h) => h.kind)).toContain('canary');
  });

  it('blocks values recovered by image OCR', async () => {
    const r = await leakGate('{"ok":1}', mapWith(), { imageText: 'PAN ABCPE1234F' });
    expect(r.pass).toBe(false);
    expect(r.hits.some((h) => h.where === 'image')).toBe(true);
  });

  it('hits never contain the real value', async () => {
    const r = await leakGate('{"v":"9876543210"}', mapWith());
    expect(JSON.stringify(r.hits)).not.toContain('9876543210');
  });
});
