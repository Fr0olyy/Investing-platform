from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import desc, func, select
from sqlalchemy.orm import Session

from app.api.dependencies import get_current_admin
from app.db.database import get_db
from app.db.models import Asset, NewsArticle, Portfolio, Position, Prediction, Quote, Trade, User
from app.schemas.admin import AdminOverviewResponse, AdminUserResponse, AdminUserUpdateRequest
from app.services.bootstrap_service import background_jobs_enabled


router = APIRouter(prefix="/admin", tags=["Admin"])


def _count(db: Session, model) -> int:
    return int(db.scalar(select(func.count()).select_from(model)) or 0)


@router.get(
    "/overview",
    response_model=AdminOverviewResponse,
    summary="Сводка администратора",
    description="Ключевые показатели платформы для административной панели.",
)
def get_admin_overview(
    db: Session = Depends(get_db),
    _current_admin: User = Depends(get_current_admin),
) -> AdminOverviewResponse:
    latest_quote_at = db.scalar(select(Quote.recorded_at).order_by(desc(Quote.recorded_at)).limit(1))
    return AdminOverviewResponse(
        users_total=_count(db, User),
        active_users=int(db.scalar(select(func.count()).select_from(User).where(User.is_active.is_(True))) or 0),
        admin_users=int(db.scalar(select(func.count()).select_from(User).where(User.role == "admin")) or 0),
        assets_total=_count(db, Asset),
        trades_total=_count(db, Trade),
        positions_total=_count(db, Position),
        news_total=_count(db, NewsArticle),
        predictions_total=_count(db, Prediction),
        latest_quote_at=latest_quote_at,
        background_jobs=background_jobs_enabled(),
    )


@router.get(
    "/users",
    response_model=list[AdminUserResponse],
    summary="Пользователи",
    description="Список пользователей с ролями и базовой активностью.",
)
def list_admin_users(
    db: Session = Depends(get_db),
    _current_admin: User = Depends(get_current_admin),
) -> list[AdminUserResponse]:
    users = db.scalars(select(User).order_by(desc(User.created_at))).all()
    items: list[AdminUserResponse] = []
    for user in users:
        positions_count = int(
            db.scalar(
                select(func.count())
                .select_from(Position)
                .join(Portfolio, Position.portfolio_id == Portfolio.id)
                .where(Portfolio.user_id == user.id)
            )
            or 0
        )
        trades_count = int(
            db.scalar(
                select(func.count())
                .select_from(Trade)
                .join(Portfolio, Trade.portfolio_id == Portfolio.id)
                .where(Portfolio.user_id == user.id)
            )
            or 0
        )
        items.append(
            AdminUserResponse(
                id=user.id,
                email=user.email,
                role=user.role,
                is_active=user.is_active,
                created_at=user.created_at,
                positions_count=positions_count,
                trades_count=trades_count,
            )
        )
    return items


@router.patch(
    "/users/{user_id}",
    response_model=AdminUserResponse,
    summary="Изменить пользователя",
    description="Позволяет администратору менять роль и активность пользователя.",
)
def update_admin_user(
    user_id: str,
    payload: AdminUserUpdateRequest,
    db: Session = Depends(get_db),
    current_admin: User = Depends(get_current_admin),
) -> AdminUserResponse:
    user = db.scalar(select(User).where(User.id == user_id))
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found.")

    if payload.is_active is False and user.id == current_admin.id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="You cannot deactivate your own account.")

    if payload.role is not None:
        user.role = payload.role
    if payload.is_active is not None:
        user.is_active = payload.is_active

    db.commit()
    db.refresh(user)

    positions_count = int(
        db.scalar(
            select(func.count())
            .select_from(Position)
            .join(Portfolio, Position.portfolio_id == Portfolio.id)
            .where(Portfolio.user_id == user.id)
        )
        or 0
    )
    trades_count = int(
        db.scalar(
            select(func.count())
            .select_from(Trade)
            .join(Portfolio, Trade.portfolio_id == Portfolio.id)
            .where(Portfolio.user_id == user.id)
        )
        or 0
    )
    return AdminUserResponse(
        id=user.id,
        email=user.email,
        role=user.role,
        is_active=user.is_active,
        created_at=user.created_at,
        positions_count=positions_count,
        trades_count=trades_count,
    )
