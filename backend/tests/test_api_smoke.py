import os
from pathlib import Path

from fastapi.testclient import TestClient


TEST_DB = Path("test_api_smoke.db")
if TEST_DB.exists():
    TEST_DB.unlink()

os.environ["DATABASE_URL"] = "sqlite:///./test_api_smoke.db"
os.environ["ENABLE_BACKGROUND_JOBS"] = "false"

from app.main import app  # noqa: E402


def test_health_and_auth_flow():
    with TestClient(app) as client:
        health = client.get("/api/v1/system/health")
        assert health.status_code == 200
        assert health.json()["status"] == "ok"

        register = client.post(
            "/api/v1/auth/register",
            json={"email": "test@example.com", "password": "supersecure123"},
        )
        assert register.status_code == 201
        token = register.json()["token"]["access_token"]

        profile = client.get(
            "/api/v1/auth/me",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert profile.status_code == 200
        assert profile.json()["email"] == "test@example.com"

        assets = client.get("/api/v1/assets")
        assert assets.status_code == 200
        assert len(assets.json()) >= 1
