# 喵懂（喵测）MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 8 周内交付可灰度发布的喵懂 MVP：Flutter 双端 App（测一测 + 问题库 + 结果页闭环）+ Go 业务 API（内容版本/灰度/回滚 + 同步推理编排）+ Python 推理服务（先规则/占位 + 音频标准化接口）+ 运营后台（内容编辑与发布中心）+ P0 埋点闭环。

**Architecture:** 客户端 Flutter；云端分域：Go API/BFF + Python 推理服务；内容与策略两层（Postgres 权威内容 + runtime_config 策略）；发布系统产出 `content_version` 并支持灰度/回滚；推理同步返回、可降级。

**Tech Stack:** Flutter；Go（Gin + pgx + sqlc）；Python（FastAPI）；Postgres；Redis（可选，先用于缓存与限流）；对象存储（MinIO 本地 + S3/OSS 线上）；Docker Compose；OpenAPI。

---

## File Structure（将要创建/修改的关键文件）

**Create (new):**
- `apps/mobile/`：Flutter 工程（后续用 `flutter create` 生成）
- `services/api/`：Go API（Gin）
  - `services/api/cmd/api/main.go`
  - `services/api/internal/http/router.go`
  - `services/api/internal/http/handlers/*.go`
  - `services/api/internal/store/*`（sqlc/pgx）
  - `services/api/migrations/*.sql`（goose）
  - `services/api/openapi/openapi.yaml`
- `services/inference/`：Python 推理服务（FastAPI）
  - `services/inference/app/main.py`
  - `services/inference/app/schemas.py`
  - `services/inference/tests/test_infer.py`
- `infra/docker-compose.yml`
- `infra/minio/`（本地对象存储配置）
- `docs/ops/RELEASE_PLAYBOOK.md`（发布/灰度/回滚操作手册）

**Modify (existing):**
- `data/seed/miaodong-seed-v1.json`（随着内容迭代更新）
- `docs/tech/API_CONTRACT.md`（随字段落地微调）

---

## Task 1: 初始化本地开发环境（Docker Compose + 代码骨架）

**Files:**
- Create: `infra/docker-compose.yml`
- Create: `services/api/go.mod`
- Create: `services/inference/pyproject.toml`（或 `requirements.txt`）

- [ ] **Step 1: 新建 Docker Compose（Postgres + MinIO + 可选 Redis）**

创建 `infra/docker-compose.yml`（最小可跑）：

```yaml
services:
  postgres:
    image: postgres:16
    environment:
      POSTGRES_PASSWORD: postgres
      POSTGRES_USER: postgres
      POSTGRES_DB: miaodong
    ports: ["5432:5432"]
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U postgres -d miaodong"]
      interval: 3s
      timeout: 3s
      retries: 20
  minio:
    image: minio/minio:RELEASE.2024-10-13T13-34-11Z
    command: server /data --console-address ":9001"
    environment:
      MINIO_ROOT_USER: minio
      MINIO_ROOT_PASSWORD: minio123456
    ports: ["9000:9000","9001:9001"]
  redis:
    image: redis:7
    ports: ["6379:6379"]
```

- [ ] **Step 2: 为 Go API 初始化模块**

在 `services/api/go.mod` 写入：

```go
module miaodong/services/api

go 1.22
```

- [ ] **Step 3: 为 Python 推理服务初始化依赖**

在 `services/inference/requirements.txt` 写入：

```txt
fastapi==0.115.0
uvicorn[standard]==0.30.6
pydantic==2.8.2
pytest==8.3.2
httpx==0.27.2
```

- [ ] **Step 4: 运行本地依赖服务验证**

Run: `docker compose -f infra/docker-compose.yml up -d`

Expected:
- Postgres 监听 5432
- MinIO 监听 9000/9001

- [ ] **Step 5: Commit**

Commit message: `chore: bootstrap local infra (postgres/minio/redis)`

---

## Task 2: 内容与发布系统的数据模型（Postgres migrations）

**Files:**
- Create: `services/api/migrations/0001_init.sql`
- Create: `services/api/migrations/0002_content_versioning.sql`

- [ ] **Step 1: 编写 0001_init.sql（基础表）**

`services/api/migrations/0001_init.sql`：

