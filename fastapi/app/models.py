"""Model loading for the Sentinel inference service.

Loads the NLI cross-encoder and the contrastive bi-encoder eagerly at startup
(see ``main.py`` lifespan). If a fine-tuned ``model_dir`` is missing, it falls
back to the configured base model so the service still runs in development.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

logger = logging.getLogger("sentinel.models")

DEFAULT_NLI_BASE = "cross-encoder/nli-MiniLM2-L6-H768"
DEFAULT_CONTRASTIVE_BASE = "all-MiniLM-L12-v2"


@dataclass
class LoadedModels:
    """The in-memory models plus the resolved configuration."""

    nli: Any
    contrastive: Any
    nli_version: str
    contrastive_version: str
    nli_source: str
    contrastive_source: str
    on_base_models: bool
    nli_threshold: float
    contrastive_threshold: float
    include_decomposed: bool
    model_config: dict[str, Any] = field(default_factory=dict)


def _resolve(
    model_dir: str | None, base: str | None, models_dir: Path
) -> tuple[str, bool]:
    """Resolve a configured ``model_dir`` to an existing path or the base id.

    Returns ``(path_or_hf_id, used_base_fallback)``.
    """
    if model_dir:
        candidate = Path(model_dir)
        if not candidate.is_absolute():
            candidate = models_dir / model_dir
        if candidate.exists():
            return str(candidate), False
        logger.warning("model_dir %r not found under %s", model_dir, models_dir)
    if base:
        logger.warning("Falling back to base model %r", base)
        return base, True
    raise FileNotFoundError("Neither model_dir nor base is configured")


def load_models(settings: Any, model_config: dict[str, Any]) -> LoadedModels:
    """Load both models and return them ready for inference.

    Imports ``sentence_transformers`` lazily so unit tests of the pure logic
    (``app.service``) do not require the heavy dependency.
    """
    from sentence_transformers import CrossEncoder, SentenceTransformer

    models_dir = Path(settings.models_dir)
    nli_cfg = model_config.get("nli") or {}
    con_cfg = model_config.get("contrastive") or {}

    nli_path, nli_on_base = _resolve(
        nli_cfg.get("model_dir"), nli_cfg.get("base", DEFAULT_NLI_BASE), models_dir
    )
    con_path, con_on_base = _resolve(
        con_cfg.get("model_dir"),
        con_cfg.get("base", DEFAULT_CONTRASTIVE_BASE),
        models_dir,
    )

    logger.info("Loading NLI cross-encoder from %s", nli_path)
    nli = CrossEncoder(nli_path, device=settings.inference_device)

    logger.info("Loading contrastive bi-encoder from %s", con_path)
    contrastive = SentenceTransformer(con_path, device=settings.inference_device)

    # Warm up so the first real request does not pay the cold-start cost.
    nli.predict([("warmup premise", "warmup hypothesis")])
    contrastive.encode(["warmup"], normalize_embeddings=True)

    return LoadedModels(
        nli=nli,
        contrastive=contrastive,
        nli_version=nli_cfg.get("version") or Path(nli_path).name,
        contrastive_version=con_cfg.get("version") or Path(con_path).name,
        nli_source=nli_path,
        contrastive_source=con_path,
        on_base_models=bool(nli_on_base or con_on_base),
        nli_threshold=float(nli_cfg.get("threshold", 0.5)),
        contrastive_threshold=float(con_cfg.get("threshold", 0.5)),
        include_decomposed=bool(con_cfg.get("include_decomposed", False)),
        model_config=model_config,
    )
