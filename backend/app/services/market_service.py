from __future__ import annotations

from datetime import date, datetime, timedelta
from decimal import Decimal, ROUND_HALF_UP
from random import uniform

from fastapi import HTTPException, status
from sqlalchemy import desc, select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.db.models import Asset, Candle, MacroIndicatorSnapshot, NewsArticle, Prediction, Quote
from app.integrations.market_data_client import ExternalDataError, MarketDataClient
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
        from_date = datetime.now() - timedelta(days=days)
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
        if settings.MARKET_DATA_PROVIDER.lower() == "mock":
            return MarketService._refresh_market_snapshot_mock(db, source)

        try:
            with MarketDataClient() as client:
                return MarketService._refresh_market_snapshot_real(db, client, source)
        except ExternalDataError:
            db.rollback()
            return MarketService._refresh_market_snapshot_mock(db, f"{source}-fallback")
        except Exception:
            db.rollback()
            return MarketService._refresh_market_snapshot_mock(db, f"{source}-fallback")

    @staticmethod
    def get_latest_macro_values(db: Session) -> dict[str, float]:
        values: dict[str, float] = {}
        for code in ("BRENT", "USD_RUB", "IMOEX", "KEY_RATE", "RGBI"):
            snapshot = db.scalar(
                select(MacroIndicatorSnapshot)
                .where(MacroIndicatorSnapshot.code == code)
                .order_by(desc(MacroIndicatorSnapshot.recorded_at))
                .limit(1)
            )
            if snapshot:
                values[code] = float(snapshot.value)
        return values

    @staticmethod
    def _refresh_market_snapshot_real(db: Session, client: MarketDataClient, source: str) -> int:
        assets = db.scalars(select(Asset).where(Asset.is_active.is_(True)).order_by(Asset.ticker)).all()
        updated = 0
        history_start = date.today() - timedelta(days=365)
        history_end = date.today()

        for asset in assets:
            snapshot = client.fetch_share_snapshot(asset.ticker, board=asset.board)
            asset.name = snapshot["name"] or asset.name
            asset.lot_size = snapshot["lot_size"] or asset.lot_size

            db.add(
                Quote(
                    asset_id=asset.id,
                    price=money(snapshot["price"]),
                    open=money(snapshot["open"]),
                    high=money(snapshot["high"]),
                    low=money(snapshot["low"]),
                    close=money(snapshot["close"]),
                    prev_close=money(snapshot["prev_close"]),
                    change_percent=money(snapshot["change_percent"]),
                    volume=int(snapshot["volume"]),
                    source=snapshot["source"],
                    recorded_at=snapshot["recorded_at"],
                )
            )

            history_frame = client.fetch_share_history(asset.ticker, history_start, history_end, board=asset.board)
            MarketService._upsert_candles_from_frame(db, asset.id, history_frame)
            updated += 1

        for macro_snapshot in client.fetch_current_macro_snapshot():
            db.add(
                MacroIndicatorSnapshot(
                    code=macro_snapshot.code,
                    name=macro_snapshot.name,
                    value=macro_snapshot.value,
                    source=macro_snapshot.source,
                    recorded_at=macro_snapshot.recorded_at,
                )
            )

        db.commit()
        return updated

    @staticmethod
    def _upsert_candles_from_frame(db: Session, asset_id: str, frame) -> None:
        existing = {
            candle.timestamp.date(): candle
            for candle in db.scalars(
                select(Candle).where(
                    Candle.asset_id == asset_id,
                    Candle.interval == "1d",
                )
            ).all()
        }
        for row in frame.itertuples(index=False):
            candle_ts = row.date.to_pydatetime().replace(hour=0, minute=0, second=0, microsecond=0)
            candle = existing.get(candle_ts.date())
            if candle:
                candle.open = money(row.open)
                candle.high = money(row.high)
                candle.low = money(row.low)
                candle.close = money(row.close)
                candle.volume = int(row.volume or 0)
            else:
                db.add(
                    Candle(
                        asset_id=asset_id,
                        interval="1d",
                        open=money(row.open),
                        high=money(row.high),
                        low=money(row.low),
                        close=money(row.close),
                        volume=int(row.volume or 0),
                        timestamp=candle_ts,
                    )
                )

    @staticmethod
    def _refresh_market_snapshot_mock(db: Session, source: str) -> int:
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
            today = datetime.now().replace(hour=0, minute=0, second=0, microsecond=0)
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