```sql
-- +goose Up
create table if not exists users (
  id text primary key,
  created_at timestamptz not null default now()
);

create table if not exists pets (
  id text primary key,
  user_id text not null references users(id),
  name text,
  age_group text,
  multi_cat_home boolean,
  created_at timestamptz not null default now()
);

-- 运营内容：权威层
create table if not exists problems (
  id text primary key,
  title text not null,
  summary text not null,
  tags jsonb not null default '[]'::jsonb,
  cause_framework jsonb not null default '[]'::jsonb,
  retest_plan_72h jsonb not null default '[]'::jsonb,
  risk_level_copy jsonb not null default '{}'::jsonb,
  status text not null default 'draft',
  updated_at timestamptz not null default now()
);

create table if not exists questions (
  id text primary key,
  problem_id text references problems(id),
  priority int not null default 0,
  text text not null,
  type text not null,
  options jsonb not null default '[]'::jsonb,
  condition jsonb not null default '{}'::jsonb,
  status text not null default 'draft',
  updated_at timestamptz not null default now()
);

create table if not exists suggestions (
  id text primary key,
  problem_id text references problems(id),
  priority int not null default 0,
  title text not null,
  steps jsonb not null default '[]'::jsonb,
  expected_window_hours int not null default 0,
  retest_tip text not null default '',
  condition jsonb not null default '{}'::jsonb,
  status text not null default 'draft',
  updated_at timestamptz not null default now()
);

create table if not exists tools_guides (
  id text primary key,
  problem_id text unique references problems(id),
  collapsed_by_default boolean not null default true,
  guide_bullets jsonb not null default '[]'::jsonb,
  efficiency_items jsonb not null default '[]'::jsonb,
  status text not null default 'draft',
  updated_at timestamptz not null default now()
);

-- 策略层（先放 DB，后续可抽到配置中心）
create table if not exists runtime_config (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);

-- 埋点（MVP 先落库）
create table if not exists analytics_events (
  id bigserial primary key,
  event_name text not null,
  ts_ms bigint not null,
  user_id text,
  session_id text,
  platform text,
  app_version text,
  content_version int,
  request_id text,
  payload jsonb not null default '{}'::jsonb
);

-- +goose Down
drop table if exists analytics_events;
drop table if exists runtime_config;
drop table if exists tools_guides;
drop table if exists suggestions;
drop table if exists questions;
drop table if exists problems;
drop table if exists pets;
drop table if exists users;
```

- [ ] **Step 2: 编写 0002_content_versioning.sql（发布/灰度/回滚）**

`services/api/migrations/0002_content_versioning.sql`：

```sql
-- +goose Up
create table if not exists releases (
  content_version int primary key,
  status text not null default 'published',
  rollout_percent int not null default 100,
  created_by text not null,
  created_at timestamptz not null default now(),
  notes text not null default ''
);

create table if not exists audit_log (
  id bigserial primary key,
  actor text not null,
  action text not null,
  entity_type text not null,
  entity_id text,
  diff jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
-- +goose Down
drop table if exists audit_log;
drop table if exists releases;
```

- [ ] **Step 3: 添加 Goose（迁移工具）并跑迁移**

Run:
- `go install github.com/pressly/goose/v3/cmd/goose@latest`
- `goose -dir services/api/migrations postgres "postgres://postgres:postgres@localhost:5432/miaodong?sslmode=disable" up`

Expected: migrations applied successfully

- [ ] **Step 4: Commit**

Commit message: `feat(api): add postgres schema for content, releases and analytics`

---

## Task 3: Go API（基础 HTTP 服务 + 健康检查 + OpenAPI）

**Files:**
- Create: `services/api/cmd/api/main.go`
- Create: `services/api/internal/http/router.go`
- Create: `services/api/internal/http/handlers/health.go`
- Create: `services/api/openapi/openapi.yaml`
- Test: `services/api/internal/http/handlers/health_test.go`

- [ ] **Step 1: 写 failing test（health endpoint）**

`services/api/internal/http/handlers/health_test.go`：

