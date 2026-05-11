from __future__ import annotations

import logging
import threading

from apscheduler.schedulers.background import BackgroundScheduler

from app.core.config import settings
from app.db.database import SessionLocal, init_db
from app.db.seed import seed_reference_data
from app.services.market_service import MarketService
from app.services.ml_service import MLService


logger = logging.getLogger(__name__)
_scheduler: BackgroundScheduler | None = None
_startup_jobs_thread: threading.Thread | None = None


def initialize_application() -> None:
    """
    Fast startup path: only DB init + seed synchronously.
    Heavy market/ML warm-up runs in background so API is available immediately.
    """
    init_db()
    with SessionLocal() as db:
        seed_reference_data(db)

    _start_startup_jobs_thread()


def _start_startup_jobs_thread() -> None:
    global _startup_jobs_thread

    if _startup_jobs_thread and _startup_jobs_thread.is_alive():
        return

    _startup_jobs_thread = threading.Thread(target=run_startup_jobs, name="startup-jobs", daemon=True)
    _startup_jobs_thread.start()


def run_startup_jobs() -> None:
    with SessionLocal() as db:
        try:
            MarketService.refresh_market_snapshot(db, source="startup")
        except Exception:
            logger.exception("Startup market refresh failed")
            db.rollback()

        if settings.ML_AUTO_TRAIN_ON_STARTUP:
            try:
                MLService.train_models(db)
            except Exception:
                logger.exception("Startup ML training failed")
                db.rollback()

        try:
            MLService.refresh_predictions(db)
        except Exception:
            logger.exception("Startup ML prediction refresh failed")
            db.rollback()


def start_scheduler() -> None:
    global _scheduler
    if _scheduler or not settings.ENABLE_BACKGROUND_JOBS:
        return

    _scheduler = BackgroundScheduler()
    _scheduler.add_job(run_market_refresh_job, "interval", minutes=settings.QUOTE_REFRESH_MINUTES, id="quotes")
    _scheduler.add_job(run_ml_refresh_job, "interval", hours=settings.ML_REFRESH_HOURS, id="ml")
    _scheduler.start()


def stop_scheduler() -> None:
    global _scheduler
    if _scheduler:
        _scheduler.shutdown(wait=False)
        _scheduler = None


def background_jobs_enabled() -> bool:
    return settings.ENABLE_BACKGROUND_JOBS


def run_market_refresh_job() -> None:
    with SessionLocal() as db:
        MarketService.refresh_market_snapshot(db, source="scheduler")


def run_ml_refresh_job() -> None:
    with SessionLocal() as db:
        MLService.train_models(db)
        MLService.refresh_predictions(db)
