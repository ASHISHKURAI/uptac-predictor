"""Cell / table cleanup helpers (pandas based). Text is kept faithful – no domain normalisation."""

from __future__ import annotations

import datetime as dt
import math
import re
from collections.abc import Iterable, Sequence
from typing import Any

import pandas as pd

_WS = re.compile(r"\s+")
_NUMERIC = re.compile(r"^[\s\d,.\-–]*$")


def normalize_cell(value: Any) -> str:
    """Converts any extracted cell to a single-line string ('' for empty values).

    Multi-line cell text is joined with a single space; integral floats coming from
    spreadsheets (285084.0) are rendered the way the spreadsheet displays them (285084).
    """
    if value is None:
        return ""
    if isinstance(value, bool):
        return "TRUE" if value else "FALSE"
    if isinstance(value, float):
        if math.isnan(value) or math.isinf(value):
            return ""
        if value.is_integer():
            return str(int(value))
        return repr(value)
    if isinstance(value, (dt.datetime, dt.date)):
        if isinstance(value, dt.datetime) and value.time() == dt.time(0, 0):
            return value.date().isoformat()
        return value.isoformat()
    if value is pd.NaT:
        return ""
    text = str(value).replace(" ", " ").replace("﻿", "")
    return _WS.sub(" ", text).strip()


def clean_rows(rows: Iterable[Sequence[Any]]) -> list[list[str]]:
    """Normalises every cell, pads ragged rows and drops fully empty rows and columns."""
    normalized = [[normalize_cell(c) for c in row] for row in rows]
    if not normalized:
        return []
    width = max((len(r) for r in normalized), default=0)
    if width == 0:
        return []
    frame = pd.DataFrame([r + [""] * (width - len(r)) for r in normalized], dtype=object)
    non_empty = frame.map(lambda c: c != "")
    frame = frame.loc[non_empty.any(axis=1), non_empty.any(axis=0)]
    return [list(map(str, r)) for r in frame.itertuples(index=False, name=None)]


def _is_textual(cell: str) -> bool:
    return cell != "" and not _NUMERIC.match(cell)


def merge_multirow_header(rows: list[list[str]], max_header_rows: int = 3) -> list[list[str]]:
    """Merges header rows that PDF extraction split across several lines.

    Rows are merged into the first row only while (a) the first row has empty cells
    and (b) the next row is purely textual and fills at least one of those gaps.
    Data rows (which contain numbers) are never merged.
    """
    if len(rows) < 3 or not rows[0]:
        return rows
    header = list(rows[0])
    if all(header) or not any(_is_textual(c) for c in header):
        return rows
    merged = 0
    for candidate in rows[1:max_header_rows]:
        if len(candidate) != len(header):
            break
        if any(c and not _is_textual(c) for c in candidate):
            break
        fills_gap = any(not header[i] and candidate[i] for i in range(len(header)))
        if not fills_gap:
            break
        header = [" ".join(p for p in (h, c) if p) for h, c in zip(header, candidate)]
        merged += 1
    if merged == 0:
        return rows
    return [header, *rows[1 + merged :]]


def dataframe_to_rows(frame: pd.DataFrame) -> list[list[str]]:
    """Converts a header-less DataFrame (header=None) into cleaned string rows."""
    return clean_rows(frame.itertuples(index=False, name=None))
