# Eval: vision stage on synthetic ID-card images (degraded: rotation, blur, downscale, JPEG)

60 Faker en_IN cards (seed 9002, `npm run images --workspace eval -- 60 9002 --hard`), 720x440 PNG, 5 fonts, 5 backgrounds, 5 PII fields + 2 look-alike decoys + one face photo each. Pipeline: PaddleOCR PP-OCRv3 det + PP-OCRv5 mobile English rec (ONNX, CPU) -> rules + NER per OCR line -> black-fill matched spans (low-confidence lines masked whole) ; YuNet 2023mar -> pixelate faces. "Readable" = the value appears in PaddleOCR output of the image (normalized). The attacker model is the same OCR, so this is a lower bound on what a stronger reader could recover.

## PII still readable

| Type | Values | Readable before | Readable after | Suppressed % |
|------|------:|------:|------:|------:|
| NAME | 60 | 52 | 0 | 100.0 |
| DOB | 60 | 60 | 1 | 98.3 |
| AADHAAR | 60 | 54 | 4 | 92.6 |
| PAN | 60 | 55 | 0 | 100.0 |
| PHONE | 60 | 58 | 2 | 96.6 |

- **All values:** 279 of 300 readable before, **7 readable after masking**
- Faces detected: 60/60 before, 0/60 after pixelation
- Decoys readable: 118 before, 117 after (lower after = over-redaction)
- Mean masked area: 12.4% of the image
- Leak gate on re-OCR text: passed 53/60; passed while a value was still readable: **0**

## Cost (Node, onnxruntime-node CPU, sandbox)

- OCR + faces + NER + masking per image: mean 533 ms, p50 498 ms, p95 910 ms

## Caveats

- Self-generated images with a single reused face photo (OpenCV sample). Degradation is simulated (rotation up to 4 deg, blur, 0.55-0.8x downscale, JPEG q35-60); no glare, perspective or real camera noise. Treat these as an upper bound.
- Face "after" re-detection only shows YuNet no longer fires; it is not proof a person is unrecognisable.
