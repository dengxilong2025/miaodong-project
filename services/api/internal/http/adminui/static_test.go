package adminui

import (
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestAdminUIIndexServed(t *testing.T) {
	// Use a temp dir so the test doesn't depend on apps/admin existing yet.
	adminDir := t.TempDir()
	if err := os.WriteFile(filepath.Join(adminDir, "index.html"), []byte("<!doctype html><title>喵懂 · 运营后台</title>"), 0o644); err != nil {
		t.Fatalf("write index.html: %v", err)
	}
	t.Setenv(envAdminUIDir, adminDir)

	h, err := Handler()
	if err != nil {
		t.Fatalf("Handler err: %v", err)
	}

	mux := http.NewServeMux()
	mux.Handle("/admin/ui/", h)

	req := httptest.NewRequest(http.MethodGet, "/admin/ui/", nil)
	w := httptest.NewRecorder()
	mux.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d (Location=%q)", w.Code, w.Header().Get("Location"))
	}
	if !strings.Contains(w.Body.String(), "喵懂") {
		t.Fatalf("expected html to contain title")
	}
}
