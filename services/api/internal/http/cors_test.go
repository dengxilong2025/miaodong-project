package http

import (
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestCORS_AllowsConfiguredOriginAndPreflight(t *testing.T) {
	t.Setenv("MIAODONG_CORS_ORIGINS", "http://127.0.0.1:5174")
	h := NewRouter()

	req := httptest.NewRequest(http.MethodOptions, "/v1/audio/upload/a_1", nil)
	req.Header.Set("Origin", "http://127.0.0.1:5174")
	req.Header.Set("Access-Control-Request-Method", "PUT")
	w := httptest.NewRecorder()
	h.ServeHTTP(w, req)

	if w.Code != http.StatusNoContent {
		t.Fatalf("expected 204, got %d", w.Code)
	}
	if got := w.Header().Get("Access-Control-Allow-Origin"); got != "http://127.0.0.1:5174" {
		t.Fatalf("unexpected allow-origin: %q", got)
	}
	if got := w.Header().Get("Access-Control-Allow-Methods"); got == "" {
		t.Fatal("missing allow-methods")
	}

	req = httptest.NewRequest(http.MethodGet, "/v1/health", nil)
	req.Header.Set("Origin", "http://127.0.0.1:5174")
	w = httptest.NewRecorder()
	h.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", w.Code)
	}
	if got := w.Header().Get("Access-Control-Allow-Origin"); got != "http://127.0.0.1:5174" {
		t.Fatalf("unexpected allow-origin: %q", got)
	}
}

func TestCORS_RejectsUnconfiguredOrigin(t *testing.T) {
	t.Setenv("MIAODONG_CORS_ORIGINS", "https://app.example.com")
	h := NewRouter()

	req := httptest.NewRequest(http.MethodGet, "/v1/health", nil)
	req.Header.Set("Origin", "https://evil.example.com")
	w := httptest.NewRecorder()
	h.ServeHTTP(w, req)

	if got := w.Header().Get("Access-Control-Allow-Origin"); got != "" {
		t.Fatalf("unexpected allow-origin: %q", got)
	}
}
