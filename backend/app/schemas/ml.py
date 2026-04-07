from datetime import datetime

from pydantic import ConfigDict, Field

from app.schemas.base import APIModel


class DriverContribution(APIModel):
    code: str = Field(description="Код фактора, например USD_RUB.")
    name: str = Field(description="Человеко-читаемое название фактора.")
    contribution: float = Field(description="Вклад фактора в расчетную цену модели.")
    direction: str = Field(description="Направление влияния: positive или negative.")


class PredictionResponse(APIModel):
    ticker: str = Field(description="Тикер актива.")
    current_price: float = Field(description="Текущая рыночная цена актива.")
    predicted_price: float = Field(description="Расчетная цена на следующий торговый день.")
    impact_percent: float = Field(description="Отклонение прогноза от текущей цены в процентах.")
    confidence_score: float = Field(description="R^2 модели или fallback confidence score.")
    horizon_days: int = Field(description="Горизонт прогноза в торговых днях.")
    summary: str = Field(description="Краткое текстовое описание прогноза.")
    drivers: list[DriverContribution] = Field(description="Факторы, отсортированные по силе влияния.")
    generated_at: datetime = Field(description="Когда прогноз был сгенерирован.")
    is_placeholder: bool = Field(description="True, если использовался fallback без обученной модели.")


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
    ticker: str = Field(description="Тикер актива.")
    current_price: float = Field(description="Текущая рыночная цена.")
    predicted_price: float = Field(description="Сценарная цена после изменения факторов.")
    impact_percent: float = Field(description="Отклонение сценарной цены от рынка.")
    confidence_score: float = Field(description="R^2 соответствующей модели.")
    inputs: dict[str, float] = Field(description="Набор факторов, использованных в расчете.")
    drivers: list[DriverContribution] = Field(description="Вклады факторов в сценарную цену.")
    generated_at: datetime = Field(description="Дата и время расчета.")
    is_placeholder: bool = Field(description="Использовалась ли fallback-модель.")


class ModelMetadataResponse(APIModel):
    ticker: str = Field(description="Тикер актива.")
    model_name: str = Field(description="Название ML-модели.")
    model_version: str = Field(description="Версия артефакта модели.")
    status: str = Field(description="Статус модели.")
    feature_names: list[str] = Field(description="Признаки, используемые моделью.")
    metrics: dict[str, float | str | int] = Field(description="Метрики качества модели.")
    artifact_path: str | None = Field(default=None, description="Путь к сериализованному артефакту.")
    notes: str | None = Field(default=None, description="Пояснения по модели.")
    trained_at: datetime | None = Field(default=None, description="Дата последнего обучения.")
    coefficients: dict[str, float] | None = Field(default=None, description="Коэффициенты линейной модели.")
    training_window_start: str | None = Field(default=None, description="Начало обучающего окна.")
    training_window_end: str | None = Field(default=None, description="Конец обучающего окна.")
