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

### Kaggle as primary host (2026-09-24)

Kaggle (GPU T4 x2, internet on, account akashrajeevkv) now serves the same model via notebooks/phase9_vlm_kaggle.ipynb; Colab stays as backup. vLLM was ready in 240 s. The seed-90210 replay reproduced on Kaggle: 20/20 done, 120/120 fields, 0/160 leaks, server p50/p95 974/1195 ms. The notebook's smoke test now waits for the new tunnel hostname to resolve (first Kaggle run failed that cell on DNS; the endpoint itself was fine).

### E6: unseen layouts (seed 31337, never used for tuning), Kaggle

`OURO_PAGES=unseen`: profile and bank templates (never in the replay before) plus adversarial label-variant ("Applicant", "Cell", "Aadhar No.") and Hindi-label forms.

| Template | Done | Exact fields | What happened |
|---|--:|--:|---|
| hindi-labels | 5/5 | 15/15 | clean |
| label-variants | 0/5 | 10/25 | validator rejected a placeholder as `token_type_mismatch` on a synonym label, which ends the run |
| profile | 0/5 | n/a | leak gate blocked step 1: a NAME from the task appeared verbatim in the screen map (`map_exact NAME`) |
| bank | 0/5 | n/a | same gate block |

Totals: done 5/20, exact fields 25/40, 0/35 request bodies with a real value, 10 gate blocks, server p50/p95 770/1018 ms.

Reading: privacy held; both failures fail closed (nothing leaked, the run stops). The gaps are on the device side, not the model: (1) a value the task supplies can still appear raw in page text that the detectors miss, and the gate catches it; (2) the validator's field typing doesn't know label synonyms. Any fix for these will be re-measured on a fresh seed and the 31337 numbers above stay as the honest first-contact result.

### E6b: after device-side fixes, on a fresh seed (8675309)

