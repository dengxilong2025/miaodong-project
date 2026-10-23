package handlers

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"net/http"
	"time"

	"github.com/dengxilong2025/miaodong-project/services/api/internal/content"
	"github.com/dengxilong2025/miaodong-project/services/api/internal/db"
	"github.com/dengxilong2025/miaodong-project/services/api/internal/result"
)

// 测试可替换的依赖点。
var (
	openAdminPreviewDB     = db.Open
	loadAdminPreviewBundle = content.GetProblemBundle
)

// AdminPreviewResult 返回“结果页预览”：用示例意图 + 当前问题内容组装，不写库。
//
// GET /admin/preview/result?problem_id=...
func AdminPreviewResult(w http.ResponseWriter, r *http.Request) {
	if !requireAdmin(w, r) {
		return
	}
	if r.Method != http.MethodGet {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	problemID := r.URL.Query().Get("problem_id")
	if problemID == "" {
		http.Error(w, "missing fields: problem_id", http.StatusBadRequest)
		return
	}

	conn, err := openAdminPreviewDB()
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	if conn != nil {
		defer conn.Close()
	}

	contentVersion := 1
	if conn != nil {
		ctx, cancel := context.WithTimeout(r.Context(), 300*time.Millisecond)
		cv, err := content.ResolveContentVersionDB(ctx, conn, "", nil)
		cancel()
		if err == nil && cv > 0 {
			contentVersion = cv
		}
	}

	ctx, cancel := context.WithTimeout(r.Context(), 500*time.Millisecond)
	defer cancel()

	bundle, err := loadAdminPreviewBundle(ctx, conn, problemID)
	if errors.Is(err, sql.ErrNoRows) {
		http.NotFound(w, r)
		return
	}
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	out := map[string]any{
		"request_id":      "preview_" + randHex(8),
		"schema_version":  "1.0",
		"model_version":   "preview",
		"content_version": contentVersion,
		"degraded":        false,
		"preview":         true,
		"primary_intent": map[string]any{
			"code":       "PREVIEW",
			"label":      "示例意图（预览）",
			"confidence": 0.72,
		},
		"explanations": []any{
			map[string]any{
				"factor": "PREVIEW",
				"text":   "这是内容预览，不代表真实推理结果。",
			},
		},
	}

	result.ApplyContent(out, bundle)

	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	_ = json.NewEncoder(w).Encode(out)
}
