import { expect, it, vi } from 'vitest';
import { safetyDrill } from '../lib/safetyDrill';
it('fires the real gate without network work', async () => {
  const fetchSpy = vi.spyOn(globalThis, 'fetch');
  try {
    const r = await safetyDrill();
    expect(r.blocked).toBe(true);
    expect(r.hits).toBeGreaterThan(0);
    expect(r.networkRequests).toBe(0);
    expect(r.bytes).toBeGreaterThan(0);
    expect(fetchSpy).not.toHaveBeenCalled();
  } finally { fetchSpy.mockRestore(); }
});
