# HELD-OUT adversarial set (50 pages, seed 777)

Not used for tuning: label variants, Hindi labels, values split across elements, odd formats, headerless tables. Scored as-is.

| Config | Structured P / R % | All types P / R % | NAME R % | ADDRESS R % | Decoys flagged | Values leaked pre-gate | ms/page mean / p95 |
|---|---|---|---|---|---|---|---|
| rules + patterns baseline (no models) | 87.5 / 46.7 | 87.5 / 35.0 | 0.0 | - | 0/0 | 120/200 | 4.7 / 6.6 |
|  - by template: label-variants R 60.0% leaks 10/50; hindi-labels R 66.7% leaks 10/30; split-values R 0.0% leaks 20/20; odd-formats R 0.0% leaks 40/40; headerless-table R 33.3% leaks 40/60 | | | | | | | |
| rules + patterns + NER (bert-small-pii int8) | 87.5 / 46.7 | 69.8 / 59.0 | 96.0 | - | 0/0 | 53/200 | 25.2 / 36.4 |
|  - by template: label-variants R 80.0% leaks 0/50; hindi-labels R 100.0% leaks 0/30; split-values R 0.0% leaks 5/20; odd-formats R 22.5% leaks 27/40; headerless-table R 65.0% leaks 21/60 | | | | | | | |
|  - NER model calls: 242, cache hits: 117, model ms per call: 4.2 | | | | | | | |

Timing is Node + happy-dom on a CPU sandbox (onnxruntime-node for NER), not the in-browser WebGPU/WASM path. Browser numbers come from the extension metrics logger.
