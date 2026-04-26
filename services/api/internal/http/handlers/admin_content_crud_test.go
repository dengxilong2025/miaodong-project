package handlers

import (
	"database/sql"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func withFailingAdminContentDB(t *testing.T, fn func()) {
	t.Helper()
	old := openAdminContentDB
	openAdminContentDB = func() (*sql.DB, error) {
		t.Fatalf("unexpected DB open in this code path")
		return nil, errors.New("unexpected DB open")
	}
	defer func() { openAdminContentDB = old }()
	fn()
}

func TestAdminContentCRUD_InvalidJSON_400(t *testing.T) {
	withFailingAdminContentDB(t, func() {
		cases := []struct {
			name    string
			method  string
			url     string
			handler http.HandlerFunc
		}{
			{
				name:    "questions",
				method:  http.MethodPost,
				url:     "/admin/questions",
				handler: AdminQuestions,
			},
			{
				name:    "suggestions",
				method:  http.MethodPost,
				url:     "/admin/suggestions",
				handler: AdminSuggestions,
			},
			{
				name:    "tools_guides",
				method:  http.MethodPut,
				url:     "/admin/tools-guides/night_meow",
				handler: AdminToolsGuideByProblemID,
			},
		}

		for _, tc := range cases {
			t.Run(tc.name, func(t *testing.T) {
				req := httptest.NewRequest(tc.method, tc.url, strings.NewReader("{"))
				req.Header.Set("X-Admin-Token", "dev-admin")
				req.Header.Set("Content-Type", "application/json")
				w := httptest.NewRecorder()

				tc.handler(w, req)

				if w.Code != http.StatusBadRequest {
					t.Fatalf("expected 400, got %d; body=%s", w.Code, w.Body.String())
				}
			})
		}
	})
}

func TestAdminContentCRUD_MissingRequired_400(t *testing.T) {
	withFailingAdminContentDB(t, func() {
		cases := []struct {
			name    string
			method  string
			url     string
			body    string
			handler http.HandlerFunc
		}{
			{
				name:    "questions",
				method:  http.MethodPost,
				url:     "/admin/questions",
				body:    `{}`,
				handler: AdminQuestions,
			},
			{
				name:    "suggestions",
				method:  http.MethodPost,
				url:     "/admin/suggestions",
				body:    `{}`,
				handler: AdminSuggestions,
			},
			{
				name:    "tools_guides",
				method:  http.MethodGet,
				url:     "/admin/tools-guides",
				body:    "",
				handler: AdminToolsGuides,
			},
		}

		for _, tc := range cases {
			t.Run(tc.name, func(t *testing.T) {
				var bodyReader *strings.Reader
				if tc.body == "" {
					bodyReader = strings.NewReader("")
				} else {
					bodyReader = strings.NewReader(tc.body)
				}
				req := httptest.NewRequest(tc.method, tc.url, bodyReader)
				req.Header.Set("X-Admin-Token", "dev-admin")
				req.Header.Set("Content-Type", "application/json")
				w := httptest.NewRecorder()

				tc.handler(w, req)

				if w.Code != http.StatusBadRequest {
					t.Fatalf("expected 400, got %d; body=%s", w.Code, w.Body.String())
				}
			})
		}
	})
}

func TestAdminContentCRUD_MethodNotAllowed_405(t *testing.T) {
	withFailingAdminContentDB(t, func() {
		cases := []struct {
			name    string
			method  string
			url     string
			handler http.HandlerFunc
		}{
			{
				name:    "questions",
				method:  http.MethodPut,
				url:     "/admin/questions",
				handler: AdminQuestions,
			},
			{
				name:    "suggestions",
				method:  http.MethodPut,
				url:     "/admin/suggestions",
				handler: AdminSuggestions,
			},
			{
				name:    "tools_guides",
				method:  http.MethodPost,
				url:     "/admin/tools-guides",
				handler: AdminToolsGuides,
			},
		}

		for _, tc := range cases {
			t.Run(tc.name, func(t *testing.T) {
				req := httptest.NewRequest(tc.method, tc.url, nil)
				req.Header.Set("X-Admin-Token", "dev-admin")
				w := httptest.NewRecorder()

				tc.handler(w, req)

				if w.Code != http.StatusMethodNotAllowed {
					t.Fatalf("expected 405, got %d; body=%s", w.Code, w.Body.String())
				}
			})
		}
	})
}

