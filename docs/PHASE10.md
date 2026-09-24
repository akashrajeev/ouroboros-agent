# Phase 10 - Hardening (fresh seeds only)

Three failures were left open at the end of Phase 9. Each fix is measured on seeds created after the fix was written.

## 1. Invented placeholders and typing into text

Symptom (E4b): the planner typed `<PAN_1>` (not in the legend) into a text element. The validator caught it every time, but the task failed.
Fix (server guard, `server/app/vlm.py`): before returning, the planner checks its own reply. If the reply uses a placeholder that isn't in the legend, or types/selects into an element that isn't an input, the model is re-asked once with a one-line reason. The server only ever sees placeholders, so this check needs no real values.

E4 on fresh seed 8888 (`eval/results/phase9-e4-8888.md`):

| Arm | Right option | Clean finish | Rejected by validator | Bodies with a card value |
|---|--:|--:|--:|--:|
| text only | 5/12 (guessing) | 12/12 | **0** (was 8/12 on 7777) | 0/36 |
| masked image | **10/12** | 11/12 | **0** (was 1/12) | 0/34 |

The one image run that didn't finish was blocked by the leak gate: re-OCR still read an Aadhaar number on a degraded card, so nothing was sent. That is fix 3's target.

## 2. Display-only pages (profile, bank statement)

Symptom (E6b): "Fill this form" on pages without inputs. The model typed into text, the executor stopped the run (fails safe), and the task failed. 0/10.
Fix: one prompt rule: no fillable inputs -> done, "nothing to fill". The guard from fix 1 also stops typing into text.

Unseen layouts, fresh seed 24680 (`eval/results/phase10-unseen-24680.md`): **20/20 done**. Profile 5/5, bank 5/5, label-variant forms 5/5 (25/25 fields), Hindi-label forms 5/5 (15/15). Leak-gate blocks: 0.

The independent leak check flagged 1 of 65 bodies. I looked at the context: the "value" was a 3-digit CVV `313` matching the layout number `0.313` inside a `bbox` array. That is a checker false positive, not a leak. The checker now ignores bbox arrays (layout numbers, not page content). A second fresh seed (13579) is being run with the corrected checker.

## 3. Degraded-card OCR misreads

Symptom: on blurred or rotated cards, the first OCR pass misreads a digit, so no pattern matches and the value isn't masked. The re-OCR gate then blocks the step (safe, but the task fails).
Fix (`packages/vision/src/screen.ts`): second pass. OCR the masked image again, run the same detectors, mask any new finds, then re-OCR once more for the gate. It is cached with the region, so it only costs on new pixels.

Fresh degraded seed 9202 (60 cards):

| | Values readable after masking | Gate passed while readable | Decoys readable (120 before) | Masking p50 (Node CPU) |
|---|--:|--:|--:|--:|
| one pass | 3/300 (284 readable before) | 0 | 118 | 362 ms |
| two passes | **1/300** | 0 | 117 | 599 ms |

Cost: about +240 ms per image, and only on steps where the planner asked for the image.
