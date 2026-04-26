package content

import (
	"context"
	"testing"
)

func TestParseContentVersion_Invalid(t *testing.T) {
	cases := []string{
		"abc",
		"0",
		"-1",
		"1.2",
	}
	for _, tc := range cases {
		_, err := ParseContentVersion(tc)
		if err == nil {
			t.Fatalf("expected error for %q", tc)
		}
	}
}

func TestParseContentVersion_EmptyMeansNil(t *testing.T) {
	v, err := ParseContentVersion("")
	if err != nil || v != nil {
		t.Fatalf("expected nil, got %v err=%v", v, err)
	}
}

func TestParseContentVersion_OK(t *testing.T) {
	v, err := ParseContentVersion("2")
	if err != nil || v == nil || *v != 2 {
		t.Fatalf("expected 2, got %v err=%v", v, err)
	}
}

func TestResolveContentVersion_ExplicitWins(t *testing.T) {
	explicit := 9
	got, err := ResolveContentVersion(context.Background(), "u1", &explicit)
	if err != nil {
		t.Fatalf("unexpected err: %v", err)
	}
	if got != 9 {
		t.Fatalf("expected 9, got %d", got)
	}
}

func TestResolveContentVersion_DefaultV01(t *testing.T) {
	got, err := ResolveContentVersion(context.Background(), "u1", nil)
	if err != nil {
		t.Fatalf("unexpected err: %v", err)
	}
	if got != 1 {
		t.Fatalf("expected 1, got %d", got)
	}
}
