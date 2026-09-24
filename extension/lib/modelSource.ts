/**
 * Where on-device model files come from. Build-time option (WXT_NER_SOURCE):
 *  - 'bundled'  : NER files ship inside the extension (+28.7 MB zip). Default.
 *  - 'download' : NER files are fetched once from pinned Hugging Face URLs, verified by
 *                 SHA-256, and kept in Cache Storage. Only these fixed URLs are contacted;
 *                 no user data is involved. Vision models (10.5 MB) always ship bundled.
 *  - 'off'      : rules + vision only.
 */
export type NerSource = 'bundled' | 'download' | 'off';

export interface RemoteFile { path: string; url: string; sha256: string; bytes: number }

const HF = 'https://huggingface.co/gravitee-io/bert-small-pii-detection/resolve/main';
/** Pinned to the files fetch-models.sh downloads; the hash check makes a changed upstream file fail closed. */
export const NER_FILES: RemoteFile[] = [
  { path: 'bert-small-pii/onnx/model_quantized.onnx', url: `${HF}/model.quant.onnx`, sha256: 'b227845ff4989c9f7383874b841895dfbdb9a4d7a20ceb39c3f187271894bf2a', bytes: 28732710 },
  { path: 'bert-small-pii/config.json', url: `${HF}/config.json`, sha256: '6757df1ae2ec9ca16cef63009af337a66573d06c721d03c7820590f69eefa6c8', bytes: 3044 },
  { path: 'bert-small-pii/tokenizer.json', url: `${HF}/tokenizer.json`, sha256: 'd241a60d5e8f04cc1b2b3e9ef7a4921b27bf526d9f6050ab90f9267a1f9e5c66', bytes: 711396 },
  { path: 'bert-small-pii/tokenizer_config.json', url: `${HF}/tokenizer_config.json`, sha256: '01a629a4923673b9a7a6d7da214952152c87c7ab3e002aae8e1e025486942163', bytes: 1408 },
  { path: 'bert-small-pii/special_tokens_map.json', url: `${HF}/special_tokens_map.json`, sha256: '5d5b662e421ea9fac075174bb0688ee0d9431699900b90662acd44b2a350503a', bytes: 695 },
];

export async function sha256Hex(buf: ArrayBuffer): Promise<string> {
  const d = await crypto.subtle.digest('SHA-256', buf);
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export interface CacheLike { match(key: string): Promise<Response | undefined>; put(key: string, r: Response): Promise<void> }

/** Download (once) and verify the pinned files into `cache`, keyed by the local model URL they stand in for. */
export async function ensureDownloaded(files: RemoteFile[], localBase: string, cache: CacheLike, fetchFn: typeof fetch = fetch,
  onProgress?: (done: number, total: number) => void): Promise<void> {
  let i = 0;
  for (const f of files) {
    const key = `${localBase}${f.path}`;
    if (!(await cache.match(key))) {
      const r = await fetchFn(f.url);
      if (!r.ok) throw new Error(`model download failed: ${f.path} ${r.status}`);
      const buf = await r.arrayBuffer();
      const got = await sha256Hex(buf);
      if (got !== f.sha256) throw new Error(`model integrity check failed: ${f.path}`);
      await cache.put(key, new Response(buf, { headers: { 'content-type': 'application/octet-stream' } }));
    }
    onProgress?.(++i, files.length);
  }
}

/**
 * Serve cached model files for local model URLs so loaders (Transformers.js, our ORT host)
 * keep using one path whether files are bundled or downloaded. Other requests pass through.
 */
export function cachedFetch(localBase: string, cache: CacheLike, inner: typeof fetch = fetch): typeof fetch {
  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    if (url.startsWith(`${localBase}bert-small-pii/`)) {
      const hit = await cache.match(url);
      if (hit) return hit;
    }
    return inner(input, init);
  }) as typeof fetch;
}
