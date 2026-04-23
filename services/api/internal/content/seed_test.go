package content

import "testing"

func TestLoadAndValidateSeed(t *testing.T) {
	p, err := DefaultSeedPath()
	if err != nil {
		t.Fatalf("DefaultSeedPath: %v", err)
	}
	s, err := LoadSeed(p)
	if err != nil {
		t.Fatalf("LoadSeed: %v", err)
	}
	if err := ValidateSeed(s); err != nil {
		t.Fatalf("ValidateSeed: %v", err)
	}
}

