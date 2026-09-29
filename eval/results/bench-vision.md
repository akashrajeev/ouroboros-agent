# Benchmark: vision runtime (G6) and region cache (G4)

Machine: Intel(R) Xeon(R) Processor @ 2.60GHz x2 (sandbox, shared), Node v22.23.3. Workload: 10 synthetic 720x440 ID cards (PP-OCRv3 det + PP-OCRv5 rec + YuNet + masking + re-OCR), whole card as one opaque region; first run excluded as warm-up.

| Runtime | Model load ms | p50 ms / image | p95 ms / image |
|---|--:|--:|--:|
| onnxruntime-node CPU (default threads) | 147 | 672 | 1004 |
| onnxruntime-web WASM, 1 thread (extension runtime) | 1402 | 1787 | 2642 |
| onnxruntime-web WASM, 4 threads (extension runtime) | 166 | 1944 | 2845 |
| onnxruntime-web WebGPU | - | not measured | not measured |

WebGPU is not available in this sandbox (no GPU, no browser). The extension bench page (`bench.html`) runs the same workload with `executionProviders: ['webgpu']` vs `['wasm']` on a real machine.

## G4 region cache

10 steps with the same card on screen, one change at step 5 (onnxruntime-node): **8 of 10 regions served from cache** (ceiling 8). Total vision time 1421 ms with the cache vs 6499 ms without (78% saved). A hit still masks the frame; it skips OCR, face detection and re-OCR. The key is an exact pixel hash, so any changed pixel is a miss.

## Caveats

- Shared sandbox CPU; absolute numbers will differ on a student laptop. The ratio between rows is the useful part.
- Extension pages run WASM single-threaded unless the page is cross-origin isolated, so the 1-thread WASM row is the realistic in-browser CPU number.
