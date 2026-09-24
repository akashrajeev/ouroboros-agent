import { describe, expect, it } from 'vitest';
import { toMatches, tokenSpans } from '../src/align';

describe('token alignment', () => {
  it('maps wordpieces back to character spans', () => {
    expect(tokenSpans('Hi Rageshwari!', ['hi', 'rage', '##sh', '##wari', '!'])).toEqual([[0, 2], [3, 7], [7, 9], [9, 13], [13, 14]]);
  });

  it('merges B/I tokens and adjacent same-type words into one span', () => {
    const text = 'this is Ravi Kumar, thanks';
    const tokens = ['this', 'is', 'ravi', 'kumar', ',', 'thanks'];
    const ents = [
      { entity: 'B-PERSON', score: 0.97, index: 3, word: 'ravi' },
      { entity: 'B-PERSON', score: 0.94, index: 4, word: 'kumar' },
    ];
    const m = toMatches(text, tokens, ents, 0.5);
    expect(m).toHaveLength(1);
    expect(m[0]).toMatchObject({ type: 'NAME', value: 'Ravi Kumar', source: 'ner' });
  });

  it('allowlist drops structured types and address spans absorb house numbers', () => {
    const text = 'at 1950, Achari Knoll call 9876543210';
    const tokens = ['at', '1950', ',', 'ac', '##hari', 'knoll', 'call', '98765', '##43210'];
    const ents = [
      { entity: 'B-LOCATION', score: 0.8, index: 4, word: 'ac' },
      { entity: 'I-LOCATION', score: 0.8, index: 5, word: '##hari' },
      { entity: 'I-LOCATION', score: 0.8, index: 6, word: 'knoll' },
      { entity: 'B-PHONE_NUMBER', score: 0.99, index: 8, word: '98765' },
    ];
    const m = toMatches(text, tokens, ents, 0.5, new Set(['NAME', 'ADDRESS']));
    expect(m.map((x) => [x.type, x.value])).toEqual([['ADDRESS', '1950, Achari Knoll']]);
  });

  it('absorbs a name-like word sandwiched inside an address', () => {
    const text = '1781, Anand Swarup Stream, Wankaner';
    const tokens = ['1781', ',', 'anand', 'swarup', 'stream', ',', 'wankaner'];
    const ents = [
      { entity: 'B-LOCATION', score: 0.8, index: 1, word: '1781' },
      { entity: 'B-PERSON', score: 0.7, index: 3, word: 'anand' },
      { entity: 'B-LOCATION', score: 0.8, index: 4, word: 'swarup' },
      { entity: 'I-LOCATION', score: 0.8, index: 5, word: 'stream' },
      { entity: 'I-LOCATION', score: 0.8, index: 7, word: 'wankaner' },
    ];
    expect(toMatches(text, tokens, ents, 0.5).map((x) => [x.type, x.value])).toEqual([['ADDRESS', text]]);
  });

  it('drops low-confidence and unmapped labels', () => {
    const text = 'at 5 pm in Kochi';
    const tokens = ['at', '5', 'pm', 'in', 'kochi'];
    const ents = [
      { entity: 'B-DATE_TIME', score: 0.99, index: 2, word: '5' },
      { entity: 'B-LOCATION', score: 0.3, index: 5, word: 'kochi' },
    ];
    expect(toMatches(text, tokens, ents, 0.5)).toEqual([]);
  });
});

import { dropKeywordNames } from '../src/index';
describe('dropKeywordNames', () => {
  it('drops a NAME that is only a field word, keeps real names', () => {
    const m = (value: string) => ({ type: 'NAME' as const, start: 0, end: value.length, value, source: 'ner' as const, confidence: 0.9 });
    expect(dropKeywordNames([m('UPI'), m('UPI ID'), m('Asha Rao')]).map((x) => x.value)).toEqual(['Asha Rao']);
  });
});

describe('dropKeywordNames edges', () => {
  it('trims a leading field word from a NAME span', () => {
    const r = dropKeywordNames([{ type: 'NAME', start: 10, end: 22, value: 'UPI diptendu', source: 'ner', confidence: 0.9 }]);
    expect(r).toEqual([{ type: 'NAME', start: 14, end: 22, value: 'diptendu', source: 'ner', confidence: 0.9 }]);
  });
});
