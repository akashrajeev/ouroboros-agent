/** Experimental GUIClip ViT-B/32 screen-state hint; never used for privacy or action gates. */
import * as ort from 'onnxruntime-web';

const LABELS = ['login', 'registration', 'checkout', 'search', 'error'] as const;
export type SemanticHint = { label: typeof LABELS[number]; score: number; margin: number };
let pending: Promise<{ session: ort.InferenceSession; embeddings: number[][] }> | undefined;

async function model() {
  const base = browser.runtime.getURL('/' as never);
  ort.env.wasm.wasmPaths = `${base}ort/`;
  ort.env.wasm.numThreads = 1;
  pending ??= Promise.all([
    ort.InferenceSession.create(`${base}models/guiclip/vision-int8.onnx`, { executionProviders: ['wasm'] }),
    fetch(`${base}models/guiclip/embeddings.json`).then(async r => {
      if (!r.ok) throw new Error(`GUIClip embeddings unavailable: ${r.status}`);
      return (await r.json() as { embeddings: number[][] }).embeddings;
    }),
  ]).then(([session, embeddings]) => ({ session, embeddings })).catch(e => { pending = undefined; throw e; });
  return pending;
}

/** CLIPImageProcessor: shortest-edge resize, 224x224 center crop, RGB normalization. */
function tensor(image: OffscreenCanvas): ort.Tensor {
  const size = 224, scale = size / Math.min(image.width, image.height);
  const resized = new OffscreenCanvas(Math.round(image.width * scale), Math.round(image.height * scale));
  const rctx = resized.getContext('2d')!;
  rctx.imageSmoothingEnabled = true;
  rctx.imageSmoothingQuality = 'high';
  rctx.drawImage(image, 0, 0, resized.width, resized.height);
  const cropped = new OffscreenCanvas(size, size);
  const cctx = cropped.getContext('2d')!;
  cctx.drawImage(resized, Math.floor((resized.width - size) / 2), Math.floor((resized.height - size) / 2), size, size, 0, 0, size, size);
  const rgba = cctx.getImageData(0, 0, size, size).data;
  const mean = [.48145466, .4578275, .40821073], std = [.26862954, .26130258, .27577711];
  const data = new Float32Array(3 * size * size);
  for (let i = 0; i < size * size; i++) for (let ch = 0; ch < 3; ch++)
    data[ch * size * size + i] = (rgba[i * 4 + ch]! / 255 - mean[ch]!) / std[ch]!;
  return new ort.Tensor('float32', data, [1, 3, size, size]);
}

/** Input MUST be a masked screenshot. Fixed labels only; no image/text leaves this method. */
export async function classifyMasked(image: OffscreenCanvas): Promise<SemanticHint> {
  const { session, embeddings } = await model();
  const result = await session.run({ pixel_values: tensor(image) });
  const vector = Array.from(result.image_features!.data as Float32Array);
  const norm = Math.hypot(...vector);
  if (!Number.isFinite(norm) || norm === 0 || embeddings.length !== LABELS.length) throw new Error('Invalid GUIClip output');
  const ranked = embeddings.map((row, index) => ({
    label: LABELS[index]!, score: row.reduce((sum, n, j) => sum + n * vector[j]! / norm, 0),
  })).sort((a, b) => b.score - a.score);
  if (!Number.isFinite(ranked[0]!.score)) throw new Error('Invalid GUIClip score');
  return { label: ranked[0]!.label, score: ranked[0]!.score, margin: ranked[0]!.score - ranked[1]!.score };
}
