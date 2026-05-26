package handlers

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/dengxilong2025/miaodong-project/services/api/internal/metrics"
)

func TestParseAttribution_DefaultStrict(t *testing.T) {
	req := httptest.NewRequest(http.MethodGet, "/admin/metrics?attribution=weird", nil)
	if got := parseAttribution(req); got != "strict" {
		t.Fatalf("expected strict, got %q", got)
	}
}

func TestAdminMetricsResponse_KPIsFieldsExistAndTypes(t *testing.T) {
	res := metrics.Result{
		EventsTotal:   1,
		DistinctUsers: 1,
		Feedback:      metrics.Feedback{Total: 1, Helpful: 1, HelpfulRate: 1.0},
		KPIs: metrics.KPIs{
			Inference: metrics.InferenceKPI{Started: 1, Succeeded: 1, Failed: 0, SuccessRate: 1.0},
			Share:     metrics.ShareKPI{Clicked: 1, Completed: 1, CompletedRate: 1.0},
			Retest:    metrics.RetestKPI{Started: 1, Completed: 1, CompletedRate: 1.0},
			Tools:     metrics.ToolsKPI{Expanded: 1, ExpandedRate: 1.0},
		},
	}

	body, err := json.Marshal(adminMetricsResponse(1, 2, "p1", "strict", res))
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}

	var got map[string]any
	if err := json.Unmarshal(body, &got); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}

	kpis, ok := got["kpis"].(map[string]any)
	if !ok {
		t.Fatalf("expected kpis to be object, got=%T (%v)", got["kpis"], got["kpis"])
	}

	inf, ok := kpis["inference"].(map[string]any)
	if !ok {
		t.Fatalf("expected kpis.inference to be object, got=%T (%v)", kpis["inference"], kpis["inference"])
	}
	if _, ok := inf["started"].(float64); !ok {
		t.Fatalf("expected kpis.inference.started to be number, got=%T (%v)", inf["started"], inf["started"])
	}
	if _, ok := inf["success_rate"].(float64); !ok {
		t.Fatalf("expected kpis.inference.success_rate to be number, got=%T (%v)", inf["success_rate"], inf["success_rate"])
	}

	share, ok := kpis["share"].(map[string]any)
	if !ok {
		t.Fatalf("expected kpis.share to be object, got=%T (%v)", kpis["share"], kpis["share"])
	}
	if _, ok := share["completed_rate"].(float64); !ok {
		t.Fatalf("expected kpis.share.completed_rate to be number, got=%T (%v)", share["completed_rate"], share["completed_rate"])
	}
}

func TestAdminMetricsCompareDelta_KPIsDeltaFieldsExistAndTypes(t *testing.T) {
	a := metrics.Result{
		KPIs: metrics.KPIs{
			Inference: metrics.InferenceKPI{Started: 10, Succeeded: 1, Failed: 9, SuccessRate: 0.1},
			Share:     metrics.ShareKPI{Clicked: 10, Completed: 5, CompletedRate: 0.5},
			Retest:    metrics.RetestKPI{Started: 2, Completed: 1, CompletedRate: 0.1},
			Tools:     metrics.ToolsKPI{Expanded: 2, ExpandedRate: 0.2},
		},
	}
	b := metrics.Result{
		KPIs: metrics.KPIs{
			Inference: metrics.InferenceKPI{Started: 20, Succeeded: 10, Failed: 10, SuccessRate: 0.5},
			Share:     metrics.ShareKPI{Clicked: 20, Completed: 10, CompletedRate: 0.25},
			Retest:    metrics.RetestKPI{Started: 10, Completed: 3, CompletedRate: 0.3},
			Tools:     metrics.ToolsKPI{Expanded: 7, ExpandedRate: 0.7},
		},
	}
	d := metrics.Delta(a, b)

	body, err := json.Marshal(d)
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}
	var got map[string]any
	if err := json.Unmarshal(body, &got); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}
	if _, ok := got["share_completed_rate"].(float64); !ok {
		t.Fatalf("expected delta.share_completed_rate to be number, got=%T (%v)", got["share_completed_rate"], got["share_completed_rate"])
	}
	if _, ok := got["inference_started"].(float64); !ok {
		t.Fatalf("expected delta.inference_started to be number, got=%T (%v)", got["inference_started"], got["inference_started"])
	}
}
