import { PaddleOcr, YuNet, processScreenshot } from '@ouroboros/vision';

const out = document.getElementById('out')!;
const log = (s: string) => { out.textContent += `${s}\n`; };
const base = browser.runtime.getURL('/' as never);

function drawCard(): ImageData {
  const c = document.getElementById('card') as HTMLCanvasElement;
  const g = c.getContext('2d')!;
  g.fillStyle = '#f4f1e8'; g.fillRect(0, 0, 720, 440);
  g.fillStyle = '#000'; g.font = 'bold 30px sans-serif'; g.fillText('GOVERNMENT OF INDIA', 30, 55);
  g.font = '22px sans-serif';
  ['Name: Ravi Kumar', 'DOB: 14/08/1999', 'Aadhaar: 2345 6789 0124', 'PAN: ABCPE1234F', 'Mobile: 9876543210', 'Order #22405156']
    .forEach((t, i) => g.fillText(t, 30, 110 + i * 40));
  return g.getImageData(0, 0, 720, 440);
}

async function bench(ep: 'webgpu' | 'wasm') {
  const ort = await import('onnxruntime-web/webgpu');
  ort.env.wasm.wasmPaths = `${base}ort/`;
  ort.env.wasm.numThreads = 1;
  const wrap = { Tensor: ort.Tensor, InferenceSession: { create: (m: string | Uint8Array) => ort.InferenceSession.create(m as Uint8Array, { executionProviders: [ep] }) } };
  const bytes = async (p: string) => new Uint8Array(await (await fetch(`${base}models/${p}`)).arrayBuffer());
  let t = performance.now();
  const ocr = await PaddleOcr.create(wrap as never, await bytes('paddleocr/det.onnx'), await bytes('paddleocr/rec.onnx'), await (await fetch(`${base}models/paddleocr/dict.txt`)).text());
  const yn = await YuNet.create(wrap as never, await bytes('yunet/face_detection_yunet_2023mar.onnx'));
  const load = performance.now() - t;
  const card = drawCard();
  const ms: number[] = [];
  let text = '';
  for (let i = 0; i < 11; i++) {
    const shot = { data: new Uint8ClampedArray(card.data), width: card.width, height: card.height };
    t = performance.now();
    const r = await processScreenshot(shot, [{ x: 0, y: 0, w: 720, h: 440 }], ocr, yn);
    ms.push(performance.now() - t);
    text = r.imageText;
  }
  ms.shift();
  ms.sort((a, b) => a - b);
  log(`${ep}: load ${load.toFixed(0)} ms, p50 ${ms[5]!.toFixed(0)} ms, p95 ${ms[9]!.toFixed(0)} ms; PAN still readable after masking: ${text.includes('ABCPE1234F')}`);
}

document.getElementById('go')!.addEventListener('click', async () => {
  out.textContent = `${navigator.userAgent}\nWebGPU available: ${'gpu' in navigator}\n`;
  for (const ep of ['wasm', 'webgpu'] as const) {
    try { await bench(ep); } catch (e) { log(`${ep}: failed - ${String(e)}`); }
  }
});
