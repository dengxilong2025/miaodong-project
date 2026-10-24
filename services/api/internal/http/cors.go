package http

import (
	"net/http"
	"net/url"
	"os"
	"strings"
)

// withCORS 为 H5 提供最小跨域支持。
// 生产环境必须通过 MIAODONG_CORS_ORIGINS 配置允许的源；未配置时只允许本机开发源。
func withCORS(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		origin := r.Header.Get("Origin")
		if origin != "" && corsOriginAllowed(origin) {
			w.Header().Set("Access-Control-Allow-Origin", origin)
			w.Header().Set("Vary", "Origin")
			w.Header().Set("Access-Control-Allow-Methods", "GET,POST,PUT,OPTIONS")
			w.Header().Set("Access-Control-Allow-Headers", "Authorization,Content-Type,X-Admin-Token,X-Client-Channel")
			w.Header().Set("Access-Control-Max-Age", "600")
		}

		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next.ServeHTTP(w, r)
	})
}

func corsOriginAllowed(origin string) bool {
	raw := strings.TrimSpace(os.Getenv("MIAODONG_CORS_ORIGINS"))
	if raw != "" {
		for _, item := range strings.Split(raw, ",") {
			if strings.TrimSpace(item) == origin {
				return true
			}
		}
		return false
	}

	// 未配置时只放行本机开发源，避免公网部署意外开放全部来源。
	u, err := url.Parse(origin)
	if err != nil || (u.Scheme != "http" && u.Scheme != "https") {
		return false
	}
	return u.Hostname() == "localhost" || u.Hostname() == "127.0.0.1"
}
