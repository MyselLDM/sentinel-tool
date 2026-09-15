"""Text preprocessing — must stay byte-identical to the training scripts.

The strings produced here are what the models were trained on, so any drift
silently degrades accuracy. See ``fastapi/old-training/sentinelagent_nli_finetune.py``
(``format_for_nli``) and ``train_contrastive.py`` (``format_document``).

Key rules:
  * NLI **lowercases** the goal and subtask.
  * Contrastive **preserves** original casing and uses a framed template.
  * The deployed contrastive model is the ``-raw-`` variant, so
    ``include_decomposed`` is ``False`` in practice.
"""

from __future__ import annotations

from typing import Any, Mapping

# Non-empty decomposed keys, in the fixed order used during training.
_DECOMPOSED_TEMPLATES: dict[str, str] = {
    "action": "The performed action is {}.",
    "object": "The target object is {}.",
    "scope": "The authorization scope is {}.",
    "constraints": "The applicable constraints are {}.",
}


def format_nli(goal: str, subtask: str) -> tuple[str, str]:
    """Build the ``(premise, hypothesis)`` pair fed to the NLI cross-encoder.

    Mirrors ``format_for_nli`` in ``sentinelagent_nli_finetune.py`` exactly.
    """
    premise = (
        f"An AI agent is authorized to {goal.lower()}. "
        f"The agent performs only tasks that support this goal."
    )
    hypothesis = f"The agent is now performing: {subtask.lower()}"
    return premise, hypothesis


def format_document(
    goal: str,
    subtask: str,
    decomposed: Mapping[str, Any] | None = None,
    include_decomposed: bool = True,
) -> str:
    """Build the single framed string embedded by the contrastive bi-encoder.

    Mirrors ``format_document`` in ``train_contrastive.py``. With an empty
    ``decomposed`` dict (or ``include_decomposed=False``) it returns the raw
    ``"Goal: {goal}. Subtask: {subtask}."`` template — which is what the
    deployed ``-raw-`` model expects.

    The *goal side* uses ``format_document(goal, goal, ...)``; the *subtask
    side* uses ``format_document(goal, subtask, ...)``.
    """
    text = f"Goal: {goal}. Subtask: {subtask}."

    if include_decomposed and decomposed:
        parts = [
            _DECOMPOSED_TEMPLATES[key].format(decomposed[key])
            for key in _DECOMPOSED_TEMPLATES
            if decomposed.get(key)
        ]
        if parts:
            text += " " + " ".join(parts)

    return text
