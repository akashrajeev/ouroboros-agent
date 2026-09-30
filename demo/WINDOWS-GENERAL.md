# General-instruction prototype on Windows

Status: experimental, text-only. The popup sends sanitized observations to a
local Python service, which calls Gemini. Actions are validated and personal
tokens rehydrated inside the extension. Gemini is not an in-browser/on-device
LLM. On-device detectors are separate from the planner. This uses browser-use's
ChatGoogle model adapter, NOT its stock Agent or independent raw-page observer.

Use synthetic/public data only. Detectors can miss private values, and Google's
free-tier inputs may be used to improve products. This is not a general privacy
safety guarantee. No account login, purchase, send, deletion, or CAPTCHA solving.

## Setup (Command Prompt)

Install Python 3.12, then at `C:\Users\Akash\ouroboros-agent`:

```bat
cd /d C:\Users\Akash\ouroboros-agent
git fetch origin
git switch feat/overnight-sih-demo-20260930
git pull --ff-only
py -3.12 -m venv .venv-general
.venv-general\Scripts\python -m pip install -r server\requirements-general.txt
.venv-general\Scripts\python demo\run_general.py
```

The primary Worker endpoint's API shape must be confirmed first. This version
supports an OpenAI-compatible base URL only, appending `/chat/completions`.
It does NOT yet support the Workers AI native `result.response` API.

```bat
set OURO_WORKER_BASE_URL=YOUR_VERIFIED_OPENAI_COMPATIBLE_BASE_URL
set OURO_WORKER_MODEL=YOUR_VERIFIED_MODEL_NAME
```

Do not paste these example labels literally. With Worker details set, rerun the
launcher. It prompts separately for Worker auth and optional Gemini fallback key.
For Gemini-only testing instead:

```bat
set PLANNER=general
.venv-general\Scripts\python demo\run_general.py
```

The runner asks for the Gemini API key with input hidden. Paste it only into
that local terminal prompt, never into chat or a committed file. It keeps the
key in the process environment until exit. No payment or billing setup required
by this code; quota/access still depends on your Google project. If Gemini returns
an error or has no free quota, stop and check your account rather than enabling
billing automatically. Close old services on ports 8000, 8001 and 8089 first.

Load the fixed bundled-NER extension in Chrome. For the latest loop behavior,
rebuild it on this branch, with the model assets present:

```bat
npm install
npm run build --workspace @ouroboros/extension
```

Check that the popup reports models enabled. If using the morning prebuilt
archive, it can call this service too, but it lacks the new ask-user immediate
stop and post-action settle changes. The prebuilt archive is not a new build.

## First task

Open `http://localhost:8089/kyc.html`. Open the extension popup and enter:
`Fill the KYC form from my saved profile. Do not submit.`

Expected outcome is six synthetic fields filled, without submission. This
expectation must still be confirmed against the actual Gemini run. Watch for a
clear stopped/error result instead of assuming success. Terminal pattern-scan
labels cannot prove absence of unknown names.

## Public-site task

Open the target site yourself first. Enter a bounded instruction in the popup,
for example `Search for fort documentary, then open the first video. Do not log in.`

No arbitrary URL navigation operation exists yet. Live YouTube search/playback
is NOT yet verified. Consent screens, changing layout, input events, full-page
navigation, inaccessible frames and autoplay rules can stop the loop. "Video
page opened" and "video is playing" are different results; inspect both.

Ctrl+C stops all three local services. Extension UI is Terminal design A.
Do not merge or publish a release from these instructions.
