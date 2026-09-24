# Eval: rules + patterns baseline (no models)

60 synthetic Faker en_IN pages (seed 26171, generated with `npm run metrics --workspace eval -- 60`; templates: kyc, profile, bank, checkout, narrative). A detection counts only if both the value and the type match.

## PII detection (M2)

| Type | Support | TP | FP | FN | Precision % | Recall % | F1 % |
|------|--------:|---:|---:|---:|------------:|---------:|-----:|
| AADHAAR | 24 | 24 | 0 | 0 | 100.0 | 100.0 | 100.0 |
| ACCOUNT | 36 | 36 | 0 | 0 | 100.0 | 100.0 | 100.0 |
| ADDRESS | 24 | 0 | 0 | 24 | 100.0 | 0.0 | 0.0 |
| CARD | 24 | 24 | 0 | 0 | 100.0 | 100.0 | 100.0 |
| CVV | 12 | 12 | 0 | 0 | 100.0 | 100.0 | 100.0 |
| DOB | 24 | 24 | 0 | 0 | 100.0 | 100.0 | 100.0 |
| EMAIL | 48 | 48 | 0 | 0 | 100.0 | 100.0 | 100.0 |
| GSTIN | 12 | 12 | 0 | 0 | 100.0 | 100.0 | 100.0 |
| IFSC | 36 | 36 | 0 | 0 | 100.0 | 100.0 | 100.0 |
| NAME | 72 | 0 | 0 | 72 | 100.0 | 0.0 | 0.0 |
| OTP | 12 | 12 | 0 | 0 | 100.0 | 100.0 | 100.0 |
| PAN | 24 | 24 | 0 | 0 | 100.0 | 100.0 | 100.0 |
| PASSPORT | 12 | 12 | 0 | 0 | 100.0 | 100.0 | 100.0 |
| PASSWORD | 12 | 12 | 0 | 0 | 100.0 | 100.0 | 100.0 |
| PHONE | 48 | 48 | 0 | 0 | 100.0 | 100.0 | 100.0 |
| PINCODE | 36 | 36 | 0 | 0 | 100.0 | 100.0 | 100.0 |
| UPI | 48 | 48 | 0 | 0 | 100.0 | 100.0 | 100.0 |
| VEHICLE | 12 | 12 | 0 | 0 | 100.0 | 100.0 | 100.0 |

- **Micro, all types:** P 100.0%, R 81.4%, F1 89.7%
- **Micro, structured types (without NAME/ADDRESS):** P 100.0%, R 100.0%, F1 100.0%
- **Decoys flagged (look-alike non-PII: invalid checksums, order ids, prices, non-DOB dates):** 0 of 480

## Leakage (what would reach the server)

- Values present in the sanitized payload before the gate: **96 of 516** (48 pages) - by type: NAME 72, ADDRESS 24
- Production-mode leak gate (map + regex only): passed 60/60 pages; **passed pages that still leaked: 48**
- Test-mode leak gate (+ ground-truth canaries): passed 12/60 pages; passed pages that still leaked: 0

## Cost

- Observe + sanitize per page (Node, happy-dom, no models): mean 7.27 ms, p95 14.80 ms
- Mean sanitized payload: 1937 bytes

## Caveats

- The page generator and the detectors come from the same team, so label wording and value formats overlap. Treat structured-type scores as an upper bound until the held-out adversarial set (unseen label variants, OCR noise, mixed scripts) is scored.
- NAME and ADDRESS are expected to be 0% here: they need the NER model (Phase 6). This is the "rules only" row of the ablation.
- Production-mode leak gate can only catch values it knows (map + patterns), so unmapped names pass it. Test mode plants the ground truth as canaries and blocks every leaking page.
