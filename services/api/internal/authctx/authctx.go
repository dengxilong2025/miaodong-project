package authctx

import (
	"context"
	"strings"
)

type ctxKey string

const userIDKey ctxKey = "user_id"

// ParseUserID 从 Authorization header 解析出 user_id。
//
// 当前 dev token 格式：
//   Authorization: Bearer dev-token-<user_id>
//
// 解析失败返回空串。
func ParseUserID(authHeader string) string {
	authHeader = strings.TrimSpace(authHeader)
	if authHeader == "" {
		return ""
	}

	const bearer = "Bearer "
	if !strings.HasPrefix(authHeader, bearer) {
		return ""
	}

	token := strings.TrimSpace(strings.TrimPrefix(authHeader, bearer))
	const prefix = "dev-token-"
	if !strings.HasPrefix(token, prefix) {
		return ""
	}

	userID := strings.TrimPrefix(token, prefix)
	return strings.TrimSpace(userID)
}

func WithUserID(ctx context.Context, userID string) context.Context {
	if userID == "" {
		return ctx
	}
	return context.WithValue(ctx, userIDKey, userID)
}

func UserID(ctx context.Context) string {
	v := ctx.Value(userIDKey)
	if s, ok := v.(string); ok {
		return s
	}
	return ""
}

