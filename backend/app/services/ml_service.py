from __future__ import annotations

from datetime import date, datetime, timedelta
from decimal import Decimal, ROUND_HALF_UP
from pathlib import Path
from typing import Any

import joblib
import pandas as pd
from fastapi import HTTPException, status
from sklearn.linear_model import LinearRegression
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score
from sqlalchemy import desc, select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.db.models import Asset, MLModelMetadata, MLModelStatus, MacroIndicatorSnapshot, Prediction, ScenarioSimulation
from app.integrations.market_data_client import ExternalDataError, MarketDataClient
from app.schemas.ml import DriverContribution, ModelMetadataResponse, PredictionResponse, ScenarioRequest, ScenarioResponse
from app.services.market_service import MarketService


FEATURE_NAMES = {
    "PREV_CLOSE": "Предыдущая цена закрытия",
    "BRENT": "Brent oil price",
    "USD_RUB": "USD/RUB exchange rate",
    "IMOEX": "MOEX index",
    "KEY_RATE": "Key rate",
    "RGBI": "Bond index RGBI",
}

FEATURE_ORDER = ["PREV_CLOSE", "BRENT", "USD_RUB", "IMOEX", "KEY_RATE", "RGBI"]


def money(value: Decimal | float | int) -> Decimal:
    return Decimal(str(value)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


class MLService:
    @staticmethod
    def train_models(db: Session, tickers: list[str] | None = None) -> int:
        MLService._ensure_ml_directories()
        trained_count = 0
        assets_query = select(Asset).where(Asset.is_active.is_(True))
        if tickers:
            assets_query = assets_query.where(Asset.ticker.in_([ticker.upper() for ticker in tickers]))
        assets = db.scalars(assets_query.order_by(Asset.ticker)).all()

        if settings.MARKET_DATA_PROVIDER.lower() == "mock":
            return 0

        try:
            with MarketDataClient() as client:
                for asset in assets:
                    if MLService._train_single_model(db, asset, client):
                        trained_count += 1
        except ExternalDataError:
            db.rollback()
            return trained_count
        except Exception:
            db.rollback()
            return trained_count

        return trained_count

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
            coefficients=metadata.model_params.get("coefficients"),
            training_window_start=metadata.model_params.get("training_window", {}).get("start"),
            training_window_end=metadata.model_params.get("training_window", {}).get("end"),
        )

    @staticmethod
    def get_prediction(db: Session, ticker: str) -> PredictionResponse:
        asset = MarketService.get_asset_or_404(db, ticker)
        prediction = db.scalar(
            select(Prediction).where(Prediction.asset_id == asset.id).order_by(desc(Prediction.generated_at)).limit(1)
        )
        if not prediction:
            MLService.refresh_predictions(db, tickers=[ticker])
            prediction = db.scalar(
                select(Prediction).where(Prediction.asset_id == asset.id).order_by(desc(Prediction.generated_at)).limit(1)
            )
        if not prediction:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Prediction not available.")
        return MLService._serialize_prediction(asset, prediction)

    @staticmethod
    def refresh_predictions(db: Session, tickers: list[str] | None = None) -> int:
        assets_query = select(Asset).where(Asset.is_active.is_(True))
        if tickers:
            assets_query = assets_query.where(Asset.ticker.in_([ticker.upper() for ticker in tickers]))
        assets = db.scalars(assets_query.order_by(Asset.ticker)).all()

        current_macro = MLService._get_current_macro_vector(db)
        refreshed = 0
        for asset in assets:
            quote = MarketService.get_latest_quote(db, asset.id)
            metadata = db.scalar(select(MLModelMetadata).where(MLModelMetadata.asset_id == asset.id))
            if not metadata:
                continue

            current_features = dict(current_macro)
            current_features["PREV_CLOSE"] = float(quote.close)

            if metadata.status == MLModelStatus.READY and metadata.artifact_path:
                artifact = MLService._load_artifact(metadata.artifact_path)
                model_input = MLService._model_input_frame(artifact, current_features)
                predicted_price = float(artifact["model"].predict(model_input)[0])
                drivers = MLService._build_driver_contributions(
                    feature_names=artifact["feature_names"],
                    feature_values=model_input.iloc[0].to_dict(),
                    baseline_means=artifact["baseline_means"],
                    coefficients=artifact["coefficients"],
                )
                summary = (
                    f"Прогноз на следующий торговый день по модели {metadata.model_name} "
                    f"на основе MOEX/CBR/FRED данных."
                )
                is_placeholder = False
                confidence_score = float(metadata.metrics.get("r2", 0.0))
            else:
                predicted_price, drivers, confidence_score = MLService._placeholder_prediction(metadata, current_features)
                summary = "Fallback placeholder forecast: обученная модель пока недоступна."
                is_placeholder = True

            impact_percent = ((predicted_price - float(quote.price)) / float(quote.price) * 100) if float(quote.price) else 0.0
            db.add(
                Prediction(
                    asset_id=asset.id,
                    current_price=money(quote.price),
                    predicted_price=money(predicted_price),
                    impact_percent=money(impact_percent),
                    confidence_score=confidence_score,
                    horizon_days=settings.ML_HORIZON_DAYS,
                    summary=summary,
                    drivers=[driver.model_dump() for driver in drivers],
                    is_placeholder=is_placeholder,
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
        current_macro = MLService._get_current_macro_vector(db)
        feature_vector = dict(current_macro)
        feature_vector["PREV_CLOSE"] = float(quote.close)
        feature_vector.update({code.upper(): value for code, value in payload.factors.items()})

        if metadata.status == MLModelStatus.READY and metadata.artifact_path:
            artifact = MLService._load_artifact(metadata.artifact_path)
            model_input = MLService._model_input_frame(artifact, feature_vector)
            predicted_price = float(artifact["model"].predict(model_input)[0])
            drivers = MLService._build_driver_contributions(
                feature_names=artifact["feature_names"],
                feature_values=model_input.iloc[0].to_dict(),
                baseline_means=artifact["baseline_means"],
                coefficients=artifact["coefficients"],
            )
            confidence_score = float(metadata.metrics.get("r2", 0.0))
            is_placeholder = False
        else:
            predicted_price, drivers, confidence_score = MLService._placeholder_prediction(metadata, feature_vector)
            is_placeholder = True

        impact_percent = ((predicted_price - float(quote.price)) / float(quote.price) * 100) if float(quote.price) else 0.0

        db.add(
            ScenarioSimulation(
                asset_id=asset.id,
                input_features=feature_vector,
                predicted_price=money(predicted_price),
                impact_percent=money(impact_percent),
                confidence_score=confidence_score,
                drivers=[driver.model_dump() for driver in drivers],
            )
        )
        db.commit()

        return ScenarioResponse(
            ticker=asset.ticker,
            current_price=float(quote.price),
            predicted_price=float(money(predicted_price)),
            impact_percent=float(money(impact_percent)),
            confidence_score=confidence_score,
            inputs=feature_vector,
            drivers=drivers,
            generated_at=datetime.now(),
            is_placeholder=is_placeholder,
        )

    @staticmethod
    def _train_single_model(db: Session, asset: Asset, client: MarketDataClient) -> bool:
        dataset = MLService._build_training_dataset(db, asset, client)
        if dataset is None or len(dataset) < settings.ML_MIN_DATA_POINTS:
            return False

        feature_names = FEATURE_ORDER
        test_size = max(int(len(dataset) * settings.ML_TEST_RATIO), 30)
        if len(dataset) <= test_size + 10:
            return False

        train_df = dataset.iloc[:-test_size].copy()
        test_df = dataset.iloc[-test_size:].copy()

        model = LinearRegression()
        model.fit(train_df[feature_names], train_df["target"])

        predictions = model.predict(test_df[feature_names])
        r2 = float(r2_score(test_df["target"], predictions))
        mae = float(mean_absolute_error(test_df["target"], predictions))
        rmse = float(mean_squared_error(test_df["target"], predictions) ** 0.5)

        trained_at = datetime.now()
        version = trained_at.strftime("lr-%Y%m%d%H%M%S")
        artifact_path = MLService._artifact_dir(asset.ticker) / f"{version}.joblib"
        artifact_payload = {
            "model": model,
            "feature_names": feature_names,
            "coefficients": dict(zip(feature_names, [float(value) for value in model.coef_])),
            "baseline_means": {name: float(train_df[name].mean()) for name in feature_names},
            "intercept": float(model.intercept_),
            "trained_at": trained_at.isoformat(),
        }
        joblib.dump(artifact_payload, artifact_path)
        dataset_path = Path(settings.ML_DATASETS_DIR) / f"{asset.ticker.lower()}_training_dataset.csv"
        dataset.to_csv(dataset_path, index=False)

        metadata = db.scalar(select(MLModelMetadata).where(MLModelMetadata.asset_id == asset.id))
        if not metadata:
            metadata = MLModelMetadata(asset_id=asset.id, model_name="Macro Scenario Linear Regression")
            db.add(metadata)

        metadata.model_name = "Macro Scenario Linear Regression"
        metadata.model_version = version
        metadata.status = MLModelStatus.READY
        metadata.feature_names = feature_names
        metadata.metrics = {
            "r2": round(r2, 4),
            "mae": round(mae, 4),
            "rmse": round(rmse, 4),
            "rows": int(len(dataset)),
            "train_rows": int(len(train_df)),
            "test_rows": int(len(test_df)),
        }
        metadata.model_params = {
            "coefficients": artifact_payload["coefficients"],
            "baseline_means": artifact_payload["baseline_means"],
            "intercept": artifact_payload["intercept"],
            "training_window": {
                "start": str(dataset["date"].min().date()),
                "end": str(dataset["date"].max().date()),
            },
            "target": f"close_t_plus_{settings.ML_HORIZON_DAYS}",
        }
        metadata.artifact_path = str(artifact_path)
        metadata.trained_at = trained_at
        metadata.notes = (
            "Линейная регрессия обучена на реальных рядах MOEX/CBR/FRED. "
            "Для анализа драйверов используются линейные вклады относительно среднего baseline."
        )

        db.commit()
        return True

    @staticmethod
    def _build_training_dataset(db: Session, asset: Asset, client: MarketDataClient) -> pd.DataFrame | None:
        end_date = date.today()
        start_date = end_date - timedelta(days=settings.ML_LOOKBACK_YEARS * 365)
        asset_history = client.fetch_share_history(asset.ticker, start_date, end_date, board=asset.board)
        if asset_history.empty:
            return None

        macro_history = client.fetch_macro_history(start_date, end_date)
        MLService._persist_macro_history(db, macro_history)

        dataset = asset_history[["date", "close"]].rename(columns={"close": "asset_close"}).copy()
        for code, frame in macro_history.items():
            dataset = dataset.merge(
                frame[["date", "value"]].rename(columns={"value": code}),
                on="date",
                how="left",
            )

        dataset = dataset.sort_values("date").drop_duplicates(subset=["date"])
        dataset[["BRENT", "USD_RUB", "IMOEX", "KEY_RATE", "RGBI"]] = dataset[
            ["BRENT", "USD_RUB", "IMOEX", "KEY_RATE", "RGBI"]
        ].ffill().bfill()
        dataset["PREV_CLOSE"] = dataset["asset_close"]
        dataset["target"] = dataset["asset_close"].shift(-settings.ML_HORIZON_DAYS)
        dataset = dataset.dropna(subset=FEATURE_ORDER + ["target"]).reset_index(drop=True)
        return dataset[["date"] + FEATURE_ORDER + ["target"]]

    @staticmethod
    def _persist_macro_history(db: Session, macro_history: dict[str, pd.DataFrame]) -> None:
        for code, frame in macro_history.items():
            name = FEATURE_NAMES.get(code, code)
            existing_dates = {
                snapshot.recorded_at.date()
                for snapshot in db.scalars(select(MacroIndicatorSnapshot).where(MacroIndicatorSnapshot.code == code)).all()
            }
            for row in frame.itertuples(index=False):
                recorded_at = row.date.to_pydatetime().replace(hour=0, minute=0, second=0, microsecond=0)
                if recorded_at.date() in existing_dates:
                    continue
                db.add(
                    MacroIndicatorSnapshot(
                        code=code,
                        name=name,
                        value=float(row.value),
                        source="historical-import",
                        recorded_at=recorded_at,
                    )
                )

    @staticmethod
    def _get_current_macro_vector(db: Session) -> dict[str, float]:
        if settings.MARKET_DATA_PROVIDER.lower() == "real":
            try:
                with MarketDataClient() as client:
                    snapshots = client.fetch_current_macro_snapshot()
                return {item.code: float(item.value) for item in snapshots}
            except Exception:
                pass
        return MarketService.get_latest_macro_values(db)

    @staticmethod
    def _build_driver_contributions(
        feature_names: list[str],
        feature_values: dict[str, float],
        baseline_means: dict[str, float],
        coefficients: dict[str, float],
    ) -> list[DriverContribution]:
        drivers: list[DriverContribution] = []
        for feature_name in feature_names:
            contribution = coefficients.get(feature_name, 0.0) * (
                feature_values.get(feature_name, baseline_means.get(feature_name, 0.0))
                - baseline_means.get(feature_name, 0.0)
            )
            drivers.append(
                DriverContribution(
                    code=feature_name,
                    name=FEATURE_NAMES.get(feature_name, feature_name),
                    contribution=float(round(contribution, 4)),
                    direction="positive" if contribution >= 0 else "negative",
                )
            )
        drivers.sort(key=lambda item: abs(item.contribution), reverse=True)
        return drivers

    @staticmethod
    def _placeholder_prediction(
        metadata: MLModelMetadata,
        current_features: dict[str, float],
    ) -> tuple[float, list[DriverContribution], float]:
        baseline = metadata.model_params.get("baseline", {})
        weights = metadata.model_params.get("weights", {})
        base_price = current_features.get("PREV_CLOSE", 0.0)
        total_shift = 0.0
        drivers: list[DriverContribution] = []
        for code, weight in weights.items():
            baseline_value = float(baseline.get(code, current_features.get(code, 0.0)))
            current_value = float(current_features.get(code, baseline_value))
            contribution = (current_value - baseline_value) * float(weight)
            total_shift += contribution
            drivers.append(
                DriverContribution(
                    code=code,
                    name=FEATURE_NAMES.get(code, code),
                    contribution=float(round(contribution, 4)),
                    direction="positive" if contribution >= 0 else "negative",
                )
            )
        drivers.sort(key=lambda item: abs(item.contribution), reverse=True)
        return base_price + total_shift, drivers, float(metadata.metrics.get("r2", 0.0))

    @staticmethod
    def _load_artifact(path: str) -> dict[str, Any]:
        artifact = joblib.load(path)
        if not isinstance(artifact, dict):
            raise ExternalDataError("Unsupported model artifact format.")
        return artifact

    @staticmethod
    def _model_input_frame(artifact: dict[str, Any], feature_values: dict[str, float]) -> pd.DataFrame:
        payload = {}
        baseline_means = artifact.get("baseline_means", {})
        for feature_name in artifact["feature_names"]:
            payload[feature_name] = feature_values.get(feature_name, baseline_means.get(feature_name, 0.0))
        return pd.DataFrame([payload])[artifact["feature_names"]]

    @staticmethod
    def _artifact_dir(ticker: str) -> Path:
        path = Path(settings.ML_ARTIFACTS_DIR) / ticker.upper()
        path.mkdir(parents=True, exist_ok=True)
        return path

    @staticmethod
    def _ensure_ml_directories() -> None:
        Path(settings.ML_ARTIFACTS_DIR).mkdir(parents=True, exist_ok=True)
        Path(settings.ML_DATASETS_DIR).mkdir(parents=True, exist_ok=True)
        Path(settings.ML_EXPERIMENTS_DIR).mkdir(parents=True, exist_ok=True)

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
