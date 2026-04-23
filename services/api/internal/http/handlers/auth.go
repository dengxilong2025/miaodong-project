package handlers

import (
	"encoding/json"
	"net/http"
	"time"

	"github.com/google/uuid"
)

// AnonymousAuth 是MVP阶段的游客态入口：
// - 生成 user_id
// - 返回一个临时 token（占位）
//
// 后续会替换为 HMAC/JWT 等更严格方案，并落库用户信息。
func AnonymousAuth(w http.ResponseWriter, _ *http.Request) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")

	userID := "u_" + uuid.NewString()
	expiresIn := int64(30 * 24 * 3600)

	_ = json.NewEncoder(w).Encode(map[string]any{
		"user_id":     userID,
		"token":       "dev-token-" + userID,
		"expires_in":  expiresIn,
		"issued_at_s": time.Now().Unix(),
	})
}

