package handlers

import (
	"encoding/json"
	"net/http"
	"os"
)

func adminTokenOK(r *http.Request) bool {
	want := os.Getenv("MIAODONG_ADMIN_TOKEN")
	if want == "" {
		want = "dev-admin"
	}
	got := r.Header.Get("X-Admin-Token")
	return got != "" && got == want
}

func requireAdmin(w http.ResponseWriter, r *http.Request) bool {
	if adminTokenOK(r) {
		return true
	}
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(http.StatusUnauthorized)
	_ = json.NewEncoder(w).Encode(map[string]any{
		"error":   "unauthorized",
		"message": "missing or invalid X-Admin-Token",
	})
	return false
}

