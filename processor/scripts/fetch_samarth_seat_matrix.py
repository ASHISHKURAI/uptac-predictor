"""Download the official UPTAC seat matrix table as CSV.

Source: https://uptac.samarth.edu.in/index.php/seat-matrix/index – a single public
page (~26 MB) containing the full seat matrix for every programme. The page is
streamed to a temporary file and parsed incrementally, then written as CSV with
the official columns ('#', 'Institute Type', 'Institute', 'Programme', 'Gender',
'OPNO', … 'NET SEATS', 'TFW') plus "Source URL".

Non-B.Tech programmes are kept in the CSV (faithful copy); the importer skips them.
Upload the CSV in the admin panel – nothing is published without admin approval.

Examples:
    python scripts/fetch_samarth_seat_matrix.py --out output/seat_matrix_2026.csv --academic-year 2026
    python scripts/fetch_samarth_seat_matrix.py --input-html saved_seat_matrix.html --out seat.csv
"""

from __future__ import annotations

import argparse
import codecs
import csv
import json
import logging
import sys
import tempfile
from collections.abc import Iterable
from datetime import datetime, timezone
from pathlib import Path
from typing import TextIO

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.samarth_html import GridTableParser  # noqa: E402
from scripts.http_util import DEFAULT_CONTACT, StopFetching, ensure_allowed_by_robots, make_client, user_agent  # noqa: E402

logger = logging.getLogger("fetch_seat_matrix")

# The unfiltered page mixes regular B.Tech rows (programme 5) with B.Tech LATERAL rows (programme 8)
# under identical branch names, which creates conflicting duplicates. Always filter by programme.
SEAT_MATRIX_BASE_URL = "https://uptac.samarth.edu.in/index.php/seat-matrix/index"
BTECH_PROGRAMME_ID = 5  # "B.Tech (All Branches)/M.Tech (Integrated)"
SEAT_MATRIX_URL = f"{SEAT_MATRIX_BASE_URL}?SeatMatrixFilter%5Bprogramme%5D={BTECH_PROGRAMME_ID}"
CHUNK = 1024 * 1024


def convert_chunks(chunks: Iterable[bytes], handle: TextIO, source_url: str) -> tuple[list[str] | None, int]:
    """Parses HTML byte chunks incrementally and writes CSV rows. Returns (header, rows)."""
    writer = csv.writer(handle)
    state = {"header_written": False}

    def on_row(row: list[str]) -> None:
        if not state["header_written"]:
            writer.writerow((parser.header or []) + ["Source URL"])
            state["header_written"] = True
        writer.writerow(row + [source_url])

    parser = GridTableParser(on_row, required_header="Institute")
    decoder = codecs.getincrementaldecoder("utf-8")(errors="replace")
    for chunk in chunks:
        parser.feed(decoder.decode(chunk))
    parser.feed(decoder.decode(b"", final=True))
    parser.close()
    if parser.header and not state["header_written"]:
        writer.writerow(parser.header + ["Source URL"])
    return parser.header, parser.rows_emitted


def _file_chunks(path: Path) -> Iterable[bytes]:
    with path.open("rb") as handle:
        while chunk := handle.read(CHUNK):
            yield chunk


def download_to_temp(url: str, contact: str) -> Path:
    with make_client(contact, timeout=180.0) as client:
        ensure_allowed_by_robots(client, url)
        with client.stream("GET", url) as response:
            if response.status_code in (403, 429):
                raise StopFetching(f"Server returned HTTP {response.status_code}; not continuing.")
            if response.status_code != 200:
                raise RuntimeError(f"HTTP {response.status_code} for {url}")
            fd = tempfile.NamedTemporaryFile(prefix="seat_matrix_", suffix=".html", delete=False)
            size = 0
            with fd:
                for chunk in response.iter_bytes(CHUNK):
                    fd.write(chunk)
                    size += len(chunk)
            logger.info("Downloaded %.1f MB", size / 1_048_576)
            return Path(fd.name)


def main(argv: list[str] | None = None) -> int:
    # Windows consoles default to cp1252; never crash when printing help/progress text.
    for stream in (sys.stdout, sys.stderr):
        if hasattr(stream, "reconfigure"):
            stream.reconfigure(errors="replace")
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--out", type=Path, required=True, help="CSV file to write")
    parser.add_argument("--academic-year", type=int, help="Counselling year (stored in the .meta.json sidecar only)")
    parser.add_argument("--url", default=SEAT_MATRIX_URL, help="Seat matrix page URL (default: B.Tech only, programme 5 – excludes lateral entry)")
    parser.add_argument("--contact", default=DEFAULT_CONTACT, help="Contact URL/e-mail included in the User-Agent")
    parser.add_argument("--input-html", type=Path, help="Parse a saved page instead of downloading (offline)")
    args = parser.parse_args(argv)
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")

    temp: Path | None = None
    if args.input_html:
        html_path, source_url = args.input_html, args.url
    else:
        try:
            temp = download_to_temp(args.url, args.contact)
        except StopFetching as exc:
            logger.error("%s", exc)
            return 2
        html_path, source_url = temp, args.url
    try:
        args.out.parent.mkdir(parents=True, exist_ok=True)
        with args.out.open("w", newline="", encoding="utf-8") as handle:
            header, rows = convert_chunks(_file_chunks(html_path), handle, source_url)
    finally:
        if temp is not None:
            temp.unlink(missing_ok=True)
    if header is None:
        logger.error("No seat matrix table was found in the page.")
        return 1
    meta = {
        "source": "UPTAC official portal – Seat Matrix",
        "source_url": source_url,
        "academic_year": args.academic_year,
        "fetched_at": datetime.now(timezone.utc).isoformat(),
        "user_agent": user_agent(args.contact),
        "rows_written": rows,
        "columns": header,
    }
    args.out.with_suffix(".meta.json").write_text(json.dumps(meta, indent=2), encoding="utf-8")
    logger.info("Wrote %s rows to %s", rows, args.out)
    return 0


if __name__ == "__main__":
    sys.exit(main())
