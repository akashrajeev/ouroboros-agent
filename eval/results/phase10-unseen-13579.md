# Metrics sample: end-to-end replay (A12)

20 emptied unseen-layout (profile, bank, label-variants, Hindi labels) pages from the Faker en_IN generator (seed 13579). The device loop runs in Node (happy-dom) against the real FastAPI server (planner: `vlm:Qwen/Qwen2.5-VL-7B-Instruct-AWQ`). The task text carries the real values; the server only sees placeholders. NER on. Rows: `phase10-unseen-13579.csv` (65 steps), viewable in the extension dashboard (load CSV).

- Run outcomes: done 20
- Per template (done / exact fields): profile 5/5, 0/0; label-variants 5/5, 25/25; bank 5/5, 0/0; hindi-labels 5/5, 15/15
- Fields filled with the exact original value after local rehydration: **40 of 40** (fields whose value the task supplied; password/OTP fields are never filled by design)
- Steps: 65; G1 reused the sanitized screen on 7.7%; masked image sent on 0.0%
- Leak-gate blocks: 0. Independent check over every request body sent: **0 of 65** contained a real value (exact or normalized)
- Payload per step: mean 1289 bytes, ~322 tokens (bytes/4 estimate); 20956 tokens for the whole replay
- Model warm-up (NER): 734 ms

| Stage | p50 ms | p95 ms |
|---|--:|--:|
| observe | 0.98 | 8.70 |
| sanitize | 5.25 | 91.50 |
| vision | 0.00 | 0.00 |
| gate | 0.47 | 1.45 |
| server | 830.18 | 1764.99 |
| total | 835.85 | 1873.11 |

## Caveats

- The server stage includes the tunnel round-trip to the free-tier GPU, so it overstates what a co-located server would add.
- The planner fills one field per step, so many steps see a changed screen; G1 skips here come from the re-observe after each action.
