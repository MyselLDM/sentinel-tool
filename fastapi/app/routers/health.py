"""``GET /health`` — liveness + readiness (are the models loaded?)."""

from __future__ import annotations

from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse

from ..schemas import HealthResponse

router = APIRouter(tags=["ops"])


@router.get("/health", response_model=HealthResponse, summary="Liveness / readiness")
def health(request: Request):
    state = request.app.state
    models = getattr(state, "models", None)
    ready = models is not None

    payload = HealthResponse(
        status="ok" if ready else "degraded",
        ready=ready,
        nli_loaded=ready,
        contrastive_loaded=ready,
        on_base_models=models.on_base_models if ready else None,
        device=getattr(state.settings, "inference_device", "cpu"),
        nli_version=models.nli_version if ready else None,
        contrastive_version=models.contrastive_version if ready else None,
        model_error=getattr(state, "model_error", None),
    )

    if not ready:
        return JSONResponse(status_code=503, content=payload.model_dump())
    return payload
