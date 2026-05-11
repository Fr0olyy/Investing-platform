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
