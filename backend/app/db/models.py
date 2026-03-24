from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import Any
from uuid import uuid4

from sqlalchemy import Boolean, DateTime, Enum as SqlEnum, ForeignKey, Integer, Numeric, String, Text, UniqueConstraint
from sqlalchemy.dialects.sqlite import JSON
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.database import Base


def generate_uuid() -> str:
    return str(uuid4())


class TimestampMixin:
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime,
        default=datetime.utcnow,
        onupdate=datetime.utcnow,
        nullable=False,
    )


class TradeSide(str, Enum):
    BUY = "BUY"
    SELL = "SELL"


class MLModelStatus(str, Enum):
    NOT_TRAINED = "NOT_TRAINED"
    READY = "READY"
    STALE = "STALE"


class User(TimestampMixin, Base):
    __tablename__ = "users"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True, nullable=False)
    hashed_password: Mapped[str] = mapped_column(String(255), nullable=False)
    role: Mapped[str] = mapped_column(String(50), default="investor", nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    portfolio: Mapped["Portfolio"] = relationship(back_populates="user", uselist=False)


class Portfolio(TimestampMixin, Base):
    __tablename__ = "portfolios"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"), unique=True, nullable=False)
    cash_balance: Mapped[float] = mapped_column(Numeric(18, 2), nullable=False)
    base_currency: Mapped[str] = mapped_column(String(10), default="RUB", nullable=False)

    user: Mapped[User] = relationship(back_populates="portfolio")
    positions: Mapped[list["Position"]] = relationship(back_populates="portfolio", cascade="all, delete-orphan")
    trades: Mapped[list["Trade"]] = relationship(back_populates="portfolio", cascade="all, delete-orphan")


class Asset(TimestampMixin, Base):
    __tablename__ = "assets"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    ticker: Mapped[str] = mapped_column(String(20), unique=True, index=True, nullable=False)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    sector: Mapped[str] = mapped_column(String(120), nullable=False)
    currency: Mapped[str] = mapped_column(String(10), default="RUB", nullable=False)
    exchange: Mapped[str] = mapped_column(String(50), default="MOEX", nullable=False)
    board: Mapped[str] = mapped_column(String(20), default="TQBR", nullable=False)
    lot_size: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    quotes: Mapped[list["Quote"]] = relationship(back_populates="asset", cascade="all, delete-orphan")
    candles: Mapped[list["Candle"]] = relationship(back_populates="asset", cascade="all, delete-orphan")
    positions: Mapped[list["Position"]] = relationship(back_populates="asset")
    trades: Mapped[list["Trade"]] = relationship(back_populates="asset")
    predictions: Mapped[list["Prediction"]] = relationship(back_populates="asset", cascade="all, delete-orphan")
    news_items: Mapped[list["NewsArticle"]] = relationship(back_populates="asset", cascade="all, delete-orphan")
    ml_model_metadata: Mapped["MLModelMetadata"] = relationship(
        back_populates="asset",
        uselist=False,
        cascade="all, delete-orphan",
    )
    scenario_simulations: Mapped[list["ScenarioSimulation"]] = relationship(
        back_populates="asset",
        cascade="all, delete-orphan",
    )


class Quote(Base):
    __tablename__ = "quotes"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    asset_id: Mapped[str] = mapped_column(ForeignKey("assets.id"), nullable=False, index=True)
    price: Mapped[float] = mapped_column(Numeric(18, 2), nullable=False)
    open: Mapped[float] = mapped_column(Numeric(18, 2), nullable=False)
    high: Mapped[float] = mapped_column(Numeric(18, 2), nullable=False)
    low: Mapped[float] = mapped_column(Numeric(18, 2), nullable=False)
    close: Mapped[float] = mapped_column(Numeric(18, 2), nullable=False)
    prev_close: Mapped[float] = mapped_column(Numeric(18, 2), nullable=False)
    change_percent: Mapped[float] = mapped_column(Numeric(10, 2), nullable=False)
    volume: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    source: Mapped[str] = mapped_column(String(50), default="mock", nullable=False)
    recorded_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False, index=True)

    asset: Mapped[Asset] = relationship(back_populates="quotes")


