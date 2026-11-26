from __future__ import annotations

from collections.abc import Iterator

import pytest
from fastapi.testclient import TestClient

from app.config import Settings, get_settings

TOKEN = "test-processor-token-0123456789"
SUPABASE_URL = "https://project-ref.supabase.test"
SERVICE_KEY = "service-role-key-for-tests"
ANON_KEY = "anon-key-for-tests"


def make_settings(**overrides: object) -> Settings:
    values: dict[str, object] = {
        "processor_token": TOKEN,
        "supabase_url": SUPABASE_URL,
        "supabase_service_role_key": SERVICE_KEY,
        "supabase_anon_key": ANON_KEY,
        "callback_backoff_seconds": 0.0,
        "max_concurrent_jobs": 1,
    }
    values.update(overrides)
    return Settings(_env_file=None, **values)  # type: ignore[call-arg]


@pytest.fixture
def settings() -> Settings:
    return make_settings()


@pytest.fixture
def client_factory(monkeypatch: pytest.MonkeyPatch) -> Iterator[object]:
    """Builds a TestClient whose get_settings() returns the given settings."""
    from app.main import create_app

    clients: list[TestClient] = []

    def build(**overrides: object) -> TestClient:
        cfg = make_settings(**overrides)
        monkeypatch.setattr("app.main.get_settings", lambda: cfg)
        app = create_app()
        app.dependency_overrides[get_settings] = lambda: cfg
        client = TestClient(app)
        client.__enter__()
        clients.append(client)
        return client

    yield build
    for c in clients:
        c.__exit__(None, None, None)
