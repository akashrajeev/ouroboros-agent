# Eval: rules + patterns + NER (bert-small-pii int8)

250 synthetic Faker en_IN pages (seed 26171, generated with `npm run metrics --workspace eval -- 250`; templates: kyc, profile, bank, checkout, narrative). A detection counts only if both the value and the type match.

## PII detection (M2)

| Type | Support | TP | FP | FN | Precision % | Recall % | F1 % |
|------|--------:|---:|---:|---:|------------:|---------:|-----:|
| AADHAAR | 100 | 100 | 0 | 0 | 100.0 | 100.0 | 100.0 |
| ACCOUNT | 150 | 150 | 0 | 0 | 100.0 | 100.0 | 100.0 |
| ADDRESS | 100 | 85 | 18 | 15 | 82.5 | 85.0 | 83.7 |
| CARD | 100 | 100 | 0 | 0 | 100.0 | 100.0 | 100.0 |
| CVV | 50 | 50 | 0 | 0 | 100.0 | 100.0 | 100.0 |
| DOB | 100 | 100 | 0 | 0 | 100.0 | 100.0 | 100.0 |
| EMAIL | 200 | 200 | 0 | 0 | 100.0 | 100.0 | 100.0 |
| GSTIN | 50 | 50 | 0 | 0 | 100.0 | 100.0 | 100.0 |
| IFSC | 150 | 150 | 0 | 0 | 100.0 | 100.0 | 100.0 |
| NAME | 300 | 295 | 41 | 5 | 87.8 | 98.3 | 92.8 |
| OTP | 50 | 50 | 0 | 0 | 100.0 | 100.0 | 100.0 |
| PAN | 100 | 100 | 0 | 0 | 100.0 | 100.0 | 100.0 |
| PASSPORT | 50 | 50 | 0 | 0 | 100.0 | 100.0 | 100.0 |
| PASSWORD | 50 | 50 | 0 | 0 | 100.0 | 100.0 | 100.0 |
| PHONE | 200 | 200 | 0 | 0 | 100.0 | 100.0 | 100.0 |
| PINCODE | 150 | 150 | 0 | 0 | 100.0 | 100.0 | 100.0 |
| UPI | 200 | 200 | 0 | 0 | 100.0 | 100.0 | 100.0 |
| VEHICLE | 50 | 50 | 0 | 0 | 100.0 | 100.0 | 100.0 |

- **Micro, all types:** P 97.3%, R 99.1%, F1 98.2%
- **Micro, structured types (without NAME/ADDRESS):** P 100.0%, R 100.0%, F1 100.0%
- **Decoys flagged (look-alike non-PII: invalid checksums, order ids, prices, non-DOB dates):** 0 of 2000

## Leakage (what would reach the server)

- Values present in the sanitized payload before the gate: **2 of 2150** (2 pages) - by type: NAME 2
- Production-mode leak gate (map + regex only): passed 227/250 pages; **passed pages that still leaked: 2**
- Test-mode leak gate (+ ground-truth canaries): passed 225/250 pages; passed pages that still leaked: 0

## Cost

- Observe + sanitize per page (Node, happy-dom, no models): mean 66.91 ms, p95 94.01 ms
- Mean sanitized payload: 1923 bytes

## Caveats

- The page generator and the detectors come from the same team, so label wording and value formats overlap. Treat structured-type scores as an upper bound until the held-out adversarial set (unseen label variants, OCR noise, mixed scripts) is scored.
- NAME and ADDRESS are expected to be 0% here: they need the NER model (Phase 6). This is the "rules only" row of the ablation.
- Production-mode leak gate can only catch values it knows (map + patterns), so unmapped names pass it. Test mode plants the ground truth as canaries and blocks every leaking page.
