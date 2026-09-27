/** Local GUIClip ViT visual screen-state probe. Experimental, never a privacy or action gate. */
import * as ort from 'onnxruntime-web';

const LABELS = ['login', 'registration', 'checkout', 'search', 'error'] as const;
const canvas = document.querySelector<HTMLCanvasElement>('#screen')!;
const ctx = canvas.getContext('2d')!;
const output = document.querySelector<HTMLPreElement>('#out')!;
const button = document.querySelector<HTMLButtonElement>('#go')!;
const base = browser.runtime.getURL('/' as never);
const screens: { truth: typeof LABELS[number]; lines: string[] }[] = [
  { truth: 'login', lines: ['Welcome back', 'Email', 'Password', 'Sign in'] },
  { truth: 'registration', lines: ['Create your account', 'Full name', 'Password', 'Sign up'] },
  { truth: 'checkout', lines: ['Checkout', 'Shipping address', 'Card number', 'Pay now'] },
  { truth: 'search', lines: ['Search results', 'Camera results', 'Filters', 'Search'] },
  { truth: 'error', lines: ['Page not found', '404 error', 'Try again', 'Back'] },
];
function draw(lines: string[]): void {
  ctx.fillStyle = '#f8f9fb'; ctx.fillRect(0, 0, 800, 520);
  ctx.fillStyle = '#111'; ctx.font = 'bold 36px Arial'; ctx.fillText(lines[0]!, 60, 80);
  ctx.font = '25px Arial'; ctx.fillText(lines[1]!, 60, 155); ctx.strokeRect(60, 170, 600, 50);
  ctx.fillText(lines[2]!, 60, 275); ctx.strokeRect(60, 290, 600, 50);
  ctx.fillStyle = '#1371cd'; ctx.fillRect(60, 380, 600, 55);
  ctx.fillStyle = '#fff'; ctx.fillText(lines[3]!, 250, 416);
}
function pixelsToTensor(image: CanvasImageSource, width: number, height: number): ort.Tensor {
  // GUIClip's CLIPImageProcessor: resize shortest edge to 224, then center-crop 224x224.
  const size = 224, scale = size / Math.min(width, height);
  const resized = document.createElement('canvas');
  resized.width = Math.round(width * scale); resized.height = Math.round(height * scale);
  const rctx = resized.getContext('2d')!;
  rctx.imageSmoothingEnabled = true; rctx.imageSmoothingQuality = 'high';
  rctx.drawImage(image, 0, 0, resized.width, resized.height);
  const crop = document.createElement('canvas'); crop.width = crop.height = size;
  const cctx = crop.getContext('2d')!;
  cctx.drawImage(resized, Math.floor((resized.width - size) / 2), Math.floor((resized.height - size) / 2), size, size, 0, 0, size, size);
  const rgba = cctx.getImageData(0, 0, size, size).data;
  const mean = [.48145466, .4578275, .40821073], std = [.26862954, .26130258, .27577711];
  const data = new Float32Array(3 * size * size);
  for (let i = 0; i < size * size; i++) for (let ch = 0; ch < 3; ch++)
    data[ch * size * size + i] = (rgba[i * 4 + ch]! / 255 - mean[ch]!) / std[ch]!;
  return new ort.Tensor('float32', data, [1, 3, size, size]);
}
async function run(): Promise<void> {
  button.disabled = true; output.textContent = 'Loading GUIClip ViT locally...';
  try {
    ort.env.wasm.wasmPaths = `${base}ort/`; ort.env.wasm.numThreads = 1;
    const start = performance.now();
    const [session, response] = await Promise.all([
      ort.InferenceSession.create(`${base}models/guiclip/vision-int8.onnx`, { executionProviders: ['wasm'] }),
      fetch(`${base}models/guiclip/embeddings.json`),
    ]);
    if (!response.ok) throw new Error(`GUIClip fixed embeddings missing (${response.status})`);
    const { embeddings } = await response.json() as { embeddings: number[][] };
    const loadMs = performance.now() - start;
    const rows: { truth: string; prediction: string; score: number; margin: number; inferenceMs: number }[] = [];
    for (const screen of screens) {
      draw(screen.lines);
      const begin = performance.now();
      const result = await session.run({ pixel_values: pixelsToTensor(canvas, canvas.width, canvas.height) });
      const vector = Array.from(result.image_features!.data as Float32Array);
      const norm = Math.hypot(...vector);
      const ranked = embeddings.map((textVector, index) => ({
        label: LABELS[index]!,
        score: textVector.reduce((sum, n, j) => sum + n * vector[j]! / norm, 0),
      })).sort((a, b) => b.score - a.score);
      rows.push({ truth: screen.truth, prediction: ranked[0]!.label, score: ranked[0]!.score,
        margin: ranked[0]!.score - ranked[1]!.score, inferenceMs: performance.now() - begin });
    }
    output.textContent = JSON.stringify({
      correct: rows.filter((r) => r.truth === r.prediction).length, total: rows.length,
      loadMs, rows, caveat: 'Synthetic screen probe only. Non-gating; not a privacy or real-page accuracy score.',
    }, null, 2);
  } catch (e) { output.textContent = `Local GUIClip probe failed: ${String(e)}`; }
  finally { button.disabled = false; }
}
button.addEventListener('click', () => { void run(); });
