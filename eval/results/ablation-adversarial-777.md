# HELD-OUT adversarial set (50 pages, seed 777)

Seed 777 was inspected once (the first held-out run) and drove the generic fixes, so it is no longer clean; fresh seeds are the clean numbers. Categories: label variants, Hindi labels, values split across elements, odd formats, headerless tables. Scored as-is.

| Config | Structured P / R % | All types P / R % | NAME R % | ADDRESS R % | Decoys flagged | Values leaked pre-gate | ms/page mean / p95 |
|---|---|---|---|---|---|---|---|
| rules + patterns baseline (no models) | 93.3 / 93.3 | 93.3 / 70.0 | 0.0 | - | 0/0 | 50/200 | 4.6 / 7.5 |
|  - by template: label-variants R 60.0% leaks 10/50; hindi-labels R 66.7% leaks 10/30; split-values R 100.0% leaks 0/20; odd-formats R 75.0% leaks 10/40; headerless-table R 66.7% leaks 20/60 | | | | | | | |
| rules + patterns + NER (bert-small-pii int8) | 93.3 / 93.3 | 90.4 / 94.0 | 96.0 | - | 0/0 | 2/200 | 21.5 / 29.6 |
|  - by template: label-variants R 80.0% leaks 0/50; hindi-labels R 100.0% leaks 0/30; split-values R 100.0% leaks 0/20; odd-formats R 97.5% leaks 1/40; headerless-table R 98.3% leaks 1/60 | | | | | | | |
|  - NER model calls: 210, cache hits: 99, model ms per call: 4.1 | | | | | | | |

Timing is Node + happy-dom on a CPU sandbox (onnxruntime-node for NER), not the in-browser WebGPU/WASM path. Browser numbers come from the extension metrics logger.
