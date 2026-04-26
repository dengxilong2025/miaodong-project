package handlers

import "github.com/dengxilong2025/miaodong-project/services/api/internal/metrics"

func adminMetricsResponse(from, to int64, problemID, attribution string, res metrics.Result) map[string]any {
	return map[string]any{
		"window": map[string]any{
			"from_ts_ms": from,
			"to_ts_ms":   to,
		},
		"filter": map[string]any{
			"problem_id":   problemID,
			"attribution":  attribution,
		},
		"events_total":   res.EventsTotal,
		"distinct_users": res.DistinctUsers,
		"by_event_name":  res.ByEventName,
		"feedback":       res.Feedback,
	}
}
