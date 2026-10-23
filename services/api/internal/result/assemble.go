package result

import (
	"fmt"
	"sort"
	"strconv"

	"github.com/dengxilong2025/miaodong-project/services/api/internal/content"
)

const maxSuggestions = 3

// 与 docs/product/PRD.md 的科学克制口径一致：只做辅助理解，不做诊断。
const defaultRiskMessage = "本结果为行为与场景的辅助理解，不构成医疗诊断。"

// ApplyContent 把问题库内容组装进推理结果。
//
// 契约见 docs/tech/API_CONTRACT.md：
// - followup_question（1 题）
// - suggestions（最多 3 条）
// - risk_level（绿/黄/红；MVP 默认取问题的 green 文案）
// - optional_tools_section（默认折叠）
// - share_asset（结果卡/分享文案模板）
//
// 原则：
// - 不覆盖推理服务已经返回的同名字段（便于后续模型侧升级）
// - 内容缺失时宁可不加，也不返回半成品字段
func ApplyContent(out map[string]any, b content.Bundle) {
	if out == nil {
		return
	}

	hasContent := b.Problem != nil || len(b.Questions) > 0 || len(b.Suggestions) > 0 || b.ToolsGuides != nil
	if !hasContent {
		return
	}

	if _, ok := out["followup_question"]; !ok {
		if q := pickQuestion(b.Questions); q != nil {
			out["followup_question"] = q
		}
	}

	if _, ok := out["suggestions"]; !ok {
		if ss := pickSuggestions(b.Suggestions, maxSuggestions); len(ss) > 0 {
			out["suggestions"] = ss
		}
	}

	if _, ok := out["risk_level"]; !ok {
		if r := riskLevel(b.Problem); r != nil {
			out["risk_level"] = r
		}
	}

	if _, ok := out["optional_tools_section"]; !ok {
		if t := toolsSection(b.ToolsGuides); t != nil {
			out["optional_tools_section"] = t
		}
	}

	if _, ok := out["share_asset"]; !ok {
		out["share_asset"] = shareAsset()
	}
}

// ApplyDegradedSuggestions 实现架构文档中的降级策略：
// 推理失败时“仅问题库建议 + 安抚文案 + 再试提示”。
//
// 只补 suggestions，不补追问/风险/工具区/分享，避免降级态伪装成完整结果。
func ApplyDegradedSuggestions(out map[string]any, b content.Bundle) {
	if out == nil {
		return
	}
	if _, ok := out["suggestions"]; ok {
		return
	}
	if ss := pickSuggestions(b.Suggestions, maxSuggestions); len(ss) > 0 {
		out["suggestions"] = ss
	}
}

func pickQuestion(items []map[string]any) map[string]any {
	for _, q := range sortByPriority(items) {
		text := str(q["text"])
		if text == "" {
			continue
		}
		options := q["options"]
		if options == nil {
			options = []any{}
		}
		return map[string]any{
			"id":      str(q["id"]),
			"text":    text,
			"type":    str(q["type"]),
			"options": options,
		}
	}
	return nil
}

func pickSuggestions(items []map[string]any, limit int) []any {
	if limit <= 0 {
		return nil
	}
	out := make([]any, 0, limit)
	for _, s := range sortByPriority(items) {
		title := str(s["title"])
		if title == "" {
			continue
		}
		steps := s["steps"]
		if steps == nil {
			steps = []any{}
		}
		out = append(out, map[string]any{
			"id":                    str(s["id"]),
			"title":                 title,
			"steps":                 steps,
			"expected_window_hours": toInt(s["expected_window_hours"]),
			"retest_tip":            str(s["retest_tip"]),
		})
		if len(out) >= limit {
			break
		}
	}
	return out
}

func riskLevel(problem map[string]any) map[string]any {
	if problem == nil {
		return nil
	}
	message := ""
	if copyMap, ok := problem["risk_level_copy"].(map[string]any); ok {
		message = str(copyMap["green"])
	}
	if message == "" {
		message = defaultRiskMessage
	}
	return map[string]any{"level": "green", "message": message}
}

func toolsSection(tg map[string]any) map[string]any {
	if tg == nil {
		return nil
	}

	blocks := make([]any, 0, 2)
	if bullets := asSlice(tg["guide_bullets"]); len(bullets) > 0 {
		blocks = append(blocks, map[string]any{
			"type":    "guide",
			"title":   "避坑采购指南",
			"bullets": bullets,
		})
	}
	if items := asSlice(tg["efficiency_items"]); len(items) > 0 {
		blocks = append(blocks, map[string]any{
			"type":  "efficiency_list",
			"title": "省力工具（非必需）",
			"items": items,
		})
	}
	if len(blocks) == 0 {
		return nil
	}

	collapsed := true
	if v, ok := tg["collapsed_by_default"].(bool); ok {
		collapsed = v
	}
	return map[string]any{
		"collapsed_by_default": collapsed,
		"content_blocks":       blocks,
	}
}

func shareAsset() map[string]any {
	return content.DefaultShareAsset()
}

func sortByPriority(items []map[string]any) []map[string]any {
	out := append([]map[string]any(nil), items...)
	sort.SliceStable(out, func(i, j int) bool {
		pi, pj := toInt(out[i]["priority"]), toInt(out[j]["priority"])
		if pi != pj {
			return pi > pj
		}
		return str(out[i]["id"]) < str(out[j]["id"])
	})
	return out
}

func asSlice(v any) []any {
	if s, ok := v.([]any); ok {
		return s
	}
	return nil
}

func str(v any) string {
	if v == nil {
		return ""
	}
	if s, ok := v.(string); ok {
		return s
	}
	return fmt.Sprint(v)
}

func toInt(v any) int {
	switch n := v.(type) {
	case int:
		return n
	case int64:
		return int(n)
	case float64:
		return int(n)
	case string:
		if i, err := strconv.Atoi(n); err == nil {
			return i
		}
	}
	return 0
}
