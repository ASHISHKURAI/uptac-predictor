"""Extractor behaviour on generated PDFs, CSVs and workbooks."""

from __future__ import annotations

import pytest

from app.extract import extract_document
from app.extract_pdf import SCANNED_WARNING, extract_pdf
from app.extract_tabular import extract_csv, extract_excel
from app.filetypes import detect_kind
from app.models import ExtractionError, ExtractionTimeoutError, UnsupportedFileError
from app.tables import clean_rows, merge_multirow_header, normalize_cell
from tests.factories import ORCR_HEADER, ruled_table_pdf, scanned_pdf, text_pages_pdf, xlsx_bytes


def test_pdf_tables_keep_page_numbers_and_repeated_headers() -> None:
    pages = [
        [ORCR_HEADER, ["R1: First Round", "GOVT TEST INSTITUTE, ALPHA", "Computer Science\nand Engineering", "OPNO", "1200", "5400"]],
        [ORCR_HEADER, ["R1: First Round", "PRIVATE TEST COLLEGE OF ENGG & TECH, BETA", "Civil Engineering", "BCGL", "", "-"]],
        [ORCR_HEADER, ["R2: Second Round", "GOVT TEST INSTITUTE, ALPHA", "Information Technology", "EWSNO", "100", "200"]],
    ]
    result = extract_pdf(ruled_table_pdf(pages), "orcr.pdf", max_pages=10)
    assert result.extractor == "pymupdf"
    assert result.pages == 3
    assert [t.page for t in result.tables] == [1, 2, 3]
    assert all(t.rows[0] == ORCR_HEADER for t in result.tables)
    # multi-line cell text is joined with a single space
    assert result.tables[0].rows[1][2] == "Computer Science and Engineering"
    # '&' kept verbatim, empty cells kept as ''
    assert result.tables[1].rows[1] == ["R1: First Round", "PRIVATE TEST COLLEGE OF ENGG & TECH, BETA", "Civil Engineering", "BCGL", "", "-"]
    assert result.warnings == []


def test_scanned_pdf_returns_warning_and_no_tables() -> None:
    result = extract_pdf(scanned_pdf(), "scan.pdf", max_pages=10)
    assert result.tables == []
    assert result.warnings == [SCANNED_WARNING]


def test_pdf_page_limit() -> None:
    with pytest.raises(ExtractionError, match="MAX_PDF_PAGES"):
        extract_pdf(text_pages_pdf(3), "big.pdf", max_pages=2)


def test_pdf_without_tables_warns() -> None:
    result = extract_pdf(text_pages_pdf(1), "notice.pdf", max_pages=5)
    assert result.tables == []
    assert any("No tables" in w for w in result.warnings)


def test_pdf_deadline_is_enforced() -> None:
    with pytest.raises(ExtractionTimeoutError):
        extract_pdf(ruled_table_pdf([[ORCR_HEADER]]), "slow.pdf", max_pages=5, deadline=0.0)


def test_csv_semicolon_utf8_bom() -> None:
    data = "﻿Institute;Branch;Opening Rank\nGOVT TEST INSTITUTE, ALPHA;Civil Engineering;1,234\n;;\n".encode("utf-8")
    result = extract_csv(data, "orcr.csv")
    assert result.extractor == "pandas"
    assert result.tables[0].rows == [["Institute", "Branch", "Opening Rank"], ["GOVT TEST INSTITUTE, ALPHA", "Civil Engineering", "1,234"]]
    assert result.warnings == []


def test_csv_cp1252_fallback_and_multiline_cells() -> None:
    data = 'Institute,Remark\r\n"Café Institute","line one\nline two"\r\n'.encode("cp1252")
    result = extract_csv(data, "orcr.csv")
    assert result.tables[0].rows[1] == ["Café Institute", "line one line two"]
    assert any("cp1252" in w for w in result.warnings)


def test_csv_tab_delimited_ragged_rows() -> None:
    result = extract_csv(b"a\tb\tc\n1\t2\n", "x.csv")
    assert result.tables[0].rows == [["a", "b", "c"], ["1", "2", ""]]


def test_xlsx_multiple_sheets_as_text() -> None:
    data = xlsx_bytes(
        {
            "Round 1": [["Institute", "Opening Rank", "Closing Rank"], ["GOVT TEST INSTITUTE, ALPHA", 285084, 544045.0], [None, None, None]],
            "Empty": [[None]],
            "Round 2": [["Institute", "Seats"], ["X", 12.5]],
        }
    )
    result = extract_excel(data, "orcr.xlsx", "xlsx")
    assert [t.name for t in result.tables] == ["Round 1", "Round 2"]
    assert result.tables[0].rows == [["Institute", "Opening Rank", "Closing Rank"], ["GOVT TEST INSTITUTE, ALPHA", "285084", "544045"]]
    assert result.tables[1].rows[1] == ["X", "12.5"]
    assert all(t.page is None for t in result.tables)
    assert any("Empty" in w for w in result.warnings)


def test_detect_kind_by_extension_and_magic() -> None:
    assert detect_kind("a.PDF", b"%PDF-1.4") == "pdf"
    assert detect_kind("a.xlsx", b"PK\x03\x04rest") == "xlsx"
    assert detect_kind("a.xls", b"\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1rest") == "xls"
    assert detect_kind("a.csv", b"a,b\n") == "csv"
    for name, data in [("a.pdf", b"nope"), ("a.docx", b"PK\x03\x04"), ("a.csv", b""), ("noext", b"%PDF")]:
        with pytest.raises(UnsupportedFileError):
            detect_kind(name, data)


def test_extract_document_enforces_size(settings) -> None:
    small = settings.model_copy(update={"max_file_mb": 0.0001})
    with pytest.raises(ExtractionError, match="MAX_FILE_MB"):
        extract_document(b"a,b\n" * 100, "x.csv", small)


def test_normalize_cell_variants() -> None:
    assert normalize_cell(None) == ""
    assert normalize_cell(float("nan")) == ""
    assert normalize_cell(285084.0) == "285084"
    assert normalize_cell(" Computer\n  Science Engg ") == "Computer Science Engg"


def test_clean_rows_drops_empty_rows_and_columns() -> None:
    assert clean_rows([["", "a", ""], ["", "", ""], ["", "b", None]]) == [["a"], ["b"]]


def test_merge_multirow_header_only_merges_text_rows() -> None:
    rows = [["Opening", "Closing", "Institute"], ["Rank", "Rank", ""], ["10", "20", "X"]]
    assert merge_multirow_header(rows) == rows  # first row complete → untouched
    split = [["Institute", "Opening", ""], ["", "Rank", "Closing Rank"], ["X", "10", "20"]]
    assert merge_multirow_header(split) == [["Institute", "Opening Rank", "Closing Rank"], ["X", "10", "20"]]
    data_like = [["Institute", ""], ["X", "10"], ["Y", "20"]]
    assert merge_multirow_header(data_like) == data_like
