"""API surface: health, authentication, upload validation."""

from __future__ import annotations

import uuid

from tests.conftest import TOKEN
from tests.factories import ORCR_HEADER, ruled_table_pdf, xlsx_bytes

AUTH = {"X-Processor-Token": TOKEN}


def job_body(**over: object) -> dict[str, object]:
    body: dict[str, object] = {
        "job_id": str(uuid.uuid4()),
        "bucket": "official-documents",
        "storage_path": "imports/2026/orcr.pdf",
        "file_name": "orcr.pdf",
        "mime_type": "application/pdf",
    }
    body.update(over)
    return body


def test_health_needs_no_auth(client_factory) -> None:
    client = client_factory()
    response = client.get("/health")
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "ok"
    assert set(body["extractors"]) == {"pymupdf", "camelot", "pandas"}
    assert body["extractors"]["pymupdf"] is True and body["extractors"]["pandas"] is True


def test_jobs_rejects_missing_or_wrong_token(client_factory) -> None:
    client = client_factory()
    assert client.post("/jobs", json=job_body()).status_code == 401
    assert client.post("/jobs", json=job_body(), headers={"X-Processor-Token": "wrong"}).status_code == 401


def test_endpoints_return_503_without_processor_token(client_factory) -> None:
    client = client_factory(processor_token=None)
    response = client.post("/jobs", json=job_body(), headers=AUTH)
    assert response.status_code == 503
    assert "PROCESSOR_TOKEN" in response.json()["detail"]
    assert client.post("/extract", files={"file": ("a.csv", b"a,b\n1,2\n")}, headers=AUTH).status_code == 503


def test_jobs_returns_503_without_supabase_config(client_factory) -> None:
    client = client_factory(supabase_service_role_key=None)
    response = client.post("/jobs", json=job_body(), headers=AUTH)
    assert response.status_code == 503
    assert "SUPABASE" in response.json()["detail"]


def test_jobs_accepts_and_queues(client_factory, monkeypatch) -> None:
    client = client_factory()
    submitted: list[str] = []
    monkeypatch.setattr(client.app.state.runner, "submit", lambda job: submitted.append(str(job.job_id)) or True)
    body = job_body()
    response = client.post("/jobs", json=body, headers=AUTH)
    assert response.status_code == 202
    assert response.json() == {"accepted": True, "job_id": body["job_id"], "already_running": False}
    assert submitted == [body["job_id"]]


def test_jobs_validates_body(client_factory) -> None:
    client = client_factory()
    assert client.post("/jobs", json=job_body(storage_path="../secrets.txt"), headers=AUTH).status_code == 422
    assert client.post("/jobs", json=job_body(job_id="not-a-uuid"), headers=AUTH).status_code == 422
    assert client.post("/jobs", json=job_body(bucket="other-bucket"), headers=AUTH).status_code == 403


def test_extract_pdf_synchronously(client_factory) -> None:
    client = client_factory()
    pdf = ruled_table_pdf([[ORCR_HEADER, ["R1", "GOVT TEST INSTITUTE, ALPHA", "Civil Engineering", "OPNO", "10", "20"]]])
    response = client.post("/extract", files={"file": ("orcr.pdf", pdf, "application/pdf")}, headers=AUTH)
    assert response.status_code == 200
    payload = response.json()
    assert payload["meta"] == {"extractor": "pymupdf", "pages": 1, "file_name": "orcr.pdf", "warnings": []}
    assert payload["tables"][0]["page"] == 1
    assert payload["tables"][0]["rows"][1] == ["R1", "GOVT TEST INSTITUTE, ALPHA", "Civil Engineering", "OPNO", "10", "20"]


def test_extract_rejects_wrong_magic_bytes(client_factory) -> None:
    client = client_factory()
    cases = [
        ("fake.pdf", b"this is not a pdf"),
        ("fake.xlsx", b"%PDF-1.7 pretending"),
        ("fake.xls", b"PK\x03\x04 zip, not OLE"),
        ("binary.csv", b"a,b\x00\x01\n"),
        ("malware.exe", b"MZ\x90\x00"),
    ]
    for name, data in cases:
        response = client.post("/extract", files={"file": (name, data)}, headers=AUTH)
        assert response.status_code == 415, name


def test_extract_accepts_real_xlsx(client_factory) -> None:
    client = client_factory()
    data = xlsx_bytes({"Sheet1": [["Institute", "Seats"], ["X", 10]]})
    response = client.post("/extract", files={"file": ("seats.xlsx", data)}, headers=AUTH)
    assert response.status_code == 200
    assert response.json()["tables"][0]["rows"] == [["Institute", "Seats"], ["X", "10"]]


def test_extract_enforces_size_limit(client_factory) -> None:
    client = client_factory(max_file_mb=0.001)  # ~1 KB
    response = client.post("/extract", files={"file": ("big.csv", b"a,b\n" + b"1,2\n" * 1000)}, headers=AUTH)
    assert response.status_code == 413


def test_extract_reports_unreadable_pdf(client_factory) -> None:
    client = client_factory()
    response = client.post("/extract", files={"file": ("broken.pdf", b"%PDF-1.7\n garbage")}, headers=AUTH)
    assert response.status_code == 422
