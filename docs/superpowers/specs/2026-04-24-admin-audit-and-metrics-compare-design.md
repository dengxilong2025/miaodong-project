# 喵懂 Admin：审计日志（Audit）+ 指标对比（Compare）设计稿 v0.1

日期：2026-04-24  
范围：在现有 Admin API 与 Admin Web 的基础上，补齐“可追溯 + 可对比”的运营闭环能力  
设计原则：可扩展、可维护、解耦（store/service 层复用；HTTP handler 仅做胶水）

---

## 1. 背景与目标

当前已具备：

- Admin API：`/admin/problems`、`/admin/releases`、`/admin/rollback`、`/admin/metrics`
- 审计写入：关键动作写入 `audit_log`（create/update/publish/rollback）
- Admin Web：Dashboard/Problems/Releases/Metrics/Audit（Audit 仅占位）

需要补齐：

1) **审计可见**：运营能直接在后台看到“谁在什么时候对什么做了什么”，便于追责与排障  
2) **发布后可对比**：支持发布后 24h/72h 的核心指标对比，出现下滑可快速回滚  

---

## 2. 非目标（v0.1 不做）

- 完整 RBAC / 组织权限模型  
- 审计日志字段级 diff 的可视化（仅展示 diff 原始 JSON）  
- 审计日志服务端复杂筛选（v0.1 只做 limit；筛选在前端本地做）  
- 指标对比到“按 content_version 自动对齐窗口”（先做通用 compare 窗口，Dashboard 组合出 24h/72h）  

---

## 3. 后端设计

### 3.1 新增：`GET /admin/audit`（仅列表 v0.1）

**Endpoint**

- `GET /admin/audit?limit=200`
- 默认 `limit=200`，最大 `500`
- 排序：`created_at desc`

**Response**

```json
{
  "items": [
    {
      "id": 123,
      "actor": "admin-ui",
      "action": "publish",
      "entity_type": "release",
      "entity_id": "12",
      "diff": { "rollout_percent": 20, "notes": "..." },
      "created_at": "2026-04-23T10:00:00Z"
    }
  ]
}
```

**错误与鉴权**

- 沿用现有 `X-Admin-Token` 鉴权（`requireAdmin()`）
- 错误：500 返回纯文本（与现有 Admin API 一致）；前端 toast 展示

**解耦/可维护性**

拆分为 2 层：

1) `internal/audit/store.go`：只负责 SQL 与数据结构（未来加过滤/分页/索引都在这里）  
2) `internal/http/handlers/admin_audit_list.go`：只负责 query 解析、调用 store、JSON 输出  

### 3.2 新增：`GET /admin/metrics/compare`（对比两段窗口）

目的：不破坏现有 `/admin/metrics` 的简单形态，新增对比能力供 Dashboard 使用。

**Endpoint**

- `GET /admin/metrics/compare?from_a=&to_a=&from_b=&to_b=&problem_id=`
- 参数均为毫秒时间戳（int64）
- `problem_id` 可选

**Response**

```json
{
  "a": { "...": "same shape as /admin/metrics" },
  "b": { "...": "same shape as /admin/metrics" },
  "delta": {
    "events_total": 200,
    "distinct_users": 15,
    "feedback_helpful_rate": 0.07
  }
}
```

说明：

- `a` 与 `b` 的结构与 `/admin/metrics` 保持一致（前端可以复用渲染组件）
- `delta`：
  - `events_total`、`distinct_users` 为 `b - a`
  - `feedback_helpful_rate` 为 `b_rate - a_rate`（浮点，范围可为负）

**解耦/可维护性**

拆分为 2 层：

1) `internal/metrics/aggregate.go`：提供 `Aggregate(ctx, db, from, to, problemID)` 返回聚合结构  
2) `internal/http/handlers/admin_metrics_compare.go`：解析 compare 参数，调用两次 Aggregate 生成 `a/b/delta`

> 约束：`AdminMetrics`（现有）也应改为调用 `Aggregate()`，避免未来逻辑漂移。

---

## 4. 前端（Admin Web）设计

### 4.1 目标：保持无构建链但可维护

保持静态单页（不引入 React/Vite），但把 admin.js 拆小，避免继续变成巨无霸。

**文件拆分（v0.1）**

- `apps/admin/admin.js`：入口 + 路由注册（只做 bootstrapping）
- `apps/admin/lib/api.js`：token / apiFetch / toast / modal（可复用）
- `apps/admin/pages/dashboard.js`：Dashboard 渲染（含 24h/72h 对比）
- `apps/admin/pages/audit.js`：Audit 列表页（含本地搜索过滤）

> 说明：拆分后仍然通过 `<script src="...">` 直接加载，不需要构建链。

### 4.2 Audit 页面（v0.1）

功能：

- 拉取：`GET /admin/audit?limit=200`
- 展示：表格（actor/action/entity_type/entity_id/created_at/diff 摘要）
- 本地过滤：
  - search 输入框：对 actor/entity_id/entity_type/action 做包含匹配
  - diff 展示：默认折叠，点开显示 pretty JSON（避免页面过长）

### 4.3 Dashboard：发布后 24h/72h 对比（v0.1）

对比口径（以 now 为基准）：

- **24h**：
  - 窗口 B：`[now-24h, now]`
  - 窗口 A：`[now-48h, now-24h]`
- **72h**：
  - 窗口 B：`[now-72h, now]`
  - 窗口 A：`[now-144h, now-72h]`

展示指标（每组展示 current + delta）：

- `events_total`
- `distinct_users`
- `feedback.helpful_rate`

数据获取策略：

- 优先使用 `/admin/metrics/compare`（减少前端拼装与请求次数）
- 若 compare 失败可降级为两次 `/admin/metrics`（v0.1 可不做降级，取决于实现成本）

---

## 5. 数据库与性能（最小要求）

### 5.1 推荐索引（非强制，视数据量）

如后续事件量变大，建议添加索引（在新的 migration 中）：

- `audit_log(created_at desc)`
- `analytics_events(ts_ms)`
- `analytics_events(event_name, ts_ms)`

v0.1 可先不加（数据量小时够用）。

---

## 6. 验收标准（DoD）

1) 后端新增 `GET /admin/audit`，Admin Web Audit 页可查看最近 200 条日志  
2) 后端新增 `GET /admin/metrics/compare`，Dashboard 可展示 24h 与 72h 对比（含 delta）  
3) 前端代码完成拆分（admin.js 不再包含全部逻辑）  
4) CI 全绿（go-api / python-inference / e2e-db）  

