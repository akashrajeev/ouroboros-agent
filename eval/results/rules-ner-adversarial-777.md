# Eval: rules + patterns + NER (bert-small-pii int8)

50 synthetic Faker en_IN pages (seed 26171, generated with `npm run metrics --workspace eval -- 50`; templates: kyc, profile, bank, checkout, narrative). A detection counts only if both the value and the type match.

## PII detection (M2)

| Type | Support | TP | FP | FN | Precision % | Recall % | F1 % |
|------|--------:|---:|---:|---:|------------:|---------:|-----:|
| AADHAAR | 30 | 30 | 0 | 0 | 100.0 | 100.0 | 100.0 |
| ACCOUNT | 20 | 20 | 10 | 0 | 66.7 | 100.0 | 80.0 |
| DOB | 10 | 10 | 0 | 0 | 100.0 | 100.0 | 100.0 |
| EMAIL | 20 | 20 | 0 | 0 | 100.0 | 100.0 | 100.0 |
| IFSC | 20 | 20 | 0 | 0 | 100.0 | 100.0 | 100.0 |
| NAME | 50 | 48 | 10 | 2 | 82.8 | 96.0 | 88.9 |
| PAN | 10 | 0 | 0 | 10 | 100.0 | 0.0 | 0.0 |
| PHONE | 40 | 40 | 0 | 0 | 100.0 | 100.0 | 100.0 |

- **Micro, all types:** P 90.4%, R 94.0%, F1 92.2%
- **Micro, structured types (without NAME/ADDRESS):** P 93.3%, R 93.3%, F1 93.3%
- **Decoys flagged (look-alike non-PII: invalid checksums, order ids, prices, non-DOB dates):** 0 of 0

## Leakage (what would reach the server)

- Values present in the sanitized payload before the gate: **2 of 200** (2 pages) - by type: NAME 2
- Production-mode leak gate (map + regex only): passed 50/50 pages; **passed pages that still leaked: 2**
- Test-mode leak gate (+ ground-truth canaries): passed 48/50 pages; passed pages that still leaked: 0

## Cost

- Observe + sanitize per page (Node, happy-dom, no models): mean 21.47 ms, p95 29.57 ms
- Mean sanitized payload: 597 bytes

## Caveats

- The page generator and the detectors come from the same team, so label wording and value formats overlap. Treat structured-type scores as an upper bound until the held-out adversarial set (unseen label variants, OCR noise, mixed scripts) is scored.
- NAME and ADDRESS are expected to be 0% here: they need the NER model (Phase 6). This is the "rules only" row of the ablation.
- Production-mode leak gate can only catch values it knows (map + patterns), so unmapped names pass it. Test mode plants the ground truth as canaries and blocks every leaking page.
