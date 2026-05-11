from fastapi import APIRouter, Depends, Query
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.api.dependencies import get_current_admin
from app.core.config import settings
from app.db.database import get_db
from app.db.models import User
from app.schemas.system import BackgroundRefreshResponse, HealthResponse
from app.services.bootstrap_service import background_jobs_enabled
from app.services.market_service import MarketService
from app.services.ml_service import MLService


router = APIRouter(prefix="/system", tags=["System"])


@router.get(
    "/health",
    response_model=HealthResponse,
    summary="Проверка здоровья сервиса",
    description="Показывает, что backend запущен и база данных доступна.",
)
def healthcheck(db: Session = Depends(get_db)) -> HealthResponse:
    db.execute(text("SELECT 1"))
    return HealthResponse(
        status="ok",
        database="connected",
        environment=settings.ENVIRONMENT,
        background_jobs=background_jobs_enabled(),
        docs_url="/docs",
        redoc_url="/redoc",
    )


@router.post(
    "/market/refresh",
    response_model=BackgroundRefreshResponse,
    summary="Ручное обновление рынка",
    description="Обновляет котировки, свечи и макроиндикаторы.",
)
def refresh_market_data(
    db: Session = Depends(get_db),
    _current_admin: User = Depends(get_current_admin),
) -> BackgroundRefreshResponse:
    quotes_updated = MarketService.refresh_market_snapshot(db, source="manual-refresh")
    return BackgroundRefreshResponse(
        message="Рыночные данные обновлены.",
        affected_records=quotes_updated,
    )


@router.post(
    "/ml/train",
    response_model=BackgroundRefreshResponse,
    summary="Обучение ML-моделей",
    description="Обучает модели по доступным активам.",
)
def train_models(
    db: Session = Depends(get_db),
    _current_admin: User = Depends(get_current_admin),
) -> BackgroundRefreshResponse:
    trained_models = MLService.train_models(db)
    return BackgroundRefreshResponse(
        message="ML-модели обучены.",
        affected_records=trained_models,
    )


@router.post(
    "/ml/refresh",
    response_model=BackgroundRefreshResponse,
    summary="Пересчёт прогнозов",
    description="Обновляет кэш прогнозов на основе текущих данных.",
)
def refresh_ml_predictions(
    db: Session = Depends(get_db),
    _current_admin: User = Depends(get_current_admin),
) -> BackgroundRefreshResponse:
    predictions_updated = MLService.refresh_predictions(db)
    return BackgroundRefreshResponse(
        message="Кэш прогнозов обновлён.",
        affected_records=predictions_updated,
    )


@router.post(
    "/news/refresh",
    response_model=BackgroundRefreshResponse,
    summary="Ручное обновление новостей",
    description="Принудительно подтягивает новости из внешних источников.",
)
def refresh_news(
    ticker: str | None = Query(default=None, description="Тикер. Если не указан, обновляются все активы."),
    per_asset_limit: int = Query(default=10, ge=1, le=50, description="Лимит новостей на один актив."),
    db: Session = Depends(get_db),
    _current_admin: User = Depends(get_current_admin),
) -> BackgroundRefreshResponse:
    inserted = MarketService.refresh_news(db, ticker=ticker, per_asset_limit=per_asset_limit)
    scope = f"по тикеру {ticker.upper()}" if ticker else "по всем активам"
    return BackgroundRefreshResponse(
        message=f"Новости обновлены {scope}.",
        affected_records=inserted,
    )
