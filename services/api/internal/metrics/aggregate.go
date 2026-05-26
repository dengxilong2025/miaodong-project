package metrics

import (
	"context"
	"database/sql"
	"fmt"
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

type InferenceKPI struct {
	Started     int64   `json:"started"`
	Succeeded   int64   `json:"succeeded"`
	Failed      int64   `json:"failed"`
	SuccessRate float64 `json:"success_rate"`
}

type ShareKPI struct {
	Clicked       int64   `json:"clicked"`
	Completed     int64   `json:"completed"`
	CompletedRate float64 `json:"completed_rate"`
}

type RetestKPI struct {
	Started       int64   `json:"started"`
	Completed     int64   `json:"completed"`
	CompletedRate float64 `json:"completed_rate"`
}

type ToolsKPI struct {
	Expanded     int64   `json:"expanded"`
	ExpandedRate float64 `json:"expanded_rate"`
}

type KPIs struct {
	Inference InferenceKPI `json:"inference"`
	Share     ShareKPI     `json:"share"`
	Retest    RetestKPI    `json:"retest"`
	Tools     ToolsKPI     `json:"tools"`
}

// Result is the DB aggregation result for a given window.
// It intentionally matches the existing /admin/metrics output fields.
type Result struct {
	EventsTotal   int64         `json:"events_total"`
	DistinctUsers int64         `json:"distinct_users"`
	ByEventName   []ByEventItem `json:"by_event_name"`
	Feedback      Feedback      `json:"feedback"`
	KPIs          KPIs          `json:"kpis"`
}

// DeltaResult is the compare delta between window A and B.
// (All fields are b - a)
type DeltaResult struct {
	EventsTotal         int64   `json:"events_total"`
	DistinctUsers       int64   `json:"distinct_users"`
	FeedbackHelpfulRate float64 `json:"feedback_helpful_rate"`

	// KPI counts
	InferenceStarted   int64 `json:"inference_started"`
	InferenceSucceeded int64 `json:"inference_succeeded"`
	InferenceFailed    int64 `json:"inference_failed"`
	ShareClicked       int64 `json:"share_clicked"`
	ShareCompleted     int64 `json:"share_completed"`
	RetestStarted      int64 `json:"retest_started"`
	RetestCompleted    int64 `json:"retest_completed"`
	ToolsExpanded      int64 `json:"tools_expanded"`

	// KPI rates
	InferenceSuccessRate float64 `json:"inference_success_rate"`
	ShareCompletedRate   float64 `json:"share_completed_rate"`
	RetestCompletedRate  float64 `json:"retest_completed_rate"`
	ToolsExpandedRate    float64 `json:"tools_expanded_rate"`
}

func Delta(a, b Result) DeltaResult {
	return DeltaResult{
		EventsTotal:         b.EventsTotal - a.EventsTotal,
		DistinctUsers:       b.DistinctUsers - a.DistinctUsers,
		FeedbackHelpfulRate: b.Feedback.HelpfulRate - a.Feedback.HelpfulRate,

		InferenceStarted:   b.KPIs.Inference.Started - a.KPIs.Inference.Started,
		InferenceSucceeded: b.KPIs.Inference.Succeeded - a.KPIs.Inference.Succeeded,
		InferenceFailed:    b.KPIs.Inference.Failed - a.KPIs.Inference.Failed,
		ShareClicked:       b.KPIs.Share.Clicked - a.KPIs.Share.Clicked,
		ShareCompleted:     b.KPIs.Share.Completed - a.KPIs.Share.Completed,
		RetestStarted:      b.KPIs.Retest.Started - a.KPIs.Retest.Started,
		RetestCompleted:    b.KPIs.Retest.Completed - a.KPIs.Retest.Completed,
		ToolsExpanded:      b.KPIs.Tools.Expanded - a.KPIs.Tools.Expanded,

		InferenceSuccessRate: b.KPIs.Inference.SuccessRate - a.KPIs.Inference.SuccessRate,
		ShareCompletedRate:   b.KPIs.Share.CompletedRate - a.KPIs.Share.CompletedRate,
		RetestCompletedRate:  b.KPIs.Retest.CompletedRate - a.KPIs.Retest.CompletedRate,
		ToolsExpandedRate:    b.KPIs.Tools.ExpandedRate - a.KPIs.Tools.ExpandedRate,
	}
}

// Aggregate reuses the original /admin/metrics SQL (moved here for reuse).
// It supports two attribution modes when problemID is provided:
// - strict (default): filter by payload->>'problem_id' = problemID
// - by_request: attribute by request_id in (subquery of requests that contain problemID within the same window)
func Aggregate(ctx context.Context, db *sql.DB, from, to int64, problemID, attribution string) (Result, error) {
	var out Result

	baseArgs := []any{from, to}
	where, whereArgs := buildWhere(problemID, attribution)
	args := append(baseArgs, whereArgs...)

	// 1) 总量与UV
	if err := db.QueryRowContext(
		ctx,
		`select count(*)::bigint, count(distinct coalesce(user_id,''))::bigint
		   from analytics_events
		  where ts_ms >= $1 and ts_ms <= $2`+where,
		args...,
	).Scan(&out.EventsTotal, &out.DistinctUsers); err != nil {
		return out, err
	}

	// 2) 按事件名计数
	rows, err := db.QueryContext(
		ctx,
		`select event_name, count(*)::bigint
		   from analytics_events
		  where ts_ms >= $1 and ts_ms <= $2
		  `+where+`
		  group by event_name
		  order by count(*) desc`,
		args...,
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
	var fbTotal, fbHelpful int64
	if err := db.QueryRowContext(
		ctx,
		`select
		    count(*)::bigint as total,
		    sum(case when (payload->>'helpful') in ('true','false') and (payload->>'helpful')::boolean = true then 1 else 0 end)::bigint as helpful
		   from analytics_events
		  where event_name='feedback_submitted'
		    and ts_ms >= $1 and ts_ms <= $2`+where,
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

	// 4) KPIs（problem 维度）
	//
	// 口径：
	// - inference success rate = inference_succeeded / inference_started
	// - share completed rate = share_completed / result_page_viewed
	// - retest completed rate = retest_completed / inference_succeeded
	// - tools expanded rate = tools_section_expanded / result_page_viewed
	//
	// 分母为 0 时 rate 返回 0.0。
	var (
		inferenceStarted   int64
		inferenceSucceeded int64
		inferenceFailed    int64
		shareClicked       int64
		shareCompleted     int64
		retestStarted      int64
		retestCompleted    int64
		toolsExpanded      int64
		resultPageViewed   int64
	)
	if err := db.QueryRowContext(
		ctx,
		`select
		    sum(case when event_name='inference_started' then 1 else 0 end)::bigint as inference_started,
		    sum(case when event_name='inference_succeeded' then 1 else 0 end)::bigint as inference_succeeded,
		    sum(case when event_name='inference_failed' then 1 else 0 end)::bigint as inference_failed,
		    sum(case when event_name='share_clicked' then 1 else 0 end)::bigint as share_clicked,
		    sum(case when event_name='share_completed' then 1 else 0 end)::bigint as share_completed,
		    sum(case when event_name='retest_started' then 1 else 0 end)::bigint as retest_started,
		    sum(case when event_name='retest_completed' then 1 else 0 end)::bigint as retest_completed,
		    sum(case when event_name='tools_section_expanded' then 1 else 0 end)::bigint as tools_expanded,
		    sum(case when event_name='result_page_viewed' then 1 else 0 end)::bigint as result_page_viewed
		   from analytics_events
		  where ts_ms >= $1 and ts_ms <= $2`+where,
		args...,
	).Scan(
		&inferenceStarted,
		&inferenceSucceeded,
		&inferenceFailed,
		&shareClicked,
		&shareCompleted,
		&retestStarted,
		&retestCompleted,
		&toolsExpanded,
		&resultPageViewed,
	); err != nil {
		return out, err
	}

	inferenceSuccessRate := 0.0
	if inferenceStarted > 0 {
		inferenceSuccessRate = float64(inferenceSucceeded) / float64(inferenceStarted)
	}
	shareCompletedRate := 0.0
	if resultPageViewed > 0 {
		shareCompletedRate = float64(shareCompleted) / float64(resultPageViewed)
	}
	retestCompletedRate := 0.0
	if inferenceSucceeded > 0 {
		retestCompletedRate = float64(retestCompleted) / float64(inferenceSucceeded)
	}
	toolsExpandedRate := 0.0
	if resultPageViewed > 0 {
		toolsExpandedRate = float64(toolsExpanded) / float64(resultPageViewed)
	}

	out.KPIs = KPIs{
		Inference: InferenceKPI{
			Started:     inferenceStarted,
			Succeeded:   inferenceSucceeded,
			Failed:      inferenceFailed,
			SuccessRate: inferenceSuccessRate,
		},
		Share: ShareKPI{
			Clicked:       shareClicked,
			Completed:     shareCompleted,
			CompletedRate: shareCompletedRate,
		},
		Retest: RetestKPI{
			Started:       retestStarted,
			Completed:     retestCompleted,
			CompletedRate: retestCompletedRate,
		},
		Tools: ToolsKPI{
			Expanded:     toolsExpanded,
			ExpandedRate: toolsExpandedRate,
		},
	}

	return out, nil
}

// buildWhere returns an extra SQL "and ..." clause and extra args appended after [$1=from, $2=to].
//
// For simplicity and consistency across Aggregate's queries, we always assume:
// - $1 = from
// - $2 = to
// - $3 = problemID (when problemID is non-empty)
//
// Unknown attribution values fall back to strict.
func buildWhere(problemID, attribution string) (string, []any) {
	const (
		fromIdx    = 1
		toIdx      = 2
		problemIdx = 3
	)

	if attribution == "by_request" {
		return buildWhereByRequest(problemID, fromIdx, toIdx, problemIdx)
	}
	return buildWhereStrict(problemID, problemIdx)
}

func buildWhereStrict(problemID string, problemIdx int) (string, []any) {
	if problemID == "" {
		return "", nil
	}
	return fmt.Sprintf(" and payload->>'problem_id' = $%d ", problemIdx), []any{problemID}
}

func buildWhereByRequest(problemID string, fromIdx, toIdx, problemIdx int) (string, []any) {
	if problemID == "" {
		return "", nil
	}

	// 子查询同样限定时间窗，避免跨窗归因。
	return fmt.Sprintf(` and request_id in (
  select distinct request_id
    from analytics_events
   where ts_ms >= $%d and ts_ms <= $%d
     and payload->>'problem_id' = $%d
     and request_id is not null and request_id <> ''
) `, fromIdx, toIdx, problemIdx), []any{problemID}
}
