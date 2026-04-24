package audit

import (
	"context"
	"database/sql"
	"encoding/json"
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

func List(ctx context.Context, db *sql.DB, limit int) ([]Item, error) {
	if limit <= 0 {
		limit = 200
	}
	if limit > 500 {
		limit = 500
	}

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

