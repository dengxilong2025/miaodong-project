# Admin Audit v0.2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 `/admin/audit` 升级为 v0.2：支持服务端筛选（actor/action/entity_type/entity_id/from/to）与游标分页（cursor=id），同时升级 Admin Web Audit 页为“筛选 + 加载更多”，并在 GitHub Actions `e2e-db` 中增加端到端系统测试（触发审计→读取审计→校验字段）。

**Architecture:** 后端继续保持分层：`internal/audit`（store：SQL + 数据结构 + 参数 clamp）与 `handlers`（HTTP 胶水：鉴权/参数解析/响应）。前端保持无构建链，改动集中在 `pages/audit.js`。系统测试放在 `e2e-db` job 的一个 shell step 中，避免 unit test 依赖真实 DB。

**Tech Stack:** Go net/http + Postgres(sql) + Vanilla JS + GitHub Actions。

---

## 0. File Map

**Modify (Go store/handler):**
- `services/api/internal/audit/store.go`（新增 ListParams + ListPage）
- `services/api/internal/http/handlers/admin_audit_list.go`（支持 query 参数与 next_cursor）

**Create (Go tests):**
- `services/api/internal/http/handlers/admin_audit_v02_test.go`（query 解析/limit clamp/405/401 等，不连 DB）

**Modify (Admin Web):**
- `apps/admin/pages/audit.js`（增加筛选面板、分页加载更多、保留本地 search）
- `apps/admin/admin.css`（筛选条与加载更多按钮样式）

**Modify (CI e2e):**
- `.github/workflows/ci.yml`（e2e-db 增加“触发审计→读取审计→断言”的步骤）

---

## Task 1: 后端 store 层扩展（ListParams + ListPage）

**Files:**
- Modify: `services/api/internal/audit/store.go`
- Test (pure): `services/api/internal/audit/store_params_test.go`

- [ ] **Step 1: 新增 ListParams 与 clamp 纯函数（先写单测）**

创建测试文件 `services/api/internal/audit/store_params_test.go`：

```go
package audit

import "testing"

func TestClampLimit(t *testing.T) {
	if clampLimit(0) != 200 {
		t.Fatalf("expected default 200")
	}
	if clampLimit(999) != 500 {
		t.Fatalf("expected max 500")
	}
	if clampLimit(10) != 10 {
		t.Fatalf("expected 10")
	}
}
```

- [ ] **Step 2: 在 store.go 中实现 clampLimit 与 ListParams**

在 `services/api/internal/audit/store.go` 增加（保持原 Item 结构不变）：

```go
type ListParams struct {
	Limit      int
	Cursor     *int64
	Actor      string
	Action     string
	EntityType string
	EntityID   string
	FromMs     *int64
	ToMs       *int64
}

func clampLimit(limit int) int {
	if limit <= 0 {
		return 200
	}
	if limit > 500 {
		return 500
	}
	return limit
}
```

- [ ] **Step 3: 实现 ListPage(ctx, db, params)**

要求：
- order by `created_at desc, id desc`
- cursor 语义：`id < cursor`
- from/to：将 ms 转换为 `time.UnixMilli(...)` 后过滤 `created_at`
- 字段筛选：精确匹配（为空则不加）
- 计算 nextCursor：若 items 非空，取最后一个 item.ID；否则 nil

实现骨架（最终实现需完整、可编译）：

```go
func ListPage(ctx context.Context, db *sql.DB, p ListParams) ([]Item, *int64, error) {
	limit := clampLimit(p.Limit)

	where := make([]string, 0, 8)
	args := make([]any, 0, 8)
	n := 1
	add := func(cond string, v any) {
		where = append(where, cond)
		args = append(args, v)
		n++
	}

	if p.Cursor != nil {
		add("id < $"+itoa(n), *p.Cursor)
	}
	if p.Actor != "" {
		add("actor = $"+itoa(n), p.Actor)
	}
	if p.Action != "" {
		add("action = $"+itoa(n), p.Action)
	}
	if p.EntityType != "" {
		add("entity_type = $"+itoa(n), p.EntityType)
	}
	if p.EntityID != "" {
		add("entity_id = $"+itoa(n), p.EntityID)
	}
	if p.FromMs != nil {
		add("created_at >= $"+itoa(n), time.UnixMilli(*p.FromMs))
	}
	if p.ToMs != nil {
		add("created_at <= $"+itoa(n), time.UnixMilli(*p.ToMs))
	}

	q := `select id, actor, action, entity_type, entity_id, diff, created_at
	        from audit_log`
	if len(where) > 0 {
		q += " where " + strings.Join(where, " and ")
	}
	q += " order by created_at desc, id desc limit $" + itoa(n)
	args = append(args, limit)

	// rows scan 同 v0.1 List()
	// nextCursor 取最后一条
}
```

（实现时可复用现有 List() 的 scan 逻辑，或直接用 ListPage 替代 List）

- [ ] **Step 4: 运行 store 的单测**

