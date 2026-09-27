"""Wire schemas. Mirror packages/core types. The server only ever sees placeholders."""
from __future__ import annotations

from typing import Literal, Optional

from pydantic import BaseModel, Field

Op = Literal["click", "type", "select", "scroll", "wait", "done", "ask_user", "need_visual"]


class Element(BaseModel):
    id: str = Field(pattern=r"^e\d+$")
    role: str
    label: str = ""
    field_type: Optional[str] = None
    value: str = ""
    state: dict[str, bool] = Field(default_factory=dict)
    options: Optional[list[str]] = None
    bbox: tuple[float, float, float, float]


class HistoryItem(BaseModel):
    op: Op
    element_id: Optional[str] = None
    text: Optional[str] = None


class MaskedElement(BaseModel):
    element_id: str
    tokens: list[str]


class MaskedImageScheme(BaseModel):
    encoding: Literal["jpeg"]
    method: str
    detections: int = 0
    re_ocr_gated: bool = False


class RedactionManifest(BaseModel):
    """Explicit redaction-scheme declaration (payload v2).

    The server must process the sanitized context ACCORDING TO THIS scheme:
    placeholders are opaque stand-ins for values that never leave the device;
    it may reference them only by token, only in type/select text, and must
    never invent, guess, or request the real values behind them.
    """

    scheme: str
    placeholder_format: str = "<TYPE_N>"
    legend: dict[str, str] = Field(default_factory=dict)
    masked_elements: list[MaskedElement] = Field(default_factory=list)
    masked_element_count: int = 0
    opaque_regions: int = 0
    task_tokens: list[str] = Field(default_factory=list)
    image: Optional[MaskedImageScheme] = None


class SemanticHint(BaseModel):
    label: Literal["login", "registration", "checkout", "search", "error"]
    score: float = Field(ge=-1, le=1)
    margin: float = Field(ge=0, le=2)


class StepRequest(BaseModel):
    payload_version: int = 1
    session_id: str
    task: str = Field(max_length=4000)
    url_origin: str = ""
    screen_map: list[Element]
    # v1 field; kept for older devices. In v2, redaction.legend is authoritative.
    legend: dict[str, str] = Field(default_factory=dict)
    redaction: Optional[RedactionManifest] = None
    history: list[HistoryItem] = Field(default_factory=list)
    image_jpeg_b64: Optional[str] = None
    semantic_hint: Optional[SemanticHint] = None

    def model_post_init(self, __context) -> None:
        if self.redaction is not None:
            if not self.legend:
                # v2 devices may rely on the manifest alone.
                self.legend = dict(self.redaction.legend)
            elif self.redaction.legend and self.redaction.legend != self.legend:
                raise ValueError("legend_mismatch: redaction.legend and legend disagree")
            if self.payload_version < 2:
                raise ValueError("payload_version must be >= 2 when redaction is present")


class Action(BaseModel):
    op: Op
    element_id: Optional[str] = None
    text: Optional[str] = None
    reason: str = ""


class StepMetrics(BaseModel):
    server_ms: float
    input_chars: int
    image_bytes: int
    planner: str
    # The redaction scheme this request declared and the server honored (None = legacy v1).
    redaction_scheme: Optional[str] = None
    masked_elements: Optional[int] = None
    planner_ms: Optional[float] = None
    prompt_tokens: Optional[int] = None
    completion_tokens: Optional[int] = None


class StepResponse(BaseModel):
    action: Action
    metrics: StepMetrics
