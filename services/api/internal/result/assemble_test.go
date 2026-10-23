package result

import (
	"strings"
	"testing"

	"github.com/dengxilong2025/miaodong-project/services/api/internal/content"
)

func asMap(t *testing.T, v any) map[string]any {
	t.Helper()
	m, ok := v.(map[string]any)
	if !ok {
		t.Fatalf("expected map[string]any, got %T (%v)", v, v)
	}
	return m
}

func asList(t *testing.T, v any) []any {
	t.Helper()
	l, ok := v.([]any)
	if !ok {
		t.Fatalf("expected []any, got %T (%v)", v, v)
	}
	return l
}

func fullBundle() content.Bundle {
	return content.Bundle{
		Problem: map[string]any{
			"id":              "night_meow",
			"risk_level_copy": map[string]any{"green": "精神食欲正常，先按建议调整看看。"},
		},
		// 故意乱序，验证组装层按 priority 选最高、按 priority desc 取前 3。
		Questions: []map[string]any{
			{"id": "q_low", "priority": float64(10), "text": "低优先级问题", "type": "single_choice", "options": []any{}},
			{"id": "q_high", "priority": float64(100), "text": "高优先级问题", "type": "single_choice", "options": []any{map[string]any{"value": "yes", "label": "是"}}},
		},
		Suggestions: []map[string]any{
			{"id": "s_low", "priority": float64(10), "title": "低优先级建议", "steps": []any{"a"}, "expected_window_hours": float64(72), "retest_tip": "tip"},
			{"id": "s_high", "priority": float64(100), "title": "高优先级建议", "steps": []any{"b"}, "expected_window_hours": float64(24), "retest_tip": "tip"},
			{"id": "s_mid", "priority": float64(50), "title": "中优先级建议", "steps": []any{"c"}, "expected_window_hours": float64(24), "retest_tip": "tip"},
			{"id": "s_extra", "priority": float64(30), "title": "第四条建议", "steps": []any{"d"}, "expected_window_hours": float64(24), "retest_tip": "tip"},
		},
		ToolsGuides: map[string]any{
			"id":                   "tg_night",
			"problem_id":           "night_meow",
			"collapsed_by_default": true,
			"guide_bullets":        []any{"选可控可重复的玩具"},
			"efficiency_items":     []any{map[string]any{"sku_key": "wand_toy_basic", "name": "逗猫棒", "reason": "改善夜叫", "buy_link": nil}},
		},
	}
}

func TestApplyContent_FullBundle(t *testing.T) {
	out := map[string]any{"primary_intent": map[string]any{"code": "PLAY"}}

	ApplyContent(out, fullBundle())

	if got := asMap(t, out["primary_intent"])["code"]; got != "PLAY" {
		t.Fatalf("primary_intent should be preserved, got %v", got)
	}

	q := asMap(t, out["followup_question"])
	if q["id"] != "q_high" {
		t.Fatalf("expected highest priority question q_high, got %v", q["id"])
	}
	if q["text"] != "高优先级问题" || q["type"] != "single_choice" {
		t.Fatalf("unexpected question payload: %v", q)
	}
	if _, ok := q["options"]; !ok {
		t.Fatalf("question options missing: %v", q)
	}

	sugs := asList(t, out["suggestions"])
	if len(sugs) != 3 {
		t.Fatalf("expected at most 3 suggestions, got %d", len(sugs))
	}
	wantIDs := []string{"s_high", "s_mid", "s_extra"}
	for i, want := range wantIDs {
		got := asMap(t, sugs[i])["id"]
		if got != want {
			t.Fatalf("suggestions[%d]: got %v want %s", i, got, want)
		}
	}
	first := asMap(t, sugs[0])
	if first["title"] != "高优先级建议" {
		t.Fatalf("unexpected suggestion title: %v", first["title"])
	}
	if _, ok := first["expected_window_hours"]; !ok {
		t.Fatalf("expected_window_hours missing: %v", first)
	}

	risk := asMap(t, out["risk_level"])
	if risk["level"] != "green" {
		t.Fatalf("expected green risk level, got %v", risk["level"])
	}
	if risk["message"] != "精神食欲正常，先按建议调整看看。" {
		t.Fatalf("unexpected risk message: %v", risk["message"])
	}

	tools := asMap(t, out["optional_tools_section"])
	if tools["collapsed_by_default"] != true {
		t.Fatalf("tools should be collapsed by default: %v", tools)
	}
	blocks := asList(t, tools["content_blocks"])
	if len(blocks) != 2 {
		t.Fatalf("expected 2 tool blocks, got %d", len(blocks))
	}
	guide := asMap(t, blocks[0])
	if guide["type"] != "guide" || guide["title"] != "避坑采购指南" {
		t.Fatalf("unexpected guide block: %v", guide)
	}
	eff := asMap(t, blocks[1])
	if eff["type"] != "efficiency_list" || eff["title"] != "省力工具（非必需）" {
		t.Fatalf("unexpected efficiency block: %v", eff)
	}

	share := asMap(t, out["share_asset"])
	tpl, _ := share["share_text_template"].(string)
	if !strings.Contains(tpl, "{label}") || !strings.Contains(tpl, "{confidence}") {
		t.Fatalf("share template missing placeholders: %q", tpl)
	}
	if share["share_title"] != "测一测我家猫在想啥" || share["card_style"] != "result_card_v1" {
		t.Fatalf("unexpected share asset: %v", share)
	}
}

