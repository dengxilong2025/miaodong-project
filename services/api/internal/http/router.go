package http

import (
	"net/http"

	"github.com/dengxilong2025/miaodong-project/miaodong/services/api/internal/http/handlers"
	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
)

func NewRouter() http.Handler {
	r := chi.NewRouter()
	r.Use(middleware.RealIP)
	r.Use(middleware.RequestID)
	r.Use(middleware.Recoverer)

	r.Route("/v1", func(v1 chi.Router) {
		v1.Get("/health", handlers.Health)
		v1.Post("/auth/anonymous", handlers.AnonymousAuth)

		v1.Get("/problems", handlers.ListProblems)
		v1.Get("/problems/{id}", handlers.GetProblem)
	})

	return r
}

