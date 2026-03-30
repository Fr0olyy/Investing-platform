from fastapi import APIRouter, Depends
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.core.config import settings
from app.db.database import get_db
from app.schemas.system import BackgroundRefreshResponse, HealthResponse
from app.services.bootstrap_service import background_jobs_enabled
from app.services.market_service import MarketService
from app.services.ml_service import MLService


router = APIRouter(prefix="/system", tags=["System"])


@router.get(
    "/health",
    response_model=HealthResponse,
    summary="Проверка здоровья сервиса",
    description="Показывает, что backend запущен, БД доступна, а системные задачи готовы к работе.",
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
    description="Синхронизирует реальные котировки, дневные свечи и макроиндикаторы. При недоступности внешних API падает на fallback-режим.",
)
def refresh_market_data(db: Session = Depends(get_db)) -> BackgroundRefreshResponse:
    quotes_updated = MarketService.refresh_market_snapshot(db, source="manual-refresh")
    return BackgroundRefreshResponse(
        message="Рыночные данные обновлены.",
        affected_records=quotes_updated,
    )


@router.post(
    "/ml/train",
    response_model=BackgroundRefreshResponse,
    summary="Обучение ML-моделей",
    description="Собирает реальные исторические ряды, обучает линейные модели по каждому активу и сохраняет артефакты на диск.",
)
def train_models(db: Session = Depends(get_db)) -> BackgroundRefreshResponse:
    trained_models = MLService.train_models(db)
    return BackgroundRefreshResponse(
        message="ML-модели обучены.",
        affected_records=trained_models,
    )


@router.post(
    "/ml/refresh",
    response_model=BackgroundRefreshResponse,
    summary="Пересчет прогнозов",
    description="Использует обученные модели и актуальные макрофакторы для обновления кэша прогнозов.",
)
def refresh_ml_predictions(db: Session = Depends(get_db)) -> BackgroundRefreshResponse:
    predictions_updated = MLService.refresh_predictions(db)
    return BackgroundRefreshResponse(
        message="Кэш прогнозов обновлен.",
        affected_records=predictions_updated,
    )
