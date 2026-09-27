# Page-level P/R score (pagelevel-12131)

| Site | Elements | Positives | TP | FN | FP | Precision | Recall | F1 | Type acc |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| airbnb | 54 | 1 | 1 | 0 | 0 | 100.0% | 100.0% | 100.0% | 100.0% |
| groww | 13 | 1 | 1 | 0 | 0 | 100.0% | 100.0% | 100.0% | 100.0% |
| linkedin | 29 | 2 | 2 | 0 | 0 | 100.0% | 100.0% | 100.0% | 100.0% |
| shine | 37 | 4 | 4 | 0 | 0 | 100.0% | 100.0% | 100.0% | 75.0% |
| zerodha | 81 | 1 | 1 | 0 | 6 | 14.3% | 100.0% | 25.0% | 100.0% |
| **micro total** | | 9 | 9 | 0 | 6 | 60.0% | 100.0% | 75.0% | |

Macro precision 82.9%, macro recall 100.0%.

## False positives
- zerodha: <NAME_1> (NAME) = "I demat" on element(s) 28
- zerodha: <ADDRESS_1> (ADDRESS) = "#153/154, 4th Cross, Dollars Colony, Opp. Clarence" on element(s) 59
- zerodha: <ADDRESS_2> (ADDRESS) = "J.P Nagar" on element(s) 59
- zerodha: <ADDRESS_3> (ADDRESS) = "Phase, Bengaluru - 560078, Karnataka, India" on element(s) 59
- zerodha: <EMAIL_1> (EMAIL) = "complaints@zerodha.com" on element(s) 60
- zerodha: <EMAIL_2> (EMAIL) = "dp@zerodha.com" on element(s) 61

## False negatives / leaks
None. No annotated positive appears verbatim in any wire screen map.
