from __future__ import annotations

from datetime import UTC, datetime, timedelta
from decimal import Decimal
from random import Random

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.db.models import Asset, Candle, MacroIndicatorSnapshot, MLModelMetadata, MLModelStatus, NewsArticle, Quote


ASSET_SEEDS = [
    {"ticker": "GAZP", "name": "Gazprom", "sector": "Energy", "lot_size": 10, "price": Decimal("168.40")},
    {"ticker": "SBER", "name": "Sberbank", "sector": "Finance", "lot_size": 10, "price": Decimal("312.70")},
    {"ticker": "LKOH", "name": "Lukoil", "sector": "Energy", "lot_size": 1, "price": Decimal("7345.00")},
    {"ticker": "YDEX", "name": "Yandex", "sector": "Technology", "lot_size": 1, "price": Decimal("4050.00")},
    {"ticker": "GMKN", "name": "Nornickel", "sector": "Metals", "lot_size": 10, "price": Decimal("168.90")},
    {"ticker": "ROSN", "name": "Rosneft", "sector": "Energy", "lot_size": 1, "price": Decimal("565.40")},
    {"ticker": "NVTK", "name": "Novatek", "sector": "Energy", "lot_size": 1, "price": Decimal("1120.80")},
    {"ticker": "TATN", "name": "Tatneft", "sector": "Energy", "lot_size": 1, "price": Decimal("690.20")},
    {"ticker": "VTBR", "name": "VTB", "sector": "Finance", "lot_size": 10, "price": Decimal("102.35")},
    {"ticker": "MGNT", "name": "Magnit", "sector": "Consumer", "lot_size": 1, "price": Decimal("5200.00")},
    {"ticker": "PLZL", "name": "Polyus", "sector": "Metals", "lot_size": 1, "price": Decimal("14350.00")},
    {"ticker": "CHMF", "name": "Severstal", "sector": "Metals", "lot_size": 1, "price": Decimal("1840.00")},
    {"ticker": "ALRS", "name": "Alrosa", "sector": "Metals", "lot_size": 10, "price": Decimal("77.60")},
    {"ticker": "MTSS", "name": "MTS", "sector": "Telecom", "lot_size": 10, "price": Decimal("286.50")},
    {"ticker": "AFLT", "name": "Aeroflot", "sector": "Transport", "lot_size": 10, "price": Decimal("58.90")},
]


MACRO_SEEDS = [
    {"code": "BRENT", "name": "Brent Oil", "value": Decimal("82.10")},
    {"code": "USD_RUB", "name": "USD/RUB", "value": Decimal("92.40")},
    {"code": "IMOEX", "name": "MOEX Russia Index", "value": Decimal("3250.00")},
    {"code": "KEY_RATE", "name": "Key Rate", "value": Decimal("16.00")},
    {"code": "RGBI", "name": "Russian Government Bond Index", "value": Decimal("108.20")},
]


def _money(value: Decimal) -> Decimal:
    return value.quantize(Decimal("0.01"))


def utc_now_naive() -> datetime:
    return datetime.now(UTC).replace(tzinfo=None)


def _build_placeholder_model(asset: Asset) -> MLModelMetadata:
    baseline = {"BRENT": 82.10, "USD_RUB": 92.40, "IMOEX": 3250.0, "KEY_RATE": 16.0, "RGBI": 108.2}
    weights_by_sector = {
        "Energy": {"BRENT": 0.35, "USD_RUB": 0.12, "IMOEX": 0.25, "KEY_RATE": -0.08, "RGBI": 0.05},
        "Finance": {"BRENT": 0.04, "USD_RUB": -0.10, "IMOEX": 0.45, "KEY_RATE": -0.22, "RGBI": 0.18},
        "Technology": {"BRENT": 0.02, "USD_RUB": -0.14, "IMOEX": 0.38, "KEY_RATE": -0.18, "RGBI": 0.10},
        "Metals": {"BRENT": 0.08, "USD_RUB": 0.22, "IMOEX": 0.28, "KEY_RATE": -0.10, "RGBI": 0.08},
        "Consumer": {"BRENT": -0.04, "USD_RUB": -0.12, "IMOEX": 0.26, "KEY_RATE": -0.16, "RGBI": 0.12},
        "Telecom": {"BRENT": -0.02, "USD_RUB": -0.06, "IMOEX": 0.18, "KEY_RATE": -0.10, "RGBI": 0.10},
        "Transport": {"BRENT": -0.16, "USD_RUB": -0.10, "IMOEX": 0.24, "KEY_RATE": -0.14, "RGBI": 0.08},
    }
    weights = weights_by_sector.get(asset.sector, weights_by_sector["Technology"])

    return MLModelMetadata(
        asset_id=asset.id,
        model_name="Macro Scenario Placeholder",
        model_version="0.2.0-weekly-normalized",
        status=MLModelStatus.NOT_TRAINED,
        feature_names=list(baseline.keys()),
        metrics={
            "r2": settings.ML_PLACEHOLDER_CONFIDENCE_SCORE,
            "note": "Normalized cautious weekly fallback until a trained model artifact is available.",
        },
        model_params={
            "baseline": baseline,
            "weights": weights,
            "method": "relative_macro_elasticity",
            "max_weekly_move_percent": settings.ML_MAX_FORECAST_MOVE_PERCENT,
        },
        artifact_path=f"{settings.ML_ARTIFACTS_DIR}/{asset.ticker.lower()}",
        notes="Нормированная fallback-модель: считает относительные изменения макрофакторов и ограничивает недельный прогноз.",
    )