```go
package handlers

import (
  "net/http"
  "net/http/httptest"
  "testing"
)

func TestHealth(t *testing.T) {
  r := NewRouter(nil)
  req := httptest.NewRequest(http.MethodGet, "/v1/health", nil)
  w := httptest.NewRecorder()
  r.ServeHTTP(w, req)
  if w.Code != 200 {
    t.Fatalf("expected 200, got %d", w.Code)
  }
}
```

- [ ] **Step 2: 实现 Router + Health Handler**

`services/api/internal/http/router.go`（Gin）：

```go
package http

import (
  "github.com/gin-gonic/gin"
  "miaodong/services/api/internal/http/handlers"
)

type Deps struct{}

func NewRouter(_ *Deps) *gin.Engine {
  r := gin.New()
  r.Use(gin.Recovery())
  v1 := r.Group("/v1")
  v1.GET("/health", handlers.Health)
  return r
}
```

`services/api/internal/http/handlers/health.go`：

```go
package handlers

import "github.com/gin-gonic/gin"

func Health(c *gin.Context) {
  c.JSON(200, gin.H{"status": "ok"})
}
```

`services/api/cmd/api/main.go`：

```go
package main

import (
  "log"
  "os"
  "miaodong/services/api/internal/http"
)

func main() {
  port := os.Getenv("PORT")
  if port == "" { port = "8080" }
  r := http.NewRouter(&http.Deps{})
  log.Printf("listening on :%s", port)
  _ = r.Run(":" + port)
}
```

- [ ] **Step 3: Run tests**

Run: `go test ./...`
Expected: PASS

- [ ] **Step 4: Commit**

Commit message: `feat(api): bootstrap gin server with /v1/health`

---

## Task 4: 身份（匿名 token）与用户落库（MVP）

**Files:**
- Create: `services/api/internal/http/handlers/auth.go`
- Create: `services/api/internal/auth/token.go`
- Modify: `services/api/internal/http/router.go`
- Test: `services/api/internal/auth/token_test.go`

- [ ] **Step 1: 生成与校验 token（HMAC）**

`services/api/internal/auth/token.go`：

```go
package auth

import (
  "crypto/hmac"
  "crypto/sha256"
  "encoding/base64"
  "fmt"
  "time"
)

func Sign(userID string, secret []byte, exp time.Time) string {
  payload := fmt.Sprintf("%s.%d", userID, exp.Unix())
  mac := hmac.New(sha256.New, secret)
  mac.Write([]byte(payload))
  sig := base64.RawURLEncoding.EncodeToString(mac.Sum(nil))
  return base64.RawURLEncoding.EncodeToString([]byte(payload)) + "." + sig
}
```

`services/api/internal/auth/token_test.go`：

```go
package auth

import (
  "testing"
  "time"
)

func TestSignDeterministic(t *testing.T) {
  tok := Sign("u_1", []byte("k"), time.Unix(1700000000, 0))
  if tok == "" { t.Fatal("empty token") }
}
```

- [ ] **Step 2: 实现 /v1/auth/anonymous（先返回 token + user_id）**

`services/api/internal/http/handlers/auth.go`：

```go
package handlers

import (
  "net/http"
  "time"
  "github.com/gin-gonic/gin"
  "github.com/google/uuid"
  "miaodong/services/api/internal/auth"
)

type AuthDeps struct {
  Secret []byte
}

func AnonymousAuth(d AuthDeps) gin.HandlerFunc {
  return func(c *gin.Context) {
    uid := "u_" + uuid.NewString()
    exp := time.Now().Add(30 * 24 * time.Hour)
    tok := auth.Sign(uid, d.Secret, exp)
    c.JSON(http.StatusOK, gin.H{"token": tok, "user_id": uid, "expires_in": int64(30 * 24 * 3600)})
  }
}
```

- [ ] **Step 3: 挂路由并运行**

在 `router.go` 增加：

```go
v1.POST("/auth/anonymous", handlers.AnonymousAuth(handlers.AuthDeps{Secret: []byte("dev-secret")}))
```

- [ ] **Step 4: Commit**

Commit message: `feat(api): add anonymous auth token endpoint`

---

## Task 5: 同步推理编排（Go→Python）与“可降级结果结构”

