# Eval: rules + patterns + NER (bert-small-pii int8)

60 synthetic Faker en_IN pages (seed 26171, generated with `npm run metrics --workspace eval -- 60`; templates: kyc, profile, bank, checkout, narrative). A detection counts only if both the value and the type match.

## PII detection (M2)

| Type | Support | TP | FP | FN | Precision % | Recall % | F1 % |
|------|--------:|---:|---:|---:|------------:|---------:|-----:|
| AADHAAR | 24 | 24 | 0 | 0 | 100.0 | 100.0 | 100.0 |
| ACCOUNT | 36 | 36 | 0 | 0 | 100.0 | 100.0 | 100.0 |
| ADDRESS | 24 | 20 | 4 | 4 | 83.3 | 83.3 | 83.3 |
| CARD | 24 | 24 | 0 | 0 | 100.0 | 100.0 | 100.0 |
| CVV | 12 | 12 | 0 | 0 | 100.0 | 100.0 | 100.0 |
| DOB | 24 | 24 | 0 | 0 | 100.0 | 100.0 | 100.0 |
| EMAIL | 48 | 48 | 0 | 0 | 100.0 | 100.0 | 100.0 |
| GSTIN | 12 | 12 | 0 | 0 | 100.0 | 100.0 | 100.0 |
| IFSC | 36 | 36 | 0 | 0 | 100.0 | 100.0 | 100.0 |
| NAME | 72 | 72 | 8 | 0 | 90.0 | 100.0 | 94.7 |
| OTP | 12 | 12 | 0 | 0 | 100.0 | 100.0 | 100.0 |
| PAN | 24 | 24 | 0 | 0 | 100.0 | 100.0 | 100.0 |
| PASSPORT | 12 | 12 | 0 | 0 | 100.0 | 100.0 | 100.0 |
| PASSWORD | 12 | 12 | 0 | 0 | 100.0 | 100.0 | 100.0 |
| PHONE | 48 | 48 | 0 | 0 | 100.0 | 100.0 | 100.0 |
| PINCODE | 36 | 36 | 0 | 0 | 100.0 | 100.0 | 100.0 |
| UPI | 48 | 48 | 0 | 0 | 100.0 | 100.0 | 100.0 |
| VEHICLE | 12 | 12 | 0 | 0 | 100.0 | 100.0 | 100.0 |

- **Micro, all types:** P 97.7%, R 99.2%, F1 98.5%
- **Micro, structured types (without NAME/ADDRESS):** P 100.0%, R 100.0%, F1 100.0%
- **Decoys flagged (look-alike non-PII: invalid checksums, order ids, prices, non-DOB dates):** 0 of 480

## Leakage (what would reach the server)

- Values present in the sanitized payload before the gate: **0 of 516** (0 pages)
- Production-mode leak gate (map + regex only): passed 56/60 pages; **passed pages that still leaked: 0**
- Test-mode leak gate (+ ground-truth canaries): passed 56/60 pages; passed pages that still leaked: 0

## Cost

- Observe + sanitize per page (Node, happy-dom, no models): mean 89.13 ms, p95 144.80 ms
- Mean sanitized payload: 1924 bytes

## Caveats

- The page generator and the detectors come from the same team, so label wording and value formats overlap. Treat structured-type scores as an upper bound until the held-out adversarial set (unseen label variants, OCR noise, mixed scripts) is scored.
- NAME and ADDRESS are expected to be 0% here: they need the NER model (Phase 6). This is the "rules only" row of the ablation.
- Production-mode leak gate can only catch values it knows (map + patterns), so unmapped names pass it. Test mode plants the ground truth as canaries and blocks every leaking page.
