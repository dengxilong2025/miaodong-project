package handlers

import (
	"bytes"
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/dengxilong2025/miaodong-project/services/api/internal/content"
)

func stubInferenceContent(t *testing.T, b content.Bundle, bundleErr error) {
	t.Helper()
	oldOpen := openInferenceDB
	oldLoad := loadProblemBundleForInference

	openInferenceDB = func() (*sql.DB, error) { return nil, nil }
	loadProblemBundleForInference = func(context.Context, *sql.DB, string) (content.Bundle, error) {
		return b, bundleErr
	}

	t.Cleanup(func() {
		openInferenceDB = oldOpen
		loadProblemBundleForInference = oldLoad
	})
}

func composeBundle() content.Bundle {
	return content.Bundle{
		Problem: map[string]any{
			"id":              "night_meow",
			"risk_level_copy": map[string]any{"green": "精神食欲正常，先调整作息看看。"},
		},
		Questions: []map[string]any{
			{"id": "q_night_01", "priority": float64(100), "text": "通常发生在关灯后吗？", "type": "single_choice", "options": []any{}},
		},
		Suggestions: []map[string]any{
			{"id": "s_night_01", "priority": float64(100), "title": "睡前小仪式", "steps": []any{"互动 10 分钟"}, "expected_window_hours": float64(24), "retest_tip": "明晚再测"},
		},
		ToolsGuides: map[string]any{
			"collapsed_by_default": true,
			"guide_bullets":        []any{"选可控玩具"},
			"efficiency_items":     []any{map[string]any{"name": "逗猫棒"}},
		},
	}
}

func newInferenceServer(t *testing.T, status int, body string) *httptest.Server {
	t.Helper()
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(status)
		_, _ = w.Write([]byte(body))
	}))
	t.Cleanup(srv.Close)
	t.Setenv("MIAODONG_INFERENCE_URL", srv.URL)
	t.Setenv("MIAODONG_INFERENCE_TIMEOUT_MS", "1000")
	return srv
}

func TestInference_ComposesProblemContent(t *testing.T) {
	newInferenceServer(t, http.StatusOK, `{"schema_version":"1.0","model_version":"stub","primary_intent":{"code":"PLAY","label":"想玩","confidence":0.72},"explanations":[]}`)
	stubInferenceContent(t, composeBundle(), nil)

	req := httptest.NewRequest(http.MethodPost, "/v1/inference", strings.NewReader(
		`{"audio_url":"http://x/a.m4a","problem_id":"night_meow","context":{"time_of_day":"night"}}`,
	))
	w := httptest.NewRecorder()
	Inference(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", w.Code)
	}
	var out map[string]any
	if err := json.Unmarshal(w.Body.Bytes(), &out); err != nil {
		t.Fatalf("invalid json: %v", err)
	}
	if out["degraded"] != false {
		t.Fatalf("expected success, got %v", out)
	}
	if out["content_version"] != float64(1) {
		t.Fatalf("expected fallback content_version=1, got %v", out["content_version"])
	}

	q, ok := out["followup_question"].(map[string]any)
	if !ok || q["id"] != "q_night_01" {
		t.Fatalf("missing followup_question: %v", out["followup_question"])
	}
	sugs, ok := out["suggestions"].([]any)
	if !ok || len(sugs) != 1 {
		t.Fatalf("missing suggestions: %v", out["suggestions"])
	}
	risk, ok := out["risk_level"].(map[string]any)
	if !ok || risk["level"] != "green" {
		t.Fatalf("missing risk_level: %v", out["risk_level"])
	}
	if _, ok := out["optional_tools_section"].(map[string]any); !ok {
		t.Fatalf("missing optional_tools_section: %v", out["optional_tools_section"])
	}
	if _, ok := out["share_asset"].(map[string]any); !ok {
		t.Fatalf("missing share_asset: %v", out["share_asset"])
	}
}

