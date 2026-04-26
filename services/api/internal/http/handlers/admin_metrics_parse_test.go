package handlers

import (
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestParseAttribution_DefaultStrict(t *testing.T) {
	req := httptest.NewRequest(http.MethodGet, "/admin/metrics?attribution=weird", nil)
	if got := parseAttribution(req); got != "strict" {
		t.Fatalf("expected strict, got %q", got)
	}
}

