# UPTAC Predictor – Document Processor

A small FastAPI service that extracts tables from official UPTAC documents (PDF, CSV,
XLSX, XLS) for the admin import pipeline. It **only extracts faithful cell text**. All
domain normalisation (categories, ranks, college/branch codes, validation) happens in
the TypeScript normaliser `supabase/functions/_shared/import/normalize.ts`, and nothing is
published until an administrator reviews and approves the rows.

```
Admin uploads file ──► Storage (private bucket "official-documents")
        │
        ▼
Edge Function process-import ──POST /jobs──► this service (202 Accepted)
                                              │ download file (service role)
                                              │ extract tables (PyMuPDF / pandas)
                                              │ upload extracted/{job_id}.json
        ◄──── POST /functions/v1/process-import {stage: "extracted" | "failed"} ──┘
```

## API

| Method | Path       | Auth                  | Purpose |
|--------|------------|-----------------------|---------|
| GET    | `/health`  | none                  | `{"status":"ok","extractors":{"pymupdf":true,"camelot":false,"pandas":true}}` |
| POST   | `/jobs`    | `X-Processor-Token`   | Queue an import job (JSON below). Returns **202** immediately. |
| POST   | `/extract` | `X-Processor-Token`   | Multipart `file` upload; returns the extraction payload synchronously (debugging / local dev). |

`POST /jobs` body:

```json
{ "job_id": "uuid", "bucket": "official-documents", "storage_path": "imports/2026/orcr.pdf",
  "file_name": "orcr.pdf", "mime_type": "application/pdf" }
```

Extraction payload (stored at `extracted/{job_id}.json` in the same bucket and returned by `/extract`):

```json
{
  "tables": [{ "page": 1, "name": null, "rows": [["Round", "Institute", "..."], ["R1: First Round", "..."]] }],
  "meta": { "extractor": "pymupdf", "pages": 12, "file_name": "orcr.pdf", "warnings": [] }
}
```

* PDF pages are 1-based; spreadsheet tables have `page: null` and `name` = sheet name.
* Every cell is a string (`""` when empty); multi-line cell text is joined with one space.

Callbacks to `{SUPABASE_URL}/functions/v1/process-import` carry `X-Processor-Token`,
`Authorization: Bearer <anon key or service key>` and `apikey`:

```json
{ "job_id": "…", "stage": "extracted", "extracted_path": "extracted/<job_id>.json" }
{ "job_id": "…", "stage": "failed", "error": "Could not download the document from storage (HTTP 404)." }
```

Callbacks are retried up to 3 times with exponential backoff on network errors / 5xx / 429.

### Responses and errors

| Status | When |
|--------|------|
| 401 | Missing or wrong `X-Processor-Token` (constant-time comparison) |
| 503 | `PROCESSOR_TOKEN` not set, or (for `/jobs`) Supabase not configured |
| 403 | Bucket not in `ALLOWED_BUCKETS` |
| 413 | Upload larger than `MAX_FILE_MB` |
| 415 | Extension not pdf/csv/xlsx/xls, or magic bytes do not match (`%PDF`, `PK` zip, `D0CF11E0` OLE) |
| 422 | Invalid job body, or the document could not be processed (corrupt / encrypted / too many pages) |

## Extraction behaviour

