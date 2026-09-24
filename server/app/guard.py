"""Defense in depth: refuse requests that still carry raw PII.

The device leak gate is the real control. This server check makes a client
bug visible instead of silently accepting raw values.
"""
from __future__ import annotations

import re

_PHONE = re.compile(r"(?<![\d+])(?:\+91[ -]?)?[6-9]\d{4}[ -]?\d{5}\b")
_PAN = re.compile(r"\b[A-Z]{3}[ABCFGHLJPT][A-Z]\d{4}[A-Z]\b")
_EMAIL = re.compile(r"\b[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}\b")
_CARD = re.compile(r"\b(?:\d[ -]?){12,18}\d\b")


def _luhn(d: str) -> bool:
    total, dbl = 0, False
    for ch in reversed(d):
        n = int(ch)
        if dbl:
            n = n * 2 - 9 if n > 4 else n * 2
        total += n
        dbl = not dbl
    return total % 10 == 0


def raw_pii_types(text: str) -> list[str]:
    found = []
    if _PHONE.search(text):
        found.append("PHONE")
    if _PAN.search(text):
        found.append("PAN")
    if _EMAIL.search(text):
        found.append("EMAIL")
    for m in _CARD.finditer(text):
        digits = re.sub(r"\D", "", m.group())
        if 13 <= len(digits) <= 19 and _luhn(digits):
            found.append("CARD")
            break
    return found
