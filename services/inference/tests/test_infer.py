from fastapi.testclient import TestClient
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import threading
import wave

import pytest

from app.audio import AudioNormalizeError, normalize_audio
from app.main import app


client = TestClient(app)


class _QuietHandler(SimpleHTTPRequestHandler):
    def log_message(self, *_args) -> None:
        pass


@pytest.fixture
def audio_server(tmp_path: Path):
    _write_wav(tmp_path / "sample.wav", rate=44100, channels=2, seconds=0.2)
    (tmp_path / "bad.txt").write_text("not an audio file", encoding="utf-8")

    handler = partial(_QuietHandler, directory=str(tmp_path))
    httpd = ThreadingHTTPServer(("127.0.0.1", 0), handler)
    thread = threading.Thread(target=httpd.serve_forever, daemon=True)
    thread.start()
    base = f"http://127.0.0.1:{httpd.server_port}"
    try:
        yield f"{base}/sample.wav", f"{base}/bad.txt"
    finally:
        httpd.shutdown()
        thread.join(timeout=2)


def _write_wav(path: Path, rate: int, channels: int, seconds: float) -> None:
    frames = int(rate * seconds)
    with wave.open(str(path), "wb") as w:
        w.setnchannels(channels)
        w.setsampwidth(2)
        w.setframerate(rate)
        w.writeframes(b"\x00\x00" * frames * channels)


def test_health():
    r = client.get("/health")
    assert r.status_code == 200
    assert r.json()["status"] == "ok"


def test_normalize_to_16k_mono_pcm16(audio_server):
    good_url, _ = audio_server
    meta = normalize_audio(good_url)
    assert meta.sample_rate == 16000
    assert meta.channels == 1
    assert meta.sample_width == 2
    assert meta.duration_ms > 0


def test_infer_returns_schema_and_audio_meta(audio_server):
    good_url, _ = audio_server
    r = client.post(
        "/infer",
        json={"audio_url": good_url, "context": {"time_of_day": "night"}},
    )
    assert r.status_code == 200
    j = r.json()
    assert j["schema_version"] == "1.0"
    assert j["primary_intent"]["code"] == "PLAY"
    assert j["audio_normalized"] is True
    assert j["audio_meta"]["sample_rate"] == 16000
    assert j["audio_meta"]["channels"] == 1


def test_infer_rejects_invalid_audio(audio_server):
    _, bad_url = audio_server
    r = client.post("/infer", json={"audio_url": bad_url, "context": {}})
    assert r.status_code == 422
    body = r.json()
    assert body["error"]["code"] == "AUDIO_NORMALIZE_FAILED"
    assert body["error"]["message"]


def test_normalize_rejects_unsupported_scheme():
    with pytest.raises(AudioNormalizeError):
        normalize_audio("file:///tmp/a.wav")


def test_normalize_respects_host_allowlist(audio_server, monkeypatch):
    good_url, _ = audio_server
    monkeypatch.setenv("MIAODONG_AUDIO_ALLOWED_HOSTS", "storage.example.com")
    with pytest.raises(AudioNormalizeError):
        normalize_audio(good_url)


def test_normalize_reports_missing_ffmpeg(audio_server, monkeypatch):
    good_url, _ = audio_server
    monkeypatch.setattr("app.audio.shutil.which", lambda _name: None)
    with pytest.raises(AudioNormalizeError) as exc:
        normalize_audio(good_url)
    assert "ffmpeg" in str(exc.value)
