"""Download the official UPTAC "OR-CR Details" (opening & closing rank) table as CSV.

Source: https://uptac.samarth.edu.in/index.php/cut-off-matrix/index (public, no login,
robots.txt allows crawling). The server returns at most 50 rows per page, so the
script walks every page politely (default 1 request per second) and writes the
official columns unchanged plus "Source Page" and "Source URL" for traceability.

The resulting CSV is NOT published automatically: upload it in the admin panel
(Imports → Upload) where every row is validated and must be approved by an admin.

Examples:
    python scripts/fetch_samarth_orcr.py --out output/orcr_2026.csv --academic-year 2026
    python scripts/fetch_samarth_orcr.py --out output/orcr_2026.csv --start-page 120   # resume
    python scripts/fetch_samarth_orcr.py --input-html saved_page.html --out page.csv   # offline
"""

from __future__ import annotations

import argparse
import csv
import json
import logging
import math
import sys
import time
from collections.abc import Callable
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.samarth_html import parse_summary, parse_table_html  # noqa: E402
from scripts.http_util import (  # noqa: E402
    DEFAULT_CONTACT,
    StopFetching,
    ensure_allowed_by_robots,
    fetch_text,
    make_client,
    user_agent,
)

logger = logging.getLogger("fetch_orcr")

BASE_URL = "https://uptac.samarth.edu.in/index.php/cut-off-matrix/index"
PER_PAGE = 50
EXPECTED_HEADER = [
    "Sr.No", "Round", "Institute", "Programme", "Branch", "Category", "Seat Gender",
    "Exam Name", "Opening Rank", "Closing Rank", "Min Score", "Max Score", "Remark",
]
EXTRA_COLUMNS = ["Source Page", "Source URL"]


def page_url(programme_id: int, page: int) -> str:
    return (
        f"{BASE_URL}?PrgAdmissionCutOffSeatsSearch%5Bparent_programme_id%5D={programme_id}"
        f"&page={page}&per-page={PER_PAGE}"
    )


@dataclass
class OrcrPage:
    header: list[str] | None
    rows: list[list[str]]
    first: int | None
    total: int | None


def parse_orcr_page(text: str) -> OrcrPage:
    header, rows = parse_table_html(text, required_header="Institute")
    summary = parse_summary(text)
    return OrcrPage(header=header, rows=rows, first=summary[0] if summary else None, total=summary[2] if summary else None)


@dataclass
class FetchSummary:
    pages_fetched: int
    rows_written: int
    first_page: int
    last_page: int | None
    total_records_reported: int | None
    total_pages: int | None
    complete: bool
    stopped_reason: str | None = None


def run(
    fetch: Callable[[str], str],
    out: Path,
    *,
    programme_id: int = 5,
    start_page: int = 1,
    max_pages: int | None = None,
    delay: float = 1.0,
    sleep: Callable[[float], None] = time.sleep,
) -> FetchSummary:
    """Walks the paginated table and appends rows to `out`. `fetch` maps a URL to HTML."""
    resuming = start_page > 1 and out.exists() and out.stat().st_size > 0
    out.parent.mkdir(parents=True, exist_ok=True)
    page = start_page
    pages_fetched = rows_written = 0
    total_pages: int | None = None
    total_records: int | None = None
    last_page: int | None = None
    stopped: str | None = None

    with out.open("a" if resuming else "w", newline="", encoding="utf-8") as handle:
        writer = csv.writer(handle)
        header_written = resuming
        while True:
            if max_pages is not None and pages_fetched >= max_pages:
                stopped = f"--max-pages {max_pages} reached"
                break
            if total_pages is not None and page > total_pages:
                break
            url = page_url(programme_id, page)
            if pages_fetched > 0:
                sleep(delay)
            try:
                result = parse_orcr_page(fetch(url))
            except StopFetching as exc:
                stopped = str(exc)
                logger.error(stopped)
                break
            pages_fetched += 1
            if result.header is None:
                raise RuntimeError(f"No OR-CR table found on page {page} ({url}).")
            if result.header != EXPECTED_HEADER:
                logger.warning("Page %s header differs from the expected official columns: %s", page, result.header)
            if result.total is not None:
                total_records = result.total
                total_pages = max(1, math.ceil(result.total / PER_PAGE))
            expected_first = (page - 1) * PER_PAGE + 1
            if result.first is not None and result.first != expected_first:
                stopped = f"Server returned rows starting at {result.first} for page {page}; stopping to avoid duplicates."
                logger.warning(stopped)
                break
            if not result.rows:
                break
            if not header_written:
                writer.writerow(result.header + EXTRA_COLUMNS)
                header_written = True
            for row in result.rows:
                writer.writerow(row + [str(page), url])
            rows_written += len(result.rows)
            handle.flush()
            last_page = page
            logger.info("page %s/%s: %s rows (total written %s)", page, total_pages or "?", len(result.rows), rows_written)
            page += 1

    complete = stopped is None and total_pages is not None and (last_page or 0) >= total_pages
    return FetchSummary(
        pages_fetched=pages_fetched,
        rows_written=rows_written,
        first_page=start_page,
        last_page=last_page,
        total_records_reported=total_records,
        total_pages=total_pages,
        complete=complete,
        stopped_reason=stopped,
    )


