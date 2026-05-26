# 6.3：指标聚合接口（problem 维度 KPI）v0.1 设计稿

日期：2026-05-26  
状态：已确认（用户“确认 6.3 设计”）  
对应 WBS：6.3 指标聚合接口（problem维度）

---

## 1. 背景

当前后端已具备：

- `analytics_events` 表（`event_name/ts_ms/user_id/session_id/platform/app_version/content_version/request_id/payload(jsonb)`）
- `POST /v1/analytics/event`：接收客户端埋点并落库
- `GET /admin/metrics`：单窗口聚合（events_total/UV/by_event_name/feedback）
- `GET /admin/metrics/compare`：窗口对比（A/B + delta）

Flutter 端已在 6.1 接入 P0 事件（推理、结果页、分享、反馈、复测、问题库等），因此现在可以在不新增接口的前提下，增强 `/admin/metrics` 输出的 KPI 字段，直接支撑 5.4 Admin 指标页与后续 24h/72h 对比。

---

## 2. 目标（DoD）

1) 在 `GET /admin/metrics` 响应中新增 `kpis` 区块（不破坏已有字段）  
2) KPI 能在 `problem_id` 过滤场景下工作（支持 strict/by_request 两种归因口径）  
3) `GET /admin/metrics/compare` 自动对比 A/B 两个窗口 KPI，并输出 delta（B-A）  
4) 单测与 e2e 覆盖新增字段（保持“文档=代码=测试”一致）  

---

## 3. 输入（保持不变）

### 3.1 单窗口

`GET /admin/metrics?from_ts_ms=&to_ts_ms=&problem_id=&attribution=`

- `from_ts_ms` / `to_ts_ms`：毫秒时间戳
- `problem_id`：可选
- `attribution`：`strict`（默认）或 `by_request`

### 3.2 对比窗口

`GET /admin/metrics/compare?from_a=&to_a=&from_b=&to_b=&problem_id=&attribution=`

---

## 4. 输出：新增 KPIs（不破坏旧字段）

在原返回的基础上新增字段：

```json
{
  "window": { "from_ts_ms": 0, "to_ts_ms": 0 },
  "filter": { "problem_id": "", "attribution": "strict" },
  "events_total": 0,
  "distinct_users": 0,
  "by_event_name": [],
  "feedback": { "total": 0, "helpful": 0, "helpful_rate": 0.0 },
  "kpis": {
    "inference": {
      "started": 0,
      "succeeded": 0,
      "failed": 0,
      "success_rate": 0.0
    },
    "share": {
      "clicked": 0,
      "completed": 0,
      "completed_rate": 0.0
    },
    "retest": {
      "started": 0,
      "completed": 0,
      "completed_rate": 0.0
    },
    "tools": {
      "expanded": 0,
      "expanded_rate": 0.0
    }
  }
}
```

### 4.1 指标口径（与 docs/tech/ANALYTICS_SPEC.md 对齐）

- 推理成功率：`inference_succeeded / inference_started`
- 分享完成率：`share_completed / result_page_viewed`
- 复测率：`retest_completed / inference_succeeded`
- 工具区展开率：`tools_section_expanded / result_page_viewed`
- 有用率：沿用 `feedback.helpful_rate`

> 说明：分母为 0 时 rate 返回 0.0。

---

## 5. SQL 实现策略

基于 `analytics_events` 聚合：

- event_name 直接筛选（例如 `event_name='inference_succeeded'`）
- problem_id 过滤依赖 payload：
  - strict：`payload->>'problem_id' = $problemId`
  - by_request：`request_id in (subquery...)`

由于当前事件 payload 已在 Flutter 侧统一发出，本轮不需要改变埋点契约即可产出 KPI。

---

## 6. 对比窗口（/admin/metrics/compare）

在 compare 输出中：

- `a`、`b` 均包含新增 `kpis`
- `delta` 增加对应 KPI 的差值（B-A）字段，至少包含：
  - `inference_success_rate`
  - `share_completed_rate`
  - `retest_completed_rate`
  - `tools_expanded_rate`
  - 以及 counts（started/succeeded/failed 等）差值

---

## 7. 测试策略

### 7.1 单测（metrics.Aggregate）

补充单测，覆盖：

- KPI counts 统计正确
- rate 分母为 0 时为 0
- strict vs by_request 过滤差异

### 7.2 e2e（CI）

在现有 `E2E: metrics attribution` 中补断言：

- `/admin/metrics` 返回 `kpis.*` 字段存在
- compare 返回 `delta` 中对应字段存在且可解析

---

## 8. 非目标（本轮不做）

- 不做更复杂的漏斗（多步链路严格顺序）
- 不做按 experiment_bucket 拆分
- 不做图表渲染（属于 Admin Web）

