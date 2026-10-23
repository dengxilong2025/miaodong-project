package main

import (
	"strings"
	"testing"

	"github.com/dengxilong2025/miaodong-project/services/api/internal/content"
)

func TestBuildSQL_ImportsAllSeedContent(t *testing.T) {
	p, err := content.DefaultSeedPath()
	if err != nil {
		t.Fatalf("DefaultSeedPath: %v", err)
	}
	s, err := content.LoadSeed(p)
	if err != nil {
		t.Fatalf("LoadSeed: %v", err)
	}

	sqlText, err := buildSQL(s)
	if err != nil {
		t.Fatalf("buildSQL: %v", err)
	}

	for _, table := range []string{"problems", "questions", "suggestions", "tools_guides"} {
		if !strings.Contains(sqlText, "insert into "+table) {
			t.Fatalf("missing insert into %s", table)
		}
	}

	if got := strings.Count(sqlText, "insert into questions"); got != len(s.Questions) {
		t.Fatalf("questions count: got %d want %d", got, len(s.Questions))
	}
	if got := strings.Count(sqlText, "insert into suggestions"); got != len(s.Suggestions) {
		t.Fatalf("suggestions count: got %d want %d", got, len(s.Suggestions))
	}
	if got := strings.Count(sqlText, "insert into tools_guides"); got != len(s.ToolsGuides) {
		t.Fatalf("tools_guides count: got %d want %d", got, len(s.ToolsGuides))
	}

	for _, field := range []string{"priority", "cause_framework", "retest_plan_72h", "risk_level_copy"} {
		if !strings.Contains(sqlText, field) {
			t.Fatalf("missing problem field %s", field)
		}
	}
}
