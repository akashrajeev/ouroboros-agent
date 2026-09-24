# Eval: screen map (M1 proxy) and G1 gating

Ground truth = every interactive DOM element (`input:not([type=hidden]),select,textarea,button,a[href],[role=button],[contenteditable=true]`) and its label from aria-label / label[for] / wrapping label / button text. Replay = 10 observations per page with 2 edits (typing into two fields), the rest unchanged.

| Set | Pages | Interactive | In screen map | Recall % | Label correct % | Replay steps skipped by G1 % |
|---|--:|--:|--:|--:|--:|--:|
| tuning | 100 | 380 | 380 | 100.0 | 100.0 | 80.0 |
| adversarial-778 | 100 | 160 | 160 | 100.0 | 100.0 | 82.0 |

The ceiling is 70% on pages with two or more text fields (7 of 10 observations unchanged) and 90% on pages with no text fields (table and narrative templates), so the blended ceiling is above 70%.

## Caveats

- Pages are self-generated; recall here says the observer handles our templates, not arbitrary sites. The label check is a prefix match.
- The replay measures the DOM half of the change gate only; the pixel half (dHash tiles) is unit-tested but not in this replay.
