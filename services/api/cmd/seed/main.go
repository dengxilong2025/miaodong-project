package main

import (
	"encoding/json"
	"flag"
	"fmt"
	"log"
	"os"

	"github.com/dengxilong2025/miaodong-project/services/api/internal/content"
)

func main() {
	var (
		seed = flag.String("seed", getenv("MIAODONG_SEED", ""), "Seed JSON path (default: ../../data/seed/miaodong-seed-v1.json)")
		out  = flag.String("out", "-", "Output SQL file path, '-' for stdout")
	)
	flag.Parse()

	seedPath := *seed
	if seedPath == "" {
		p, err := content.DefaultSeedPath()
		if err != nil {
			log.Fatal(err)
		}
		seedPath = p
	}

	s, err := content.LoadSeed(seedPath)
	if err != nil {
		log.Fatal(err)
	}
	if err := content.ValidateSeed(s); err != nil {
		log.Fatalf("seed validate failed: %v", err)
	}
	log.Printf("seed validated: %s", seedPath)

	sqlText, err := buildSQL(s)
	if err != nil {
		log.Fatal(err)
	}

	if *out == "-" {
		fmt.Print(sqlText)
		return
	}
	if err := os.WriteFile(*out, []byte(sqlText), 0o644); err != nil {
		log.Fatal(err)
	}
	log.Printf("seed sql written: %s", *out)
}

func buildSQL(s *content.Seed) (string, error) {
	// 全量导入内容权威层：problems / questions / suggestions / tools_guides。
	// 采用 SQL 文本生成方式，避免引入数据库驱动依赖，方便 CI/本机用 psql 执行：
	//   go run ./cmd/seed --out /tmp/seed.sql
	//   psql "$DSN" -f /tmp/seed.sql
	out := "begin;\n"

	for i, p := range s.Problems {
		priority := p.Priority
		if priority <= 0 {
			// 未显式配置时按 seed 顺序生成递减优先级（保持 PRD Top3 顺序）。
			priority = (len(s.Problems) - i) * 10
		}
		out += fmt.Sprintf(
			`insert into problems (id, title, summary, tags, priority, cause_framework, retest_plan_72h, risk_level_copy, status)
values (%s, %s, %s, %s::jsonb, %d, %s::jsonb, %s::jsonb, %s::jsonb, 'published')
on conflict (id) do update set title=excluded.title, summary=excluded.summary, tags=excluded.tags,
  priority=excluded.priority, cause_framework=excluded.cause_framework, retest_plan_72h=excluded.retest_plan_72h,
  risk_level_copy=excluded.risk_level_copy, status=excluded.status, updated_at=now();
`,
			sqlQuote(p.ID),
			sqlQuote(p.Title),
			sqlQuote(p.Summary),
			sqlQuote(jsonValue(p.Tags, "[]")),
			priority,
			sqlQuote(jsonValue(p.CauseFramework, "[]")),
			sqlQuote(jsonValue(p.RetestPlan72h, "[]")),
			sqlQuote(jsonValue(p.RiskLevelCopy, "{}")),
		)
	}

	for _, q := range s.Questions {
		out += fmt.Sprintf(
			`insert into questions (id, problem_id, priority, text, type, options, condition, status)
values (%s, %s, %d, %s, %s, %s::jsonb, %s::jsonb, 'published')
on conflict (id) do update set problem_id=excluded.problem_id, priority=excluded.priority,
  text=excluded.text, type=excluded.type, options=excluded.options, condition=excluded.condition,
  status=excluded.status, updated_at=now();
`,
			sqlQuote(q.ID),
			sqlQuote(q.ProblemID),
			q.Priority,
			sqlQuote(q.Text),
			sqlQuote(q.Type),
			sqlQuote(jsonValue(q.Options, "[]")),
			sqlQuote(jsonValue(q.Condition, "{}")),
		)
	}

	for _, sg := range s.Suggestions {
		out += fmt.Sprintf(
			`insert into suggestions (id, problem_id, priority, title, steps, expected_window_hours, retest_tip, condition, status)
values (%s, %s, %d, %s, %s::jsonb, %d, %s, %s::jsonb, 'published')
on conflict (id) do update set problem_id=excluded.problem_id, priority=excluded.priority,
  title=excluded.title, steps=excluded.steps, expected_window_hours=excluded.expected_window_hours,
  retest_tip=excluded.retest_tip, condition=excluded.condition, status=excluded.status, updated_at=now();
`,
			sqlQuote(sg.ID),
			sqlQuote(sg.ProblemID),
			sg.Priority,
			sqlQuote(sg.Title),
			sqlQuote(jsonValue(sg.Steps, "[]")),
			sg.ExpectedWindowHours,
			sqlQuote(sg.RetestTip),
			sqlQuote(jsonValue(sg.Condition, "{}")),
		)
	}

	for _, tg := range s.ToolsGuides {
		out += fmt.Sprintf(
			`insert into tools_guides (id, problem_id, collapsed_by_default, guide_bullets, efficiency_items, status)
values (%s, %s, %t, %s::jsonb, %s::jsonb, 'published')
on conflict (problem_id) do update set collapsed_by_default=excluded.collapsed_by_default,
  guide_bullets=excluded.guide_bullets, efficiency_items=excluded.efficiency_items,
  status=excluded.status, updated_at=now();
`,
			sqlQuote(tg.ID),
			sqlQuote(tg.ProblemID),
			tg.CollapsedByDefault,
			sqlQuote(jsonValue(tg.GuideBullets, "[]")),
			sqlQuote(jsonValue(tg.EfficiencyItems, "[]")),
		)
	}

	out += "commit;\n"
	return out, nil
}

// jsonValue 把任意结构序列化为 jsonb 文本；nil 使用 fallback（保证列非空）。
func jsonValue(v any, fallback string) string {
	if v == nil {
		return fallback
	}
	b, err := json.Marshal(v)
	if err != nil {
		return fallback
	}
	return string(b)
}

func sqlQuote(s string) string {
	// 单引号转义
	escaped := ""
	for _, r := range s {
		if r == '\'' {
			escaped += "''"
		} else {
			escaped += string(r)
		}
	}
	return "'" + escaped + "'"
}

func getenv(k, def string) string {
	if v := os.Getenv(k); v != "" {
		return v
	}
	return def
}
