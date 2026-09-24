# Eval: vision stage on synthetic ID-card images [two-pass masking] (degraded: rotation, blur, downscale, JPEG)

60 Faker en_IN cards (seed 9202, `npm run images --workspace eval -- 60 9202 --hard`), 720x440 PNG, 5 fonts, 5 backgrounds, 5 PII fields + 2 look-alike decoys + one face photo each. Pipeline: PaddleOCR PP-OCRv3 det + PP-OCRv5 mobile English rec (ONNX, CPU) -> rules + NER per OCR line -> black-fill matched spans (low-confidence lines masked whole) ; YuNet 2023mar -> pixelate faces. "Readable" = the value appears in PaddleOCR output of the image (normalized). The attacker model is the same OCR, so this is a lower bound on what a stronger reader could recover.

## PII still readable

| Type | Values | Readable before | Readable after | Suppressed % |
|------|------:|------:|------:|------:|
| NAME | 60 | 53 | 0 | 100.0 |
| DOB | 60 | 60 | 0 | 100.0 |
| AADHAAR | 60 | 57 | 1 | 98.2 |
| PAN | 60 | 56 | 0 | 100.0 |
| PHONE | 60 | 58 | 0 | 100.0 |

- **All values:** 284 of 300 readable before, **1 readable after masking**
- Faces detected: 60/60 before, 0/60 after pixelation
- Decoys readable: 120 before, 117 after (lower after = over-redaction)
- Mean masked area: 14.1% of the image
- Leak gate on re-OCR text: passed 59/60; passed while a value was still readable: **0**

## Cost (Node, onnxruntime-node CPU, sandbox)

- OCR + faces + NER + masking per image: mean 628 ms, p50 599 ms, p95 822 ms

## Caveats

- Self-generated images with a single reused face photo (OpenCV sample). Degradation is simulated (rotation up to 4 deg, blur, 0.55-0.8x downscale, JPEG q35-60); no glare, perspective or real camera noise. Treat these as an upper bound.
- Face "after" re-detection only shows YuNet no longer fires; it is not proof a person is unrecognisable.
