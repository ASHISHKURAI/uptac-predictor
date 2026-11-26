"""Dispatches a document to the right extractor."""

from __future__ import annotations

import time

from .config import Settings
from .extract_pdf import extract_pdf
from .extract_tabular import extract_csv, extract_excel
from .filetypes import detect_kind
from .models import ExtractionError, ExtractionResult


def extract_document(data: bytes, file_name: str, settings: Settings, deadline: float | None = None) -> ExtractionResult:
    """Validates and extracts a document. Raises ExtractionError with an admin-safe message."""
    if len(data) > settings.max_file_bytes:
        raise ExtractionError(f"The file is larger than the {settings.max_file_mb:g} MB limit (MAX_FILE_MB).")
    if deadline is None:
        deadline = time.monotonic() + settings.job_timeout_seconds
    kind = detect_kind(file_name, data)
    if kind == "pdf":
        return extract_pdf(data, file_name, max_pages=settings.max_pdf_pages, deadline=deadline)
    if kind == "csv":
        return extract_csv(data, file_name)
    return extract_excel(data, file_name, kind)