**Files:**
- Create: `services/api/internal/http/handlers/inference.go`
- Create: `services/api/internal/inference/client.go`
- Modify: `services/api/internal/http/router.go`
- Test: `services/api/internal/http/handlers/inference_test.go`

- [ ] **Step 1: 定义推理响应结构（与 docs/tech/API_CONTRACT.md 对齐）**

在 `services/api/internal/http/handlers/inference.go` 中定义最小结构体（只列 MVP 关键字段）：

```go
type InferenceResponse struct {
  RequestID      string `json:"request_id"`
  SchemaVersion  string `json:"schema_version"`
  ModelVersion   string `json:"model_version"`
  ContentVersion int    `json:"content_version"`
  PrimaryIntent  any    `json:"primary_intent,omitempty"`
  Explanations   []any  `json:"explanations,omitempty"`
  RiskBadges     []any  `json:"risk_badges,omitempty"`
  FollowupQuestion any  `json:"followup_question,omitempty"`
  Suggestions    []any  `json:"suggestions,omitempty"`
  RiskLevel      any    `json:"risk_level,omitempty"`
  OptionalToolsSection any `json:"optional_tools_section,omitempty"`
  ShareAsset     any    `json:"share_asset,omitempty"`
  Degraded       bool   `json:"degraded"`
}
```

- [ ] **Step 2: 实现 Python 推理 client（httpx 等价 Go 实现）**

`services/api/internal/inference/client.go`：

```go
package inference

import (
  "bytes"
  "context"
  "encoding/json"
  "net/http"
  "time"
)

type Client struct {
  BaseURL string
  HTTP    *http.Client
}

type InferReq struct {
  AudioURL string                 `json:"audio_url"`
  Context  map[string]any         `json:"context,omitempty"`
}

func (c *Client) Infer(ctx context.Context, req InferReq) (map[string]any, error) {
  b, _ := json.Marshal(req)
  r, _ := http.NewRequestWithContext(ctx, http.MethodPost, c.BaseURL+"/infer", bytes.NewReader(b))
  r.Header.Set("Content-Type", "application/json")
  resp, err := c.HTTP.Do(r)
  if err != nil { return nil, err }
  defer resp.Body.Close()
  var out map[string]any
  if err := json.NewDecoder(resp.Body).Decode(&out); err != nil { return nil, err }
  return out, nil
}

func New(base string) *Client {
  return &Client{BaseURL: base, HTTP: &http.Client{Timeout: 3 * time.Second}}
}
```

- [ ] **Step 3: 实现 /v1/inference（失败降级仍返回结构）**

降级策略：Python 不可用/超时 → 返回 `degraded=true`，并提示“稍后再试 + 进入问题库”。

- [ ] **Step 4: Commit**

Commit message: `feat(api): add sync inference orchestrator with graceful degradation`

---

## Task 6: Python 推理服务（占位实现 + 契约稳定）

**Files:**
- Create: `services/inference/app/main.py`
- Create: `services/inference/app/schemas.py`
- Test: `services/inference/tests/test_infer.py`

- [ ] **Step 1: 定义请求/响应 schema（Pydantic）**

`services/inference/app/schemas.py`：

```python
from pydantic import BaseModel, Field
from typing import Any, Dict, List, Optional

class InferRequest(BaseModel):
    audio_url: str
    context: Dict[str, Any] = Field(default_factory=dict)

class InferResponse(BaseModel):
    schema_version: str = "1.0"
    model_version: str = "stub-0.1"
    primary_intent: Optional[Dict[str, Any]] = None
    explanations: List[Dict[str, Any]] = Field(default_factory=list)
    risk_badges: List[Dict[str, Any]] = Field(default_factory=list)
```

- [ ] **Step 2: 实现 /infer（先用规则/随机占位，便于前后端联调）**

`services/inference/app/main.py`：

```python
from fastapi import FastAPI
from .schemas import InferRequest, InferResponse

app = FastAPI()

@app.post("/infer", response_model=InferResponse)
def infer(req: InferRequest) -> InferResponse:
    # MVP 联调用占位：根据 context 提示返回更“像样”的结果
    time_of_day = str(req.context.get("time_of_day", ""))
    if time_of_day == "night":
        intent = {"code": "PLAY", "label": "想玩/精力过剩", "confidence": 0.72}
        expl = [{"factor": "CONTEXT", "text": "发生在夜间时段，较常与精力未消耗有关"}]
    else:
        intent = {"code": "ATTENTION", "label": "求关注/求陪伴", "confidence": 0.66}
        expl = [{"factor": "PATTERN", "text": "叫声更像在发起互动"}]
    return InferResponse(primary_intent=intent, explanations=expl)
```

