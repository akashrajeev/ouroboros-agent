# Metrics sample: end-to-end replay (A12)

20 emptied KYC/checkout pages from the Faker en_IN generator. The device loop runs in Node (happy-dom) against the real FastAPI server (planner: `vlm:Qwen/Qwen2.5-VL-7B-Instruct-AWQ`). The task text carries the real values; the server only sees placeholders. NER on. Rows: `phase9-qwen-qwen2.5-vl-7b-instruct-awq.csv` (460 steps), viewable in the extension dashboard (load CSV).

- Run outcomes: max_steps 18, done 2
- Fields filled with the exact original value after local rehydration: **50 of 120** (fields whose value the task supplied; password/OTP fields are never filled by design)
- Steps: 460; G1 reused the sanitized screen on 86.7%; masked image sent on 0.0%
- Leak-gate blocks: 0. Independent check over every request body sent: **0 of 460** contained a real value (exact or normalized)
- Payload per step: mean 4761 bytes, ~1191 tokens (bytes/4 estimate); 547697 tokens for the whole replay
- Model warm-up (NER): 650 ms

| Stage | p50 ms | p95 ms |
|---|--:|--:|
| observe | 0.61 | 3.33 |
| sanitize | 0.03 | 7.26 |
| vision | 0.00 | 0.00 |
| gate | 0.71 | 1.30 |
| server | 633.86 | 1359.26 |
| total | 637.05 | 1360.43 |

## Caveats

- The server stage includes the tunnel round-trip to the free-tier GPU, so it overstates what a co-located server would add.
- The planner fills one field per step, so many steps see a changed screen; G1 skips here come from the re-observe after each action.
