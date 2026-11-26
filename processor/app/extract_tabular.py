"""CSV / XLSX / XLS extraction. Every cell is returned as faithful text."""

from __future__ import annotations

import csv
import io
import logging

import pandas as pd

from .models import ExtractionError, ExtractionResult, Table
from .tables import clean_rows, dataframe_to_rows

logger = logging.getLogger(__name__)

_DELIMITERS = ",;\t|"


def decode_text(data: bytes) -> tuple[str, str]:
    """Decodes CSV bytes: UTF-8 (with or without BOM) first, then Windows-1252, then Latin-1."""
    for encoding in ("utf-8-sig", "cp1252"):
        try:
            return data.decode(encoding), encoding
        except UnicodeDecodeError:
            continue
    return data.decode("latin-1"), "latin-1"


def sniff_delimiter(text: str) -> str:
    sample = text[:65536]
    try:
        return csv.Sniffer().sniff(sample, delimiters=_DELIMITERS).delimiter
    except csv.Error:
        first_line = sample.splitlines()[0] if sample else ""
        counts = {d: first_line.count(d) for d in _DELIMITERS}
        best = max(counts, key=lambda d: counts[d])
        return best if counts[best] > 0 else ","


def extract_csv(data: bytes, file_name: str) -> ExtractionResult:
    text, encoding = decode_text(data)
    delimiter = sniff_delimiter(text)
    reader = csv.reader(io.StringIO(text, newline=""), delimiter=delimiter)
    try:
        rows = clean_rows(reader)
    except csv.Error as exc:
        raise ExtractionError(f"The CSV file could not be parsed: {exc}") from exc
    warnings = [] if encoding == "utf-8-sig" else [f"CSV decoded as {encoding}; check special characters."]
    tables = [Table(rows=rows, page=None, name=None)] if rows else []
    if not tables:
        warnings.append("The CSV file contains no data.")
    return ExtractionResult(tables=tables, extractor="pandas", file_name=file_name, pages=None, warnings=warnings)


def extract_excel(data: bytes, file_name: str, kind: str) -> ExtractionResult:
    engine = "openpyxl" if kind == "xlsx" else "xlrd"
    try:
        sheets: dict[str, pd.DataFrame] = pd.read_excel(
            io.BytesIO(data),
            sheet_name=None,
            header=None,
            dtype=object,
            keep_default_na=False,
            na_filter=False,
            engine=engine,
        )
    except Exception as exc:
        raise ExtractionError(f"The {kind.upper()} workbook could not be read: {exc}") from exc
    tables: list[Table] = []
    warnings: list[str] = []
    for name, frame in sheets.items():
        rows = dataframe_to_rows(frame)
        if rows:
            tables.append(Table(rows=rows, page=None, name=str(name)))
        else:
            warnings.append(f"Sheet '{name}' is empty and was skipped.")
    if not tables:
        warnings.append("The workbook contains no data.")
    return ExtractionResult(tables=tables, extractor="pandas", file_name=file_name, pages=None, warnings=warnings)
