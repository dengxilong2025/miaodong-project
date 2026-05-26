package metrics

import "testing"

func TestDelta(t *testing.T) {
	a := Result{
		EventsTotal:   100,
		DistinctUsers: 10,
		Feedback:      Feedback{HelpfulRate: 0.25},
		KPIs: KPIs{
			Inference: InferenceKPI{Started: 10, Succeeded: 4, Failed: 6, SuccessRate: 0.4},
			Share:     ShareKPI{Clicked: 3, Completed: 2, CompletedRate: 0.2},
			Retest:    RetestKPI{Started: 1, Completed: 1, CompletedRate: 0.25},
			Tools:     ToolsKPI{Expanded: 5, ExpandedRate: 0.5},
		},
	}
	b := Result{
		EventsTotal:   140,
		DistinctUsers: 8,
		Feedback:      Feedback{HelpfulRate: 0.40},
		KPIs: KPIs{
			Inference: InferenceKPI{Started: 20, Succeeded: 10, Failed: 10, SuccessRate: 0.5},
			Share:     ShareKPI{Clicked: 7, Completed: 5, CompletedRate: 0.25},
			Retest:    RetestKPI{Started: 3, Completed: 2, CompletedRate: 0.2},
			Tools:     ToolsKPI{Expanded: 9, ExpandedRate: 0.45},
		},
	}
	d := Delta(a, b)
	if d.EventsTotal != 40 {
		t.Fatalf("events delta wrong: %d", d.EventsTotal)
	}
	if d.DistinctUsers != -2 {
		t.Fatalf("uv delta wrong: %d", d.DistinctUsers)
	}
	if d.FeedbackHelpfulRate <= 0.14 || d.FeedbackHelpfulRate >= 0.16 {
		t.Fatalf("helpful_rate delta wrong: %f", d.FeedbackHelpfulRate)
	}

	if d.InferenceStarted != 10 || d.InferenceSucceeded != 6 || d.InferenceFailed != 4 {
		t.Fatalf("inference counts delta wrong: started=%d succeeded=%d failed=%d", d.InferenceStarted, d.InferenceSucceeded, d.InferenceFailed)
	}
	if d.ShareClicked != 4 || d.ShareCompleted != 3 {
		t.Fatalf("share counts delta wrong: clicked=%d completed=%d", d.ShareClicked, d.ShareCompleted)
	}
	if d.RetestStarted != 2 || d.RetestCompleted != 1 {
		t.Fatalf("retest counts delta wrong: started=%d completed=%d", d.RetestStarted, d.RetestCompleted)
	}
	if d.ToolsExpanded != 4 {
		t.Fatalf("tools counts delta wrong: expanded=%d", d.ToolsExpanded)
	}

	if d.InferenceSuccessRate <= 0.09 || d.InferenceSuccessRate >= 0.11 {
		t.Fatalf("inference success_rate delta wrong: %f", d.InferenceSuccessRate)
	}
	if d.ShareCompletedRate <= 0.04 || d.ShareCompletedRate >= 0.06 {
		t.Fatalf("share completed_rate delta wrong: %f", d.ShareCompletedRate)
	}
	if d.RetestCompletedRate <= -0.06 || d.RetestCompletedRate >= -0.04 {
		t.Fatalf("retest completed_rate delta wrong: %f", d.RetestCompletedRate)
	}
	if d.ToolsExpandedRate <= -0.06 || d.ToolsExpandedRate >= -0.04 {
		t.Fatalf("tools expanded_rate delta wrong: %f", d.ToolsExpandedRate)
	}
}
