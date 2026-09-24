# Eval: vision stage on synthetic ID-card images

60 Faker en_IN cards (seed 9101, `npm run images --workspace eval -- 60 9101`), 720x440 PNG, 5 fonts, 5 backgrounds, 5 PII fields + 2 look-alike decoys + one face photo each. Pipeline: PaddleOCR PP-OCRv3 det + PP-OCRv5 mobile English rec (ONNX, CPU) -> rules + NER per OCR line -> black-fill matched spans (low-confidence lines masked whole) ; YuNet 2023mar -> pixelate faces. "Readable" = the value appears in PaddleOCR output of the image (normalized). The attacker model is the same OCR, so this is a lower bound on what a stronger reader could recover.

## PII still readable

| Type | Values | Readable before | Readable after | Suppressed % |
|------|------:|------:|------:|------:|
| NAME | 60 | 60 | 0 | 100.0 |
| DOB | 60 | 60 | 0 | 100.0 |
| AADHAAR | 60 | 60 | 0 | 100.0 |
| PAN | 60 | 58 | 0 | 100.0 |
| PHONE | 60 | 60 | 0 | 100.0 |

- **All values:** 298 of 300 readable before, **0 readable after masking**
- Faces detected: 60/60 before, 0/60 after pixelation
- Decoys readable: 120 before, 120 after (lower after = over-redaction)
- Mean masked area: 10.7% of the image
- Leak gate on re-OCR text: passed 60/60; passed while a value was still readable: **0**

## Cost (Node, onnxruntime-node CPU, sandbox)

- OCR + faces + NER + masking per image: mean 515 ms, p50 511 ms, p95 596 ms

## Caveats

- Self-generated images with a single reused face photo (OpenCV sample). Clean synthetic text: no blur, skew, glare or camera noise. Treat these as an upper bound.
- Face "after" re-detection only shows YuNet no longer fires; it is not proof a person is unrecognisable.
