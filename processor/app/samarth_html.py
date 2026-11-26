"""Streaming parser for the official UPTAC (Samarth portal) HTML tables.

The OR-CR and seat matrix pages render a standard Yii GridView: one <table> whose
first row holds <th> column headers followed by <tr><td> data rows. This parser
is incremental (feed() chunks) so the ~26 MB seat matrix page never needs to be
held in memory as a DOM. Text inside <select>, <option>, <script>, <style> and
<input> elements is ignored, as are filter rows and "No results found" rows.
"""

from __future__ import annotations

import html
import re
from collections.abc import Callable
from html.parser import HTMLParser

_WS = re.compile(r"\s+")
_TAGS = re.compile(r"<[^>]+>")
_SUMMARY = re.compile(r"Showing\s+([\d,]+)\s*-\s*([\d,]+)\s+of\s+([\d,]+)\s+(?:records|items)", re.IGNORECASE)
_IGNORED = {"select", "option", "script", "style", "textarea", "button", "noscript"}

RowHandler = Callable[[list[str]], None]


def _clean(text: str) -> str:
    return _WS.sub(" ", text.replace(" ", " ")).strip()


class GridTableParser(HTMLParser):
    """Finds the first table whose header contains `required_header` and emits its data rows."""

    def __init__(self, on_row: RowHandler, required_header: str = "Institute") -> None:
        super().__init__(convert_charrefs=True)
        self.on_row = on_row
        self.required_header = required_header.lower()
        self.header: list[str] | None = None
        self.rows_emitted = 0
        self.rows_skipped = 0
        self._table_depth = 0
        self._target_depth: int | None = None
        self._done = False
        self._ignore_depth = 0
        self._row: list[str] | None = None
        self._row_is_filter = False
        self._row_has_th = False
        self._cell: list[str] | None = None
        self._cell_colspan = 1

    # -- HTMLParser hooks -------------------------------------------------
    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        if tag in _IGNORED:
            self._ignore_depth += 1
            return
        if tag == "table":
            self._table_depth += 1
            return
        if self._done or self._table_depth == 0:
            return
        if self._target_depth is not None and self._table_depth != self._target_depth:
            return
        attr = dict(attrs)
        if tag == "tr":
            self._row = []
            classes = (attr.get("class") or "") + " " + (attr.get("id") or "")
            self._row_is_filter = "filter" in classes.lower()
            self._row_has_th = False
        elif tag in ("td", "th") and self._row is not None:
            self._cell = []
            self._row_has_th = self._row_has_th or tag == "th"
            colspan = attr.get("colspan") or "1"
            self._cell_colspan = int(colspan) if colspan.isdigit() else 1
        elif tag == "br" and self._cell is not None:
            self._cell.append(" ")

    def handle_startendtag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        if tag == "br" and self._cell is not None:
            self._cell.append(" ")

    def handle_endtag(self, tag: str) -> None:
        if tag in _IGNORED:
            self._ignore_depth = max(0, self._ignore_depth - 1)
            return
        if tag == "table":
            if self._target_depth is not None and self._table_depth == self._target_depth:
                self._done = True
                self._target_depth = None
            self._table_depth = max(0, self._table_depth - 1)
            return
        if self._done or self._table_depth == 0:
            return
        if tag in ("td", "th") and self._row is not None and self._cell is not None:
            self._row.append(_clean("".join(self._cell)))
            if self._cell_colspan > 1:
                self._row.extend([""] * (self._cell_colspan - 1))
            self._cell = None
        elif tag == "tr" and self._row is not None:
            self._finish_row(self._row)
            self._row = None

    def handle_data(self, data: str) -> None:
        if self._ignore_depth == 0 and self._cell is not None:
            self._cell.append(data)

    # -- row handling -----------------------------------------------------
    def _finish_row(self, row: list[str]) -> None:
        if self._row_is_filter or not any(row):
            return
        if self.header is None:
            if self._row_has_th and any(c.lower() == self.required_header for c in row):
                self.header = row
                self._target_depth = self._table_depth
            return
        if self._target_depth is None:
            return
        if self._row_has_th and row == self.header:
            return  # repeated header
        if len(row) != len(self.header):
            self.rows_skipped += 1  # e.g. "No results found." spanning all columns
            return
        self.rows_emitted += 1
        self.on_row(row)


def parse_table_html(text: str, required_header: str = "Institute") -> tuple[list[str] | None, list[list[str]]]:
    """Parses a complete HTML document and returns (header, rows)."""
    rows: list[list[str]] = []
    parser = GridTableParser(rows.append, required_header)
    parser.feed(text)
    parser.close()
    return parser.header, rows


def parse_summary(text: str) -> tuple[int, int, int] | None:
    """Parses Yii's 'Showing 1-50 of 27047 records' summary → (first, last, total)."""
    plain = html.unescape(_TAGS.sub("", text))
    match = _SUMMARY.search(plain)
    if not match:
        return None
    first, last, total = (int(g.replace(",", "")) for g in match.groups())
    return first, last, total
