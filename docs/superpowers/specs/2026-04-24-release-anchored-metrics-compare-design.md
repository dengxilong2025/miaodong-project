# 喵懂 Admin：按发布时刻锚定的 24h/72h 对比（Releases → Metrics 快捷入口）设计稿 v0.1

日期：2026-04-24  
动机：让运营从“发布中心”一键跳到“以发布时刻为锚点”的 24h/72h 指标对比，快速判断是否需要回滚。

---

## 1. 目标

1) Releases 列表中每个 release 增加快捷入口：**24h 对比 / 72h 对比**  
2) 对比以该 release 的 `created_at` 为锚点（而非 now），保证语义正确：**发布后 24h/72h**  
3) 实现方式应解耦：路由解析只负责 query 解析，Metrics 页面根据 mode 决定使用 `/admin/metrics` 还是 `/admin/metrics/compare`

---

## 2. 非目标

- 不实现“按 content_version 自动选择对比窗口”（先做通用 compare 参数）
- 不新增后端接口（复用已有 `/admin/metrics/compare`）

---

## 3. 对比窗口定义（t=release.created_at）

### 3.1 24h 对比

- 窗口 B（发布后 24h）：`[t-24h, t]`
- 窗口 A（上一段 24h）：`[t-48h, t-24h]`

### 3.2 72h 对比

- 窗口 B（发布后 72h）：`[t-72h, t]`
- 窗口 A（上一段 72h）：`[t-144h, t-72h]`

---

## 4. 前端路由协议（hash + query）

沿用 hash 路由，不引入构建链。

### 4.1 新增 query 支持

例：

- `#/metrics?mode=compare&from_a=...&to_a=...&from_b=...&to_b=...&problem_id=...`

约束：
- `mode=compare` 时必须带 `from_a/to_a/from_b/to_b`
- `problem_id` 可选（透传给后端 compare）

### 4.2 Metrics 页面行为

- 若 `mode=compare` → 调用 `/admin/metrics/compare` 并渲染 a/b/delta
- 否则 → 保持现有单窗口查询（`/admin/metrics`）

---

## 5. Releases 页面行为

在 releases 表格每行增加按钮：

- “24h 对比”
- “72h 对比”

点击后：

1) 解析该行的 `created_at` → 转换为 `t_ms`
2) 按上文窗口公式计算 `from_a/to_a/from_b/to_b`
3) `location.hash = "#/metrics?mode=compare&from_a=...&to_a=...&from_b=...&to_b=..."`

---

## 6. 验收标准（DoD）

1) Releases 页可一键跳转到 Metrics 对比模式  
2) 对比窗口锚定 release.created_at，且 24h/72h 计算正确  
3) 不破坏现有 Metrics 页面（单窗口查询仍可用）  
4) CI 全绿  

