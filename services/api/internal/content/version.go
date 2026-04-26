package content

import (
	"context"
	"database/sql"
	"fmt"
	"strconv"
)

// ParseContentVersion parses the query parameter "content_version".
//
// Semantics:
// - empty string means "unspecified" -> (nil, nil)
// - positive integer means explicit version -> (&n, nil)
// - everything else returns error
func ParseContentVersion(s string) (*int, error) {
	if s == "" {
		return nil, nil
	}
	n, err := strconv.Atoi(s)
	if err != nil || n <= 0 {
		return nil, fmt.Errorf("invalid content_version")
	}
	return &n, nil
}

// ResolveContentVersion determines the effective content version for the request.
//
// v0.1 behavior:
// - if explicit is set, return it
// - otherwise default to 1 (future: releases/runtime_config)
func ResolveContentVersion(ctx context.Context, userID string, explicit *int) (int, error) {
	_ = ctx
	_ = userID

	if explicit != nil {
		return *explicit, nil
	}
	return 1, nil
}

// ResolveContentVersionDB determines the effective content version for the request,
// using the releases table for runtime rollout decisions.
//
// Semantics:
// - if explicit is set, return it (highest priority)
// - otherwise read latest published release (max content_version where status='published')
//   and its rollout_percent
// - rollout_percent == 100: everyone uses latest
// - rollout_percent < 100:
//   - if userID is empty: return previous published version (or 1 if none)
//   - else if userBucket(userID) < rollout_percent: return latest
//   - else return previous published version (or 1 if none)
func ResolveContentVersionDB(ctx context.Context, db *sql.DB, userID string, explicit *int) (int, error) {
	if explicit != nil {
		return *explicit, nil
	}
	if db == nil {
		return 0, fmt.Errorf("db is nil")
	}

	var latest int
	var rolloutPercent int
	err := db.QueryRowContext(ctx, `
select content_version, rollout_percent
from releases
where status='published'
order by content_version desc
limit 1
`).Scan(&latest, &rolloutPercent)
	if err == sql.ErrNoRows {
		return 1, nil
	}
	if err != nil {
		return 0, err
	}
	if latest <= 0 {
		latest = 1
	}

	if rolloutPercent >= 100 {
		return latest, nil
	}
	if rolloutPercent < 0 {
		rolloutPercent = 0
	}

	// compute previous published version (fallback to 1)
	prev := 1
	if latest > 1 {
		var prevRow int
		err := db.QueryRowContext(ctx, `
select content_version
from releases
where status='published' and content_version < $1
order by content_version desc
limit 1
`, latest).Scan(&prevRow)
		if err != nil && err != sql.ErrNoRows {
			return 0, err
		}
		if err == nil && prevRow > 0 {
			prev = prevRow
		}
	}

	if userID == "" {
		return prev, nil
	}
	if userBucket(userID) < rolloutPercent {
		return latest, nil
	}
	return prev, nil
}
