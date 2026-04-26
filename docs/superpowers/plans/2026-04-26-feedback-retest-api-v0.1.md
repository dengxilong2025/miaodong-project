# Feedback & Retest API v0.1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 新增 `POST /v1/feedback` 与 `POST /v1/retest`，将用户反馈与复测关联写入 `analytics_events`（event_name=feedback_submitted / retest_submitted），并补齐 unit（400/405）+ e2e-db 系统测试（写入→/admin/metrics 可统计），CI 全绿后生成 nightly。

**Architecture:** 新增 `internal/engagement` 模块封装写事件；handlers 只做 method/JSON/字段校验，写入时复用 `internal/db` 连接；e2e-db 用真实 Postgres+seed，写入反馈/复测事件后再调用 metrics 断言。

**Tech Stack:** Go net/http + Postgres + GitHub Actions e2e-db + 既有 metrics 聚合接口。

---

## 0. File Map

**Create:**
- `services/api/internal/engagement/events.go`
- `services/api/internal/http/handlers/feedback.go`
- `services/api/internal/http/handlers/retest.go`
- `services/api/internal/http/handlers/feedback_retest_test.go`（unit：400/405）

**Modify:**
- `services/api/internal/http/router.go`（挂载 /v1/feedback /v1/retest）
- `.github/workflows/ci.yml`（e2e-db 新增 “E2E: feedback & retest”）

---

## Task 1: engagement 写事件模块（可复用、可测）

**Files:**
- Create: `services/api/internal/engagement/events.go`

- [ ] **Step 1: 定义 request structs（与 API 契约一致）**

```go
type FeedbackReq struct {
	RequestID      string `json:"request_id"`
	Helpful        *bool  `json:"helpful"`
	IntentMatch    string `json:"intent_match"`
	Notes          string `json:"notes"`
	ProblemID      string `json:"problem_id"`
	ContentVersion *int   `json:"content_version"`
}

type RetestReq struct {
	ProblemID         string `json:"problem_id"`
	BaselineRequestID string `json:"baseline_request_id"`
	CurrentRequestID  string `json:"current_request_id"`
	Notes             string `json:"notes"`
	ContentVersion    *int   `json:"content_version"`
}
```

> 说明：Helpful 用 *bool 以便区分“未传”与 false。

- [ ] **Step 2: 实现 WriteFeedbackEvent / WriteRetestEvent（insert analytics_events）**

插入字段：
- `event_name`
- `ts_ms`
- `content_version`（可空）
- `request_id`
- `payload`（jsonb）

示例（WriteFeedbackEvent）：

```go
func WriteFeedbackEvent(ctx context.Context, db *sql.DB, r FeedbackReq) error {
	ts := time.Now().UnixMilli()
	payload := map[string]any{
		"helpful": r.Helpful,
		"intent_match": r.IntentMatch,
		"notes": r.Notes,
	}
	if r.ProblemID != "" {
		payload["problem_id"] = r.ProblemID
	}
	b, _ := json.Marshal(payload)

	_, err := db.ExecContext(ctx, `
insert into analytics_events (event_name, ts_ms, content_version, request_id, payload)
values ($1,$2,$3,$4,$5::jsonb)
`, "feedback_submitted", ts, r.ContentVersion, r.RequestID, string(b))
	return err
}
```

WriteRetestEvent 同理，event_name=`retest_submitted`，request_id=`current_request_id`，payload 包含 baseline/current/problem_id/notes。

- [ ] **Step 3: go test（编译通过即可）**

Run:
```bash
cd services/api
go test ./...
```

- [ ] **Step 4: Commit**

```bash
git add services/api/internal/engagement/events.go
git commit -m "feat(engagement): write feedback and retest events"
```

---

## Task 2: handlers（字段校验 + 405/400）

**Files:**
- Create: `services/api/internal/http/handlers/feedback.go`
- Create: `services/api/internal/http/handlers/retest.go`
- Modify: `services/api/internal/http/router.go`

- [ ] **Step 1: feedback handler（POST /v1/feedback）**

