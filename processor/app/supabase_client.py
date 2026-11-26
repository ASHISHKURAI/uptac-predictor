"""Minimal Supabase Storage + Edge Function client (server-side, service role)."""

from __future__ import annotations

import json
import logging
import time
from typing import Any
from urllib.parse import quote

import httpx

from .config import Settings
from .models import ExtractionError

logger = logging.getLogger(__name__)

_RETRYABLE_STATUS = {408, 425, 429, 500, 502, 503, 504}


class SupabaseClient:
    """Talks to Supabase with the service role key. Never logs keys or headers."""

    def __init__(self, settings: Settings, http: httpx.Client | None = None) -> None:
        if not settings.supabase_configured:
            raise ExtractionError("Supabase is not configured: set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.")
        self._settings = settings
        self._base = settings.supabase_url or ""
        self._http = http or httpx.Client(timeout=settings.http_timeout_seconds, follow_redirects=False)
        self._owns_http = http is None

    def close(self) -> None:
        if self._owns_http:
            self._http.close()

    def __enter__(self) -> "SupabaseClient":
        return self

    def __exit__(self, *_: object) -> None:
        self.close()

    def _storage_headers(self) -> dict[str, str]:
        key = self._settings.supabase_service_role_key or ""
        return {"Authorization": f"Bearer {key}", "apikey": key}

    def object_url(self, bucket: str, path: str) -> str:
        return f"{self._base}/storage/v1/object/{quote(bucket, safe='')}/{quote(path, safe='/')}"

    def download(self, bucket: str, path: str, max_bytes: int) -> bytes:
        url = self.object_url(bucket, path)
        try:
            with self._http.stream("GET", url, headers=self._storage_headers()) as response:
                if response.status_code != 200:
                    raise ExtractionError(f"Could not download the document from storage (HTTP {response.status_code}).")
                declared = response.headers.get("content-length")
                if declared and declared.isdigit() and int(declared) > max_bytes:
                    raise ExtractionError("The stored document is larger than the MAX_FILE_MB limit.")
                chunks: list[bytes] = []
                total = 0
                for chunk in response.iter_bytes():
                    total += len(chunk)
                    if total > max_bytes:
                        raise ExtractionError("The stored document is larger than the MAX_FILE_MB limit.")
                    chunks.append(chunk)
                return b"".join(chunks)
        except httpx.HTTPError as exc:
            raise ExtractionError(f"Could not download the document from storage ({type(exc).__name__}).") from exc

    def upload_json(self, bucket: str, path: str, payload: dict[str, Any]) -> None:
        body = json.dumps(payload, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
        headers = {**self._storage_headers(), "Content-Type": "application/json", "x-upsert": "true"}
        try:
            response = self._http.post(self.object_url(bucket, path), content=body, headers=headers)
        except httpx.HTTPError as exc:
            raise ExtractionError(f"Could not save the extracted tables to storage ({type(exc).__name__}).") from exc
        if response.status_code not in (200, 201):
            raise ExtractionError(f"Could not save the extracted tables to storage (HTTP {response.status_code}).")

    def callback(self, payload: dict[str, Any]) -> bool:
        """POSTs to the process-import Edge Function, retrying transient failures. Returns success."""
        url = f"{self._base}/functions/v1/{self._settings.callback_function}"
        bearer = self._settings.callback_bearer or ""
        headers = {
            "Content-Type": "application/json",
            "X-Processor-Token": self._settings.processor_token or "",
            "Authorization": f"Bearer {bearer}",
            "apikey": bearer,
        }
        attempts = max(1, self._settings.callback_attempts)
        for attempt in range(1, attempts + 1):
            try:
                response = self._http.post(url, json=payload, headers=headers)
                if response.status_code < 300:
                    return True
                retryable = response.status_code in _RETRYABLE_STATUS
                logger.warning(
                    "callback job=%s stage=%s attempt=%s/%s returned HTTP %s",
                    payload.get("job_id"), payload.get("stage"), attempt, attempts, response.status_code,
                )
                if not retryable:
                    return False
            except httpx.HTTPError as exc:
                logger.warning(
                    "callback job=%s stage=%s attempt=%s/%s failed: %s",
                    payload.get("job_id"), payload.get("stage"), attempt, attempts, type(exc).__name__,
                )
            if attempt < attempts:
                time.sleep(self._settings.callback_backoff_seconds * (2 ** (attempt - 1)))
        return False
