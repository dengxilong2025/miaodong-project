# 推理编排（Go → Python）v0.2 设计稿

日期：2026-04-26  
状态：已确认（用户“按这个设计推进”）  
对应 WBS：3.3 同步推理编排（Go→Python）+ 降级

---

## 1. 背景

当前实现：

- `POST /v1/inference`（`services/api/internal/http/handlers/inference.go`）同步调用推理服务 `/infer`
- 失败时返回 `degraded=true` 的降级结构，但缺少稳定的 `degraded_reason`
- 超时固定写死为 3s，handler 与 client timeout 的可配置性不足

---

## 2. 目标（v0.2）

1) **超时可控**：通过环境变量配置推理请求超时（handler 与 client 一致）  
2) **降级结构标准化**：失败时返回稳定字段 `degraded_reason`，便于移动端/后台可观测与归因  
3) **成功结构补齐编排字段**：统一补齐 `request_id/content_version/degraded`，并增加 `inference_latency_ms`  
4) **科学系统测试**：补齐单测覆盖成功/失败/超时分支（不依赖真实推理服务）  

---

## 3. API 契约

### 3.1 请求

`POST /v1/inference`

```json
{
  "audio_url": "http(s)://...",
  "context": { "...": "..." }
}
```

### 3.2 成功响应（degraded=false）

在推理服务响应 JSON 基础上补齐字段：

```json
{
  "...": "infer output",
  "request_id": "req_xxx",
  "content_version": 1,
  "degraded": false,
  "inference_latency_ms": 123
}
```

### 3.3 降级响应（degraded=true）

```json
{
  "request_id": "req_xxx",
  "schema_version": "1.0",
  "model_version": "degraded",
  "content_version": 1,
  "degraded": true,
  "degraded_reason": "timeout|unreachable|bad_status|bad_json",
  "message": "推理解读暂时不可用…",
  "fallback": { "next": "open_problem_library" }
}
```

---

## 4. 超时配置（止损）

新增环境变量：

- `MIAODONG_INFERENCE_TIMEOUT_MS`：默认 `3000`

规则：

- handler 使用该值创建 `context.WithTimeout`
- inference client 的 `http.Client.Timeout` 同步使用该值（避免两层不一致）

---

## 5. 错误归因（degraded_reason）

映射策略：

- context deadline exceeded → `timeout`
- 网络错误（dial tcp/connection refused 等）→ `unreachable`
- HTTP 非 2xx → `bad_status`
- JSON decode 失败 → `bad_json`

这些值用于：

- Admin metrics / 诊断
- 移动端 UI 文案（后续可根据 reason 分层提示）

---

## 6. 测试（关键里程碑必须系统）

### 6.1 单元测试（Go）

新增测试覆盖：

- 推理服务返回 500 → `degraded=true` 且 `degraded_reason=bad_status`
- 推理服务不可达（mock transport 返回 dial error）→ `degraded_reason=unreachable`
- 推理服务超时（mock transport 阻塞直到 ctx deadline）→ `degraded_reason=timeout`
- 推理服务返回非法 JSON → `degraded_reason=bad_json`
- 成功路径：`degraded=false` 且补齐 `request_id/content_version/inference_latency_ms`

实现方式：

- 为 `internal/inference.Client` 增加可注入 `HTTP *http.Client`（已具备）
- 在 handler 中允许注入 `inference.NewWithHTTP(baseURL, httpClient)`（新增构造）或在测试中构造 client 注入
- 使用 `httptest.Server` 或自定义 `RoundTripper` 做 deterministic 测试

---

## 7. 验收标准（DoD）

1) `MIAODONG_INFERENCE_TIMEOUT_MS` 生效，handler/client timeout 一致  
2) 降级响应包含 `degraded_reason` 且映射正确  
3) 成功响应包含 `inference_latency_ms`  
4) `go test ./...` 全绿，CI 全绿  

