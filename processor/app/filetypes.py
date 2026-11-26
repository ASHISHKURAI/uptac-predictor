"""File type validation by extension AND magic bytes."""

from __future__ import annotations

from pathlib import PurePath

from .models import FileKind, UnsupportedFileError

PDF_MAGIC = b"%PDF"
ZIP_MAGIC = b"PK\x03\x04"
OLE_MAGIC = b"\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1"

_EXTENSIONS: dict[str, FileKind] = {".pdf": "pdf", ".csv": "csv", ".xlsx": "xlsx", ".xls": "xls"}


def detect_kind(file_name: str, data: bytes) -> FileKind:
    """Returns the file kind, or raises UnsupportedFileError if the type is not allowed
    or the content does not match the extension."""
    suffix = PurePath(file_name or "").suffix.lower()
    kind = _EXTENSIONS.get(suffix)
    if kind is None:
        raise UnsupportedFileError(f"Unsupported file type '{suffix or 'unknown'}'. Upload a PDF, CSV, XLSX or XLS file.")
    if not data:
        raise UnsupportedFileError("The file is empty.")
    head = data[:8]
    if kind == "pdf" and not _find_pdf_header(data):
        raise UnsupportedFileError("The file has a .pdf extension but is not a PDF document.")
    if kind == "xlsx" and not head.startswith(ZIP_MAGIC):
        raise UnsupportedFileError("The file has a .xlsx extension but is not an Excel (XLSX) workbook.")
    if kind == "xls" and not head.startswith(OLE_MAGIC):
        raise UnsupportedFileError("The file has a .xls extension but is not a legacy Excel (XLS) workbook.")
    if kind == "csv" and _looks_binary(data):
        raise UnsupportedFileError("The file has a .csv extension but contains binary data.")
    return kind


def _find_pdf_header(data: bytes) -> bool:
    # The PDF spec allows a few junk bytes before the header; real files start with it.
    return data[:1024].lstrip(b"\xef\xbb\xbf\r\n\t ").startswith(PDF_MAGIC)


def _looks_binary(data: bytes) -> bool:
    sample = data[:8192]
    return b"\x00" in sample or sample.startswith((PDF_MAGIC, ZIP_MAGIC, OLE_MAGIC))
