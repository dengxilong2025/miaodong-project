# 内容数据模型（后台可编辑 + 版本/灰度/回滚）

目标：让运营 1-2 人能在后台直接改内容，同时保证线上安全（版本/灰度/回滚），并支持未来画像、品牌合作与变现。

---

## 1. 两层模型：权威数据 + 运行时策略

### 1.1 Postgres（权威数据）

适合：可检索、可关联、可统计、可审计的内容
- 问题库（problem）
- 追问（question）
- 建议（suggestion）
- 风险口径（risk copy）
- 工具区（tools_guide：先C无链接）
- 标签与映射（intent / intent_problem_map）
- 反馈与复测（feedback / retest）

### 1.2 配置中心（运行时策略）

适合：高频变更、需要灰度/AB 的策略与模板
- 解释文案模板（explanation_templates）
- 小红书分享模板（xhs templates）
- 建议排序与截断策略（policy）

> MVP 可先把配置存 Postgres 的 `runtime_config (jsonb)` 表，并做发布缓存（Redis）。

---

## 2. 发布模型（轻流程但不牺牲安全）

### 2.1 内容状态机

- `draft` 草稿
- `published` 已发布
- `archived` 归档

### 2.2 发布能力（MVP 必备）

- 发布生成 `content_version`
- 支持灰度比例：5% / 20% / 50% / 100%
- 一键回滚到上个 `content_version`
- 线上每次推理记录 `content_version`（便于回溯）

---

## 3. 最小后台模块（1-2人）

1) 问题库管理（Problem）
2) 追问管理（Question，优先级排序，最多问3-5个）
3) 建议管理（Suggestion）
4) 风险口径管理（Risk Copy）
5) 解释模板管理（Explanation Templates）
6) 小红书模板管理（XHS Templates）
7) 发布中心（版本、灰度、回滚）
8) 效果看板（问题维度：进入率/复测率/有用率/分享率；工具区展开率）

---

## 4. 内容铁律（发布前检查清单）

每条建议必须满足：
- 可执行（新人做得到）
- 可复测（72小时内能看到变化）
- 可解释（为什么这么做）
- 不恐吓（风险只分级，不诊断）

