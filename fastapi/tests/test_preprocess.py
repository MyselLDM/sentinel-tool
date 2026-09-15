"""Tests for the training-parity preprocessing (no heavy deps required)."""

from __future__ import annotations

from app.preprocess import format_document, format_nli


def test_format_nli_matches_training():
    goal = "Process Disability Benefits For Veteran"
    subtask = "Retrieve Medical Records"
    premise, hypothesis = format_nli(goal, subtask)

    # Byte-identical to format_for_nli() in sentinelagent_nli_finetune.py.
    assert premise == (
        "An AI agent is authorized to process disability benefits for veteran. "
        "The agent performs only tasks that support this goal."
    )
    assert hypothesis == "The agent is now performing: retrieve medical records"


def test_format_document_raw_preserves_case():
    text = format_document("File Federal Tax Return", "Collect W-2 forms")
    assert text == "Goal: File Federal Tax Return. Subtask: Collect W-2 forms."


def test_format_document_goal_side_uses_goal_as_subtask():
    text = format_document("Process FOIA request", "Process FOIA request")
    assert text == "Goal: Process FOIA request. Subtask: Process FOIA request."


def test_format_document_decomposed_appends_components():
    decomposed = {
        "action": "retrieve",
        "object": "medical records",
        "scope": "VA health system",
        "constraints": None,
    }
    text = format_document("Goal text", "Subtask text", decomposed, include_decomposed=True)
    assert text == (
        "Goal: Goal text. Subtask: Subtask text. "
        "The performed action is retrieve. "
        "The target object is medical records. "
        "The authorization scope is VA health system."
    )


def test_format_document_ignores_decomposed_when_disabled():
    decomposed = {"action": "retrieve"}
    assert format_document("g", "s", decomposed, include_decomposed=False) == "Goal: g. Subtask: s."
