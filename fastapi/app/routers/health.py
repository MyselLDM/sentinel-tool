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
    on_base = bool(models is not None and models.on_base_models)
    # "Ready" means *trained* models are loaded. Running on the base models (only
    # reachable via ALLOW_BASE_FALLBACK=1) is degraded, not ready: report it so
    # downstream checks — express /readyz pings this endpoint — catch it.
    ready = models is not None and not on_base
    status = "ok" if ready else "degraded"

    payload = HealthResponse(
        status=status,
        ready=ready,
        nli_loaded=models is not None,
        contrastive_loaded=models is not None,
        on_base_models=models.on_base_models if models is not None else None,
        device=getattr(state.settings, "inference_device", "cpu"),
        nli_version=models.nli_version if models is not None else None,
        contrastive_version=models.contrastive_version if models is not None else None,
        model_error=getattr(state, "model_error", None)
        or ("running on untrained base models" if on_base else None),
    )

    if not ready:
        return JSONResponse(status_code=503, content=payload.model_dump())
    return payload
