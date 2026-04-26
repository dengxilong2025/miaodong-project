# Auth Context + content_version Rollout v0.1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 Go API 中实现“身份识别（从 Authorization 解析 user_id 并注入 context）”与“content_version 灰度（ResolveContentVersion 接 releases）”，并补齐 unit + e2e-db 系统测试覆盖发布/灰度/回滚路径，CI 全绿后生成 nightly。

**Architecture:** 增加 `internal/authctx`（token 解析 + context key + middleware）；在 router 外层包 middleware；在 `internal/content` 增加 `ResolveContentVersionWithDB`（或扩展现有 resolver）通过 DB 读取 releases 并用稳定 hash 做灰度桶；内容 handlers 使用 ctx user_id + resolver 返回的 content_version 回填。

**Tech Stack:** Go net/http + context + Postgres(sql) + GitHub Actions e2e-db。

---

## 0. File Map

**Create:**
- `services/api/internal/authctx/authctx.go`（ParseUserID + context helpers）
- `services/api/internal/authctx/middleware.go`（HTTP middleware：注入 user_id）
- `services/api/internal/authctx/authctx_test.go`（unit：token 解析）

**Modify:**
- `services/api/internal/http/router.go`（给 mux 套 middleware）
- `services/api/internal/content/version.go`（resolver 接 releases + 灰度）
- `services/api/internal/http/handlers/content.go`（把 ctx user_id 传给 resolver）
- `.github/workflows/ci.yml`（e2e-db 新增 “E2E: content_version rollout” step）

---

## Task 1: token 解析 + auth context middleware（unit test 先行）

**Files:**
- Create: `services/api/internal/authctx/authctx_test.go`
- Create: `services/api/internal/authctx/authctx.go`
- Create: `services/api/internal/authctx/middleware.go`
- Modify: `services/api/internal/http/router.go`

- [ ] **Step 1: 写失败测试：ParseUserID**

`services/api/internal/authctx/authctx_test.go`

```go
package authctx

import "testing"

func TestParseUserID_OK(t *testing.T) {
	got := ParseUserID("Bearer dev-token-u_abc")
	if got != "u_abc" {
		t.Fatalf("expected u_abc got %q", got)
	}
}

func TestParseUserID_Empty(t *testing.T) {
	got := ParseUserID("")
	if got != "" {
		t.Fatalf("expected empty got %q", got)
	}
}

func TestParseUserID_BadPrefix(t *testing.T) {
	got := ParseUserID("Bearer xxx")
	if got != "" {
		t.Fatalf("expected empty got %q", got)
	}
}
```

- [ ] **Step 2: 实现 ParseUserID + context key helpers**

`services/api/internal/authctx/authctx.go`

```go
package authctx

import (
	"context"
	"strings"
)

type ctxKey string

const userIDKey ctxKey = "user_id"

func ParseUserID(authHeader string) string {
	authHeader = strings.TrimSpace(authHeader)
	if authHeader == "" {
		return ""
	}
	const bearer = "Bearer "
	if !strings.HasPrefix(authHeader, bearer) {
		return ""
	}
	token := strings.TrimSpace(strings.TrimPrefix(authHeader, bearer))
	const prefix = "dev-token-"
	if !strings.HasPrefix(token, prefix) {
		return ""
	}
	userID := strings.TrimPrefix(token, prefix)
	return strings.TrimSpace(userID)
}

func WithUserID(ctx context.Context, userID string) context.Context {
	if userID == "" {
		return ctx
	}
	return context.WithValue(ctx, userIDKey, userID)
}

func UserID(ctx context.Context) string {
	v := ctx.Value(userIDKey)
	if s, ok := v.(string); ok {
		return s
	}
	return ""
}
```

- [ ] **Step 3: 实现 middleware（不强制，能解析就注入）**

`services/api/internal/authctx/middleware.go`

```go
package authctx

import "net/http"

func Middleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		userID := ParseUserID(r.Header.Get("Authorization"))
		r = r.WithContext(WithUserID(r.Context(), userID))
		next.ServeHTTP(w, r)
	})
}
```

- [ ] **Step 4: router.go 套 middleware**

`services/api/internal/http/router.go`

```go
import "github.com/dengxilong2025/miaodong-project/services/api/internal/authctx"
...
return authctx.Middleware(mux)
```

- [ ] **Step 5: go test**

Run:
```bash
cd services/api
go test ./... -run TestParseUserID_
```

- [ ] **Step 6: Commit**

```bash
git add services/api/internal/authctx services/api/internal/http/router.go
git commit -m "feat(auth): parse user_id from bearer token into context"
```

---

