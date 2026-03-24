from fastapi import APIRouter

from app.api.routes.assets import router as assets_router
from app.api.routes.auth import router as auth_router
from app.api.routes.ml import router as ml_router
from app.api.routes.portfolio import router as portfolio_router
from app.api.routes.system import router as system_router
from app.api.routes.trading import router as trading_router


api_router = APIRouter()
api_router.include_router(auth_router)
api_router.include_router(assets_router)
api_router.include_router(portfolio_router)
api_router.include_router(trading_router)
api_router.include_router(ml_router)
api_router.include_router(system_router)