校验：
- method 必须 POST，否则 405
- JSON decode 失败 400
- request_id 必填
- helpful 必填（nil 则 400）
- intent_match 可选；若非空必须为 match/partial/mismatch
- content_version 可选；若存在必须 >0

写入：
- 打开 DB（复用 `internal/db`）
- 调 `engagement.WriteFeedbackEvent`
- 返回 `{ "ok": true }`

- [ ] **Step 2: retest handler（POST /v1/retest）**

校验：
- method POST，否则 405
- problem_id/baseline_request_id/current_request_id 必填
- content_version 可选；若存在必须 >0

写入：
- `engagement.WriteRetestEvent`
- 返回 `{ "ok": true }`

- [ ] **Step 3: router 挂载**

在 `router.go` 中新增：
```go
mux.HandleFunc("/v1/feedback", handlers.Feedback)
mux.HandleFunc("/v1/retest", handlers.Retest)
```

- [ ] **Step 4: go test**

Run:
```bash
cd services/api
go test ./...
```

- [ ] **Step 5: Commit**

```bash
git add services/api/internal/http/handlers/feedback.go services/api/internal/http/handlers/retest.go services/api/internal/http/router.go
git commit -m "feat(api): add feedback and retest endpoints"
```

---

## Task 3: unit tests（不连 DB 的 400/405）

**Files:**
- Create: `services/api/internal/http/handlers/feedback_retest_test.go`

- [ ] **Step 1: feedback 缺字段 → 400**

```go
func TestFeedback_MissingRequestID(t *testing.T) {
	w := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost, "/v1/feedback", strings.NewReader(`{"helpful":true}`))
	Feedback(w, req)
	if w.Code != 400 { t.Fatalf("expected 400 got %d", w.Code) }
}
```

```go
func TestFeedback_MissingHelpful(t *testing.T) {
	w := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost, "/v1/feedback", strings.NewReader(`{"request_id":"r1"}`))
	Feedback(w, req)
	if w.Code != 400 { t.Fatalf("expected 400 got %d", w.Code) }
}
```

- [ ] **Step 2: feedback 非 POST → 405**
- [ ] **Step 3: retest 缺字段 → 400**
- [ ] **Step 4: retest 非 POST → 405**

- [ ] **Step 5: go test**

Run:
```bash
cd services/api
go test ./... -run TestFeedback_
```

- [ ] **Step 6: Commit**

```bash
git add services/api/internal/http/handlers/feedback_retest_test.go
git commit -m "test(api): add feedback/retest contract tests"
```

---

## Task 4: e2e-db 系统测试（写入→metrics 可统计）

**Files:**
- Modify: `.github/workflows/ci.yml`

- [ ] **Step 1: 在 e2e-db job 新增 step：E2E: feedback & retest**

脚本逻辑：
1) 启动 API（后台）并等待 `/v1/health`
2) 计算窗口 `[now-10m, now+10m]`
3) `POST /v1/feedback` 写入 helpful=true（带 problem_id=night_meow）
4) `POST /v1/retest` 写入一条（baseline/current）
5) 调 `/admin/metrics?from_ts_ms=&to_ts_ms=` 断言：
   - `feedback.total >= 1`
   - `feedback.helpful_rate > 0`
   - `by_event_name` 中 `retest_submitted >= 1`

Python 断言示例：
```python
assert data["feedback"]["total"] >= 1
assert data["feedback"]["helpful_rate"] > 0
assert data["by_event_name"].get("retest_submitted", 0) >= 1
```

- [ ] **Step 2: Commit**

```bash
git add .github/workflows/ci.yml
git commit -m "test(ci): add e2e feedback and retest checks"
```

---

## Task 5: 全量验证 + nightly

- [ ] Run: `python3 scripts/ci/validate_repo.py`
- [ ] Run: `cd services/api && go test ./...`
- [ ] 观察 GitHub Actions 全绿（validate/go-api/python-inference/e2e-db）
- [ ] nightly：`./scripts/package.sh /workspace/miaodong-nightly.zip`

