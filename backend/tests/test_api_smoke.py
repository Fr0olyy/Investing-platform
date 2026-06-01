import os
from pathlib import Path

from fastapi.testclient import TestClient


TEST_DB = Path("test_api_smoke.db")
if TEST_DB.exists():
    TEST_DB.unlink()

os.environ["DATABASE_URL"] = "sqlite:///./test_api_smoke.db"
os.environ["ENABLE_BACKGROUND_JOBS"] = "false"
os.environ["MARKET_DATA_PROVIDER"] = "mock"
os.environ["ML_AUTO_TRAIN_ON_STARTUP"] = "false"

from app.main import app  # noqa: E402
from app.core.config import settings  # noqa: E402
from app.core.security import get_password_hash  # noqa: E402
from app.db.database import SessionLocal  # noqa: E402
from app.db.models import Portfolio, User  # noqa: E402


def test_health_and_auth_flow():
    with TestClient(app) as client:
        health = client.get("/api/v1/system/health")
        assert health.status_code == 200
        assert health.json()["status"] == "ok"

        register = client.post(
            "/api/v1/auth/register",
            json={"email": "investor.check@gmail.com", "password": "supersecure123"},
        )
        assert register.status_code == 201
        token = register.json()["token"]["access_token"]

        profile = client.get(
            "/api/v1/auth/me",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert profile.status_code == 200
        assert profile.json()["email"] == "investor.check@gmail.com"

        assets = client.get("/api/v1/assets")
        assert assets.status_code == 200
        assert len(assets.json()) >= 1


def test_registration_rejects_unrealistic_email():
    with TestClient(app) as client:
        response = client.post(
            "/api/v1/auth/register",
            json={"email": "1@random.ru", "password": "supersecure123"},
        )

        assert response.status_code == 422


def test_registration_accepts_realistic_email():
    with TestClient(app) as client:
        response = client.post(
            "/api/v1/auth/register",
            json={"email": "real.investor@gmail.com", "password": "supersecure123"},
        )

        assert response.status_code == 201
        assert response.json()["user"]["email"] == "real.investor@gmail.com"


def test_admin_panel_endpoints_require_admin_role():
    with TestClient(app) as client:
        investor = client.post(
            "/api/v1/auth/register",
            json={"email": "investor.admincheck@gmail.com", "password": "supersecure123"},
        )
        investor_token = investor.json()["token"]["access_token"]

        forbidden = client.get(
            "/api/v1/admin/overview",
            headers={"Authorization": f"Bearer {investor_token}"},
        )
        assert forbidden.status_code == 403

        with SessionLocal() as db:
            admin = User(
                email="admin.check@gmail.com",
                hashed_password=get_password_hash("supersecure123"),
                role="admin",
                is_active=True,
            )
            portfolio = Portfolio(
                user=admin,
                cash_balance=settings.STARTING_BALANCE,
                base_currency=settings.BASE_CURRENCY,
            )
            db.add_all([admin, portfolio])
            db.commit()

        login = client.post(
            "/api/v1/auth/login",
            json={"email": "admin.check@gmail.com", "password": "supersecure123"},
        )
        assert login.status_code == 200
        admin_token = login.json()["token"]["access_token"]

        overview = client.get(
            "/api/v1/admin/overview",
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        assert overview.status_code == 200
        assert overview.json()["users_total"] >= 1

        users = client.get(
            "/api/v1/admin/users",
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        assert users.status_code == 200
        assert any(item["email"] == "admin.check@gmail.com" for item in users.json())
