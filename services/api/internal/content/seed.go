package content

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"runtime"
)

type Seed struct {
	// MetaParent 保存原始JSON顶层对象（用于读取尚未建模字段，如 growth_modules）
	MetaParent map[string]any `json:"-"`

	Meta        map[string]any `json:"meta"`
	Problems    []Problem      `json:"problems"`
	Questions   []Question     `json:"questions"`
	Suggestions []Suggestion   `json:"suggestions"`
	ToolsGuides []ToolsGuide   `json:"tools_guides"`
}

type Problem struct {
	ID             string            `json:"id"`
	Title          string            `json:"title"`
	Summary        string            `json:"summary"`
	Tags           []string          `json:"tags"`
	CauseFramework []string          `json:"cause_framework"`
	RetestPlan72h  []string          `json:"retest_plan_72h"`
	RiskLevelCopy  map[string]string `json:"risk_level_copy"`
}

type Question struct {
	ID        string `json:"id"`
	ProblemID string `json:"problem_id"`
	Priority  int    `json:"priority"`
	Text      string `json:"text"`
	Type      string `json:"type"`
	Options   any    `json:"options"`
	Condition any    `json:"condition"`
}

type Suggestion struct {
	ID                  string `json:"id"`
	ProblemID           string `json:"problem_id"`
	Priority            int    `json:"priority"`
	Title               string `json:"title"`
	Steps               any    `json:"steps"`
	ExpectedWindowHours int    `json:"expected_window_hours"`
	RetestTip           string `json:"retest_tip"`
	Condition           any    `json:"condition"`
}

type ToolsGuide struct {
	ID                 string `json:"id"`
	ProblemID          string `json:"problem_id"`
	CollapsedByDefault bool   `json:"collapsed_by_default"`
	GuideBullets       any    `json:"guide_bullets"`
	EfficiencyItems    any    `json:"efficiency_items"`
}

func LoadSeed(seedPath string) (*Seed, error) {
	b, err := os.ReadFile(seedPath)
	if err != nil {
		return nil, err
	}

	// 先读顶层raw，保留完整字段以便做校验/导入（避免模型不全）
	var raw map[string]any
	_ = json.Unmarshal(b, &raw)

	var s Seed
	if err := json.Unmarshal(b, &s); err != nil {
		return nil, err
	}
	s.MetaParent = raw
	return &s, nil
}

// DefaultSeedPath 尝试从常见路径定位种子数据。
// 约定：种子文件位于仓库根目录下的 data/seed/miaodong-seed-v1.json。
// 为了让 CI/go test 的工作目录不影响定位，这里基于当前文件路径计算仓库根目录。
func DefaultSeedPath() (string, error) {
	_, thisFile, _, ok := runtime.Caller(0)
	if !ok {
		return "", fmt.Errorf("runtime.Caller failed")
	}
	// thisFile: .../services/api/internal/content/seed.go
	root := filepath.Clean(filepath.Join(filepath.Dir(thisFile), "..", "..", "..", ".."))
	p := filepath.Join(root, "data", "seed", "miaodong-seed-v1.json")
	if _, err := os.Stat(p); err == nil {
		return p, nil
	}
	return "", fmt.Errorf("seed not found at %s", p)
}
