package handlers

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

func TestInference_SuccessAddsFields(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(`{"schema_version":"1.0","model_version":"stub"}`))
	}))
	defer srv.Close()

	t.Setenv("MIAODONG_INFERENCE_URL", srv.URL)
	t.Setenv("MIAODONG_INFERENCE_TIMEOUT_MS", "3000")

	req := httptest.NewRequest(http.MethodPost, "/v1/inference", strings.NewReader(`{"audio_url":"http://x"}`))
	w := httptest.NewRecorder()
	Inference(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200 got %d", w.Code)
	}

	var out map[string]any
	if err := json.Unmarshal(w.Body.Bytes(), &out); err != nil {
		t.Fatalf("invalid response json: %v, body=%s", err, w.Body.String())
	}
	if out["degraded"] != false {
		t.Fatalf("expected degraded=false, got %v", out["degraded"])
	}
	if out["request_id"] == "" {
		t.Fatalf("missing request_id: %v", out)
	}
	if _, ok := out["inference_latency_ms"]; !ok {
		t.Fatalf("missing inference_latency_ms: %v", out)
	}
	// json.Unmarshal into map[string]any will decode numbers as float64
	if v, ok := out["inference_latency_ms"].(float64); !ok || v < 0 {
		t.Fatalf("invalid inference_latency_ms: %v", out["inference_latency_ms"])
	}
	if _, ok := out["degraded_reason"]; ok {
		t.Fatalf("success response should not include degraded_reason: %v", out)
	}
}

func TestInference_BadStatus(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusInternalServerError)
	}))
	defer srv.Close()

	t.Setenv("MIAODONG_INFERENCE_URL", srv.URL)
	t.Setenv("MIAODONG_INFERENCE_TIMEOUT_MS", "3000")

	req := httptest.NewRequest(http.MethodPost, "/v1/inference", strings.NewReader(`{"audio_url":"http://x"}`))
	w := httptest.NewRecorder()
	Inference(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200 got %d", w.Code)
	}

	var out map[string]any
	if err := json.Unmarshal(w.Body.Bytes(), &out); err != nil {
		t.Fatalf("invalid response json: %v, body=%s", err, w.Body.String())
	}
	if out["degraded"] != true || out["degraded_reason"] != "bad_status" {
		t.Fatalf("expected bad_status: %v", out)
	}
	if _, ok := out["inference_latency_ms"]; !ok {
		t.Fatalf("missing inference_latency_ms: %v", out)
	}
}

func TestInference_BadJSON(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte("{not-json"))
	}))
	defer srv.Close()

	t.Setenv("MIAODONG_INFERENCE_URL", srv.URL)
	t.Setenv("MIAODONG_INFERENCE_TIMEOUT_MS", "3000")

	req := httptest.NewRequest(http.MethodPost, "/v1/inference", strings.NewReader(`{"audio_url":"http://x"}`))
	w := httptest.NewRecorder()
	Inference(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200 got %d", w.Code)
	}

	var out map[string]any
	if err := json.Unmarshal(w.Body.Bytes(), &out); err != nil {
		t.Fatalf("invalid response json: %v, body=%s", err, w.Body.String())
	}
	if out["degraded"] != true || out["degraded_reason"] != "bad_json" {
		t.Fatalf("expected bad_json: %v", out)
	}
	if _, ok := out["inference_latency_ms"]; !ok {
		t.Fatalf("missing inference_latency_ms: %v", out)
	}
}

func TestInference_Timeout(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		time.Sleep(200 * time.Millisecond)
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(`{"ok":true}`))
	}))
	defer srv.Close()

	t.Setenv("MIAODONG_INFERENCE_URL", srv.URL)
	t.Setenv("MIAODONG_INFERENCE_TIMEOUT_MS", "10")

	req := httptest.NewRequest(http.MethodPost, "/v1/inference", strings.NewReader(`{"audio_url":"http://x"}`))
	w := httptest.NewRecorder()
	Inference(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200 got %d", w.Code)
	}

	var out map[string]any
	if err := json.Unmarshal(w.Body.Bytes(), &out); err != nil {
		t.Fatalf("invalid response json: %v, body=%s", err, w.Body.String())
	}
	if out["degraded"] != true || out["degraded_reason"] != "timeout" {
		t.Fatalf("expected timeout: %v", out)
	}
	if _, ok := out["inference_latency_ms"]; !ok {
		t.Fatalf("missing inference_latency_ms: %v", out)
	}
}

