"""``GET /models`` — read-only model info (versions, thresholds, metrics)."""

from __future__ import annotations

from fastapi import APIRouter, Request

from ..schemas import ModelsResponse

router = APIRouter(tags=["model info"])


@router.get("/models", response_model=ModelsResponse, summary="Model information")
def models_info(request: Request) -> ModelsResponse:
    state = request.app.state
    cfg = state.model_config or {}
    models = getattr(state, "models", None)

    nli = dict(cfg.get("nli") or {})
    contrastive = dict(cfg.get("contrastive") or {})

    if models is not None:
        nli["resolved_source"] = models.nli_source
        contrastive["resolved_source"] = models.contrastive_source

    return ModelsResponse(
        source="defaults" if cfg.get("_missing") else "model_config.json",
        on_base_models=models.on_base_models if models else None,
        nli=nli,
        contrastive=contrastive,
    )
