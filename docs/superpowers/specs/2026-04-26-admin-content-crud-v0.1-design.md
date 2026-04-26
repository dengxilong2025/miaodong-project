# Admin 内容 CRUD v0.1 设计稿（questions / suggestions / tools_guides）

日期：2026-04-26  
状态：已确认（用户“确认做 Admin 内容 CRUD v0.1”）  
对应 WBS：5.1 Admin API：内容 CRUD

---

## 1. 背景

当前已有：

- `/admin/problems`：可 list/create/get/patch problem（含 status、tags 等），并写 audit_log
- `/v1/problems/{id}`：内容读取 bundle 已包含 questions / suggestions / tools_guides
- 发布/灰度/回滚（releases）与 content_version 灰度已落地

缺口：

- 运营无法编辑追问（questions）、建议（suggestions）、工具区（tools_guides）
- v0.2-beta 的“追问+建议+工具区折叠”无法迭代

---

## 2. 目标（v0.1）

1) 为 `questions/suggestions/tools_guides` 提供最小 CRUD（可编辑、可发布）  
2) 沿用现有 Admin 鉴权与风格（`X-Admin-Token`，json，MVP 宽松校验）  
3) 所有 create/update 写入 `audit_log`（可追溯）  
4) 增加 e2e-db 系统测试：Admin CRUD → `/v1/problems/{id}` 可读到变化（闭环）  

---

## 3. API 设计（/admin/*）

### 3.1 Questions

资源：`questions` 表

- `GET  /admin/questions?problem_id=...`
  - 若带 problem_id：按 problem 过滤
  - 排序：`priority desc, updated_at desc, id asc`

- `POST /admin/questions`
  - body（必填/可选）：
    ```json
    {
      "actor": "admin",
      "id": "q_xxx",
      "problem_id": "night_meow",
      "priority": 10,
      "text": "…",
      "type": "single_choice|multi_choice|text",
      "options": ["a","b"],
      "condition": {"...": "..."}
    }
    ```
  - 行为：insert，默认 `status='draft'`

- `GET  /admin/questions/{id}`
- `PATCH /admin/questions/{id}`
  - 可改字段：`priority/text/type/options/condition/status`
  - status 允许值：`draft|published|archived`

### 3.2 Suggestions

资源：`suggestions` 表

- `GET  /admin/suggestions?problem_id=...`
  - 排序：`priority desc, updated_at desc, id asc`
- `POST /admin/suggestions`（默认 draft）
  - 字段：`id/problem_id/priority/title/steps/expected_window_hours/retest_tip/condition`
- `GET  /admin/suggestions/{id}`
- `PATCH /admin/suggestions/{id}`
  - 可改字段：`priority/title/steps/expected_window_hours/retest_tip/condition/status`

### 3.3 Tools Guides

资源：`tools_guides` 表（按 problem_id 唯一）

- `GET /admin/tools-guides?problem_id=...`
  - v0.1：problem_id 必填（简单，避免全表 list）
  - 若不存在返回 404

- `PUT /admin/tools-guides/{problem_id}`（幂等 upsert）
  - body：
    ```json
    {
      "actor":"admin",
      "collapsed_by_default": true,
      "guide_bullets": ["..."],
      "efficiency_items": ["..."],
      "status": "draft|published|archived"
    }
    ```
  - 行为：存在则 update，否则 insert（id 可生成：`tg_<problem_id>`）

---

## 4. 审计（audit_log）

沿用现有 `insertAudit(tx, actor, action, entity_type, entity_id, diff)`：

- entity_type：
  - question / suggestion / tools_guide
- action：
  - create / update
- diff：
  - 仅记录本次写入/变更字段

---

## 5. 实现结构（与现有 admin_problems.go 对齐）

在 `services/api/internal/http/handlers/` 新增三个文件：

- `admin_questions.go`
- `admin_suggestions.go`
- `admin_tools_guides.go`

每个文件内部包含：

- 顶层 handler（鉴权 + method switch）
- list/get/create/patch（或 put）
- 动态 SQL patch（沿用 admin_problems 的模式）

---

## 6. 测试

### 6.1 unit（DB-free）

- invalid json → 400
- method not allowed → 405
- 缺必填字段 → 400

### 6.2 e2e-db（CI）

新增 step：`E2E: admin content crud`

流程：

1) 启动 API
2) `POST /admin/questions` 创建一个 question（draft）
3) `PATCH /admin/questions/{id}` 改为 `published`
4) `GET /v1/problems/{problem_id}` 断言：
   - `questions` 数量 >= 1
   - 包含刚创建的 question（按 id 或 text 匹配）

---

## 7. 验收标准（DoD）

1) 运营可通过 Admin API CRUD questions/suggestions/tools_guides  
2) 内容读取 `/v1/problems/{id}` 能反映 published 内容  
3) audit_log 有记录可追溯  
4) CI e2e-db 新增系统测试覆盖闭环，全绿  