func TestApplyContent_DoesNotOverwriteInferenceFields(t *testing.T) {
	existingSuggestion := []any{map[string]any{"id": "upstream"}}
	out := map[string]any{
		"followup_question": map[string]any{"id": "upstream_q"},
		"suggestions":       existingSuggestion,
		"risk_level":        map[string]any{"level": "yellow"},
		"share_asset":       map[string]any{"share_title": "upstream"},
	}

	ApplyContent(out, fullBundle())

	if out["followup_question"].(map[string]any)["id"] != "upstream_q" {
		t.Fatalf("followup_question should not be overwritten")
	}
	if len(out["suggestions"].([]any)) != 1 {
		t.Fatalf("suggestions should not be overwritten")
	}
	if out["risk_level"].(map[string]any)["level"] != "yellow" {
		t.Fatalf("risk_level should not be overwritten")
	}
	if out["share_asset"].(map[string]any)["share_title"] != "upstream" {
		t.Fatalf("share_asset should not be overwritten")
	}
}

func TestApplyContent_EmptyBundleAddsNothing(t *testing.T) {
	out := map[string]any{"primary_intent": map[string]any{"code": "PLAY"}}
	ApplyContent(out, content.Bundle{})

	if len(out) != 1 {
		t.Fatalf("expected only primary_intent, got %v", out)
	}
}

func TestApplyContent_NoToolsGuideOmitsSection(t *testing.T) {
	b := fullBundle()
	b.ToolsGuides = nil
	out := map[string]any{}
	ApplyContent(out, b)
	if _, ok := out["optional_tools_section"]; ok {
		t.Fatalf("expected no optional_tools_section when tools guide missing")
	}
}

func TestApplyContent_EmptyToolsBlocksOmitSection(t *testing.T) {
	b := fullBundle()
	b.ToolsGuides = map[string]any{
		"collapsed_by_default": true,
		"guide_bullets":        []any{},
		"efficiency_items":     []any{},
	}
	out := map[string]any{}
	ApplyContent(out, b)
	if _, ok := out["optional_tools_section"]; ok {
		t.Fatalf("expected no optional_tools_section when blocks are empty")
	}
}

func TestApplyContent_RiskFallbackUsesDisclaimer(t *testing.T) {
	b := fullBundle()
	b.Problem = map[string]any{"id": "night_meow"}
	out := map[string]any{}
	ApplyContent(out, b)
	risk := asMap(t, out["risk_level"])
	msg, _ := risk["message"].(string)
	if !strings.Contains(msg, "不构成医疗诊断") {
		t.Fatalf("expected fallback disclaimer, got %q", msg)
	}
}

func TestApplyDegradedSuggestions_AddsTop3(t *testing.T) {
	out := map[string]any{}
	ApplyDegradedSuggestions(out, fullBundle())

	sugs := asList(t, out["suggestions"])
	if len(sugs) != 3 {
		t.Fatalf("expected 3 degraded suggestions, got %d", len(sugs))
	}
	if asMap(t, sugs[0])["id"] != "s_high" {
		t.Fatalf("unexpected first degraded suggestion: %v", sugs[0])
	}
	for _, k := range []string{"followup_question", "risk_level", "optional_tools_section", "share_asset"} {
		if _, ok := out[k]; ok {
			t.Fatalf("degraded fallback should not add %s", k)
		}
	}
}

func TestApplyDegradedSuggestions_DoesNotOverwrite(t *testing.T) {
	existing := []any{map[string]any{"id": "upstream"}}
	out := map[string]any{"suggestions": existing}
	ApplyDegradedSuggestions(out, fullBundle())
	if len(out["suggestions"].([]any)) != 1 {
		t.Fatalf("suggestions should not be overwritten")
	}
}

func TestApplyDegradedSuggestions_EmptyBundleAddsNothing(t *testing.T) {
	out := map[string]any{}
	ApplyDegradedSuggestions(out, content.Bundle{})
	if len(out) != 0 {
		t.Fatalf("expected empty response, got %v", out)
	}
}
