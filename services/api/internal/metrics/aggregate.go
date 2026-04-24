package metrics

import (
	"context"
	"database/sql"
)

// ByEventItem matches the /admin/metrics JSON output field: by_event_name[].
type ByEventItem struct {
	EventName string `json:"event_name"`
	Count     int64  `json:"count"`
}

// Feedback matches the /admin/metrics JSON output field: feedback.
type Feedback struct {
	Total       int64   `json:"total"`
	Helpful     int64   `json:"helpful"`
	HelpfulRate float64 `json:"helpful_rate"`
}

// Result is the DB aggregation result for a given window.
// It intentionally matches the existing /admin/metrics output fields.
type Result struct {
	EventsTotal   int64         `json:"events_total"`
	DistinctUsers int64         `json:"distinct_users"`
	ByEventName   []ByEventItem `json:"by_event_name"`
	Feedback      Feedback      `json:"feedback"`
}

// DeltaResult is the compare delta between window A and B.
// (All fields are b - a)
type DeltaResult struct {
	EventsTotal         int64   `json:"events_total"`
	DistinctUsers       int64   `json:"distinct_users"`
	FeedbackHelpfulRate float64 `json:"feedback_helpful_rate"`
}

func Delta(a, b Result) DeltaResult {
	return DeltaResult{
		EventsTotal:         b.EventsTotal - a.EventsTotal,
		DistinctUsers:       b.DistinctUsers - a.DistinctUsers,
		FeedbackHelpfulRate: b.Feedback.HelpfulRate - a.Feedback.HelpfulRate,
	}
}

// Aggregate reuses the original /admin/metrics SQL (moved here for reuse).
//
// NOTE: Kept behavior intentionally consistent with the original handler:
// - problemID only affects feedback_submitted aggregation (not total/uv/by_event_name).
func Aggregate(ctx context.Context, db *sql.DB, from, to int64, problemID string) (Result, error) {
	var out Result

	// 1) 总量与UV
	if err := db.QueryRowContext(
		ctx,
		`select count(*)::bigint, count(distinct coalesce(user_id,''))::bigint
		   from analytics_events
		  where ts_ms >= $1 and ts_ms <= $2`,
		from, to,
	).Scan(&out.EventsTotal, &out.DistinctUsers); err != nil {
		return out, err
	}

	// 2) 按事件名计数
	rows, err := db.QueryContext(
		ctx,
		`select event_name, count(*)::bigint
		   from analytics_events
		  where ts_ms >= $1 and ts_ms <= $2
		  group by event_name
		  order by count(*) desc`,
		from, to,
	)
	if err != nil {
		return out, err
	}
	defer rows.Close()

	out.ByEventName = make([]ByEventItem, 0, 16)
	for rows.Next() {
		var it ByEventItem
		if err := rows.Scan(&it.EventName, &it.Count); err != nil {
			return out, err
		}
		out.ByEventName = append(out.ByEventName, it)
	}
	if err := rows.Err(); err != nil {
		return out, err
	}

	// 3) feedback helpful 统计（约定 event_name=feedback_submitted）
	// payload:
	// - problem_id: string
	// - helpful: boolean
	args := []any{from, to}
	whereProblem := ""
	if problemID != "" {
		whereProblem = " and payload->>'problem_id' = $3 "
		args = append(args, problemID)
	}

	var fbTotal, fbHelpful int64
	if err := db.QueryRowContext(
		ctx,
		`select
		    count(*)::bigint as total,
		    sum(case when (payload->>'helpful') in ('true','false') and (payload->>'helpful')::boolean = true then 1 else 0 end)::bigint as helpful
		   from analytics_events
		  where event_name='feedback_submitted'
		    and ts_ms >= $1 and ts_ms <= $2`+whereProblem,
		args...,
	).Scan(&fbTotal, &fbHelpful); err != nil {
		return out, err
	}

	helpfulRate := 0.0
	if fbTotal > 0 {
		helpfulRate = float64(fbHelpful) / float64(fbTotal)
	}
	out.Feedback = Feedback{
		Total:       fbTotal,
		Helpful:     fbHelpful,
		HelpfulRate: helpfulRate,
	}

	return out, nil
}
