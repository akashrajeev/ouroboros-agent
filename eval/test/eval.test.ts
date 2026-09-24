import { describe, expect, it } from 'vitest';
import { detectPatterns, verhoeffValid } from '@ouroboros/core';
import { generatePages } from '../src/generate';
import { scorePage, summarize } from '../src/score';

describe('synthetic pages', () => {
  const pages = generatePages(10);
  it('is deterministic by seed', () => expect(generatePages(10).map((p) => p.html)).toEqual(pages.map((p) => p.html)));
  it('every Aadhaar in ground truth is Verhoeff-valid', () => {
    for (const p of pages) for (const t of p.truth) if (t.type === 'AADHAAR') expect(verhoeffValid(t.value.replace(/\D/g, ''))).toBe(true);
  });
  it('decoys are not detected as PII on their own', () => {
    for (const p of pages) for (const d of p.decoys) expect(detectPatterns(d), d).toEqual([]);
  });
});

describe('scoring', () => {
  it('structured types reach full recall on a small sample and no decoy is flagged', async () => {
    const pages = generatePages(10);
    const scores = await Promise.all(pages.map((p) => scorePage(p)));
    const s = summarize(scores, pages[0]!.decoys.length);
    expect(s.decoysFlagged).toBe(0);
    expect(s.structured.recall).toBeGreaterThan(0.95);
    expect(s.gateTestPassWithLeak).toBe(0);
  });
});
