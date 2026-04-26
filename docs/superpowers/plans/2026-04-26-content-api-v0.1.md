# Content API v0.1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 实现 App 可用的内容读取 API：`GET /v1/problems`、`GET /v1/problems/{id}`、`GET /v1/templates/result`，并支持 `content_version` 解析/回填；代码分层为 resolver/repo/handler；补齐 unit + e2e-db 系统测试防回归。

**Architecture:** 在 `internal/content` 中新增 `Resolver`（决定 content_version）与 `Repo`（封装 SQL 查询与 bundle 组装）。HTTP handlers 只做参数解析→resolve→repo→JSON。e2e-db 通过真实 Postgres + seed 数据校验 Top3 可查。

**Tech Stack:** Go net/http + Postgres(sql) + GitHub Actions e2e-db。

---

## 0. File Map

**Create:**
- `services/api/internal/content/version.go`（ResolveContentVersion + parse helpers）
- `services/api/internal/content/repo.go`（ListProblems / GetProblemBundle / GetResultTemplate）
- `services/api/internal/http/handlers/content.go`（/v1/problems /v1/problems/{id} /v1/templates/result handlers）
- `services/api/internal/http/handlers/content_test.go`（unit：400/404/结构回填，不连 DB）

**Modify:**
- `services/api/internal/http/router.go`（挂载路由）
- `.github/workflows/ci.yml`（e2e-db 新增内容读取检查 step）

---

## Task 1: content_version 解析与 resolver（纯函数可测）

**Files:**
- Create: `services/api/internal/content/version.go`
- Create: `services/api/internal/content/version_test.go`

- [ ] **Step 1: 写失败测试：非法 content_version 返回错误**

`services/api/internal/content/version_test.go`

```go
package content

import "testing"

func TestParseContentVersion_Invalid(t *testing.T) {
	_, err := ParseContentVersion("abc")
	if err == nil {
		t.Fatalf("expected error")
	}
}

func TestParseContentVersion_EmptyMeansNil(t *testing.T) {
	v, err := ParseContentVersion("")
	if err != nil || v != nil {
		t.Fatalf("expected nil, got %v err=%v", v, err)
	}
}
```

- [ ] **Step 2: 实现 ParseContentVersion + ResolveContentVersion**

`services/api/internal/content/version.go`

```go
package content

import (
	"context"
	"fmt"
	"strconv"
)

func ParseContentVersion(s string) (*int, error) {
	if s == "" {
		return nil, nil
	}
	n, err := strconv.Atoi(s)
	if err != nil || n <= 0 {
		return nil, fmt.Errorf("invalid content_version")
	}
	return &n, nil
}

func ResolveContentVersion(ctx context.Context, userID string, explicit *int) (int, error) {
	if explicit != nil {
		return *explicit, nil
	}
	// v0.1: 固定 1（后续接 releases/runtime_config）
	return 1, nil
}
```

- [ ] **Step 3: 运行单测**

Run:
```bash
cd services/api
go test ./... -run TestParseContentVersion
```
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add services/api/internal/content/version.go services/api/internal/content/version_test.go
git commit -m "feat(content): add content_version parsing and resolver"
```

---

## Task 2: Repo（ListProblems / GetProblemBundle / GetResultTemplate）

**Files:**
- Create: `services/api/internal/content/repo.go`

- [ ] **Step 1: 定义 DTO（summary / bundle）**

在 `repo.go` 内定义：

```go
type ProblemSummary struct {
	ID      string   `json:"id"`
	Title   string   `json:"title"`
	Summary string   `json:"summary"`
	Tags    []string `json:"tags"`
}