func TestInference_NoProblemIDSkipsComposition(t *testing.T) {
	newInferenceServer(t, http.StatusOK, `{"schema_version":"1.0","primary_intent":{"code":"PLAY"},"explanations":[]}`)
	called := false
	oldLoad := loadProblemBundleForInference
	oldOpen := openInferenceDB
	openInferenceDB = func() (*sql.DB, error) { return nil, nil }
	loadProblemBundleForInference = func(context.Context, *sql.DB, string) (content.Bundle, error) {
		called = true
		return content.Bundle{}, nil
	}
	t.Cleanup(func() {
		openInferenceDB = oldOpen
		loadProblemBundleForInference = oldLoad
	})

	req := httptest.NewRequest(http.MethodPost, "/v1/inference", strings.NewReader(`{"audio_url":"http://x"}`))
	w := httptest.NewRecorder()
	Inference(w, req)

	if called {
		t.Fatalf("bundle loader should not be called without problem_id")
	}
	var out map[string]any
	_ = json.Unmarshal(w.Body.Bytes(), &out)
	if _, ok := out["suggestions"]; ok {
		t.Fatalf("unexpected suggestions: %v", out)
	}
}

func TestInference_DegradedAddsProblemSuggestions(t *testing.T) {
	newInferenceServer(t, http.StatusInternalServerError, "")
	stubInferenceContent(t, composeBundle(), nil)

	req := httptest.NewRequest(http.MethodPost, "/v1/inference", strings.NewReader(
		`{"audio_url":"http://x","problem_id":"night_meow"}`,
	))
	w := httptest.NewRecorder()
	Inference(w, req)

	var out map[string]any
	if err := json.Unmarshal(w.Body.Bytes(), &out); err != nil {
		t.Fatalf("invalid json: %v", err)
	}
	if out["degraded"] != true {
		t.Fatalf("expected degraded=true, got %v", out)
	}
	sugs, ok := out["suggestions"].([]any)
	if !ok || len(sugs) != 1 {
		t.Fatalf("expected degraded suggestions, got %v", out["suggestions"])
	}
	for _, k := range []string{"followup_question", "risk_level", "optional_tools_section", "share_asset"} {
		if _, ok := out[k]; ok {
			t.Fatalf("degraded response should not contain %s", k)
		}
	}
}

func TestInference_BundleErrorKeepsInferenceResult(t *testing.T) {
	newInferenceServer(t, http.StatusOK, `{"schema_version":"1.0","primary_intent":{"code":"PLAY"}}`)
	stubInferenceContent(t, content.Bundle{}, errors.New("not found"))

	req := httptest.NewRequest(http.MethodPost, "/v1/inference", strings.NewReader(
		`{"audio_url":"http://x","problem_id":"missing"}`,
	))
	w := httptest.NewRecorder()
	Inference(w, req)

	var out map[string]any
	if err := json.Unmarshal(w.Body.Bytes(), &out); err != nil {
		t.Fatalf("invalid json: %v", err)
	}
	if out["degraded"] != false {
		t.Fatalf("bundle error should not degrade inference: %v", out)
	}
	if _, ok := out["primary_intent"]; !ok {
		t.Fatalf("primary_intent missing: %v", out)
	}
	if _, ok := out["suggestions"]; ok {
		t.Fatalf("unexpected suggestions on bundle error: %v", out)
	}
}

func TestInference_ContextAnswersFallback(t *testing.T) {
	var gotContext map[string]any
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		b, _ := io.ReadAll(r.Body)
		var body map[string]any
		_ = json.Unmarshal(b, &body)
		if m, ok := body["context"].(map[string]any); ok {
			gotContext = m
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"schema_version":"1.0","primary_intent":{"code":"PLAY"}}`))
	}))
	t.Cleanup(srv.Close)
	t.Setenv("MIAODONG_INFERENCE_URL", srv.URL)
	t.Setenv("MIAODONG_INFERENCE_TIMEOUT_MS", "1000")
	stubInferenceContent(t, content.Bundle{}, nil)

	req := httptest.NewRequest(http.MethodPost, "/v1/inference", bytes.NewReader([]byte(
		`{"audio_url":"http://x","context_answers":{"time_of_day":"night"}}`,
	)))
	w := httptest.NewRecorder()
	Inference(w, req)

	if gotContext["time_of_day"] != "night" {
		t.Fatalf("expected context_answers to be forwarded as context, got %v", gotContext)
	}
}
