# Admin Audit + Metrics Compare Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为喵懂补齐“审计日志可见 + 发布后 24h/72h 指标对比”闭环：新增 `/admin/audit` 与 `/admin/metrics/compare` 后端接口，并将 Admin Web 拆分为可维护结构，Dashboard 展示对比卡片，Audit 页展示真实日志。

**Architecture:** 后端采用 store/service 解耦：`internal/audit` 与 `internal/metrics` 提供纯逻辑/SQL 聚合能力；HTTP handlers 仅负责鉴权、参数解析与 JSON 输出。前端保持无构建链但拆分为 `lib` 与 `pages` 多文件，入口 `admin.js` 负责路由与挂载。

**Tech Stack:** Go net/http + Postgres(sql) + Vanilla JS（多 script 文件，无 bundler）。

---

## 0. File Map

**Create (Go - audit):**
- `services/api/internal/audit/store.go`
- `services/api/internal/http/handlers/admin_audit_list.go`

**Create (Go - metrics):**
- `services/api/internal/metrics/aggregate.go`
- `services/api/internal/http/handlers/admin_metrics_compare.go`

**Modify (Go):**
- `services/api/internal/http/handlers/admin_metrics.go`（改为复用 aggregate）
- `services/api/internal/http/router.go`（挂载 `/admin/audit` 与 `/admin/metrics/compare`）

**Create (Admin Web JS split):**
- `apps/admin/lib/api.js`
- `apps/admin/pages/dashboard.js`
- `apps/admin/pages/audit.js`

**Modify (Admin Web):**
- `apps/admin/index.html`（增加新 script 引入顺序）
- `apps/admin/admin.js`（改为入口 + 路由调度）
- `apps/admin/admin.css`（补充 audit/compare 卡片所需样式）

**Docs:**
- `docs/superpowers/specs/2026-04-24-admin-audit-and-metrics-compare-design.md`（已存在）

---

## Task 1: 后端 /admin/audit（store 解耦）

**Files:**
- Create: `services/api/internal/audit/store.go`
- Create: `services/api/internal/http/handlers/admin_audit_list.go`
- Modify: `services/api/internal/http/router.go`
- Test: `services/api/internal/http/handlers/admin_audit_list_test.go`

- [ ] **Step 1: 写失败测试：未授权返回 401**

```go
package handlers

import (
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestAdminAudit_Unauthorized(t *testing.T) {
	req := httptest.NewRequest(http.MethodGet, "/admin/audit", nil)
	w := httptest.NewRecorder()
	AdminAudit(w, req)
	if w.Code != http.StatusUnauthorized {
		t.Fatalf("expected 401, got %d", w.Code)
	}
}
```

- [ ] **Step 2: 运行测试确认失败**

Run:
```bash
cd services/api
go test ./... -run TestAdminAudit_Unauthorized
```
Expected: FAIL（AdminAudit 未实现）

- [ ] **Step 3: 新增 audit store（只负责 SQL + struct）**

`services/api/internal/audit/store.go`

```go
package audit

import (
	"context"
	"database/sql"
	"encoding/json"
	"time"
)

type Item struct {
	ID         int64           `json:"id"`
	Actor      string          `json:"actor"`
	Action     string          `json:"action"`
	EntityType string          `json:"entity_type"`
	EntityID   *string         `json:"entity_id,omitempty"`
	Diff       json.RawMessage `json:"diff"`
	CreatedAt  time.Time       `json:"created_at"`
}

func List(ctx context.Context, db *sql.DB, limit int) ([]Item, error) {
	if limit <= 0 {
		limit = 200
	}
	if limit > 500 {
		limit = 500
	}
	rows, err := db.QueryContext(ctx,
		`select id, actor, action, entity_type, entity_id, diff, created_at
		   from audit_log
		  order by created_at desc
		  limit $1`, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := make([]Item, 0, limit)
	for rows.Next() {
		var it Item
		var entityID sql.NullString
		if err := rows.Scan(&it.ID, &it.Actor, &it.Action, &it.EntityType, &entityID, &it.Diff, &it.CreatedAt); err != nil {
			return nil, err
		}
		if entityID.Valid {
			v := entityID.String
			it.EntityID = &v
		}
		out = append(out, it)
	}
	return out, nil
}
```

- [ ] **Step 4: 新增 handler（仅做鉴权 + 参数解析 + JSON 输出）**

`services/api/internal/http/handlers/admin_audit_list.go`

```go
package handlers

import (
	"encoding/json"
	"net/http"
	"strconv"

	"github.com/dengxilong2025/miaodong-project/services/api/internal/audit"
	"github.com/dengxilong2025/miaodong-project/services/api/internal/db"
)

func AdminAudit(w http.ResponseWriter, r *http.Request) {
	if !requireAdmin(w, r) {
		return
	}
	if r.Method != http.MethodGet {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	limit, _ := strconv.Atoi(r.URL.Query().Get("limit"))

	conn, err := db.Open()
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	defer conn.Close()

	items, err := audit.List(r.Context(), conn, limit)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	_ = json.NewEncoder(w).Encode(map[string]any{"items": items})
}
```

