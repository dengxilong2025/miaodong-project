package audit

import (
	"context"
	"database/sql"
	"encoding/json"
	"strconv"
	"strings"
	"time"
)

type Item struct {
	ID         int64           `json:"id"`
	Actor      string          `json:"actor"`
	Action     string          `json:"action"`
	EntityType string          `json:"entity_type"`
	EntityID   *string         `json:"entity_id,omitempty"`
	Diff       json.RawMessage `json:"diff"`
	CreatedAt  time.Time       `json:"created_at"`
}

type ListParams struct {
	Limit      int
	Cursor     *int64
	Actor      string
	Action     string
	EntityType string
	EntityID   string
	FromMs     *int64
	ToMs       *int64
}

func clampLimit(limit int) int {
	if limit <= 0 {
		return 200
	}
	if limit > 500 {
		return 500
	}
	return limit
}

func itoa(v int) string {
	return strconv.Itoa(v)
}

func List(ctx context.Context, db *sql.DB, limit int) ([]Item, error) {
	limit = clampLimit(limit)

	rows, err := db.QueryContext(ctx,
		`select id, actor, action, entity_type, entity_id, diff, created_at
		   from audit_log
		  order by created_at desc
		  limit $1`, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := make([]Item, 0, limit)
	for rows.Next() {
		var it Item
		var entityID sql.NullString
		if err := rows.Scan(&it.ID, &it.Actor, &it.Action, &it.EntityType, &entityID, &it.Diff, &it.CreatedAt); err != nil {
			return nil, err
		}
		if entityID.Valid {
			v := entityID.String
			it.EntityID = &v
		}
		out = append(out, it)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}

	return out, nil
}

func ListPage(ctx context.Context, db *sql.DB, p ListParams) ([]Item, *int64, error) {
	limit := clampLimit(p.Limit)

	where := make([]string, 0, 8)
	args := make([]any, 0, 8)
	n := 1
	add := func(cond string, v any) {
		where = append(where, cond)
		args = append(args, v)
		n++
	}

	if p.Cursor != nil {
		add("id < $"+itoa(n), *p.Cursor)
	}
	if p.Actor != "" {
		add("actor = $"+itoa(n), p.Actor)
	}
	if p.Action != "" {
		add("action = $"+itoa(n), p.Action)
	}
	if p.EntityType != "" {
		add("entity_type = $"+itoa(n), p.EntityType)
	}
	if p.EntityID != "" {
		add("entity_id = $"+itoa(n), p.EntityID)
	}
	if p.FromMs != nil {
		add("created_at >= $"+itoa(n), time.UnixMilli(*p.FromMs))
	}
	if p.ToMs != nil {
		add("created_at <= $"+itoa(n), time.UnixMilli(*p.ToMs))
	}

	q := `select id, actor, action, entity_type, entity_id, diff, created_at
	        from audit_log`
	if len(where) > 0 {
		q += " where " + strings.Join(where, " and ")
	}
	q += " order by created_at desc, id desc limit $" + itoa(n)
	args = append(args, limit)

	rows, err := db.QueryContext(ctx, q, args...)
	if err != nil {
		return nil, nil, err
	}
	defer rows.Close()

	out := make([]Item, 0, limit)
	for rows.Next() {
		var it Item
		var entityID sql.NullString
		if err := rows.Scan(&it.ID, &it.Actor, &it.Action, &it.EntityType, &entityID, &it.Diff, &it.CreatedAt); err != nil {
			return nil, nil, err
		}
		if entityID.Valid {
			v := entityID.String
			it.EntityID = &v
		}
		out = append(out, it)
	}
	if err := rows.Err(); err != nil {
		return nil, nil, err
	}

	var nextCursor *int64
	if len(out) > 0 {
		v := out[len(out)-1].ID
		nextCursor = &v
	}

	return out, nextCursor, nil
}