Fixes, all found on the E6 seeds (31337, 4242), so those seeds are now contaminated and the fresh seed is the honest number:
1. NER tagged the label word with the value ("UPI diptendu") as a NAME; after merging, the bare word "UPI" was mapped as a NAME, so the gate saw that "name" in every "UPI ID" label and blocked. NAME spans now drop field words at their edges (UPI, PAN, OTP, ID, ...). This was a gate false positive, not a leak.
2. "Permanent Account Number" (PAN's full name) was typed as a bank ACCOUNT field, so the validator rejected `<PAN_1>` there. Added to the PAN rule.
3. A value the device already mapped is now replaced wherever it appears on screen, even where no detector fires (A6b).
4. The replay's independent leak check now needs a boundary for exact matches, as the gate does. Without it, a 3-digit CVV counted as leaked because the same digits sat inside an unrelated ticket number. Earlier runs had 0 hits either way.

| Template | Done | Exact fields |
|---|--:|--:|
| label-variants | 5/5 | 25/25 |
| hindi-labels | 5/5 | 15/15 |
| profile (read-only page) | 0/5 | n/a |
| bank (read-only table) | 0/5 | n/a |

Totals: 0/60 request bodies with a real value, 0 gate blocks, 40/40 fields, server p50/p95 803/961 ms.

Profile and bank pages have no inputs; they show every value as text. So they are a strong privacy test (all values on screen, none reached the model), but "fill this form" is the wrong task for them. The model tried to type into text and the executor stopped the run (`not_editable`), which fails safe. The right behavior is done or ask_user; that is a planner-prompt gap left open on purpose, since fixing it by reading these pages would contaminate them too.

### E4: does the masked image help? (Kaggle, 7B)

Setup (`eval/src/visual.ts`): each page has an uploaded ID-card image and a "Document type" select with 3 options. The right option depends only on the card header, which exists only in the pixels. Half the cards are degraded (rotation, blur, downscale, JPEG). Arm A: text only. Arm B: when the planner asks need_visual, the device sends the card JPEG with PII blacked out and faces pixelated, and gates the re-OCR text.

First run (seed 4444): 0/12 in both arms. The planner never asked for the image because the wire format dropped images and select options entirely. It could not know an image existed. Product fixes:
1. Images and canvases now go on the wire as `image` elements: kind, sanitized alt text and box only. The src URL is never sent, since URLs can carry PII.
2. Select options go on the wire, sanitized like labels.
3. The validator now treats "click" with an exact option text on a combobox as select, because the 7B model does this constantly.
4. Prompt rules: use need_visual first when a choice depends on an image; never click an image.
These were tuned on seed 4444, which is now contaminated. Fresh seed 5151 (`eval/results/phase9-e4-5151.md`):

| Arm | Right option | Clean finish (done) | Bodies with a card value | Image p50 | Device vision p50 | Round-trip p50 / p95 |
|---|--:|--:|--:|--:|--:|--:|
| text only | 6/12 (chance 4/12; it guesses) | 12/12 | 0/36 | - | - | 785 / 1651 ms |
| masked image on need_visual | **10/12** | 3/12 | 0/62 | 19 KB | 803 ms | 842 / 1685 ms |

What this shows:
- The image helps: 10/12 vs 6/12, and the text-only arm is right only by guessing. Masking leaves the non-PII header readable.
- Ending the task is bad with the image arm: 3/12. After choosing correctly, the model kept going. In 5 runs it typed `<PAN_1>`, a placeholder that doesn't exist, into a text element; the validator rejected it (`unknown_token`). 3 runs hit the step limit. None of this was unsafe, but it is a task failure. It is the next planner-prompt fix, and it needs a new fresh seed.
- The leak gate caught 1 of 12 image steps: on a degraded card, re-OCR could still read an Aadhaar number after masking, so the gate blocked the step before sending. That is the backstop doing its job. It also means pixel masking alone missed 1 of 12 on degraded cards.
- A visual check of the masked sample shows the mask box starts about one character late: the first character of Aadhaar, PAN and mobile is still visible. Open fix: widen the left pad in `spanBox`.
- Request bodies are about 2x bigger than they need to be, because the element list is sent twice (`elements` and `screen_map`). Open fix.

### Vision follow-ups found through E4 (CPU only, no GPU)

- Span masks now reach one average character past each side of the span. Before, proportional fonts left the first character showing. On seeds 9001/9002: masked area +0.6 pp, no decoy loss, whole-value reads unchanged.
- New OCR "Label: value" rule: a line like `Name: X`, `Father's Name: X`, `DOB: X` or `Aadhaar: X` masks X because of the label, the way DOM rules treat inputs. It closes the one clean-card NAME the NER missed on seed 9001, which previously got past the gate too (names have no regex).

| Seed | Cards | Values readable after masking | Passed the gate while a value was readable | Decoys readable before -> after |
|---|---|--:|--:|--:|
| 9001 (dev, clean) | 60 | 1 -> **0** | 1 -> **0** | 117 -> 117 |
| 9002 (dev, degraded) | 60 | 7 -> 5 | 0 -> 0 | 118 -> 117 |
| 9101 (fresh, clean) | 60 | **0**/298 | **0** | 120 -> 120 |
| 9102 (fresh, degraded) | 60 | 5/279 | **0** | 119 -> 115 |

On degraded cards, the values still readable after masking are digits the first OCR pass misread, so no pattern matched them. Every such card was blocked by the re-OCR leak gate; none was sent.

### E4b: after the finish fix, fresh seed 7777 (Kaggle, 7B)

Changes since E4 (e371aa9, 69e09c2): the prompt says to reply done as soon as the request is met and never to use a placeholder that isn't in the legend; element lists go on the wire once instead of twice; the span-mask padding; the OCR label:value rule.

| Arm | Right option | Clean finish (done) | Bodies with a card value | Image p50 | Device vision p50 | Round-trip p50 / p95 |
|---|--:|--:|--:|--:|--:|--:|
| text only | 6/12 (guessing; chance 4/12) | 4/12 | 0/42 | - | - | 735 / 870 ms |
| masked image on need_visual | **10/12** | **10/12** (was 3/12) | 0/41 | 20 KB | 879 ms | 755 / 1694 ms |

- Image arm: 10/12 right, same as seed 5151. Clean finishes rose from 3/12 to 10/12. The two wrong answers were both "ACCOUNT HOLDER" cards read as a different type.
- The invented `<PAN_1>` is still the main failure. It happened 8 times in the text arm and once in the image arm, always typed into a text element. The validator rejected every one (`unknown_token`), so nothing unsafe happened.
- 0 of 83 requests carried a card value. No gate blocks happened this run.
