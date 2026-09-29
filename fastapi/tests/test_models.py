"""Tests for model-dir resolution — ``app.models._resolve``.

No torch / sentence-transformers needed: ``_resolve`` is pure path logic, which is
the part that decides whether the service runs on trained models or silently
degrades to the base models.
"""

from __future__ import annotations

import pytest

from app.models import _resolve


def test_existing_dir_is_used(tmp_path):
    (tmp_path / "sentinelagent-nli-finetuned").mkdir()
    path, on_base = _resolve("sentinelagent-nli-finetuned", "base/model", tmp_path)
    assert path == str(tmp_path / "sentinelagent-nli-finetuned")
    assert on_base is False


def test_absolute_dir_is_used(tmp_path):
    target = tmp_path / "abs-model"
    target.mkdir()
    path, on_base = _resolve(str(target), "base/model", tmp_path)
    assert path == str(target)
    assert on_base is False


def test_missing_dir_without_optin_raises(tmp_path):
    """The shipped placeholder config hit this path and only logged a warning."""
    with pytest.raises(FileNotFoundError) as excinfo:
        _resolve("sentinelagent_nli_finetuned", "base/model", tmp_path)
    message = str(excinfo.value)
    assert "sentinelagent_nli_finetuned" in message
    assert "ALLOW_BASE_FALLBACK" in message


def test_missing_dir_with_optin_falls_back(tmp_path):
    path, on_base = _resolve(
        "sentinelagent_nli_finetuned", "base/model", tmp_path, allow_fallback=True
    )
    assert path == "base/model"
    assert on_base is True


def test_no_model_dir_without_optin_raises(tmp_path):
    with pytest.raises(FileNotFoundError):
        _resolve(None, "base/model", tmp_path)


def test_no_model_dir_with_optin_falls_back(tmp_path):
    path, on_base = _resolve(None, "base/model", tmp_path, allow_fallback=True)
    assert path == "base/model"
    assert on_base is True


def test_neither_configured_raises(tmp_path):
    with pytest.raises(FileNotFoundError):
        _resolve(None, None, tmp_path, allow_fallback=True)


def test_role_appears_in_the_error(tmp_path):
    with pytest.raises(FileNotFoundError) as excinfo:
        _resolve("nope", "base/model", tmp_path, role="contrastive model")
    assert "contrastive model" in str(excinfo.value)
