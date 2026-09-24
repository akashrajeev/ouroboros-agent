# Eval: rules + patterns baseline (no models)

50 synthetic Faker en_IN pages (seed 26171, generated with `npm run metrics --workspace eval -- 50`; templates: kyc, profile, bank, checkout, narrative). A detection counts only if both the value and the type match.

## PII detection (M2)

| Type | Support | TP | FP | FN | Precision % | Recall % | F1 % |
|------|--------:|---:|---:|---:|------------:|---------:|-----:|
| AADHAAR | 30 | 30 | 0 | 0 | 100.0 | 100.0 | 100.0 |
| ACCOUNT | 20 | 19 | 0 | 1 | 100.0 | 95.0 | 97.4 |
| CARD | 0 | 0 | 1 | 0 | 0.0 | 100.0 | 0.0 |
| DOB | 10 | 10 | 0 | 0 | 100.0 | 100.0 | 100.0 |
| EMAIL | 20 | 20 | 0 | 0 | 100.0 | 100.0 | 100.0 |
| IFSC | 20 | 20 | 0 | 0 | 100.0 | 100.0 | 100.0 |
| NAME | 50 | 0 | 0 | 50 | 100.0 | 0.0 | 0.0 |
| PAN | 10 | 10 | 0 | 0 | 100.0 | 100.0 | 100.0 |
| PHONE | 40 | 40 | 0 | 0 | 100.0 | 100.0 | 100.0 |

- **Micro, all types:** P 99.3%, R 74.5%, F1 85.1%
- **Micro, structured types (without NAME/ADDRESS):** P 99.3%, R 99.3%, F1 99.3%
- **Decoys flagged (look-alike non-PII: invalid checksums, order ids, prices, non-DOB dates):** 0 of 0

## Leakage (what would reach the server)

- Values present in the sanitized payload before the gate: **50 of 200** (40 pages) - by type: NAME 50
- Production-mode leak gate (map + regex only): passed 50/50 pages; **passed pages that still leaked: 40**
- Test-mode leak gate (+ ground-truth canaries): passed 10/50 pages; passed pages that still leaked: 0

## Cost

- Observe + sanitize per page (Node, happy-dom, no models): mean 4.74 ms, p95 9.62 ms
- Mean sanitized payload: 603 bytes

## Caveats

- The page generator and the detectors come from the same team, so label wording and value formats overlap. Treat structured-type scores as an upper bound until the held-out adversarial set (unseen label variants, OCR noise, mixed scripts) is scored.
- NAME and ADDRESS are expected to be 0% here: they need the NER model (Phase 6). This is the "rules only" row of the ablation.
- Production-mode leak gate can only catch values it knows (map + patterns), so unmapped names pass it. Test mode plants the ground truth as canaries and blocks every leaking page.
