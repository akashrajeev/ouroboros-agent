# Phase 9 - Real VLM on free T4 compute

Decision (Akash, 2026-09-24): free Colab/Kaggle T4 notebooks only. No paid GPU or API.

## Setup

| Piece | What | Where |
|---|---|---|
| Model | `Qwen/Qwen2.5-VL-7B-Instruct-AWQ` (Apache-2.0, 4-bit, 6.9 GB); fallback `Qwen/Qwen2.5-VL-3B-Instruct` (research licence, 7.5 GB fp16) | T4 16 GB, vLLM `--dtype half` (T4 has no bf16) |
| Serving | vLLM OpenAI-compatible API + API key, Cloudflare quick tunnel (free, no account) | `notebooks/phase9_vlm_t4.ipynb` |
| Planner | `server/app/vlm.py` `VlmPlanner` (`PLANNER=vlm`); invalid JSON, timeout or network error -> `ask_user`, never a guessed action | our FastAPI server |
| Runner | `scripts/phase9-run.sh` -> end-to-end replay -> `eval/results/phase9-<model>.md/.csv` | laptop / CI box |

The GPU only receives the sanitized request: placeholders and types, element ids, history, and (on `need_visual`) a JPEG masked on the device. The replay's independent body check (no real value in any request) still applies.

## Experiments (each fits one free session, ~1-2 h)

| # | Question | Measure | Accept |
|---|---|---|---|
| E1 | Does a real planner finish the tasks? | Task success and field fill rate on the 20-page replay: stub vs 3B vs 7B-AWQ | 7B-AWQ >= 90% of stub fill rate |
| E2 | Can the planner work with placeholders only? | Invalid actions rejected by A9 validator, `ask_user` rate, type/field mismatches | < 5% steps rejected |
| E3 | Cost per step (M4/M5) | Prompt/completion tokens, planner ms, total step ms p50/p95 | report; tunnel overhead measured separately with an empty prompt |
| E4 | Does the image help? (G5) | Pages with an ID-card image: text-only vs masked JPEG on `need_visual` | report success delta and image bytes |
| E5 | Privacy under a real model | Independent check: 0 raw values in any request; leak-gate blocks | 0 leaks |
| E6 | Held-out robustness | Adversarial seed pages (never tuned on) | report |

## Free-tier limits

- Colab: T4 availability is not guaranteed; sessions end after a few hours or when idle. Kaggle: 30 GPU h/week, 2x T4, 12 h sessions.
- Numbers from a tunnel include internet round-trip; report planner ms (server-side) next to end-to-end ms.
