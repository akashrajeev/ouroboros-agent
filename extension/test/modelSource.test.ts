// @vitest-environment node
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { cachedFetch, ensureDownloaded, type CacheLike, type RemoteFile } from '../lib/modelSource';

class MemCache implements CacheLike {
  m = new Map<string, ArrayBuffer>();
  async match(k: string) { const b = this.m.get(k); return b ? new Response(b.slice(0)) : undefined; }
  async put(k: string, r: Response) { this.m.set(k, await r.arrayBuffer()); }
}
const body = new TextEncoder().encode('fake model bytes');
const file: RemoteFile = { path: 'bert-small-pii/onnx/model_quantized.onnx', url: 'https://hf.test/m.onnx', sha256: createHash('sha256').update(body).digest('hex'), bytes: body.length };
const BASE = 'chrome-extension://abc/models/';

describe('first-run NER download', () => {
  it('downloads once, verifies SHA-256, then serves from cache', async () => {
    const cache = new MemCache();
    let calls = 0;
    const net = (async () => { calls++; return new Response(body); }) as unknown as typeof fetch;
    await ensureDownloaded([file], BASE, cache, net);
    await ensureDownloaded([file], BASE, cache, net);
    expect(calls).toBe(1);
    const f = cachedFetch(BASE, cache, (async () => new Response('bundled-miss', { status: 404 })) as unknown as typeof fetch);
    expect(await (await f(`${BASE}${file.path}`)).text()).toBe('fake model bytes');
    expect((await f(`${BASE}paddleocr/det.onnx`)).status).toBe(404); // vision files are never served from the download cache
  });
  it('fails closed on a tampered file and caches nothing', async () => {
    const cache = new MemCache();
    const net = (async () => new Response('tampered')) as unknown as typeof fetch;
    await expect(ensureDownloaded([file], BASE, cache, net)).rejects.toThrow(/integrity/);
    expect(cache.m.size).toBe(0);
  });
});
