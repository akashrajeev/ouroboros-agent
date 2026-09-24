import type { PiiType, TextMatch } from '@ouroboros/core';

/**
 * Model label (without B-/I-) -> our type. Unlisted labels are ignored: rules own them, or they are not
 * personal data (ORGANIZATION, DATE_TIME, URL, TITLE). Masking company names would cost screen context (M1).
 */
export const LABEL_MAP: Record<string, PiiType> = {
  PERSON: 'NAME',
  LOCATION: 'ADDRESS',
  EMAIL_ADDRESS: 'EMAIL',
  PHONE_NUMBER: 'PHONE',
  CREDIT_CARD: 'CARD',
  PASSWORD: 'PASSWORD',
  FINANCIAL: 'ACCOUNT',
  US_BANK_NUMBER: 'ACCOUNT',
  IBAN_CODE: 'ACCOUNT',
  IP_ADDRESS: 'IP',
};

export interface TokenEntity { entity: string; score: number; index: number; word: string }

/** Char spans for WordPiece tokens by sequential search (uncased model: compare lowercased, accent-stripped). */
export function tokenSpans(text: string, tokens: string[]): ([number, number] | null)[] {
  const hay = text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const sameLen = hay.length === text.length;
  let cursor = 0;
  return tokens.map((t) => {
    const piece = t.startsWith('##') ? t.slice(2) : t;
    if (!piece || piece.startsWith('[')) return null;
    const i = hay.indexOf(piece.toLowerCase(), cursor);
    if (i < 0 || !sameLen) return null;
    cursor = i + piece.length;
    return [i, i + piece.length];
  });
}

/**
 * Group token entities into spans. Consecutive tokens of the same type merge, and
 * so do same-type spans separated only by spaces (e.g. "ravi" B-PERSON, "kumar" B-PERSON).
 */
export function toMatches(text: string, tokens: string[], ents: TokenEntity[], threshold: number, allow?: ReadonlySet<PiiType>): TextMatch[] {
  const spans = tokenSpans(text, tokens);
  const out: (TextMatch & { scores: number[] })[] = [];
  for (const e of ents) {
    const label = e.entity.replace(/^[BI]-/, '');
    const type = LABEL_MAP[label];
    if (type && allow && !allow.has(type)) continue;
    const span = spans[e.index - 1]; // index 0 is [CLS]
    if (!type || !span) continue;
    const last = out[out.length - 1];
    const gap = last ? text.slice(last.end, span[0]) : '';
    if (last && last.type === type && /^[\s,.'-]*$/.test(gap) && (e.entity.startsWith('I-') || /^\s*$/.test(gap) || (type === 'ADDRESS' && /^[\s,]*$/.test(gap)))) {
      last.end = span[1];
      last.scores.push(e.score);
    } else {
      out.push({ type, start: span[0], end: span[1], value: '', source: 'ner', confidence: 0, scores: [e.score] });
    }
  }
  // A person-name-looking word inside an address ("1781, Anand Swarup Stream") is part of the address.
  for (let i = 0; i + 2 < out.length; i++) {
    const [a, b, c] = [out[i]!, out[i + 1]!, out[i + 2]!];
    const small = (x: { end: number }, y: { start: number }) => /^[\s,]*$/.test(text.slice(x.end, y.start));
    if (a.type === 'ADDRESS' && b.type === 'NAME' && c.type === 'ADDRESS' && small(a, b) && small(b, c)) {
      a.end = c.end;
      a.scores.push(...b.scores, ...c.scores);
      out.splice(i + 1, 2);
      i--;
    }
  }
  return out
    .map(({ scores, ...m }) => ({ ...m, value: text.slice(m.start, m.end), confidence: scores.reduce((a, b) => a + b, 0) / scores.length }))
    .filter((m) => m.confidence >= threshold && m.value.trim().length > 2)
    .map((m) => (m.type === 'ADDRESS' ? extendHouseNumber(text, m) : m));
}

/** The model often drops a leading house/flat number ("1950, Achari Knoll"); pull it into the span. */
function extendHouseNumber(text: string, m: TextMatch): TextMatch {
  const before = /(?:^|[\s:])((?:(?:flat|house|no\.?|#)\s*)?\d{1,5}[A-Za-z]?(?:\/\d{1,4})?,?\s*)$/i.exec(text.slice(0, m.start));
  if (!before) return m;
  const start = m.start - before[1]!.length;
  return { ...m, start, value: text.slice(start, m.end) };
}

/**
 * Default fusion policy: the model only contributes types the rules cannot cover.
 * Structured types (phone, card, account...) stay with checksum/pattern rules, which are
 * far more precise; model hits on those were mostly checksum-failing look-alikes.
 */
export const DEFAULT_NER_TYPES: ReadonlySet<PiiType> = new Set<PiiType>(['NAME', 'ADDRESS']);
