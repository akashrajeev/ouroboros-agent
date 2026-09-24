from __future__ import annotations

import base64
import time

from fastapi import FastAPI, HTTPException

from .guard import raw_pii_types
from .planner import Planner, StubPlanner
from .schemas import StepMetrics, StepRequest, StepResponse

app = FastAPI(title="ouroboros-agent server", version="0.1.0")
planner: Planner = StubPlanner()


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
        ),
    )
