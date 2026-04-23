from __future__ import annotations

from fastapi import FastAPI

from .schemas import InferRequest, InferResponse

app = FastAPI(title="miaodong-inference", version="0.1.0")


@app.get("/health")
def health() -> dict:
    return {"status": "ok"}


@app.post("/infer", response_model=InferResponse)
def infer(req: InferRequest) -> InferResponse:
    """
    占位推理实现（用于联调与CI）：
    - 真实模型接入前，先依据 context 给出“看起来合理”的结果
    - 保证契约稳定：schema_version/model_version/primary_intent/explanations
    """
    time_of_day = str(req.context.get("time_of_day", ""))
    if time_of_day == "night":
        intent = {"code": "PLAY", "label": "想玩/精力过剩", "confidence": 0.72}
        expl = [{"factor": "CONTEXT", "text": "发生在夜间时段，较常与精力未消耗有关"}]
    else:
        intent = {"code": "ATTENTION", "label": "求关注/求陪伴", "confidence": 0.66}
        expl = [{"factor": "PATTERN", "text": "叫声更像在发起互动"}]

    return InferResponse(primary_intent=intent, explanations=expl)

