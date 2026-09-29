"""Planners. StubPlanner is deterministic and needs no GPU.

The real planner (Qwen2.5-VL-7B on vLLM) plugs in behind the same interface
once compute is approved.
"""
from __future__ import annotations

import re
from typing import Protocol

from .schemas import Action, Element, StepRequest

TOKEN_RE = re.compile(r"<([A-Z]+)_(\d+)>")

# Which token types a field label/type accepts.
FIELD_HINTS: list[tuple[re.Pattern[str], str]] = [
    (re.compile(r"aadha+r|\buid\b", re.I), "AADHAAR"),
    (re.compile(r"\bpan\b", re.I), "PAN"),
    (re.compile(r"ifsc", re.I), "IFSC"),
    (re.compile(r"\bupi\b|vpa", re.I), "UPI"),
    (re.compile(r"e-?mail", re.I), "EMAIL"),
    (re.compile(r"phone|mobile|\btel\b|contact no", re.I), "PHONE"),
    (re.compile(r"gstin|\bgst\b", re.I), "GSTIN"),
    (re.compile(r"passport", re.I), "PASSPORT"),
    (re.compile(r"card", re.I), "CARD"),
    (re.compile(r"account", re.I), "ACCOUNT"),
    (re.compile(r"birth|\bdob\b", re.I), "DOB"),
    (re.compile(r"pin ?code|postal|\bzip\b", re.I), "PINCODE"),
    (re.compile(r"address", re.I), "ADDRESS"),
    (re.compile(r"name", re.I), "NAME"),
]
TEXT_FIELD_TYPES = {"text", "tel", "email", "number", "textarea", "search", None}
SUBMIT_RE = re.compile(r"submit|continue|next|save|register|sign ?up|proceed|pay", re.I)
NO_SUBMIT_RE = re.compile(r"(?:do not|don't|without|never)\s+(?:click\s+)?(?:submit|send|register|pay|confirm)|(?:leave|keep)\s+(?:it\s+)?(?:unsubmitted|as\s+a\s+draft)", re.I)
YES_SUBMIT_RE = re.compile(r"\b(?:submit|send|register|pay|confirm)\b", re.I)



def field_token_type(el: Element) -> str | None:
    if el.field_type == "email":
        return "EMAIL"
    if el.field_type == "tel":
        return "PHONE"
    for rx, t in FIELD_HINTS:
        if rx.search(el.label):
            return t
    return None


class Planner(Protocol):
    name: str

    def plan(self, req: StepRequest) -> Action: ...


class StubPlanner:
    """Fill each empty textbox with the task token of the matching type, then submit."""

    name = "stub-v1"

    def plan(self, req: StepRequest) -> Action:
        task_tokens = [m.group(0) for m in TOKEN_RE.finditer(req.task)]
        # When the task names no values ("fill the form from my saved profile"),
        # plan from the legend instead - the same signal the VLM planner uses.
        candidates = task_tokens or list(req.legend)
        used = {h.text for h in req.history if h.op == "type"}
        typed_into = {h.element_id for h in req.history if h.op == "type"}
        for el in req.screen_map:
            if el.role not in ("textbox", "combobox") or el.value or el.id in typed_into:
                continue
            if el.field_type not in TEXT_FIELD_TYPES or el.state.get("disabled"):
                continue
            want = field_token_type(el)
            if not want:
                continue
            for tok in candidates:
                if tok in used:
                    continue
                if req.legend.get(tok) == want:
                    return Action(op="type", element_id=el.id, text=tok, reason=f"{el.label or el.id} expects {want}")
        for el in req.screen_map:
            if not YES_SUBMIT_RE.search(req.task) or NO_SUBMIT_RE.search(req.task):
                break
            if el.role == "button" and SUBMIT_RE.search(el.label) and not el.state.get("disabled"):
                if any(h.op == "click" and h.element_id == el.id for h in req.history):
                    return Action(op="done", reason="submitted")
                return Action(op="click", element_id=el.id, reason="all matching fields filled")
        return Action(op="done", reason="nothing left to do")
