from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.router import api_router
from app.core.config import settings
from app.services.bootstrap_service import initialize_application, start_scheduler, stop_scheduler


OPENAPI_TAGS = [
    {
        "name": "Authentication",
        "description": "Регистрация, вход и получение данных текущего инвестора.",
    },
    {
        "name": "Assets",
        "description": "Каталог инструментов, котировки, свечи и новостной фон.",
    },
    {
        "name": "Portfolio",
        "description": "Просмотр состояния виртуального брокерского счета и активных позиций.",
    },
    {
        "name": "Trading",
        "description": "Покупка и продажа активов по текущей рыночной цене.",
    },
    {
        "name": "ML Sandbox",
        "description": "Контур под ML: метаданные модели, кэш прогнозов и сценарный макро-анализ.",
    },
    {
        "name": "System",
        "description": "Технические методы: healthcheck, ручное обновление рынка и пересчет прогнозов.",
    },
    {
        "name": "Root",
        "description": "Базовая точка входа сервиса.",
    },
]


@asynccontextmanager
async def lifespan(_: FastAPI):
    initialize_application()
    start_scheduler()
    yield
    stop_scheduler()


app = FastAPI(
    title="Инвестиционная платформа API",
    description=settings.PROJECT_DESCRIPTION,
    version=settings.VERSION,
    docs_url="/docs",
    redoc_url="/redoc",
    openapi_url="/openapi.json",
    swagger_ui_parameters={"persistAuthorization": True},
    openapi_tags=OPENAPI_TAGS,
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(api_router, prefix=settings.API_V1_PREFIX)


@app.get("/", tags=["Root"])
def root() -> dict[str, str]:
    return {
        "message": "Backend инвестиционной платформы запущен.",
        "docs": "/docs",
        "api_prefix": settings.API_V1_PREFIX,
    }
