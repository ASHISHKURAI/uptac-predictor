"""Shared-secret authentication for server-to-server calls."""

from __future__ import annotations

import hmac

from fastapi import Depends, Header, HTTPException, status

from .config import Settings, get_settings


def verify_processor_token(
    x_processor_token: str | None = Header(default=None, alias="X-Processor-Token"),
    settings: Settings = Depends(get_settings),
) -> None:
    """Rejects requests whose X-Processor-Token does not match PROCESSOR_TOKEN (constant-time)."""
    if not settings.processor_token:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Processor is not configured: set the PROCESSOR_TOKEN environment variable.",
        )
    supplied = (x_processor_token or "").encode("utf-8")
    expected = settings.processor_token.encode("utf-8")
    if not supplied or not hmac.compare_digest(supplied, expected):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or missing X-Processor-Token.")
