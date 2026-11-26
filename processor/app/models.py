"""Request / result models shared by the API, the job runner and the extractors."""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Any, Literal
from uuid import UUID

from pydantic import BaseModel, Field, field_validator

Extractor = Literal["pymupdf", "camelot", "pandas"]
FileKind = Literal["pdf", "csv", "xlsx", "xls"]

_SAFE_PATH = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._\- /()]{0,510}$")


@dataclass
class Table:
    """One extracted table; every cell is a whitespace-normalised string."""

    rows: list[list[str]]
    page: int | None = None
    name: str | None = None

    def to_dict(self) -> dict[str, Any]:
        return {"page": self.page, "name": self.name, "rows": self.rows}


@dataclass
class ExtractionResult:
    tables: list[Table]
    extractor: Extractor
    file_name: str
    pages: int | None = None
    warnings: list[str] = field(default_factory=list)

    def to_payload(self) -> dict[str, Any]:
        return {
            "tables": [t.to_dict() for t in self.tables],
            "meta": {
                "extractor": self.extractor,
                "pages": self.pages,
                "file_name": self.file_name,
                "warnings": list(self.warnings),
            },
        }


class JobRequest(BaseModel):
    """Body of POST /jobs, sent by the process-import Edge Function."""

    job_id: UUID
    bucket: str = Field(min_length=1, max_length=63, pattern=r"^[a-z0-9][a-z0-9._-]*$")
    storage_path: str = Field(min_length=1, max_length=512)
    file_name: str = Field(min_length=1, max_length=255)
    mime_type: str | None = Field(default=None, max_length=255)

    @field_validator("storage_path")
    @classmethod
    def _safe_storage_path(cls, value: str) -> str:
        if value.startswith("/") or ".." in value.split("/") or "\\" in value or not _SAFE_PATH.match(value):
            raise ValueError("storage_path must be a relative object path without '..' segments")
        return value


class ExtractionError(Exception):
    """A document could not be processed; the message is safe to show to administrators."""


class UnsupportedFileError(ExtractionError):
    """The file type is not allowed or its content does not match its extension."""


class ExtractionTimeoutError(ExtractionError):
    """Processing exceeded JOB_TIMEOUT_SECONDS."""
