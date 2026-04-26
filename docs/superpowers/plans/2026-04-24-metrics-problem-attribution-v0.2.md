# Metrics problem attribution v0.2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为 `/admin/metrics` 与 `/admin/metrics/compare` 增加 `attribution=strict|by_request`（默认 strict），并让 `problem_id` 过滤对 `events_total/distinct_users/by_event_name/feedback` 全口径一致生效；同时增加 e2e-db 系统测试覆盖两种口径，防回归。

**Architecture:** 继续保持解耦：在 `internal/metrics/aggregate.go` 内实现统一的 where 构造与聚合逻辑；HTTP handlers 只解析参数并调用 `Aggregate()`；e2e-db 用真实 API 写入几条 analytics_events 再断言 strict/by_request 两种结果差异。

**Tech Stack:** Go + Postgres(jsonb) + GitHub Actions e2e-db + 既有 analytics_events 埋点写入 API。

---

## 0. File Map

**Modify (metrics core):**
- `services/api/internal/metrics/aggregate.go`（支持 attribution + 全口径 problem 过滤）
- `services/api/internal/http/handlers/admin_metrics.go`（解析 attribution，回填到 filter）
- `services/api/internal/http/handlers/admin_metrics_compare.go`（解析 attribution，传给 Aggregate，回填到 a/b.filter）
- `services/api/internal/http/handlers/admin_metrics_response.go`（filter 增加 attribution）

**Create/Modify (tests):**
- `services/api/internal/http/handlers/admin_metrics_parse_test.go`（未知 attribution → strict）
- `services/api/internal/metrics/where_test.go`（纯函数：where 构造包含预期子句）

**Modify (CI e2e):**
- `.github/workflows/ci.yml`（e2e-db job 新增 “E2E: metrics attribution” step）

---

## Task 1: 定义 attribution 常量 + 解析策略（单测先行）

**Files:**
- Create: `services/api/internal/http/handlers/admin_metrics_parse_test.go`
- Modify: `services/api/internal/http/handlers/admin_metrics.go`
- Modify: `services/api/internal/http/handlers/admin_metrics_compare.go`

- [ ] **Step 1: 写失败测试：未知 attribution 默认 strict**

`services/api/internal/http/handlers/admin_metrics_parse_test.go`

```go
package handlers

import (
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestParseAttribution_DefaultStrict(t *testing.T) {
	req := httptest.NewRequest(http.MethodGet, "/admin/metrics?attribution=weird", nil)
	if got := parseAttribution(req); got != "strict" {
		t.Fatalf("expected strict, got %q", got)
	}
}
```

- [ ] **Step 2: 在 handlers 里实现 parseAttribution(req)**

在 `admin_metrics.go`（或一个共享小文件）中加入：

```go
func parseAttribution(r *http.Request) string {
	v := r.URL.Query().Get("attribution")
	if v == "by_request" {
		return "by_request"
	}
	return "strict"
}
```

并在 `/admin/metrics` 与 `/admin/metrics/compare` 两个 handler 中读取并传入 aggregate。

- [ ] **Step 3: go test**

Run:
```bash
cd services/api
go test ./... -run TestParseAttribution_DefaultStrict
```
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add services/api/internal/http/handlers/admin_metrics.go services/api/internal/http/handlers/admin_metrics_compare.go services/api/internal/http/handlers/admin_metrics_parse_test.go
git commit -m "test(metrics): default attribution to strict"
```

---

## Task 2: metrics.Aggregate 支持 attribution + 全口径 problem 过滤

**Files:**
- Modify: `services/api/internal/metrics/aggregate.go`
- Create: `services/api/internal/metrics/where_test.go`

- [ ] **Step 1: 写 where 构造的纯函数单测**

我们把 where 构造抽成纯函数，避免 unit test 依赖 DB。

`services/api/internal/metrics/where_test.go`

```go
package metrics

import "testing"

func TestBuildWhereStrict(t *testing.T) {
	sql, _ := buildWhereStrict("night_meow")
	if sql == "" || !contains(sql, "payload->>'problem_id'") {
		t.Fatalf("expected problem_id condition, got: %s", sql)
	}
}

func TestBuildWhereByRequest(t *testing.T) {
	sql, _ := buildWhereByRequest("night_meow", 1, 2)
	if sql == "" || !contains(sql, "request_id") {
		t.Fatalf("expected request_id attribution, got: %s", sql)
	}
}

func contains(s, sub string) bool { return len(s) >= len(sub) && (s == sub || (len(s) > 0 && ( /* replaced in impl */ true ))) }
```

实现时请用 `strings.Contains`，这里的 contains 只是为了计划展示；落地请直接 `strings.Contains`。

- [ ] **Step 2: 在 aggregate.go 中实现两种 where 构造**

在 `aggregate.go` 中新增：

```go
func buildWhereStrict(problemID string) (string, []any) {
	if problemID == "" {
		return "", nil
	}
	return " and payload->>'problem_id' = $3 ", []any{problemID}
}

