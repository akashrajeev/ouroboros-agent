import { describe, expect, it } from 'vitest';
import { gstinCheckChar, gstinValid, luhnValid, verhoeffCheckDigit, verhoeffValid } from '../src/checksums';

function aadhaar(base11: string) { return base11 + verhoeffCheckDigit(base11); }

describe('verhoeff', () => {
  it('validates generated numbers and the classic vector', () => {
    expect(verhoeffCheckDigit('236')).toBe(3);
    expect(verhoeffValid('2363')).toBe(true);
    for (const b of ['23456789012', '98765432101', '50000000000']) expect(verhoeffValid(aadhaar(b))).toBe(true);
  });

  it('catches every single-digit error and adjacent transposition on sampled numbers', () => {
    let seed = 7;
    const rnd = () => (seed = (seed * 48271) % 2147483647) / 2147483647;
    for (let n = 0; n < 200; n++) {
      const base = String(2 + Math.floor(rnd() * 8)) + Array.from({ length: 10 }, () => Math.floor(rnd() * 10)).join('');
      const good = aadhaar(base);
      for (let i = 0; i < 12; i++) {
        for (let d = 0; d < 10; d++) {
          if (String(d) === good[i]) continue;
          expect(verhoeffValid(good.slice(0, i) + d + good.slice(i + 1))).toBe(false);
        }
        if (i < 11 && good[i] !== good[i + 1]) {
          const t = good.slice(0, i) + good[i + 1] + good[i] + good.slice(i + 2);
          expect(verhoeffValid(t)).toBe(false);
        }
      }
    }
  });

  it('rejects non-digits', () => expect(verhoeffValid('12a4')).toBe(false));
});

describe('luhn', () => {
  it('accepts known test cards', () => {
    for (const c of ['4111111111111111', '5500005555555559', '378282246310005', '6011111111111117']) expect(luhnValid(c)).toBe(true);
  });
  it('rejects altered cards', () => {
    expect(luhnValid('4111111111111112')).toBe(false);
    expect(luhnValid('4111111111111121')).toBe(false);
  });
});

describe('gstin', () => {
  it('accepts a published sample and rejects a wrong check char', () => {
    expect(gstinValid('27AAPFU0939F1ZV')).toBe(true);
    expect(gstinValid('27AAPFU0939F1ZW')).toBe(false);
  });
  it('computes check chars that round-trip', () => {
    const body = '29ABCPE1234F1Z';
    expect(gstinValid(body + gstinCheckChar(body))).toBe(true);
  });
});
