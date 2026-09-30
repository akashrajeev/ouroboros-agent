from __future__ import annotations

import base64
import os
import time

from fastapi import FastAPI, HTTPException

from .guard import raw_pii_types
from .planner import Planner, StubPlanner
from .schemas import StepMetrics, StepRequest, StepResponse

app = FastAPI(title="ouroboros-agent server", version="0.1.0")
def make_planner() -> Planner:
    if os.environ.get("PLANNER") == "chain":
        from .provider_chain import ProviderChain
        return ProviderChain.from_env()
    if os.environ.get("PLANNER") == "general":
        from .general import GeneralPlanner
        return GeneralPlanner()
    if os.environ.get("PLANNER") == "vlm":
        from .vlm import VlmPlanner
        return VlmPlanner.from_env()
    return StubPlanner()


planner: Planner = make_planner()


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok", "planner": planner.name}


@app.post("/step", response_model=StepResponse)
def step(req: StepRequest) -> StepResponse:
    t0 = time.perf_counter()
    text_view = req.model_dump_json(exclude={"image_jpeg_b64"})
    leaked = raw_pii_types(text_view)
    if leaked:
        # Never echo the values back.
        raise HTTPException(status_code=422, detail={"error": "raw_pii_in_request", "types": leaked})
    image_bytes = len(base64.b64decode(req.image_jpeg_b64)) if req.image_jpeg_b64 else 0
    action = planner.plan(req)
    return StepResponse(
        action=action,
        metrics=StepMetrics(
            server_ms=(time.perf_counter() - t0) * 1000,
            input_chars=len(text_view),
            image_bytes=image_bytes,
            planner=planner.name,
            redaction_scheme=req.redaction.scheme if req.redaction else None,
            masked_elements=req.redaction.masked_element_count if req.redaction else None,
            planner_ms=getattr(planner, "last", {}).get("ms"),
            prompt_tokens=getattr(planner, "last", {}).get("prompt_tokens"),
            completion_tokens=getattr(planner, "last", {}).get("completion_tokens"),
        ),
    )
