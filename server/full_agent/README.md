# Bounded full browser-use Agent

This separate launcher uses actual `browser_use.Agent.run`, not the extension's `/step` planner. The initial proof supports explicit allowed URL navigation and native text-field/dropdown filling with no submit. It is not an any-site guarantee.

## Local setup

Use Python 3.12, Node 22, Chrome/Chromium. From repository root:

```powershell
npm ci
py -3.12 -m venv .venv-general
.\.venv-general\Scripts\python.exe -m pip install -r server/requirements-general.txt
.\node_modules\.bin\esbuild.cmd server/full_agent/privacy_bridge.ts --bundle --platform=node --format=esm --external:@huggingface/transformers --outfile=server/full_agent/privacy_bridge.mjs
```

Local `models/bert-small-pii` must contain config/tokenizer files and `onnx/model_quantized.onnx`. Reuse the verified bundled release's models directory, or use the existing model-fetch script in Git Bash. Missing/failed NER stops outbound model calls, never falls back to raw text.

Start the proof site in a second terminal:

```powershell
.\.venv-general\Scripts\python.exe -m http.server 8089 --bind 127.0.0.1 --directory demo
```

Run offline transport proof (not real reasoning):

```powershell
.\.venv-general\Scripts\python.exe demo/test_full_agent_offline.py
```

Run real Gemini, with key entered hidden at the local prompt:

```powershell
.\.venv-general\Scripts\python.exe demo/run_full_agent.py --provider gemini --url http://localhost:8089/agent-proof.html
```

Task: `Go to http://localhost:8089/agent-proof.html and fill full name Ravi Kumar and email ravi@example.com. Do not submit.`

Optional direct Groq adapter:

```powershell
.\.venv-general\Scripts\python.exe demo/run_full_agent.py --provider groq --url http://localhost:8089/agent-proof.html
```

Default Groq model: `openai/gpt-oss-120b`. One minute minimum between calls, no SDK retries. Quotas may still block a large single prompt. Official Free table observed September 30, 2026: 30 RPM / 1K RPD / 8K TPM / 200K TPD, per organization, actual limits can differ. https://console.groq.com/docs/rate-limits . Google's actual project limits must be read in AI Studio: https://ai.google.dev/gemini-api/docs/rate-limits .

## Privacy and scope

- Ouroboros core and local BERT detect/mask task, interactive field observations and every provider-bound text message. Per-run placeholder map stays in a local Node child process.
- All provider calls use `GatedModel`. Image parts rejected. Exact JSON messages leak-gated before adapter invocation. Gate hash/size only in evidence; known-value checks are not a universal PII guarantee.
- BrowserSession intercepts state capture and forces screenshot=False before capture. No vision, auxiliary planning/judge/compaction, cloud sync, telemetry, GIF, conversation exports or external tracing credentials.
- All default tools removed. Only navigate/fill/select/click/scroll/wait/done registered. Exact URL and browser-domain allow-list, stale node/backend identity checks, core action validation and token compatibility before local rehydration.
- Click supports only plain links to an explicitly allowed destination, implemented as navigation, not arbitrary page click handlers. All buttons disabled, including submit. Password/OTP/payment/secret fields and secret tokens disabled. No raw JS tool, files, downloads, uploads, coordinates, key presses, login or CAPTCHA bypass.
- This does not prevent a website's own scripts receiving field values when you fill it. Use synthetic/local data for proof; do not run on real private sites until their purpose, field data and disclosures are explicitly approved.
- Current UI split: persistent extension inspector shows its independent sanitizer; this CLI Agent has its own observation/gate and is not controlled by the old popup RUN button. Do not label the extension's gate as this Agent's gate.

Verified here: actual Agent orchestrates local Chrome URL navigation and two synthetic field fills with an offline deterministic model, four captured provider-bound message sets all masked and gate-passing, no submit. Real provider and Windows execution remain unverified until the local run.

## Popup-controlled attached mode

Copy `.env.example` to local `.env`; fill Cloudflare account ID/token/model and any fallback keys there. Production launcher never asks for keys in chat, sends them to extension, or substitutes an offline model. Provider order defaults to Cloudflare -> Gemini -> Groq, configurable; missing providers are shown as not configured, failed providers show safe error class/status, all invalid outputs stop with an error. Privacy blocks never fallback. Cloudflare uses browser-use ChatOpenAI plus a schema-envelope shim matching Workers AI's documented JSON Mode. Real account/model support remains unverified until local test; model must support JSON Mode. Example model is in official list: https://developers.cloudflare.com/workers-ai/features/json-mode/ . Endpoint: https://developers.cloudflare.com/workers-ai/configuration/open-ai-compatibility/ .

Run `python demo/run_agent_server.py`. It starts visible Chrome once with a separate `.ouro-chrome-profile`, loopback debugging and loopback server on 8000. Load the built extension in that Chrome (one-time). Open a page, type a supported task into popup, RUN. Current tab is bound with a per-run random marker, not URL matching; duplicate URL tabs are not ambiguous. Ordinary Chrome without debugging is not attachable. Existing personal Chrome profile stays untouched.

In this mode the popup RUN uses ONLY `/agent/run`, never old `/step`. Background polls status and retains latest status if popup closes; persistent panel stays bound to target. Exact Agent gate/model/provider status visible, independent preview explicitly remains local inspector. Agent stays attached to same target for all actions; no new browser each run. Browser disconnects after run, stays visible. Current origin, explicit task URL origins and optional `.env` allowed origins are permitted; redirect outside scope stops observation/actions. All buttons still disabled.

The attached-mode SDK global domain watchdog is intentionally not used: it can close unrelated browser tabs/panels. Custom tools enforce scoped origins and pinned target instead. Extension cleanup overridden to preserve user panels. No arbitrary model JS action; fixed local marker/read/write primitives are internal browser control, not model tools.

Offline popup transport proof: `python demo/test_popup_agent_offline.py` starts a DEV-ONLY local service with deterministic model. Open synthetic page, popup task `Fill full name Ravi Kumar and email ravi@example.com on this page. Do not submit.` Expect three steps/two fills, duplicate same-URL tab untouched, gate PASS, Chrome still alive. Stop this dev service before production. It never runs as production fallback. This is not a live-provider proof.
