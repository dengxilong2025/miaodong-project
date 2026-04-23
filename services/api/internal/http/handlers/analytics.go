package handlers

import (
	"encoding/json"
	"net/http"
	"time"

	"github.com/dengxilong2025/miaodong-project/services/api/internal/db"
)

// AnalyticsEvent 接收客户端埋点并落库（最小实现）。
//
// POST /v1/analytics/event
// body:
// {
//   "event_name": "result_view",
//   "ts_ms": 1710000000000,        // 可选，不传则取 now
//   "user_id": "u_xxx",            // 可选（游客态也可以传）
//   "session_id": "s_xxx",         // 可选
//   "platform": "ios|android",
//   "app_version": "0.1.0",
//   "content_version": 1,
//   "request_id": "req_xxx",
//   "payload": { ... }             // 任意 JSON
// }
func AnalyticsEvent(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var in struct {
		EventName      string         `json:"event_name"`
		TsMs           int64          `json:"ts_ms"`
		UserID         string         `json:"user_id"`
		SessionID      string         `json:"session_id"`
		Platform       string         `json:"platform"`
		AppVersion     string         `json:"app_version"`
		ContentVersion *int           `json:"content_version"`
		RequestID      string         `json:"request_id"`
		Payload        map[string]any `json:"payload"`
	}
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
		http.Error(w, "invalid json", http.StatusBadRequest)
		return
	}
	if in.EventName == "" {
		http.Error(w, "event_name required", http.StatusBadRequest)
		return
	}
	if in.TsMs == 0 {
		in.TsMs = time.Now().UnixMilli()
	}
	if in.Payload == nil {
		in.Payload = map[string]any{}
	}
	payloadB, _ := json.Marshal(in.Payload)

	conn, err := db.Open()
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	defer conn.Close()

	var cv any = nil
	if in.ContentVersion != nil {
		cv = *in.ContentVersion
	}

	_, err = conn.Exec(
		`insert into analytics_events (event_name, ts_ms, user_id, session_id, platform, app_version, content_version, request_id, payload)
		 values ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb)`,
		in.EventName,
		in.TsMs,
		nullIfEmpty(in.UserID),
		nullIfEmpty(in.SessionID),
		nullIfEmpty(in.Platform),
		nullIfEmpty(in.AppVersion),
		cv,
		nullIfEmpty(in.RequestID),
		string(payloadB),
	)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	_ = json.NewEncoder(w).Encode(map[string]any{"ok": true})
}
