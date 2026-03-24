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
