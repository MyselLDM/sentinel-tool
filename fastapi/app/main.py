"""FastAPI application entrypoint.

Run with::

    # from the fastapi/ directory
    uvicorn app.main:app --reload --port 8000

Models are loaded once at startup (lifespan). If loading fails the service
still boots; ``/evaluate`` then returns 503 and ``/health`` reports the error.
"""

from __future__ import annotations

import asyncio
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI

from .cache import LRUCache
from .config import get_settings, load_model_config
from .models import load_models
from .routers import evaluate as evaluate_router
from .routers import health as health_router
from .routers import models_info as models_info_router

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s: %(message)s",
)
logger = logging.getLogger("sentinel")


@asynccontextmanager
async def lifespan(app: FastAPI):
    settings = get_settings()
    model_config = load_model_config()

    app.state.settings = settings
    app.state.model_config = model_config
    app.state.cache = LRUCache(settings.cache_size)
    app.state.semaphore = asyncio.Semaphore(settings.inference_max_concurrency)
    app.state.models = None
    app.state.model_error = None

    try:
        app.state.models = load_models(settings, model_config)
        logger.info(
            "Models ready (nli=%s, contrastive=%s, base=%s, device=%s)",
            app.state.models.nli_version,
            app.state.models.contrastive_version,
            app.state.models.on_base_models,
            settings.inference_device,
        )
    except Exception as exc:  # noqa: BLE001 - report and keep serving /health
        app.state.model_error = f"{type(exc).__name__}: {exc}"
        logger.exception("Model loading failed; /evaluate will return 503")

    yield


app = FastAPI(
    title="Sentinel Inference Service",
    description=(
        "Dual-model security evaluation: NLI cross-encoder "
        "(`cross-encoder/nli-MiniLM2-L6-H768`) + contrastive bi-encoder "
        "(`all-MiniLM-L12-v2`). See `README.md` for usage."
    ),
    version="0.1.0",
    lifespan=lifespan,
)

app.include_router(health_router.router)
app.include_router(models_info_router.router)
app.include_router(evaluate_router.router)
