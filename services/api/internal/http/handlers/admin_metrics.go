package handlers

import (
	"encoding/json"
	"net/http"
	"strconv"
	"time"

	"github.com/dengxilong2025/miaodong-project/services/api/internal/db"
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

	conn, err := db.Open()
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	defer conn.Close()

	// 1) 总量与UV
	var total int64
	var uv int64
	if err := conn.QueryRow(
		`select count(*)::bigint, count(distinct coalesce(user_id,''))::bigint
		   from analytics_events
		  where ts_ms >= $1 and ts_ms <= $2`,
		from, to,
	).Scan(&total, &uv); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	// 2) 按事件名计数
	type byEventItem struct {
		EventName string `json:"event_name"`
		Count     int64  `json:"count"`
	}
	rows, err := conn.Query(
		`select event_name, count(*)::bigint
		   from analytics_events
		  where ts_ms >= $1 and ts_ms <= $2
		  group by event_name
		  order by count(*) desc`,
		from, to,
	)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	defer rows.Close()
	byEvent := make([]byEventItem, 0, 16)
	for rows.Next() {
		var it byEventItem
		if err := rows.Scan(&it.EventName, &it.Count); err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		byEvent = append(byEvent, it)
	}

	// 3) feedback helpful 统计（约定 event_name=feedback_submitted）
	// payload:
	// - problem_id: string
	// - helpful: boolean
	args := []any{from, to}
	whereProblem := ""
	if problemID != "" {
		whereProblem = " and payload->>'problem_id' = $3 "
		args = append(args, problemID)
	}

	var fbTotal, fbHelpful int64
	err = conn.QueryRow(
		`select
		    count(*)::bigint as total,
		    sum(case when (payload->>'helpful') in ('true','false') and (payload->>'helpful')::boolean = true then 1 else 0 end)::bigint as helpful
		   from analytics_events
		  where event_name='feedback_submitted'
		    and ts_ms >= $1 and ts_ms <= $2`+whereProblem,
		args...,
	).Scan(&fbTotal, &fbHelpful)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	helpfulRate := 0.0
	if fbTotal > 0 {
		helpfulRate = float64(fbHelpful) / float64(fbTotal)
	}

	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	_ = json.NewEncoder(w).Encode(map[string]any{
		"window": map[string]any{
			"from_ts_ms": from,
			"to_ts_ms":   to,
		},
		"filter": map[string]any{
			"problem_id": problemID,
		},
		"events_total": total,
		"distinct_users": uv,
		"by_event_name": byEvent,
		"feedback": map[string]any{
			"total":        fbTotal,
			"helpful":      fbHelpful,
			"helpful_rate": helpfulRate,
		},
	})
}

func parseInt64(s string, def int64) int64 {
	if s == "" {
		return def
	}
	v, err := strconv.ParseInt(s, 10, 64)
	if err != nil {
		return def
	}
	return v
}

