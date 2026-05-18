from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.db.database import get_db
from app.schemas.ml import ModelMetadataResponse, PredictionResponse, ScenarioRequest, ScenarioResponse
from app.services.ml_service import MLService


router = APIRouter(prefix="/ml", tags=["ML Sandbox"])


@router.get(
    "/predictions/{ticker}",
    response_model=PredictionResponse,
    summary="Получить прогноз по активу",
    description="Возвращает последний кэшированный прогноз цены по выбранному инструменту.",
)
def get_prediction(
    ticker: str,
    horizon_days: int = Query(default=7, ge=1, le=180, description="Горизонт прогноза в торговых днях."),
    db: Session = Depends(get_db),
) -> PredictionResponse:
    return MLService.get_prediction(db, ticker, horizon_days=horizon_days)


@router.get(
    "/models/{ticker}",
    response_model=ModelMetadataResponse,
    summary="Метаданные ML-модели",
    description="Возвращает информацию об обученной модели, коэффициентах, метриках и артефактах.",
)
def get_model_metadata(ticker: str, db: Session = Depends(get_db)) -> ModelMetadataResponse:
    return MLService.get_model_metadata(db, ticker)


@router.post(
    "/scenario",
    response_model=ScenarioResponse,
    summary="Сценарный макро-анализ",
    description="Считает сценарную цену актива на основе пользовательских значений макрофакторов.",
)
def simulate_scenario(payload: ScenarioRequest, db: Session = Depends(get_db)) -> ScenarioResponse:
    return MLService.simulate_scenario(db, payload)
