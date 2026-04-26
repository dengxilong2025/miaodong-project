# Admin UI Metrics Attribution Toggle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 Admin Web 的 Metrics 页面增加 attribution 口径切换（严格 strict / 归因 by_request 的双按钮），并将该参数传入 `/admin/metrics` 与 `/admin/metrics/compare` 请求；默认 strict，支持 localStorage 记忆，compare 模式支持从 hash query 读取 attribution。

**Architecture:** 仅前端改动。Metrics 页面内部维护 `state.attribution`，来源优先级：hash query（compare 模式）> localStorage > 默认 strict。请求时将 attribution 透传到后端。页面展示一个 pill 提示当前口径，避免误读。

**Tech Stack:** Vanilla JS（`apps/admin/pages/metrics.js`）+ CSS（`apps/admin/admin.css`）。

---

## 0. File Map

**Modify:**
- `apps/admin/pages/metrics.js`
- `apps/admin/admin.css`

---

## Task 1: 单窗口 Metrics 增加 attribution 双按钮 + 请求透传

**Files:**
- Modify: `apps/admin/pages/metrics.js`

- [ ] **Step 1: 定义 attribution 常量与 storage key**

在 metrics.js 顶部新增：

```js
const ATTR_STRICT = "strict";
const ATTR_BY_REQUEST = "by_request";
const LS_ATTR_KEY = "miaodong_metrics_attribution";
```

- [ ] **Step 2: state 增加 attribution（默认 strict，优先 localStorage）**

在 `renderSingle()` 内创建 state：

```js
const state = {
  attribution: localStorage.getItem(LS_ATTR_KEY) || ATTR_STRICT,
};
if (state.attribution !== ATTR_BY_REQUEST) state.attribution = ATTR_STRICT;
```

- [ ] **Step 3: 在查询条件区插入双按钮（分段按钮）**

在 `metricsSingleLoadingHTML()` 的 form 里（问题输入框附近）新增：

```html
<div class="field">
  <label>口径 attribution</label>
  <div class="seg" id="metricsAttrSeg">
    <button type="button" class="seg__btn" data-attr="strict">严格</button>
    <button type="button" class="seg__btn" data-attr="by_request">归因</button>
  </div>
  <div class="help">严格：仅统计带 problem_id 的事件；归因：按 request_id 聚合链路。</div>
</div>
```

- [ ] **Step 4: 绑定点击事件 + 高亮 + 保存 localStorage + 自动重新查询**

在 `renderSingle()` 里：

```js
function setAttribution(v) {
  state.attribution = v === ATTR_BY_REQUEST ? ATTR_BY_REQUEST : ATTR_STRICT;
  localStorage.setItem(LS_ATTR_KEY, state.attribution);
  updateAttrUI();
  runQuery(); // 复用现有查询函数，自动刷新
}
```

`updateAttrUI()` 为两个按钮加 `is-active`。

- [ ] **Step 5: 请求时附加 attribution 参数**

在构建 `/admin/metrics?...` 的 URLSearchParams 时加上：

```js
params.set("attribution", state.attribution);
```

- [ ] **Step 6: 在结果区显示“当前口径” pill**

例如在 window hint 或 summary header 增加：

```html
<span class="pill pill--soft">口径：<span id="metricsAttrPill">严格</span></span>
```

并在 `updateAttrUI()` 同步文本。

- [ ] **Step 7: 手动烟测**

启动 API 后：
- 进入 `#/metrics`
- 切换严格/归因：network 请求 URL 带 `attribution=...`，且 UI 高亮与 pill 正确
- 刷新页面：口径从 localStorage 恢复

- [ ] **Step 8: Commit**

```bash
git add apps/admin/pages/metrics.js
git commit -m "feat(admin-ui): add attribution toggle for metrics"
```

---

## Task 2: Compare 模式支持 attribution（从 hash query 读取）

**Files:**
- Modify: `apps/admin/pages/metrics.js`

- [ ] **Step 1: 读取 ctx.routeQuery.attribution**

在 `renderCompare()` 开头：

```js
const q = (ctx && ctx.routeQuery) || {};
const attr = q.attribution === ATTR_BY_REQUEST ? ATTR_BY_REQUEST : ATTR_STRICT;
```

- [ ] **Step 2: compare 请求透传**

构建 `/admin/metrics/compare?...` 时加：

```js
params.set("attribution", attr);
```

- [ ] **Step 3: Compare 页面也显示“当前口径”提示**

在 compare hint 旁增加 pill。

- [ ] **Step 4: Commit**

```bash
git add apps/admin/pages/metrics.js
git commit -m "feat(admin-ui): support attribution in metrics compare mode"
```

---

## Task 3: CSS：seg 分段按钮样式（奶油系卡哇伊）

**Files:**
- Modify: `apps/admin/admin.css`

- [ ] **Step 1: 添加 seg 组件样式**

```css
.seg {
  display: inline-flex;
  gap: 6px;
  padding: 6px;
  border-radius: 16px;
  background: color-mix(in srgb, var(--bg) 70%, #ffffff 30%);
  border: 1px solid var(--border);
}
.seg__btn {
  border: 0;
  cursor: pointer;
  border-radius: 14px;
  padding: 8px 10px;
  background: transparent;
  color: var(--text);
  font-weight: 700;
}
.seg__btn.is-active {
  background: linear-gradient(180deg, color-mix(in srgb, var(--primary) 24%, #ffffff 76%), #fff);
  border: 1px solid color-mix(in srgb, var(--primary) 32%, var(--border) 68%);
  box-shadow: var(--shadow-sm);
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/admin/admin.css
git commit -m "style(admin-ui): add seg button component"
```

---

## Task 4: 校验 + CI

- [ ] Run: `python3 scripts/ci/validate_repo.py`
- [ ] 确认 GitHub Actions 全绿
- [ ] nightly：`./scripts/package.sh /workspace/miaodong-nightly.zip`

