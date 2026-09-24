// Verhoeff (Aadhaar), Luhn (cards) and GSTIN mod-36 check characters.

const D = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9], [1, 2, 3, 4, 0, 6, 7, 8, 9, 5],
  [2, 3, 4, 0, 1, 7, 8, 9, 5, 6], [3, 4, 0, 1, 2, 8, 9, 5, 6, 7],
  [4, 0, 1, 2, 3, 9, 5, 6, 7, 8], [5, 9, 8, 7, 6, 0, 4, 3, 2, 1],
  [6, 5, 9, 8, 7, 1, 0, 4, 3, 2], [7, 6, 5, 9, 8, 2, 1, 0, 4, 3],
  [8, 7, 6, 5, 9, 3, 2, 1, 0, 4], [9, 8, 7, 6, 5, 4, 3, 2, 1, 0],
];
// P[i] = P1^i, generated rather than hand-typed to avoid table typos.
const P1 = [1, 5, 7, 6, 2, 8, 3, 0, 9, 4];
const P: number[][] = [[0, 1, 2, 3, 4, 5, 6, 7, 8, 9]];
for (let i = 1; i < 8; i++) P.push(P[i - 1]!.map((v) => P1[v]!));
const INV = [0, 4, 3, 2, 1, 5, 6, 7, 8, 9];

const at = (t: number[][], i: number, j: number): number => t[i]![j]!;

export function verhoeffValid(digits: string): boolean {
  if (!/^\d+$/.test(digits)) return false;
  let c = 0;
  const r = digits.split('').reverse();
  for (let i = 0; i < r.length; i++) c = at(D, c, at(P, i % 8, Number(r[i])));
  return c === 0;
}

export function verhoeffCheckDigit(digits: string): number {
  let c = 0;
  const r = digits.split('').reverse();
  for (let i = 0; i < r.length; i++) c = at(D, c, at(P, (i + 1) % 8, Number(r[i])));
  return INV[c]!;
}

export function luhnValid(digits: string): boolean {
  if (!/^\d+$/.test(digits)) return false;
  let sum = 0;
  let dbl = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let d = Number(digits[i]);
    if (dbl) { d *= 2; if (d > 9) d -= 9; }
    sum += d;
    dbl = !dbl;
  }
  return sum % 10 === 0;
}

const B36 = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';

export function gstinCheckChar(first14: string): string {
  let sum = 0;
  for (let i = 0; i < 14; i++) {
    const v = B36.indexOf(first14[i]!);
    const p = v * (i % 2 === 0 ? 1 : 2);
    sum += Math.floor(p / 36) + (p % 36);
  }
  return B36[(36 - (sum % 36)) % 36]!;
}

export function gstinValid(g: string): boolean {
  const s = g.toUpperCase();
  if (!/^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(s)) return false;
  return gstinCheckChar(s.slice(0, 14)) === s[14];
}
