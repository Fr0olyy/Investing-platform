from __future__ import annotations

from datetime import datetime, timedelta
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


def _build_placeholder_model(asset: Asset) -> MLModelMetadata:
    baseline = {"BRENT": 82.10, "USD_RUB": 92.40, "IMOEX": 3250.0, "KEY_RATE": 16.0, "RGBI": 108.2}
    weights_by_sector = {
        "Energy": {"BRENT": 1.2, "USD_RUB": 0.7, "IMOEX": 0.15, "KEY_RATE": -0.4, "RGBI": 0.1},
        "Finance": {"BRENT": 0.2, "USD_RUB": -0.2, "IMOEX": 0.3, "KEY_RATE": -0.8, "RGBI": 0.25},
        "Technology": {"BRENT": 0.05, "USD_RUB": -0.35, "IMOEX": 0.4, "KEY_RATE": -0.6, "RGBI": 0.2},
        "Metals": {"BRENT": 0.3, "USD_RUB": 0.65, "IMOEX": 0.2, "KEY_RATE": -0.3, "RGBI": 0.12},
    }
    weights = weights_by_sector.get(asset.sector, weights_by_sector["Technology"])

    return MLModelMetadata(
        asset_id=asset.id,
        model_name="Macro Scenario Placeholder",
        model_version="0.1.0",
        status=MLModelStatus.NOT_TRAINED,
        feature_names=list(baseline.keys()),
        metrics={"r2": 0.61, "note": "Replace with your own trained model later."},
        model_params={"baseline": baseline, "weights": weights},
        artifact_path=f"{settings.ML_ARTIFACTS_DIR}/{asset.ticker.lower()}",
        notes="Prepared contract for future sklearn/CatBoost model artifacts and SHAP outputs.",
    )


def seed_reference_data(db: Session) -> None:
    assets = db.scalars(select(Asset)).all()
    if not assets:
        for asset_seed in ASSET_SEEDS:
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

    for asset in assets:
        has_quote = db.scalar(select(Quote).where(Quote.asset_id == asset.id).limit(1))
        if not has_quote:
            seed = next(item for item in ASSET_SEEDS if item["ticker"] == asset.ticker)
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
                )
            )

            rng = Random(asset.ticker)
            current_close = price
            for day_offset in range(45, 0, -1):
                candle_time = datetime.utcnow() - timedelta(days=day_offset)
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

        has_model = db.scalar(select(MLModelMetadata).where(MLModelMetadata.asset_id == asset.id))
        if not has_model:
            db.add(_build_placeholder_model(asset))

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
                    published_at=datetime.utcnow() - timedelta(hours=2),
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
