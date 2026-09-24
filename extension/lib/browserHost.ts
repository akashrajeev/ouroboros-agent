import type { TextMatch } from '@ouroboros/core';
import type { Box } from '@ouroboros/vision';
import { ModelHost, toShotBoxes } from './modelHost';
import { cachedFetch, ensureDownloaded, NER_FILES, type NerSource } from './modelSource';

export const NER_SOURCE: NerSource = ((import.meta as { env?: Record<string, string> }).env?.WXT_NER_SOURCE as NerSource) || 'bundled';

/** Messages handled by the model host (offscreen document in Chrome, background page in Firefox). */
export type HostRequest =
  | { type: 'ouro:host:prime'; target: 'host'; texts: string[] }
  | { type: 'ouro:host:visual'; target: 'host'; dataUrl: string; regions: Box[]; viewportW: number };

export type PrimeResponse = Record<string, TextMatch[]>;
export interface VisualResponse { jpegB64: string; imageText: string; detections: number; regions: number; cacheHits: number; ms: Record<string, number> }

let host: ModelHost | undefined;

async function getHost(): Promise<ModelHost> {
  if (host) return host;
  const ort = await import('onnxruntime-web/webgpu'); // same asyncify WASM build Transformers.js uses: one runtime, WebGPU-capable
  const base = browser.runtime.getURL('/' as never);
  ort.env.wasm.wasmPaths = `${base}ort/`;
  ort.env.wasm.numThreads = 1; // no cross-origin isolation in extension pages
  const get = (p: string) => fetch(`${base}models/${p}`);
  host = new ModelHost({
    ort: ort as never,
    bytes: async (p) => new Uint8Array(await (await get(p)).arrayBuffer()),
    text: async (p) => (await get(p)).text(),
    ner: NER_SOURCE === 'off' ? undefined : async () => {
      if (NER_SOURCE === 'download') {
        const cache = await caches.open('ouro-models-v1');
        await ensureDownloaded(NER_FILES, `${base}models/`, cache);
        globalThis.fetch = cachedFetch(`${base}models/`, cache, globalThis.fetch.bind(globalThis));
      }
      const [{ NerDetector }, tf] = await Promise.all([import('@ouroboros/ner'), import('@huggingface/transformers')]);
      tf.env.backends.onnx.wasm!.wasmPaths = `${base}ort/`;
      tf.env.backends.onnx.wasm!.numThreads = 1;
      tf.env.useBrowserCache = false; // files are local (bundled) or already in our verified cache
      return NerDetector.create({ localModelPath: `${base}models/` });
    },
  });
  return host;
}

async function decode(dataUrl: string) {
  const bmp = await createImageBitmap(await (await fetch(dataUrl)).blob());
  const canvas = new OffscreenCanvas(bmp.width, bmp.height);
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(bmp, 0, 0);
  return { canvas, ctx, img: ctx.getImageData(0, 0, bmp.width, bmp.height) };
}

export async function handleHostRequest(msg: HostRequest): Promise<PrimeResponse | VisualResponse> {
  const h = await getHost();
  if (msg.type === 'ouro:host:prime') {
    await h.prime(msg.texts);
    return Object.fromEntries(msg.texts.map((t) => [t, h.lookup(t)]).filter(([, m]) => (m as TextMatch[]).length));
  }
  const { canvas, ctx, img } = await decode(msg.dataUrl);
  const shot = { data: img.data, width: img.width, height: img.height };
  const r = await h.visual(shot, toShotBoxes(msg.regions, msg.viewportW, img.width));
  ctx.putImageData(img, 0, 0);
  const blob = await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.8 });
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return { jpegB64: btoa(bin), imageText: r.imageText, detections: r.detections, regions: r.regions, cacheHits: r.cacheHits, ms: r.ms };
}
