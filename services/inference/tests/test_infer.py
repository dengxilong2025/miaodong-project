from fastapi.testclient import TestClient

from app.main import app


client = TestClient(app)


def test_health():
    r = client.get("/health")
    assert r.status_code == 200
    assert r.json()["status"] == "ok"


def test_infer_returns_schema():
    r = client.post("/infer", json={"audio_url": "http://example.com/a.m4a", "context": {"time_of_day": "night"}})
    assert r.status_code == 200
    j = r.json()
    assert j["schema_version"] == "1.0"
    assert j["primary_intent"]["code"] == "PLAY"

