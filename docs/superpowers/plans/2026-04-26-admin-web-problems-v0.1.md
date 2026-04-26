# Admin Web Problems v0.1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 `apps/admin` 中实现 `#/problems` 页面：左侧问题列表（搜索/筛选），右侧编辑区（Problem 基本信息 + Tabs：Questions/Suggestions/Tools Guide），对接已实现的 Admin 内容 CRUD API，形成运营“编辑→发布→内容读取验证”的闭环。

**Architecture:** 维持现有 Vanilla JS 结构：`apps/admin/pages/problems.js` 提供 `window.AdminPages.problems.render(pageEl, ctx)`；复用 `lib/api.js` 的 `apiFetch/showToast/openModal/tags*`；页面内部用纯状态对象管理选中 problem/tab/dirty 状态，切换时做确认；所有写操作显式“保存”按钮触发。

**Tech Stack:** Vanilla JS + fetch（封装为 apiFetch）+ 既有 admin.css。

---

## 0. File Map

**Create:**
- `apps/admin/pages/problems.js`

**Modify:**
- `apps/admin/index.html`（引入 `pages/problems.js`）

---

## Task 1: 创建 problems.js 页面骨架（能渲染 + 能加载 problems 列表）

**Files:**
- Create: `apps/admin/pages/problems.js`
- Modify: `apps/admin/index.html`

- [ ] **Step 1: 在 index.html 引入 pages/problems.js**

在 `apps/admin/index.html` 里 `admin.js` 之前加入：

```html
<script src="./pages/problems.js"></script>
```

- [ ] **Step 2: 新增 pages/problems.js 基本模块导出**

`apps/admin/pages/problems.js`

```js
(function () {
  "use strict";
  const AdminLib = window.AdminLib;
  if (!AdminLib) throw new Error("AdminLib missing");
  const { $, escapeHTML, apiFetch, showToast, openModal, tagsArrayToInput, tagsInputToArray } = AdminLib;

  function render(pageEl) {
    pageEl.innerHTML = `
      <div class="page page--wide">
        <div class="split">
          <aside class="panel panel--left">
            <div class="panel__header">
              <div class="panel__title">Problems</div>
              <div class="panel__sub">搜索/筛选后点选进行编辑</div>
            </div>
            <div class="panel__body">
              <div class="row">
                <input class="input" id="pSearch" placeholder="搜索 id/title…" />
                <select class="input" id="pStatus">
                  <option value="">全部状态</option>
                  <option value="draft">draft</option>
                  <option value="published">published</option>
                  <option value="archived">archived</option>
                </select>
              </div>
              <div id="pList" class="list"></div>
            </div>
          </aside>

          <section class="panel panel--right">
            <div class="panel__header">
              <div class="panel__title">编辑</div>
              <div class="panel__sub">选择左侧问题后开始编辑</div>
            </div>
            <div class="panel__body" id="pEditor">
              <div class="card card--welcome">
                <h2 class="card__title">还没选中问题喵</h2>
                <p class="card__desc">先从左侧点一个问题～</p>
              </div>
            </div>
          </section>
        </div>
      </div>
    `;
    loadProblems(pageEl).catch((e) => showToast(String(e), "danger"));
  }

  async function loadProblems(root) {
    const listEl = $("#pList", root);
    if (!listEl) return;
    listEl.innerHTML = `<div class="skeleton" style="width:60%"></div>`;
    const data = await apiFetch("/admin/problems");
    const items = (data && data.items) || [];
    listEl.innerHTML = items
      .map((p) => `<button class="list__item" data-id="${escapeHTML(p.id)}">
        <div class="list__title">${escapeHTML(p.title || p.id)}</div>
        <div class="pill pill--soft">${escapeHTML(p.status || "")}</div>
      </button>`)
      .join("");
  }

  window.AdminPages = window.AdminPages || {};
  window.AdminPages.problems = { render };
})();
```

- [ ] **Step 3: 本地快速自检（可选）**

Run:
```bash
python3 -m http.server 8089 --directory apps/admin
```
浏览器打开 `http://localhost:8089/`，登录后进入 Problems，能看到列表（需后端服务与 token）。

- [ ] **Step 4: Commit**

```bash
git add apps/admin/index.html apps/admin/pages/problems.js
git commit -m "feat(admin-web): add problems page skeleton"
```

---

## Task 2: Problem 基本信息编辑（title/summary/tags/status）+ dirty 提示

**Files:**
- Modify: `apps/admin/pages/problems.js`

