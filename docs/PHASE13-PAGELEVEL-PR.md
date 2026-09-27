# Phase 13 - Page-level precision/recall on usable real pages (27 September 2026)

## Verdict

On the five usable first-step pages from the Phase 12C sweep (Zerodha signup, Groww login, LinkedIn signup, Shine registration, Airbnb signup/login), with manually annotated ground truth:

- **Recall: 100%** - 9/9 annotated PII values masked, on two independent seeds (12131, 12133). Zero annotated values appear verbatim in the serialized wire screen map.
- **Precision: micro 60.0% (9 TP / 6 FP), macro 82.9%** - all six false masks are on Zerodha's footer and are over-masking of public corporate/boilerplate text, not user data left or wrong data protected.
- Type accuracy on masked values: 8/9 (Shine's mobile was masked under the token type `ACCOUNT`, not `PHONE`; the value itself was protected).

This replaces Phase 12C's "8 TP 0 FN, FP unmeasured" probe with an annotated, scored benchmark. The small positive count is a property of these pages: first-step signup/login screens expose no personal data beyond what the tester types, and that was verified by reading every observed element and the viewport screenshot for all five pages.

## Results (identical on both seeds)

| Site | Observed elements | Positives | TP | FN | FP | Precision | Recall |
|---|---:|---:|---:|---:|---:|---:|---:|
| Zerodha signup | 81 | 1 | 1 | 0 | 6 | 14.3% | 100% |
| Groww login | 13 | 1 | 1 | 0 | 0 | 100% | 100% |
| LinkedIn signup | 29 | 2 | 2 | 0 | 0 | 100% | 100% |
| Shine registration | 37 | 4 | 4 | 0 | 0 | 100% | 100% |
| Airbnb signup/login | 54 | 1 | 1 | 0 | 0 | 100% | 100% |
| **Micro total** | 214 | 9 | 9 | 0 | 6 | **60.0%** | **100%** |

Macro precision 82.9%, macro recall 100%. Full row-level data: `eval/results/pagelevel-12131/pagelevel-score.json`, `eval/results/pagelevel-12133/pagelevel-score.json`.

## The six false positives (all Zerodha, all footer)

| Token | Masked text | What it actually is | Detector |
|---|---|---|---|
| `<NAME_1>` | "I demat" (inside the link "NRI demat account" -> "NR`<NAME_1>` account") | navigation link text | NER |
| `<ADDRESS_1..3>` | "#153/154, 4th Cross, Dollars Colony, Opp. Clarence" / "J.P Nagar" / "Phase, Bengaluru - 560078, Karnataka, India" | Zerodha's registered corporate address in the mandatory SEBI disclosure | NER |
| `<EMAIL_1>` | complaints@zerodha.com | public business contact email | pattern |
| `<EMAIL_2>` | dp@zerodha.com | public business contact email | pattern |

Correct rejections on the same page: SEBI registration numbers INZ000031633, IN-DP-431-2019, INZ000038238 and MCX 46025 were left unmasked.

## Labeling policy (the decision a judge must be able to see)

- **Positive** = personal data of a natural person: values typed into form fields, or personal data rendered in page content. On these five pages the only positives are the typed synthetic values.
- **Benign** = everything else, including corporate identifiers (SEBI registration numbers) and public business contact details (registered office address, complaints@/dp@ emails). These are public company information, not user PII; masking them degrades the agent's view, so each counts as a false positive.
- Under the alternative, broader reading where public business contact emails count as sensitive, the two email masks stop being FPs: micro precision becomes 9/13 = 69.2%. The corporate-address and "I demat" masks are false positives under any reading. Both numbers are reported so the policy choice is explicit.

## Method

1. `eval/src/pagelevel-pr.ts` loads each URL in headless Chrome at 1280x900 (`domcontentloaded`, no readiness wait, matching Phase 12C), injects the observe/fill helper, fills recognized fields with Faker en_IN synthetic values (seeded), never submits, observes, runs the real pipeline (`sanitize` + `bert-small-pii` NER int8), and dumps the raw observation, sanitized screen elements, detections, placeholder map, and a viewport screenshot per site.
2. Ground truth (`eval/annotation/pagelevel/*.json`) was annotated by hand from the full element dump plus screenshots for seed 12131: every one of the 214 observed elements was reviewed. Seed 12133 annotations are auto-derived from the recorded fills with the benign list re-located by value; page text was verified unchanged.
3. `eval/src/pagelevel-score.ts` joins capture + annotation: TP = positive value masked (normalized match, containment-tolerant for site-split values); FN = positive unmasked, cross-checked by a verbatim normalized leak scan of the wire map; FP = masked token matching no positive; type accuracy compares annotated vs token type.

Reproduce:
```
scripts/fetch-models.sh   # NER model only is enough for this DOM path
npx tsx eval/src/pagelevel-pr.ts pagelevel-5.txt 12131 pagelevel-12131
npx tsx eval/src/pagelevel-score.ts pagelevel-12131
```

## Limits

- Nine positives is small; recall 100% is "all typed values on five first-step pages", not a general real-web guarantee. Expanding usable-page coverage is tracked separately (Phase 12C follow-up).
- Viewport-scoped DOM text path only; the image/OCR path is measured separately (Phases 11, 12B). No authenticated or multi-step pages.
- Shine splits the typed mobile into a country-code box (`91`, unscored: not independently identifying) and a 10-digit field (masked as `ACCOUNT` - value protected, type label wrong).
- NER over-masking of footer boilerplate is now the dominant precision cost on real pages; the synthetic-corpus redaction precision (0/480 decoys) did not expose it because synthetic pages lack regulatory footers.

No form was submitted, no account created, no paid compute used.
