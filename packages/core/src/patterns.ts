import { gstinValid, luhnValid, verhoeffValid } from './checksums';
import type { PiiType, TextMatch } from './types';

/**
 * A3b: regex + validation detectors. Validation (checksums, ranges, context
 * words) is what keeps precision high; every rule here must have negative tests.
 */

interface Rule {
  type: PiiType;
  re: RegExp;
  /** Higher wins when spans overlap. */
  priority: number;
  validate?: (raw: string, text: string, start: number) => boolean;
  confidence: number;
}

const digitsOnly = (s: string) => s.replace(/\D/g, '');

/** True if any context word appears within `window` chars before `start`. */
function hasContext(text: string, start: number, words: RegExp, window = 40): boolean {
  return words.test(text.slice(Math.max(0, start - window), start));
}

/** Issuer prefixes: Visa, Mastercard, Amex, Diners, JCB, Discover, RuPay, Maestro. */
const CARD_IIN = /^(4|5[1-5]|2[2-7]|3[47]|3[0689]|35|6011|64[4-9]|65|60|81|82|508|5[06-8]|6[37])/;

const STATE_CODES = new Set([
  'AN', 'AP', 'AR', 'AS', 'BR', 'CH', 'CG', 'DD', 'DL', 'DN', 'GA', 'GJ', 'HP', 'HR', 'JH', 'JK',
  'KA', 'KL', 'LA', 'LD', 'MH', 'ML', 'MN', 'MP', 'MZ', 'NL', 'OD', 'OR', 'PB', 'PY', 'RJ', 'SK',
  'TN', 'TR', 'TS', 'UK', 'UA', 'UP', 'WB', 'BH',
]);

function validDate(d: number, m: number, y: number): boolean {
  if (m < 1 || m > 12 || d < 1 || y < 1900 || y > 2100) return false;
  const days = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return d <= days;
}

