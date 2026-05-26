# Admin Metrics KPIs v0.1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 扩展 `GET /admin/metrics` 与 `GET /admin/metrics/compare` 输出，新增 `kpis`（推理成功率/分享完成率/复测率/工具区展开率等），并补齐单测与 e2e 断言，保证与 `docs/tech/ANALYTICS_SPEC.md` 口径一致。

**Architecture:** 在 `services/api/internal/metrics/aggregate.go` 增加 KPI 聚合 SQL（基于 analytics_events）；扩展 `metrics.Result` 与 `handlers.adminMetricsResponse` 输出字段；在 compare 的 `metrics.Delta` 增加 KPI 差值字段；完善 `services/api/internal/http/handlers/admin_metrics_parse_test.go` 与 e2e metrics 断言。

**Tech Stack:** Go + Postgres（jsonb）+ 现有 CI e2e-db。

---

## 0. File Map

**Modify:**
- `services/api/internal/metrics/aggregate.go`
- `services/api/internal/http/handlers/admin_metrics_response.go`
- `services/api/internal/http/handlers/admin_metrics_compare.go`（若需调整 delta 输出）
- `services/api/internal/http/handlers/admin_metrics_parse_test.go`
- `scripts/test.sh` 或 `services/api/internal/http/handlers/*_test.go`（补 e2e/handler 断言，按仓库现状）

---

## Task 1: 扩展 metrics.Result（新增 KPIs 结构体）

**Files:**
- Modify: `services/api/internal/metrics/aggregate.go`

- [ ] **Step 1: 新增 KPI 结构体定义**

在 `metrics` 包增加：

```go
type InferenceKPI struct {
  Started     int64   `json:"started"`
  Succeeded   int64   `json:"succeeded"`
  Failed      int64   `json:"failed"`
  SuccessRate float64 `json:"success_rate"`
}

type ShareKPI struct {
  Clicked       int64   `json:"clicked"`
  Completed     int64   `json:"completed"`
  CompletedRate float64 `json:"completed_rate"`
}

type RetestKPI struct {
  Started       int64   `json:"started"`
  Completed     int64   `json:"completed"`
  CompletedRate float64 `json:"completed_rate"`
}

type ToolsKPI struct {
  Expanded     int64   `json:"expanded"`
  ExpandedRate float64 `json:"expanded_rate"`
}

type KPIs struct {
  Inference InferenceKPI `json:"inference"`
  Share     ShareKPI     `json:"share"`
  Retest    RetestKPI    `json:"retest"`
  Tools     ToolsKPI     `json:"tools"`
}
```

并在 `Result` 中新增字段：

```go
KPIs KPIs `json:"kpis"`
```

- [ ] **Step 2: Commit**

```bash
git add services/api/internal/metrics/aggregate.go
git commit -m "feat(api): add metrics kpis types"
```

---

## Task 2: Aggregate() 增加 KPI SQL 聚合

**Files:**
- Modify: `services/api/internal/metrics/aggregate.go`

- [ ] **Step 1: 聚合推理 KPI**

统计：
- started：event_name='inference_started'
- succeeded：event_name='inference_succeeded'
- failed：event_name='inference_failed'

```sql
select
  sum(case when event_name='inference_started' then 1 else 0 end)::bigint as started,
  sum(case when event_name='inference_succeeded' then 1 else 0 end)::bigint as succeeded,
  sum(case when event_name='inference_failed' then 1 else 0 end)::bigint as failed
from analytics_events
where ts_ms >= $1 and ts_ms <= $2
  [AND ... where clause ...]
```

success_rate：分母为 0 时 0。

- [ ] **Step 2: 聚合分享 KPI**

分子：`share_completed`  
分母：`result_page_viewed`

同时保留 clicked：`share_clicked`（用于诊断“点了但没完成”）。

- [ ] **Step 3: 聚合复测 KPI**

分子：`retest_completed`  
分母：`inference_succeeded`

- [ ] **Step 4: 聚合工具区展开 KPI**

分子：`tools_section_expanded`  
分母：`result_page_viewed`

- [ ] **Step 5: Commit**

```bash
git add services/api/internal/metrics/aggregate.go
git commit -m "feat(api): aggregate kpis from analytics events"
```

---

## Task 3: 输出层对齐（/admin/metrics + compare delta）

**Files:**
- Modify: `services/api/internal/http/handlers/admin_metrics_response.go`
- Modify: `services/api/internal/metrics/aggregate.go`（DeltaResult）

- [ ] **Step 1: adminMetricsResponse 增加 kpis 字段**

```go
"kpis": res.KPIs,
```

- [ ] **Step 2: DeltaResult 增加 KPI delta**

```go
type DeltaResult struct {
  ...
  InferenceSuccessRate float64 `json:"inference_success_rate"`
  ShareCompletedRate   float64 `json:"share_completed_rate"`
  RetestCompletedRate  float64 `json:"retest_completed_rate"`
  ToolsExpandedRate    float64 `json:"tools_expanded_rate"`
}
```

并在 `Delta(a,b)` 填充：

```go
InferenceSuccessRate: b.KPIs.Inference.SuccessRate - a.KPIs.Inference.SuccessRate,
...
```

- [ ] **Step 3: Commit**

```bash
git add services/api/internal/http/handlers/admin_metrics_response.go services/api/internal/metrics/aggregate.go
git commit -m "feat(api): expose kpis in admin metrics and delta"
```

---

## Task 4: 单测与 handler 测试

**Files:**
- Modify: `services/api/internal/http/handlers/admin_metrics_parse_test.go`（或新增专门测试文件）

- [ ] **Step 1: 增加 JSON parse 断言**

至少断言：
- `kpis.inference.started` 存在且为 number
- `kpis.share.completed_rate` 存在且为 number
- compare 的 `delta.share_completed_rate` 存在

> 这里不做精确数值（精确数值由 e2e-db 负责），但要确保 API shape 稳定。

- [ ] **Step 2: Commit**

```bash
git add services/api/internal/http/handlers/admin_metrics_parse_test.go
git commit -m "test(api): assert admin metrics kpis fields"
```

---

## Task 5: e2e-db 覆盖（metrics attribution 测试扩展）

**Files:**
- Modify: `services/api/internal/http/handlers/admin_metrics_compare.go`（如 e2e 依赖字段）
- Modify: e2e 测试脚本所在文件（仓库中现有 e2e 入口脚本/测试文件）

- [ ] **Step 1: 找到现有 E2E: metrics attribution 测试点并补断言**

断言：
- `/admin/metrics` 返回 `kpis` 且 rate 在 [0,1]
- `/admin/metrics/compare` 返回 `a.kpis/b.kpis/delta.*_rate`

- [ ] **Step 2: Commit**

```bash
git add <e2e files>
git commit -m "test(e2e): cover admin metrics kpis"
```

---

## Task 6: Repo 校验 + CI + nightly

- [ ] Run: `python3 scripts/ci/validate_repo.py`
- [ ] Run CI（push 后观察 GitHub Actions 全绿）
- [ ] nightly：`./scripts/package.sh /workspace/miaodong-nightly.zip`

