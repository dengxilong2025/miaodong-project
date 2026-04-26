package handlers

import (
	"database/sql"
	"encoding/json"
	"errors"
	"net/http"
	"strconv"
	"strings"

	"github.com/dengxilong2025/miaodong-project/services/api/internal/authctx"
	"github.com/dengxilong2025/miaodong-project/services/api/internal/content"
	"github.com/dengxilong2025/miaodong-project/services/api/internal/db"
)

type listProblemsResp struct {
	ContentVersion int                      `json:"content_version"`
	Items          []content.ProblemSummary `json:"items"`
}

type bundleResp struct {
	ContentVersion int `json:"content_version"`
	content.Bundle
}

func parseLimit(s string) (int, error) {
	if s == "" {
		return 3, nil
	}
	n, err := strconv.Atoi(s)
	if err != nil || n <= 0 {
		return 0, errors.New("invalid limit")
	}
	if n > 50 {
		n = 50
	}
	return n, nil
}

// ListProblems handles GET /v1/problems.
func ListProblems(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	explicitCV, err := content.ParseContentVersion(r.URL.Query().Get("content_version"))
	if err != nil {
		http.Error(w, "invalid content_version", http.StatusBadRequest)
		return
	}

	limit, err := parseLimit(r.URL.Query().Get("limit"))
	if err != nil {
		http.Error(w, "invalid limit", http.StatusBadRequest)
		return
	}

	conn, err := db.Open()
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	defer conn.Close()

	userID := authctx.UserID(r.Context())
	cv, err := content.ResolveContentVersionDB(r.Context(), conn, userID, explicitCV)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	items, err := content.ListProblems(r.Context(), conn, limit)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	_ = json.NewEncoder(w).Encode(listProblemsResp{ContentVersion: cv, Items: items})
}

// GetProblem handles GET /v1/problems/{id}.
func GetProblem(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	// ServeMux routes /v1/problems/ here; ensure id is present and doesn't include extra segments.
	id := strings.TrimPrefix(r.URL.Path, "/v1/problems/")
	if id == "" || strings.Contains(id, "/") {
		http.NotFound(w, r)
		return
	}

	explicitCV, err := content.ParseContentVersion(r.URL.Query().Get("content_version"))
	if err != nil {
		http.Error(w, "invalid content_version", http.StatusBadRequest)
		return
	}

	conn, err := db.Open()
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	defer conn.Close()

	userID := authctx.UserID(r.Context())
	cv, err := content.ResolveContentVersionDB(r.Context(), conn, userID, explicitCV)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	b, err := content.GetProblemBundle(r.Context(), conn, id)
	if err == sql.ErrNoRows {
		http.NotFound(w, r)
		return
	}
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	_ = json.NewEncoder(w).Encode(bundleResp{ContentVersion: cv, Bundle: b})
}

// GetResultTemplate handles GET /v1/templates/result.
func GetResultTemplate(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	problemID := r.URL.Query().Get("problem_id")
	if problemID == "" {
		http.Error(w, "missing problem_id", http.StatusBadRequest)
		return
	}

	explicitCV, err := content.ParseContentVersion(r.URL.Query().Get("content_version"))
	if err != nil {
		http.Error(w, "invalid content_version", http.StatusBadRequest)
		return
	}

	// v0.1: limit is reserved for future use; still parse/validate to keep contract stable.
	if _, err := parseLimit(r.URL.Query().Get("limit")); err != nil {
		http.Error(w, "invalid limit", http.StatusBadRequest)
		return
	}

	conn, err := db.Open()
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	defer conn.Close()

	userID := authctx.UserID(r.Context())
	cv, err := content.ResolveContentVersionDB(r.Context(), conn, userID, explicitCV)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	b, err := content.GetResultTemplate(r.Context(), conn, problemID)
	if err == sql.ErrNoRows {
		http.NotFound(w, r)
		return
	}
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	_ = json.NewEncoder(w).Encode(bundleResp{ContentVersion: cv, Bundle: b})
}
