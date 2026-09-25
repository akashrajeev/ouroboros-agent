# Phase 12B - Visual robustness, first controlled block

25 seeded synthetic card identities x four paired capture conditions = 100 image-dependent document-type selections. Seed per card 12091 + card index (0-24); every card appears once in each condition. The choices are the three card-header classes. The scored selector uses OCR of the **masked image** and returns a choice only when exactly one header is recognized. This is a deterministic perception proxy, **not a VLM planner run**, nor 100 independent page layouts. A wrong or unreadable header counts as failure; no submission occurs.

| Condition | Header correct | Values OCR-readable before | Values OCR-readable after | Gate blocks | Vision p50 ms |
|---|---:|---:|---:|---:|---:|
| clean | 25/25 | 124/125 | 0/125 | 0/25 | 435.5 |
| jpeg | 25/25 | 123/125 | 0/125 | 0/25 | 373.2 |
| blur | 25/25 | 123/125 | 0/125 | 0/25 | 363.9 |
| lowres | 25/25 | 123/125 | 0/125 | 1/25 | 382.3 |

Total: 100/100 header choices correct, 493/500 values readable before masking, 0/500 afterward by the same OCR reader. One low-resolution card (index 39, seed 12100) was blocked by the independent gate despite no ground-truth value readable afterward. The gate can over-block; this row is a false-positive or a value/pattern beyond the five instrumented fields, not counted as a privacy leak. The header remained readable and the selector was correct on that row, but a full agent visual step would be stopped, so deliverable success is **99/100 at most** under the gate.

Failure categories under this fixed data: wrong header 0; unreadable header 0; ambiguous header 0; exact-value OCR residue 0; gate false/block 1. No claim of zero residual pixel readability to a human or stronger OCR.

JPEG q35, Gaussian blur sigma 1.65, and 0.5x downscale followed by nearest-neighbor upscale are separate conditions, not compounded. The cards are generated with five fonts, five backgrounds, three headers and one reused face image. Same OCR scores before and after, so this is an OCR-specific lower bound for leakage. The text in the card header is intentionally preserved; the five personal fields are masked. Images were never sent to a remote planner. Shared 2-vCPU sandbox only; model load excluded from vision timings.

Reproduce: `START=0 COUNT=100 npx tsx eval/src/visual-robustness.ts`; raw rows in `eval/results/visual-robustness-12091/rows.jsonl`. For chunks, run disjoint START/COUNT ranges, never append a duplicate index. This controlled set should be followed by unseen document layouts, actual captured/consented photos, and a live VLM 100-task run when its free endpoint is restored.
