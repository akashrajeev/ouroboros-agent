# Metrics sample: end-to-end replay (A12)

20 emptied unseen-layout (profile, bank, label-variants, Hindi labels) pages from the Faker en_IN generator (seed 8675309). The device loop runs in Node (happy-dom) against the real FastAPI server (planner: `vlm:Qwen/Qwen2.5-VL-7B-Instruct-AWQ`). The task text carries the real values; the server only sees placeholders. NER on. Rows: `phase9-qwen-qwen2.5-vl-7b-instruct-awq-e6b-fresh.csv` (60 steps), viewable in the extension dashboard (load CSV).

- Run outcomes: exec_failed 10, done 10
- Per template (done / exact fields): profile 0/5, 0/0; label-variants 5/5, 25/25; bank 0/5, 0/0; hindi-labels 5/5, 15/15
- Fields filled with the exact original value after local rehydration: **40 of 40** (fields whose value the task supplied; password/OTP fields are never filled by design)
- Steps: 60; G1 reused the sanitized screen on 0.0%; masked image sent on 0.0%
- Leak-gate blocks: 0. Independent check over every request body sent: **0 of 60** contained a real value (exact or normalized)
- Payload per step: mean 2235 bytes, ~559 tokens (bytes/4 estimate); 33542 tokens for the whole replay
- Model warm-up (NER): 612 ms

| Stage | p50 ms | p95 ms |
|---|--:|--:|
| observe | 1.23 | 5.78 |
| sanitize | 5.27 | 98.43 |
| vision | 0.00 | 0.00 |
| gate | 0.52 | 1.73 |
| server | 790.90 | 914.59 |
| total | 813.73 | 965.78 |

## Caveats

- The server stage includes the tunnel round-trip to the free-tier GPU, so it overstates what a co-located server would add.
- The planner fills one field per step, so many steps see a changed screen; G1 skips here come from the re-observe after each action.
