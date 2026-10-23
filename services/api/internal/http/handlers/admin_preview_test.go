package handlers

import (
	"context"
	"database/sql"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/dengxilong2025/miaodong-project/services/api/internal/content"
)

func stubAdminPreview(t *testing.T, b content.Bundle, err error) {
	t.Helper()
	oldOpen := openAdminPreviewDB
	oldLoad := loadAdminPreviewBundle

	openAdminPreviewDB = func() (*sql.DB, error) { return nil, nil }
	loadAdminPreviewBundle = func(context.Context, *sql.DB, string) (content.Bundle, error) {
		return b, err
	}

	t.Cleanup(func() {
		openAdminPreviewDB = oldOpen
		loadAdminPreviewBundle = oldLoad
	})
}

func previewBundle() content.Bundle {
	return content.Bundle{
		Problem: map[string]any{
			"id":              "night_meow",
			"title":           "半夜叫",
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

func TestAdminPreviewResult_Composes(t *testing.T) {
	t.Setenv("MIAODONG_ADMIN_TOKEN", "dev-admin")
	stubAdminPreview(t, previewBundle(), nil)

	req := httptest.NewRequest(http.MethodGet, "/admin/preview/result?problem_id=night_meow", nil)
	req.Header.Set("X-Admin-Token", "dev-admin")
	w := httptest.NewRecorder()

	AdminPreviewResult(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d body=%s", w.Code, w.Body.String())
	}
	var out map[string]any
	if err := json.Unmarshal(w.Body.Bytes(), &out); err != nil {
		t.Fatalf("invalid json: %v", err)
	}
	if out["preview"] != true || out["degraded"] != false {
		t.Fatalf("unexpected preview flags: %v", out)
	}
	if out["content_version"] != float64(1) {
		t.Fatalf("expected content_version=1, got %v", out["content_version"])
	}
	intent, _ := out["primary_intent"].(map[string]any)
	if intent["code"] != "PREVIEW" {
		t.Fatalf("unexpected intent: %v", intent)
	}
	if _, ok := out["followup_question"].(map[string]any); !ok {
		t.Fatalf("missing followup_question: %v", out["followup_question"])
	}
	if ss, ok := out["suggestions"].([]any); !ok || len(ss) == 0 {
		t.Fatalf("missing suggestions: %v", out["suggestions"])
	}
	if risk, ok := out["risk_level"].(map[string]any); !ok || risk["level"] != "green" {
		t.Fatalf("missing risk_level: %v", out["risk_level"])
	}
	if _, ok := out["optional_tools_section"].(map[string]any); !ok {
		t.Fatalf("missing optional_tools_section")
	}
	if _, ok := out["share_asset"].(map[string]any); !ok {
		t.Fatalf("missing share_asset")
	}
}

func TestAdminPreviewResult_MissingProblemID(t *testing.T) {
	t.Setenv("MIAODONG_ADMIN_TOKEN", "dev-admin")
	req := httptest.NewRequest(http.MethodGet, "/admin/preview/result", nil)
	req.Header.Set("X-Admin-Token", "dev-admin")
	w := httptest.NewRecorder()
	AdminPreviewResult(w, req)
	if w.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d", w.Code)
	}
}

func TestAdminPreviewResult_Unauthorized(t *testing.T) {
	t.Setenv("MIAODONG_ADMIN_TOKEN", "dev-admin")
	req := httptest.NewRequest(http.MethodGet, "/admin/preview/result?problem_id=night_meow", nil)
	w := httptest.NewRecorder()
	AdminPreviewResult(w, req)
	if w.Code != http.StatusUnauthorized {
		t.Fatalf("expected 401, got %d", w.Code)
	}
}

func TestAdminPreviewResult_NotFound(t *testing.T) {
	t.Setenv("MIAODONG_ADMIN_TOKEN", "dev-admin")
	stubAdminPreview(t, content.Bundle{}, sql.ErrNoRows)

	req := httptest.NewRequest(http.MethodGet, "/admin/preview/result?problem_id=missing", nil)
	req.Header.Set("X-Admin-Token", "dev-admin")
	w := httptest.NewRecorder()
	AdminPreviewResult(w, req)
	if w.Code != http.StatusNotFound {
		t.Fatalf("expected 404, got %d", w.Code)
	}
}
