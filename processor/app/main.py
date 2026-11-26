"""FastAPI application: UPTAC Predictor document processor."""

from __future__ import annotations

import importlib.util
import logging
import time
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from typing import Any

from fastapi import Depends, FastAPI, File, HTTPException, Request, UploadFile, status
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import JSONResponse

from . import __version__
from .config import Settings, get_settings
from .extract import extract_document
from .extract_pdf import camelot_available
from .filetypes import detect_kind
from .jobs import JobRunner
from .models import ExtractionError, JobRequest, UnsupportedFileError
from .security import verify_processor_token

logger = logging.getLogger("processor")


def _configure_logging(level: str) -> None:
    logging.basicConfig(
        level=getattr(logging, level.upper(), logging.INFO),
        format="%(asctime)s %(levelname)s %(name)s: %(message)s",
    )
    # httpx logs full request URLs at INFO; keep it quiet.
    logging.getLogger("httpx").setLevel(logging.WARNING)


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    settings = get_settings()
    _configure_logging(settings.log_level)
    app.state.runner = JobRunner(settings)
    if not settings.processor_token:
        logger.warning("PROCESSOR_TOKEN is not set – /jobs and /extract will return 503")
    if not settings.supabase_configured:
        logger.warning("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are not set – /jobs will return 503")
    yield
    app.state.runner.shutdown()


def create_app() -> FastAPI:
    settings = get_settings()
    docs = "/docs" if settings.enable_docs else None
    app = FastAPI(
        title="UPTAC Predictor – Document Processor",
        version=__version__,
        lifespan=lifespan,
        docs_url=docs,
        redoc_url=None,
        openapi_url="/openapi.json" if docs else None,
    )

    @app.get("/health")
    def health() -> dict[str, Any]:
        return {
            "status": "ok",
            "extractors": {
                "pymupdf": importlib.util.find_spec("pymupdf") is not None,
                "camelot": camelot_available(),
                "pandas": importlib.util.find_spec("pandas") is not None,
            },
        }

    @app.post("/jobs", status_code=status.HTTP_202_ACCEPTED, dependencies=[Depends(verify_processor_token)])
    def create_job(job: JobRequest, request: Request, settings: Settings = Depends(get_settings)) -> dict[str, Any]:
        if not settings.supabase_configured:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="Processor is not configured: set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.",
            )
        if job.bucket not in settings.bucket_allowlist:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=f"Bucket '{job.bucket}' is not allowed.")
        runner: JobRunner = request.app.state.runner
        queued = runner.submit(job)
        logger.info("job=%s %s", job.job_id, "queued" if queued else "already queued/running")
        return {"accepted": True, "job_id": str(job.job_id), "already_running": not queued}

    @app.post("/extract", dependencies=[Depends(verify_processor_token)])
    async def extract(file: UploadFile = File(...), settings: Settings = Depends(get_settings)) -> JSONResponse:
        data = await _read_limited(file, settings.max_file_bytes)
        name = file.filename or "upload"
        try:
            detect_kind(name, data)
        except UnsupportedFileError as exc:
            raise HTTPException(status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE, detail=str(exc)) from exc
        deadline = time.monotonic() + settings.job_timeout_seconds
        try:
            result = await run_in_threadpool(extract_document, data, name, settings, deadline)
        except ExtractionError as exc:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail=str(exc)) from exc
        return JSONResponse(result.to_payload())

    return app


async def _read_limited(file: UploadFile, max_bytes: int) -> bytes:
    chunks: list[bytes] = []
    total = 0
    while chunk := await file.read(1024 * 1024):
        total += len(chunk)
        if total > max_bytes:
            raise HTTPException(
                status_code=status.HTTP_413_CONTENT_TOO_LARGE,
                detail=f"File exceeds the {max_bytes // (1024 * 1024) or 1} MB upload limit (MAX_FILE_MB).",
            )
        chunks.append(chunk)
    return b"".join(chunks)


app = create_app()
