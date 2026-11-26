"""Builds test documents in memory (ruled-table PDFs, scanned PDFs, CSV, XLSX)."""

from __future__ import annotations

import io

import pandas as pd
import pymupdf

ORCR_HEADER = ["Round", "Institute", "Branch", "Category", "Opening Rank", "Closing Rank"]
FONT_SIZE = 7


def _column_widths(rows: list[list[str]]) -> list[float]:
    cols = max(len(r) for r in rows)
    widths: list[float] = []
    for c in range(cols):
        lines = [line for r in rows if c < len(r) for line in r[c].split("\n")]
        longest = max((pymupdf.get_text_length(line, fontsize=FONT_SIZE) for line in lines), default=0.0)
        widths.append(max(40.0, longest + 12.0))
    return widths


def ruled_table_pdf(pages: list[list[list[str]]], row_height: float = 28.0) -> bytes:
    """Draws one ruled table per page. A newline in a cell makes a multi-line cell.

    Column widths are sized to their longest line so text never overflows a cell.
    """
    doc = pymupdf.open()
    for rows in pages:
        widths = _column_widths(rows)
        page = doc.new_page(width=max(80 + sum(widths), 595), height=842)
        x0, y0 = 40.0, 60.0
        for r, row in enumerate(rows):
            top = y0 + r * row_height
            for c, width in enumerate(widths):
                left = x0 + sum(widths[:c])
                page.draw_rect(pymupdf.Rect(left, top, left + width, top + row_height), color=(0, 0, 0), width=0.8)
                text = row[c] if c < len(row) else ""
                for i, line in enumerate(text.split("\n") if text else []):
                    page.insert_text((left + 4, top + 10 + i * 9), line, fontsize=FONT_SIZE)
    data = doc.tobytes()
    doc.close()
    return data


def scanned_pdf() -> bytes:
    """A PDF whose only content is an image (no text layer)."""
    pix = pymupdf.Pixmap(pymupdf.csRGB, pymupdf.IRect(0, 0, 60, 40), False)
    pix.clear_with(200)
    doc = pymupdf.open()
    page = doc.new_page()
    page.insert_image(pymupdf.Rect(50, 50, 350, 250), pixmap=pix)
    data = doc.tobytes()
    doc.close()
    return data


def text_pages_pdf(count: int) -> bytes:
    doc = pymupdf.open()
    for i in range(count):
        page = doc.new_page()
        page.insert_text((72, 72), f"page {i + 1}", fontsize=10)
    data = doc.tobytes()
    doc.close()
    return data


def xlsx_bytes(sheets: dict[str, list[list[object]]]) -> bytes:
    buffer = io.BytesIO()
    with pd.ExcelWriter(buffer, engine="openpyxl") as writer:
        for name, rows in sheets.items():
            pd.DataFrame(rows).to_excel(writer, sheet_name=name, header=False, index=False)
    return buffer.getvalue()
