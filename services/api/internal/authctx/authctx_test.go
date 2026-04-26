package authctx

import "testing"

func TestParseUserID_OK(t *testing.T) {
	got := ParseUserID("Bearer dev-token-u_abc")
	if got != "u_abc" {
		t.Fatalf("expected u_abc got %q", got)
	}
}

func TestParseUserID_Empty(t *testing.T) {
	got := ParseUserID("")
	if got != "" {
		t.Fatalf("expected empty got %q", got)
	}
}

func TestParseUserID_BadPrefix(t *testing.T) {
	got := ParseUserID("Bearer xxx")
	if got != "" {
		t.Fatalf("expected empty got %q", got)
	}
}

