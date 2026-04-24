package http

import (
	"net/http"
	"strings"

	"github.com/dengxilong2025/miaodong-project/services/api/internal/http/adminui"
	"github.com/dengxilong2025/miaodong-project/services/api/internal/http/handlers"
)

func NewRouter() http.Handler {
	mux := http.NewServeMux()

	// 基础健康检查
	mux.HandleFunc("/v1/health", handlers.Health)
	mux.HandleFunc("/v1/auth/anonymous", handlers.AnonymousAuth)
	mux.HandleFunc("/v1/audio/upload-url", handlers.AudioUploadURL)
	mux.HandleFunc("/v1/audio/upload/", handlers.AudioUploadByID) // PUT
	mux.HandleFunc("/v1/audio/", handlers.AudioGetByID)           // GET
	mux.HandleFunc("/v1/inference", handlers.Inference)           // POST

	// Admin API（MVP：Header token 鉴权）
	mux.HandleFunc("/admin/problems", handlers.AdminProblems)
	mux.HandleFunc("/admin/problems/", handlers.AdminProblemByID)
	mux.HandleFunc("/admin/releases", handlers.AdminReleases) // GET+POST(/admin/release简化为此)
	mux.HandleFunc("/admin/release", handlers.AdminReleases)  // 兼容：POST
	mux.HandleFunc("/admin/rollback", handlers.AdminRollback)
	mux.HandleFunc("/admin/metrics", handlers.AdminMetrics)
	mux.HandleFunc("/admin/audit", handlers.AdminAudit)

	// Admin UI（静态单页），避免与 /admin/* API 冲突：使用 /admin/ui/
	if h, err := adminui.Handler(); err != nil {
		mux.Handle("/admin/ui/", http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			http.Error(w, "admin ui not available", http.StatusInternalServerError)
		}))
	} else {
		mux.Handle("/admin/ui/", h)
	}

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

	// 埋点（App侧）
	mux.HandleFunc("/v1/analytics/event", handlers.AnalyticsEvent)

	return mux
}
