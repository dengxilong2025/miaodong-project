package content

import (
	"context"
	"database/sql"
	"encoding/json"
)

// ProblemSummary is the lightweight list item for /v1/problems.
type ProblemSummary struct {
	ID      string   `json:"id"`
	Title   string   `json:"title"`
	Summary string   `json:"summary"`
	Tags    []string `json:"tags"`
}

// Bundle is a v0.1 "problem details" response payload assembled from multiple tables.
//
// For fast iteration, we keep most shapes as map[string]any to directly carry jsonb fields
// (e.g. tags/options/steps/condition) without over-modeling.
type Bundle struct {
	Problem     map[string]any   `json:"problem"`
	Questions   []map[string]any `json:"questions"`
	Suggestions []map[string]any `json:"suggestions"`
	ToolsGuides map[string]any   `json:"tools_guides,omitempty"`
}

func clampLimit(limit int) int {
	if limit <= 0 {
		return 3
	}
	if limit > 50 {
		return 50
	}
	return limit
}

func unmarshalJSONMap(b []byte) (map[string]any, error) {
	var m map[string]any
	if err := json.Unmarshal(b, &m); err != nil {
		return nil, err
	}
	return m, nil
}

// ListProblems returns up to N published problems with id/title/summary/tags.
// limit is clamped: default 3, max 50.
func ListProblems(ctx context.Context, db *sql.DB, limit int) ([]ProblemSummary, error) {
	limit = clampLimit(limit)

	rows, err := db.QueryContext(ctx, `
select id, title, summary, tags
from problems
where status='published'
order by id asc
limit $1
`, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := make([]ProblemSummary, 0, limit)
	for rows.Next() {
		var p ProblemSummary
		var tagsJSON []byte
		if err := rows.Scan(&p.ID, &p.Title, &p.Summary, &tagsJSON); err != nil {
			return nil, err
		}
		_ = json.Unmarshal(tagsJSON, &p.Tags)
		out = append(out, p)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return out, nil
}

// GetProblemBundle reads a single published problem and its related content:
// - problems: one row
// - questions: by priority desc
// - suggestions: by priority desc
// - tools_guides: optional one row
//
// If the problem doesn't exist, it returns sql.ErrNoRows.
func GetProblemBundle(ctx context.Context, db *sql.DB, problemID string) (Bundle, error) {
	var b Bundle

	// problem
	var problemJSON []byte
	err := db.QueryRowContext(ctx, `
select to_jsonb(p)
from problems p
where p.id=$1 and p.status='published'
`, problemID).Scan(&problemJSON)
	if err != nil {
		return Bundle{}, err
	}
	b.Problem, err = unmarshalJSONMap(problemJSON)
	if err != nil {
		return Bundle{}, err
	}

	// questions
	qRows, err := db.QueryContext(ctx, `
select to_jsonb(q)
from questions q
where q.problem_id=$1 and q.status='published'
order by q.priority desc, q.id asc
`, problemID)
	if err != nil {
		return Bundle{}, err
	}
	defer qRows.Close()
	b.Questions = make([]map[string]any, 0, 8)
	for qRows.Next() {
		var rowJSON []byte
		if err := qRows.Scan(&rowJSON); err != nil {
			return Bundle{}, err
		}
		m, err := unmarshalJSONMap(rowJSON)
		if err != nil {
			return Bundle{}, err
		}
		b.Questions = append(b.Questions, m)
	}
	if err := qRows.Err(); err != nil {
		return Bundle{}, err
	}

	// suggestions
	sRows, err := db.QueryContext(ctx, `
select to_jsonb(s)
from suggestions s
where s.problem_id=$1 and s.status='published'
order by s.priority desc, s.id asc
`, problemID)
	if err != nil {
		return Bundle{}, err
	}
	defer sRows.Close()
	b.Suggestions = make([]map[string]any, 0, 8)
	for sRows.Next() {
		var rowJSON []byte
		if err := sRows.Scan(&rowJSON); err != nil {
			return Bundle{}, err
		}
		m, err := unmarshalJSONMap(rowJSON)
		if err != nil {
			return Bundle{}, err
		}
		b.Suggestions = append(b.Suggestions, m)
	}
	if err := sRows.Err(); err != nil {
		return Bundle{}, err
	}

	// tools_guides (optional)
	var tgJSON []byte
	err = db.QueryRowContext(ctx, `
select to_jsonb(tg)
from tools_guides tg
where tg.problem_id=$1 and tg.status='published'
`, problemID).Scan(&tgJSON)
	if err == nil {
		b.ToolsGuides, err = unmarshalJSONMap(tgJSON)
		if err != nil {
			return Bundle{}, err
		}
	} else if err == sql.ErrNoRows {
		// optional: keep nil (omitempty)
	} else {
		return Bundle{}, err
	}

	return b, nil
}

// GetResultTemplate reuses the bundle for v0.1.
func GetResultTemplate(ctx context.Context, db *sql.DB, problemID string) (Bundle, error) {
	return GetProblemBundle(ctx, db, problemID)
}
