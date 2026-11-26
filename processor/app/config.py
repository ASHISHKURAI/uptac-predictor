"""Environment-driven settings for the document processor."""

from __future__ import annotations

from functools import lru_cache

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Runtime configuration from environment variables (or a local .env file)."""

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    processor_token: str | None = Field(default=None, description="Shared secret for X-Processor-Token")
    supabase_url: str | None = None
    supabase_service_role_key: str | None = None
    supabase_anon_key: str | None = None

    allowed_buckets: str = "official-documents"
    callback_function: str = "process-import"

    max_file_mb: float = 50.0
    max_pdf_pages: int = 1500
    job_timeout_seconds: float = 900.0
    max_concurrent_jobs: int = 2

    callback_attempts: int = 3
    callback_backoff_seconds: float = 1.0
    http_timeout_seconds: float = 60.0

    log_level: str = "INFO"
    enable_docs: bool = False

    @field_validator("processor_token", "supabase_url", "supabase_service_role_key", "supabase_anon_key", mode="before")
    @classmethod
    def _blank_to_none(cls, value: object) -> object:
        if isinstance(value, str):
            value = value.strip()
            return value or None
        return value

    @field_validator("supabase_url")
    @classmethod
    def _strip_trailing_slash(cls, value: str | None) -> str | None:
        return value.rstrip("/") if value else value

    @property
    def max_file_bytes(self) -> int:
        return int(self.max_file_mb * 1024 * 1024)

    @property
    def bucket_allowlist(self) -> set[str]:
        return {b.strip() for b in self.allowed_buckets.split(",") if b.strip()}

    @property
    def supabase_configured(self) -> bool:
        return bool(self.supabase_url and self.supabase_service_role_key)

    @property
    def callback_bearer(self) -> str | None:
        return self.supabase_anon_key or self.supabase_service_role_key


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()
