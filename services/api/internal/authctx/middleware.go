package authctx

import "net/http"

// Middleware 尝试从 Authorization 解析 user_id 并注入 context。
//
// 解析失败不报错、不拦截请求（即匿名态继续走后续 handler）。
func Middleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		userID := ParseUserID(r.Header.Get("Authorization"))
		r = r.WithContext(WithUserID(r.Context(), userID))
		next.ServeHTTP(w, r)
	})
}

