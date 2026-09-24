# HELD-OUT adversarial set (50 pages, seed 779)

Fresh seed, never inspected before this run. Categories: label variants, Hindi labels, values split across elements, odd formats, headerless tables. Scored as-is.

| Config | Structured P / R % | All types P / R % | NAME R % | ADDRESS R % | Decoys flagged | Values leaked pre-gate | ms/page mean / p95 |
|---|---|---|---|---|---|---|---|
| rules + patterns baseline (no models) | 99.3 / 99.3 | 99.3 / 74.5 | 0.0 | - | 0/0 | 50/200 | 4.7 / 9.6 |
|  - by template: label-variants R 80.0% leaks 10/50; hindi-labels R 66.7% leaks 10/30; split-values R 100.0% leaks 0/20; odd-formats R 75.0% leaks 10/40; headerless-table R 65.0% leaks 20/60 | | | | | | | |
| rules + patterns + NER (bert-small-pii int8) | 99.3 / 99.3 | 98.5 / 98.5 | 96.0 | - | 0/0 | 1/200 | 20.0 / 27.9 |
|  - by template: label-variants R 100.0% leaks 0/50; hindi-labels R 96.7% leaks 0/30; split-values R 100.0% leaks 0/20; odd-formats R 100.0% leaks 0/40; headerless-table R 96.7% leaks 1/60 | | | | | | | |
|  - NER model calls: 210, cache hits: 99, model ms per call: 3.8 | | | | | | | |

Timing is Node + happy-dom on a CPU sandbox (onnxruntime-node for NER), not the in-browser WebGPU/WASM path. Browser numbers come from the extension metrics logger.
