import { PaddleOcr } from '@ouroboros/vision';

// This page is extension-origin: image pixels and recognized text stay on the device.
// PP-OCRv3 is the existing local CV model, not the server Qwen VLM.
const out = document.getElementById('out')!;
const canvas = document.getElementById('screen') as HTMLCanvasElement;
const ctx = canvas.getContext('2d')!;
ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, 720, 320);
ctx.fillStyle = '#111'; ctx.font = 'bold 34px Arial';
ctx.fillText('GOVERNMENT OF INDIA', 20, 65);
ctx.font = '25px Arial';
ctx.fillText('Name: Ravi Kumar', 20, 120);
ctx.fillText('PAN: ABCPE1234F', 20, 170);
ctx.fillText('Continue', 20, 260);

const modelBytes = async (name: string) => {
  const r = await fetch(browser.runtime.getURL(`/models/paddleocr/${name}` as never));
  if (!r.ok) throw new Error(`Staged model ${name} missing (${r.status})`);
  return new Uint8Array(await r.arrayBuffer());
};
const percentile = (sorted: number[], q: number) => sorted[Math.ceil(q * sorted.length) - 1]!;
const candidates = ['GOVERNMENT OF INDIA', 'DRIVING LICENCE', 'INSURANCE CARD'];

document.getElementById('go')!.addEventListener('click', async () => {
  const go = document.getElementById('go') as HTMLButtonElement;
  go.disabled = true;
  out.textContent = 'Loading local OCR model...';
  try {
    const ort = await import('onnxruntime-web/webgpu');
    ort.env.wasm.wasmPaths = browser.runtime.getURL('/ort/' as never);
    ort.env.wasm.numThreads = 1;
    const backend = 'wasm'; // Browser CPU baseline; GPU comparison lives in bench.html.
    const wrap = { Tensor: ort.Tensor, InferenceSession: {
      create: (model: Uint8Array) => ort.InferenceSession.create(model, { executionProviders: [backend] }),
    } };
    const start = performance.now();
    const ocr = await PaddleOcr.create(wrap as never, await modelBytes('det.onnx'),
      await modelBytes('rec.onnx'),
      await (await fetch(browser.runtime.getURL('/models/paddleocr/dict.txt' as never))).text());
    const loadMs = performance.now() - start;
    const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const times: number[] = [];
    let category: string | null = null;
    for (let n = 0; n < 6; n++) {
      const t = performance.now();
      const lines = await ocr.read({ data: pixels.data, width: pixels.width, height: pixels.height });
      times.push(performance.now() - t);
      // Only allowlisted non-PII headings become a category; raw OCR never gets sent or logged.
      const text = lines.map((l) => l.text.toUpperCase()).join(' ').replace(/[^A-Z ]/g, '').replace(/\s+/g, ' ');
      const hits = candidates.filter((h) => text.includes(h));
      category = hits.length === 1 ? hits[0]! : null;
    }
    times.shift(); times.sort((a, b) => a - b); // first inference excluded
    out.textContent = `Backend: ${backend}\nCategory: ${category ?? 'unknown'}\n` +
      `Cold model load: ${loadMs.toFixed(1)} ms\n` +
      `Warm OCR (n=5): p50 ${percentile(times, .5).toFixed(1)} ms, p95 ${percentile(times, .95).toFixed(1)} ms\n` +
      'Model source: extension bundle. No server request. Not a general screen understanding or PII accuracy score.';
  } catch (e) {
    out.textContent = `Local OCR failed: ${String(e)}`;
  } finally { go.disabled = false; }
});
