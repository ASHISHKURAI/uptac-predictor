"""PDF table extraction: PyMuPDF first, optional Camelot fallback."""

from __future__ import annotations

import importlib.util
import logging
import os
import tempfile
import time
from typing import Any

import pymupdf

from .models import ExtractionError, ExtractionResult, ExtractionTimeoutError, Table
from .tables import clean_rows, dataframe_to_rows, merge_multirow_header

logger = logging.getLogger(__name__)

# PyMuPDF >= 1.27 prints an advisory about the optional pymupdf_layout package to stdout.
if hasattr(pymupdf, "no_recommend_layout"):
    pymupdf.no_recommend_layout()

SCANNED_WARNING = (
    "PDF appears to be scanned (no text layer); OCR is not supported – upload the CSV/XLSX version or a text PDF"
)


def camelot_available() -> bool:
    return importlib.util.find_spec("camelot") is not None


def _check_deadline(deadline: float | None) -> None:
    if deadline is not None and time.monotonic() > deadline:
        raise ExtractionTimeoutError("Processing took too long and was stopped (JOB_TIMEOUT_SECONDS).")


def _open(data: bytes) -> pymupdf.Document:
    try:
        doc = pymupdf.open(stream=data, filetype="pdf")
    except Exception as exc:  # PyMuPDF raises several exception types for corrupt files
        raise ExtractionError(f"The PDF could not be opened: {exc}") from exc
    if doc.needs_pass:
        doc.close()
        raise ExtractionError("The PDF is password protected. Upload an unprotected copy.")
    return doc


def _table_rows(table: Any) -> list[list[str]]:
    rows: list[list[Any]] = table.extract() or []
    header = getattr(table, "header", None)
    # When PyMuPDF detects the header row outside the table body it is not part of extract().
    if header is not None and getattr(header, "external", False) and getattr(header, "names", None):
        rows = [list(header.names), *rows]
    return merge_multirow_header(clean_rows(rows))


def _pymupdf_tables(doc: pymupdf.Document, strategy: str, deadline: float | None, warnings: list[str]) -> list[Table]:
    tables: list[Table] = []
    for index, page in enumerate(doc):
        _check_deadline(deadline)
        page_no = index + 1
        try:
            found = page.find_tables(strategy=strategy)
        except Exception as exc:  # keep going – one bad page must not fail the document
            warnings.append(f"Page {page_no}: table detection failed ({exc}).")
            logger.warning("find_tables failed on page %s: %s", page_no, exc)
            continue
        for table in found.tables:
            rows = _table_rows(table)
            if rows:
                tables.append(Table(rows=rows, page=page_no))
    return tables


def _camelot_tables(data: bytes, deadline: float | None, warnings: list[str]) -> list[Table]:
    import camelot  # type: ignore[import-not-found]  # optional dependency

    tables: list[Table] = []
    fd, path = tempfile.mkstemp(suffix=".pdf")
    try:
        with os.fdopen(fd, "wb") as handle:
            handle.write(data)
        for flavor in ("lattice", "stream"):
            _check_deadline(deadline)
            try:
                found = camelot.read_pdf(path, pages="1-end", flavor=flavor)
            except Exception as exc:
                warnings.append(f"Camelot ({flavor}) failed: {exc}")
                continue
            for t in found:
                rows = merge_multirow_header(dataframe_to_rows(t.df))
                if rows:
                    page = int(t.page) if str(t.page).isdigit() else None
                    tables.append(Table(rows=rows, page=page))
            if tables:
                break
    finally:
        try:
            os.remove(path)
        except OSError:
            pass
    return tables


def extract_pdf(data: bytes, file_name: str, *, max_pages: int, deadline: float | None = None) -> ExtractionResult:
    doc = _open(data)
    try:
        pages = doc.page_count
        if pages == 0:
            raise ExtractionError("The PDF has no pages.")
        if pages > max_pages:
            raise ExtractionError(f"The PDF has {pages} pages; the limit is {max_pages} (MAX_PDF_PAGES).")

        warnings: list[str] = []
        has_text = False
        for page in doc:
            _check_deadline(deadline)
            if page.get_text("text").strip():
                has_text = True
                break
        if not has_text:
            return ExtractionResult(tables=[], extractor="pymupdf", file_name=file_name, pages=pages, warnings=[SCANNED_WARNING])

        tables = _pymupdf_tables(doc, "lines", deadline, warnings)
        extractor = "pymupdf"
        if not tables:
            tables = _pymupdf_tables(doc, "text", deadline, warnings)
            if tables:
                warnings.append("No ruled tables found; used text-alignment table detection – please review carefully.")
        if not tables and camelot_available():
            tables = _camelot_tables(data, deadline, warnings)
            if tables:
                extractor = "camelot"
        if not tables:
            warnings.append("No tables were detected in the PDF.")
        return ExtractionResult(tables=tables, extractor=extractor, file_name=file_name, pages=pages, warnings=warnings)
    finally:
        doc.close()
