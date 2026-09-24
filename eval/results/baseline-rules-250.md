# Eval: rules + patterns baseline (no models)

250 synthetic Faker en_IN pages (seed 26171, generated with `npm run metrics --workspace eval -- 250`; templates: kyc, profile, bank, checkout, narrative). A detection counts only if both the value and the type match.

## PII detection (M2)

| Type | Support | TP | FP | FN | Precision % | Recall % | F1 % |
|------|--------:|---:|---:|---:|------------:|---------:|-----:|
| AADHAAR | 100 | 100 | 0 | 0 | 100.0 | 100.0 | 100.0 |
| ACCOUNT | 150 | 150 | 0 | 0 | 100.0 | 100.0 | 100.0 |
| ADDRESS | 100 | 0 | 0 | 100 | 100.0 | 0.0 | 0.0 |
| CARD | 100 | 100 | 0 | 0 | 100.0 | 100.0 | 100.0 |
| CVV | 50 | 50 | 0 | 0 | 100.0 | 100.0 | 100.0 |
| DOB | 100 | 100 | 0 | 0 | 100.0 | 100.0 | 100.0 |
| EMAIL | 200 | 200 | 0 | 0 | 100.0 | 100.0 | 100.0 |
| GSTIN | 50 | 50 | 0 | 0 | 100.0 | 100.0 | 100.0 |
| IFSC | 150 | 150 | 0 | 0 | 100.0 | 100.0 | 100.0 |
| NAME | 300 | 0 | 0 | 300 | 100.0 | 0.0 | 0.0 |
| OTP | 50 | 50 | 0 | 0 | 100.0 | 100.0 | 100.0 |
| PAN | 100 | 100 | 0 | 0 | 100.0 | 100.0 | 100.0 |
| PASSPORT | 50 | 50 | 0 | 0 | 100.0 | 100.0 | 100.0 |
| PASSWORD | 50 | 50 | 0 | 0 | 100.0 | 100.0 | 100.0 |
| PHONE | 200 | 200 | 0 | 0 | 100.0 | 100.0 | 100.0 |
| PINCODE | 150 | 150 | 0 | 0 | 100.0 | 100.0 | 100.0 |
| UPI | 200 | 200 | 0 | 0 | 100.0 | 100.0 | 100.0 |
| VEHICLE | 50 | 50 | 0 | 0 | 100.0 | 100.0 | 100.0 |

- **Micro, all types:** P 100.0%, R 81.4%, F1 89.7%
- **Micro, structured types (without NAME/ADDRESS):** P 100.0%, R 100.0%, F1 100.0%
- **Decoys flagged (look-alike non-PII: invalid checksums, order ids, prices, non-DOB dates):** 0 of 2000

## Leakage (what would reach the server)

- Values present in the sanitized payload before the gate: **400 of 2150** (200 pages) - by type: NAME 300, ADDRESS 100
- Production-mode leak gate (map + regex only): passed 250/250 pages; **passed pages that still leaked: 200**
- Test-mode leak gate (+ ground-truth canaries): passed 50/250 pages; passed pages that still leaked: 0

## Cost

- Observe + sanitize per page (Node, happy-dom, no models): mean 5.24 ms, p95 9.07 ms
- Mean sanitized payload: 1937 bytes

## Caveats

- The page generator and the detectors come from the same team, so label wording and value formats overlap. Treat structured-type scores as an upper bound until the held-out adversarial set (unseen label variants, OCR noise, mixed scripts) is scored.
- NAME and ADDRESS are expected to be 0% here: they need the NER model (Phase 6). This is the "rules only" row of the ablation.
- Production-mode leak gate can only catch values it knows (map + patterns), so unmapped names pass it. Test mode plants the ground truth as canaries and blocks every leaking page.
