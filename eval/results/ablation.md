# Ablation (60 pages, seed 26171)

| Config | Structured P / R % | All types P / R % | NAME R % | ADDRESS R % | Decoys flagged | Values leaked pre-gate | ms/page mean / p95 |
|---|---|---|---|---|---|---|---|
| rules + patterns baseline (no models) | 100.0 / 100.0 | 100.0 / 81.4 | 0.0 | 0.0 | 0/480 | 96/516 | 10.6 / 21.1 |
| rules + patterns + NER (bert-small-pii int8) | 100.0 / 100.0 | 97.7 / 99.2 | 100.0 | 83.3 | 0/480 | 0/516 | 89.1 / 144.8 |
|  - NER model calls: 733, cache hits: 368, model ms per call: 6.5 | | | | | | | |

Timing is Node + happy-dom on a CPU sandbox (onnxruntime-node for NER), not the in-browser WebGPU/WASM path. Browser numbers come from the extension metrics logger.
