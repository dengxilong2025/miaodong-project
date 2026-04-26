package handlers

import (
	"database/sql"
	"encoding/json"
	"net/http"
	"strings"
	"time"

	"github.com/dengxilong2025/miaodong-project/services/api/internal/db"
)

// AdminSuggestions handles:
// - GET  /admin/suggestions?problem_id=...
// - POST /admin/suggestions
func AdminSuggestions(w http.ResponseWriter, r *http.Request) {
	if !requireAdmin(w, r) {
		return
	}
	switch r.Method {
	case http.MethodGet:
		adminListSuggestions(w, r)
	case http.MethodPost:
		adminCreateSuggestion(w, r)
	default:
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
	}
}

// AdminSuggestionByID handles:
// - GET   /admin/suggestions/{id}
// - PATCH /admin/suggestions/{id}
func AdminSuggestionByID(w http.ResponseWriter, r *http.Request) {
	if !requireAdmin(w, r) {
		return
	}
	id := strings.TrimPrefix(r.URL.Path, "/admin/suggestions/")
	if id == "" {
		http.NotFound(w, r)
		return
	}
	switch r.Method {
	case http.MethodGet:
		adminGetSuggestion(w, r, id)
	case http.MethodPatch:
		adminPatchSuggestion(w, r, id)
	default:
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
	}
}

type adminSuggestion struct {
	ID                  string `json:"id"`
	ProblemID           string `json:"problem_id"`
	Priority            int    `json:"priority"`
	Title               string `json:"title"`
	Steps               any    `json:"steps"`
	ExpectedWindowHours int    `json:"expected_window_hours"`
	RetestTip           string `json:"retest_tip"`
	Condition           any    `json:"condition"`
	Status              string `json:"status"`
	UpdatedAt           string `json:"updated_at"`
}

func adminListSuggestions(w http.ResponseWriter, r *http.Request) {
	conn, err := db.Open()
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	defer conn.Close()

	problemID := r.URL.Query().Get("problem_id")
	rows, err := conn.Query(`
select id, problem_id, priority, title, steps, expected_window_hours, retest_tip, condition, status, updated_at
from suggestions
where ($1='' or problem_id=$1)
order by priority desc, updated_at desc, id asc
limit 500
`, problemID)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	out := make([]adminSuggestion, 0, 64)
	for rows.Next() {
		var s adminSuggestion
		var pid sql.NullString
		var stepsJSON []byte
		var conditionJSON []byte
		var updated time.Time
		if err := rows.Scan(
			&s.ID, &pid, &s.Priority, &s.Title, &stepsJSON, &s.ExpectedWindowHours, &s.RetestTip, &conditionJSON, &s.Status, &updated,
		); err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		if pid.Valid {
			s.ProblemID = pid.String
		}
		_ = json.Unmarshal(stepsJSON, &s.Steps)
		_ = json.Unmarshal(conditionJSON, &s.Condition)
		s.UpdatedAt = updated.UTC().Format(time.RFC3339)
		out = append(out, s)
	}
	if err := rows.Err(); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	_ = json.NewEncoder(w).Encode(map[string]any{"items": out})
}

func adminGetSuggestion(w http.ResponseWriter, r *http.Request, id string) {
	conn, err := db.Open()
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	defer conn.Close()

	var s adminSuggestion
	var pid sql.NullString
	var stepsJSON []byte
	var conditionJSON []byte
	var updated time.Time
	err = conn.QueryRow(`
select id, problem_id, priority, title, steps, expected_window_hours, retest_tip, condition, status, updated_at
from suggestions
where id=$1
`, id).Scan(
		&s.ID, &pid, &s.Priority, &s.Title, &stepsJSON, &s.ExpectedWindowHours, &s.RetestTip, &conditionJSON, &s.Status, &updated,
	)
	if err == sql.ErrNoRows {
		http.NotFound(w, r)
		return
	}
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	if pid.Valid {
		s.ProblemID = pid.String
	}
	_ = json.Unmarshal(stepsJSON, &s.Steps)
	_ = json.Unmarshal(conditionJSON, &s.Condition)
	s.UpdatedAt = updated.UTC().Format(time.RFC3339)

	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	_ = json.NewEncoder(w).Encode(s)
}