def seed_reference_data(db: Session) -> None:
    assets = db.scalars(select(Asset)).all()
    existing_by_ticker = {asset.ticker: asset for asset in assets}
    for asset_seed in ASSET_SEEDS:
        if asset_seed["ticker"] not in existing_by_ticker:
            db.add(
                Asset(
                    ticker=asset_seed["ticker"],
                    name=asset_seed["name"],
                    sector=asset_seed["sector"],
                    lot_size=asset_seed["lot_size"],
                    description="Demo asset for educational onboarding and trading scenarios.",
                )
            )
    db.flush()
    assets = db.scalars(select(Asset)).all()

    if not assets:
        assets = db.scalars(select(Asset)).all()

    for asset in assets:
        has_quote = db.scalar(select(Quote).where(Quote.asset_id == asset.id).limit(1))
        if not has_quote:
            seed = next((item for item in ASSET_SEEDS if item["ticker"] == asset.ticker), None)
            if not seed:
                continue
            price = seed["price"]
            db.add(
                Quote(
                    asset_id=asset.id,
                    price=price,
                    open=price,
                    high=_money(price * Decimal("1.02")),
                    low=_money(price * Decimal("0.98")),
                    close=price,
                    prev_close=_money(price * Decimal("0.99")),
                    change_percent=Decimal("1.01"),
                    volume=150_000,
                    source="seed",
                    recorded_at=utc_now_naive() - timedelta(days=46),
                )
            )

            rng = Random(asset.ticker)
            current_close = price
            for day_offset in range(45, 0, -1):
                candle_time = utc_now_naive() - timedelta(days=day_offset)
                drift = Decimal(str(rng.uniform(-0.025, 0.03)))
                next_close = _money(current_close * (Decimal("1.00") + drift))
                db.add(
                    Candle(
                        asset_id=asset.id,
                        interval="1d",
                        open=current_close,
                        high=_money(max(current_close, next_close) * Decimal("1.01")),
                        low=_money(min(current_close, next_close) * Decimal("0.99")),
                        close=next_close,
                        volume=100_000 + int(rng.uniform(0, 40_000)),
                        timestamp=candle_time,
                    )
                )
                current_close = next_close

        metadata = db.scalar(select(MLModelMetadata).where(MLModelMetadata.asset_id == asset.id))
        placeholder = _build_placeholder_model(asset)
        if not metadata:
            db.add(placeholder)
        elif metadata.status == MLModelStatus.NOT_TRAINED:
            metadata.model_name = placeholder.model_name
            metadata.model_version = placeholder.model_version
            metadata.feature_names = placeholder.feature_names
            metadata.metrics = placeholder.metrics
            metadata.model_params = placeholder.model_params
            metadata.artifact_path = placeholder.artifact_path
            metadata.notes = placeholder.notes

        news_item = db.scalar(select(NewsArticle).where(NewsArticle.asset_id == asset.id).limit(1))
        if not news_item:
            db.add(
                NewsArticle(
                    asset_id=asset.id,
                    title=f"{asset.ticker}: educational market digest",
                    summary="Demo news item. Replace this mock feed with a real news ingestion service later.",
                    url=f"https://example.com/news/{asset.ticker.lower()}",
                    source="Demo Feed",
                    sentiment="neutral",
                    published_at=utc_now_naive() - timedelta(hours=2),
                )
            )

    if not db.scalar(select(MacroIndicatorSnapshot).limit(1)):
        for indicator in MACRO_SEEDS:
            db.add(
                MacroIndicatorSnapshot(
                    code=indicator["code"],
                    name=indicator["name"],
                    value=indicator["value"],
                    source="seed",
                )
            )

    db.commit()
