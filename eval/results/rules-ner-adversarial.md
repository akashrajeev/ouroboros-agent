# Eval: rules + patterns + NER (bert-small-pii int8)

50 synthetic Faker en_IN pages (seed 26171, generated with `npm run metrics --workspace eval -- 50`; templates: kyc, profile, bank, checkout, narrative). A detection counts only if both the value and the type match.

## PII detection (M2)

| Type | Support | TP | FP | FN | Precision % | Recall % | F1 % |
|------|--------:|---:|---:|---:|------------:|---------:|-----:|
| AADHAAR | 30 | 20 | 0 | 10 | 100.0 | 66.7 | 80.0 |
| ACCOUNT | 20 | 0 | 10 | 20 | 0.0 | 0.0 | 0.0 |
| ADDRESS | 0 | 0 | 27 | 0 | 0.0 | 100.0 | 0.0 |
| DOB | 10 | 0 | 0 | 10 | 100.0 | 0.0 | 0.0 |
| EMAIL | 20 | 10 | 0 | 10 | 100.0 | 50.0 | 66.7 |
| IFSC | 20 | 20 | 0 | 0 | 100.0 | 100.0 | 100.0 |
| NAME | 50 | 48 | 14 | 2 | 77.4 | 96.0 | 85.7 |
| PAN | 10 | 0 | 0 | 10 | 100.0 | 0.0 | 0.0 |
| PHONE | 40 | 20 | 0 | 20 | 100.0 | 50.0 | 66.7 |

- **Micro, all types:** P 69.8%, R 59.0%, F1 64.0%
- **Micro, structured types (without NAME/ADDRESS):** P 87.5%, R 46.7%, F1 60.9%
- **Decoys flagged (look-alike non-PII: invalid checksums, order ids, prices, non-DOB dates):** 0 of 0

## Leakage (what would reach the server)

- Values present in the sanitized payload before the gate: **53 of 200** (25 pages) - by type: PHONE 14, DOB 10, EMAIL 6, ACCOUNT 20, AADHAAR 1, NAME 2
- Production-mode leak gate (map + regex only): passed 50/50 pages; **passed pages that still leaked: 25**
- Test-mode leak gate (+ ground-truth canaries): passed 30/50 pages; passed pages that still leaked: 5

## Cost

- Observe + sanitize per page (Node, happy-dom, no models): mean 25.15 ms, p95 36.37 ms
- Mean sanitized payload: 698 bytes

## Caveats

- The page generator and the detectors come from the same team, so label wording and value formats overlap. Treat structured-type scores as an upper bound until the held-out adversarial set (unseen label variants, OCR noise, mixed scripts) is scored.
- NAME and ADDRESS are expected to be 0% here: they need the NER model (Phase 6). This is the "rules only" row of the ablation.
- Production-mode leak gate can only catch values it knows (map + patterns), so unmapped names pass it. Test mode plants the ground truth as canaries and blocks every leaking page.
