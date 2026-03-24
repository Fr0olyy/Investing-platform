from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.api.dependencies import get_current_user
from app.db.database import get_db
from app.db.models import User
from app.schemas.portfolio import PortfolioSummaryResponse, PositionResponse
from app.services.portfolio_service import PortfolioService


router = APIRouter(prefix="/portfolio", tags=["Portfolio"])


@router.get(
    "/summary",
    response_model=PortfolioSummaryResponse,
    summary="Сводка по портфелю",
    description="Баланс, стоимость активов, общая прибыль/убыток и распределение портфеля.",
)
def get_portfolio_summary(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> PortfolioSummaryResponse:
    return PortfolioService.get_summary(db, current_user)


@router.get(
    "/positions",
    response_model=list[PositionResponse],
    summary="Позиции портфеля",
    description="Возвращает текущие открытые позиции авторизованного инвестора.",
)
def get_positions(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[PositionResponse]:
    return PortfolioService.get_positions(db, current_user)
