package handlers

import (
	"database/sql"
	"encoding/json"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/dengxilong2025/miaodong-project/services/api/internal/db"
)

// AdminReleases handles:
// - GET  /admin/releases
// - POST /admin/release
func AdminReleases(w http.ResponseWriter, r *http.Request) {
	if !requireAdmin(w, r) {
		return
	}
	switch r.Method {
	case http.MethodGet:
		adminListReleases(w)
	case http.MethodPost:
		adminPublishRelease(w, r)
	default:
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
	}
}

// AdminRollback handles:
// - POST /admin/rollback
func AdminRollback(w http.ResponseWriter, r *http.Request) {
	if !requireAdmin(w, r) {
		return
	}
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var in struct {
		Actor  string `json:"actor"`
		Target int    `json:"target_content_version"`
		Notes  string `json:"notes"`
	}
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
		http.Error(w, "invalid json", http.StatusBadRequest)
		return
	}
	if in.Actor == "" {
		in.Actor = "admin"
	}
	if in.Target <= 0 {
		http.Error(w, "target_content_version required", http.StatusBadRequest)
		return
	}

	conn, err := db.Open()
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	defer conn.Close()

	tx, err := conn.Begin()
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	defer func() { _ = tx.Rollback() }()

	// 确认目标版本存在
	var exists bool
	if err := tx.QueryRow(`select exists(select 1 from releases where content_version=$1)`, in.Target).Scan(&exists); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	if !exists {
		http.Error(w, "target version not found", http.StatusBadRequest)
		return
	}

	// 将所有已发布版本标记为 rolled_back
	_, _ = tx.Exec(`update releases set status='rolled_back' where status='published'`)
	// 将目标版本重新发布
	_, err = tx.Exec(`update releases set status='published', rollout_percent=100, notes=$2 where content_version=$1`, in.Target, in.Notes)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	_ = insertAudit(tx, in.Actor, "rollback", "release", strconv.Itoa(in.Target), map[string]any{
		"target_content_version": in.Target,
		"notes":                 in.Notes,
	})

	if err := tx.Commit(); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	_ = json.NewEncoder(w).Encode(map[string]any{
		"ok":             true,
		"content_version": in.Target,
	})
}

type releaseItem struct {
	ContentVersion int    `json:"content_version"`
	Status         string `json:"status"`
	RolloutPercent int    `json:"rollout_percent"`
	CreatedBy      string `json:"created_by"`
	CreatedAt      string `json:"created_at"`
	Notes          string `json:"notes"`
}

func adminListReleases(w http.ResponseWriter) {
	conn, err := db.Open()
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	defer conn.Close()

	rows, err := conn.Query(`select content_version, status, rollout_percent, created_by, created_at, notes from releases order by content_version desc limit 200`)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	items := make([]releaseItem, 0, 32)
	for rows.Next() {
		var it releaseItem
		var createdAt time.Time
		if err := rows.Scan(&it.ContentVersion, &it.Status, &it.RolloutPercent, &it.CreatedBy, &createdAt, &it.Notes); err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		it.CreatedAt = createdAt.UTC().Format(time.RFC3339)
		items = append(items, it)
	}

	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	_ = json.NewEncoder(w).Encode(map[string]any{"items": items})
}

func adminPublishRelease(w http.ResponseWriter, r *http.Request) {
	var in struct {
		Actor          string `json:"actor"`
		RolloutPercent int    `json:"rollout_percent"`
		Notes          string `json:"notes"`
	}
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
		http.Error(w, "invalid json", http.StatusBadRequest)
		return
	}
	if in.Actor == "" {
		in.Actor = "admin"
	}
	if in.RolloutPercent <= 0 || in.RolloutPercent > 100 {
		in.RolloutPercent = 100
	}

	conn, err := db.Open()
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	defer conn.Close()

	tx, err := conn.Begin()
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	defer func() { _ = tx.Rollback() }()

	// next content_version = max + 1
	var max sql.NullInt64
	_ = tx.QueryRow(`select max(content_version) from releases`).Scan(&max)
	next := 1
	if max.Valid {
		next = int(max.Int64) + 1
	}

	_, err = tx.Exec(
		`insert into releases (content_version, status, rollout_percent, created_by, notes) values ($1,'published',$2,$3,$4)`,
		next, in.RolloutPercent, in.Actor, in.Notes,
	)
	if err != nil {
		// 处理并发：若已存在，重试一次（MVP粗暴处理）
		if strings.Contains(err.Error(), "duplicate key") {
			next++
			_, err = tx.Exec(
				`insert into releases (content_version, status, rollout_percent, created_by, notes) values ($1,'published',$2,$3,$4)`,
				next, in.RolloutPercent, in.Actor, in.Notes,
			)
		}
	}
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	_ = insertAudit(tx, in.Actor, "publish", "release", strconv.Itoa(next), map[string]any{
		"rollout_percent": in.RolloutPercent,
		"notes":           in.Notes,
	})

	if err := tx.Commit(); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	_ = json.NewEncoder(w).Encode(map[string]any{
		"content_version": next,
		"rollout_percent": in.RolloutPercent,
		"status":          "published",
	})
}

