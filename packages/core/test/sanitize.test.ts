import { describe, expect, it } from 'vitest';
import { leakGate } from '../src/leakGate';
import { PlaceholderMap } from '../src/placeholders';
import { sanitize, wireScreenMap } from '../src/sanitize';
import { AADHAAR, kycObservation } from './fixtures';

describe('sanitize', () => {
  it('replaces every real value and the wire payload passes the leak gate', async () => {
    const map = new PlaceholderMap();
    const { screen, detections } = sanitize(kycObservation(), map);
    const wire = JSON.stringify(wireScreenMap(screen));
    for (const secret of ['+91 98765 43210', '9876543210', AADHAAR, 'hunter2!', 'ravi.k@example.com', 'ABCPE1234F'])
      expect(wire).not.toContain(secret);
    const byId = Object.fromEntries(screen.elements.map((e) => [e.id, e]));
    expect(byId.e3!.value).toBe('<PHONE_1>');
    expect(byId.e4!.value).toBe('<AADHAAR_1>');
    expect(byId.e5!.value).toBe('<PASSWORD_1>');
    expect(byId.e6!.label).toBe('<EMAIL_1>, PAN <PAN_1>'.replace(/^/, 'Registered email '));
    expect(detections.length).toBeGreaterThanOrEqual(5);
    expect((await leakGate(wire, map)).pass).toBe(true);
  });

  it('normalizes bboxes and keeps device-local fields off the wire', () => {
    const { screen } = sanitize(kycObservation(), new PlaceholderMap());
    const e1 = screen.elements[0]!;
    expect(e1.bbox).toEqual([0.078, 0.125, 0.234, 0.038]);
    const wire = wireScreenMap(screen);
    expect(Object.keys(wire).sort()).toEqual(['elements', 'url_origin']);
    expect(wire.url_origin).toBe('https://bank.example.in');
    expect(screen.nodeOf.e2).toBe('n1');
  });

  it('uses extra detectors (NER hook) for names', () => {
    const map = new PlaceholderMap();
    const ner = (s: string) => {
      const i = s.indexOf('Ravi Kumar');
      return i < 0 ? [] : [{ type: 'NAME' as const, start: i, end: i + 10, value: 'Ravi Kumar', source: 'ner' as const, confidence: 0.9 }];
    };
    const { screen } = sanitize(kycObservation(), map, { extraDetectors: [ner] });
    expect(screen.elements[1]!.value).toBe('<NAME_1>');
  });
});

import { mergeMatches } from '../src/sanitize';
describe('fusion (A4)', () => {
  const m = (type: string, start: number, end: number, source: string) => ({ type, start, end, value: '', source, confidence: 1 }) as never;
  it('rule spans win; an overlapping NER span is cut around them', () => {
    const out = mergeMatches([[m('PINCODE', 20, 26, 'pattern')], [m('ADDRESS', 0, 26, 'ner')]]);
    expect(out.map((x: { type: string; start: number; end: number }) => [x.type, x.start, x.end])).toEqual([['ADDRESS', 0, 20], ['PINCODE', 20, 26]]);
  });
  it('overlapping NER spans union', () => {
    const out = mergeMatches([[], [m('NAME', 0, 5, 'ner'), m('NAME', 3, 9, 'ner')]]);
    expect(out.map((x: { start: number; end: number }) => [x.start, x.end])).toEqual([[0, 9]]);
  });
});

describe('known values (A6b)', () => {
  it('replaces a task-supplied value on screen even when no detector fires', () => {
    const m = new PlaceholderMap();
    const tok = m.tokenFor('NAME', 'Ishaan Verma');
    const obs = kycObservation();
    obs.elements = [{ ...obs.elements[0]!, name: 'Welcome back, Ishaan Verma', text: '', value: '' }];
    const { screen } = sanitize(obs, m);
    const wire = JSON.stringify(wireScreenMap(screen));
    expect(wire).not.toContain('Ishaan Verma');
    expect(wire).toContain(tok);
  });
});
