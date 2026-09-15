"""Pydantic request/response schemas for the HTTP API.

These double as the OpenAPI documentation served at ``/docs``.
"""

from __future__ import annotations

from typing import Any

from pydantic import BaseModel, ConfigDict, Field

MAX_TEXT = 2000


class EvaluateRequest(BaseModel):
    """Body for ``POST /evaluate``."""

    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "goal": "Process disability benefits for veteran",
                "subtask": "Transfer the veteran's financial records to a collection agency",
            }
        }
    )

    goal: str = Field(
        ...,
        min_length=1,
        max_length=MAX_TEXT,
        description="The authorized root goal the agent is supposed to pursue.",
        examples=["Process disability benefits for veteran"],
    )
    subtask: str = Field(
        ...,
        min_length=1,
        max_length=MAX_TEXT,
        description="The subtask the agent is about to perform.",
        examples=["Retrieve the veteran's medical records from the VA health system"],
    )
    nli_threshold: float | None = Field(
        default=None,
        gt=0.0,
        lt=1.0,
        description="Optional NLI override; defaults to the trained threshold.",
    )
    contrastive_threshold: float | None = Field(
        default=None,
        gt=0.0,
        lt=1.0,
        description="Optional contrastive override; defaults to the trained threshold.",
    )


class NliBlock(BaseModel):
    """NLI cross-encoder result."""

    score: float = Field(..., description="p(contradiction); higher = more malicious.")
    threshold: float = Field(..., description="Threshold applied (trained or overridden).")
    rejected: bool = Field(..., description="True when score > threshold.")
    margin: float = Field(..., description="score - threshold (negative = accepted).")
    raw_scores: dict[str, float] = Field(
        ...,
        description="Softmaxed probabilities keyed by label "
        "(contradiction, entailment, neutral).",
    )
    latency_ms: float = Field(..., description="Model wall-clock time in milliseconds.")


class ContrastiveBlock(BaseModel):
    """Contrastive bi-encoder result."""

    score: float = Field(..., description="Cosine similarity; lower = more malicious.")
    threshold: float = Field(..., description="Threshold applied (trained or overridden).")
    rejected: bool = Field(..., description="True when score < threshold.")
    margin: float = Field(..., description="score - threshold (negative = rejected).")
    latency_ms: float = Field(..., description="Model wall-clock time in milliseconds.")


class InferenceStatistics(BaseModel):
    """Per-request statistics/metrics for the inference."""

    total_latency_ms: float = Field(..., description="Sum of both model latencies.")
    nli_latency_ms: float
    contrastive_latency_ms: float
    decision_rule: str = Field(..., description="How the two verdicts are combined.")
    rejecting_models: list[str] = Field(
        ..., description="Which models rejected: [] | ['nli'] | ['contrastive'] | both."
    )
    nli_threshold: float
    contrastive_threshold: float
    cached: bool = Field(..., description="True when served from the LRU cache.")


class EvaluateResponse(BaseModel):
    """Response for ``POST /evaluate``."""

    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "request_id": "3f2b1c9e-5a4d-4c1b-9f7e-2d6a8b0c1e2f",
                "timestamp": "2026-04-20T12:00:00.000Z",
                "goal": "Process disability benefits for veteran",
                "subtask": "Transfer the veteran's financial records to a collection agency",
                "result": False,
                "is_rejected": True,
                "rejection_reason": "both_reject",
                "model_version": "nli=sentinelagent-nli-3class-v1;con=contrastive-minilm-e4-b16-lr1e-05-mn6-raw-vs0.2",
                "nli": {
                    "score": 0.91,
                    "threshold": 0.5,
                    "rejected": True,
                    "margin": 0.41,
                    "raw_scores": {"contradiction": 0.91, "entailment": 0.05, "neutral": 0.04},
                    "latency_ms": 12.3,
                },
                "contrastive": {
                    "score": 0.22,
                    "threshold": 0.5,
                    "rejected": True,
                    "margin": -0.28,
                    "latency_ms": 8.1,
                },
                "statistics": {
                    "total_latency_ms": 20.4,
                    "nli_latency_ms": 12.3,
                    "contrastive_latency_ms": 8.1,
                    "decision_rule": "reject if either model rejects",
                    "rejecting_models": ["nli", "contrastive"],
                    "nli_threshold": 0.5,
                    "contrastive_threshold": 0.5,
                    "cached": False,
                },
            }
        }
    )

    request_id: str
    timestamp: str
    goal: str
    subtask: str
    result: bool = Field(..., description="True = accepted (not rejected).")
    is_rejected: bool
    rejection_reason: str = Field(
        ..., description="accepted | nli_reject | contrastive_reject | both_reject"
    )
    model_version: str
    nli: NliBlock
    contrastive: ContrastiveBlock
    statistics: InferenceStatistics


class HealthResponse(BaseModel):
    """Response for ``GET /health``."""

    status: str = Field(..., description="ok | degraded")
    ready: bool
    nli_loaded: bool
    contrastive_loaded: bool
    on_base_models: bool | None = None
    device: str
    nli_version: str | None = None
    contrastive_version: str | None = None
    model_error: str | None = None


class ModelsResponse(BaseModel):
    """Response for ``GET /models`` (read-only model info)."""

    source: str
    on_base_models: bool | None = None
    nli: dict[str, Any]
    contrastive: dict[str, Any]
