import { describe, expect, it } from 'vitest';
import { detectPatterns } from '../src/patterns';
import { legend, PlaceholderMap, redactText, rehydrate } from '../src/placeholders';

describe('PlaceholderMap', () => {
  it('same value -> same token, formatting-insensitive', () => {
    const m = new PlaceholderMap();
    const a = m.tokenFor('PHONE', '+91 98765 43210');
    expect(a).toBe('<PHONE_1>');
    expect(m.tokenFor('PHONE', '+91-98765-43210')).toBe(a);
    expect(m.tokenFor('PHONE', '9123456789')).toBe('<PHONE_2>');
    expect(m.tokenFor('EMAIL', 'a@b.co')).toBe('<EMAIL_1>');
  });
  it('clear resets tokens', () => {
    const m = new PlaceholderMap();
    m.tokenFor('PAN', 'ABCPE1234F');
    m.clear();
    expect(m.size).toBe(0);
    expect(m.tokenFor('PAN', 'ZZZPE9999Z')).toBe('<PAN_1>');
  });
  it('refuses JSON serialization', () => {
    const m = new PlaceholderMap();
    m.tokenFor('PAN', 'ABCPE1234F');
    expect(() => JSON.stringify({ m })).toThrow();
  });
  it('local export/import round-trips and continues numbering', () => {
    const m = new PlaceholderMap();
    m.tokenFor('PHONE', '9876543210');
    const m2 = PlaceholderMap.importLocal(m.exportLocal());
    expect(m2.tokenFor('PHONE', '9876543210')).toBe('<PHONE_1>');
    expect(m2.tokenFor('PHONE', '9123456789')).toBe('<PHONE_2>');
  });
});

describe('redact + rehydrate', () => {
  it('round-trips text', () => {
    const m = new PlaceholderMap();
    const text = 'Ravi, PAN ABCPE1234F, phone 9876543210, again 9876543210';
    const red = redactText(text, detectPatterns(text), m);
    expect(red).toBe('Ravi, PAN <PAN_1>, phone <PHONE_1>, again <PHONE_1>');
    expect(rehydrate(red, m).text).toBe(text);
    expect(legend(m)).toEqual({ '<PAN_1>': 'PAN', '<PHONE_1>': 'PHONE' });
  });
  it('reports unknown tokens', () => {
    const r = rehydrate('type <AADHAAR_9>', new PlaceholderMap());
    expect(r.unknown).toEqual(['<AADHAAR_9>']);
  });
});