func buildWhereByRequest(problemID string, from, to int64) (string, []any) {
	if problemID == "" {
		return "", nil
	}
	// 注意：子查询同样要限定时间窗，避免跨窗归因
	return ` and request_id in (
	  select distinct request_id
	    from analytics_events
	   where ts_ms >= $3 and ts_ms <= $4
	     and payload->>'problem_id' = $5
	     and request_id is not null and request_id <> ''
	)`, []any{from, to, problemID}
}
```

> 参数占位符需要和主查询 args 对齐。实现时建议用统一的“拼接 args + 递增 $n”的方式构造，避免手写 $3/$4 出错。

- [ ] **Step 3: 修改 Aggregate 签名并应用全口径过滤**

把：
```go
func Aggregate(ctx context.Context, db *sql.DB, from, to int64, problemID string) (Result, error)
```
改为：
```go
func Aggregate(ctx context.Context, db *sql.DB, from, to int64, problemID, attribution string) (Result, error)
```

并让三段 SQL（total/uv、by_event_name、feedback）都使用同一套过滤逻辑：
- `strict`：`payload->>'problem_id' = ...`
- `by_request`：`request_id in (subquery...)`

注意：
- `by_request` 模式下如果事件没 request_id，会被自然排除（符合定义）
- `problemID==""` 时行为保持全局窗口（不加过滤）

- [ ] **Step 4: 更新 Delta 逻辑不变**

`Delta(a,b)` 无需变化。

- [ ] **Step 5: go test**

Run:
```bash
cd services/api
go test ./...
```
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add services/api/internal/metrics/aggregate.go services/api/internal/metrics/where_test.go
git commit -m "feat(metrics): add problem attribution modes (strict/by_request)"
```

---

## Task 3: handlers 输出 filter.attribution + compare 透传

**Files:**
- Modify: `services/api/internal/http/handlers/admin_metrics.go`
- Modify: `services/api/internal/http/handlers/admin_metrics_compare.go`
- Modify: `services/api/internal/http/handlers/admin_metrics_response.go`

- [ ] **Step 1: 修改 adminMetricsResponse 增加 attribution**

在 `admin_metrics_response.go` 中：
```go
"filter": map[string]any{
  "problem_id": problemID,
  "attribution": attribution,
},
```

- [ ] **Step 2: /admin/metrics 调用 Aggregate(..., attribution)**
- [ ] **Step 3: /admin/metrics/compare 调用 Aggregate(..., attribution) 并让 a/b.filter 都包含 attribution**

- [ ] **Step 4: go test**

Run:
```bash
cd services/api
go test ./...
```

- [ ] **Step 5: Commit**

```bash
git add services/api/internal/http/handlers/admin_metrics.go services/api/internal/http/handlers/admin_metrics_compare.go services/api/internal/http/handlers/admin_metrics_response.go
git commit -m "feat(admin): expose attribution filter in metrics responses"
```

---

## Task 4: e2e-db 系统测试（strict vs by_request）

**Files:**
- Modify: `.github/workflows/ci.yml`

- [ ] **Step 1: 在 e2e-db job 中新增 step：E2E: metrics attribution**

前提：e2e-db job 已经会启动 Postgres、跑迁移、导入 seed。

步骤脚本建议：
1) 启动 API（后台）并等待 `/v1/health`
2) 使用 `POST /v1/analytics/event` 写入三条事件（同一窗口）
   - r1：`event_name=inference_started`，payload.problem_id=night_meow
   - r1：`event_name=result_page_viewed`，payload 不带 problem_id（模拟漏带）
   - r1：`event_name=feedback_submitted`，payload.helpful=true（可带或不带 problem_id，建议带）
3) 请求 strict：
   - `/admin/metrics?from_ts_ms=...&to_ts_ms=...&problem_id=night_meow&attribution=strict`
   - 断言 events_total **不包含** “不带 problem_id 的 result_page_viewed”（即 events_total < by_request）
4) 请求 by_request：
   - `/admin/metrics?from_ts_ms=...&to_ts_ms=...&problem_id=night_meow&attribution=by_request`
   - 断言 events_total **包含** 那条 result_page_viewed（events_total > strict）

断言可用 python 完成：

```bash
python3 - <<'PY'
import json,sys
strict=json.load(open("/tmp/strict.json"))
by=json.load(open("/tmp/by.json"))
assert by["events_total"] > strict["events_total"], (by["events_total"], strict["events_total"])
PY
```

- [ ] **Step 2: Commit**

```bash
git add .github/workflows/ci.yml
git commit -m "test(ci): add e2e metrics attribution checks"
```

---

## Task 5: 全量验证 + nightly

- [ ] `python3 scripts/ci/validate_repo.py`
- [ ] `cd services/api && go test ./...`
- [ ] 观察 GitHub Actions 全绿（validate/go-api/python-inference/e2e-db）
- [ ] 生成 nightly：`./scripts/package.sh /workspace/miaodong-nightly.zip`

