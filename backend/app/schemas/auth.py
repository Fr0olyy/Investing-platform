from datetime import datetime

from pydantic import ConfigDict, EmailStr, Field

from app.schemas.base import APIModel


class LoginRequest(APIModel):
    email: EmailStr = Field(description="Email пользователя, который используется как логин.")
    password: str = Field(min_length=8, max_length=128, description="Пароль пользователя.")

    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "email": "investor@example.com",
                "password": "securepass123",
            }
        }
    )


class UserResponse(APIModel):
    id: str = Field(description="Идентификатор пользователя.")
    email: EmailStr = Field(description="Email инвестора.")
    role: str = Field(description="Роль в системе.")
    is_active: bool = Field(description="Активен ли пользователь.")
    created_at: datetime = Field(description="Дата и время создания аккаунта.")


class TokenResponse(APIModel):
    access_token: str = Field(description="JWT access token для авторизации в API.")
    token_type: str = Field(default="bearer", description="Тип токена.")
    expires_in_minutes: int = Field(description="Время жизни токена в минутах.")


class AuthResponse(APIModel):
    user: UserResponse = Field(description="Профиль пользователя.")
    token: TokenResponse = Field(description="Токен для последующих запросов.")
