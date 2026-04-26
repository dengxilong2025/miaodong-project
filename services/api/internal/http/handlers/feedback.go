package handlers

import (
	"encoding/json"
	"net/http"

	"github.com/dengxilong2025/miaodong-project/services/api/internal/db"
	"github.com/dengxilong2025/miaodong-project/services/api/internal/engagement"
)

// Feedback 接收用户反馈并写入 analytics_events（feedback_submitted）。
//
// POST /v1/feedback
// body:
// {
//   "request_id": "r_001",
//   "helpful": true,
//   "intent_match": "match|partial|mismatch",  // 可选
//   "notes": "…",                              // 可选
//   "problem_id": "night_meow",                // 可选（建议传，便于按 problem 聚合）
//   "content_version": 1                       // 可选
// }
func Feedback(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var in engagement.FeedbackReq
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
		http.Error(w, "invalid json", http.StatusBadRequest)
		return
	}

	// ---- 校验（在打开 DB 之前完成，便于 unit test 不依赖 DB） ----
	if in.RequestID == "" {
		http.Error(w, "request_id required", http.StatusBadRequest)
		return
	}
	if in.Helpful == nil {
		http.Error(w, "helpful required", http.StatusBadRequest)
		return
	}
	if in.IntentMatch != "" {
		switch in.IntentMatch {
		case "match", "partial", "mismatch":
			// ok
		default:
			http.Error(w, "intent_match invalid", http.StatusBadRequest)
			return
		}
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

	if err := engagement.WriteFeedbackEvent(r.Context(), conn, in); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	_ = json.NewEncoder(w).Encode(map[string]any{"ok": true})
}

