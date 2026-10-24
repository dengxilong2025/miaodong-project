from __future__ import annotations

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

from .audio import AudioNormalizeError, normalize_audio
from .schemas import InferRequest, InferResponse

app = FastAPI(title="miaodong-inference", version="0.1.0")


@app.exception_handler(AudioNormalizeError)
async def audio_normalize_error_handler(_: Request, exc: AudioNormalizeError) -> JSONResponse:
    return JSONResponse(
        status_code=422,
        content={"error": {"code": exc.code, "message": exc.message}},
    )


@app.get("/health")
def health() -> dict:
    return {"status": "ok"}


@app.post("/infer", response_model=InferResponse)
def infer(req: InferRequest) -> InferResponse:
    """
    占位推理实现（用于联调与CI）：
    - 真实模型接入前，先依据 context 给出“看起来合理”的结果
    - 所有渠道的音频先统一标准化为 16kHz/mono/PCM16 WAV
    - 保证契约稳定：schema_version/model_version/primary_intent/explanations
    """
    audio_meta = normalize_audio(req.audio_url)

    time_of_day = str(req.context.get("time_of_day", ""))
    if time_of_day == "night":
        intent = {"code": "PLAY", "label": "想玩/精力过剩", "confidence": 0.72}
        expl = [{"factor": "CONTEXT", "text": "发生在夜间时段，较常与精力未消耗有关"}]
    else:
        intent = {"code": "ATTENTION", "label": "求关注/求陪伴", "confidence": 0.66}
        expl = [{"factor": "PATTERN", "text": "叫声更像在发起互动"}]

    return InferResponse(
        primary_intent=intent,
        explanations=expl,
        audio_normalized=True,
        audio_meta=audio_meta.as_dict(),
    )

