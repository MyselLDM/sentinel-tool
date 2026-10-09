"""``POST /debug/encode`` — inspect the models' internal encoding.

Debug-only companion to ``POST /evaluate``: same inputs, but it returns *what
the models see* instead of just the verdict — the framed text, the subword
tokens and input ids, the goal/subtask embeddings, optional per-token vectors,
and the raw (pre-softmax) NLI logits.

The router stays thin: all model access lives in ``app.service`` (``inspect_*``).
"""

from __future__ import annotations

import asyncio

from fastapi import APIRouter, HTTPException, Request

from .. import service
from ..schemas import DebugEncodeRequest, DebugEncodeResponse

router = APIRouter(tags=["debug"])


@router.post(
    "/debug/encode",
    response_model=DebugEncodeResponse,
    summary="Inspect model encodings (tokens, vectors, pre-softmax logits)",
    description=(
        "Runs the same preprocessing and models as `POST /evaluate` but returns "
        "the intermediate encoding: framed premise/hypothesis, subword tokens and "
        "ids, the goal/subtask embeddings, optional per-token hidden vectors, and "
        "the raw (pre-softmax) logits. Intended for debugging, not production "
        "traffic — responses can be large when `token_vectors` is true."
    ),
)
async def debug_encode(request: Request, body: DebugEncodeRequest) -> DebugEncodeResponse:
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

    # Mirror /evaluate: the two models are independent, so run them concurrently
    # in worker threads (torch inference is blocking), bounded by the semaphore.
    async with state.semaphore:
        nli_coro = asyncio.to_thread(
            service.inspect_nli,
            models.nli,
            body.goal,
            body.subtask,
            nli_threshold,
            token_vectors=body.token_vectors,
            dims=body.embedding_dims,
        )
        contrastive_coro = asyncio.to_thread(
            service.inspect_contrastive,
            models.contrastive,
            body.goal,
            body.subtask,
            contrastive_threshold,
            None,
            models.include_decomposed,
            token_vectors=body.token_vectors,
            dims=body.embedding_dims,
        )
        nli_result, contrastive_result = await asyncio.gather(nli_coro, contrastive_coro)

    return DebugEncodeResponse(
        goal=body.goal,
        subtask=body.subtask,
        token_vectors=body.token_vectors,
        embedding_dims=body.embedding_dims,
        model_version=f"nli={models.nli_version};con={models.contrastive_version}",
        nli=nli_result,
        contrastive=contrastive_result,
    )
