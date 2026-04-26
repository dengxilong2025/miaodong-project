package handlers

import (
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestListProblems_BadContentVersion(t *testing.T) {
	req := httptest.NewRequest(http.MethodGet, "/v1/problems?content_version=abc", nil)
	w := httptest.NewRecorder()

	ListProblems(w, req)

	if w.Code != http.StatusBadRequest {
		t.Fatalf("expected %d, got %d body=%q", http.StatusBadRequest, w.Code, w.Body.String())
	}
}

func TestGetResultTemplate_MissingProblemID(t *testing.T) {
	req := httptest.NewRequest(http.MethodGet, "/v1/templates/result", nil)
	w := httptest.NewRecorder()

	GetResultTemplate(w, req)

	if w.Code != http.StatusBadRequest {
		t.Fatalf("expected %d, got %d body=%q", http.StatusBadRequest, w.Code, w.Body.String())
	}
}

func TestListProblems_MethodNotAllowed(t *testing.T) {
	req := httptest.NewRequest(http.MethodPost, "/v1/problems", nil)
	w := httptest.NewRecorder()

	ListProblems(w, req)

	if w.Code != http.StatusMethodNotAllowed {
		t.Fatalf("expected %d, got %d body=%q", http.StatusMethodNotAllowed, w.Code, w.Body.String())
	}
}
