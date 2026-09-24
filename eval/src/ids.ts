import type { Faker } from '@faker-js/faker';
import { gstinCheckChar, luhnValid, verhoeffCheckDigit } from '@ouroboros/core';

/** Generators for valid Indian identifiers (and near-miss decoys). */
const U = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const pick = (f: Faker, s: string) => s[f.number.int({ min: 0, max: s.length - 1 })]!;
const digits = (f: Faker, n: number) => Array.from({ length: n }, () => f.number.int({ min: 0, max: 9 })).join('');

export function aadhaar(f: Faker): string {
  const base = String(f.number.int({ min: 2, max: 9 })) + digits(f, 10);
  return base + verhoeffCheckDigit(base);
}
export function aadhaarFormatted(f: Faker): string {
  const a = aadhaar(f);
  return f.datatype.boolean() ? `${a.slice(0, 4)} ${a.slice(4, 8)} ${a.slice(8)}` : a;
}
export function badAadhaar(f: Faker): string {
  const a = aadhaar(f);
  return a.slice(0, 11) + ((Number(a[11]) + 1 + f.number.int({ min: 0, max: 7 })) % 10);
}
export function pan(f: Faker): string {
  return pick(f, U) + pick(f, U) + pick(f, U) + pick(f, 'PCHFT') + pick(f, U) + digits(f, 4) + pick(f, U);
}
export function badPan(f: Faker): string {
  return pick(f, U) + pick(f, U) + pick(f, U) + pick(f, 'XYZQ') + pick(f, U) + digits(f, 4) + pick(f, U);
}
export function card(f: Faker): string {
  const prefix = f.helpers.arrayElement(['4', '51', '52', '53', '6011', '65', '60', '81']);
  let body = prefix + digits(f, 15 - prefix.length);
  for (let c = 0; c < 10; c++) if (luhnValid(body + c)) { body += c; break; }
  return f.datatype.boolean() ? body.replace(/(\d{4})(?=\d)/g, '$1 ') : body;
}
export function badCard(f: Faker): string {
  let s = card(f).replace(/ /g, '');
  const last = (Number(s[15]) + 1) % 10;
  s = s.slice(0, 15) + last;
  return s;
}
export function ifsc(f: Faker): string {
  return f.helpers.arrayElement(['SBIN', 'HDFC', 'ICIC', 'UTIB', 'KKBK', 'PUNB', 'CNRB', 'FDRL']) + '0' + digits(f, 6);
}
export function upi(f: Faker, first: string): string {
  return `${first.toLowerCase().replace(/[^a-z]/g, '')}${f.number.int({ min: 1, max: 999 })}@${f.helpers.arrayElement(['okhdfcbank', 'oksbi', 'ybl', 'paytm', 'okicici', 'upi'])}`;
}
export function mobile(f: Faker): string {
  const n = String(f.number.int({ min: 6, max: 9 })) + digits(f, 9);
  switch (f.number.int({ min: 0, max: 3 })) {
    case 0: return n;
    case 1: return `+91 ${n}`;
    case 2: return `+91 ${n.slice(0, 5)} ${n.slice(5)}`;
    default: return `0${n}`;
  }
}
export function badMobile(f: Faker): string {
  return String(f.number.int({ min: 1, max: 5 })) + digits(f, 9);
}
export function gstin(f: Faker, p: string): string {
  const state = String(f.number.int({ min: 1, max: 37 })).padStart(2, '0');
  const body = state + p + String(f.number.int({ min: 1, max: 9 })) + 'Z';
  return body + gstinCheckChar(body);
}
export function passport(f: Faker): string {
  return pick(f, 'ABCDEFGHJKLMNPRSTUVWY') + String(f.number.int({ min: 1, max: 9 })) + digits(f, 5) + String(f.number.int({ min: 1, max: 9 }));
}
const STATES = ['KA', 'KL', 'MH', 'DL', 'TN', 'TS', 'GJ', 'UP', 'WB', 'RJ'];
export function vehicle(f: Faker): string {
  const s = `${f.helpers.arrayElement(STATES)} ${String(f.number.int({ min: 1, max: 99 })).padStart(2, '0')} ${pick(f, U)}${pick(f, U)} ${digits(f, 4)}`;
  return f.datatype.boolean() ? s : s.replace(/ /g, '');
}
export function pincode(f: Faker): string {
  return String(f.number.int({ min: 1, max: 8 })) + digits(f, 5);
}
export function dob(f: Faker): string {
  const d = f.date.birthdate({ min: 18, max: 70, mode: 'age' });
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  return `${dd}/${mm}/${d.getFullYear()}`;
}
export function account(f: Faker): string { return digits(f, f.number.int({ min: 11, max: 16 })); }
export function otp(f: Faker): string { return digits(f, 6); }
export function cvv(f: Faker): string { return digits(f, 3); }
