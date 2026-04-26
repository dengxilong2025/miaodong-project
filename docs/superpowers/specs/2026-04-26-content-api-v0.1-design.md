# 内容 API v0.1（problems/详情/模板 + content_version）设计稿

日期：2026-04-26  
状态：已确认（用户“确认做内容 API v0.1”）  
对应 WBS：3.4 内容 API（problems/详情/模板），带 content_version

---

## 1. 背景

当前已有：

- Postgres 权威内容表：`problems/questions/suggestions/tools_guides` 等（见 migrations）
- Seed 导入与校验：`data/seed/miaodong-seed-v1.json`
- 推理编排（Go→Python）已能返回基础结构，但 App 需要稳定的内容读取接口来渲染：
  - 问题库列表/详情
  - 结果页的解释/追问/建议/工具指南（MVP 可先从 problem bundle 来）

核心诉求：

- API 在响应中明确 `content_version`，避免客户端猜测
- 结构解耦（resolver/repo/handler 分层），后续扩展灰度/回滚不改 handler

---

## 2. 目标（v0.1）

1) 提供 App 可用的内容读取 API：
   - 列表：Top3（或全量）问题摘要
   - 详情：单个 problem 的“bundle”（问题 + 追问 + 建议 + 工具指南）
2) 支持 `content_version`：
   - 请求显式指定时强制使用
   - 不指定时由服务端决策并回填
3) 科学系统测试：
   - unit：HTTP 契约与 content_version 回填
   - e2e-db：seed 导入后真实请求断言 Top3 存在

---

## 3. 非目标

- 完整灰度桶策略（v0.1 可固定返回当前发布版本或 1）
- “模板系统”复杂化（v0.1 直接复用 problem bundle 结构）
- 多语言/多地区内容

---

## 4. API 设计（对外 /v1）

### 4.1 列表：`GET /v1/problems`

Query：
- `content_version`（可选，int）
- `limit`（可选，默认 3，最大 50）

Response：
```json
{
  "content_version": 1,
  "items": [
    { "id": "night_meow", "title": "...", "summary": "...", "tags": ["..."] }
  ]
}
```

### 4.2 详情：`GET /v1/problems/{id}`

Query：
- `content_version`（可选，int）

Response（bundle）：
```json
{
  "content_version": 1,
  "problem": { "...": "problem fields" },
  "questions": [ ... ],
  "suggestions": [ ... ],
  "tools_guides": { ... }
}
```

错误：
- 不存在：404

### 4.3 结果页模板：`GET /v1/templates/result`

Query：
- `problem_id`（必填）
- `content_version`（可选）

v0.1 行为：
- 直接返回与 `GET /v1/problems/{id}` 相同 shape（或其子集），便于前端复用渲染逻辑。

---

## 5. content_version 解析规则（可扩展）

### 5.1 规则

- 若请求带 `content_version`：
  - 解析为 int，合法则使用
  - 不合法 → 400
- 若未带：
  - v0.1：返回固定 `1`（或读取 releases 中最新 published 的 content_version，二选一）
  - v0.2：再接入灰度/桶/回滚（不改 handler，只改 resolver）

### 5.2 响应回填

所有内容读取接口都必须在响应顶层回填：
- `content_version`

---

## 6. 解耦与代码结构（可维护）

### 6.1 internal/content 追加 resolver

- `ResolveContentVersion(ctx, userID, explicit *int) (int, error)`
  - v0.1：explicit != nil → 用 explicit；否则返回 1
  - v0.2：从 releases/runtime_config + 灰度桶计算

### 6.2 internal/content 追加 repo

目的：避免 handler 直接写 SQL；后续可替换为缓存/只读副本等。

- `ListProblems(ctx, db, contentVersion, limit) ([]ProblemSummary, error)`
- `GetProblemBundle(ctx, db, contentVersion, problemID) (Bundle, error)`

---

## 7. 测试策略

### 7.1 单元测试（Go）

覆盖：
- `GET /v1/problems` 返回 200，且包含 `content_version`
- `GET /v1/problems/{id}` 不存在返回 404
- `content_version` 非法输入返回 400

说明：
- unit 不依赖真实 DB（可只测参数与响应结构；DB 集成放到 e2e-db）

### 7.2 e2e-db（CI）

在 e2e-db job 中新增 step：
- seed 导入后调用：
  - `GET /v1/problems?limit=3`
  - 断言 items.length == 3 且包含 Top3 的 id（或至少包含一个 known id）

---

## 8. 验收标准（DoD）

1) `/v1/problems` 与 `/v1/problems/{id}` 可用，并回填 `content_version`  
2) 可通过 query 强制指定 `content_version`（非法返回 400）  
3) CI 增加 e2e-db 内容读取检查（防 seed/API 回归）  
4) handler/resolver/repo 分层清晰，后续接灰度无需改 handler  

