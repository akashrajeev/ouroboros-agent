# Ouroboros Agent - results against the SIH26171 metrics (2026-09-24)

Every number below comes from a file in `eval/results/` and can be reproduced with the command in that file. "Fresh" means a seed that was never looked at while tuning. "Dev/contaminated" means fixes were made after looking at that seed. Where we have both, both are shown.

## Summary

| Official metric (weight) | What we measure | Result | Seed status | Source |
|---|---|---|---|---|
| Visual context understanding (25%) | Task needs an image: pick the document type that only the ID-card pixels show; masked image sent only on `need_visual` | **10/12** with the masked image vs 6/12 text-only (chance 4/12). Clean finish 10/12 | fresh (7777); 10/12 also on 5151 | `phase9-e4-7777.md`, `phase9-e4-5151.md` |
| | Unseen form layouts (label variants, Hindi labels), real 7B planner | **10/10 forms**, 40/40 fields exact | fresh (8675309) | `phase9-*-e6b-fresh.md` |
| | Known layouts, new values | 20/20 tasks, 120/120 fields | fresh values (90210) | `phase9-*-v2-seed90210*.md` |
| PII detection precision / recall (20%) | Token-level P/R, rules + patterns + NER (bert-small-pii int8), DOM pages | Structured types **100 / 100**; all types **98.5 / 99.2** | dev (26171, 60 pages) | `ablation.md` |
| | Same, 250 pages | 100 / 100; all types 97.3 / 99.1 | dev-adjacent | `ablation-250.md` |
| | Adversarial layouts (label variants, Hindi, split values, odd formats, headerless tables) | Structured **99.3 / 99.3**; all types **98.5 / 98.5**; NAME recall 96% | fresh (779) | `ablation-adversarial-779.md` |
| | ID-card images (OCR -> rules + NER + label rule) | Values readable after masking: **0/298** clean, **5/279** degraded (all 5 blocked by the gate) | fresh (9101, 9102) | `vision-cards-9101.md`, `vision-cards-hard-9102.md` |
| Redaction precision (20%) | Look-alike non-PII (bad checksums, order ids, prices, non-DOB dates) wrongly masked | **0/480** decoys on DOM pages (0/2000 on 250 pages); image decoys 120 -> 120 readable (clean) and 119 -> 115 (degraded) | dev + fresh | `ablation*.md`, `vision-cards-*.md` |
| | Privacy end to end: real values in anything sent to the server | **0** in every run (E1-E6, E4): 0/160, 0/60, 0/83 ... Gate blocks: 1 (E4 seed 5151: a residual Aadhaar on a degraded card, caught before sending) | all | `docs/PHASE9.md` |
| Client resource usage (20%) | Models shipped to the browser | NER 28.7 MB (int8) + PaddleOCR det 2.4 MB + rec 7.8 MB + YuNet 0.23 MB = **~39 MB** total | - | `models/` |
| | Device CPU per step | DOM sanitize + NER: 71 ms/page mean, 100 ms p95 (Node CPU); image path (OCR + faces + mask + re-OCR): 870 ms p50 Node CPU, 2.2 s WASM 1-thread; region cache saves 80% on unchanged screens | - | `ablation.md`, `bench-vision.md` |
| | Bytes per step | Text step about 1.2k prompt tokens; masked image p50 20 KB, sent only after `need_visual` | - | `docs/PHASE9.md` |
| End-to-end latency (15%) | Per step, 7B AWQ on a free T4 through a tunnel | Server p50/p95 **803 / 961 ms** (E6b); round-trip at the device p50 755 ms (E4b). Tunnel alone: 141 ms | fresh | `docs/PHASE9.md` |

## Methodology

- **Data.** Synthetic pages from Faker en_IN with valid-checksum Indian IDs (Aadhaar Verhoeff, PAN structure, IFSC, card Luhn), plus look-alike decoys. Page templates: KYC, checkout, profile, bank; adversarial set (`eval/src/adversarial.ts`). ID cards are rendered with sharp: 5 fonts, 5 backgrounds, a face photo, and half of them degraded (rotation, blur, downscale, JPEG).
- **Scoring.** PII P/R is per value (a value counts as found only when its whole span is masked). The leak check is independent of the product gate: it looks for every true value in the exact request body (word-bounded exact match, or normalized match for values of 6+ characters).
- **Planner.** Qwen2.5-VL-7B-Instruct-AWQ on vLLM, one free T4 (Colab first, then Kaggle), temperature 0. It only ever sees placeholders. The device swaps them for real values locally. The validator rejects unknown placeholders, placeholders of the wrong type, and stale elements.
- **Contamination.** Prompt and detector changes were made after looking at seeds 26171, 31337, 4242, 4444, 5151, 777, 9001 and 9002. Headline numbers use seeds that came later: 90210, 8675309, 7777, 779, 9101, 9102.

## Honest limits

- Everything is synthetic. There are no real government-portal pages or real phone photos yet, so the fresh-seed numbers are an upper bound for real sites.
- Sample sizes are small for the planner experiments (12-20 tasks per run, one run each). There are no error bars. Differences of 1-2 tasks are noise.
- Timing: device numbers come from a shared 2-vCPU sandbox (Node and WASM). WebGPU is not measured. Server numbers include a Cloudflare quick tunnel.
- Open failures: the planner sometimes types a placeholder that doesn't exist (validator catches it; still a task failure). It doesn't say "done" on display-only pages. Pixel masking misses digits that the OCR misreads on degraded cards; the re-OCR gate catches them, so we fail closed rather than leak.
