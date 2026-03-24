from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.api.dependencies import get_current_user
from app.db.database import get_db
from app.db.models import User
from app.schemas.trade import TradeHistoryItem, TradeRequest, TradeResponse
from app.services.trade_service import TradeService


router = APIRouter(prefix="/trades", tags=["Trading"])


@router.post(
    "/buy",
    response_model=TradeResponse,
    summary="Покупка актива",
    description="Покупает актив по текущей рыночной цене, списывает средства и обновляет позицию.",
)
def buy_asset(
    payload: TradeRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> TradeResponse:
    return TradeService.buy(db, current_user, payload)


@router.post(
    "/sell",
    response_model=TradeResponse,
    summary="Продажа актива",
    description="Продает актив по текущей рыночной цене, начисляет средства и обновляет позицию.",
)
def sell_asset(
    payload: TradeRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> TradeResponse:
    return TradeService.sell(db, current_user, payload)


@router.get(
    "/history",
    response_model=list[TradeHistoryItem],
    summary="История сделок",
    description="Возвращает историю покупок и продаж по виртуальному счету пользователя.",
)
def get_trade_history(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[TradeHistoryItem]:
    return TradeService.get_history(db, current_user)
