package main

import (
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
	// MVP：先导入 problems（questions/suggestions/tools_guides 后续补齐）
	// 采用 SQL 文本生成方式，避免引入数据库驱动依赖，方便 CI/本机用 psql 执行：
	//   go run ./cmd/seed --out /tmp/seed.sql
	//   psql "$DSN" -f /tmp/seed.sql
	out := "begin;\n"
	for _, p := range s.Problems {
		tagsJSON := toJSON(p.Tags)
		out += fmt.Sprintf(
			"insert into problems (id, title, summary, tags, status) values (%s, %s, %s, %s::jsonb, 'published')\n"+
				"on conflict (id) do update set title=excluded.title, summary=excluded.summary, tags=excluded.tags, status=excluded.status, updated_at=now();\n",
			sqlQuote(p.ID),
			sqlQuote(p.Title),
			sqlQuote(p.Summary),
			sqlQuote(tagsJSON),
		)
	}
	out += "commit;\n"
	return out, nil
}

func toJSON(tags []string) string {
	// 手写最小 JSON（只用于 tags:string[]）
	out := "["
	for i, s := range tags {
		if i > 0 {
			out += ","
		}
		out += fmt.Sprintf("%q", s)
	}
	out += "]"
	return out
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
