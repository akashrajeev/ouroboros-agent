# Metrics sample: end-to-end replay (A12)

20 emptied unseen-layout (profile, bank, label-variants, Hindi labels) pages from the Faker en_IN generator (seed 31337). The device loop runs in Node (happy-dom) against the real FastAPI server (planner: `vlm:Qwen/Qwen2.5-VL-7B-Instruct-AWQ`). The task text carries the real values; the server only sees placeholders. NER on. Rows: `phase9-qwen-qwen2.5-vl-7b-instruct-awq-e6-unseen.csv` (45 steps), viewable in the extension dashboard (load CSV).

- Run outcomes: blocked 10, rejected 5, done 5
- Per template (done / exact fields): profile 0/5, 0/0; label-variants 0/5, 10/25; bank 0/5, 0/0; hindi-labels 5/5, 15/15
- Fields filled with the exact original value after local rehydration: **25 of 40** (fields whose value the task supplied; password/OTP fields are never filled by design)
- Steps: 45; G1 reused the sanitized screen on 0.0%; masked image sent on 0.0%
- Leak-gate blocks: 10. Independent check over every request body sent: **0 of 35** contained a real value (exact or normalized)
- Payload per step: mean 1255 bytes, ~314 tokens (bytes/4 estimate); 14135 tokens for the whole replay
- Model warm-up (NER): 827 ms

| Stage | p50 ms | p95 ms |
|---|--:|--:|
| observe | 1.55 | 9.80 |
| sanitize | 5.71 | 86.27 |
| vision | 0.00 | 0.00 |
| gate | 0.59 | 2.04 |
| server | 770.11 | 1018.49 |
| total | 775.80 | 1036.92 |

## Caveats

- The server stage includes the tunnel round-trip to the free-tier GPU, so it overstates what a co-located server would add.
- The planner fills one field per step, so many steps see a changed screen; G1 skips here come from the re-observe after each action.
