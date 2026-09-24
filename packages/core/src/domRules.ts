import type { FieldInfo, PiiType } from './types';

/**
 * A3a: zero-cost, highest-precision field rules. A hit here masks the field's
 * value whatever any model says.
 */
const LABEL_RULES: [RegExp, PiiType][] = [
  [/\b(otp|one[\s_-]?time)\b|verification[\s_-]?code/i, 'OTP'],
  [/\bcvv2?\b|\bcvc\b|security[\s_-]?code/i, 'CVV'],
  [/\bm?pin\b(?![\s_-]?code)/i, 'PIN'],
  [/aadha+r|\buid(ai)?\b/i, 'AADHAAR'],
  [/\bpan\b(?![\s_-]?code)|pan[\s_-]?(no|number|card)/i, 'PAN'],
  [/\bifsc\b/i, 'IFSC'],
  [/\b(account|acct|a\/c)[\s_-]*(no|num|number)?\b/i, 'ACCOUNT'],
  [/\bdob\b|date[\s_-]?of[\s_-]?birth|birth[\s_-]?date/i, 'DOB'],
  [/card[\s_-]?(no|num|number)|\bcc[\s_-]?num/i, 'CARD'],
  [/password|passwd|\bpwd\b|passcode/i, 'PASSWORD'],
  [/api[\s_-]?key|secret|token/i, 'SECRET'],
];

export function domRuleType(f: FieldInfo): PiiType | null {
  const type = (f.inputType ?? '').toLowerCase();
  const ac = (f.autocomplete ?? '').toLowerCase();
  if (type === 'password') return 'PASSWORD';
  if (ac.includes('one-time-code')) return 'OTP';
  if (ac === 'cc-csc') return 'CVV';
  if (ac === 'cc-number') return 'CARD';
  if (ac.startsWith('cc-')) return 'CARD';
  if (ac === 'bday' || ac.startsWith('bday-')) return 'DOB';
  const hay = [f.name, f.id, f.label, f.placeholder].filter(Boolean).join(' ');
  if (!hay) return null;
  // Normalize camelCase / snake_case identifiers into words.
  const words = hay.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/[_\-.]/g, ' ');
  for (const [re, t] of LABEL_RULES) if (re.test(words)) return t;
  return null;
}

/** Field types a token may be typed into (used by the A9 validator). */
export function compatibleTokenTypes(f: FieldInfo): PiiType[] | 'any' {
  const rule = domRuleType(f);
  if (rule) return [rule];
  const type = (f.inputType ?? 'text').toLowerCase();
  const ac = (f.autocomplete ?? '').toLowerCase();
  if (type === 'email' || ac === 'email') return ['EMAIL'];
  if (type === 'tel' || ac.startsWith('tel')) return ['PHONE'];
  return 'any';
}
