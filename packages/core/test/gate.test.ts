import { describe, expect, it } from 'vitest';
import { Lru, observationKey, type RawObservation } from '../src/index';

const obs = (value = '', x = 10): RawObservation => ({
  url: 'https://a.test/kyc', viewport: { w: 800, h: 600 },
  elements: [{ nodeId: 'n1', tag: 'input', role: 'textbox', name: 'PAN', text: '', value, bbox: { x, y: 20, w: 100, h: 30 } }],
  opaque: [{ nodeId: 'n2', kind: 'img', bbox: { x: 0, y: 0, w: 50, h: 50 }, src: 'a.png' }],
});

describe('G1 observation key', () => {
  it('is stable for identical and sub-pixel-jittered screens', () => {
    expect(observationKey(obs())).toBe(observationKey(obs()));
    expect(observationKey(obs('', 10.4))).toBe(observationKey(obs('', 10)));
  });
  it('changes when a value, layout or image src changes', () => {
    expect(observationKey(obs('X'))).not.toBe(observationKey(obs()));
    expect(observationKey(obs('', 40))).not.toBe(observationKey(obs()));
    const o = obs(); o.opaque[0]!.src = 'b.png';
    expect(observationKey(o)).not.toBe(observationKey(obs()));
  });
});

describe('Lru', () => {
  it('evicts least recently used and tracks hit rate', () => {
    const c = new Lru<number>(2);
    c.set('a', 1); c.set('b', 2); c.get('a'); c.set('c', 3);
    expect(c.get('b')).toBeUndefined();
    expect(c.get('a')).toBe(1);
    expect(c.hitRate).toBeCloseTo(2 / 3);
  });
});
