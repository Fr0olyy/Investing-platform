from pydantic import Field

from app.schemas.base import APIModel


class HealthResponse(APIModel):
    status: str
    database: str
    environment: str
    background_jobs: bool
    docs_url: str
    redoc_url: str


class BackgroundRefreshResponse(APIModel):
    message: str
    affected_records: int


class MLTrainingDiagnostic(APIModel):
    ticker: str
    status: str
    reason: str | None = None
    rows: int | None = None
    test_rows: int | None = None


class MLTrainingResponse(BackgroundRefreshResponse):
    diagnostics: list[MLTrainingDiagnostic] = Field(default_factory=list)
