package handlers

import (
	"encoding/json"
	"net/http"
	"time"

	"github.com/dengxilong2025/miaodong-project/services/api/internal/db"
	"github.com/dengxilong2025/miaodong-project/services/api/internal/metrics"
)

// AdminMetrics 最小指标聚合（MVP），用于发布后观察：
// GET /admin/metrics?from_ts_ms=&to_ts_ms=&problem_id=
//
// 说明：
// - 目前聚合基于 analytics_events 表
// - 对 payload 的解析使用 jsonb 提取（例如 payload->>'problem_id'）
func AdminMetrics(w http.ResponseWriter, r *http.Request) {
	if !requireAdmin(w, r) {
		return
	}
	if r.Method != http.MethodGet {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	now := time.Now().UnixMilli()
	from := parseInt64(r.URL.Query().Get("from_ts_ms"), now-7*24*3600*1000)
	to := parseInt64(r.URL.Query().Get("to_ts_ms"), now)
	problemID := r.URL.Query().Get("problem_id")
	attribution := parseAttribution(r)

	conn, err := db.Open()
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	defer conn.Close()

	res, err := metrics.Aggregate(r.Context(), conn, from, to, problemID, attribution)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	_ = json.NewEncoder(w).Encode(adminMetricsResponse(from, to, problemID, res))
}
