package handlers

import (
	"database/sql"
	"encoding/json"
	"net/http"
	"strings"
	"time"

	"github.com/dengxilong2025/miaodong-project/services/api/internal/db"
)

// AdminQuestions handles:
// - GET  /admin/questions?problem_id=...
// - POST /admin/questions
func AdminQuestions(w http.ResponseWriter, r *http.Request) {
	if !requireAdmin(w, r) {
		return
	}
	switch r.Method {
	case http.MethodGet:
		adminListQuestions(w, r)
	case http.MethodPost:
		adminCreateQuestion(w, r)
	default:
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
	}
}

// AdminQuestionByID handles:
// - GET   /admin/questions/{id}
// - PATCH /admin/questions/{id}
func AdminQuestionByID(w http.ResponseWriter, r *http.Request) {
	if !requireAdmin(w, r) {
		return
	}
	id := strings.TrimPrefix(r.URL.Path, "/admin/questions/")
	if id == "" {
		http.NotFound(w, r)
		return
	}
	switch r.Method {
	case http.MethodGet:
		adminGetQuestion(w, r, id)
	case http.MethodPatch:
		adminPatchQuestion(w, r, id)
	default:
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
	}
}

type adminQuestion struct {
	ID        string `json:"id"`
	ProblemID string `json:"problem_id"`
	Priority  int    `json:"priority"`
	Text      string `json:"text"`
	Type      string `json:"type"`
	Options   any    `json:"options"`
	Condition any    `json:"condition"`
	Status    string `json:"status"`
	UpdatedAt string `json:"updated_at"`
}

func adminListQuestions(w http.ResponseWriter, r *http.Request) {
	conn, err := db.Open()
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	defer conn.Close()

	problemID := r.URL.Query().Get("problem_id")
	rows, err := conn.Query(`
select id, problem_id, priority, text, type, options, condition, status, updated_at
from questions
where ($1='' or problem_id=$1)
order by priority desc, updated_at desc, id asc
limit 500
`, problemID)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	out := make([]adminQuestion, 0, 64)
	for rows.Next() {
		var q adminQuestion
		var pid sql.NullString
		var optionsJSON []byte
		var conditionJSON []byte
		var updated time.Time
		if err := rows.Scan(
			&q.ID, &pid, &q.Priority, &q.Text, &q.Type, &optionsJSON, &conditionJSON, &q.Status, &updated,
		); err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		if pid.Valid {
			q.ProblemID = pid.String
		}
		_ = json.Unmarshal(optionsJSON, &q.Options)
		_ = json.Unmarshal(conditionJSON, &q.Condition)
		q.UpdatedAt = updated.UTC().Format(time.RFC3339)
		out = append(out, q)
	}
	if err := rows.Err(); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	_ = json.NewEncoder(w).Encode(map[string]any{"items": out})
}

func adminGetQuestion(w http.ResponseWriter, r *http.Request, id string) {
	conn, err := db.Open()
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	defer conn.Close()

	var q adminQuestion
	var pid sql.NullString
	var optionsJSON []byte
	var conditionJSON []byte
	var updated time.Time
	err = conn.QueryRow(`
select id, problem_id, priority, text, type, options, condition, status, updated_at
from questions
where id=$1
`, id).Scan(&q.ID, &pid, &q.Priority, &q.Text, &q.Type, &optionsJSON, &conditionJSON, &q.Status, &updated)
	if err == sql.ErrNoRows {
		http.NotFound(w, r)
		return
	}
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	if pid.Valid {
		q.ProblemID = pid.String
	}
	_ = json.Unmarshal(optionsJSON, &q.Options)
	_ = json.Unmarshal(conditionJSON, &q.Condition)
	q.UpdatedAt = updated.UTC().Format(time.RFC3339)

	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	_ = json.NewEncoder(w).Encode(q)
}

