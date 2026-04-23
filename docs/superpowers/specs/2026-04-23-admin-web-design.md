# 喵懂 Admin Web（运营后台 Web UI）设计稿 v0.1

日期：2026-04-23  
范围：运营后台 Web UI（静态单页）  
依赖：已有 Admin API / Postgres / migrations / 审计日志（audit_log）/ 指标接口（/admin/metrics）

---

## 1. 目标（Why）

为 1-2 人运营团队提供最小可用后台，实现：

1) **内容可编辑**：问题库条目（Problem）可创建/修改、可控状态（draft/published/archived）。  
2) **可控上线**：发布生成 `content_version`，支持灰度、支持回滚。  
3) **可观测**：发布后可查看核心指标（至少一阶指标），指导下一周改什么。  
4) **止损优先**：关键动作（发布/回滚）必须二次确认；后端必须记录审计日志。

---

## 2. 非目标（Not in scope）

以下内容在 v0.1 明确不做或只做占位：

- 复杂权限系统 / 多角色审批流（MVP 用单口令）  
- 条件化追问/建议编辑（condition 规则引擎）  
- 字段级 diff UI（先用“版本号 + 审计日志 + 运营自测”）  
- SSO（仅保留未来可替换的接口与页面结构）

---

## 3. 形态与交付方式（How）

### 3.1 技术形态：静态单页（无构建链）

- 目录：`apps/admin/`
  - `index.html`
  - `admin.css`
  - `admin.js`
- 不依赖 Node/Vite/React，便于你“解压覆盖”交付与部署。
- 静态资源由 Go API 托管（推荐路径：`/admin/`），或直接用任意静态服务器托管也可。

### 3.2 与后端的契约

- 所有请求都访问同域下 Admin API（例如 `/admin/problems` 等）。
- 鉴权采用 Header：`X-Admin-Token`（见 4）。

---

## 4. 鉴权与安全（MVP）

### 4.1 登录方式：简单口令登录（确认）

- Admin Web 首次进入显示“输入口令”页面。
- 用户输入口令后写入 `localStorage`（key：`miaodong_admin_token`）。
- 后续每个请求都附带：`X-Admin-Token: <token>`。

后端校验：

- 环境变量 `MIAODONG_ADMIN_TOKEN`，若为空则默认 `dev-admin`。
- 后端已返回统一 401 JSON：
  - `{"error":"unauthorized","message":"missing or invalid X-Admin-Token"}`

### 4.2 风险与缓解

- 风险：口令泄露会导致后台可操作。
- MVP 缓解：
  - 仅用于内网/本机/早期团队，后续接 SSO
  - 关键动作二次确认（发布/回滚）
  - 审计日志可追溯

---

## 5. 信息架构（IA）与页面

导航布局：**A 左侧侧边栏（确认）**

侧边栏菜单（v0.1）：

1) Dashboard（仪表盘）
2) Problems（问题库）
3) Releases（发布中心）
4) Metrics（指标看板）
5) Audit（操作日志）— P0-：先占位（UI 入口保留）

---

## 6. 页面功能与 API 映射

### 6.1 Dashboard（P0）

目的：让运营一眼看到当前线上状态与最近 7 天效果。

数据来源：

- 当前版本/灰度/最近发布：
  - `GET /admin/releases` → 取最新 `content_version/status/rollout_percent/created_by/created_at`
- 指标摘要（最近 7 天）：
  - `GET /admin/metrics?from_ts_ms=<now-7d>&to_ts_ms=<now>`

UI 组件：

- 顶部“当前已发布版本”卡片（content_version + 灰度比例）
- “最近 7 天”摘要卡片（events_total、distinct_users、feedback helpful_rate）
- 快捷按钮：跳转 Problems / Releases / Metrics

### 6.2 Problems（P0）

目的：可编辑问题库条目（Problem）。

数据来源与操作：

- 列表：`GET /admin/problems`
- 新建：`POST /admin/problems`（body：`actor/id/title/summary/tags`）
- 详情：`GET /admin/problems/{id}`
- 更新：`PATCH /admin/problems/{id}`（支持 `title/summary/tags/status`）

UI 结构（最小可用，避免过度设计）：

- 左侧列表（可搜索：前端本地过滤 title/id）
- 右侧详情/编辑区（表单）
- CTA：
  - 保存（PATCH）
  - 状态切换（draft/published/archived）

备注：追问/建议/工具区在 v0.1 可先不做 UI（后端已预留数据表）。

### 6.3 Releases（P0）

目的：发布生成版本 + 灰度 + 回滚。

数据来源与操作：

- 列表：`GET /admin/releases`
- 发布：`POST /admin/release`（body：`actor/rollout_percent/notes`）
- 回滚：`POST /admin/rollback`（body：`actor/target_content_version/notes`）

UI 规则：

- 发布：二次确认弹窗（显示即将发布的 rollout_percent 与 notes）
- 回滚：二次确认弹窗（要求再次输入目标版本号以确认）

### 6.4 Metrics（P0）

目的：按问题维度与时间窗查看效果，指导内容改动。

数据来源与操作：

- `GET /admin/metrics?from_ts_ms=&to_ts_ms=&problem_id=`

UI：

- 时间范围选择（快捷：24h / 7d / 30d）
- problem_id 筛选（先下拉/输入框，后续可联动 Problems 列表）
- 展示：
  - events_total、distinct_users
  - by_event_name（Top N）
  - feedback：total / helpful / helpful_rate

### 6.5 Audit（P0-）

现状：

- 后端已写入 `audit_log`（create/update/publish/rollback）。
- v0.1 UI 先做入口与空态，占位；后续补 `GET /admin/audit`。

---

## 7. UI 视觉规范（确认：奶油系可爱风）

### 7.1 关键词

- 奶油底色、低饱和暖色点缀、圆润、轻阴影  
- 小猫元素“点到为止”（角标/空状态/小图标），不堆满

### 7.2 设计 Tokens（可直接落到 CSS 变量）

- 背景：`#FFF7EE`
- 卡片：`#FFFFFF`
- 主色（蜜桃粉）：`#FF8FB1`
- 辅色（奶茶棕）：`#8B6B5D`
- 成功（薄荷绿）：`#6FD3B8`
- 危险：`#FF5D6C`
- 文本主色：`#2B2A2A`
- 次级文字：`#6B6B6B`
- 边框/分割线：`#F1E6DD`
- 圆角：卡片 16px / 按钮 14px / 输入框 12px
- 阴影：`0 6px 18px rgba(43,42,42,.08)`

### 7.3 动效

- hover：轻微抬升（阴影增强）
- active：轻微缩放（0.98）
- toast：右上角提示条（成功/失败配色不同）

---

## 8. 错误处理与体验（P0）

- 401：自动跳回“输入口令”页 + 提示“口令无效/已过期”
- 5xx：toast 提示 + 在页面显示“稍后再试”
- 表单保存：loading 状态 + 成功 toast
- 发布/回滚：必须二次确认，失败时显示后端 message（若有）

---

## 9. 验收标准（Definition of Done）

1) Admin Web 能打开、能登录（口令）  
2) Problems：可列表/可新建/可编辑/可切状态  
3) Releases：可发布新版本、可回滚到指定版本  
4) Metrics：能看到最近 7 天摘要、可按 problem_id 筛选 feedback 指标  
5) 关键动作均有二次确认  
6) CI 仍全绿（go-api / python-inference / e2e-db）

