# Inference Orchestration v0.2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 升级 Go API 的推理编排（`POST /v1/inference`）到 v0.2：超时可配置、降级结构标准化（`degraded_reason`）、成功响应补齐 `inference_latency_ms`，并补齐科学系统测试覆盖成功/失败/超时/坏 JSON。

**Architecture:** 将“超时读取/错误归因/降级响应构造”拆成小函数，保证 handler 可读、可测；inference client 支持使用同一超时；测试用 `httptest.Server` 或自定义 `RoundTripper` 进行 deterministic 模拟。

**Tech Stack:** Go net/http + httptest + 既有 `internal/inference` client。

---

## 0. File Map

**Modify:**
- `services/api/internal/http/handlers/inference.go`（timeout env + latency + degraded_reason）
- `services/api/internal/inference/client.go`（支持可配置 timeout 的构造函数）

**Create:**
- `services/api/internal/http/handlers/inference_v02_test.go`（成功/坏 JSON/500/不可达/超时）

---

## Task 1: 让 inference client timeout 可配置（为 handler 对齐）

**Files:**
- Modify: `services/api/internal/inference/client.go`
- Test: `services/api/internal/inference/client_test.go`（可选）

- [ ] **Step 1: 添加 NewWithTimeout(baseURL, timeout) 构造函数**

在 `client.go` 中新增：

```go
func NewWithTimeout(baseURL string, timeout time.Duration) *Client {
	if timeout <= 0 {
		timeout = 3 * time.Second
	}
	return &Client{
		BaseURL: baseURL,
		HTTP:   &http.Client{Timeout: timeout},
	}
}
```

并让 `New()` 复用它：

```go
func New(baseURL string) *Client {
	return NewWithTimeout(baseURL, 3*time.Second)
}
```

- [ ] **Step 2: go test**

Run:
```bash
cd services/api
go test ./...
```

- [ ] **Step 3: Commit**

```bash
git add services/api/internal/inference/client.go
git commit -m "refactor(inference): add configurable timeout constructor"
```

---

## Task 2: handler 支持可配置 timeout + latency_ms + degraded_reason

**Files:**
- Modify: `services/api/internal/http/handlers/inference.go`

- [ ] **Step 1: 新增 timeout 读取函数**

在 inference.go 内新增：

```go
func inferenceTimeout() time.Duration {
	v := os.Getenv("MIAODONG_INFERENCE_TIMEOUT_MS")
	if v == "" {
		return 3 * time.Second
	}
	ms, err := strconv.Atoi(v)
	if err != nil || ms <= 0 {
		return 3 * time.Second
	}
	return time.Duration(ms) * time.Millisecond
}
```

- [ ] **Step 2: 新增错误归因函数（degraded_reason）**

```go
func degradedReason(err error) string {
	if err == nil {
		return ""
	}
	if errors.Is(err, context.DeadlineExceeded) {
		return "timeout"
	}
	var ne net.Error
	if errors.As(err, &ne) {
		return "unreachable"
	}
	// inference client 在 bad_status / bad_json 时返回 fmt.Errorf("...")，可用 strings.Contains 兜底
	msg := err.Error()
	switch {
	case strings.Contains(msg, "status"):
		return "bad_status"
	case strings.Contains(msg, "invalid character") || strings.Contains(msg, "json"):
		return "bad_json"
	default:
		return "unreachable"
	}
}
```

- [ ] **Step 3: handler 使用 timeout + 记录 latency**

在 handler 内：

```go
t0 := time.Now()
timeout := inferenceTimeout()
ctx, cancel := context.WithTimeout(r.Context(), timeout)
defer cancel()

c := inference.NewWithTimeout(base, timeout)
out, err := c.Infer(ctx, inference.InferReq{AudioURL: in.AudioURL, Context: in.Context})
latency := time.Since(t0).Milliseconds()
```

成功时：

```go
out["inference_latency_ms"] = latency
out["degraded"] = false
```

失败时（降级响应）：

```go
reason := degradedReason(err)
_ = json.NewEncoder(w).Encode(map[string]any{
  "request_id": requestID,
  "schema_version": "1.0",
  "model_version": "degraded",
  "content_version": contentVersion,
  "degraded": true,
  "degraded_reason": reason,
  "message": "...",
  "fallback": map[string]any{"next":"open_problem_library"},
})
```

- [ ] **Step 4: go test**

Run:
```bash
cd services/api
go test ./...
```

