package handlers

import (
	"database/sql"
	"encoding/json"
	"time"
)

func insertAudit(tx *sql.Tx, actor, action, entityType, entityID string, diff map[string]any) error {
	if diff == nil {
		diff = map[string]any{}
	}
	b, _ := json.Marshal(diff)
	_, err := tx.Exec(
		`insert into audit_log (actor, action, entity_type, entity_id, diff, created_at)
		 values ($1,$2,$3,$4,$5::jsonb,$6)`,
		actor, action, entityType, nullIfEmpty(entityID), string(b), time.Now(),
	)
	return err
}

func nullIfEmpty(s string) any {
	if s == "" {
		return nil
	}
	return s
}

