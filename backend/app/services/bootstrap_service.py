from __future__ import annotations

from apscheduler.schedulers.background import BackgroundScheduler

from app.core.config import settings
from app.db.database import SessionLocal, init_db
from app.db.seed import seed_reference_data
from app.services.market_service import MarketService
from app.services.ml_service import MLService


_scheduler: BackgroundScheduler | None = None


def initialize_application() -> None:
    init_db()
    with SessionLocal() as db:
        seed_reference_data(db)
        MLService.refresh_predictions(db)


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
        MLService.refresh_predictions(db)