- [ ] **Step 5: Commit**

```bash
git add services/api/internal/http/handlers/inference.go
git commit -m "feat(inference): add timeout env, latency and degraded_reason"
```

---

## Task 3: 科学系统测试（成功/失败/超时/坏 JSON/不可达）

**Files:**
- Create: `services/api/internal/http/handlers/inference_v02_test.go`

- [ ] **Step 1: 成功路径（httptest server 返回 JSON）**

```go
func TestInference_SuccessAddsFields(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(200)
		_, _ = w.Write([]byte(`{"schema_version":"1.0","model_version":"stub"}`))
	}))
	defer srv.Close()

	t.Setenv("MIAODONG_INFERENCE_URL", srv.URL)
	t.Setenv("MIAODONG_INFERENCE_TIMEOUT_MS", "3000")

	req := httptest.NewRequest(http.MethodPost, "/v1/inference", strings.NewReader(`{"audio_url":"http://x"}`))
	w := httptest.NewRecorder()
	Inference(w, req)

	if w.Code != 200 {
		t.Fatalf("expected 200 got %d", w.Code)
	}
	var out map[string]any
	_ = json.Unmarshal(w.Body.Bytes(), &out)
	if out["degraded"] != false {
		t.Fatalf("expected degraded=false")
	}
	if out["request_id"] == "" {
		t.Fatalf("missing request_id")
	}
	if _, ok := out["inference_latency_ms"]; !ok {
		t.Fatalf("missing inference_latency_ms")
	}
}
```

- [ ] **Step 2: bad_status（推理服务 500）**

```go
func TestInference_BadStatus(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(500)
	}))
	defer srv.Close()
	t.Setenv("MIAODONG_INFERENCE_URL", srv.URL)

	req := httptest.NewRequest(http.MethodPost, "/v1/inference", strings.NewReader(`{"audio_url":"http://x"}`))
	w := httptest.NewRecorder()
	Inference(w, req)
	var out map[string]any
	_ = json.Unmarshal(w.Body.Bytes(), &out)
	if out["degraded"] != true || out["degraded_reason"] != "bad_status" {
		t.Fatalf("expected bad_status: %v", out)
	}
}
```

- [ ] **Step 3: bad_json（推理服务返回非法 JSON）**

```go
func TestInference_BadJSON(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(200)
		_, _ = w.Write([]byte("{not-json"))
	}))
	defer srv.Close()
	t.Setenv("MIAODONG_INFERENCE_URL", srv.URL)

	req := httptest.NewRequest(http.MethodPost, "/v1/inference", strings.NewReader(`{"audio_url":"http://x"}`))
	w := httptest.NewRecorder()
	Inference(w, req)
	var out map[string]any
	_ = json.Unmarshal(w.Body.Bytes(), &out)
	if out["degraded"] != true || out["degraded_reason"] != "bad_json" {
		t.Fatalf("expected bad_json: %v", out)
	}
}
```

- [ ] **Step 4: timeout（推理服务 sleep 超过 timeout）**

```go
func TestInference_Timeout(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		time.Sleep(50 * time.Millisecond)
		w.WriteHeader(200)
		_, _ = w.Write([]byte(`{"ok":true}`))
	}))
	defer srv.Close()
	t.Setenv("MIAODONG_INFERENCE_URL", srv.URL)
	t.Setenv("MIAODONG_INFERENCE_TIMEOUT_MS", "10")

	req := httptest.NewRequest(http.MethodPost, "/v1/inference", strings.NewReader(`{"audio_url":"http://x"}`))
	w := httptest.NewRecorder()
	Inference(w, req)
	var out map[string]any
	_ = json.Unmarshal(w.Body.Bytes(), &out)
	if out["degraded"] != true || out["degraded_reason"] != "timeout" {
		t.Fatalf("expected timeout: %v", out)
	}
}
```

- [ ] **Step 5: go test**

Run:
```bash
cd services/api
go test ./... -run TestInference_
```
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add services/api/internal/http/handlers/inference_v02_test.go
git commit -m "test(inference): cover degraded reasons and latency"
```

---

## Task 4: 全量验证 + nightly

- [ ] Run: `python3 scripts/ci/validate_repo.py`
- [ ] Run: `cd services/api && go test ./...`
- [ ] 观察 GitHub Actions 全绿
- [ ] nightly：`./scripts/package.sh /workspace/miaodong-nightly.zip`

