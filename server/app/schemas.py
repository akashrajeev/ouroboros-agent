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
    bbox: tuple[float, float, float, float]


class HistoryItem(BaseModel):
    op: Op
    element_id: Optional[str] = None
    text: Optional[str] = None


class StepRequest(BaseModel):
    session_id: str
    task: str = Field(max_length=4000)
    url_origin: str = ""
    screen_map: list[Element]
    legend: dict[str, str] = Field(default_factory=dict)
    history: list[HistoryItem] = Field(default_factory=list)
    image_jpeg_b64: Optional[str] = None


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


class StepResponse(BaseModel):
    action: Action
    metrics: StepMetrics
