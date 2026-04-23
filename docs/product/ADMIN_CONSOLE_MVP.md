# 喵懂｜运营后台 MVP 需求与页面原型（文字版）

版本：v0.1（对应 App MVP 8 周上线节奏）  
适用团队：1-2 人（轻流程但不牺牲安全：版本/灰度/回滚必须有）  

## 1. 背景与目标

喵懂的体验高度依赖“问题库/追问/建议/解释模板/分享模板/工具区”等内容与策略。为了实现：

- **快速迭代**：运营可不发版改内容与模板
- **可控上线**：避免内容误改伤口碑（灰度 + 回滚）
- **可复盘优化**：看板知道哪些内容有效（有用率/复测率/分享率）

需要一套最小可用的运营后台（Admin Console）。

## 2. 设计原则（强约束）

1) **内容一等公民**：内容可编辑、可版本化、可发布  
2) **轻流程**：不做复杂权限，但保留操作日志与“发布开关”  
3) **止损优先**：发布必须支持灰度与回滚  
4) **口径统一**：风险分级/免责声明/健康提示必须全局统一、可配置  
5) **可观测**：任何发布都能在看板看到影响（至少一阶指标）

## 3. 角色与权限（1-2人简化版）

> MVP 可同一人兼任，但系统要记录“谁在何时做了什么”。

- **Editor（编辑）**：改内容、保存草稿
- **Publisher（发布者）**：发布/灰度/回滚（默认也可由 Editor 拥有）

## 4. 核心对象与状态机

### 4.1 内容对象（可编辑）

- Problem（问题库条目）
- Question（追问）
- Suggestion（建议）
- Tools Guide（工具区：避坑指南 + 省力清单；口碑期 buy_link = null）
- Templates（解释模板、分享模板）
- Global Copy（免责声明、红色安全提醒等）

### 4.2 内容状态机（必备）

- `draft`：草稿（仅后台可见）
- `published`：已发布（线上生效）
- `archived`：归档（不可再上线）

### 4.3 发布与版本（必备）

每次发布生成一个 `content_version`（整数自增）：

- 支持发布范围：
  - 全量（100%）
  - 灰度（5% / 20% / 50% / 100%）
- 支持 **一键回滚** 到上一个 `content_version`
- 线上推理结果必须记录 `content_version`（便于回溯）

## 5. 信息架构（页面列表）

### 5.1 登录与首页

**P0：登录**
- 账号：简单账号体系（可先固定账号/密码，后续接企业 SSO）

**P0：后台首页（Dashboard）**
- 当前已发布版本：content_version、发布时间、发布人
- 灰度比例：当前比例与分组规则
- 最近 7 天核心指标摘要（见第 7 章）
- 快捷入口：问题库、模板、发布中心、回滚

### 5.2 内容管理

#### P0：问题库管理（Problem）

列表字段：
- id、标题、状态（draft/published/archived）、最后修改人/时间、所属标签

详情编辑（表单）：
- title、summary、cause_framework（数组）、retest_plan_72h（数组）
- risk_level_copy（green/yellow/red 文案）
- 关联：追问列表（Question）、建议列表（Suggestion）、工具区（Tools Guide）

必备操作：
- 保存草稿
- 预览（见 6.1）
- 提交发布（进入发布中心）

#### P0：追问管理（Question）

列表字段：
- id、problem_id、priority、题目、题型、状态

编辑项：
- text、type、options、priority
- condition（可选，MVP 可先不做复杂条件，仅保留字段）

关键能力：
- **“最多问 N 个”的预览**（按 priority 排序截断）

#### P0：建议管理（Suggestion）

列表字段：
- id、problem_id、priority、标题、状态

编辑项：
- title、steps（数组）、expected_window_hours、retest_tip、priority
- condition（可选）

#### P0：工具区管理（Tools Guide）——先C后A落地载体

编辑项：
- collapsed_by_default（默认 true）
- guide_bullets（数组）
- efficiency_items：sku_key、name、reason、buy_link（口碑期为 null）

强规则：
- 每个 problem 的 efficiency_items **≤ 2**（避免导购感）
- 必须包含“非必需”说明（前端可统一固定文案）

### 5.3 模板与全局口径

#### P0：解释模板（Explanation Templates）

编辑维度：
- factor（PATTERN / CONTEXT）
- intent_code（如 ATTENTION/FOOD/PLAY…）
- templates（字符串数组，随机抽取或按策略）

能力：
- 灰度发布（与 content_version 绑定）
- 快速回滚

#### P0：小红书分享模板（XHS Templates）

编辑维度：
- problem_id（night_meow / always_meow / after_litter_meow）
- titles（数组）
- body_templates（数组）
- comment_prompts（数组）
- hashtags（数组）

#### P0：全局文案（Global Copy）

- disclaimer_short（免责声明）
- danger_red_prompt（红色安全提醒）

> 该处文案必须“全局唯一来源”，避免不同页面口径漂移。

### 5.4 发布中心（Release Center）

**P0：发布中心（必做）**

功能：
- 创建发布：选择要发布的内容范围（MVP可全量发布所有变更）
- 设置灰度比例：5%/20%/50%/100%
- 发布后查看：content_version、发布人、发布时间、差异摘要（见 6.2）
- **回滚按钮**：回滚到上一个版本（需二次确认）

## 6. 预览、差异与审计（轻流程版的“专业感”来源）

### 6.1 内容预览（P0）

目标：编辑看到“用户端会长什么样”，避免纯字段编辑出错。

最小方案：
- 预览 Problem 详情页（summary/原因框架/追问/建议/复测/风险口径/工具区）
- 预览 分享卡文案（填充示例 intent_label/confidence）

### 6.2 差异摘要（P0-）

发布前/发布后生成差异摘要（可先做文本版）：
- 新增/删除/修改了哪些 Problems/Questions/Suggestions/Templates
- 关键字段变更（如 risk 文案、tools 清单）

### 6.3 操作日志（P0-）

记录：
- 用户、时间、对象、动作（create/update/publish/rollback）、变更摘要

## 7. 看板与指标（MVP 版）

> 看板不追求复杂，追求“能指导下一周改什么”。

### 7.1 核心指标（按 problem 维度）

- 进入率：problem_viewed / active_users
- 有用率：feedback(helpful=true) / feedback_total
- 复测率：retest_completed / inference_succeeded
- 分享率：share_completed / inference_succeeded
- 工具区展开率：tools_section_expanded / result_page_viewed

### 7.2 版本影响（发布后观察）

发布后 24h / 72h 对比：
- 复测率、有用率、分享率是否变化
- 推理失败率是否变化（与内容无关但需要监控）

## 8. 非功能性需求（P0）

- 可用性：后台可用率 ≥ 99%
- 安全：登录保护；关键动作（发布/回滚）二次确认
- 性能：列表分页；模板编辑保存 < 1s
- 可维护：所有内容都能导出/导入（JSON）

## 9. 交付清单（工程拆分建议）

P0（必须）：
- 问题库/追问/建议/工具区 CRUD + 预览
- 模板（解释/小红书）CRUD
- 发布中心：content_version、灰度比例、回滚
- 看板：按 problem 的 5 个核心指标

P1（可后置）：
- 条件化追问/建议（condition 规则引擎）
- 更精细的权限（多人团队）
- 更强的差异对比（字段级 diff UI）
