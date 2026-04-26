package handlers

import (
	"encoding/json"
	"net/http"

	"github.com/dengxilong2025/miaodong-project/services/api/internal/db"
	"github.com/dengxilong2025/miaodong-project/services/api/internal/metrics"
)

// AdminMetricsCompare compares two time windows (A vs B) and returns a/b plus delta (b-a).
//
// GET /admin/metrics/compare?from_a=&to_a=&from_b=&to_b=&problem_id=
func AdminMetricsCompare(w http.ResponseWriter, r *http.Request) {
	if !requireAdmin(w, r) {
		return
	}
	if r.Method != http.MethodGet {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	fromA := parseInt64(r.URL.Query().Get("from_a"), 0)
	toA := parseInt64(r.URL.Query().Get("to_a"), 0)
	fromB := parseInt64(r.URL.Query().Get("from_b"), 0)
	toB := parseInt64(r.URL.Query().Get("to_b"), 0)
	problemID := r.URL.Query().Get("problem_id")
	attribution := parseAttribution(r)

	if fromA <= 0 || toA <= 0 || fromB <= 0 || toB <= 0 {
		http.Error(w, "missing or invalid from_a/to_a/from_b/to_b", http.StatusBadRequest)
		return
	}

	conn, err := db.Open()
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	defer conn.Close()

	a, err := metrics.Aggregate(r.Context(), conn, fromA, toA, problemID, attribution)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	b, err := metrics.Aggregate(r.Context(), conn, fromB, toB, problemID, attribution)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	_ = json.NewEncoder(w).Encode(map[string]any{
		"a":     adminMetricsResponse(fromA, toA, problemID, a),
		"b":     adminMetricsResponse(fromB, toB, problemID, b),
		"delta": metrics.Delta(a, b),
	})
}
