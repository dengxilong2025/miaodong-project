package handlers

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestAudioUploadURL(t *testing.T) {
	req := httptest.NewRequest(http.MethodPost, "/v1/audio/upload-url", nil)
	req.Host = "example.com"
	w := httptest.NewRecorder()

	AudioUploadURL(w, req)
	if w.Code != 200 {
		t.Fatalf("expected 200, got %d", w.Code)
	}
	var out map[string]any
	_ = json.Unmarshal(w.Body.Bytes(), &out)
	if out["audio_id"] == "" || out["upload_url"] == "" || out["audio_url"] == "" {
		t.Fatalf("missing fields: %v", out)
	}
}

