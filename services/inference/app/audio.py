from __future__ import annotations

import ipaddress
import os
import shutil
import subprocess
import tempfile
import urllib.parse
import urllib.request
import wave
from dataclasses import asdict, dataclass
from pathlib import Path


MAX_AUDIO_BYTES = 20 * 1024 * 1024
DOWNLOAD_TIMEOUT_SEC = 8
FFMPEG_TIMEOUT_SEC = 15


class AudioNormalizeError(Exception):
    """音频下载/转码失败；统一映射为 AUDIO_NORMALIZE_FAILED。"""

    code = "AUDIO_NORMALIZE_FAILED"

    def __init__(self, message: str) -> None:
        super().__init__(message)
        self.message = message


@dataclass(frozen=True)
class AudioMeta:
    sample_rate: int
    channels: int
    sample_width: int
    duration_ms: int
    format: str = "wav"

    def as_dict(self) -> dict:
        return asdict(self)


def normalize_audio(audio_url: str) -> AudioMeta:
    """
    下载任意渠道的音频，统一转成 16kHz / mono / PCM16 WAV。

    支持的来源：http/https（对象存储预签名 URL 或 API 直传地址）。
    生产环境建议设置 MIAODONG_AUDIO_ALLOWED_HOSTS，限制可下载的域名。
    """
    if not audio_url or not audio_url.strip():
        raise AudioNormalizeError("audio_url 为空")

    _validate_url(audio_url.strip())
    if shutil.which("ffmpeg") is None:
        raise AudioNormalizeError("服务端缺少 ffmpeg，无法转码")

    with tempfile.TemporaryDirectory(prefix="miaodong-audio-") as tmp:
        src = Path(tmp) / "input.bin"
        dst = Path(tmp) / "output.wav"
        _download(audio_url.strip(), src)
        _transcode(src, dst)
        return _inspect(dst)


def _validate_url(url: str) -> None:
    parsed = urllib.parse.urlparse(url)
    if parsed.scheme not in {"http", "https"}:
        raise AudioNormalizeError(f"不支持的音频协议：{parsed.scheme or 'empty'}")
    if not parsed.hostname:
        raise AudioNormalizeError("audio_url 缺少主机名")

    allowed_raw = os.getenv("MIAODONG_AUDIO_ALLOWED_HOSTS", "").strip()
    if allowed_raw:
        allowed = {h.strip().lower() for h in allowed_raw.split(",") if h.strip()}
        if parsed.hostname.lower() not in allowed:
            raise AudioNormalizeError("audio_url 域名不在允许列表")

    # 本地联调/CI 允许回环地址；生产请用 ALLOWED_HOSTS 收紧。
    try:
        ip = ipaddress.ip_address(parsed.hostname)
    except ValueError:
        return
    if ip.is_link_local or ip.is_multicast:
        raise AudioNormalizeError("audio_url 指向不允许的地址")


def _download(url: str, dst: Path) -> None:
    req = urllib.request.Request(url, headers={"User-Agent": "miaodong-inference/0.1"})
    try:
        with urllib.request.urlopen(req, timeout=DOWNLOAD_TIMEOUT_SEC) as resp:
            size = 0
            with dst.open("wb") as f:
                while True:
                    chunk = resp.read(64 * 1024)
                    if not chunk:
                        break
                    size += len(chunk)
                    if size > MAX_AUDIO_BYTES:
                        raise AudioNormalizeError("音频超过 20MB 限制")
                    f.write(chunk)
    except AudioNormalizeError:
        raise
    except Exception as exc:  # noqa: BLE001 - 统一转换为业务错误
        raise AudioNormalizeError(f"音频下载失败：{exc}") from exc

    if dst.stat().st_size == 0:
        raise AudioNormalizeError("音频内容为空")


def _transcode(src: Path, dst: Path) -> None:
    cmd = [
        "ffmpeg",
        "-hide_banner",
        "-loglevel",
        "error",
        "-y",
        "-i",
        str(src),
        "-vn",
        "-ac",
        "1",
        "-ar",
        "16000",
        "-c:a",
        "pcm_s16le",
        "-f",
        "wav",
        str(dst),
    ]
    try:
        proc = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=FFMPEG_TIMEOUT_SEC,
            check=False,
        )
    except subprocess.TimeoutExpired as exc:
        raise AudioNormalizeError("音频转码超时") from exc
    except FileNotFoundError as exc:
        raise AudioNormalizeError("服务端缺少 ffmpeg，无法转码") from exc

    if proc.returncode != 0 or not dst.exists() or dst.stat().st_size <= 44:
        detail = (proc.stderr or "").strip()[-300:]
        raise AudioNormalizeError(f"音频转码失败：{detail or 'unknown error'}")


def _inspect(path: Path) -> AudioMeta:
    try:
        with wave.open(str(path), "rb") as w:
            channels = w.getnchannels()
            sample_rate = w.getframerate()
            sample_width = w.getsampwidth()
            frames = w.getnframes()
    except Exception as exc:  # noqa: BLE001
        raise AudioNormalizeError(f"转码结果不是合法 WAV：{exc}") from exc

    if channels != 1 or sample_rate != 16000 or sample_width != 2:
        raise AudioNormalizeError(
            f"转码结果不符合 16kHz/mono/PCM16：{sample_rate}Hz/{channels}ch/{sample_width * 8}bit"
        )
    if frames <= 0:
        raise AudioNormalizeError("转码结果没有有效音频帧")

    return AudioMeta(
        sample_rate=sample_rate,
        channels=channels,
        sample_width=sample_width,
        duration_ms=int(frames * 1000 / sample_rate),
        format="wav",
    )
