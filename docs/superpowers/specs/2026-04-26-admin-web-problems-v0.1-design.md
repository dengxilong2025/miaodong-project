# Admin Web：Problems 页面（含 Questions / Suggestions / Tools）v0.1 设计稿

日期：2026-04-26  
状态：已确认（用户“设计稿通过”）  
对应 WBS：5.3 Admin Web（Problems 编辑闭环）

---

## 1. 背景

当前后端已具备：

- Admin 内容 CRUD：
  - `/admin/problems`
  - `/admin/questions`
  - `/admin/suggestions`
  - `/admin/tools-guides`
- 内容读取 API：`/v1/problems/{id}`（bundle）
- 发布/灰度/回滚、audit、metrics 等后台能力

当前 Admin Web（`apps/admin`）为无构建链的 Vanilla JS SPA，已有路由 `#/problems` 但页面仍为占位/施工。

---

## 2. 目标（v0.1）

1) 在 Admin Web 中实现“问题内容编辑闭环”：
   - 运营可在网页上编辑 Problem 基础信息
   - 同页编辑 Questions / Suggestions / Tools Guide
2) 最小可用体验：
   - 显式保存按钮（不自动保存）
   - 未保存离开确认
   - 成功/失败 toast 提示
3) 不引入构建链，不增加复杂依赖，延续现有 `apps/admin/pages/*.js` 模式

---

## 3. 信息架构与布局（单页 + 左右分栏 + Tab）

### 3.1 左侧：Problems 列表

组件：

- 搜索框：按 `id/title` 前端过滤
- 状态筛选：draft/published/archived（前端过滤）
- 列表项：展示 `id + title + status`
- 点击某一项 → 右侧进入该 problem 的编辑视图

### 3.2 右侧：编辑区（Problem 概览 + Tabs）

右侧结构：

1) 顶部：Problem 基本信息摘要
   - id（只读）
   - title/summary/tags/status（可编辑）
   - 保存按钮（保存 Problem）

2) Tabs（四个）：
   - Problem
   - Questions
   - Suggestions
   - Tools Guide

---

## 4. 交互规则（MVP 安全）

### 4.1 保存策略

- 所有编辑均“显式保存”
- 保存成功：
  - toast：成功
  - 更新本地缓存（避免立即重新拉取也能看到最新值）
- 保存失败：
  - toast：失败 + 原始错误文本（HTTP body 文本）

### 4.2 未保存离开确认

触发点：

- 切换 Tab
- 切换左侧 Problem
- 在列表中切换当前编辑条目（Questions/Suggestions 的选中项）

行为：

- 若检测到当前表单 dirty：
  - 弹窗：放弃更改 / 继续编辑

---

## 5. API 映射（前端对接后端）

### 5.1 Problems

- `GET /admin/problems`
- `PATCH /admin/problems/{id}`

### 5.2 Questions

- `GET /admin/questions?problem_id=...`
- `POST /admin/questions`
- `PATCH /admin/questions/{id}`

### 5.3 Suggestions

- `GET /admin/suggestions?problem_id=...`
- `POST /admin/suggestions`
- `PATCH /admin/suggestions/{id}`

### 5.4 Tools Guide

- `GET /admin/tools-guides?problem_id=...`
- `PUT /admin/tools-guides/{problem_id}`

鉴权：

- 使用既有 Admin Web token 机制（localStorage token）→ header `X-Admin-Token`

---

## 6. 字段范围（v0.1 最小字段集）

### 6.1 Problem

- title
- summary
- tags
- status

### 6.2 Question

- priority
- text
- type
- options
- status
- condition：v0.1 用 JSON 文本框（原样透传到 API）

### 6.3 Suggestion

- priority
- title
- steps
- status
- condition：v0.1 用 JSON 文本框

（expected_window_hours/retest_tip 等 v0.2 再补）

### 6.4 Tools Guide

- collapsed_by_default
- guide_bullets
- efficiency_items
- status

---

## 7. 前端实现落点（无构建链）

### 7.1 文件与模块

- `apps/admin/pages/problems.js`：新增页面实现
  - `window.AdminPages.problems.render(pageEl, ctx)`
- `apps/admin/index.html`：引入 `pages/problems.js`

### 7.2 复用工具

复用 `apps/admin/lib/api.js` 中：

- `apiFetch`（带 token）
- `showToast`
- `openModal`（用于未保存确认）
- `tagsArrayToInput/tagsInputToArray`

---

## 8. 验收标准（DoD）

1) Admin Web 的 Problems 页面可用：
   - 列表可浏览、可搜索/筛选
   - 可编辑并保存 Problem
   - 可增改 Questions/Suggestions/Tools Guide
2) 未保存离开有确认
3) 错误提示清晰（toast + 原始错误文本）

