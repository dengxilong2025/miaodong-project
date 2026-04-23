package http

import (
	"net/http"
	"strings"

	"github.com/dengxilong2025/miaodong-project/services/api/internal/http/handlers"
)

func NewRouter() http.Handler {
	mux := http.NewServeMux()

	// 基础健康检查
	mux.HandleFunc("/v1/health", handlers.Health)
	mux.HandleFunc("/v1/auth/anonymous", handlers.AnonymousAuth)

	// problems：同时支持
	// - GET /v1/problems
	// - GET /v1/problems/{id}
	mux.HandleFunc("/v1/problems", func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/v1/problems" {
			http.NotFound(w, r)
			return
		}
		if r.Method != http.MethodGet {
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
			return
		}
		handlers.ListProblems(w, r)
	})
	mux.HandleFunc("/v1/problems/", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet {
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
			return
		}
		// 约定：id 为路径最后一段
		id := strings.TrimPrefix(r.URL.Path, "/v1/problems/")
		if id == "" {
			http.NotFound(w, r)
			return
		}
		handlers.GetProblemByID(w, r, id)
	})

	return mux
}
