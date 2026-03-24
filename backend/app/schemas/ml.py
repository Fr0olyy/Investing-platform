from datetime import datetime

from pydantic import ConfigDict, Field

from app.schemas.base import APIModel


class DriverContribution(APIModel):
    code: str = Field(description="Код фактора, например USD_RUB.")
    name: str = Field(description="Человеко-читаемое название фактора.")
    contribution: float = Field(description="Вклад фактора в изменение цены.")
    direction: str = Field(description="Направление влияния: positive или negative.")


class PredictionResponse(APIModel):
    ticker: str
    current_price: float
    predicted_price: float
    impact_percent: float
    confidence_score: float
    horizon_days: int
    summary: str
    drivers: list[DriverContribution]
    generated_at: datetime
    is_placeholder: bool


class ScenarioRequest(APIModel):
    ticker: str = Field(description="Тикер актива для сценарного расчета.")
    factors: dict[str, float] = Field(
        default_factory=dict,
        description="Пользовательские значения макрофакторов.",
    )

    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "ticker": "GAZP",
                "factors": {
                    "BRENT": 88.5,
                    "USD_RUB": 97.2,
                    "IMOEX": 3300,
                    "KEY_RATE": 15.0,
                    "RGBI": 109.3,
                },
            }
        }
    )


class ScenarioResponse(APIModel):
    ticker: str
    current_price: float
    predicted_price: float
    impact_percent: float
    confidence_score: float
    inputs: dict[str, float]
    drivers: list[DriverContribution]
    generated_at: datetime
    is_placeholder: bool


class ModelMetadataResponse(APIModel):
    ticker: str
    model_name: str
    model_version: str
    status: str
    feature_names: list[str]
    metrics: dict[str, float | str]
    artifact_path: str | None = None
    notes: str | None = None
    trained_at: datetime | None = None
