from datetime import datetime

from pydantic import EmailStr, Field

from app.schemas.base import APIModel


class AdminOverviewResponse(APIModel):
    users_total: int
    active_users: int
    admin_users: int
    assets_total: int
    trades_total: int
    positions_total: int
    news_total: int
    predictions_total: int
    latest_quote_at: datetime | None = None
    background_jobs: bool


class AdminUserResponse(APIModel):
    id: str
    email: EmailStr
    role: str
    is_active: bool
    created_at: datetime
    positions_count: int = 0
    trades_count: int = 0


class AdminUserUpdateRequest(APIModel):
    role: str | None = Field(default=None, pattern="^(investor|admin)$")
    is_active: bool | None = None
