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
        trained_count, _diagnostics = MLService.train_models_with_diagnostics(db, tickers=tickers)
        return trained_count

    @staticmethod
    def train_models_with_diagnostics(
        db: Session,
        tickers: list[str] | None = None,
    ) -> tuple[int, list[dict[str, Any]]]:
        MLService._ensure_ml_directories()
        trained_count = 0
        diagnostics: list[dict[str, Any]] = []
        assets_query = select(Asset).where(Asset.is_active.is_(True))
        if tickers:
            assets_query = assets_query.where(Asset.ticker.in_([ticker.upper() for ticker in tickers]))
        assets = db.scalars(assets_query.order_by(Asset.ticker)).all()

        if settings.MARKET_DATA_PROVIDER.lower() == "mock":
            return 0, [
                {
                    "ticker": asset.ticker,
                    "status": "skipped",
                    "reason": "MARKET_DATA_PROVIDER=mock: real market data is disabled.",
                    "rows": 0,
                    "test_rows": None,
                }
                for asset in assets
            ]

        try:
            with MarketDataClient() as client:
                end_date = date.today()
                start_date = end_date - timedelta(days=settings.ML_LOOKBACK_YEARS * 365)
                macro_history, macro_warnings = MLService._fetch_macro_history_for_training(
                    db,
                    client,
                    start_date,
                    end_date,
                )
                MLService._persist_macro_history(db, macro_history)

                for asset in assets:
                    try:
                        diagnostic = MLService._train_single_model(db, asset, client, macro_history=macro_history)
                    except ExternalDataError as exc:
                        db.rollback()
                        diagnostic = MLService._training_diagnostic(
                            asset,
                            status="failed",
                            reason=f"External data error: {exc}",
                        )
                    except Exception as exc:
                        db.rollback()
                        diagnostic = MLService._training_diagnostic(
                            asset,
                            status="failed",
                            reason=f"Unexpected training error: {type(exc).__name__}: {exc}",
                        )

                    if macro_warnings:
                        warning = "Macro fallbacks used: " + "; ".join(macro_warnings)
                        diagnostic["reason"] = (
                            f"{diagnostic['reason']} {warning}" if diagnostic.get("reason") else warning
                        )

                    diagnostics.append(diagnostic)
                    if diagnostic["status"] == "trained":
                        trained_count += 1
        except ExternalDataError as exc:
            db.rollback()
            reason = f"External data client error: {exc}"
            diagnostics.extend(
                MLService._training_diagnostic(asset, status="failed", reason=reason) for asset in assets
            )
            return trained_count, diagnostics
        except Exception as exc:
            db.rollback()
            reason = f"Unexpected data client error: {type(exc).__name__}: {exc}"
            diagnostics.extend(
                MLService._training_diagnostic(asset, status="failed", reason=reason) for asset in assets
            )
            return trained_count, diagnostics

        return trained_count, diagnostics

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
    def get_prediction(db: Session, ticker: str, horizon_days: int | None = None) -> PredictionResponse:
        horizon_days = MLService._normalize_horizon(horizon_days)
        asset = MarketService.get_asset_or_404(db, ticker)
        prediction = db.scalar(
            select(Prediction)
            .where(Prediction.asset_id == asset.id, Prediction.horizon_days == horizon_days)
            .order_by(desc(Prediction.generated_at))
            .limit(1)
        )
        if not prediction:
            MLService.refresh_predictions(db, tickers=[ticker], horizon_days=horizon_days)
            prediction = db.scalar(
                select(Prediction)
                .where(Prediction.asset_id == asset.id, Prediction.horizon_days == horizon_days)
                .order_by(desc(Prediction.generated_at))
                .limit(1)
            )
        if not prediction:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Prediction not available.")
        return MLService._serialize_prediction(asset, prediction)

    @staticmethod
    def refresh_predictions(db: Session, tickers: list[str] | None = None, horizon_days: int | None = None) -> int:
        horizon_days = MLService._normalize_horizon(horizon_days)
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
                predicted_price = MLService._stabilize_predicted_price(
                    base_price=float(quote.price),
                    predicted_price=MLService._scale_prediction_to_horizon(
                        base_price=float(quote.price),
                        predicted_price=float(artifact["model"].predict(model_input)[0]),
                        source_horizon_days=settings.ML_HORIZON_DAYS,
                        target_horizon_days=horizon_days,
                    ),
                    max_move_percent=MLService._horizon_move_limit(settings.ML_MAX_FORECAST_MOVE_PERCENT, horizon_days),
                )
                drivers = MLService._build_driver_contributions(
                    feature_names=artifact["feature_names"],
                    feature_values=model_input.iloc[0].to_dict(),
                    baseline_means=artifact["baseline_means"],
                    coefficients=artifact["coefficients"],
                    base_price=float(quote.price),
                )
                summary = (
                    f"Ориентир цены на {horizon_days} торговых дней рассчитан по истории рынка "
                    f"и ключевым рыночным факторам. Это аналитическая подсказка, а не инвестиционная рекомендация."
                )
                is_placeholder = False
                confidence_score = MLService._normalize_confidence(metadata.metrics.get("r2", 0.0))
            else:
                predicted_price, drivers, confidence_score = MLService._placeholder_prediction(
                    metadata,
                    current_features,
                    max_move_percent=MLService._horizon_move_limit(settings.ML_MAX_FORECAST_MOVE_PERCENT, horizon_days),
                    horizon_days=horizon_days,
                )
                summary = (
                    f"Ориентировочный прогноз на {horizon_days} торговых дней построен по текущей цене "
                    f"и рыночным факторам. Используйте его как дополнительный сценарий, а не как гарантию доходности."
                )
                is_placeholder = True

            impact_percent = ((predicted_price - float(quote.price)) / float(quote.price) * 100) if float(quote.price) else 0.0
            db.add(
                Prediction(
                    asset_id=asset.id,
                    current_price=money(quote.price),
                    predicted_price=money(predicted_price),
                    impact_percent=money(impact_percent),
                    confidence_score=confidence_score,
                    horizon_days=horizon_days,
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
            predicted_price = MLService._stabilize_predicted_price(
                base_price=float(quote.price),
                predicted_price=float(artifact["model"].predict(model_input)[0]),
                max_move_percent=MLService._horizon_move_limit(settings.ML_MAX_SCENARIO_MOVE_PERCENT, settings.ML_HORIZON_DAYS),
            )
            drivers = MLService._build_driver_contributions(
                feature_names=artifact["feature_names"],
                feature_values=model_input.iloc[0].to_dict(),
                baseline_means=artifact["baseline_means"],
                coefficients=artifact["coefficients"],
                base_price=float(quote.price),
            )
            confidence_score = MLService._normalize_confidence(metadata.metrics.get("r2", 0.0))
            is_placeholder = False
        else:
            predicted_price, drivers, confidence_score = MLService._placeholder_prediction(
                metadata,
                feature_vector,
                max_move_percent=settings.ML_MAX_SCENARIO_MOVE_PERCENT,
                horizon_days=settings.ML_HORIZON_DAYS,
            )
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
    def _train_single_model(
        db: Session,
        asset: Asset,
        client: MarketDataClient,
        macro_history: dict[str, pd.DataFrame] | None = None,
    ) -> dict[str, Any]:
        dataset = MLService._build_training_dataset(db, asset, client, macro_history=macro_history)
        rows_count = 0 if dataset is None else len(dataset)
        if dataset is None:
            return MLService._training_diagnostic(
                asset,
                status="skipped",
                reason="Training dataset is empty. Check MOEX history and macro sources.",
                rows=rows_count,
            )
        if rows_count < settings.ML_MIN_DATA_POINTS:
            return MLService._training_diagnostic(
                asset,
                status="skipped",
                reason=f"Not enough rows for training: {rows_count}, required at least {settings.ML_MIN_DATA_POINTS}.",
                rows=rows_count,
            )

        feature_names = FEATURE_ORDER
        test_size = max(int(len(dataset) * settings.ML_TEST_RATIO), 30)
        if len(dataset) <= test_size + 10:
            return MLService._training_diagnostic(
                asset,
                status="skipped",
                reason=f"Dataset is too small after train/test split: {len(dataset)} rows, test size {test_size}.",
                rows=len(dataset),
                test_rows=test_size,
            )

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
        return MLService._training_diagnostic(
            asset,
            status="trained",
            reason="Model trained successfully.",
            rows=len(dataset),
            test_rows=test_size,
        )

    @staticmethod
    def _training_diagnostic(
        asset: Asset,
        status: str,
        reason: str | None = None,
        rows: int | None = None,
        test_rows: int | None = None,
    ) -> dict[str, Any]:
        return {
            "ticker": asset.ticker,
            "status": status,
            "reason": reason,
            "rows": rows,
            "test_rows": test_rows,
        }

    @staticmethod
    def _fetch_macro_history_for_training(
        db: Session,
        client: MarketDataClient,
        start_date: date,
        end_date: date,
    ) -> tuple[dict[str, pd.DataFrame], list[str]]:
        latest_values = MarketService.get_latest_macro_values(db)
        warnings: list[str] = []
        fetchers = {
            "BRENT": client.fetch_brent_history,
            "USD_RUB": client.fetch_usd_rub_history,
            "IMOEX": lambda start, end: client.fetch_index_history("IMOEX", start, end)[["date", "close"]].rename(
                columns={"close": "value"}
            ),
            "RGBI": lambda start, end: client.fetch_index_history("RGBI", start, end)[["date", "close"]].rename(
                columns={"close": "value"}
            ),
            "KEY_RATE": client.fetch_key_rate_history,
        }
        history: dict[str, pd.DataFrame] = {}

        for code, fetcher in fetchers.items():
            try:
                frame = fetcher(start_date, end_date)
                if frame.empty:
                    raise ExternalDataError(f"{code} history is empty.")
                history[code] = frame[["date", "value"]].copy()
            except Exception as exc:
                history[code] = MLService._fallback_macro_history(code, start_date, end_date, latest_values)
                warnings.append(f"{code}: {type(exc).__name__}: {exc}")

        return history, warnings

    @staticmethod
    def _fallback_macro_history(
        code: str,
        start_date: date,
        end_date: date,
        latest_values: dict[str, float],
    ) -> pd.DataFrame:
        defaults = {
            "BRENT": 80.0,
            "USD_RUB": 90.0,
            "IMOEX": 3000.0,
            "KEY_RATE": 15.0,
            "RGBI": 105.0,
        }
        value = float(latest_values.get(code, defaults.get(code, 0.0)))
        return pd.DataFrame(
            {
                "date": pd.date_range(start=start_date, end=end_date, freq="D"),
                "value": value,
            }
        )

    @staticmethod
    def _build_training_dataset(
        db: Session,
        asset: Asset,
        client: MarketDataClient,
        macro_history: dict[str, pd.DataFrame] | None = None,
    ) -> pd.DataFrame | None:
        end_date = date.today()
        start_date = end_date - timedelta(days=settings.ML_LOOKBACK_YEARS * 365)
        asset_history = client.fetch_share_history(asset.ticker, start_date, end_date, board=asset.board)
        if asset_history.empty:
            return None

        if macro_history is None:
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
        base_price: float | None = None,
    ) -> list[DriverContribution]:
        drivers: list[DriverContribution] = []
        for feature_name in feature_names:
            raw_contribution = coefficients.get(feature_name, 0.0) * (
                feature_values.get(feature_name, baseline_means.get(feature_name, 0.0))
                - baseline_means.get(feature_name, 0.0)
            )
            contribution = MLService._cap_driver_contribution(raw_contribution, base_price)
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
        max_move_percent: float,
        horizon_days: int,
    ) -> tuple[float, list[DriverContribution], float]:
        baseline = metadata.model_params.get("baseline", {})
        weights = metadata.model_params.get("weights", {})
        base_price = current_features.get("PREV_CLOSE", 0.0)
        total_shift_percent = 0.0
        drivers: list[DriverContribution] = []
        for code, weight in weights.items():
            baseline_value = float(baseline.get(code, current_features.get(code, 0.0)))
            current_value = float(current_features.get(code, baseline_value))
            relative_change = ((current_value - baseline_value) / baseline_value) if baseline_value else 0.0
            contribution_percent = relative_change * float(weight) * 100 * max(1.0, horizon_days / settings.ML_HORIZON_DAYS)
            contribution_percent = max(
                -settings.ML_MAX_DRIVER_MOVE_PERCENT,
                min(settings.ML_MAX_DRIVER_MOVE_PERCENT, contribution_percent),
            )
            total_shift_percent += contribution_percent
            contribution = float(base_price) * contribution_percent / 100
            drivers.append(
                DriverContribution(
                    code=code,
                    name=FEATURE_NAMES.get(code, code),
                    contribution=float(round(contribution, 4)),
                    direction="positive" if contribution >= 0 else "negative",
                )
            )
        drivers.sort(key=lambda item: abs(item.contribution), reverse=True)
        total_shift_percent = max(
            -max_move_percent,
            min(max_move_percent, total_shift_percent),
        )
        predicted_price = float(base_price) * (1 + total_shift_percent / 100)
        confidence = MLService._normalize_confidence(
            metadata.metrics.get("r2", settings.ML_PLACEHOLDER_CONFIDENCE_SCORE)
        )
        return predicted_price, drivers, confidence

    @staticmethod
    def _stabilize_predicted_price(base_price: float, predicted_price: float, max_move_percent: float) -> float:
        if base_price <= 0:
            return max(0.01, predicted_price)
        lower_bound = base_price * (1 - max_move_percent / 100)
        upper_bound = base_price * (1 + max_move_percent / 100)
        return max(lower_bound, min(upper_bound, predicted_price))

    @staticmethod
    def _scale_prediction_to_horizon(
        base_price: float,
        predicted_price: float,
        source_horizon_days: int,
        target_horizon_days: int,
    ) -> float:
        if base_price <= 0 or source_horizon_days <= 0:
            return predicted_price
        scale = max(0.1, target_horizon_days / source_horizon_days)
        return base_price + (predicted_price - base_price) * scale

    @staticmethod
    def _horizon_move_limit(base_limit_percent: float, horizon_days: int) -> float:
        scale = max(1.0, (horizon_days / settings.ML_HORIZON_DAYS) ** 0.5)
        return min(30.0, base_limit_percent * scale)

    @staticmethod
    def _normalize_horizon(horizon_days: int | None) -> int:
        try:
            value = int(horizon_days or settings.ML_HORIZON_DAYS)
        except (TypeError, ValueError):
            value = settings.ML_HORIZON_DAYS
        return max(1, min(180, value))

    @staticmethod
    def _cap_driver_contribution(contribution: float, base_price: float | None) -> float:
        if not base_price or base_price <= 0:
            return contribution
        limit = base_price * settings.ML_MAX_DRIVER_MOVE_PERCENT / 100
        return max(-limit, min(limit, contribution))

    @staticmethod
    def _normalize_confidence(value: Any) -> float:
        try:
            confidence = float(value)
        except (TypeError, ValueError):
            confidence = settings.ML_PLACEHOLDER_CONFIDENCE_SCORE
        if confidence <= 0:
            confidence = settings.ML_PLACEHOLDER_CONFIDENCE_SCORE
        if confidence > 1:
            confidence = confidence / 100
        return max(0.0, min(0.95, confidence))

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
