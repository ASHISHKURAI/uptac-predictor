"""Background job runner: download → extract → upload JSON → callback."""

from __future__ import annotations

import logging
import threading
import time
from collections.abc import Callable
from concurrent.futures import Future, ThreadPoolExecutor

import httpx

from .config import Settings
from .extract import extract_document
from .models import ExtractionError, JobRequest
from .supabase_client import SupabaseClient

logger = logging.getLogger(__name__)

GENERIC_ERROR = "Unexpected error while processing the document. Check the processor logs."


def extracted_path(job_id: str) -> str:
    return f"extracted/{job_id}.json"


def process_job(job: JobRequest, settings: Settings, http: httpx.Client | None = None) -> bool:
    """Runs one import job end-to-end. Always attempts a callback. Returns True on success."""
    job_id = str(job.job_id)
    started = time.monotonic()
    deadline = started + settings.job_timeout_seconds
    try:
        client = SupabaseClient(settings, http)
    except ExtractionError as exc:
        logger.error("job=%s cannot start: %s", job_id, exc)
        return False

    with client:
        try:
            logger.info("job=%s downloading %s/%s", job_id, job.bucket, job.storage_path)
            data = client.download(job.bucket, job.storage_path, settings.max_file_bytes)
            result = extract_document(data, job.file_name, settings, deadline=deadline)
            payload = result.to_payload()
            path = extracted_path(job_id)
            client.upload_json(job.bucket, path, payload)
            logger.info(
                "job=%s extracted %s table(s), %s row(s) with %s in %.1fs",
                job_id, len(result.tables), sum(len(t.rows) for t in result.tables), result.extractor,
                time.monotonic() - started,
            )
            ok = client.callback({"job_id": job_id, "stage": "extracted", "extracted_path": path})
            if not ok:
                logger.error("job=%s extraction stored but the callback could not be delivered", job_id)
            return ok
        except ExtractionError as exc:
            message = str(exc)
            logger.warning("job=%s failed: %s", job_id, message)
        except Exception:  # never leave a job hanging without a callback
            message = GENERIC_ERROR
            logger.exception("job=%s crashed", job_id)
        client.callback({"job_id": job_id, "stage": "failed", "error": message})
        return False


class JobRunner:
    """Bounded thread pool that de-duplicates concurrent submissions of the same job id."""

    def __init__(self, settings: Settings, worker: Callable[[JobRequest, Settings], bool] = process_job) -> None:
        self._settings = settings
        self._worker = worker
        self._executor = ThreadPoolExecutor(max_workers=max(1, settings.max_concurrent_jobs), thread_name_prefix="job")
        self._active: set[str] = set()
        self._lock = threading.Lock()

    def submit(self, job: JobRequest) -> bool:
        """Queues a job. Returns False when the same job id is already queued or running."""
        job_id = str(job.job_id)
        with self._lock:
            if job_id in self._active:
                return False
            self._active.add(job_id)
        future: Future[bool] = self._executor.submit(self._worker, job, self._settings)
        future.add_done_callback(lambda _f: self._release(job_id))
        return True

    def _release(self, job_id: str) -> None:
        with self._lock:
            self._active.discard(job_id)

    @property
    def active_jobs(self) -> int:
        with self._lock:
            return len(self._active)

    def shutdown(self) -> None:
        self._executor.shutdown(wait=False, cancel_futures=True)
