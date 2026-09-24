"""VlmPlanner: calls any OpenAI-compatible chat endpoint (vLLM on a free Colab/Kaggle T4,
or a local server). The request it builds contains only the sanitized screen map, the
placeholder legend (token -> type, never values), history, and the optional masked JPEG.

Env: PLANNER=vlm, VLM_BASE_URL (e.g. https://xyz.trycloudflare.com/v1), VLM_MODEL,
VLM_API_KEY, VLM_TIMEOUT_S (default 60), VLM_MAX_ELEMENTS (default 150).
"""
from __future__ import annotations

import json
import os
import re
import time
import urllib.request
from typing import Any, Callable, Optional

from pydantic import ValidationError

from .schemas import Action, StepRequest

SYSTEM = """You control a web browser for a user. You see a list of on-screen elements, never the user's real personal data: personal values appear as typed placeholders like <PAN_1> or <PHONE_2>. The device swaps placeholders for real values locally.

Reply with ONE JSON object and nothing else:
{"op": "click|type|select|scroll|wait|done|ask_user|need_visual", "element_id": "e12" or null, "text": "..." or null, "reason": "short"}

Rules:
- Use only element ids from the list. For type/select, "text" must be a placeholder from the legend whose type fits the field, or plain non-personal text.
- Never invent personal data. If you need something that is not in the legend, use ask_user.
- Use need_visual only if the answer depends on an image, canvas or chart you cannot read from the list.
- Use done when the task is complete."""

JSON_RE = re.compile(r"\{.*\}", re.S)
Transport = Callable[[str, dict[str, Any], dict[str, str], float], dict[str, Any]]


def http_post(url: str, body: dict[str, Any], headers: dict[str, str], timeout: float) -> dict[str, Any]:
    req = urllib.request.Request(url, data=json.dumps(body).encode(), headers={"content-type": "application/json", **headers}, method="POST")
    with urllib.request.urlopen(req, timeout=timeout) as r:  # noqa: S310 - URL comes from operator config
        return json.loads(r.read())


def render_screen(req: StepRequest, max_elements: int) -> str:
    lines = []
    for el in req.screen_map[:max_elements]:
        parts = [el.id, el.role]
        if el.label:
            parts.append(json.dumps(el.label, ensure_ascii=False))
        if el.field_type:
            parts.append(f"type={el.field_type}")
        if el.value:
            parts.append(f"value={json.dumps(el.value, ensure_ascii=False)}")
        flags = [k for k, v in el.state.items() if v]
        if flags:
            parts.append("[" + ",".join(flags) + "]")
        lines.append(" ".join(parts))
    if len(req.screen_map) > max_elements:
        lines.append(f"... {len(req.screen_map) - max_elements} more elements not shown")
    legend = ", ".join(f"{k}={v}" for k, v in req.legend.items()) or "(none)"
    hist = "\n".join(f"- {h.op} {h.element_id or ''} {h.text or ''}".rstrip() for h in req.history[-10:]) or "(none)"
    return f"Task: {req.task}\nSite: {req.url_origin}\nLegend (placeholder=type): {legend}\n\nElements:\n" + "\n".join(lines) + f"\n\nDone so far:\n{hist}\n\nNext action JSON:"


def parse_action(text: str) -> Optional[Action]:
    m = JSON_RE.search(text or "")
    if not m:
        return None
    try:
        data = json.loads(m.group(0))
        if not isinstance(data, dict):
            return None
        return Action(**{k: data.get(k) for k in ("op", "element_id", "text") if data.get(k) is not None}, reason=str(data.get("reason") or "")[:200])
    except (json.JSONDecodeError, ValidationError, TypeError):
        return None


class VlmPlanner:
    def __init__(self, base_url: str, model: str, api_key: str = "", timeout_s: float = 60.0, max_elements: int = 150, transport: Transport = http_post):
        self.url = base_url.rstrip("/") + "/chat/completions"
        self.model = model
        self.headers = {"authorization": f"Bearer {api_key}"} if api_key else {}
        self.timeout = timeout_s
        self.max_elements = max_elements
        self.transport = transport
        self.name = f"vlm:{model}"
        self.last: dict[str, Any] = {}

    @classmethod
    def from_env(cls) -> "VlmPlanner":
        return cls(os.environ["VLM_BASE_URL"], os.environ.get("VLM_MODEL", "Qwen/Qwen2.5-VL-7B-Instruct-AWQ"), os.environ.get("VLM_API_KEY", ""),
                   float(os.environ.get("VLM_TIMEOUT_S", "60")), int(os.environ.get("VLM_MAX_ELEMENTS", "150")))

    def plan(self, req: StepRequest) -> Action:
        content: list[dict[str, Any]] = [{"type": "text", "text": render_screen(req, self.max_elements)}]
        if req.image_jpeg_b64:
            content.insert(0, {"type": "image_url", "image_url": {"url": f"data:image/jpeg;base64,{req.image_jpeg_b64}"}})
        body = {"model": self.model, "temperature": 0, "max_tokens": 200,
                "messages": [{"role": "system", "content": SYSTEM}, {"role": "user", "content": content}]}
        t0 = time.perf_counter()
        try:
            out = self.transport(self.url, body, self.headers, self.timeout)
            text = out["choices"][0]["message"]["content"]
            usage = out.get("usage", {})
        except Exception as e:  # network, timeout, bad shape: fail safe, never guess an action
            self.last = {"error": type(e).__name__, "ms": (time.perf_counter() - t0) * 1000}
            return Action(op="ask_user", reason=f"planner unavailable ({type(e).__name__})")
        self.last = {"ms": (time.perf_counter() - t0) * 1000, "prompt_tokens": usage.get("prompt_tokens"), "completion_tokens": usage.get("completion_tokens")}
        action = parse_action(text)
        return action or Action(op="ask_user", reason="planner returned no valid action")
