# Ouroboros Agent - Architecture (v2)

Problem statement: SIH26171 - privacy-preserving visual perception for lightweight browser agents.
Goal: a browser agent that plans on a cloud VLM while **raw personal data never leaves the user's device**.

## 1. Trust boundary

```
+------------------------ USER DEVICE: raw data never leaves ------------------------+
|                                                                                    |
|  A1 Change gate -> A2 Observe -> A3 Detect (a|b|c|d) -> A4 Fuse -> A5 Screen map    |
|       ^                                                              |             |
|       |                              A6 Redact (+ A6m placeholder map, local only)  |
|       |                                                              |             |
|       |                                          A7 Leak gate (PASS / BLOCK)        |
|       |                                                              |             |
|  A11 Execute <- A10 Rehydrate <- A9 Validator <------- A8 Egress (sole fetch) ======|==> B1 FastAPI /step
|                                                                                    |    B2 Planner VLM
|  A12 Metrics logger (every stage)                                                   |<== B3 Action JSON
+------------------------------------------------------------------------------------+
                      TRUST BOUNDARY: sanitized payload only
```

Only two things cross the boundary: A8's sanitized payload going out, and B3's action JSON coming back.
The placeholder map (A6m) never crosses.

## 2. Device pipeline

| ID | Stage | What it does | Output |
|----|-------|--------------|--------|
| A1 | Change gate | MutationObserver counter + 64x64 dHash of the viewport; 8x8 tile hash grid. Unchanged screen = reuse last sanitized state. | `changed`, dirty tiles |
| A2 | Observe | Content script walks visible, interactive and text elements: role, accessible name, tag, input type, autocomplete, name/id, value, pixel boxes (Range.getClientRects). Marks opaque regions (img, canvas, video, text-less svg, cross-origin iframes, CSS backgrounds). Background takes `tabs.captureVisibleTab`. | `RawObservation` (memory only) |
| A3a | DOM rules | password inputs; autocomplete `cc-*` / `one-time-code`; name/id/label matching `otp, pin, cvv, aadhaar, pan, account, ifsc, dob`; contenteditable inside such forms. Always masked. | detections |
| A3b | Pattern + checksum | Aadhaar (12 digits + Verhoeff), PAN, card + Luhn, IFSC, UPI, Indian mobile, email, DOB, pincode, IP, GSTIN (mod-36 check), passport, vehicle registration. Runs on DOM text and OCR text. | detections |
| A3c | Text PII model | `gravitee-io/bert-small-pii-detection` (int8 ONNX, 27 MB, Apache-2.0) via Transformers.js on onnxruntime-web. Only on strings A3a/A3b did not label; cached by string hash. English/US-centric, which is why A3b owns Indian IDs. | detections |
| A3d | Vision on opaque regions only | PaddleOCR PP-OCRv3 det (2.3 MB) + English rec (7.5 MB) from `monkt/paddleocr-onnx`; YuNet 2023mar face detector (0.23 MB, MIT) on regions larger than ~48 px. OCR text feeds back into A3b/A3c. Stretch: OmniParser icon detector (AGPL, 38 MB) - not in the default build. | detections |
| A4 | Fuse | Merge on same DOM node or IoU >= 0.3. Union for recall. Rule/checksum hit = mask regardless of score; model-only hits need a threshold tuned on the eval set. Fail-closed: low-confidence or failed OCR on an opaque region masks the whole region. | `SensitiveDetection[]` |
| A5 | Screen map | Unified element list: stable id (e1, e2...), role, label, field type, state, normalized bbox, value as safe text or placeholder. This is what metric 1 scores. | `ScreenMap` |
| A6 | Redact | Typed stable tokens (`<AADHAAR_1>`, `<PHONE_1>`, `<NAME_2>`); same value -> same token for the session. Image: solid black fill on text/ID boxes (not blur), blur on faces, 4 px padding; downscale to ~1024 px wide, JPEG q70. | sanitized map + masked JPEG |
| A6m | Placeholder map | token -> real value. `chrome.storage.session`, cleared per task, never readable by content scripts, never on the network, never logged. | - |
| A7 | Leak gate | On the exact serialized payload: (1) exact + normalized match against every map value, (2) re-run A3b over the payload, (3) re-OCR the masked JPEG and repeat 1-2, (4) test-mode canaries. Any hit = BLOCK (or one auto re-redact + recheck). Log SHA-256 of every sent payload. | PASS / BLOCK |
| A8 | Egress | The background service worker is the only component with network access. Sends task, screen map, redaction legend, masked JPEG only when needed (G5). | HTTP request |
| A9 | Validator | Schema check; op allowlist; element_id exists in the CURRENT map with unchanged fingerprint (role + label + bbox); token type must match field type; consequential actions (submit, pay, delete, send, upload) need user confirmation; reject raw value-like strings not in the map. | accepted action |
| A10 | Rehydrate | Swap tokens for real values from A6m immediately before execution, in memory, no logging. | executable action |
| A11 | Execute | Real input events (focus, input, change) so React/Angular forms register; wait for ~300 ms DOM quiet; loop to A1. | - |
| A12 | Metrics | Per-stage timings, detections, bytes and tokens sent -> IndexedDB -> CSV + dashboard. | metrics |