- [ ] **Step 3: 写测试**

`services/inference/tests/test_infer.py`：

```python
from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)

def test_infer_returns_schema():
    r = client.post("/infer", json={"audio_url":"http://example.com/a.m4a","context":{"time_of_day":"night"}})
    assert r.status_code == 200
    j = r.json()
    assert j["schema_version"] == "1.0"
    assert j["primary_intent"]["code"] == "PLAY"
```

- [ ] **Step 4: Commit**

Commit message: `feat(inference): add fastapi stub infer service for integration`

---

## Task 7: 运营后台（MVP：内容编辑 + 发布中心 + 看板）

**Files:**
- Create: `apps/admin/`（Next.js or 任意你团队熟的 Web 栈）
- Modify: `services/api` 增加 `/admin/*` API（CRUD + release）

- [ ] **Step 1: 先落 API（CRUD + 发布）再做 UI**

新增 Go handler（示例路径）：
- `POST /admin/problems` `PATCH /admin/problems/:id` `GET /admin/problems`
- `POST /admin/release`（生成 content_version、设置灰度）
- `POST /admin/rollback`（回滚到上一版本）
- `GET /admin/metrics/problems`（按 problem 聚合的有用率/复测率/分享率等）

- [ ] **Step 2: UI 仅做 7 个页面（见 docs/product/ADMIN_CONSOLE_MVP.md）**

以 `docs/product/ADMIN_CONSOLE_MVP.md` 为验收标准，页面全部打通即可。

- [ ] **Step 3: Commit**

Commit message: `feat(admin): add mvp console (content + release + metrics)`

---

## Task 8: Flutter App（MVP：测一测 → 结果页 → 问题库 → 复测）

**Files:**
- Create: `apps/mobile/*`（Flutter 工程生成后修改）

- [ ] **Step 1: App 最小页面流**

1) 首页（测一测 / 问题库）  
2) 录音页（10秒上限）  
3) 上传 + 调用 `/v1/inference`  
4) 结果页（意图/解释/追问/建议/复测入口/分享导出）  
5) 问题库列表与详情页

- [ ] **Step 2: 分享物料最小实现**

先实现“保存结果卡图片 + 复制小红书文案模板”。

- [ ] **Step 3: Commit**

Commit message: `feat(mobile): implement mvp flow (record->infer->result->share)`

---

## Task 9: 种子数据导入与一致性校验

**Files:**
- Use: `data/seed/miaodong-seed-v1.json`

- [ ] **Step 1: 在 API 里实现 seed import 命令**

新增 `services/api/cmd/seed/main.go`：读取 `data/seed/miaodong-seed-v1.json` 写入 problems/questions/suggestions/tools_guides/runtime_config。

- [ ] **Step 2: 写一条校验命令**

校验：Top3 problem 是否齐全、每个 problem 是否至少 3 个 question、2 个 suggestion、1 个 tools guide、分享模板是否存在。

- [ ] **Step 3: Commit**

Commit message: `chore: add seed importer and validation for content v1`

---

## Self-Review（覆盖检查）

- 能力边界：意图标签+证据解释+建议+复测+风险分级（与 PRD 一致）  
- 运营能力：内容可编辑、版本/灰度/回滚、看板指标（与 ADMIN_CONSOLE_MVP 一致）  
- 数据闭环：事件字典与指标口径落地（与 ANALYTICS_SPEC 一致）  
- 冷启动：分享链路与“可晒产物”对齐（与 COLD_START_XHS 一致）

---

## Execution Handoff

计划已就绪（本文件）。两种执行方式你选一个：

1) **Subagent-Driven（推荐）**：我按 Task 逐个派子代理实现，每个 Task 完成后你 review 再继续  
2) **Inline Execution**：我在当前会话内按 Task 执行，分阶段给你检查点

你想选 1 还是 2？

