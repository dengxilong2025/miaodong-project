package handlers

import (
	"net/http"
	"net/http/httptest"
	"os"
	"testing"
)

func TestAdminAudit_Unauthorized(t *testing.T) {
	os.Setenv("MIAODONG_ADMIN_TOKEN", "dev-admin")
	defer os.Unsetenv("MIAODONG_ADMIN_TOKEN")

	req := httptest.NewRequest(http.MethodGet, "/admin/audit", nil)
	w := httptest.NewRecorder()

	AdminAudit(w, req)
	if w.Code != http.StatusUnauthorized {
		t.Fatalf("expected 401, got %d", w.Code)
	}
}

func TestAdminAudit_MethodNotAllowed(t *testing.T) {
	os.Setenv("MIAODONG_ADMIN_TOKEN", "dev-admin")
	defer os.Unsetenv("MIAODONG_ADMIN_TOKEN")

	req := httptest.NewRequest(http.MethodPost, "/admin/audit", nil)
	req.Header.Set("X-Admin-Token", "dev-admin")
	w := httptest.NewRecorder()

	AdminAudit(w, req)
	if w.Code != http.StatusMethodNotAllowed {
		t.Fatalf("expected 405, got %d", w.Code)
	}
}

