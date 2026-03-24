from __future__ import annotations

from decimal import Decimal, ROUND_HALF_UP

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.db.models import Portfolio, Position, User
from app.schemas.portfolio import AllocationItem, PortfolioSummaryResponse, PositionResponse
from app.services.market_service import MarketService


def money(value: Decimal | float | int) -> Decimal:
    return Decimal(str(value)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


class PortfolioService:
    @staticmethod
    def get_portfolio(db: Session, user: User) -> Portfolio:
        portfolio = db.scalar(select(Portfolio).where(Portfolio.user_id == user.id))
        if not portfolio:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Portfolio not found.")
        return portfolio

    @staticmethod
    def get_positions(db: Session, user: User) -> list[PositionResponse]:
        return PortfolioService.get_summary(db, user).positions

    @staticmethod
    def get_summary(db: Session, user: User) -> PortfolioSummaryResponse:
        portfolio = PortfolioService.get_portfolio(db, user)
        positions = db.scalars(
            select(Position).where(Position.portfolio_id == portfolio.id).order_by(Position.created_at.asc())
        ).all()

        position_items: list[PositionResponse] = []
        allocation: list[AllocationItem] = []
        invested_value = Decimal("0")

        for position in positions:
            quote = MarketService.get_latest_quote(db, position.asset_id)
            current_price = money(quote.price)
            market_value = money(current_price * position.quantity)
            average_price = money(position.average_price)
            unrealized_pnl = money((current_price - average_price) * position.quantity)
            unrealized_pnl_percent = float(
                money(((current_price - average_price) / average_price) * Decimal("100"))
            ) if average_price else 0.0
            invested_value += market_value

            position_items.append(
                PositionResponse(
                    ticker=position.asset.ticker,
                    name=position.asset.name,
                    quantity=position.quantity,
                    average_price=float(position.average_price),
                    current_price=float(current_price),
                    market_value=float(market_value),
                    unrealized_pnl=float(unrealized_pnl),
                    unrealized_pnl_percent=unrealized_pnl_percent,
                    share_of_portfolio=0,
                )
            )

        total_value = money(portfolio.cash_balance) + invested_value
        total_pnl = total_value - money(settings.STARTING_BALANCE)
        total_pnl_percent = float(money((total_pnl / Decimal(str(settings.STARTING_BALANCE))) * Decimal("100")))

        for item in position_items:
            share = float(money((Decimal(str(item.market_value)) / total_value) * Decimal("100"))) if total_value else 0.0
            item.share_of_portfolio = share
            allocation.append(
                AllocationItem(
                    ticker=item.ticker,
                    share_of_portfolio=share,
                    market_value=item.market_value,
                )
            )

        return PortfolioSummaryResponse(
            cash_balance=float(money(portfolio.cash_balance)),
            invested_value=float(invested_value),
            total_value=float(total_value),
            total_pnl=float(money(total_pnl)),
            total_pnl_percent=total_pnl_percent,
            base_currency=portfolio.base_currency,
            positions_count=len(position_items),
            positions=position_items,
            allocation=allocation,
        )