type Bundle struct {
	Problem     map[string]any   `json:"problem"`
	Questions   []map[string]any `json:"questions"`
	Suggestions []map[string]any `json:"suggestions"`
	ToolsGuides map[string]any   `json:"tools_guides,omitempty"`
}
```

> 说明：为快速落地 v0.1，repo 使用 `map[string]any` 承接 jsonb 字段（tags/options/steps 等），避免过早引入大量 struct。

- [ ] **Step 2: 实现 ListProblems(ctx, db, limit)**

SQL：
- 从 `problems` 表读取 `id/title/summary/tags`
- order by id（或 status+updated_at）保持稳定
- limit clamp：默认 3，最大 50

```go
func ListProblems(ctx context.Context, db *sql.DB, limit int) ([]ProblemSummary, error) { ... }
```

- [ ] **Step 3: 实现 GetProblemBundle(ctx, db, problemID)**

查询：
- `problems` 取单条
- `questions` 按 priority desc
- `suggestions` 按 priority desc
- `tools_guides` 取 problem_id 对应（可能不存在）

不存在返回 `sql.ErrNoRows` 由 handler 映射 404。

- [ ] **Step 4: 实现 GetResultTemplate：v0.1 直接返回 bundle（或 bundle 子集）**

```go
func GetResultTemplate(ctx context.Context, db *sql.DB, problemID string) (Bundle, error) {
  return GetProblemBundle(ctx, db, problemID)
}
```

- [ ] **Step 5: go test（编译通过即可）**

Run:
```bash
cd services/api
go test ./...
```

- [ ] **Step 6: Commit**

```bash
git add services/api/internal/content/repo.go
git commit -m "feat(content): add repo for problems list and bundle"
```

---

## Task 3: Handlers + Router（/v1/problems, /v1/problems/{id}, /v1/templates/result）

**Files:**
- Create: `services/api/internal/http/handlers/content.go`
- Modify: `services/api/internal/http/router.go`

- [ ] **Step 1: 实现 GET /v1/problems**

行为：
- 解析 `content_version`（非法 → 400）
- resolve content_version（v0.1 返回 1 或 explicit）
- 解析 limit（默认 3，最大 50）
- 打开 DB，调用 repo `ListProblems`
- 响应：
```json
{ "content_version": <cv>, "items": [...] }
```

- [ ] **Step 2: 实现 GET /v1/problems/{id}**

行为：
- 解析/resolve content_version
- repo `GetProblemBundle`
- 不存在 → 404
- 响应：
```json
{ "content_version": <cv>, "problem":..., "questions":..., "suggestions":..., "tools_guides":... }
```

- [ ] **Step 3: 实现 GET /v1/templates/result**

行为：
- `problem_id` 必填，否则 400
- content_version 解析/resolve
- repo `GetResultTemplate`
- 响应同 bundle（顶层加 content_version）

- [ ] **Step 4: router.go 挂载**

在 router 增加：
- `/v1/problems` → `handlers.ListProblems`
- `/v1/problems/` → `handlers.GetProblem`（用路径前缀匹配）
- `/v1/templates/result` → `handlers.GetResultTemplate`

- [ ] **Step 5: go test**

Run:
```bash
cd services/api
go test ./...
```

- [ ] **Step 6: Commit**

```bash
git add services/api/internal/http/handlers/content.go services/api/internal/http/router.go
git commit -m "feat(api): add content read endpoints"
```

---

## Task 4: Unit Tests（HTTP 契约，不依赖 DB）

**Files:**
- Create: `services/api/internal/http/handlers/content_test.go`

- [ ] **Step 1: 400：非法 content_version**

```go
func TestListProblems_BadContentVersion(t *testing.T) {
  req := httptest.NewRequest(http.MethodGet, "/v1/problems?content_version=abc", nil)
  w := httptest.NewRecorder()
  ListProblems(w, req)
  if w.Code != http.StatusBadRequest { ... }
}
```

- [ ] **Step 2: 400：templates/result 缺 problem_id**
- [ ] **Step 3: 405：非 GET**

> 说明：由于 handlers 会打开 DB，unit 测试只覆盖“在 DB 之前返回”的错误路径，避免依赖真实数据库。

- [ ] **Step 4: go test**

Run:
```bash
cd services/api
go test ./... -run TestListProblems_
```

- [ ] **Step 5: Commit**

```bash
git add services/api/internal/http/handlers/content_test.go
git commit -m "test(api): add content handlers contract tests"
```

---

## Task 5: e2e-db 系统测试（seed 后 Top3 可查）

**Files:**
- Modify: `.github/workflows/ci.yml`

- [ ] **Step 1: 在 e2e-db job 新增 step：E2E: content api**

脚本：
1) 启动 API（后台）并等待 `/v1/health`
2) 调用 `GET /v1/problems?limit=3`
3) 断言 `items.length == 3` 且包含至少一个 known id（如 `night_meow`）

示例 python 断言：

```bash
curl -fsS "http://127.0.0.1:8080/v1/problems?limit=3" > /tmp/problems.json
python3 - <<'PY'
import json
d=json.load(open("/tmp/problems.json"))
items=d.get("items",[])
assert len(items)==3, items
ids=[it.get("id") for it in items]
assert any(i in ids for i in ["night_meow","cat_diarrhea","cat_vomit"]), ids
assert d.get("content_version")==1, d.get("content_version")
print("E2E content api: OK", ids)
PY
```

- [ ] **Step 2: Commit**

```bash
git add .github/workflows/ci.yml
git commit -m "test(ci): add e2e content api checks"
```

---

## Task 6: 全量验证 + nightly

- [ ] Run: `python3 scripts/ci/validate_repo.py`
- [ ] Run: `cd services/api && go test ./...`
- [ ] 观察 GitHub Actions 全绿（validate/go-api/python-inference/e2e-db）
- [ ] nightly：`./scripts/package.sh /workspace/miaodong-nightly.zip`