- [ ] **Step 1: 点击列表项加载详情并渲染编辑表单**

新增：
- `state.selectedProblem`
- `renderProblemEditor(problem)`

右侧表单字段：
- id（只读）
- title/summary/tags/status（可编辑）
- 保存按钮（PATCH /admin/problems/{id}）

- [ ] **Step 2: dirty 检测 + 切换确认**

实现：
- `state.dirty = true/false`
- 切换 problem/tab 前若 dirty：
  - `openModal` 弹窗：放弃/继续编辑

- [ ] **Step 3: 保存成功更新本地 state + toast**

保存逻辑：
```js
await apiFetch(`/admin/problems/${id}`, { method:"PATCH", body: JSON.stringify({ actor:"admin", ...patch }) })
```

- [ ] **Step 4: Commit**

```bash
git add apps/admin/pages/problems.js
git commit -m "feat(admin-web): edit problem basics with save and dirty confirm"
```

---

## Task 3: Tabs 基础（Problem/Questions/Suggestions/Tools Guide）+ 路由内状态

**Files:**
- Modify: `apps/admin/pages/problems.js`

- [ ] **Step 1: 增加 tabs UI**

在右侧编辑区加：
- tabs bar（按钮/链接）
- `state.activeTab`：`problem|questions|suggestions|tools`

- [ ] **Step 2: tab 切换尊重 dirty**

同 Task2 的确认逻辑复用。

- [ ] **Step 3: Commit**

```bash
git add apps/admin/pages/problems.js
git commit -m "feat(admin-web): add problems editor tabs"
```

---

## Task 4: Questions Tab（list/create/patch）

**Files:**
- Modify: `apps/admin/pages/problems.js`

- [ ] **Step 1: list questions**

调用：
- `GET /admin/questions?problem_id=...`

展示：
- 列表（id/text/priority/status）
- 点击一条 → 右侧/下方编辑表单

- [ ] **Step 2: create question**

按钮“新建追问”：
- 生成 id：`q_${problem_id}_${Date.now()}`
- POST `/admin/questions`（默认 draft）

- [ ] **Step 3: patch question**

表单字段：
- priority/text/type/options/status/condition(JSON文本)
- 保存 → `PATCH /admin/questions/{id}`

- [ ] **Step 4: Commit**

```bash
git add apps/admin/pages/problems.js
git commit -m "feat(admin-web): manage questions tab"
```

---

## Task 5: Suggestions Tab（list/create/patch）

**Files:**
- Modify: `apps/admin/pages/problems.js`

- [ ] **Step 1: list suggestions**
- [ ] **Step 2: create suggestion**
  - id：`s_${problem_id}_${Date.now()}`
- [ ] **Step 3: patch suggestion**
  - priority/title/steps(JSON数组)/status/condition(JSON)

- [ ] **Step 4: Commit**

```bash
git add apps/admin/pages/problems.js
git commit -m "feat(admin-web): manage suggestions tab"
```

---

## Task 6: Tools Guide Tab（GET + PUT upsert）

**Files:**
- Modify: `apps/admin/pages/problems.js`

- [ ] **Step 1: GET tools guide**

调用：
- `GET /admin/tools-guides?problem_id=...`

若 404 → 视为“尚未创建”，表单仍可编辑，保存时走 PUT 创建。

- [ ] **Step 2: PUT upsert**

保存：
- `PUT /admin/tools-guides/{problem_id}`

字段：
- collapsed_by_default（checkbox）
- guide_bullets（JSON数组文本框）
- efficiency_items（JSON数组文本框）
- status

- [ ] **Step 3: Commit**

```bash
git add apps/admin/pages/problems.js
git commit -m "feat(admin-web): manage tools guide tab"
```

---

## Task 7: 轻量样式补齐（仅必要 class，不大改 admin.css）

**Files:**
- Modify: `apps/admin/admin.css`

- [ ] **Step 1: 增加 split/panel/list/tabs 的最小样式**
- [ ] **Step 2: Commit**

```bash
git add apps/admin/admin.css
git commit -m "style(admin-web): improve problems page layout"
```

---

## Task 8: 全量校验 + nightly

- [ ] Run: `python3 scripts/ci/validate_repo.py`
- [ ]（可选）启动静态页面自测：`python3 -m http.server 8089 --directory apps/admin`
- [ ] 观察 GitHub Actions 全绿
- [ ] nightly：`./scripts/package.sh /workspace/miaodong-nightly.zip`

