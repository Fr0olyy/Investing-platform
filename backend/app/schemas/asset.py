from datetime import datetime

from app.schemas.base import APIModel
from app.schemas.ml import PredictionResponse


class QuoteSnapshot(APIModel):
    price: float
    open: float
    high: float
    low: float
    close: float
    prev_close: float
    change_percent: float
    volume: int
    recorded_at: datetime
    source: str


class AssetListItem(APIModel):
    ticker: str
    name: str
    sector: str
    currency: str
    exchange: str
    lot_size: int
    current_price: float
    change_percent: float
    latest_prediction: float | None = None
    confidence_score: float | None = None


class AssetDetailsResponse(APIModel):
    ticker: str
    name: str
    sector: str
    currency: str
    exchange: str
    board: str
    lot_size: int
    description: str | None = None
    latest_quote: QuoteSnapshot
    latest_prediction: PredictionResponse | None = None
    model_ready: bool


class CandleResponse(APIModel):
    interval: str
    timestamp: datetime
    open: float
    high: float
    low: float
    close: float
    volume: int


class NewsArticleResponse(APIModel):
    title: str
    summary: str
    url: str
    source: str
    sentiment: str
    published_at: datetime