class Candle(Base):
    __tablename__ = "candles"
    __table_args__ = (UniqueConstraint("asset_id", "interval", "timestamp", name="uq_asset_interval_timestamp"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    asset_id: Mapped[str] = mapped_column(ForeignKey("assets.id"), nullable=False, index=True)
    interval: Mapped[str] = mapped_column(String(10), default="1d", nullable=False)
    open: Mapped[float] = mapped_column(Numeric(18, 2), nullable=False)
    high: Mapped[float] = mapped_column(Numeric(18, 2), nullable=False)
    low: Mapped[float] = mapped_column(Numeric(18, 2), nullable=False)
    close: Mapped[float] = mapped_column(Numeric(18, 2), nullable=False)
    volume: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    timestamp: Mapped[datetime] = mapped_column(DateTime, nullable=False, index=True)

    asset: Mapped[Asset] = relationship(back_populates="candles")


class Position(TimestampMixin, Base):
    __tablename__ = "positions"
    __table_args__ = (UniqueConstraint("portfolio_id", "asset_id", name="uq_portfolio_asset"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    portfolio_id: Mapped[str] = mapped_column(ForeignKey("portfolios.id"), nullable=False, index=True)
    asset_id: Mapped[str] = mapped_column(ForeignKey("assets.id"), nullable=False, index=True)
    quantity: Mapped[int] = mapped_column(Integer, nullable=False)
    average_price: Mapped[float] = mapped_column(Numeric(18, 2), nullable=False)

    portfolio: Mapped[Portfolio] = relationship(back_populates="positions")
    asset: Mapped[Asset] = relationship(back_populates="positions")


class Trade(Base):
    __tablename__ = "trades"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    portfolio_id: Mapped[str] = mapped_column(ForeignKey("portfolios.id"), nullable=False, index=True)
    asset_id: Mapped[str] = mapped_column(ForeignKey("assets.id"), nullable=False, index=True)
    side: Mapped[TradeSide] = mapped_column(SqlEnum(TradeSide), nullable=False)
    quantity: Mapped[int] = mapped_column(Integer, nullable=False)
    price: Mapped[float] = mapped_column(Numeric(18, 2), nullable=False)
    total_amount: Mapped[float] = mapped_column(Numeric(18, 2), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)

    portfolio: Mapped[Portfolio] = relationship(back_populates="trades")
    asset: Mapped[Asset] = relationship(back_populates="trades")


class Prediction(Base):
    __tablename__ = "predictions"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    asset_id: Mapped[str] = mapped_column(ForeignKey("assets.id"), nullable=False, index=True)
    current_price: Mapped[float] = mapped_column(Numeric(18, 2), nullable=False)
    predicted_price: Mapped[float] = mapped_column(Numeric(18, 2), nullable=False)
    impact_percent: Mapped[float] = mapped_column(Numeric(10, 2), nullable=False)
    confidence_score: Mapped[float] = mapped_column(Numeric(5, 2), nullable=False)
    horizon_days: Mapped[int] = mapped_column(Integer, default=7, nullable=False)
    summary: Mapped[str] = mapped_column(Text, nullable=False)
    drivers: Mapped[list[dict[str, Any]]] = mapped_column(JSON, default=list, nullable=False)
    is_placeholder: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    generated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False, index=True)

    asset: Mapped[Asset] = relationship(back_populates="predictions")


class MacroIndicatorSnapshot(Base):
    __tablename__ = "macro_indicator_snapshots"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    code: Mapped[str] = mapped_column(String(50), index=True, nullable=False)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    value: Mapped[float] = mapped_column(Numeric(18, 4), nullable=False)
    source: Mapped[str] = mapped_column(String(50), default="mock", nullable=False)
    recorded_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False, index=True)


class MLModelMetadata(TimestampMixin, Base):
    __tablename__ = "ml_model_metadata"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    asset_id: Mapped[str] = mapped_column(ForeignKey("assets.id"), unique=True, nullable=False, index=True)
    model_name: Mapped[str] = mapped_column(String(120), nullable=False)
    model_version: Mapped[str] = mapped_column(String(50), default="baseline-placeholder", nullable=False)
    status: Mapped[MLModelStatus] = mapped_column(SqlEnum(MLModelStatus), default=MLModelStatus.NOT_TRAINED)
    feature_names: Mapped[list[str]] = mapped_column(JSON, default=list, nullable=False)
    metrics: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict, nullable=False)
    model_params: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict, nullable=False)
    artifact_path: Mapped[str | None] = mapped_column(String(255))
    trained_at: Mapped[datetime | None] = mapped_column(DateTime)
    notes: Mapped[str | None] = mapped_column(Text)

    asset: Mapped[Asset] = relationship(back_populates="ml_model_metadata")


class ScenarioSimulation(Base):
    __tablename__ = "scenario_simulations"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    asset_id: Mapped[str] = mapped_column(ForeignKey("assets.id"), nullable=False, index=True)
    input_features: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict, nullable=False)
    predicted_price: Mapped[float] = mapped_column(Numeric(18, 2), nullable=False)
    impact_percent: Mapped[float] = mapped_column(Numeric(10, 2), nullable=False)
    confidence_score: Mapped[float] = mapped_column(Numeric(5, 2), nullable=False)
    drivers: Mapped[list[dict[str, Any]]] = mapped_column(JSON, default=list, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False, index=True)

    asset: Mapped[Asset] = relationship(back_populates="scenario_simulations")


class NewsArticle(TimestampMixin, Base):
    __tablename__ = "news_articles"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    asset_id: Mapped[str | None] = mapped_column(ForeignKey("assets.id"), index=True)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    summary: Mapped[str] = mapped_column(Text, nullable=False)
    url: Mapped[str] = mapped_column(String(500), nullable=False)
    source: Mapped[str] = mapped_column(String(120), nullable=False)
    sentiment: Mapped[str] = mapped_column(String(30), default="neutral", nullable=False)
    published_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, index=True)

    asset: Mapped[Asset | None] = relationship(back_populates="news_items")
