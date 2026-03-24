from __future__ import annotations

from decimal import Decimal, ROUND_HALF_UP

from fastapi import HTTPException, status
from sqlalchemy import desc, select
from sqlalchemy.orm import Session

from app.db.models import Position, Trade, TradeSide, User
from app.schemas.trade import TradeHistoryItem, TradeRequest, TradeResponse
from app.services.market_service import MarketService
from app.services.portfolio_service import PortfolioService


def money(value: Decimal | float | int) -> Decimal:
    return Decimal(str(value)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


class TradeService:
    @staticmethod
    def buy(db: Session, user: User, payload: TradeRequest) -> TradeResponse:
        return TradeService._execute(db, user, payload, TradeSide.BUY)

    @staticmethod
    def sell(db: Session, user: User, payload: TradeRequest) -> TradeResponse:
        return TradeService._execute(db, user, payload, TradeSide.SELL)

    @staticmethod
    def get_history(db: Session, user: User) -> list[TradeHistoryItem]:
        portfolio = PortfolioService.get_portfolio(db, user)
        trades = db.scalars(
            select(Trade).where(Trade.portfolio_id == portfolio.id).order_by(desc(Trade.created_at)).limit(100)
        ).all()
        return [
            TradeHistoryItem(
                id=trade.id,
                ticker=trade.asset.ticker,
                asset_name=trade.asset.name,
                side=trade.side.value,
                quantity=trade.quantity,
                price=float(trade.price),
                total_amount=float(trade.total_amount),
                created_at=trade.created_at,
            )
            for trade in trades
        ]

    @staticmethod
    def _execute(db: Session, user: User, payload: TradeRequest, side: TradeSide) -> TradeResponse:
        portfolio = PortfolioService.get_portfolio(db, user)
        asset = MarketService.get_asset_or_404(db, payload.ticker)
        quote = MarketService.get_latest_quote(db, asset.id)
        position = db.scalar(
            select(Position).where(Position.portfolio_id == portfolio.id, Position.asset_id == asset.id).limit(1)
        )

        trade_price = money(quote.price)
        total_amount = money(trade_price * payload.quantity)

        try:
            if side == TradeSide.BUY:
                if money(portfolio.cash_balance) < total_amount:
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail="Insufficient virtual funds for this purchase.",
                    )

                if position:
                    total_quantity = position.quantity + payload.quantity
                    position.average_price = money(
                        (
                            money(position.average_price) * position.quantity
                            + trade_price * payload.quantity
                        )
                        / total_quantity
                    )
                    position.quantity = total_quantity
                else:
                    db.add(
                        Position(
                            portfolio_id=portfolio.id,
                            asset_id=asset.id,
                            quantity=payload.quantity,
                            average_price=trade_price,
                        )
                    )

                portfolio.cash_balance = money(portfolio.cash_balance) - total_amount
                message = "Asset purchased successfully."
            else:
                if not position or position.quantity < payload.quantity:
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail="Not enough asset quantity to sell.",
                    )

                position.quantity -= payload.quantity
                portfolio.cash_balance = money(portfolio.cash_balance) + total_amount
                if position.quantity == 0:
                    db.delete(position)
                message = "Asset sold successfully."

            trade = Trade(
                portfolio_id=portfolio.id,
                asset_id=asset.id,
                side=side,
                quantity=payload.quantity,
                price=trade_price,
                total_amount=total_amount,
            )
            db.add(trade)
            db.commit()
            db.refresh(trade)
        except HTTPException:
            db.rollback()
            raise
        except Exception as exc:
            db.rollback()
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Trade execution failed.",
            ) from exc

        return TradeResponse(
            message=message,
            trade=TradeHistoryItem(
                id=trade.id,
                ticker=asset.ticker,
                asset_name=asset.name,
                side=trade.side.value,
                quantity=trade.quantity,
                price=float(trade.price),
                total_amount=float(trade.total_amount),
                created_at=trade.created_at,
            ),
            cash_balance=float(money(portfolio.cash_balance)),
        )
