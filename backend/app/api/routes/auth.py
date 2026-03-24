from fastapi import APIRouter, Depends, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session

from app.api.dependencies import get_current_user
from app.db.database import get_db
from app.db.models import User
from app.schemas.auth import AuthResponse, LoginRequest, TokenResponse, UserResponse
from app.services.auth_service import AuthService


router = APIRouter(prefix="/auth", tags=["Authentication"])


@router.post(
    "/register",
    response_model=AuthResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Регистрация инвестора",
    description="Создает пользователя, автоматически открывает виртуальный счет и возвращает JWT-токен.",
)
def register(payload: LoginRequest, db: Session = Depends(get_db)) -> AuthResponse:
    return AuthService.register(db=db, email=payload.email, password=payload.password)


@router.post(
    "/login",
    response_model=AuthResponse,
    summary="Вход по email и паролю",
    description="Проверяет учетные данные пользователя и возвращает JWT-токен для работы с API.",
)
def login(payload: LoginRequest, db: Session = Depends(get_db)) -> AuthResponse:
    return AuthService.login(db=db, email=payload.email, password=payload.password)


@router.post(
    "/token",
    response_model=TokenResponse,
    summary="OAuth2-вход для Swagger",
    description="Специальный endpoint для кнопки Authorize в Swagger UI.",
)
def login_for_swagger(
    form_data: OAuth2PasswordRequestForm = Depends(),
    db: Session = Depends(get_db),
) -> TokenResponse:
    auth = AuthService.login(db=db, email=form_data.username, password=form_data.password)
    return auth.token


@router.get(
    "/me",
    response_model=UserResponse,
    summary="Текущий пользователь",
    description="Возвращает профиль авторизованного инвестора по JWT-токену.",
)
def read_current_user(current_user: User = Depends(get_current_user)) -> UserResponse:
    return UserResponse.model_validate(current_user)
