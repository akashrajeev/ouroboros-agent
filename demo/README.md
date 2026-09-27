# SIH26171 end-to-end demo (hybrid agent loop)

One assisted task, full loop, on a real browser:

```
browser-use (local harness, CDP)
  -> extension content script: observe page (A2)
  -> on-device sanitize + placeholder map (A3-A6)     [real values never leave the page's isolated world]
  -> leak gate (A7)
  -> local server /step: planner (stub or Qwen2.5-VL via tunnel) (B1-B3)
  -> validator (A9) -> rehydrate in page (A10) -> execute fill (A11)
  -> human confirms the consequential submit (A9 confirm gate)
```

The harness (`orchestrator.py`, built on the open-source `browser-use` package) launches
Chromium with the extension, opens a page, starts the task, and records screenshots.
It is generic: any `--url` on localhost and any `--task`. `kyc.html` is the shipped
fixture (a saved-profile card + a KYC form, all synthetic data).

## Verified status (sandbox run, 2026-09-27, rules-only build, stub planner)

- 6 planner steps; every `/step` payload passed the trust proxy's PII re-scan:
  only `<AADHAAR_1> <DOB_1> <EMAIL_1> <PAN_1> <PHONE_1>` on the wire.
- 5/6 form fields filled locally with the real values (email, mobile, Aadhaar, PAN, DOB).
- Run ended `declined`: the submit click correctly required human confirmation (A9) -
  that is the feature, not a failure. `--auto-submit` stands in for the human.
- `full-name` stays empty in a rules-only build (names need the NER model, A3c).

## Run it (laptop)

```bash
npm install && npm run build --workspace @ouroboros/extension   # WXT_DEMO_TRIGGER=1 enables the page-event trigger
WXT_DEMO_TRIGGER=1 npm run build --workspace @ouroboros/extension
pip install -r server/requirements.txt browser-use
python -m playwright install chromium                            # browser-use needs a Chromium that loads extensions
python -m uvicorn app.main:app --port 8001 --app-dir server &    # PLANNER=vlm VLM_BASE_URL=... for the real VLM
python demo/trust_proxy.py 8000 http://127.0.0.1:8001 &          # proof proxy: re-scans every payload, logs verdicts
python -m http.server 8089 --directory demo &
python demo/orchestrator.py --url http://localhost:8089/kyc.html \
  --task "Fill the KYC form from my saved profile. Do not submit." \
  --chrome "$(pwd)/../.cache/ms-playwright/chromium-*/chrome-linux64/chrome" --headed
```

For the VLM planner: `PLANNER=vlm VLM_BASE_URL=<kaggle/colab tunnel>/v1` when starting
uvicorn (see docs/PHASE9.md). The planner may click-focus a field before typing; the
loop executes both steps (click lands focus, type fills after rehydration).

## Notes and honest limits

- **Chrome variant matters.** Branded Google Chrome 154 ignores `--load-extension`
  and (in our sandbox) did not inject content scripts for dev-mode extensions under
  automation. Playwright's Chromium build works. On the laptop, loading the unpacked
  extension by hand (chrome://extensions, developer mode) and pointing browser-use at
  that Chrome via `cdp_url` also works.
- **The page-event trigger is compile-time gated** (`WXT_DEMO_TRIGGER=1`) and runtime
  gated to localhost origins. Production builds without the flag ignore it; the popup
  remains the only trigger. At the finale, arbitrary judge pages are driven from the
  popup - the loop itself is fully generic.
- **IP-literal origins trip the leak gate** (A7 re-scans the whole payload, and
  `url_origin` like `http://127.0.0.1:8089` matches the IP detector). Serve demos on
  `localhost`. Real IP-hosted sites would hit this too - candidate gate refinement.
- **Models path unverified in a real browser** here: with staged models the run stalls
  before the first post (suspected offscreen-document model host in headless
  Chromium). Rules-only build is what the numbers above used. Verify headed on laptop.
