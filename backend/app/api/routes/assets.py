from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.db.database import get_db
from app.schemas.asset import AssetDetailsResponse, AssetListItem, CandleResponse, NewsArticleResponse
from app.services.market_service import MarketService


router = APIRouter(prefix="/assets", tags=["Assets"])


@router.get(
    "",
    response_model=list[AssetListItem],
    summary="Список активов",
    description="Возвращает каталог доступных инструментов с текущей ценой и последним кэшированным прогнозом.",
)
def list_assets(db: Session = Depends(get_db)) -> list[AssetListItem]:
    return MarketService.list_assets(db)


@router.get(
    "/{ticker}",
    response_model=AssetDetailsResponse,
    summary="Карточка актива",
    description="Возвращает подробную информацию по активу, последнюю котировку и текущий ML-прогноз.",
)
def get_asset_details(ticker: str, db: Session = Depends(get_db)) -> AssetDetailsResponse:
    return MarketService.get_asset_details(db, ticker)


@router.get(
    "/{ticker}/candles",
    response_model=list[CandleResponse],
    summary="Свечные данные",
    description="Возвращает исторические свечи для построения графика на frontend.",
)
def get_asset_candles(
    ticker: str,
    days: int = Query(default=30, ge=1, le=365),
    db: Session = Depends(get_db),
) -> list[CandleResponse]:
    return MarketService.get_candles(db, ticker=ticker, days=days)


@router.get(
    "/{ticker}/news",
    response_model=list[NewsArticleResponse],
    summary="Новости по активу",
    description="Возвращает новостной фон по выбранному инструменту.",
)
def get_asset_news(
    ticker: str,
    limit: int = Query(default=5, ge=1, le=20),
    db: Session = Depends(get_db),
) -> list[NewsArticleResponse]:
    return MarketService.get_news(db, ticker=ticker, limit=limit)