- [ ] **Step 5: 挂载路由**

在 `services/api/internal/http/router.go` 增加：
```go
mux.HandleFunc("/admin/audit", handlers.AdminAudit)
```

- [ ] **Step 6: 补充一个“空列表”测试（不依赖 DB）**

说明：当前仓库 CI 跑 e2e-db，但 go unit test 不应依赖真实数据库。
因此仅测试“未授权 401”和“method not allowed”路径即可（数据库集成测试放到 e2e-db 由后续任务覆盖）。

```go
func TestAdminAudit_MethodNotAllowed(t *testing.T) {
	req := httptest.NewRequest(http.MethodPost, "/admin/audit", nil)
	req.Header.Set("X-Admin-Token", "dev-admin")
	w := httptest.NewRecorder()
	AdminAudit(w, req)
	if w.Code != http.StatusMethodNotAllowed {
		t.Fatalf("expected 405, got %d", w.Code)
	}
}
```

- [ ] **Step 7: 运行 go test**

Run:
```bash
cd services/api
go test ./...
```
Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add services/api/internal/audit services/api/internal/http/handlers/admin_audit_list.go services/api/internal/http/handlers/admin_audit_list_test.go services/api/internal/http/router.go
git commit -m "feat(admin): add audit list endpoint"
```

---

## Task 2: 后端 metrics 聚合解耦 + /admin/metrics/compare

**Files:**
- Create: `services/api/internal/metrics/aggregate.go`
- Create: `services/api/internal/http/handlers/admin_metrics_compare.go`
- Modify: `services/api/internal/http/handlers/admin_metrics.go`
- Modify: `services/api/internal/http/router.go`
- Test: `services/api/internal/metrics/aggregate_test.go`

- [ ] **Step 1: 写 aggregate 的纯函数单测（不连 DB）**

我们把“delta 计算”做成纯函数，保证可测。

```go
package metrics

import "testing"

func TestDelta(t *testing.T) {
	a := Result{EventsTotal: 100, DistinctUsers: 10, Feedback: Feedback{HelpfulRate: 0.25}}
	b := Result{EventsTotal: 140, DistinctUsers: 8, Feedback: Feedback{HelpfulRate: 0.40}}
	d := Delta(a, b)
	if d.EventsTotal != 40 {
		t.Fatalf("events delta wrong: %d", d.EventsTotal)
	}
	if d.DistinctUsers != -2 {
		t.Fatalf("uv delta wrong: %d", d.DistinctUsers)
	}
	if d.FeedbackHelpfulRate <= 0.14 || d.FeedbackHelpfulRate >= 0.16 {
		t.Fatalf("helpful_rate delta wrong: %f", d.FeedbackHelpfulRate)
	}
}
```

- [ ] **Step 2: 实现 metrics.Aggregate（复用现有 SQL）**

`services/api/internal/metrics/aggregate.go`

需要定义结构，保持与 `/admin/metrics` 输出一致：

```go
package metrics

import (
	"context"
	"database/sql"
)

type ByEventItem struct {
	EventName string `json:"event_name"`
	Count     int64  `json:"count"`
}

type Feedback struct {
	Total       int64   `json:"total"`
	Helpful     int64   `json:"helpful"`
	HelpfulRate float64 `json:"helpful_rate"`
}

type Result struct {
	EventsTotal    int64        `json:"events_total"`
	DistinctUsers  int64        `json:"distinct_users"`
	ByEventName    []ByEventItem `json:"by_event_name"`
	Feedback       Feedback     `json:"feedback"`
}

type DeltaResult struct {
	EventsTotal         int64   `json:"events_total"`
	DistinctUsers       int64   `json:"distinct_users"`
	FeedbackHelpfulRate float64 `json:"feedback_helpful_rate"`
}

func Delta(a, b Result) DeltaResult {
	return DeltaResult{
		EventsTotal:         b.EventsTotal - a.EventsTotal,
		DistinctUsers:       b.DistinctUsers - a.DistinctUsers,
		FeedbackHelpfulRate: b.Feedback.HelpfulRate - a.Feedback.HelpfulRate,
	}
}

