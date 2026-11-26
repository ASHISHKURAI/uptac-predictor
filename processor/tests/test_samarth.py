"""Official-portal HTML parsing and the fetch scripts (offline, no network)."""

from __future__ import annotations

import csv
import io
import json
from pathlib import Path

import pytest

from app.samarth_html import GridTableParser, parse_summary, parse_table_html
from scripts import fetch_samarth_orcr as orcr
from scripts import fetch_samarth_seat_matrix as seat
from scripts.http_util import StopFetching

FIXTURES = Path(__file__).parent / "fixtures"


def orcr_html() -> str:
    return (FIXTURES / "orcr_page.html").read_text(encoding="utf-8")


def test_orcr_page_parses_official_columns_and_entities() -> None:
    header, rows = parse_table_html(orcr_html())
    assert header == orcr.EXPECTED_HEADER
    assert len(rows) == 3  # filter row, <select> options and the footer table are ignored
    assert rows[0][:10] == [
        "1", "R1: First Round", "FEROZE GANDHI INSTITUTE OF ENGG AND TECHNOLOGY, RAIBAREILLY",
        "B.Tech (All Branches)/M.Tech (Integrated)", "Aeronautical Engineering (Shift I)", "BCGL",
        "Co-Education", "JEE-MAIN", "285084", "285084",
    ]
    assert rows[1][2] == "ALIGARH COLLEGE OF ENGG. & TECH,ALIGARH"  # &amp; unescaped
    assert rows[1][4] == "Agricultural Engineering"  # whitespace inside the cell collapsed
    assert rows[2][8:10] == ["-", "-"]  # no-allotment rows are kept verbatim


def test_summary_parsing() -> None:
    assert parse_summary(orcr_html()) == (1, 50, 27047)
    assert parse_summary("<b>Showing 51-100 of 1,234 items.</b>") == (51, 100, 1234)
    assert parse_summary("nothing here") is None


def test_parser_is_incremental() -> None:
    rows: list[list[str]] = []
    parser = GridTableParser(rows.append)
    text = orcr_html()
    for i in range(0, len(text), 7):  # tiny chunks split tags and entities
        parser.feed(text[i : i + 7])
    parser.close()
    assert len(rows) == 3 and rows[1][2] == "ALIGARH COLLEGE OF ENGG. & TECH,ALIGARH"


def _page(first: int, last: int, total: int, rows: int, start_sr: int) -> str:
    """Builds a page of the paginated table from the fixture with a given summary."""
    html = orcr_html().replace("Showing 1-50 of 27047 records", f"Showing {first}-{last} of {total} records")
    body_start, body_end = html.index("<tbody>") + len("<tbody>"), html.index("</tbody>")
    template = '<tr><td>{sr}</td><td>R1: First Round</td><td>INST {sr}, CITY</td><td>B.Tech (All Branches)/M.Tech (Integrated)</td><td>Civil Engineering</td><td>OPNO</td><td>Co-Education</td><td>JEE-MAIN</td><td>{sr}</td><td>{sr}</td><td>-</td><td>-</td><td></td></tr>'
    body = "".join(template.format(sr=start_sr + i) for i in range(rows))
    return html[:body_start] + body + html[body_end:]


def test_run_walks_all_pages_and_writes_csv(tmp_path: Path) -> None:
    pages = {
        orcr.page_url(5, 1): _page(1, 50, 52, 50, 1),
        orcr.page_url(5, 2): _page(51, 52, 52, 2, 51),
    }
    fetched: list[str] = []
    sleeps: list[float] = []

    def fetch(url: str) -> str:
        fetched.append(url)
        return pages[url]

    out = tmp_path / "orcr.csv"
    summary = orcr.run(fetch, out, delay=1.5, sleep=sleeps.append)
    assert summary.complete and summary.rows_written == 52 and summary.total_pages == 2
    assert fetched == list(pages)
    assert sleeps == [1.5]  # polite delay between requests, none before the first
    rows = list(csv.reader(out.open(encoding="utf-8")))
    assert rows[0] == orcr.EXPECTED_HEADER + ["Source Page", "Source URL"]
    assert len(rows) == 53
    assert rows[51][-2:] == ["2", orcr.page_url(5, 2)]

    meta = orcr.write_meta(out, summary, academic_year=2026, programme_id=5, contact="ops@example.test")
    data = json.loads(meta.read_text(encoding="utf-8"))
    assert data["academic_year"] == 2026 and data["rows_written"] == 52
    assert "academic_year" not in rows[0]