func adminCreateQuestion(w http.ResponseWriter, r *http.Request) {
	var in struct {
		Actor     string           `json:"actor"`
		ID        string           `json:"id"`
		ProblemID string           `json:"problem_id"`
		Priority  *int             `json:"priority"`
		Text      string           `json:"text"`
		Type      string           `json:"type"`
		Options   *json.RawMessage `json:"options"`
		Condition *json.RawMessage `json:"condition"`
	}
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
		http.Error(w, "invalid json", http.StatusBadRequest)
		return
	}
	if in.Actor == "" {
		in.Actor = "admin"
	}
	if in.ID == "" || in.ProblemID == "" || in.Text == "" || in.Type == "" {
		http.Error(w, "missing fields: id/problem_id/text/type", http.StatusBadRequest)
		return
	}

	priority := 0
	if in.Priority != nil {
		priority = *in.Priority
	}

	optionsStr := "[]"
	var optionsAny any = []any{}
	if in.Options != nil {
		if len(*in.Options) == 0 || string(*in.Options) == "null" {
			http.Error(w, "invalid fields: options", http.StatusBadRequest)
			return
		}
		optionsStr = string(*in.Options)
		if err := json.Unmarshal(*in.Options, &optionsAny); err != nil {
			http.Error(w, "invalid fields: options", http.StatusBadRequest)
			return
		}
	}

	conditionStr := "{}"
	var conditionAny any = map[string]any{}
	if in.Condition != nil {
		if len(*in.Condition) == 0 || string(*in.Condition) == "null" {
			http.Error(w, "invalid fields: condition", http.StatusBadRequest)
			return
		}
		conditionStr = string(*in.Condition)
		if err := json.Unmarshal(*in.Condition, &conditionAny); err != nil {
			http.Error(w, "invalid fields: condition", http.StatusBadRequest)
			return
		}
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

	_, err = tx.Exec(`
insert into questions (id, problem_id, priority, text, type, options, condition, status)
values ($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb,'draft')
`, in.ID, in.ProblemID, priority, in.Text, in.Type, optionsStr, conditionStr)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	_ = insertAudit(tx, in.Actor, "create", "question", in.ID, map[string]any{
		"problem_id": in.ProblemID,
		"priority":   priority,
		"text":       in.Text,
		"type":       in.Type,
		"options":    optionsAny,
		"condition":  conditionAny,
		"status":     "draft",
	})

	if err := tx.Commit(); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(http.StatusCreated)
	_ = json.NewEncoder(w).Encode(map[string]any{"id": in.ID})
}

func adminPatchQuestion(w http.ResponseWriter, r *http.Request, id string) {
	var in struct {
		Actor     string           `json:"actor"`
		Priority  *int             `json:"priority"`
		Text      *string          `json:"text"`
		Type      *string          `json:"type"`
		Options   *json.RawMessage `json:"options"`
		Condition *json.RawMessage `json:"condition"`
		Status    *string          `json:"status"`
	}
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
		http.Error(w, "invalid json", http.StatusBadRequest)
		return
	}
	if in.Actor == "" {
		in.Actor = "admin"
	}
	if in.Status != nil && !adminQuestionStatusOK(*in.Status) {
		http.Error(w, "invalid fields: status", http.StatusBadRequest)
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

	sets := make([]string, 0, 7)
	args := make([]any, 0, 8)
	n := 1
	diff := map[string]any{}

	if in.Priority != nil {
		sets = append(sets, "priority=$"+itoa(n))
		args = append(args, *in.Priority)
		diff["priority"] = *in.Priority
		n++
	}
	if in.Text != nil {
		sets = append(sets, "text=$"+itoa(n))
		args = append(args, *in.Text)
		diff["text"] = *in.Text
		n++
	}
	if in.Type != nil {
		sets = append(sets, "type=$"+itoa(n))
		args = append(args, *in.Type)
		diff["type"] = *in.Type
		n++
	}
	if in.Options != nil {
		if len(*in.Options) == 0 || string(*in.Options) == "null" {
			http.Error(w, "invalid fields: options", http.StatusBadRequest)
			return
		}
		var v any
		if err := json.Unmarshal(*in.Options, &v); err != nil {
			http.Error(w, "invalid fields: options", http.StatusBadRequest)
			return
		}
		sets = append(sets, "options=$"+itoa(n)+"::jsonb")
		args = append(args, string(*in.Options))
		diff["options"] = v
		n++
	}
	if in.Condition != nil {
		if len(*in.Condition) == 0 || string(*in.Condition) == "null" {
			http.Error(w, "invalid fields: condition", http.StatusBadRequest)
			return
		}
		var v any
		if err := json.Unmarshal(*in.Condition, &v); err != nil {
			http.Error(w, "invalid fields: condition", http.StatusBadRequest)
			return
		}
		sets = append(sets, "condition=$"+itoa(n)+"::jsonb")
		args = append(args, string(*in.Condition))
		diff["condition"] = v
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
	q := "update questions set " + strings.Join(sets, ",") + " where id=$" + itoa(n)
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

	_ = insertAudit(tx, in.Actor, "update", "question", id, diff)

	if err := tx.Commit(); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	_ = json.NewEncoder(w).Encode(map[string]any{"ok": true})
}

func adminQuestionStatusOK(s string) bool {
	switch s {
	case "draft", "published", "archived":
		return true
	default:
		return false
	}
}
