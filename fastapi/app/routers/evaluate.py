"""``POST /evaluate`` — the core inference endpoint."""

from __future__ import annotations

import asyncio
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, Request

from .. import service
from ..schemas import EvaluateRequest, EvaluateResponse

router = APIRouter(tags=["inference"])


def _finalize(payload: dict, *, cached: bool) -> dict:
    """Add the per-request fields (id, timestamp) and stamp cache status."""
    result = dict(payload)
    result["statistics"] = {**payload["statistics"], "cached": cached}
    result["request_id"] = str(uuid.uuid4())
    result["timestamp"] = datetime.now(timezone.utc).isoformat()
    return result


@router.post(
    "/evaluate",
    response_model=EvaluateResponse,
    summary="Evaluate a goal/subtask pair",
    description=(
        "Runs the NLI cross-encoder and the contrastive bi-encoder on a "
        "`goal`/`subtask` pair and returns both scores, the combined decision, "
        "and per-request statistics (latencies, margins, thresholds)."
    ),
)
async def evaluate(request: Request, body: EvaluateRequest) -> EvaluateResponse:
    state = request.app.state
    models = getattr(state, "models", None)
    if models is None:
        raise HTTPException(status_code=503, detail="Models are not loaded yet")

    nli_threshold = (
        body.nli_threshold if body.nli_threshold is not None else models.nli_threshold
    )
    contrastive_threshold = (
        body.contrastive_threshold
        if body.contrastive_threshold is not None
        else models.contrastive_threshold
    )

    # Cache key: identical inputs + thresholds return the same verdict.
    key = (body.goal, body.subtask, nli_threshold, contrastive_threshold)
    hit = state.cache.get(key)
    if hit is not None:
        return EvaluateResponse(**_finalize(hit, cached=True))

    # The two models are independent; run them concurrently in worker threads
    # (torch inference is blocking), bounded by the shared semaphore.
    async with state.semaphore:
        nli_coro = asyncio.to_thread(
            service.evaluate_nli, models.nli, body.goal, body.subtask, nli_threshold
        )
        contrastive_coro = asyncio.to_thread(
            service.evaluate_contrastive,
            models.contrastive,
            body.goal,
            body.subtask,
            contrastive_threshold,
            None,
            models.include_decomposed,
        )
        nli_result, contrastive_result = await asyncio.gather(nli_coro, contrastive_coro)

    payload = service.build_result(
        goal=body.goal,
        subtask=body.subtask,
        nli=nli_result,
        contrastive=contrastive_result,
        nli_version=models.nli_version,
        contrastive_version=models.contrastive_version,
        cached=False,
    )
    state.cache.set(key, payload)
    return EvaluateResponse(**_finalize(payload, cached=False))
