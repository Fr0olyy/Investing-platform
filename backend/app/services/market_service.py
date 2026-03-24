from __future__ import annotations

from datetime import datetime, timedelta
from decimal import Decimal, ROUND_HALF_UP
from random import uniform

from fastapi import HTTPException, status
from sqlalchemy import desc, select
from sqlalchemy.orm import Session

from app.db.models import Asset, Candle, MacroIndicatorSnapshot, NewsArticle, Prediction, Quote
from app.schemas.asset import AssetDetailsResponse, AssetListItem, CandleResponse, NewsArticleResponse, QuoteSnapshot
from app.schemas.ml import DriverContribution, PredictionResponse


def money(value: Decimal | float | int) -> Decimal:
    return Decimal(str(value)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


class MarketService:
    @staticmethod
    def get_asset_or_404(db: Session, ticker: str) -> Asset:
        asset = db.scalar(select(Asset).where(Asset.ticker == ticker.upper(), Asset.is_active.is_(True)))
        if not asset:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Asset not found.")
        return asset

    @staticmethod
    def get_latest_quote(db: Session, asset_id: str) -> Quote:
        quote = db.scalar(select(Quote).where(Quote.asset_id == asset_id).order_by(desc(Quote.recorded_at)).limit(1))
        if not quote:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Quote not found.")
        return quote

    @staticmethod
    def get_latest_prediction(db: Session, asset_id: str) -> Prediction | None:
        return db.scalar(
            select(Prediction).where(Prediction.asset_id == asset_id).order_by(desc(Prediction.generated_at)).limit(1)
        )

    @staticmethod
    def list_assets(db: Session) -> list[AssetListItem]:
        assets = db.scalars(select(Asset).where(Asset.is_active.is_(True)).order_by(Asset.ticker)).all()
        items: list[AssetListItem] = []
        for asset in assets:
            quote = MarketService.get_latest_quote(db, asset.id)
            prediction = MarketService.get_latest_prediction(db, asset.id)
            items.append(
                AssetListItem(
                    ticker=asset.ticker,
                    name=asset.name,
                    sector=asset.sector,
                    currency=asset.currency,
                    exchange=asset.exchange,
                    lot_size=asset.lot_size,
                    current_price=float(quote.price),
                    change_percent=float(quote.change_percent),
                    latest_prediction=float(prediction.predicted_price) if prediction else None,
                    confidence_score=float(prediction.confidence_score) if prediction else None,
                )
            )
        return items

    @staticmethod
    def get_asset_details(db: Session, ticker: str) -> AssetDetailsResponse:
        asset = MarketService.get_asset_or_404(db, ticker)
        quote = MarketService.get_latest_quote(db, asset.id)
        prediction = MarketService.get_latest_prediction(db, asset.id)
        return AssetDetailsResponse(
            ticker=asset.ticker,
            name=asset.name,
            sector=asset.sector,
            currency=asset.currency,
            exchange=asset.exchange,
            board=asset.board,
            lot_size=asset.lot_size,
            description=asset.description,
            latest_quote=QuoteSnapshot.model_validate(quote),
            latest_prediction=MarketService._serialize_prediction(asset, prediction) if prediction else None,
            model_ready=asset.ml_model_metadata is not None,
        )

    @staticmethod
    def get_candles(db: Session, ticker: str, days: int) -> list[CandleResponse]:
        asset = MarketService.get_asset_or_404(db, ticker)
        from_date = datetime.utcnow() - timedelta(days=days)
        candles = db.scalars(
            select(Candle)
            .where(Candle.asset_id == asset.id, Candle.timestamp >= from_date)
            .order_by(Candle.timestamp.asc())
        ).all()
        return [CandleResponse.model_validate(candle) for candle in candles]

    @staticmethod
    def get_news(db: Session, ticker: str, limit: int) -> list[NewsArticleResponse]:
        asset = MarketService.get_asset_or_404(db, ticker)
        news = db.scalars(
            select(NewsArticle)
            .where(NewsArticle.asset_id == asset.id)
            .order_by(desc(NewsArticle.published_at))
            .limit(limit)
        ).all()
        return [NewsArticleResponse.model_validate(item) for item in news]

    @staticmethod
    def refresh_market_snapshot(db: Session, source: str = "scheduler") -> int:
        assets = db.scalars(select(Asset).where(Asset.is_active.is_(True))).all()
        updated = 0
        for asset in assets:
            previous_quote = MarketService.get_latest_quote(db, asset.id)
            delta = Decimal(str(uniform(-0.02, 0.02)))
            new_price = money(Decimal(str(previous_quote.price)) * (Decimal("1") + delta))
            prev_close = money(previous_quote.close)
            high = money(max(new_price, prev_close) * Decimal("1.01"))
            low = money(min(new_price, prev_close) * Decimal("0.99"))
            change_percent = money(((new_price - prev_close) / prev_close) * Decimal("100")) if prev_close else Decimal("0")
            db.add(
                Quote(
                    asset_id=asset.id,
                    price=new_price,
                    open=prev_close,
                    high=high,
                    low=low,
                    close=new_price,
                    prev_close=prev_close,
                    change_percent=change_percent,
                    volume=int(previous_quote.volume * (1 + uniform(-0.1, 0.2))),
                    source=source,
                )
            )
            today = datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0)
            candle = db.scalar(
                select(Candle)
                .where(Candle.asset_id == asset.id, Candle.interval == "1d", Candle.timestamp == today)
                .limit(1)
            )
            if candle:
                candle.close = new_price
                candle.high = money(max(Decimal(str(candle.high)), new_price))
                candle.low = money(min(Decimal(str(candle.low)), new_price))
                candle.volume += int(uniform(1_000, 7_500))
            else:
                db.add(
                    Candle(
                        asset_id=asset.id,
                        interval="1d",
                        open=prev_close,
                        high=high,
                        low=low,
                        close=new_price,
                        volume=int(uniform(90_000, 220_000)),
                        timestamp=today,
                    )
                )
            updated += 1

        indicator = db.scalar(
            select(MacroIndicatorSnapshot)
            .where(MacroIndicatorSnapshot.code == "USD_RUB")
            .order_by(desc(MacroIndicatorSnapshot.recorded_at))
            .limit(1)
        )
        if indicator:
            db.add(
                MacroIndicatorSnapshot(
                    code=indicator.code,
                    name=indicator.name,
                    value=Decimal(str(indicator.value)) * Decimal(str(1 + uniform(-0.01, 0.01))),
                    source=source,
                )
            )

        db.commit()
        return updated

    @staticmethod
    def _serialize_prediction(asset: Asset, prediction: Prediction) -> PredictionResponse:
        return PredictionResponse(
            ticker=asset.ticker,
            current_price=float(prediction.current_price),
            predicted_price=float(prediction.predicted_price),
            impact_percent=float(prediction.impact_percent),
            confidence_score=float(prediction.confidence_score),
            horizon_days=prediction.horizon_days,
            summary=prediction.summary,
            drivers=[DriverContribution.model_validate(driver) for driver in prediction.drivers],
            generated_at=prediction.generated_at,
            is_placeholder=prediction.is_placeholder,
        )
