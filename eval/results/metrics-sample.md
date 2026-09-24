# Metrics sample: end-to-end replay (A12)

20 emptied KYC/checkout pages from the Faker en_IN generator. The device loop runs in Node (happy-dom) against the real FastAPI server with the deterministic stub planner (no VLM) over HTTP on localhost. The task text carries the real values; the server only sees placeholders. NER on. Rows: `metrics-sample.csv` (150 steps), viewable in the extension dashboard (load CSV).

- Run outcomes: done 20
- Fields filled with the exact original value after local rehydration: **120 of 120** (fields whose value the task supplied; password/OTP fields are never filled by design)
- Steps: 150; G1 reused the sanitized screen on 6.7%; masked image sent on 0.0% (the stub never asks for need_visual)
- Leak-gate blocks: 0. Independent check over every request body sent: **0 of 150** contained a real value (exact or normalized)
- Payload per step: mean 4563 bytes, ~1141 tokens (bytes/4 estimate); 171153 tokens for the whole replay
- Model warm-up (NER): 737 ms

| Stage | p50 ms | p95 ms |
|---|--:|--:|
| observe | 1.35 | 6.39 |
| sanitize | 5.56 | 37.13 |
| vision | 0.00 | 0.00 |
| gate | 0.75 | 2.06 |
| server | 5.15 | 6.69 |
| total | 12.90 | 49.06 |

## Caveats

- The server stage is the stub planner on localhost, so M5 here excludes real VLM inference and network time. It is a lower bound for the device-side cost only.
- The planner fills one field per step, so many steps see a changed screen; G1 skips here come from the re-observe after each action.
