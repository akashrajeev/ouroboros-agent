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

## Results so far (2026-09-24, Qwen2.5-VL-7B-Instruct-AWQ on a free Colab T4)

| Run | Pages | Done | Fields exact | Steps | Leaks in request bodies | Server p50 / p95 ms |
|---|--:|--:|--:|--:|--:|--:|
| E1 (prompt v1) | 20 (seed 26171) | 2 | 50/120 | 460 | 0/460 | 634 / 1360 |
| E1b (prompt v2 + loop guard) | 20 (seed 26171) | 20 | 120/120 | 160 | 0/160 | 971 / 1120 |
| E1b held-out values | 20 (seed 90210) | 20 | 120/120 | 160 | 0/160 | 1009 / 1197 |

What changed in v2: a one-shot example (type directly, no click first), "not used yet" placeholders in the legend, and a loop guard that re-asks once when the model repeats its last action or clicks a text field. Server p50 rose because a guarded step costs two model calls.

Contamination: the v2 prompt was tuned by looking at the first 4 pages of seed 26171, so that row is partly contaminated. Seed 90210 has fresh values but the same two templates (KYC, checkout), so it tests new data, not new layouts. Next: unseen layouts (E2+), and gate the submit click behind user confirmation in the extension before real-site use.

### E2 / E3 / E5 from the E1b runs

- E2 (placeholders only): 0 of 320 steps rejected by the validator, 0 ask_user, 0 type/field mismatches (120/120 exact fills on each seed). Every page took the minimum 8 steps (6 types, submit, done). Under prompt v1 the ask_user rate was 12.6% (58/460).
- E3 (cost per step): about 1.2k prompt tokens per step (p50 1197), server p50 971-1009 ms, p95 1120-1197 ms. Tunnel overhead measured separately: /models round trip p50 141 ms, 1-token completion p50 166 ms. So about 0.8 s per step is model time on the T4, including the loop guard's second call where it fires.
- E5 (privacy): 0 raw values in 780 request bodies across E1 and E1b; the leak gate never fired.
- E4 (image) and E6 (adversarial layouts) are still open.
