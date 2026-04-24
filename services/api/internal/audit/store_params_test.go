package audit

import "testing"

func TestClampLimit(t *testing.T) {
	if clampLimit(0) != 200 {
		t.Fatalf("expected default 200")
	}
	if clampLimit(999) != 500 {
		t.Fatalf("expected max 500")
	}
	if clampLimit(10) != 10 {
		t.Fatalf("expected 10")
	}
}
