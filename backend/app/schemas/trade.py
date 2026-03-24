from datetime import datetime

from pydantic import ConfigDict, Field

from app.schemas.base import APIModel


class TradeRequest(APIModel):
    ticker: str = Field(min_length=1, max_length=20, description="Тикер инструмента, например SBER.")
    quantity: int = Field(gt=0, le=1_000_000, description="Количество лотов для сделки.")

    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "ticker": "GAZP",
                "quantity": 5,
            }
        }
    )


class TradeHistoryItem(APIModel):
    id: str
    ticker: str
    asset_name: str
    side: str
    quantity: int
    price: float
    total_amount: float
    created_at: datetime


class TradeResponse(APIModel):
    message: str = Field(description="Человеко-читаемый результат выполнения сделки.")
    trade: TradeHistoryItem = Field(description="Информация о созданной сделке.")
    cash_balance: float = Field(description="Остаток денежных средств после операции.")
