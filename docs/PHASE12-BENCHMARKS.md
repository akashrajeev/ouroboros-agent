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

## Phase 12C - Real-page precision attempt (seed 12131)

30 distinct public URLs were attempted from `eval/realpages-precision-30.txt` in headless Chrome with synthetic unsent values. 19 returned 2xx; seven returned 403, one 404, and three no response. Only **five pages** yielded fillable target fields in the first-step viewport. That denominator is the finding: a 30-URL list is not a 30-page precision benchmark. Many sites are JS-delayed, consent-walled, login-gated, or bot-blocked; the harness did not navigate these flows. Earlier Phase 11 cloud-browser IRCTC remains separate and is not silently merged. No bot-wall reattempt is scheduled.

On the five usable pages (Zerodha, Groww, LinkedIn, Shine, Airbnb), nine synthetic field fills were attempted. Eight of nine values remained in their input and had a placeholder on the serialized screen; one Shine mobile field changed or rejected its synthetic value after typing. That row is **not a detector FN** because the asserted value was absent from the observed field. The harness saw zero verbatim values in the serialized map on the eight persistent fields. It saw zero placeholders on *other elements* in these five snapshots, but this is **not FP=0 for real pages**: other content may contain genuine private data, and no manual region-level annotation was done. It also cannot estimate PII missed in page text or true page-level precision/recall. The Phase 11 footer masking counts (six Zerodha, 13 Flipkart) are retained, not overwritten by this narrower probe; that earlier run inspected label + value as well, whereas this new probe only counts `.value` on non-target elements.

Field-scoped ground truth: persistent synthetic value = positive, masked value = TP, unmasked persistent value = FN; rejected/changed value = unscored. The current scored result is **8 TP, 0 FN on five usable page snapshots**, with FP **unmeasured**. No general P/R number should be quoted. To complete C, capture 20-50 *usable* first-step forms via normal UI, annotate all visible PII and benign lookalikes at span/region level before detector scoring, and include failure/blocked pages in the attempted denominator.

Raw attempts and field audit: `eval/results/realpages-precision-12131/results.json`; harness: `eval/src/realpages-precision.ts`. No form was submitted and no paid compute used.

## Phase 12A - Browser resource attempt, not a real-device result

Chrome and Firefox ESR are installed in a **shared 2-vCPU, about 2-GB sandbox**. The extension builds for both. An eight-second process-tree smoke measured process RSS and CPU seconds while opening the built bench HTML as a file. Chrome tree RSS rose from ~1,056 MB at second 1 to ~1,360 MB at second 4 (includes all child processes and double-counts shared mappings); Firefox tree rose to ~164 MB at second 3. These numbers are **not comparable client-resource results**: the Firefox page did not prove it executed extension code, and the Chrome process tree included browser machinery. CPU percent derived from a short launch window would likewise be meaningless. Do not use these as SIH resource metrics. Raw exploratory samples are not committed.

Model artifacts in the built extension are about 39 MB in source form (NER int8 28.7 MB, OCR det 2.4 + rec 7.8 MB, YuNet 0.23 MB), excluding runtime WASM, browser caches and resident RAM. A properly instrumented Chrome/Firefox extension benchmark on Akash's actual desktop remains pending: capture cold/warm model load, per-step CPU delta, private/proportional memory (not summed RSS), GPU availability/provider, inference p50/p95, and browser/version/OS. Phone WebGPU is separate and not inferred from the desktop sandbox.
