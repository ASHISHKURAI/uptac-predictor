"""Background job flow with Supabase Storage and the Edge Function mocked (respx)."""

from __future__ import annotations

import json
import time
import uuid

import httpx
import respx

from app.jobs import GENERIC_ERROR, JobRunner, process_job
from app.models import JobRequest
from tests.conftest import ANON_KEY, SERVICE_KEY, SUPABASE_URL, TOKEN, make_settings

BUCKET = "official-documents"
CALLBACK = f"{SUPABASE_URL}/functions/v1/process-import"


def make_job(path: str = "imports/2026/OR CR round 1.csv", name: str = "orcr.csv") -> JobRequest:
    return JobRequest(job_id=uuid.uuid4(), bucket=BUCKET, storage_path=path, file_name=name, mime_type="text/csv")


def object_url(path: str) -> str:
    from urllib.parse import quote

    return f"{SUPABASE_URL}/storage/v1/object/{BUCKET}/{quote(path, safe='/')}"


@respx.mock
def test_successful_job_uploads_json_and_calls_back() -> None:
    settings = make_settings()
    job = make_job()
    respx.get(object_url(job.storage_path)).mock(return_value=httpx.Response(200, content=b"Institute,Branch\nX,Civil\n"))
    upload = respx.post(object_url(f"extracted/{job.job_id}.json")).mock(return_value=httpx.Response(200, json={"Key": "x"}))
    callback = respx.post(CALLBACK).mock(return_value=httpx.Response(200, json={"ok": True}))

    assert process_job(job, settings) is True

    assert upload.call_count == 1
    up = upload.calls.last.request
    assert up.headers["x-upsert"] == "true"
    assert up.headers["content-type"] == "application/json"
    assert up.headers["authorization"] == f"Bearer {SERVICE_KEY}"
    payload = json.loads(up.content)
    assert payload["tables"] == [{"page": None, "name": None, "rows": [["Institute", "Branch"], ["X", "Civil"]]}]
    assert payload["meta"]["extractor"] == "pandas" and payload["meta"]["file_name"] == "orcr.csv"

    cb = callback.calls.last.request
    assert json.loads(cb.content) == {"job_id": str(job.job_id), "stage": "extracted", "extracted_path": f"extracted/{job.job_id}.json"}
    assert cb.headers["x-processor-token"] == TOKEN
    assert cb.headers["authorization"] == f"Bearer {ANON_KEY}"
    assert cb.headers["apikey"] == ANON_KEY


@respx.mock
def test_download_failure_reports_failed_stage() -> None:
    settings = make_settings()
    job = make_job()
    respx.get(object_url(job.storage_path)).mock(return_value=httpx.Response(404, json={"error": "not found"}))
    callback = respx.post(CALLBACK).mock(return_value=httpx.Response(200))

    assert process_job(job, settings) is False
    body = json.loads(callback.calls.last.request.content)
    assert body["stage"] == "failed" and body["job_id"] == str(job.job_id)
    assert "HTTP 404" in body["error"]


@respx.mock
def test_invalid_file_content_reports_failed_stage() -> None:
    settings = make_settings()
    job = make_job(path="imports/fake.pdf", name="fake.pdf")
    respx.get(object_url(job.storage_path)).mock(return_value=httpx.Response(200, content=b"not a pdf"))
    callback = respx.post(CALLBACK).mock(return_value=httpx.Response(200))

    assert process_job(job, settings) is False
    body = json.loads(callback.calls.last.request.content)
    assert body["stage"] == "failed" and "not a PDF" in body["error"]


@respx.mock
def test_unexpected_crash_still_calls_back(monkeypatch) -> None:
    settings = make_settings()
    job = make_job()
    respx.get(object_url(job.storage_path)).mock(return_value=httpx.Response(200, content=b"a,b\n1,2\n"))
    callback = respx.post(CALLBACK).mock(return_value=httpx.Response(200))

    def boom(*_a: object, **_k: object) -> None:
        raise RuntimeError("secret internal detail")

    monkeypatch.setattr("app.jobs.extract_document", boom)
    assert process_job(job, settings) is False
    body = json.loads(callback.calls.last.request.content)
    assert body == {"job_id": str(job.job_id), "stage": "failed", "error": GENERIC_ERROR}


@respx.mock
def test_callback_is_retried_on_server_errors() -> None:
    settings = make_settings(callback_attempts=3)
    job = make_job()
    respx.get(object_url(job.storage_path)).mock(return_value=httpx.Response(200, content=b"a,b\n1,2\n"))
    respx.post(object_url(f"extracted/{job.job_id}.json")).mock(return_value=httpx.Response(200))
    callback = respx.post(CALLBACK).mock(
        side_effect=[httpx.Response(503), httpx.ConnectError("down"), httpx.Response(200)]
    )
    assert process_job(job, settings) is True
    assert callback.call_count == 3


@respx.mock
def test_callback_gives_up_after_max_attempts_and_not_on_client_errors() -> None:
    settings = make_settings(callback_attempts=3)
    job = make_job()
    respx.get(object_url(job.storage_path)).mock(return_value=httpx.Response(200, content=b"a,b\n1,2\n"))
    respx.post(object_url(f"extracted/{job.job_id}.json")).mock(return_value=httpx.Response(200))
    callback = respx.post(CALLBACK).mock(return_value=httpx.Response(500))
    assert process_job(job, settings) is False
    assert callback.call_count == 3

    # a 401 (e.g. wrong token) is not retried
    callback.mock(return_value=httpx.Response(401))
    job2 = make_job(path="imports/second.csv")
    respx.get(object_url(job2.storage_path)).mock(return_value=httpx.Response(200, content=b"a\n1\n"))
    respx.post(object_url(f"extracted/{job2.job_id}.json")).mock(return_value=httpx.Response(200))
    before = callback.call_count
    assert process_job(job2, settings) is False
    assert callback.call_count - before == 1


@respx.mock
def test_upload_failure_reports_failed_stage() -> None:
    settings = make_settings()
    job = make_job()
    respx.get(object_url(job.storage_path)).mock(return_value=httpx.Response(200, content=b"a,b\n1,2\n"))
    respx.post(object_url(f"extracted/{job.job_id}.json")).mock(return_value=httpx.Response(400))
    callback = respx.post(CALLBACK).mock(return_value=httpx.Response(200))
    assert process_job(job, settings) is False
    assert "HTTP 400" in json.loads(callback.calls.last.request.content)["error"]


def test_runner_deduplicates_and_runs_in_background() -> None:
    settings = make_settings(max_concurrent_jobs=2)
    seen: list[str] = []

    def worker(job: JobRequest, _settings: object) -> bool:
        time.sleep(0.2)
        seen.append(str(job.job_id))
        return True

    runner = JobRunner(settings, worker=worker)
    job = make_job()
    assert runner.submit(job) is True
    assert runner.submit(job) is False  # already queued/running
    deadline = time.monotonic() + 5
    while runner.active_jobs and time.monotonic() < deadline:
        time.sleep(0.02)
    assert seen == [str(job.job_id)]
    assert runner.submit(job) is True  # can be retried after it finished
    runner.shutdown()
