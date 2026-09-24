import { describe, expect, it } from 'vitest';
import { confirmWithTimeout } from '../lib/messages';

describe('popup confirmation', () => {
  it('only an explicit true approves; errors and silence decline', async () => {
    expect(await confirmWithTimeout(async () => true)).toBe(true);
    expect(await confirmWithTimeout(async () => 'yes')).toBe(false);
    expect(await confirmWithTimeout(async () => { throw new Error('no popup'); })).toBe(false);
    expect(await confirmWithTimeout(() => new Promise(() => {}), 20)).toBe(false);
  });
});
