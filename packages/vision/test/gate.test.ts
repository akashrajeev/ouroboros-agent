import { describe, expect, it } from 'vitest';
import { dHash, dirtyTiles, hamming, tileHashes } from '../src/index';

function stripes(w: number, h: number, flipAt?: { x: number; y: number; s: number }) {
  const d = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let v = (Math.floor(x / 7) + Math.floor(y / 5)) % 2 ? 230 : 20;
    if (flipAt && x >= flipAt.x && x < flipAt.x + flipAt.s && y >= flipAt.y && y < flipAt.y + flipAt.s) v = 255 - v + ((x * 13) % 40);
    const i = (y * w + x) * 4; d[i] = d[i + 1] = d[i + 2] = v; d[i + 3] = 255;
  }
  return { data: d, width: w, height: h };
}

describe('A1/G2 pixel change gate', () => {
  it('identical frames hash equal; a local change dirties only nearby tiles', () => {
    const a = stripes(320, 240), b = stripes(320, 240, { x: 200, y: 150, s: 30 });
    expect(hamming(dHash(a), dHash(stripes(320, 240)))).toBe(0);
    expect(dirtyTiles(tileHashes(a), tileHashes(stripes(320, 240)), 320, 240)).toHaveLength(0);
    const dirty = dirtyTiles(tileHashes(a), tileHashes(b), 320, 240);
    expect(dirty.length).toBeGreaterThan(0);
    expect(dirty.length).toBeLessThanOrEqual(4);
    expect(dirty.every((t) => t.x >= 160 && t.y >= 120)).toBe(true);
  });
  it('first frame is all dirty', () => {
    expect(dirtyTiles(undefined, tileHashes(stripes(64, 64)), 64, 64)).toHaveLength(64);
  });
});
