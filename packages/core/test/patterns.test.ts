import { describe, expect, it } from 'vitest';
import { verhoeffCheckDigit } from '../src/checksums';
import { detectPatterns } from '../src/patterns';
import type { PiiType } from '../src/types';

const types = (s: string) => detectPatterns(s).map((m) => m.type);
const one = (s: string, t: PiiType) => {
  const m = detectPatterns(s);
  expect(m.map((x) => x.type)).toEqual([t]);
  return m[0]!;
};
const AADHAAR = '23456789012' + verhoeffCheckDigit('23456789012');

describe('positives', () => {
  it('aadhaar plain, spaced, dashed', () => {
    one(`Aadhaar ${AADHAAR}`, 'AADHAAR');
    one(`UID: ${AADHAAR.slice(0, 4)} ${AADHAAR.slice(4, 8)} ${AADHAAR.slice(8)}`, 'AADHAAR');
    one(`${AADHAAR.slice(0, 4)}-${AADHAAR.slice(4, 8)}-${AADHAAR.slice(8)}`, 'AADHAAR');
  });
  it('pan', () => expect(one('PAN is ABCPE1234F.', 'PAN').value).toBe('ABCPE1234F'));
  it('card with spaces', () => one('Card 4111 1111 1111 1111 exp', 'CARD'));
  it('ifsc', () => one('IFSC SBIN0001234', 'IFSC'));
  it('upi', () => one('pay to ravi.k@okhdfcbank now', 'UPI'));
  it('email', () => one('mail ravi.kumar@example.co.in', 'EMAIL'));
  it('phone variants', () => {
    one('call +91 98765 43210', 'PHONE');
    one('call 9876543210', 'PHONE');
    one('call 09876543210', 'PHONE');
  });
  it('gstin', () => one('GSTIN 27AAPFU0939F1ZV', 'GSTIN'));
  it('vehicle', () => one('Vehicle KA 01 AB 1234', 'VEHICLE'));
  it('passport with context', () => one('Passport No: K1234567', 'PASSPORT'));
  it('ip', () => one('from 192.168.1.20', 'IP'));
  it('dob with context', () => one('DOB: 14/08/1999', 'DOB'));
  it('pincode with context', () => one('Bengaluru, 560001', 'PINCODE'));
  it('pincode with label', () => one('PIN code: 682 001', 'PINCODE'));
  it('phone with dot separator', () => one('Reach me at 98765.43210 after 6', 'PHONE'));
  it('obfuscated email', () => { one('mail: ravi92 [at] gmail [dot] com', 'EMAIL'); one('ravi(at)example(dot)co(dot)in', 'EMAIL'); });
  it('month-name DOB with context', () => { one('Born on 4 Aug 1999.', 'DOB'); one('DOB: August 4, 1999', 'DOB'); one('Date of birth 1999-08-04', 'DOB'); });
  it('bare long number as a whole cell', () => one('04364896458', 'ACCOUNT'));
  it('account with context', () => one('Account: 000123456789', 'ACCOUNT'));
});

describe('negatives (precision)', () => {
  it('aadhaar-shaped number failing verhoeff', () => {
    const bad = AADHAAR.slice(0, 11) + ((Number(AADHAAR[11]) + 1) % 10);
    expect(types(`ref ${bad}`)).not.toContain('AADHAAR');
  });
  it('aadhaar cannot start with 0 or 1', () => expect(types('123456789012')).not.toContain('AADHAAR'));
  it('card failing luhn', () => expect(types('4111 1111 1111 1112')).toEqual([]));
  it('luhn-valid number under an account label is ACCOUNT not CARD', () => expect(types('Account: 4111111111111111')).toEqual(['ACCOUNT']));
  it('unknown issuer prefix is not a card', () => expect(types('1111 1111 1111 1117')).toEqual([]));
  it('a spaced card is never split into an Aadhaar', () => {
    expect(types('Saved card 8175 5441 5788 1532')).toEqual(['CARD']);
    expect(types('Saved card 5219 7555 7570 3934')).toEqual(['CARD']);
  });
  it('Verhoeff-valid 12 digits under an account label is ACCOUNT', () => expect(types(`Account: ${AADHAAR}`)).toEqual(['ACCOUNT']));
  it('repeated digits are not cards', () => { expect(types('code 0000000000000000')).toEqual([]); expect(types('0000000000000000')).toEqual([]); });
  it('PAN with invalid holder type char', () => expect(types('ABCXE1234F')).toEqual([]));
  it('phone starting with 5', () => expect(types('ticket 5876543210')).toEqual([]));
  it('email is not also UPI', () => expect(types('a.b@gmail.com')).toEqual(['EMAIL']));
  it('passport-shaped code without context', () => expect(types('Order K1234567')).toEqual([]));
  it('date without birth context', () => expect(types('Due 14/08/2025')).toEqual([]));
  it('invalid date with context', () => expect(types('DOB 31/02/1999')).toEqual([]));
  it('long number without account context', () => expect(types('Tracking 000123456789')).toEqual([]));
  it('six-digit number without context', () => expect(types('Order 560001 shipped')).toEqual([]));
  it('invalid ip octets', () => expect(types('version 1.2.300.4')).toEqual([]));
  it('vehicle with unknown state code', () => expect(types('ZZ 01 AB 1234')).toEqual([]));
  it('decimal numbers are not phones', () => expect(types('pi is 3.14159 and 98765.432101')).toEqual([]));
  it('month-name date without birth context', () => expect(types('Meeting on 4 Aug 2025')).toEqual([]));
  it('bare number inside a sentence is not an account', () => expect(types('Ticket 04364896458 closed')).toEqual([]));
  it('prices and years', () => expect(types('Rs 1,499 in 2024, qty 3')).toEqual([]));
});

describe('overlap resolution', () => {
  it('gstin wins over embedded PAN', () => expect(types('27AAPFU0939F1ZV')).toEqual(['GSTIN']));
  it('several values keep order', () => {
    expect(types(`ravi@x.com 9876543210 ABCPE1234F`)).toEqual(['EMAIL', 'PHONE', 'PAN']);
  });
});
