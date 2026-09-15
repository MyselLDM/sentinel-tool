"""Configuration for the Sentinel inference service.

Settings come from environment variables (optionally a ``.env`` file in
``fastapi/``):

===========================  ==================================================
``MODELS_DIR``               Directory holding the fine-tuned model folders
                             (default: ``fastapi/.models``).
``MODEL_CONFIG_PATH``        Path to ``model_config.json`` (default:
                             ``fastapi/model_config.json``).
``INFERENCE_DEVICE``         ``"cpu"`` or ``"cuda"`` (default: ``cpu``).
``INFERENCE_MAX_CONCURRENCY`` Max concurrent inferences (default: CPU count).
``CACHE_SIZE``               LRU cache entries (default: 1024; 0 disables).
===========================  ==================================================
"""

from __future__ import annotations

import json
import os
from functools import lru_cache
from pathlib import Path
from typing import Any

from pydantic_settings import BaseSettings, SettingsConfigDict

# .../fastapi  (this file lives in fastapi/app/)
BASE_DIR = Path(__file__).resolve().parent.parent


class Settings(BaseSettings):
    """Runtime settings (env-driven)."""

    model_config = SettingsConfigDict(
        env_file=".env", env_file_encoding="utf-8", extra="ignore"
    )

    models_dir: str = str(BASE_DIR / ".models")
    model_config_path: str = str(BASE_DIR / "model_config.json")
    inference_device: str = "cpu"
    inference_max_concurrency: int = max(1, os.cpu_count() or 2)
    cache_size: int = 1024


@lru_cache
def get_settings() -> Settings:
    """Return the process-wide settings singleton."""
    return Settings()


def load_model_config(path: str | None = None) -> dict[str, Any]:
    """Load ``model_config.json`` (model dirs, versions, thresholds, metrics).

    Returns a dict with empty ``nli``/``contrastive`` sections if the file is
    absent, so the service can still start (and fall back to base models).
    """
    resolved = Path(path or get_settings().model_config_path)
    if not resolved.exists():
        return {"nli": {}, "contrastive": {}, "_missing": True}
    with resolved.open("r", encoding="utf-8") as fh:
        return json.load(fh)