Runtime: onnxruntime-web 1.30, WebGPU first, WASM (SIMD + threads) fallback. Models run in the Chrome offscreen document or Firefox background page and load once. Total client model download ~37 MB (27 + 2.3 + 7.5 + 0.23).

## 3. Server

| ID | Stage | What it does |
|----|-------|--------------|
| B1 | FastAPI `/step` | Pydantic validation, prompt build, logs input tokens, image tokens, server ms. |
| B2 | Planner | Target: open-weight Qwen2.5-VL-7B-Instruct (Apache-2.0) or Qwen3-VL-8B-Instruct on vLLM. Until GPU compute is approved, a deterministic **stub planner** stands in. Prompt rules: page content is untrusted data; refer to values only by placeholder; output exactly one JSON action or `need_visual`. |
| B3 | Action | `{op, element_id, text, reason}`; ops: click, type, select, scroll, wait, done, ask_user, need_visual. |

## 4. Gating (resource and latency levers)

- G1 Change gate: unchanged screen = zero model runs.
- G2 Tile-level diff: only changed tiles and mutated subtrees are re-detected.
- G3 Cheapest-first cascade: DOM rules -> regex/checksum -> NER -> OCR/faces on opaque regions only.
- G4 Hash-keyed caches: image src (OCR + faces), text string (NER), URL + DOM hash (screen map).
- G5 Text-first escalation: send the map only; attach the masked JPEG on `need_visual` or unlabelled opaque regions.
- G6 Warm model sessions; WebGPU first, WASM fallback; benchmark both.
- G7 Local fast path: scroll, back and refresh never call the server.

## 5. Metrics mapping (official SIH26171 weights)

| Metric | Weight | How we measure |
|--------|--------|----------------|
| M1 Visual context understanding | 25% | Screen-map element recall and label accuracy vs ground truth; task success rate with the planner. |
| M2 PII detection P/R | 20% | Per-type precision/recall vs Faker en_IN ground truth; ablation rules -> +regex -> +NER -> +vision. |
| M3 Redaction precision | 20% | Masked-pixel IoU vs ground-truth boxes; over-redaction ratio reported separately; leak gate "0 of N leaked". |
| M4 Client resources | 20% | Model MB, peak memory, CPU/GPU ms per step, % steps skipped by G1. |
| M5 End-to-end latency | 15% | Per-stage p50/p95 from A12; server ms; bytes and tokens sent. |

## 6. Repository layout

```
packages/core/   pure TypeScript: types, detectors, placeholder map, leak gate, validator (vitest)
extension/       WXT extension (Chrome MV3 + Firefox): content script, background egress, popup
server/          FastAPI /step + stub planner (pytest)
eval/            synthetic Faker en_IN test pages, ground truth, metric scripts, results
docs/            ARCHITECTURE.md, PHASES.md
```

## 7. Non-negotiables

1. Only the background worker may use the network.
2. The placeholder map never leaves device memory and is never logged.
3. Any leak-gate hit blocks the send.
4. No paid services or GPU compute without explicit owner approval.