const RULES: Rule[] = [
  {
    type: 'EMAIL', priority: 90, confidence: 0.99,
    re: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}\b/g,
  },
  {
    // Obfuscated: "name [at] gmail [dot] com", "name(at)gmail(dot)com"
    type: 'EMAIL', priority: 89, confidence: 0.9,
    re: /\b[A-Za-z0-9._%+-]+\s*[[(]\s*at\s*[\])]\s*[A-Za-z0-9-]+(?:\s*(?:[[(]\s*dot\s*[\])]|\.)\s*[A-Za-z0-9-]+)+\b/gi,
  },
  {
    // UPI VPA: handle has no dot (that would be an email domain).
    type: 'UPI', priority: 85, confidence: 0.95,
    re: /\b[A-Za-z0-9][A-Za-z0-9._-]{1,255}@[A-Za-z]{2,64}\b(?!\.[A-Za-z])/g,
  },
  {
    type: 'GSTIN', priority: 80, confidence: 0.99,
    re: /\b\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]\b/gi,
    validate: (raw) => gstinValid(raw),
  },
  {
    // PAN: 4th char is holder type (P person, C company, H HUF, ...).
    type: 'PAN', priority: 75, confidence: 0.97,
    re: /\b[A-Z]{3}[ABCFGHLJPT][A-Z]\d{4}[A-Z]\b/g,
  },
  {
    type: 'AADHAAR', priority: 70, confidence: 0.99,
    re: /(?<!\d[ -]?)[2-9]\d{3}[ -]?\d{4}[ -]?\d{4}(?![ -]?\d)/g,
    // 1 in 10 random 12-digit numbers pass Verhoeff, so an account label wins unless Aadhaar is named.
    validate: (raw, text, start) => verhoeffValid(digitsOnly(raw)) &&
      !(hasContext(text, start, /\b(account|acct|a\/c)\b[^0-9]{0,20}$/i, 40) && !hasContext(text, start, /aadha+r|uid/i, 40)),
  },
  {
    type: 'CARD', priority: 65, confidence: 0.98,
    re: /\b(?:\d[ -]?){12,18}\d\b/g,
    validate: (raw, text, start) => {
      const d = digitsOnly(raw);
      if (d.length < 13 || d.length > 19 || !luhnValid(d) || /^(\d)\1+$/.test(d)) return false;
      if (!CARD_IIN.test(d)) return false;
      // A Luhn-valid number under an account label is an account number (1 in 10 pass Luhn by chance).
      const acct = hasContext(text, start, /\b(account|acct|a\/c)\b[^0-9]{0,20}$/i, 40);
      return !acct || hasContext(text, start, /card/i, 40);
    },
  },
  {
    type: 'IFSC', priority: 60, confidence: 0.97,
    re: /\b[A-Z]{4}0[A-Z0-9]{6}\b/g,
  },
  {
    type: 'PHONE', priority: 55, confidence: 0.93,
    re: /(?<![\d+.])(?:\+91[ -]?|0)?[6-9]\d{4}[ .-]?\d{5}\b(?!\.\d)/g,
  },
  {
    type: 'VEHICLE', priority: 50, confidence: 0.9,
    re: /\b([A-Z]{2})[ -]?\d{1,2}[ -]?[A-Z]{1,3}[ -]?\d{4}\b/g,
    validate: (raw) => STATE_CODES.has(raw.slice(0, 2).toUpperCase()),
  },
  {
    type: 'PASSPORT', priority: 45, confidence: 0.85,
    re: /\b[A-PR-WY][1-9]\d{6}\b/g,
    validate: (_raw, text, start) => hasContext(text, start, /passport/i),
  },
  {
    type: 'IP', priority: 40, confidence: 0.95,
    re: /\b(?:\d{1,3}\.){3}\d{1,3}\b/g,
    validate: (raw) => raw.split('.').every((o) => Number(o) <= 255 && !(o.length > 1 && o.startsWith('0'))),
  },
  {
    type: 'DOB', priority: 35, confidence: 0.9,
    re: /\b(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})\b/g,
    validate: (raw, text, start) => {
      const [d, m, y] = raw.split(/[/.-]/).map(Number) as [number, number, number];
      return validDate(d, m, y) && hasContext(text, start, /\b(dob|d\.o\.b|birth|born)\b/i);
    },
  },
  {
    type: 'DOB', priority: 34, confidence: 0.88,
    re: /\b(?:\d{1,2}(?:st|nd|rd|th)?\s+(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*,?\s+\d{4}|(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\s+\d{1,2}(?:st|nd|rd|th)?,?\s+\d{4}|\d{4}-\d{2}-\d{2})\b/gi,
    validate: (_raw, text, start) => hasContext(text, start, /\b(dob|d\.o\.b|birth|born)\b/i),
  },
  {
    // An element whose whole text is one long bare number is an identifier (fail-closed).
    type: 'ACCOUNT', priority: 31, confidence: 0.7,
    re: /^\s*\d{9,18}\s*$/g,
    validate: (raw) => !/^(\d)\1+$/.test(raw.trim()),
  },
  {
    // Bank account numbers have no checksum; require an account context word.
    type: 'ACCOUNT', priority: 32, confidence: 0.85,
    re: /\b\d{9,18}\b/g,
    validate: (_raw, text, start) => hasContext(text, start, /\b(account|acct|a\/c)\b[^0-9]{0,20}$/i, 40),
  },
  {
    type: 'PINCODE', priority: 30, confidence: 0.85,
    re: /\b[1-9]\d{2}[ ]?\d{3}\b/g,
    validate: (_raw, text, start) => hasContext(text, start, /(pin ?code|pin|postal|zip|[A-Za-z]+,)\s*[:\-]?\s*$/i, 30),
  },
];

/** Find all pattern matches, resolving overlaps by priority then length. */
export function detectPatterns(text: string): TextMatch[] {
  const found: (TextMatch & { priority: number })[] = [];
  for (const rule of RULES) {
    rule.re.lastIndex = 0;
    for (const m of text.matchAll(rule.re)) {
      const raw = m[0];
      const start = m.index ?? 0;
      if (rule.validate && !rule.validate(raw, text, start)) continue;
      found.push({
        type: rule.type, start, end: start + raw.length, value: raw,
        source: 'pattern', confidence: rule.confidence, priority: rule.priority,
      });
    }
  }
  found.sort((a, b) => b.priority - a.priority || (b.end - b.start) - (a.end - a.start));
  const kept: typeof found = [];
  for (const f of found) {
    if (kept.some((k) => f.start < k.end && k.start < f.end)) continue;
    kept.push(f);
  }
  return kept
    .sort((a, b) => a.start - b.start)
    .map(({ priority: _p, ...rest }) => rest);
}

/** Regex sources exported for the leak gate's re-scan. */
export const PATTERN_TYPES: PiiType[] = RULES.map((r) => r.type);
