# Firefox status (2026-09-27)

The PS names Chrome AND Firefox. Current honest status: **the extension builds for and installs in Firefox; the interactive task loop is verified in Chromium-based tests only.**

## Verified 2026-09-27 (Firefox 140.16.0esr, linux x86_64)

- `wxt build -b firefox` produces a Firefox MV2 build (`firefox-mv2`): manifest, background page, content script, popup.
- `web-ext lint` on the built bundle: **0 errors**, 6 warnings - all `eval`/`Function`-constructor patterns inside the bundled onnxruntime-web WASM runtime, not Ouroboros code.
- `web-ext run` installs the build as a temporary add-on in real Firefox 140 ESR (headless) with a clean startup: no manifest, CSP, or background-script errors.
- The full TypeScript suite (143 tests incl. the device loop over a stub planner) passes; observe/sanitize/execute are DOM code shared by both browsers.

## Firefox-specific design (already in the tree)

- `wxt.config.ts` emits the gecko ID and a string-form CSP with `'wasm-unsafe-eval'` (onnxruntime-web compiles WASM in extension pages); the Chrome-only `offscreen` permission is excluded on Firefox.
- `background.ts` runs the model host **in-process** on Firefox (`import.meta.env.FIREFOX`) instead of a Chrome offscreen document.
- `browserHost.ts` uses `OffscreenCanvas` + `createImageBitmap`, both supported in current Firefox.

## Not yet verified (needs a real Firefox session)

1. Interactive load via `about:debugging` -> This Firefox -> Load Temporary Add-on (or `web-ext run` on Akash's laptop).
2. The masking demo flow on a real form page in Firefox (rules-only mode works without staged models).
3. `tabs.captureVisibleTab` behavior under `activeTab` on Firefox during `need_visual`.
4. onnxruntime-web WASM compile under the Firefox CSP with staged models (rules-only mode skips this).

Steps 1-4 are folded into the pending on-laptop session alongside the Phase 12A device benchmark.