func adminCreateSuggestion(w http.ResponseWriter, r *http.Request) {
	var in struct {
		Actor               string           `json:"actor"`
		ID                  string           `json:"id"`
		ProblemID           string           `json:"problem_id"`
		Priority            *int             `json:"priority"`
		Title               string           `json:"title"`
		Steps               *json.RawMessage `json:"steps"`
		ExpectedWindowHours *int             `json:"expected_window_hours"`
		RetestTip           *string          `json:"retest_tip"`
		Condition           *json.RawMessage `json:"condition"`
	}
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
		http.Error(w, "invalid json", http.StatusBadRequest)
		return
	}
	if in.Actor == "" {
		in.Actor = "admin"
	}
	if in.ID == "" || in.ProblemID == "" || in.Title == "" {
		http.Error(w, "missing fields: id/problem_id/title", http.StatusBadRequest)
		return
	}

	priority := 0
	if in.Priority != nil {
		priority = *in.Priority
	}

	expectedWindowHours := 0
	if in.ExpectedWindowHours != nil {
		expectedWindowHours = *in.ExpectedWindowHours
	}

	retestTip := ""
	if in.RetestTip != nil {
		retestTip = *in.RetestTip
	}

	stepsStr := "[]"
	var stepsAny any = []any{}
	if in.Steps != nil {
		if len(*in.Steps) == 0 || string(*in.Steps) == "null" {
			http.Error(w, "invalid fields: steps", http.StatusBadRequest)
			return
		}
		stepsStr = string(*in.Steps)
		if err := json.Unmarshal(*in.Steps, &stepsAny); err != nil {
			http.Error(w, "invalid fields: steps", http.StatusBadRequest)
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
insert into suggestions (id, problem_id, priority, title, steps, expected_window_hours, retest_tip, condition, status)
values ($1,$2,$3,$4,$5::jsonb,$6,$7,$8::jsonb,'draft')
`, in.ID, in.ProblemID, priority, in.Title, stepsStr, expectedWindowHours, retestTip, conditionStr)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	_ = insertAudit(tx, in.Actor, "create", "suggestion", in.ID, map[string]any{
		"problem_id":            in.ProblemID,
		"priority":              priority,
		"title":                 in.Title,
		"steps":                 stepsAny,
		"expected_window_hours": expectedWindowHours,
		"retest_tip":            retestTip,
		"condition":             conditionAny,
		"status":                "draft",
	})

	if err := tx.Commit(); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(http.StatusCreated)
	_ = json.NewEncoder(w).Encode(map[string]any{"id": in.ID})
}

func adminPatchSuggestion(w http.ResponseWriter, r *http.Request, id string) {
	var in struct {
		Actor               string           `json:"actor"`
		Priority            *int             `json:"priority"`
		Title               *string          `json:"title"`
		Steps               *json.RawMessage `json:"steps"`
		ExpectedWindowHours *int             `json:"expected_window_hours"`
		RetestTip           *string          `json:"retest_tip"`
		Condition           *json.RawMessage `json:"condition"`
		Status              *string          `json:"status"`
	}
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
		http.Error(w, "invalid json", http.StatusBadRequest)
		return
	}
	if in.Actor == "" {
		in.Actor = "admin"
	}
	if in.Status != nil && !adminSuggestionStatusOK(*in.Status) {
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

	sets := make([]string, 0, 8)
	args := make([]any, 0, 9)
	n := 1
	diff := map[string]any{}

	if in.Priority != nil {
		sets = append(sets, "priority=$"+itoa(n))
		args = append(args, *in.Priority)
		diff["priority"] = *in.Priority
		n++
	}
	if in.Title != nil {
		sets = append(sets, "title=$"+itoa(n))
		args = append(args, *in.Title)
		diff["title"] = *in.Title
		n++
	}
	if in.Steps != nil {
		if len(*in.Steps) == 0 || string(*in.Steps) == "null" {
			http.Error(w, "invalid fields: steps", http.StatusBadRequest)
			return
		}
		var v any
		if err := json.Unmarshal(*in.Steps, &v); err != nil {
			http.Error(w, "invalid fields: steps", http.StatusBadRequest)
			return
		}
		sets = append(sets, "steps=$"+itoa(n)+"::jsonb")
		args = append(args, string(*in.Steps))
		diff["steps"] = v
		n++
	}
	if in.ExpectedWindowHours != nil {
		sets = append(sets, "expected_window_hours=$"+itoa(n))
		args = append(args, *in.ExpectedWindowHours)
		diff["expected_window_hours"] = *in.ExpectedWindowHours
		n++
	}
	if in.RetestTip != nil {
		sets = append(sets, "retest_tip=$"+itoa(n))
		args = append(args, *in.RetestTip)
		diff["retest_tip"] = *in.RetestTip
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
	q := "update suggestions set " + strings.Join(sets, ",") + " where id=$" + itoa(n)
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

	_ = insertAudit(tx, in.Actor, "update", "suggestion", id, diff)

	if err := tx.Commit(); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	_ = json.NewEncoder(w).Encode(map[string]any{"ok": true})
}

func adminSuggestionStatusOK(s string) bool {
	switch s {
	case "draft", "published", "archived":
		return true
	default:
		return false
	}
}
