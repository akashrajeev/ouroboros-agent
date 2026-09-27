# Phase 14 - Hybrid end-to-end agent-loop demo (SIH26171 centerpiece)

Date: 2026-09-27. Status: **verified rules-only (stub planner) in headless Chromium; VLM + on-device models run pending on laptop.**

The demo wires the whole trust-boundary architecture into one assisted task, driven
by the open-source `browser-use` package as the local agent harness (hybrid design
chosen by the owner on 2026-09-27):

```
browser-use (local, CDP) -> extension: observe (A2) -> sanitize (A3-A6) -> leak gate (A7)
-> server /step (planner) -> validate (A9) -> rehydrate (A10) -> execute (A11)
-> human confirms consequential submit (A9 confirm gate)
```

## What was measured (sandbox, 2026-09-27 ~23:48 IST)

- Fixture: `demo/kyc.html` (synthetic saved-profile card + KYC form).
- Driver: `demo/orchestrator.py --url ... --task "Fill the KYC form from my saved profile. Do not submit."`
- Result: 6 planner steps; **every /step payload passed an independent PII re-scan**
  (`demo/trust_proxy.py`): only `<AADHAAR_1> <DOB_1> <EMAIL_1> <PAN_1> <PHONE_1>` crossed
  the boundary. 5/6 form fields filled with the real values locally (email, mobile,
  Aadhaar, PAN, DOB). Run ended `declined`: the submit click required human
  confirmation (by design; `--auto-submit` stands in for the human).
- `full-name` is only fillable with the NER model (A3c) - empty in rules-only builds.

## New code

- `demo/kyc.html`, `demo/orchestrator.py` (generic: any localhost URL + any task),
  `demo/trust_proxy.py` (payload proof logger), `demo/README.md` (runbook).
- `extension/entrypoints/content.ts`: demo run trigger - page-dispatched
  `ouro:run` CustomEvent, **compile-time gated** (`WXT_DEMO_TRIGGER=1`, default off)
  and **runtime gated to localhost origins**; mirrors status into
  `<html data-ouro-status>` for drivers. Popup remains the only trigger elsewhere.
- `server/app/planner.py`: StubPlanner falls back to legend tokens when the task
  names none (mirrors how the VLM planner matches legend tokens to fields).

## Findings fed back into the project

1. Branded Google Chrome 154 ignores `--load-extension` ("not allowed in Google
   Chrome") and did not inject content scripts for dev-mode extensions under
   automation. Playwright's Chromium works; or load unpacked by hand and attach
   browser-use via `cdp_url`.
2. The leak gate blocks payloads whose `url_origin` is an IP literal (the IP
   detector matches `127.0.0.1`). IP-hosted sites would always block - candidate
   refinement: exclude the origin field from the gate's pattern re-scan.
3. With staged on-device models the run stalls before the first post in headless
   Chromium (suspected offscreen-document model host). Consistent with the earlier
   "not yet verified in a real browser" caveat - verify headed on the laptop.

## Open for finale

- Run with `PLANNER=vlm` (Qwen2.5-VL tunnel) and with staged models (NER covers
  names; OCR/faces cover opaque regions).
- The planner may click-focus a field before typing (planner track finding); the
  loop executes both steps, so staged click-then-type sequences are supported.
- Arbitrary judge-provided pages/tasks are driven from the popup; the loop is
  page- and task-generic.
