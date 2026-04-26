package handlers

import (
	"encoding/json"
	"net/http"

	"github.com/dengxilong2025/miaodong-project/services/api/internal/db"
	"github.com/dengxilong2025/miaodong-project/services/api/internal/engagement"
)

// Retest 接收复测关联并写入 analytics_events（retest_submitted）。
//
// POST /v1/retest
// body:
// {
//   "problem_id": "night_meow",
//   "baseline_request_id": "r_old",
//   "current_request_id": "r_new",
//   "content_version": 1,     // 可选
//   "notes": "…"              // 可选
// }
func Retest(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var in engagement.RetestReq
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
		http.Error(w, "invalid json", http.StatusBadRequest)
		return
	}

	// ---- 校验（在打开 DB 之前完成，便于 unit test 不依赖 DB） ----
	if in.ProblemID == "" {
		http.Error(w, "problem_id required", http.StatusBadRequest)
		return
	}
	if in.BaselineRequestID == "" {
		http.Error(w, "baseline_request_id required", http.StatusBadRequest)
		return
	}
	if in.CurrentRequestID == "" {
		http.Error(w, "current_request_id required", http.StatusBadRequest)
		return
	}
	if in.ContentVersion != nil && *in.ContentVersion <= 0 {
		http.Error(w, "content_version invalid", http.StatusBadRequest)
		return
	}

	conn, err := db.Open()
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	defer conn.Close()

	if err := engagement.WriteRetestEvent(r.Context(), conn, in); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	_ = json.NewEncoder(w).Encode(map[string]any{"ok": true})
}

