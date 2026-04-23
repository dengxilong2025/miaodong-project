package handlers

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestInferenceDegradedWhenInferenceDown(t *testing.T) {
	// 这里不启动推理服务，期望走降级路径
	reqBody, _ := json.Marshal(map[string]any{
		"audio_url": "http://example.com/a.m4a",
		"context":   map[string]any{"time_of_day": "night"},
	})
	req := httptest.NewRequest(http.MethodPost, "/v1/inference", bytes.NewReader(reqBody))
	w := httptest.NewRecorder()

	Inference(w, req)
	if w.Code != 200 {
		t.Fatalf("expected 200, got %d", w.Code)
	}
	var out map[string]any
	_ = json.Unmarshal(w.Body.Bytes(), &out)
	if out["degraded"] != true {
		t.Fatalf("expected degraded=true, got %v", out["degraded"])
	}
	if out["request_id"] == "" {
		t.Fatalf("missing request_id")
	}
}

