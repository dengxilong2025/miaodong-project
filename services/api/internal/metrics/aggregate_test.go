package metrics

import "testing"

func TestDelta(t *testing.T) {
	a := Result{EventsTotal: 100, DistinctUsers: 10, Feedback: Feedback{HelpfulRate: 0.25}}
	b := Result{EventsTotal: 140, DistinctUsers: 8, Feedback: Feedback{HelpfulRate: 0.40}}
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
}
