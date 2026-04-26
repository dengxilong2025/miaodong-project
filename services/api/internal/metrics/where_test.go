package metrics

import (
	"strings"
	"testing"
)

func TestBuildWhereStrict(t *testing.T) {
	sql, args := buildWhereStrict("night_meow", 3)
	if sql == "" {
		t.Fatalf("expected non-empty sql")
	}
	if !strings.Contains(sql, "payload->>'problem_id'") {
		t.Fatalf("expected problem_id condition, got: %s", sql)
	}
	if !strings.Contains(sql, "$3") {
		t.Fatalf("expected $3 placeholder, got: %s", sql)
	}
	if len(args) != 1 || args[0] != "night_meow" {
		t.Fatalf("expected args=[night_meow], got: %#v", args)
	}
}

func TestBuildWhereByRequest(t *testing.T) {
	sql, args := buildWhereByRequest("night_meow", 1, 2, 3)
	if sql == "" {
		t.Fatalf("expected non-empty sql")
	}
	if !strings.Contains(sql, "request_id in") {
		t.Fatalf("expected request_id attribution, got: %s", sql)
	}
	if !strings.Contains(sql, "select distinct request_id") {
		t.Fatalf("expected distinct request_id subquery, got: %s", sql)
	}
	if !strings.Contains(sql, "ts_ms >= $1") || !strings.Contains(sql, "ts_ms <= $2") {
		t.Fatalf("expected window constraints in subquery, got: %s", sql)
	}
	if !strings.Contains(sql, "payload->>'problem_id' = $3") {
		t.Fatalf("expected problem_id placeholder in subquery, got: %s", sql)
	}
	if !strings.Contains(sql, "request_id is not null") || !strings.Contains(sql, "request_id <> ''") {
		t.Fatalf("expected request_id non-empty guard, got: %s", sql)
	}
	if len(args) != 1 || args[0] != "night_meow" {
		t.Fatalf("expected args=[night_meow], got: %#v", args)
	}
}

func TestBuildWhere_EmptyProblemID(t *testing.T) {
	if sql, args := buildWhereStrict("", 3); sql != "" || args != nil {
		t.Fatalf("expected empty, got sql=%q args=%#v", sql, args)
	}
	if sql, args := buildWhereByRequest("", 1, 2, 3); sql != "" || args != nil {
		t.Fatalf("expected empty, got sql=%q args=%#v", sql, args)
	}
	if sql, args := buildWhere("", "by_request"); sql != "" || args != nil {
		t.Fatalf("expected empty, got sql=%q args=%#v", sql, args)
	}
}

func TestBuildWhere_DefaultStrict(t *testing.T) {
	sql, _ := buildWhere("night_meow", "weird")
	if !strings.Contains(sql, "payload->>'problem_id'") {
		t.Fatalf("expected strict fallback, got: %s", sql)
	}
}

