# Admin Content CRUD v0.1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为运营后台增加内容 CRUD：questions / suggestions / tools_guides（draft/published/archived），所有写操作落 audit_log，并新增 e2e-db 系统测试验证“Admin 改内容 → /v1/problems/{id} 可读到变化”闭环。

**Architecture:** 复用现有 admin handler 模式：每个资源一个 handlers 文件，包含 list/get/create/patch（tools_guides 用 put upsert）；SQL 与 `admin_problems.go` 对齐；所有写入使用事务并调用 `insertAudit(...)`。e2e-db 在 seed 后启动 API，调用 admin CRUD 后再读取内容 API 断言。

**Tech Stack:** Go net/http + Postgres(sql) + GitHub Actions e2e-db。

---

## 0. File Map

**Create:**
- `services/api/internal/http/handlers/admin_questions.go`
- `services/api/internal/http/handlers/admin_suggestions.go`
- `services/api/internal/http/handlers/admin_tools_guides.go`
- `services/api/internal/http/handlers/admin_content_crud_test.go`（unit：400/405，不连 DB）

**Modify:**
- `services/api/internal/http/router.go`（挂载新 admin 路由）
- `.github/workflows/ci.yml`（e2e-db 新增 “E2E: admin content crud”）

---

## Task 1: Admin Questions CRUD（list/create/get/patch）

**Files:**
- Create: `services/api/internal/http/handlers/admin_questions.go`
- Modify: `services/api/internal/http/router.go`

- [ ] **Step 1: 新增 handler 壳（鉴权 + method switch）**

```go
// AdminQuestions handles:
// - GET  /admin/questions?problem_id=...
// - POST /admin/questions
func AdminQuestions(w http.ResponseWriter, r *http.Request) {
  if !requireAdmin(w, r) { return }
  switch r.Method {
  case http.MethodGet:
    adminListQuestions(w, r)
  case http.MethodPost:
    adminCreateQuestion(w, r)
  default:
    http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
  }
}

// AdminQuestionByID handles:
// - GET   /admin/questions/{id}
// - PATCH /admin/questions/{id}
func AdminQuestionByID(w http.ResponseWriter, r *http.Request) { ... }
```

- [ ] **Step 2: list（可按 problem_id 过滤）**

SQL（示意）：
```sql
select id, problem_id, priority, text, type, options, condition, status, updated_at
from questions
where ($1='' or problem_id=$1)
order by priority desc, updated_at desc, id asc
limit 500
```

- [ ] **Step 3: create（默认 draft）**

body 必填：`id/problem_id/text/type`；可选：priority/options/condition。

insert：
```sql
insert into questions (id, problem_id, priority, text, type, options, condition, status)
values ($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb,'draft')
```

插入 audit：
```go
_ = insertAudit(tx, actor, "create", "question", in.ID, diff)
```

- [ ] **Step 4: patch（动态 SQL，支持字段）**

支持：`priority/text/type/options/condition/status`（status 允许 draft/published/archived）。

- [ ] **Step 5: router 挂载**

```go
mux.HandleFunc("/admin/questions", handlers.AdminQuestions)
mux.HandleFunc("/admin/questions/", handlers.AdminQuestionByID)
```

- [ ] **Step 6: go test**

Run:
```bash
cd services/api
go test ./...
```

- [ ] **Step 7: Commit**

```bash
git add services/api/internal/http/handlers/admin_questions.go services/api/internal/http/router.go
git commit -m "feat(admin): add questions crud"
```

---

## Task 2: Admin Suggestions CRUD（list/create/get/patch）

**Files:**
- Create: `services/api/internal/http/handlers/admin_suggestions.go`
- Modify: `services/api/internal/http/router.go`

- [ ] **Step 1: handler 壳**
- [ ] **Step 2: list（按 problem_id 过滤）**
- [ ] **Step 3: create（默认 draft）**

必填：`id/problem_id/title`  
可选：`priority/steps/expected_window_hours/retest_tip/condition`

- [ ] **Step 4: patch（动态 SQL）**

支持：`priority/title/steps/expected_window_hours/retest_tip/condition/status`

- [ ] **Step 5: router 挂载**

```go
mux.HandleFunc("/admin/suggestions", handlers.AdminSuggestions)
mux.HandleFunc("/admin/suggestions/", handlers.AdminSuggestionByID)
```

- [ ] **Step 6: go test**

- [ ] **Step 7: Commit**

```bash
git add services/api/internal/http/handlers/admin_suggestions.go services/api/internal/http/router.go
git commit -m "feat(admin): add suggestions crud"
```

---

## Task 3: Admin Tools Guides（GET by problem_id + PUT upsert）

**Files:**
- Create: `services/api/internal/http/handlers/admin_tools_guides.go`
- Modify: `services/api/internal/http/router.go`

- [ ] **Step 1: GET /admin/tools-guides?problem_id=...**

要求 problem_id 必填；不存在 404。

- [ ] **Step 2: PUT /admin/tools-guides/{problem_id}（upsert）**

body 可改：`collapsed_by_default/guide_bullets/efficiency_items/status`  
实现：先查 exists，再 insert 或 update。

id 规则：
- insert 时 `id = "tg_" + problem_id`

audit：
- insert → action=create entity_type=tools_guide entity_id=problem_id
- update → action=update ...

- [ ] **Step 3: router 挂载**

```go
mux.HandleFunc("/admin/tools-guides", handlers.AdminToolsGuides)
mux.HandleFunc("/admin/tools-guides/", handlers.AdminToolsGuideByProblemID)
```

- [ ] **Step 4: go test**
- [ ] **Step 5: Commit**

```bash
git add services/api/internal/http/handlers/admin_tools_guides.go services/api/internal/http/router.go
git commit -m "feat(admin): add tools_guides upsert"
```

---

## Task 4: Unit tests（DB-free：400/405）

**Files:**
- Create: `services/api/internal/http/handlers/admin_content_crud_test.go`

- [ ] **Step 1: invalid json → 400（questions/suggestions/tools_guides）**
- [ ] **Step 2: method not allowed → 405**
- [ ] **Step 3: 缺必填字段 → 400**

Run:
```bash
cd services/api
go test ./... -run TestAdmin
```

- [ ] **Step 4: Commit**

```bash
git add services/api/internal/http/handlers/admin_content_crud_test.go
git commit -m "test(admin): add content crud contract tests"
```

---

## Task 5: e2e-db 系统测试（Admin CRUD → 内容读取闭环）

**Files:**
- Modify: `.github/workflows/ci.yml`

- [ ] **Step 1: 新增 step：E2E: admin content crud**

流程：
1) 启动 API（后台）等待 `/v1/health`
2) POST /admin/questions 创建一个 question（draft）
3) PATCH /admin/questions/{id} 把 status 改为 published
4) GET /v1/problems/{problem_id} 断言 questions 里包含该条（按 id 或 text）

建议用 python3 断言，headers 带 `X-Admin-Token: dev-admin`。

- [ ] **Step 2: Commit**

```bash
git add .github/workflows/ci.yml
git commit -m "test(ci): add e2e admin content crud checks"
```

---

## Task 6: 全量验证 + nightly

- [ ] Run: `python3 scripts/ci/validate_repo.py`
- [ ] Run: `cd services/api && go test ./...`
- [ ] 观察 GitHub Actions 全绿（validate/go-api/python-inference/e2e-db）
- [ ] nightly：`./scripts/package.sh /workspace/miaodong-nightly.zip`

