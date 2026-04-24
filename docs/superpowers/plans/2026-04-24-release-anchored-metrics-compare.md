# Release-Anchored Metrics Compare Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 Admin Web 中实现“从 Releases 一键跳转到按发布时刻锚定的 24h/72h 指标对比”，通过 `#/metrics?mode=compare...` 触发 `/admin/metrics/compare` 渲染。

**Architecture:** 前端仅新增“hash query 解析”与“metrics compare 模式渲染”；不新增后端接口。路由层解析 query 并传入页面 ctx，页面决定调用 compare 或普通 metrics。

**Tech Stack:** Vanilla JS（无构建链，多 script 文件）+ 既有 `/admin/metrics/compare`。

---

## 0. File Map

**Modify:**
- `apps/admin/admin.js`（支持 hash query 解析，并将 routeQuery 传入页面 render）
- `apps/admin/pages/metrics.js`（新增 compare 模式渲染；若该文件不存在则创建并从现有逻辑迁移）
- `apps/admin/pages/releases.js`（在每行增加 24h/72h 对比按钮，生成 hash 跳转）
- `apps/admin/index.html`（如新增 pages/*.js 文件，需要补 script 引入）

**Optional Modify:**
- `apps/admin/admin.css`（按钮/提示样式微调）

---

## Task 1: 路由支持 hash query（解耦）

**Files:**
- Modify: `apps/admin/admin.js`

- [ ] **Step 1: 写一个最小的 query 解析函数**

在 `admin.js` 中增加：

```js
function parseHashQuery() {
  const h = window.location.hash || "";
  const idx = h.indexOf("?");
  if (idx === -1) return {};
  const qs = h.slice(idx + 1);
  const p = new URLSearchParams(qs);
  const out = {};
  for (const [k, v] of p.entries()) out[k] = v;
  return out;
}
```

- [ ] **Step 2: 调度页面时传入 ctx.routeQuery**

调用页面 render 统一改为：

```js
const ctx = { route, routeQuery: parseHashQuery() };
AdminPages[route].render(container, ctx);
```

- [ ] **Step 3: 手动烟测**

进入任意页面：
- `#/metrics?mode=compare&from_a=1&to_a=2&from_b=3&to_b=4`

Expected:
- 不报错（即使页面暂未处理 compare）

- [ ] **Step 4: Commit**

```bash
git add apps/admin/admin.js
git commit -m "refactor(admin-ui): parse hash query and pass to pages"
```

---

## Task 2: Metrics 页面支持 compare 模式（复用 /admin/metrics/compare）

**Files:**
- Modify/Create: `apps/admin/pages/metrics.js`
- Modify: `apps/admin/index.html`（补 script 引入）

- [ ] **Step 1: 确保存在 AdminPages.metrics**

若当前 metrics 逻辑还在旧文件（历史实现可能在 `admin.js`），则迁移到：

```js
window.AdminPages = window.AdminPages || {};
window.AdminPages.metrics = { render };
```

- [ ] **Step 2: compare 模式解析与请求**

当 `ctx.routeQuery.mode === "compare"`：
- 读取 `from_a/to_a/from_b/to_b/problem_id`
- 调用：
```js
apiFetch(`/admin/metrics/compare?${params.toString()}`)
```
- 渲染：
  - a/b 的 events_total、distinct_users、feedback.helpful_rate
  - delta.events_total、delta.distinct_users、delta.feedback_helpful_rate（pp）

- [ ] **Step 3: 非 compare 模式保持原行为**

继续支持原有：
- 快捷 24h/7d/30d
- from/to ms
- problem_id
- 调用 `/admin/metrics`

- [ ] **Step 4: index.html 引入**

```html
<script src="./pages/metrics.js"></script>
```
（放在 `admin.js` 之前）

- [ ] **Step 5: Commit**

```bash
git add apps/admin/pages/metrics.js apps/admin/index.html
git commit -m "feat(admin-ui): metrics compare mode via hash query"
```

---

## Task 3: Releases 页面增加“24h/72h 对比”跳转

**Files:**
- Modify/Create: `apps/admin/pages/releases.js`
- Modify: `apps/admin/index.html`
- Optional: `apps/admin/admin.css`

- [ ] **Step 1: 确保存在 AdminPages.releases**

若 releases 逻辑还在旧文件，则迁移到 pages/releases.js：

```js
window.AdminPages = window.AdminPages || {};
window.AdminPages.releases = { render };
```

- [ ] **Step 2: 生成锚定窗口并跳转**

工具函数：

```js
function toMsFromISO(iso) {
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t : null;
}
function buildCompareHash(tMs, hours) {
  const H = 60 * 60 * 1000;
  const toB = tMs;
  const fromB = tMs - hours * H;
  const toA = fromB;
  const fromA = toA - hours * H;
  const p = new URLSearchParams({
    mode: "compare",
    from_a: String(fromA),
    to_a: String(toA),
    from_b: String(fromB),
    to_b: String(toB),
  });
  return `#/metrics?${p.toString()}`;
}
```

在每一行 release 上渲染两个按钮：
- 24h：`location.hash = buildCompareHash(tMs, 24)`
- 72h：`location.hash = buildCompareHash(tMs, 72)`

- [ ] **Step 3: index.html 引入**

```html
<script src="./pages/releases.js"></script>
```

- [ ] **Step 4: 手动烟测**

1) 打开 `#/releases`
2) 找到某条 release（必须有 created_at）
3) 点 “24h 对比” → 跳转到 `#/metrics?mode=compare...` 并展示 compare

- [ ] **Step 5: Commit**

```bash
git add apps/admin/pages/releases.js apps/admin/index.html
git commit -m "feat(admin-ui): release-anchored compare shortcuts"
```

---

## Task 4: 验证与 nightly

- [ ] Run: `python3 scripts/ci/validate_repo.py`
- [ ] Run: `cd services/api && go test ./...`
- [ ] 确认 GitHub Actions 全绿
- [ ] 生成 nightly：`./scripts/package.sh /workspace/miaodong-nightly.zip`