def test_resume_appends_without_duplicate_header(tmp_path: Path) -> None:
    out = tmp_path / "orcr.csv"
    pages = {orcr.page_url(5, 1): _page(1, 50, 52, 50, 1), orcr.page_url(5, 2): _page(51, 52, 52, 2, 51)}
    orcr.run(lambda u: pages[u], out, max_pages=1, sleep=lambda _s: None)
    summary = orcr.run(lambda u: pages[u], out, start_page=2, sleep=lambda _s: None)
    assert summary.complete
    rows = list(csv.reader(out.open(encoding="utf-8")))
    assert sum(1 for r in rows if r[0] == "Sr.No") == 1
    assert len(rows) == 53


def test_run_stops_on_access_refusal_and_on_clamped_pages(tmp_path: Path) -> None:
    def refuse(_url: str) -> str:
        raise StopFetching("Server returned HTTP 429")

    summary = orcr.run(refuse, tmp_path / "a.csv", sleep=lambda _s: None)
    assert not summary.complete and "429" in (summary.stopped_reason or "")

    # Yii clamps out-of-range pages to the last page; the script must not duplicate rows.
    clamped = {orcr.page_url(5, 1): _page(1, 50, 120, 50, 1), orcr.page_url(5, 2): _page(1, 50, 120, 50, 1)}
    summary = orcr.run(lambda u: clamped[u], tmp_path / "b.csv", sleep=lambda _s: None)
    assert summary.rows_written == 50 and not summary.complete


def test_offline_conversion_of_saved_orcr_page(tmp_path: Path) -> None:
    out = tmp_path / "page.csv"
    assert orcr.main(["--input-html", str(FIXTURES / "orcr_page.html"), "--out", str(out)]) == 0
    rows = list(csv.reader(out.open(encoding="utf-8")))
    assert len(rows) == 4 and rows[1][-1] == orcr.page_url(5, 1)


def test_seat_matrix_conversion_streams_and_writes_csv() -> None:
    raw = (FIXTURES / "seat_matrix.html").read_bytes()
    chunks = [raw[i : i + 64] for i in range(0, len(raw), 64)]
    handle = io.StringIO()
    header, count = seat.convert_chunks(chunks, handle, seat.SEAT_MATRIX_URL)
    assert header == ["#", "Institute Type", "Institute", "Programme", "Gender", "OPNO", "BCGL", "NET SEATS", "TFW"]
    assert count == 2
    rows = list(csv.reader(io.StringIO(handle.getvalue())))
    assert rows[0] == header + ["Source URL"]
    assert rows[1][:9] == [
        "1", "Government Institution", "(043) BUNDELKHAND INSTITUTE OF ENGINEERING & TECHNOLOGY,JHANSI",
        "Artificial Intelligence (AI) And Data Science (Shift I)", "Co-Education", "20", "4", "24", "0",
    ]
    assert rows[2][2] == "(863 ) SETH VISHAMBHAR NATH INSTITUTE OF PHARMACY,BARABANKI"
    assert rows[2][4] == "WOMEN"


def test_seat_matrix_main_offline(tmp_path: Path) -> None:
    out = tmp_path / "seat.csv"
    assert seat.main(["--input-html", str(FIXTURES / "seat_matrix.html"), "--out", str(out), "--academic-year", "2026"]) == 0
    meta = json.loads(out.with_suffix(".meta.json").read_text(encoding="utf-8"))
    assert meta["rows_written"] == 2 and meta["academic_year"] == 2026


def test_http_fetch_stops_on_403_and_retries_5xx(monkeypatch: pytest.MonkeyPatch) -> None:
    import httpx
    import respx

    from scripts import http_util

    monkeypatch.setattr(http_util.time, "sleep", lambda _s: None)
    with respx.mock:
        respx.get("https://portal.test/a").mock(side_effect=[httpx.Response(502), httpx.Response(200, text="ok")])
        respx.get("https://portal.test/b").mock(return_value=httpx.Response(403))
        respx.get("https://portal.test/robots.txt").mock(return_value=httpx.Response(200, text="User-agent: *\nDisallow: /private\n"))
        with http_util.make_client() as client:
            assert http_util.fetch_text(client, "https://portal.test/a") == "ok"
            with pytest.raises(StopFetching):
                http_util.fetch_text(client, "https://portal.test/b")
            http_util.ensure_allowed_by_robots(client, "https://portal.test/a")
            with pytest.raises(StopFetching):
                http_util.ensure_allowed_by_robots(client, "https://portal.test/private/x")
            assert client.headers["User-Agent"] == "UPTACPredictorDataFetcher/1.0 (+admin contact in README)"
