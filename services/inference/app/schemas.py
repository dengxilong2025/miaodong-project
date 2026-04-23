from __future__ import annotations

from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field


class InferRequest(BaseModel):
    audio_url: str
    context: Dict[str, Any] = Field(default_factory=dict)


class InferResponse(BaseModel):
    schema_version: str = "1.0"
    model_version: str = "stub-0.1"
    primary_intent: Optional[Dict[str, Any]] = None
    explanations: List[Dict[str, Any]] = Field(default_factory=list)
    risk_badges: List[Dict[str, Any]] = Field(default_factory=list)

