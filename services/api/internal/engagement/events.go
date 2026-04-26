package engagement

import (
	"context"
	"database/sql"
	"encoding/json"
	"time"
)

// FeedbackReq matches the POST /v1/feedback request body.
//
// NOTE: Helpful uses *bool to distinguish "not provided" from false.
type FeedbackReq struct {
	RequestID      string `json:"request_id"`
	Helpful        *bool  `json:"helpful"`
	IntentMatch    string `json:"intent_match"`
	Notes          string `json:"notes"`
	ProblemID      string `json:"problem_id"`
	ContentVersion *int   `json:"content_version"`
}

// RetestReq matches the POST /v1/retest request body.
type RetestReq struct {
	ProblemID         string `json:"problem_id"`
	BaselineRequestID string `json:"baseline_request_id"`
	CurrentRequestID  string `json:"current_request_id"`
	Notes             string `json:"notes"`
	ContentVersion    *int   `json:"content_version"`
}

func nullIfEmpty(s string) any {
	if s == "" {
		return nil
	}
	return s
}

func contentVersionArg(cv *int) any {
	if cv == nil {
		return nil
	}
	return *cv
}

func WriteFeedbackEvent(ctx context.Context, db *sql.DB, r FeedbackReq) error {
	ts := time.Now().UnixMilli()
	payload := map[string]any{
		"helpful":      r.Helpful,
		"intent_match": r.IntentMatch,
		"notes":        r.Notes,
	}
	if r.ProblemID != "" {
		payload["problem_id"] = r.ProblemID
	}
	b, _ := json.Marshal(payload)

	_, err := db.ExecContext(
		ctx,
		`insert into analytics_events (event_name, ts_ms, content_version, request_id, payload)
		 values ($1,$2,$3,$4,$5::jsonb)`,
		"feedback_submitted",
		ts,
		contentVersionArg(r.ContentVersion),
		nullIfEmpty(r.RequestID),
		string(b),
	)
	return err
}

func WriteRetestEvent(ctx context.Context, db *sql.DB, r RetestReq) error {
	ts := time.Now().UnixMilli()
	payload := map[string]any{
		"baseline_request_id": r.BaselineRequestID,
		"current_request_id":  r.CurrentRequestID,
		"notes":               r.Notes,
	}
	if r.ProblemID != "" {
		payload["problem_id"] = r.ProblemID
	}
	b, _ := json.Marshal(payload)

	_, err := db.ExecContext(
		ctx,
		`insert into analytics_events (event_name, ts_ms, content_version, request_id, payload)
		 values ($1,$2,$3,$4,$5::jsonb)`,
		"retest_submitted",
		ts,
		contentVersionArg(r.ContentVersion),
		nullIfEmpty(r.CurrentRequestID),
		string(b),
	)
	return err
}
