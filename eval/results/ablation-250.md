# Ablation (250 pages, seed 26171)

| Config | Structured P / R % | All types P / R % | NAME R % | ADDRESS R % | Decoys flagged | Values leaked pre-gate | ms/page mean / p95 |
|---|---|---|---|---|---|---|---|
| rules + patterns baseline (no models) | 100.0 / 100.0 | 100.0 / 81.4 | 0.0 | 0.0 | 0/2000 | 400/2150 | 5.1 / 9.0 |
| rules + patterns + NER (bert-small-pii int8) | 100.0 / 100.0 | 97.3 / 99.1 | 98.3 | 85.0 | 0/2000 | 2/2150 | 72.0 / 96.3 |
|  - NER model calls: 2975, cache hits: 1625, model ms per call: 5.5 | | | | | | | |

Timing is Node + happy-dom on a CPU sandbox (onnxruntime-node for NER), not the in-browser WebGPU/WASM path. Browser numbers come from the extension metrics logger.