def write_meta(out: Path, summary: FetchSummary, *, academic_year: int | None, programme_id: int, contact: str) -> Path:
    meta_path = out.with_suffix(".meta.json")
    meta = {
        "source": "UPTAC official portal – OR-CR Details",
        "source_url": BASE_URL,
        "programme_id": programme_id,
        "academic_year": academic_year,
        "fetched_at": datetime.now(timezone.utc).isoformat(),
        "user_agent": user_agent(contact),
        **summary.__dict__,
    }
    meta_path.write_text(json.dumps(meta, indent=2), encoding="utf-8")
    return meta_path


def convert_saved_page(html_path: Path, out: Path, source_page: int, source_url: str) -> int:
    """Offline mode: converts one saved OR-CR page to CSV."""
    result = parse_orcr_page(html_path.read_text(encoding="utf-8", errors="replace"))
    if result.header is None:
        raise RuntimeError(f"No OR-CR table found in {html_path}")
    out.parent.mkdir(parents=True, exist_ok=True)
    with out.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.writer(handle)
        writer.writerow(result.header + EXTRA_COLUMNS)
        for row in result.rows:
            writer.writerow(row + [str(source_page), source_url])
    return len(result.rows)


def main(argv: list[str] | None = None) -> int:
    # Windows consoles default to cp1252; never crash when printing help/progress text.
    for stream in (sys.stdout, sys.stderr):
        if hasattr(stream, "reconfigure"):
            stream.reconfigure(errors="replace")
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--out", type=Path, required=True, help="CSV file to write")
    parser.add_argument("--academic-year", type=int, help="Counselling year (stored in the .meta.json sidecar only)")
    parser.add_argument("--programme-id", type=int, default=5, help="Parent programme id (5 = B.Tech/M.Tech integrated)")
    parser.add_argument("--delay", type=float, default=1.0, help="Seconds between requests (default 1.0, minimum 0.5)")
    parser.add_argument("--max-pages", type=int, help="Stop after this many pages")
    parser.add_argument("--start-page", type=int, default=1, help="Resume from this page (appends to --out)")
    parser.add_argument("--contact", default=DEFAULT_CONTACT, help="Contact URL/e-mail included in the User-Agent")
    parser.add_argument("--input-html", type=Path, help="Parse a saved page instead of fetching (offline)")
    parser.add_argument("--source-url", help="Source URL recorded for --input-html rows (defaults to the page URL)")
    args = parser.parse_args(argv)
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")

    if args.input_html:
        source_url = args.source_url or page_url(args.programme_id, args.start_page)
        count = convert_saved_page(args.input_html, args.out, args.start_page, source_url)
        logger.info("Wrote %s rows to %s", count, args.out)
        return 0

    delay = max(0.5, args.delay)
    with make_client(args.contact) as client:
        try:
            ensure_allowed_by_robots(client, page_url(args.programme_id, 1))
        except StopFetching as exc:
            logger.error("%s", exc)
            return 2
        summary = run(
            lambda url: fetch_text(client, url),
            args.out,
            programme_id=args.programme_id,
            start_page=max(1, args.start_page),
            max_pages=args.max_pages,
            delay=delay,
        )
    meta = write_meta(args.out, summary, academic_year=args.academic_year, programme_id=args.programme_id, contact=args.contact)
    logger.info(
        "Done: %s rows from %s page(s); reported total %s records; complete=%s. Metadata: %s",
        summary.rows_written, summary.pages_fetched, summary.total_records_reported, summary.complete, meta,
    )
    if summary.stopped_reason and not summary.complete:
        logger.warning("Stopped early: %s", summary.stopped_reason)
        return 2 if "HTTP 4" in summary.stopped_reason else 0
    return 0


if __name__ == "__main__":
    sys.exit(main())
