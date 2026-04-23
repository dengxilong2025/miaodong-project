package handlers

import (
	"encoding/json"
	"net/http"

	"github.com/dengxilong2025/miaodong-project/miaodong/services/api/internal/content"
	"github.com/go-chi/chi/v5"
)

func ListProblems(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")

	seedPath, err := content.DefaultSeedPath()
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	seed, err := content.LoadSeed(seedPath)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	_ = json.NewEncoder(w).Encode(map[string]any{"items": seed.Problems})
}

func GetProblem(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")

	id := chi.URLParam(r, "id")
	seedPath, err := content.DefaultSeedPath()
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	seed, err := content.LoadSeed(seedPath)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	for _, p := range seed.Problems {
		if p.ID == id {
			_ = json.NewEncoder(w).Encode(p)
			return
		}
	}
	http.Error(w, "not found", http.StatusNotFound)
}

