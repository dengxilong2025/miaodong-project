# 身份识别 + content_version 灰度 v0.1 设计稿

日期：2026-04-26  
状态：已确认（用户“确认做身份识别+灰度content_version v0.1”）  
对应 WBS：3.1 匿名身份；2.3 content_version 灰度策略（服务端）

---

## 1. 背景

当前已有：

- `POST /v1/auth/anonymous` 返回 `user_id/token`（`token=dev-token-<user_id>`）
- 内容 API v0.1 已实现，但 `content_version` resolver 仍固定返回 `1`
- 发布中心已有 `releases` 表与 admin 发布/回滚接口（`/admin/release`, `/admin/rollback`）

问题：

- 服务端尚未在通用层识别 user_id（只能靠客户端额外字段传递）
- 灰度发布/回滚无法在内容 API 上体现

---

## 2. 目标（v0.1）

1) 让服务端能从 `Authorization` 解析出 `user_id`（MVP：能识别就识别，不强制）  
2) `ResolveContentVersion` 接入 `releases`，支持：
   - 最新 published 的 `rollout_percent=100` → 全量命中
   - `rollout_percent<100` → 基于 `hash(user_id)%100` 做灰度命中
   - 未命中 → 回退到上一个 published（没有则回 1）
3) 增加系统性测试：
   - unit：token 解析
   - e2e-db：发布 v1/v2(10%) → 两个 user_id 的 content_version 可能不同；回滚后统一回 v1

---

## 3. 身份识别（最小闭环）

### 3.1 客户端约定

客户端在拿到 `/v1/auth/anonymous` 返回的 token 后，在后续请求中携带：

```
Authorization: Bearer dev-token-<user_id>
```

### 3.2 服务端解析

新增一个轻量解析函数：

- 输入：`Authorization` header
- 输出：`user_id`（若解析失败返回空字符串）

规则：

- 仅支持 `Bearer dev-token-` 前缀（MVP）
- 不符合则返回空（不报错，保持兼容）

把解析到的 user_id 写入 request context：

- `ctx.Value(UserIDKey)` 可取到 user_id

---

## 4. content_version 灰度（接 releases）

### 4.1 核心逻辑

在 `internal/content.ResolveContentVersion(ctx, userID, explicit)` 内：

- 若 explicit != nil：直接返回 explicit（强制版本，用于回放/复测）
- 否则：
  1) 读取 `releases` 中最新 `status='published'` 的版本 `v_latest` 与 `rollout_percent`
  2) 若 rollout_percent==100：返回 `v_latest`
  3) 若 rollout_percent<100：
     - 若 userID 为空：返回 `v_prev`（或 1）
     - 否则：
       - `bucket = hash(userID)%100`
       - bucket < rollout_percent → 返回 `v_latest`
       - 否则返回 `v_prev`（若不存在返回 1）

### 4.2 hash 规则

使用稳定 hash（例如 FNV-1a 32-bit），保证同一 user_id 命中稳定：

- `bucket = fnv32(userID) % 100`

---

## 5. 路由/handler 接入点

### 5.1 通用 middleware（推荐）

在 `internal/http/router.go` 的 mux 外层包一层：

- 从 header 解析 user_id
- 注入 context
- 再交给各 handler

这样：

- content API handler 可读取 user_id 并传给 `ResolveContentVersion`
- analytics event / feedback / inference 后续也可选择把 user_id 写入 analytics_events（后续迭代）

---

## 6. 测试

### 6.1 unit tests

- token 解析：
  - `Bearer dev-token-u_abc` → `u_abc`
  - 空/其它格式 → `""`

### 6.2 e2e-db

在 e2e-db job 中新增 step：`E2E: content_version rollout`

流程：

1) 启动 API
2) admin 发布 v1（100%）
3) admin 发布 v2（10%）
4) 使用两个不同 `Authorization` token 调用 `/v1/problems?limit=1`
   - 断言 response 顶层 `content_version` 为 1 或 2
   - 允许两次不同（不强制必不同，但至少覆盖代码分支）
5) admin 回滚到 v1
6) 再调用 `/v1/problems`，断言 `content_version==1`

---

## 7. 验收标准（DoD）

1) 服务端可从 Authorization 解析 user_id 并注入 context（不强制）  
2) 内容 API 的 `content_version` 不再固定为 1，能反映 releases 发布/灰度/回滚  
3) unit + e2e-db 覆盖上线关键路径，CI 全绿  

