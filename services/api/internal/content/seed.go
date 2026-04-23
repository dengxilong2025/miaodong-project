package content

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
)

type Seed struct {
	Meta     map[string]any   `json:"meta"`
	Problems []Problem        `json:"problems"`
	Questions []any           `json:"questions"`
	Suggestions []any         `json:"suggestions"`
}

type Problem struct {
	ID      string   `json:"id"`
	Title   string   `json:"title"`
	Summary string   `json:"summary"`
	Tags    []string `json:"tags"`
}

func LoadSeed(seedPath string) (*Seed, error) {
	b, err := os.ReadFile(seedPath)
	if err != nil {
		return nil, err
	}
	var s Seed
	if err := json.Unmarshal(b, &s); err != nil {
		return nil, err
	}
	return &s, nil
}

// DefaultSeedPath 尝试从常见路径定位种子数据。
// 约定：运行目录在 services/api/ 时，种子文件位于 ../../data/seed/miaodong-seed-v1.json
func DefaultSeedPath() (string, error) {
	p := filepath.Clean(filepath.Join("..", "..", "data", "seed", "miaodong-seed-v1.json"))
	if _, err := os.Stat(p); err == nil {
		return p, nil
	}
	return "", fmt.Errorf("seed not found at %s", p)
}

