# Ouroboros Agent - Build Phases

Every phase ends with measurable acceptance criteria. CI (typecheck + unit tests for TypeScript and Python) must be green at each boundary.

## Phase 0 - Repo, docs, CI
- Private repo, ARCHITECTURE.md, PHASES.md, npm workspaces, Python server skeleton, GitHub Actions.
- **Accept:** CI green on main; `npm test` and `pytest` both run.

## Phase 1 - Core detectors + placeholders
- A3a DOM rules; A3b pattern + checksum detectors (Verhoeff, Luhn, PAN, IFSC, UPI, mobile, email, GSTIN, passport, vehicle reg, pincode, IP, DOB).
- A6 typed stable placeholders + A6m local map with per-task clear.
- **Accept:** valid/invalid vectors per detector; Verhoeff catches all single-digit and adjacent-transposition errors on sampled numbers; same value -> same token.

## Phase 2 - Extension skeleton + observe
- WXT extension for Chrome MV3 and Firefox; A2 observe (DOM walk, accessible names, client-rect boxes, opaque regions); A8 egress in background only.
- **Accept:** Chrome and Firefox builds succeed in CI; observe tests on DOM fixtures; content script bundle contains no fetch/XHR.

## Phase 3 - Server + stub planner + round trip
- FastAPI `/step` with Pydantic schemas mirroring core types; deterministic stub planner.
- A9 validator, A10 rehydrate, A11 execute.
- **Accept:** pytest for schema + stub; end-to-end test: mock form -> sanitized payload -> stub -> validated action -> rehydrated fill, with no real value in any payload.

## Phase 4 - Leak gate
- A7 checks 1, 2 and 4 (exact/normalized match, regex re-scan, canaries). Check 3 (re-OCR) lands in Phase 6.
- **Accept:** adversarial tests (spaced, dashed, case-changed values, values in JSON keys) all BLOCK; clean payloads PASS; SHA-256 audit entry per send.

## Phase 5 - Eval harness + synthetic pages
- Faker en_IN page generator (forms, profiles, bank, KYC, tables) with ground truth (values, types) and canaries.
- M2 per-type P/R and leak-count scripts.
- **Accept:** >= 50 generated pages; one command produces the per-type P/R table; first numbers committed to eval/results/.

## Phase 6 - NER + OCR + faces
- A3c gravitee BERT PII via Transformers.js; A3d PaddleOCR v3 + YuNet on opaque regions; image masking; A4 fusion; leak-gate re-OCR.
- **Accept:** ablation table rules / +regex / +NER / +vision; client model download size measured; re-OCR catches a planted unmasked value.

## Phase 7 - Screen map + gating
- A5 screen map, A1 change gate, G1-G7 caches and cascade.
- **Accept:** screen-map recall vs ground truth (M1 proxy); % steps skipped on a replayed session; cache hit rates.

## Phase 8 - Metrics instrumentation + dashboard
- A12 logger (IndexedDB -> CSV), per-stage p50/p95, bytes and tokens sent.
- **Accept:** one CSV per run covering M1-M5; dashboard renders it.

## Phase 9 - Real VLM + experiments (needs compute approval)
- Qwen2.5-VL-7B on vLLM only after compute is approved; until then stub results are labelled as stub.
- Five metric experiments + ablations.
- **Accept:** final results table in eval/results/ with methodology notes.

---
## Progress log
- Phase 0-3: done (repo, docs, CI; core detectors, placeholders, leak gate; WXT extension + observe/execute; FastAPI + stub planner; device-loop E2E test).
- Phase 5 (pulled ahead of Phase 4 wrap-up, since the gate's checks 1, 2 and 4 already shipped in core): eval harness done. `npm run metrics --workspace eval` writes eval/results/baseline-rules.{md,json}.

## Status log

- **Phase 6 (Node-side done, 2026-09-24):** client model download measured at 39.2 MB (BERT int8 28.7, PaddleOCR det 2.4 + rec 7.8, YuNet 0.23). Ablations: `eval/results/ablation-*.md` (text) and `eval/results/vision-cards-*.md` (images). Re-OCR in the gate blocked 7/7 degraded cards where a value survived masking. Not yet done: running NER/OCR/YuNet inside the extension (onnxruntime-web in the Chrome offscreen document / Firefox background page) - the loop takes an injected `visual()` stage today.
- **Phase 7 (2026-09-24):** G1 DOM observation key + LRU; A1/G2 dHash tile diff (unit-tested); G7 scroll/wait handled on device; popup confirm for consequential clicks (60 s silence = decline). Screen map: 100% recall and label accuracy on tuning + adversarial-778 pages, G1 skip at the replay ceiling (`eval/results/screenmap.md`). In-browser model host: onnxruntime-web (asyncify/WebGPU build, shared with Transformers.js) in the Chrome offscreen document and the Firefox background page; `scripts/stage-models.sh` bundles models into the build. Build size with models: 67.5 MB unpacked, 36.3 MB zipped (models 39 MB, ORT WASM 26.9 MB, JS ~1 MB). Not yet verified by loading the built extension in a real browser. Open: G4 image cache keyed by opaque-region pixel hash.
- **Phase 8 (2026-09-24):** A12 `StepRecord` (M1-M5 columns, no values/labels/URLs beyond origin), IndexedDB store, popup CSV export, extension dashboard page (store or loaded CSV). `npm run replay --workspace eval` drives the device loop against the real FastAPI stub server: `eval/results/metrics-sample.{csv,md}`. Found and fixed: the task text was tokenized with rules only, so names/addresses/DOBs the user typed never became placeholders; NER now runs on the task too (fill rate 97/150 -> 120/120).
- **Post-Phase 8 (unpaid, 2026-09-24):** G4 region cache keyed by exact pixel hash (8/10 hits, 80% vision time saved on a 10-step replay); `eval/results/bench-vision.md` (onnxruntime-node CPU p50 870 ms vs onnxruntime-web WASM 1 thread 2185 ms per card on the sandbox CPU; WebGPU needs the extension `bench.html` page on a real machine); NER source is a build option (`WXT_NER_SOURCE=bundled|download|off` + `scripts/stage-models.sh --ner=...`): download mode fetches pinned Hugging Face files once, checks SHA-256, keeps them in Cache Storage (zip 36.3 MB bundled vs 16.6 MB download).
- **Phase 9 prep (2026-09-24):** free-T4 plan in `docs/PHASE9.md`; `VlmPlanner` (OpenAI-compatible, fail-safe to `ask_user`, 4 tests); Colab/Kaggle notebook serving Qwen2.5-VL-7B-AWQ via vLLM + Cloudflare quick tunnel; `scripts/phase9-run.sh`. Waiting on a GPU session.
