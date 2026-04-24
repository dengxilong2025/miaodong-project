package handlers

import (
	"encoding/json"
	"net/http"
	"strconv"

	"github.com/dengxilong2025/miaodong-project/services/api/internal/audit"
	"github.com/dengxilong2025/miaodong-project/services/api/internal/db"
)

func parseAuditQuery(r *http.Request) audit.ListParams {
	q := r.URL.Query()

	var p audit.ListParams
	p.Actor = q.Get("actor")
	p.Action = q.Get("action")
	p.EntityType = q.Get("entity_type")
	p.EntityID = q.Get("entity_id")

	// 数字字段：非法数字则忽略
	if s := q.Get("limit"); s != "" {
		if v, err := strconv.Atoi(s); err == nil {
			p.Limit = v
		}
	}
	if s := q.Get("cursor"); s != "" {
		if v, err := strconv.ParseInt(s, 10, 64); err == nil {
			p.Cursor = &v
		}
	}
	if s := q.Get("from"); s != "" {
		if v, err := strconv.ParseInt(s, 10, 64); err == nil {
			p.FromMs = &v
		}
	}
	if s := q.Get("to"); s != "" {
		if v, err := strconv.ParseInt(s, 10, 64); err == nil {
			p.ToMs = &v
		}
	}

	return p
}

func AdminAudit(w http.ResponseWriter, r *http.Request) {
	if !requireAdmin(w, r) {
		return
	}
	if r.Method != http.MethodGet {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	params := parseAuditQuery(r)

	conn, err := db.Open()
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	defer conn.Close()

	items, next, err := audit.ListPage(r.Context(), conn, params)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	_ = json.NewEncoder(w).Encode(map[string]any{"items": items, "next_cursor": next})
}
