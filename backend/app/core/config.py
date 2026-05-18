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
    BACKEND_CORS_ORIGINS: str = (
        "http://localhost:3000,http://localhost:5173,"
        "http://127.0.0.1:3000,http://127.0.0.1:5173"
    )

    ENABLE_BACKGROUND_JOBS: bool = True
    QUOTE_REFRESH_MINUTES: int = 30
    ML_REFRESH_HOURS: int = 12

    MARKET_DATA_PROVIDER: str = "real"
    ML_ARTIFACTS_DIR: str = "./ml/artifacts"
    ML_DATASETS_DIR: str = "./ml/datasets"
    ML_EXPERIMENTS_DIR: str = "./ml/experiments"
    ML_MODEL_TYPE: str = "linear_regression"
    ML_LOOKBACK_YEARS: int = 3
    ML_TEST_RATIO: float = 0.2
    ML_MIN_DATA_POINTS: int = 120
    ML_HORIZON_DAYS: int = 7
    ML_MAX_FORECAST_MOVE_PERCENT: float = 8.0
    ML_MAX_SCENARIO_MOVE_PERCENT: float = 15.0
    ML_MAX_DRIVER_MOVE_PERCENT: float = 3.0
    ML_PLACEHOLDER_CONFIDENCE_SCORE: float = 0.68
    ML_AUTO_TRAIN_ON_STARTUP: bool = True
    LIVE_QUOTE_REFRESH_SECONDS: int = 8

    MOEX_BASE_URL: str = "https://iss.moex.com/iss"
    CBR_BASE_URL: str = "https://www.cbr.ru"
    FRED_BRENT_CSV_URL: str = "https://fred.stlouisfed.org/graph/fredgraph.csv?id=DCOILBRENTEU"
    NEWS_PROVIDER: str = "real"
    NEWS_RSS_URL: str = "https://news.google.com/rss/search"
    NEWS_FEED_LANGUAGE: str = "ru"
    NEWS_FEED_REGION: str = "RU"
    NEWS_FETCH_LIMIT: int = 10
    NEWS_SYNC_TTL_MINUTES: int = 30

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