Run:
```bash
cd services/api
go test ./... -run TestClampLimit
```
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add services/api/internal/audit/store.go services/api/internal/audit/store_params_test.go
git commit -m "feat(audit): add ListParams and cursor pagination store"
```

---

## Task 2: 后端 handler 扩展（query 参数 + next_cursor 输出）

**Files:**
- Modify: `services/api/internal/http/handlers/admin_audit_list.go`
- Create: `services/api/internal/http/handlers/admin_audit_v02_test.go`

- [ ] **Step 1: 写 handler 的单测（不连 DB）**

目标：覆盖解析与边界，不触发 DB 连接（因此只测 401/405 与 query clamp 的辅助函数）。

建议在 handler 内部新增纯函数：
- `parseAuditQuery(r *http.Request) audit.ListParams`

测试文件 `admin_audit_v02_test.go`：

```go
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
		t.Fatalf("expected raw limit 999 (clamp happens in store)")
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
```

- [ ] **Step 2: 在 handler 中实现 parseAuditQuery + 使用 store.ListPage**

修改 `admin_audit_list.go`：
- 解析 params（非法数字则忽略该字段）
- 调用：
  - `items, next, err := audit.ListPage(ctx, conn, params)`
- 输出 JSON：
  - `{"items": items, "next_cursor": next}`

（next_cursor 为 nil 时，JSON 中输出 `null`）

- [ ] **Step 3: go test**

Run:
```bash
cd services/api
go test ./...
```
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add services/api/internal/http/handlers/admin_audit_list.go services/api/internal/http/handlers/admin_audit_v02_test.go
git commit -m "feat(admin): audit query filters and cursor pagination"
```

---

## Task 3: Admin Web Audit 页面（筛选 + 加载更多）

**Files:**
- Modify: `apps/admin/pages/audit.js`
- Modify: `apps/admin/admin.css`

- [ ] **Step 1: 扩展 fetchAudit 支持 params 与 cursor**

在 `pages/audit.js` 中将：
```js
apiFetch("/admin/audit?limit=200")
```
改为构建 query：

```js
function buildAuditURL(params) {
  const p = new URLSearchParams();
  p.set("limit", String(params.limit || 200));
  if (params.cursor) p.set("cursor", String(params.cursor));
  if (params.actor) p.set("actor", params.actor);
  if (params.action) p.set("action", params.action);
  if (params.entity_type) p.set("entity_type", params.entity_type);
  if (params.entity_id) p.set("entity_id", params.entity_id);
  if (params.from) p.set("from", String(params.from));
  if (params.to) p.set("to", String(params.to));
  return `/admin/audit?${p.toString()}`;
}
```

- [ ] **Step 2: 增加筛选 UI**

页面 header 增加一排输入框：
- actor / action / entity_type / entity_id
- from/to（ms，允许留空；提供快捷按钮“24h/7d”只是前端填值）

点击“查询”：
- state.cursor = null
- state.items = []
- 拉第一页并渲染

- [ ] **Step 3: 增加“加载更多”**

当后端返回 `next_cursor`：
- 页面显示“加载更多”按钮
- 点击后传 `cursor=next_cursor` 拉下一页，并 `concat` 到 state.items
- 若 next_cursor 为 null：按钮隐藏，显示“喵～到底啦”

- [ ] **Step 4: 本地 search 仍保留为二次过滤**

保留现有 search 输入框逻辑，但在“筛选条件”之外作为二次过滤。

- [ ] **Step 5: Commit**

```bash
git add apps/admin/pages/audit.js apps/admin/admin.css
git commit -m "feat(admin-ui): audit server filters and load more"
```

---

## Task 4: e2e-db 端到端系统测试（触发审计 → 查询审计 → 断言）

**Files:**
- Modify: `.github/workflows/ci.yml`

- [ ] **Step 1: 在 e2e-db job 的 seed 后增加一段 shell step**

新增 step 名称：`E2E: audit log`

示例脚本（注意：API 服务在 e2e-db job 中尚未启动，需要用 `go run` 临时起一个后台服务）：

```bash
export MIAODONG_DSN="postgres://postgres:postgres@localhost:5432/miaodong?sslmode=disable"
export MIAODONG_ADMIN_TOKEN="dev-admin"

# 1) 启动 API（后台）
cd services/api
nohup go run ./cmd/api >/tmp/api.log 2>&1 &

# 2) 等待健康检查
for i in {1..30}; do
  if curl -sf http://localhost:8080/v1/health >/dev/null; then
    echo "api ready"
    break
  fi
  sleep 1
done

# 3) 触发一次审计：发布
curl -sS -X POST http://localhost:8080/admin/release \
  -H "Content-Type: application/json" \
  -H "X-Admin-Token: dev-admin" \
  -d '{"actor":"ci","rollout_percent":100,"notes":"ci audit test"}' >/tmp/release.json

# 4) 查询审计
curl -sS http://localhost:8080/admin/audit?limit=10 \
  -H "X-Admin-Token: dev-admin" > /tmp/audit.json

python3 - <<'PY'
import json,sys
data=json.load(open("/tmp/audit.json"))
items=data.get("items",[])
assert len(items)>=1, "audit items empty"
it=items[0]
for k in ["id","actor","action","entity_type","created_at"]:
  assert k in it, f"missing {k}"
print("audit ok, first id=", it["id"])
PY
```

> 说明：这是关键里程碑测试。它验证了：migrations/seed OK → API 可起 → 发布会写 audit_log → /admin/audit 可读回。

- [ ] **Step 2: Commit**

```bash
git add .github/workflows/ci.yml
git commit -m "test(ci): add e2e audit log check"
```

---

## Task 5: 全量验证 + nightly

- [ ] Run: `python3 scripts/ci/validate_repo.py`
- [ ] Run: `cd services/api && go test ./...`
- [ ] 观察 GitHub Actions：validate / go-api / python-inference / e2e-db 全绿
- [ ] nightly：`./scripts/package.sh /workspace/miaodong-nightly.zip`

