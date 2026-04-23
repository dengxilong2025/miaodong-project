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

// AdminProblems handles:
// - GET  /admin/problems
// - POST /admin/problems
func AdminProblems(w http.ResponseWriter, r *http.Request) {
	if !requireAdmin(w, r) {
		return
	}
	switch r.Method {
	case http.MethodGet:
		adminListProblems(w, r)
	case http.MethodPost:
		adminCreateProblem(w, r)
	default:
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
	}
}

// AdminProblemByID handles:
// - GET   /admin/problems/{id}
// - PATCH /admin/problems/{id}
func AdminProblemByID(w http.ResponseWriter, r *http.Request) {
	if !requireAdmin(w, r) {
		return
	}
	id := strings.TrimPrefix(r.URL.Path, "/admin/problems/")
	if id == "" {
		http.NotFound(w, r)
		return
	}
	switch r.Method {
	case http.MethodGet:
		adminGetProblem(w, r, id)
	case http.MethodPatch:
		adminPatchProblem(w, r, id)
	default:
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
	}
}

type adminProblem struct {
	ID        string   `json:"id"`
	Title     string   `json:"title"`
	Summary   string   `json:"summary"`
	Tags      []string `json:"tags"`
	Status    string   `json:"status"`
	UpdatedAt string   `json:"updated_at"`
}

func adminListProblems(w http.ResponseWriter, _ *http.Request) {
	conn, err := db.Open()
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	defer conn.Close()

	rows, err := conn.Query(`select id, title, summary, tags, status, updated_at from problems order by updated_at desc limit 200`)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	out := make([]adminProblem, 0, 64)
	for rows.Next() {
		var p adminProblem
		var tagsJSON []byte
		var updated time.Time
		if err := rows.Scan(&p.ID, &p.Title, &p.Summary, &tagsJSON, &p.Status, &updated); err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		_ = json.Unmarshal(tagsJSON, &p.Tags)
		p.UpdatedAt = updated.UTC().Format(time.RFC3339)
		out = append(out, p)
	}

	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	_ = json.NewEncoder(w).Encode(map[string]any{"items": out})
}

func adminGetProblem(w http.ResponseWriter, _ *http.Request, id string) {
	conn, err := db.Open()
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	defer conn.Close()

	var p adminProblem
	var tagsJSON []byte
	var updated time.Time
	err = conn.QueryRow(`select id, title, summary, tags, status, updated_at from problems where id=$1`, id).
		Scan(&p.ID, &p.Title, &p.Summary, &tagsJSON, &p.Status, &updated)
	if err == sql.ErrNoRows {
		http.NotFound(w, r)
		return
	}
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	_ = json.Unmarshal(tagsJSON, &p.Tags)
	p.UpdatedAt = updated.UTC().Format(time.RFC3339)

	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	_ = json.NewEncoder(w).Encode(p)
}

func adminCreateProblem(w http.ResponseWriter, r *http.Request) {
	var in struct {
		Actor  string   `json:"actor"`
		ID     string   `json:"id"`
		Title  string   `json:"title"`
		Summary string  `json:"summary"`
		Tags   []string `json:"tags"`
	}
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
		http.Error(w, "invalid json", http.StatusBadRequest)
		return
	}
	if in.Actor == "" {
		in.Actor = "admin"
	}
	if in.ID == "" || in.Title == "" || in.Summary == "" {
		http.Error(w, "missing fields: id/title/summary", http.StatusBadRequest)
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

	tagsB, _ := json.Marshal(in.Tags)
	_, err = tx.Exec(`insert into problems (id,title,summary,tags,status) values ($1,$2,$3,$4::jsonb,'draft')`,
		in.ID, in.Title, in.Summary, string(tagsB),
	)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	_ = insertAudit(tx, in.Actor, "create", "problem", in.ID, map[string]any{
		"title":   in.Title,
		"summary": in.Summary,
		"tags":    in.Tags,
	})

	if err := tx.Commit(); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(http.StatusCreated)
	_ = json.NewEncoder(w).Encode(map[string]any{"id": in.ID})
}

func adminPatchProblem(w http.ResponseWriter, r *http.Request, id string) {
	var in struct {
		Actor   string    `json:"actor"`
		Title   *string   `json:"title"`
		Summary *string   `json:"summary"`
		Tags    *[]string `json:"tags"`
		Status  *string   `json:"status"`
	}
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
		http.Error(w, "invalid json", http.StatusBadRequest)
		return
	}
	if in.Actor == "" {
		in.Actor = "admin"
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

	// 构造动态SQL（MVP：只支持这几个字段）
	sets := make([]string, 0, 5)
	args := make([]any, 0, 6)
	n := 1
	diff := map[string]any{}

	if in.Title != nil {
		sets = append(sets, "title=$"+itoa(n))
		args = append(args, *in.Title)
		diff["title"] = *in.Title
		n++
	}
	if in.Summary != nil {
		sets = append(sets, "summary=$"+itoa(n))
		args = append(args, *in.Summary)
		diff["summary"] = *in.Summary
		n++
	}
	if in.Tags != nil {
		b, _ := json.Marshal(*in.Tags)
		sets = append(sets, "tags=$"+itoa(n)+"::jsonb")
		args = append(args, string(b))
		diff["tags"] = *in.Tags
		n++
	}
	if in.Status != nil {
		sets = append(sets, "status=$"+itoa(n))
		args = append(args, *in.Status)
		diff["status"] = *in.Status
		n++
	}
	sets = append(sets, "updated_at=now()")

	if len(diff) == 0 {
		http.Error(w, "no changes", http.StatusBadRequest)
		return
	}

	args = append(args, id)
	q := "update problems set " + strings.Join(sets, ",") + " where id=$" + itoa(n)
	res, err := tx.Exec(q, args...)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	aff, _ := res.RowsAffected()
	if aff == 0 {
		http.NotFound(w, r)
		return
	}

	_ = insertAudit(tx, in.Actor, "update", "problem", id, diff)

	if err := tx.Commit(); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	_ = json.NewEncoder(w).Encode(map[string]any{"ok": true})
}

func itoa(i int) string {
	return strconv.Itoa(i)
}
