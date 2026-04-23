package content

import "fmt"

// ValidateSeed 做最小一致性校验（不依赖数据库）：
// - 品牌一致：meta.app=喵懂
// - Top3问题存在
// - 增长优先级前两项一致
func ValidateSeed(s *Seed) error {
	if s == nil {
		return fmt.Errorf("seed is nil")
	}
	if s.MetaParent == nil {
		return fmt.Errorf("seed raw object missing (MetaParent nil)")
	}
	app, _ := s.Meta["app"].(string)
	if app != "喵懂" {
		return fmt.Errorf("meta.app should be 喵懂, got %q", app)
	}

	required := map[string]bool{
		"night_meow":        false,
		"always_meow":       false,
		"after_litter_meow": false,
	}
	for _, p := range s.Problems {
		if _, ok := required[p.ID]; ok {
			required[p.ID] = true
		}
	}
	for k, v := range required {
		if !v {
			return fmt.Errorf("missing top3 problem: %s", k)
		}
	}

	// growth_modules.priority_from_user should start with persona_card, achievement_system
	gm, _ := s.MetaParent["growth_modules"].(map[string]any)
	if gm == nil {
		return fmt.Errorf("missing growth_modules")
	}
	prio, ok := gm["priority_from_user"].([]any)
	if !ok || len(prio) < 2 {
		return fmt.Errorf("growth_modules.priority_from_user missing or too short")
	}
	if fmt.Sprint(prio[0]) != "persona_card" || fmt.Sprint(prio[1]) != "achievement_system" {
		return fmt.Errorf("growth_modules.priority_from_user should start with persona_card, achievement_system")
	}

	return nil
}
