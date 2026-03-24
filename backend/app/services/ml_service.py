from __future__ import annotations

from datetime import datetime
from decimal import Decimal, ROUND_HALF_UP

from fastapi import HTTPException, status
from sqlalchemy import desc, select
from sqlalchemy.orm import Session

from app.db.models import Asset, MLModelMetadata, Prediction, ScenarioSimulation
from app.schemas.ml import DriverContribution, ModelMetadataResponse, PredictionResponse, ScenarioRequest, ScenarioResponse
from app.services.market_service import MarketService


FEATURE_NAMES = {
    "BRENT": "Brent oil price",
    "USD_RUB": "USD/RUB exchange rate",
    "IMOEX": "MOEX index",
    "KEY_RATE": "Key rate",
    "RGBI": "Bond index RGBI",
}


def money(value: Decimal | float | int) -> Decimal:
    return Decimal(str(value)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


class MLService:
    @staticmethod
    def get_model_metadata(db: Session, ticker: str) -> ModelMetadataResponse:
        asset = MarketService.get_asset_or_404(db, ticker)
        metadata = db.scalar(select(MLModelMetadata).where(MLModelMetadata.asset_id == asset.id))
        if not metadata:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="ML metadata not found.")
        return ModelMetadataResponse(
            ticker=asset.ticker,
            model_name=metadata.model_name,
            model_version=metadata.model_version,
            status=metadata.status.value,
            feature_names=metadata.feature_names,
            metrics=metadata.metrics,
            artifact_path=metadata.artifact_path,
            notes=metadata.notes,
            trained_at=metadata.trained_at,
        )

    @staticmethod
    def get_prediction(db: Session, ticker: str) -> PredictionResponse:
        asset = MarketService.get_asset_or_404(db, ticker)
        prediction = db.scalar(
            select(Prediction).where(Prediction.asset_id == asset.id).order_by(desc(Prediction.generated_at)).limit(1)
        )
        if not prediction:
            MLService.refresh_predictions(db)
            prediction = db.scalar(
                select(Prediction).where(Prediction.asset_id == asset.id).order_by(desc(Prediction.generated_at)).limit(1)
            )
        if not prediction:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Prediction not available.")
        return MLService._serialize_prediction(asset, prediction)

    @staticmethod
    def refresh_predictions(db: Session) -> int:
        assets = db.scalars(select(Asset).where(Asset.is_active.is_(True))).all()
        refreshed = 0
        for asset in assets:
            quote = MarketService.get_latest_quote(db, asset.id)
            metadata = db.scalar(select(MLModelMetadata).where(MLModelMetadata.asset_id == asset.id))
            if not metadata:
                continue
            baseline = metadata.model_params.get("baseline", {})
            weights = metadata.model_params.get("weights", {})
            momentum_score = Decimal("0")
            drivers: list[dict[str, float | str]] = []
            for code in baseline:
                contribution = money(Decimal("0.5") * Decimal(str(weights.get(code, 0))))
                momentum_score += contribution
                drivers.append(
                    {
                        "code": code,
                        "name": FEATURE_NAMES.get(code, code),
                        "contribution": float(contribution),
                        "direction": "positive" if contribution >= 0 else "negative",
                    }
                )
            current_price = money(quote.price)
            predicted_price = money(current_price * (Decimal("1") + momentum_score / Decimal("100")))
            impact_percent = money(((predicted_price - current_price) / current_price) * Decimal("100")) if current_price else Decimal("0")
            db.add(
                Prediction(
                    asset_id=asset.id,
                    current_price=current_price,
                    predicted_price=predicted_price,
                    impact_percent=impact_percent,
                    confidence_score=Decimal(str(metadata.metrics.get("r2", 0.6))) * Decimal("100"),
                    horizon_days=7,
                    summary="Placeholder forecast generated from stored macro-factor weights.",
                    drivers=drivers,
                    is_placeholder=True,
                )
            )
            refreshed += 1
        db.commit()
        return refreshed

    @staticmethod
    def simulate_scenario(db: Session, payload: ScenarioRequest) -> ScenarioResponse:
        asset = MarketService.get_asset_or_404(db, payload.ticker)
        metadata = db.scalar(select(MLModelMetadata).where(MLModelMetadata.asset_id == asset.id))
        if not metadata:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="ML metadata not found.")

        quote = MarketService.get_latest_quote(db, asset.id)
        current_price = money(quote.price)
        baseline = metadata.model_params.get("baseline", {})
        weights = metadata.model_params.get("weights", {})

        total_shift = Decimal("0")
        drivers: list[DriverContribution] = []
        normalized_inputs: dict[str, float] = {}

        for code in metadata.feature_names:
            base_value = Decimal(str(baseline.get(code, 0)))
            incoming_value = Decimal(str(payload.factors.get(code, baseline.get(code, 0))))
            normalized_inputs[code] = float(incoming_value)
            contribution = money((incoming_value - base_value) * Decimal(str(weights.get(code, 0))))
            total_shift += contribution
            drivers.append(
                DriverContribution(
                    code=code,
                    name=FEATURE_NAMES.get(code, code),
                    contribution=float(contribution),
                    direction="positive" if contribution >= 0 else "negative",
                )
            )

        drivers.sort(key=lambda item: abs(item.contribution), reverse=True)
        predicted_price = money(current_price + total_shift)
        impact_percent = money(((predicted_price - current_price) / current_price) * Decimal("100")) if current_price else Decimal("0")
        confidence_score = float(Decimal(str(metadata.metrics.get("r2", 0.6))) * Decimal("100"))

        db.add(
            ScenarioSimulation(
                asset_id=asset.id,
                input_features=normalized_inputs,
                predicted_price=predicted_price,
                impact_percent=impact_percent,
                confidence_score=confidence_score,
                drivers=[driver.model_dump() for driver in drivers],
            )
        )
        db.commit()

        return ScenarioResponse(
            ticker=asset.ticker,
            current_price=float(current_price),
            predicted_price=float(predicted_price),
            impact_percent=float(impact_percent),
            confidence_score=confidence_score,
            inputs=normalized_inputs,
            drivers=drivers,
            generated_at=datetime.utcnow(),
            is_placeholder=True,
        )

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
