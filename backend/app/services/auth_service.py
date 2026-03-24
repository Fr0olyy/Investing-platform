from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.security import create_access_token, get_password_hash, verify_password
from app.db.models import Portfolio, User
from app.schemas.auth import AuthResponse, TokenResponse, UserResponse


class AuthService:
    @staticmethod
    def register(db: Session, email: str, password: str) -> AuthResponse:
        existing_user = db.scalar(select(User).where(User.email == email))
        if existing_user:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Email is already registered.",
            )

        user = User(email=email, hashed_password=get_password_hash(password))
        portfolio = Portfolio(
            user=user,
            cash_balance=settings.STARTING_BALANCE,
            base_currency=settings.BASE_CURRENCY,
        )
        db.add_all([user, portfolio])
        db.commit()
        db.refresh(user)
        return AuthService._build_auth_response(user)

    @staticmethod
    def login(db: Session, email: str, password: str) -> AuthResponse:
        user = db.scalar(select(User).where(User.email == email))
        if not user or not verify_password(password, user.hashed_password):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Incorrect email or password.",
            )
        return AuthService._build_auth_response(user)

    @staticmethod
    def _build_auth_response(user: User) -> AuthResponse:
        token = create_access_token(subject=user.id, extra_claims={"email": user.email, "role": user.role})
        return AuthResponse(
            user=UserResponse.model_validate(user),
            token=TokenResponse(
                access_token=token,
                expires_in_minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES,
            ),
        )