## Task 2: ResolveContentVersion 接 releases + 灰度桶（hash user_id）

**Files:**
- Modify: `services/api/internal/content/version.go`
- Create: `services/api/internal/content/rollout.go`
- Create: `services/api/internal/content/rollout_test.go`

- [ ] **Step 1: 新增灰度桶函数（可测）**

`services/api/internal/content/rollout.go`

```go
package content

import "hash/fnv"

func userBucket(userID string) int {
	if userID == "" {
		return -1
	}
	h := fnv.New32a()
	_, _ = h.Write([]byte(userID))
	return int(h.Sum32() % 100)
}
```

`services/api/internal/content/rollout_test.go`

```go
package content

import "testing"

func TestUserBucket_Stable(t *testing.T) {
	a := userBucket("u_abc")
	b := userBucket("u_abc")
	if a != b {
		t.Fatalf("bucket not stable: %d vs %d", a, b)
	}
	if a < 0 || a >= 100 {
		t.Fatalf("bucket out of range: %d", a)
	}
}
```

- [ ] **Step 2: 扩展 ResolveContentVersion 增加 db 参数（或新增 ResolveContentVersionDB）**

为避免改动过大，新增函数：

```go
func ResolveContentVersionDB(ctx context.Context, db *sql.DB, userID string, explicit *int) (int, error)
```

实现逻辑（伪代码）：
- explicit != nil → return *explicit
- 查 latest published：
  ```sql
  select content_version, rollout_percent
    from releases
   where status='published'
   order by content_version desc
   limit 1
  ```
  若无行 → return 1
- rollout_percent==100 → return latest
- 查 prev published：
  ```sql
  select content_version
    from releases
   where status='published' and content_version < $1
   order by content_version desc
   limit 1
  ```
  若无行 → prev=1
- 若 userID=="" → return prev
- bucket := userBucket(userID)
- if bucket < rollout_percent → return latest else return prev

保留原 `ResolveContentVersion(...)`（无 DB）用于已有调用；内容 handlers 切到 DB 版。

- [ ] **Step 3: go test**

Run:
```bash
cd services/api
go test ./...
```

- [ ] **Step 4: Commit**

```bash
git add services/api/internal/content/version.go services/api/internal/content/rollout.go services/api/internal/content/rollout_test.go
git commit -m "feat(content): resolve content_version from releases with rollout"
```

---

## Task 3: 内容 handlers 使用 ctx user_id + resolver（DB版）

**Files:**
- Modify: `services/api/internal/http/handlers/content.go`

- [ ] **Step 1: 从 ctx 读取 user_id**

```go
userID := authctx.UserID(r.Context())
```

- [ ] **Step 2: 调用 ResolveContentVersionDB**

替换原本固定 resolver：

```go
cv, err := content.ResolveContentVersionDB(r.Context(), conn, userID, explicitCV)
```

> 注意：handlers 里已经打开 db conn，可直接复用。

- [ ] **Step 3: go test**

Run:
```bash
cd services/api
go test ./...
```

- [ ] **Step 4: Commit**

```bash
git add services/api/internal/http/handlers/content.go
git commit -m "feat(api): use user_id and releases rollout for content_version"
```

---

## Task 4: e2e-db 系统测试：发布/灰度/回滚覆盖

**Files:**
- Modify: `.github/workflows/ci.yml`

- [ ] **Step 1: 新增 step：E2E: content_version rollout**

流程（脚本落到 YAML）：
1) 启动 API（后台）等待 `/v1/health`
2) `POST /admin/release` 发布 v1（rollout_percent=100）
3) `POST /admin/release` 发布 v2（rollout_percent=10）
4) 用两个 user_id 调 `/v1/problems?limit=1`：
   - `Authorization: Bearer dev-token-u_a`
   - `Authorization: Bearer dev-token-u_b`
   - 断言返回 `content_version` ∈ {1,2}（允许两者相同，但打印出来，确保逻辑执行）
5) `POST /admin/rollback` 回滚到 v1
6) 再调用 `/v1/problems`，断言 `content_version==1`

Python 断言示例：
```python
assert cv in (1,2)
```

- [ ] **Step 2: Commit**

```bash
git add .github/workflows/ci.yml
git commit -m "test(ci): add e2e content_version rollout checks"
```

---

## Task 5: 全量验证 + nightly

- [ ] Run: `python3 scripts/ci/validate_repo.py`
- [ ] Run: `cd services/api && go test ./...`
- [ ] 观察 GitHub Actions 全绿（validate/go-api/python-inference/e2e-db）
- [ ] nightly：`./scripts/package.sh /workspace/miaodong-nightly.zip`

