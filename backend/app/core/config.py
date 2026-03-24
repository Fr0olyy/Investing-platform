from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    PROJECT_NAME: str = "Инвестиционная платформа API"
    PROJECT_DESCRIPTION: str = (
        "Учебный backend на FastAPI для инвестиционной платформы: регистрация, виртуальный портфель, "
        "котировки, сделки, прогнозы и подготовленный контур под ML."
    )
    VERSION: str = "1.0.0"
    API_V1_PREFIX: str = "/api/v1"

    DATABASE_URL: str = "sqlite:///./investing_platform.db"

    SECRET_KEY: str = "please-change-me"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60

    STARTING_BALANCE: float = 1_000_000
    BASE_CURRENCY: str = "RUB"

    DEBUG: bool = False
    ENVIRONMENT: str = "development"
    BACKEND_CORS_ORIGINS: str = "http://localhost:3000,http://localhost:5173"

    ENABLE_BACKGROUND_JOBS: bool = True
    QUOTE_REFRESH_MINUTES: int = 30
    ML_REFRESH_HOURS: int = 12

    MARKET_DATA_PROVIDER: str = "mock"
    ML_ARTIFACTS_DIR: str = "./ml/artifacts"

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    @property
    def cors_origins(self) -> list[str]:
        return [item.strip() for item in self.BACKEND_CORS_ORIGINS.split(",") if item.strip()]


settings = Settings()
