package handlers

import (
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestParseAuditQuery_ClampLimit(t *testing.T) {
	req := httptest.NewRequest(http.MethodGet, "/admin/audit?limit=999", nil)
	p := parseAuditQuery(req)
	if p.Limit != 999 {
		t.Fatalf("expected raw limit 999 (clamp happens in store), got %d", p.Limit)
	}
}

func TestParseAuditQuery_TimeAndCursor(t *testing.T) {
	req := httptest.NewRequest(http.MethodGet, "/admin/audit?cursor=10&from=1&to=2&actor=a&action=publish&entity_type=release&entity_id=3", nil)
	p := parseAuditQuery(req)
	if p.Cursor == nil || *p.Cursor != 10 {
		t.Fatalf("cursor parse failed")
	}
	if p.FromMs == nil || *p.FromMs != 1 {
		t.Fatalf("from parse failed")
	}
	if p.ToMs == nil || *p.ToMs != 2 {
		t.Fatalf("to parse failed")
	}
	if p.Actor != "a" || p.Action != "publish" || p.EntityType != "release" || p.EntityID != "3" {
		t.Fatalf("field parse failed: %+v", p)
	}
}

func TestParseAuditQuery_InvalidNumbersIgnored(t *testing.T) {
	req := httptest.NewRequest(http.MethodGet, "/admin/audit?limit=x&cursor=y&from=z&to=w", nil)
	p := parseAuditQuery(req)
	if p.Limit != 0 {
		t.Fatalf("expected invalid limit ignored (0), got %d", p.Limit)
	}
	if p.Cursor != nil || p.FromMs != nil || p.ToMs != nil {
		t.Fatalf("expected invalid cursor/from/to ignored (nil), got %+v", p)
	}
}