* **PDF** – PyMuPDF `page.find_tables()` (ruled lines first, then text alignment); multi-row
  headers are merged when they are purely textual; empty rows/columns are dropped. If no
  table is found and [Camelot](https://camelot-py.readthedocs.io) is installed, Camelot
  lattice then stream is tried. Scanned PDFs (no text layer) return zero tables and the
  warning *"PDF appears to be scanned (no text layer); OCR is not supported – upload the
  CSV/XLSX version or a text PDF"*. Limits: `MAX_PDF_PAGES`, `JOB_TIMEOUT_SECONDS`.
* **CSV** – UTF-8 (with/without BOM), falling back to Windows-1252; delimiter sniffing for
  `, ; TAB |`; ragged rows are padded.
* **XLSX / XLS** – openpyxl / xlrd, one table per non-empty sheet; integral numbers are
  rendered as displayed (`285084`, not `285084.0`).

## Configuration

Copy `.env.example` to `.env` (local) or set the variables on your host:

| Variable | Default | Notes |
|----------|---------|-------|
| `PROCESSOR_TOKEN` | – | **Required.** Shared secret; also set it as an Edge Function secret. |
| `SUPABASE_URL` | – | Required for `/jobs`. |
| `SUPABASE_SERVICE_ROLE_KEY` | – | Required for `/jobs`. Server-side only – never expose it to browsers. |
| `SUPABASE_ANON_KEY` | – | Bearer for callbacks (falls back to the service key). |
| `ALLOWED_BUCKETS` | `official-documents` | Comma separated. |
| `CALLBACK_FUNCTION` | `process-import` | Edge Function name. |
| `MAX_FILE_MB` | `50` | Upload / download size limit. |
| `MAX_PDF_PAGES` | `1500` | |
| `JOB_TIMEOUT_SECONDS` | `900` | Cooperative per-job deadline. |
| `MAX_CONCURRENT_JOBS` | `2` | Background worker threads. |
| `LOG_LEVEL` | `INFO` | Secrets and request headers are never logged. |
| `ENABLE_DOCS` | `false` | Serve `/docs` (OpenAPI UI). |
| `PORT` | `8080` | Docker only. |

## Run locally (Windows / macOS / Linux)

```bash
cd processor
python -m venv .venv
# Windows: .venv\Scripts\activate      macOS/Linux: source .venv/bin/activate
pip install -r requirements.txt -r requirements-dev.txt
cp .env.example .env        # then fill in PROCESSOR_TOKEN and the Supabase values
uvicorn app.main:app --reload --port 8080
pytest                       # 43 tests, no network needed
```

Try the synchronous extractor:

```bash
curl -H "X-Processor-Token: $PROCESSOR_TOKEN" -F "file=@orcr.pdf" http://localhost:8080/extract
```

Optional Camelot fallback (needs OpenCV; Ghostscript for lattice mode):

```bash
pip install -r requirements-camelot.txt
```

## Run with Docker

```bash
cd processor
docker build -t uptac-processor .
docker run --rm -p 8080:8080 --env-file .env uptac-processor
curl http://localhost:8080/health
```

Deploy the image to any container host (Render, Railway, Fly.io, Google Cloud Run, Azure
Container Apps …). Then set these **Edge Function secrets** in Supabase so
`process-import` can reach it:

```bash
supabase secrets set PROCESSOR_URL=https://your-processor.example.com PROCESSOR_TOKEN=<same token>
```

## Official data fetch scripts

The current official UPTAC portal is **https://uptac.samarth.edu.in** (the legacy
`uptac.admissions.nic.in` domain no longer resolves). Its OR-CR and seat matrix pages are
public HTML tables. `robots.txt` allows crawling and there is no CAPTCHA; the scripts still:

* identify themselves (`UPTACPredictorDataFetcher/1.0 (+<contact>)` – pass `--contact you@example.com`
  so the portal operators can reach you),
* check `robots.txt` before fetching,
* wait 1 second between requests by default (`--delay`, minimum 0.5 s),
* retry timeouts / 5xx with backoff, and **stop immediately on HTTP 403 / 429** (resume later
  with `--start-page`).

```bash
# Opening & closing ranks (B.Tech, ~534 pages × 50 rows ≈ 10 minutes)
python scripts/fetch_samarth_orcr.py --out output/orcr_2026.csv --academic-year 2026 --contact you@example.com
# resume after an interruption (appends to the same CSV)
python scripts/fetch_samarth_orcr.py --out output/orcr_2026.csv --start-page 120

# Seat matrix (single ~26 MB page, streamed and parsed incrementally)
python scripts/fetch_samarth_seat_matrix.py --out output/seat_matrix_2026.csv --academic-year 2026

# Offline conversion of a saved page
python scripts/fetch_samarth_orcr.py --input-html saved_orcr_page.html --out page.csv
python scripts/fetch_samarth_seat_matrix.py --input-html saved_seat_matrix.html --out seat.csv
```

Output CSVs keep the official columns verbatim (`Sr.No, Round, Institute, Programme, Branch,
Category, Seat Gender, Exam Name, Opening Rank, Closing Rank, Min Score, Max Score, Remark`
for OR-CR) plus `Source Page` / `Source URL` for traceability; a `.meta.json` sidecar records
the academic year, fetch time and record counts. Upload the CSV in the admin panel
(**Imports → Upload**). The rows are validated, shown for review, and published only after an
administrator approves them.

## Layout

```
app/
  main.py            FastAPI app (/health, /jobs, /extract)
  config.py          environment settings
  security.py        X-Processor-Token check
  models.py          payload / request models and errors
  filetypes.py       extension + magic-byte validation
  extract.py         dispatcher
  extract_pdf.py     PyMuPDF (+ optional Camelot) extraction
  extract_tabular.py CSV / XLSX / XLS extraction
  tables.py          pandas cell / table cleanup
  jobs.py            background job runner (download → extract → upload → callback)
  supabase_client.py Storage + Edge Function HTTP client
  samarth_html.py    streaming parser for the official portal's HTML tables
scripts/             official data fetchers (OR-CR, seat matrix)
tests/               pytest suite with generated fixtures (no network)
```
