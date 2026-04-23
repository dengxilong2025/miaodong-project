package handlers

import (
	"net/http"
	"net/http/httptest"
	"os"
	"testing"
)

func TestRequireAdminUnauthorized(t *testing.T) {
	os.Setenv("MIAODONG_ADMIN_TOKEN", "x")
	defer os.Unsetenv("MIAODONG_ADMIN_TOKEN")

	req := httptest.NewRequest(http.MethodGet, "/admin/problems", nil)
	w := httptest.NewRecorder()

	ok := requireAdmin(w, req)
	if ok {
		t.Fatalf("expected unauthorized")
	}
	if w.Code != http.StatusUnauthorized {
		t.Fatalf("expected 401, got %d", w.Code)
	}
}

