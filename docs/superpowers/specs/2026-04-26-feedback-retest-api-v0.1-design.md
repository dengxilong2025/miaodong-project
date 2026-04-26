# 反馈与复测 API v0.1 设计稿（写入 analytics_events）

日期：2026-04-26  
状态：已确认（用户“确认反馈复测 API v0.1”）  
对应 WBS：3.5 反馈与复测 API

---

## 1. 背景

当前系统已有：

- `analytics_events` 事件表（用于埋点与 admin metrics 聚合）
- admin metrics 已支持统计 `feedback_submitted`（helpful_rate 等）
- app 需要稳定的反馈闭环与“复测关联”能力，支撑 M3（复测+反馈+成就）

---

## 2. 方案选择

采用 **方案 B：复用 analytics_events（推荐）**：

- 反馈/复测均写入 `analytics_events`
- 优点：最少改动、口径一致、直接进入指标体系
- 约束：需要在 API 层做字段校验，确保 payload 结构稳定

---

## 3. API 设计

### 3.1 `POST /v1/feedback`

用于“这次解读是否有用 / 意图是否匹配”。

Request（兼容 docs/tech/API_CONTRACT.md，并扩展 problem_id/content_version）：

```json
{
  "request_id": "r_001",
  "helpful": true,
  "intent_match": "match|partial|mismatch",
  "notes": "…",
  "problem_id": "night_meow",
  "content_version": 1
}
```

校验：

- `request_id` 必填
- `helpful` 必填
- `intent_match` 可选（若有必须是枚举值）
- `content_version` 可选（若有必须为正整数）
- `problem_id` 可选（v0.1 建议填写，用于按 problem 聚合）

写入事件：

- `event_name = "feedback_submitted"`
- `ts_ms = now_ms`
- `request_id = request_id`
- `content_version = content_version`（若传）
- `payload`：
  - `helpful`
  - `intent_match`
  - `notes`
  - `problem_id`（若传）

Response：

```json
{ "ok": true }
```

### 3.2 `POST /v1/retest`

用于把“复测的两次推理”关联起来，支持对比卡与成就。

Request（最小可用）：

```json
{
  "problem_id": "night_meow",
  "baseline_request_id": "r_old",
  "current_request_id": "r_new",
  "content_version": 1,
  "notes": "…"
}
```

校验：

- `problem_id` 必填
- `baseline_request_id` 必填
- `current_request_id` 必填
- `content_version` 可选（若有必须为正整数）

写入事件：

- `event_name = "retest_submitted"`
- `ts_ms = now_ms`
- `request_id = current_request_id`
- `content_version = content_version`（若传）
- `payload`：
  - `problem_id`
  - `baseline_request_id`
  - `current_request_id`
  - `notes`

Response：

```json
{ "ok": true }
```

---

## 4. 解耦与代码结构（可维护）

新增模块（建议命名）：

- `services/api/internal/engagement/events.go`
  - `WriteFeedbackEvent(ctx, db, req)`
  - `WriteRetestEvent(ctx, db, req)`

handlers 层仅负责：

- method 校验（只允许 POST）
- JSON decode + 字段校验（400）
- 调用模块写入（500）
- 返回 `{ok:true}`

---

## 5. 测试（关键里程碑必须系统）

### 5.1 单元测试（Go，DB-free）

- `POST /v1/feedback`：缺 request_id/helpful → 400
- `POST /v1/retest`：缺 problem_id/baseline/current → 400
- 非 POST → 405

### 5.2 e2e-db（CI）

新增 step：`E2E: feedback & retest`

流程：

1) 启动 API（后台）并等待 `/v1/health`
2) 调 `POST /v1/feedback` 写入 helpful=true（含 problem_id）
3) 调 `POST /v1/retest` 写入一条
4) 用 `/admin/metrics` 拉窗口，断言：
   - `feedback.total >= 1`
   - `feedback.helpful_rate > 0`
5) 再用 `/admin/metrics` 的 `by_event_name` 断言包含 `retest_submitted`（count >= 1）

---

## 6. 验收标准（DoD）

1) `/v1/feedback` 与 `/v1/retest` 可用，字段校验明确  
2) 写入 `analytics_events` 成功，metrics 能统计到反馈与复测事件  
3) CI 增加 e2e-db 系统测试，防回归  

