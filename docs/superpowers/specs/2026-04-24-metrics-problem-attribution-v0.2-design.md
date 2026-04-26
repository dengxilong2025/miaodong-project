# 喵懂 Admin Metrics：problem 维度口径 + 归因模式 v0.2 设计稿

日期：2026-04-24  
状态：已确认（用户“确认口径 v0.2”）  
目标关键词：口径清晰 / 可扩展 / 可测试 / 避免自欺

---

## 1. 背景

当前已有：

- 埋点写入：`POST /v1/analytics/event` 写入 `analytics_events`
- 指标聚合：
  - `GET /admin/metrics?from_ts_ms=&to_ts_ms=&problem_id=`
  - `GET /admin/metrics/compare?from_a=&to_a=&from_b=&to_b=&problem_id=`
- 现状问题：
  - `problem_id` 过滤 **仅作用于 feedback_submitted**（见 `internal/metrics/aggregate.go` 注释）
  - events_total / distinct_users / by_event_name 在传 `problem_id` 时仍为“全局窗口”，会造成误读

---

## 2. 目标（v0.2）

当传入 `problem_id` 时，提供两种可显式选择的统计模式：

1) **strict（默认）**：严格事件过滤 —— 只统计 `payload.problem_id == problem_id` 的事件  
2) **by_request**：按 `request_id` 归因 —— 先找与该 `problem_id` 关联的 request 集合，再统计这些 request 的全链路事件

两者并存、显式选择，用于避免团队讨论中混用口径导致结论互相冲突。

---

## 3. API 设计（向后兼容）

### 3.1 /admin/metrics

`GET /admin/metrics?from_ts_ms=&to_ts_ms=&problem_id=&attribution=`

新增 query：

- `attribution`：`strict | by_request`（默认 `strict`）

### 3.2 /admin/metrics/compare

`GET /admin/metrics/compare?from_a=&to_a=&from_b=&to_b=&problem_id=&attribution=`

新增 query：

- `attribution`：同上（默认 `strict`）

### 3.3 Response

保持现有结构不变（对前端无破坏）：

- `/admin/metrics`：`window/filter/events_total/distinct_users/by_event_name/feedback`
- `/admin/metrics/compare`：`a/b/delta`

仅补充 `filter` 字段：

```json
"filter": { "problem_id": "night_meow", "attribution": "strict" }
```

---

## 4. 口径定义

### 4.1 strict（默认）

过滤条件：

```sql
payload->>'problem_id' = $problem_id
```

应用范围：

- `events_total`
- `distinct_users`
- `by_event_name`
- `feedback`（仍然是 event_name='feedback_submitted' 的子集）

说明：

- **只有带 problem_id 的事件才计入**；没带 problem_id 的链路事件会被漏算（这是 strict 模式的预期）
- 适用于评估“问题内容本身”的效果与热度（最清晰，最不容易自欺）

### 4.2 by_request（归因模式）

两阶段：

1) 选出 request 集合（窗口内）：

```sql
select distinct request_id
  from analytics_events
 where ts_ms between $from and $to
   and payload->>'problem_id' = $problem_id
   and request_id is not null and request_id <> ''
```

2) 统计窗口内、这些 request 的事件：

```sql
... where ts_ms between $from and $to
      and request_id in ( ...subquery... )
```

应用范围：

- `events_total`：这些 request 下的全部事件
- `distinct_users`：这些 request 关联到的用户集合
- `by_event_name`：这些 request 下的事件分布
- `feedback`：这些 request 下的 feedback_submitted 统计

说明：

- 解决“某些事件没带 problem_id 导致漏算”的问题，更接近真实用户链路
- 适用于评估“从进入该 problem 到最终反馈”的端到端效果

---

## 5. 实现要求（可维护/解耦）

### 5.1 聚合层解耦

修改 `internal/metrics/aggregate.go`：

- 增加参数 `attribution string`
- 将“where 子句构造”拆为小函数：
  - `buildStrictWhere(problemID string) (sql string, args []any)`
  - `buildByRequestWhere(problemID string, from, to int64) (sql string, args []any)`

保证：

- `AdminMetrics` 与 `AdminMetricsCompare` 继续只调用 `metrics.Aggregate()`（不回退到 handler 内联 SQL）

### 5.2 handler 参数解析

在 handlers 中解析：

- `attribution`：空/未知值 → 视为 `strict`
- 返回 `filter.attribution`

---

## 6. 测试策略（关键里程碑必须系统测试）

### 6.1 单元测试（Go）

- attribution 参数解析：未知值降级为 strict
- 纯函数测试：where 构造函数返回的 SQL 片段包含预期条件

### 6.2 e2e-db 端到端（CI）

在 `e2e-db` job 中插入一组事件（直接 `POST /v1/analytics/event` 或 `psql insert` 均可），例如：

- request_id=r1，payload.problem_id=night_meow，事件：inference_started、result_page_viewed、feedback_submitted
- request_id=r2，payload.problem_id=other，事件：inference_started、feedback_submitted
- 额外插入一个 **不带 problem_id** 但带 request_id=r1 的事件（模拟漏带字段）

断言：

- strict + problem_id=night_meow：只统计带该 problem_id 的事件（不带的那条不计入）
- by_request + problem_id=night_meow：会把同 request_id=r1 的事件都统计进来

---

## 7. 验收标准（DoD）

1) `/admin/metrics` 与 `/admin/metrics/compare` 支持 `attribution=strict|by_request`，默认 strict  
2) `problem_id` 过滤对 **events_total/distinct_users/by_event_name/feedback** 全口径一致生效（按模式定义）  
3) CI `e2e-db` 增加端到端覆盖（strict 与 by_request 两种断言）  
4) 代码继续解耦、可读、可扩展（后续可加更多维度如 entry/platform/app_version）  