func Aggregate(ctx context.Context, db *sql.DB, from, to int64, problemID string) (Result, error) {
	// 复用当前 handlers/admin_metrics.go 内的 3 段 SQL
	// 返回 Result
	var out Result
	// ...实现略（实现时将现有 SQL 搬入这里）
	return out, nil
}
```

- [ ] **Step 3: 修改 AdminMetrics，改为调用 metrics.Aggregate**

`services/api/internal/http/handlers/admin_metrics.go`：
- 保留 window/filter 字段输出（兼容现有前端）
- 具体统计从 `metrics.Aggregate()` 取值

- [ ] **Step 4: 新增 AdminMetricsCompare handler**

`services/api/internal/http/handlers/admin_metrics_compare.go`

行为：
- 解析 `from_a/to_a/from_b/to_b/problem_id`
- 依次调用 `Aggregate()` 得到 `a/b`
- 返回 `delta := metrics.Delta(a,b)`

- [ ] **Step 5: router 挂载**

在 `router.go` 增加：
```go
mux.HandleFunc("/admin/metrics/compare", handlers.AdminMetricsCompare)
```

- [ ] **Step 6: go test**

Run:
```bash
cd services/api
go test ./...
```

- [ ] **Step 7: Commit**

```bash
git add services/api/internal/metrics services/api/internal/http/handlers/admin_metrics.go services/api/internal/http/handlers/admin_metrics_compare.go services/api/internal/http/router.go
git commit -m "feat(admin): add metrics aggregate module and compare endpoint"
```

---

## Task 3: 前端拆分（lib + pages）但不引入构建链

**Files:**
- Create: `apps/admin/lib/api.js`
- Create: `apps/admin/pages/dashboard.js`
- Create: `apps/admin/pages/audit.js`
- Modify: `apps/admin/admin.js`
- Modify: `apps/admin/index.html`

- [ ] **Step 1: 将 apiFetch/token/toast/modal 从 admin.js 抽到 lib/api.js**

要求：
- 对外暴露：`getToken/setToken/clearToken/apiFetch/showToast/openModal/closeModal/escapeHTML/format...`
- 使用 `window.AdminLib = {...}` 的方式导出（无模块系统）

- [ ] **Step 2: 将 Dashboard 页面渲染抽到 pages/dashboard.js**

要求：
- `window.AdminPages.dashboard = { render(el) }`
- 内部调用：
  - `GET /admin/releases`
  - `GET /admin/metrics/compare` 生成 24h 与 72h 对比卡片

- [ ] **Step 3: 将 Audit 页面抽到 pages/audit.js**

要求：
- `window.AdminPages.audit = { render(el) }`
- 调用 `GET /admin/audit?limit=200`
- 展示表格 + 本地 search 过滤 + diff 折叠展开

- [ ] **Step 4: 更新入口 admin.js**

入口只保留：
- 路由解析
- shell 渲染（侧边栏/顶部栏容器）
- 调度：`AdminPages[route].render(container)`

- [ ] **Step 5: 更新 index.html script 顺序**

```html
<script src="./lib/api.js"></script>
<script src="./pages/dashboard.js"></script>
<script src="./pages/audit.js"></script>
<script src="./admin.js"></script>
```

- [ ] **Step 6: 手动烟测**

Run:
```bash
cd services/api && go run ./cmd/api
```
访问：
`http://localhost:8080/admin/ui/#/dashboard`

Expected:
- 登录仍正常
- Dashboard 显示 compare 卡片
- Audit 页能显示日志（如果 DB 有数据；否则显示空态）

- [ ] **Step 7: Commit**

```bash
git add apps/admin/index.html apps/admin/admin.js apps/admin/lib/api.js apps/admin/pages/dashboard.js apps/admin/pages/audit.js
git commit -m "refactor(admin-ui): split lib and pages modules"
```

---

## Task 4: Dashboard 增加 24h/72h 对比卡（使用 /admin/metrics/compare）

**Files:**
- Modify: `apps/admin/pages/dashboard.js`
- Modify: `apps/admin/admin.css`

- [ ] **Step 1: 实现 compare 调用与渲染组件**

窗口计算：
- 24h：A=[now-48h, now-24h] B=[now-24h, now]
- 72h：A=[now-144h, now-72h] B=[now-72h, now]

- [ ] **Step 2: 渲染 current + delta（↑↓）**

展示：
- events_total / distinct_users / helpful_rate

- [ ] **Step 3: 样式补齐**

新增：
- `.compare-grid`、`.compare-card`、`.delta-up/.delta-down`

- [ ] **Step 4: Commit**

```bash
git add apps/admin/pages/dashboard.js apps/admin/admin.css
git commit -m "feat(admin-ui): add 24h/72h metrics compare cards"
```

---

## Task 5: Audit 页接入真实接口 + 本地过滤

**Files:**
- Modify: `apps/admin/pages/audit.js`
- Modify: `apps/admin/admin.css`

- [ ] **Step 1: 接口对接**
- `GET /admin/audit?limit=200`

- [ ] **Step 2: 本地过滤**
- 输入框过滤 actor/action/entity_type/entity_id

- [ ] **Step 3: diff 折叠**
- 默认折叠，点击展开 pretty JSON

- [ ] **Step 4: Commit**

```bash
git add apps/admin/pages/audit.js apps/admin/admin.css
git commit -m "feat(admin-ui): show audit log list with local filter"
```

---

## Task 6: 全量验证 + nightly

**Files:**
- Modify: `scripts/package.sh`（若需额外排除项）

- [ ] **Step 1: Repo 校验**
Run: `python3 scripts/ci/validate_repo.py`

- [ ] **Step 2: Go 测试**
Run: `cd services/api && go test ./...`

- [ ] **Step 3: GitHub Actions**
观察 CI：validate / go-api / python-inference / e2e-db 通过

- [ ] **Step 4: 生成 nightly**
Run: `./scripts/package.sh /workspace/miaodong-nightly.zip`

