package handlers

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestFeedback_MissingRequestID(t *testing.T) {
	w := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost, "/v1/feedback", strings.NewReader(`{"helpful":true}`))
	Feedback(w, req)
	if w.Code != http.StatusBadRequest {
		t.Fatalf("expected 400 got %d", w.Code)
	}
}

func TestFeedback_MissingHelpful(t *testing.T) {
	w := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost, "/v1/feedback", strings.NewReader(`{"request_id":"r1"}`))
	Feedback(w, req)
	if w.Code != http.StatusBadRequest {
		t.Fatalf("expected 400 got %d", w.Code)
	}
}

func TestFeedback_MethodNotAllowed(t *testing.T) {
	w := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/v1/feedback", nil)
	Feedback(w, req)
	if w.Code != http.StatusMethodNotAllowed {
		t.Fatalf("expected 405 got %d", w.Code)
	}
}

func TestRetest_MissingProblemID(t *testing.T) {
	w := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost, "/v1/retest", strings.NewReader(`{"baseline_request_id":"r0","current_request_id":"r1"}`))
	Retest(w, req)
	if w.Code != http.StatusBadRequest {
		t.Fatalf("expected 400 got %d", w.Code)
	}
}

func TestRetest_MethodNotAllowed(t *testing.T) {
	w := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/v1/retest", nil)
	Retest(w, req)
	if w.Code != http.StatusMethodNotAllowed {
		t.Fatalf("expected 405 got %d", w.Code)
	}
}

