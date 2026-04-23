# 喵懂（喵测）WBS + 里程碑版本计划（8周MVP）

面向团队规模：1-2 人为主（可按需找外援），目标是**可灰度发布、可迭代**的 MVP。

---

## 1. 版本与里程碑（Milestones）

| 里程碑 | 版本代号 | 周期 | 目标 | 验收标准（DoD） |
|---|---|---:|---|---|
| M0 | v0.0 | W1 | 工程底座可跑 | 本地 Docker Compose 可起 Postgres/MinIO；API/推理服务可启动；/health OK |
| M1 | v0.1-alpha | W2 | “端到端最小闭环”跑通 | App 能录音→上传→调用推理→展示结果页（占位推理也可）；seed 内容能导入 |
| M2 | v0.2-beta | W4 | “内容+解释+追问+建议”闭环成型 | 结果页结构稳定（意图/置信度/证据解释/追问/建议/风险分级/工具区折叠/分享）；Top3 问题库完整可用 |
| M3 | v0.3-beta | W6 | “复测+反馈+成就”带来黏性 | 72小时复测链路可用（对比卡/成就至少1个）；P0埋点打通且后台可看核心指标 |
| M4 | v0.9-rc | W7 | 灰度发布准备就绪 | 运营后台可编辑内容+发布content_version+灰度+回滚；发布后24h/72h可对比指标 |
| M5 | v1.0-mvp | W8 | 小红书冷启动上线 | 分享物料完善（结果卡/文案模板）；稳定性与失败降级OK；冷启动SOP可执行 |

> 备注：版本命名仅作内部管理；对外发布可用“公测/内测”口径。

---

## 2. WBS（Work Breakdown Structure）

### WBS 使用说明

- **粒度**：每个工作包建议 2–5 天；可并行则并行。  
- **角色**：Mobile（Flutter）、Backend（Go）、Inference（Python）、Admin（后台Web）、Ops/Growth（运营/增长）、QA。  
- **依赖**：用 `Deps` 表示前置工作包 ID。  

### 2.1 基础设施与工程底座（W1）

| WBS ID | 工作包 | 负责人角色 | 工期 | Deps | 交付物 | 验收标准（DoD） |
|---|---|---|---:|---|---|---|
| 1.1 | 本地开发底座（Docker Compose） | Backend | 1d | - | `infra/docker-compose.yml` | Postgres/MinIO可起；端口可用 |
| 1.2 | Go API骨架（/v1/health） | Backend | 1d | 1.1 | API服务可跑 | `GET /v1/health=200`；单测通过 |
| 1.3 | Python推理骨架（/infer stub） | Inference | 1d | 1.1 | 推理服务可跑 | `POST /infer=200`；返回schema_version/model_version |
| 1.4 | 音频链路约束落地（格式/时长/保存） | Mobile+Backend | 1d | 1.1 | 录音格式策略文档/实现约束 | 10秒上限；m4a优先；服务端转码策略明确 |

### 2.2 内容数据与发布系统（W1-W2）

| WBS ID | 工作包 | 负责人角色 | 工期 | Deps | 交付物 | 验收标准（DoD） |
|---|---|---|---:|---|---|---|
| 2.1 | 内容权威表模型（migrations） | Backend | 2d | 1.1 | migrations | problems/questions/suggestions/tools/runtime_config/release/audit可建表 |
| 2.2 | Seed导入命令 + 校验 | Backend | 2d | 2.1 | seed importer | 一键导入 `data/seed/miaodong-seed-v1.json`；Top3问题校验通过 |
| 2.3 | content_version 灰度策略（服务端） | Backend | 2d | 2.1 | 发布逻辑 | 能按灰度桶返回不同content_version（MVP可先按百分比） |

### 2.3 API 核心能力（W2-W4）

| WBS ID | 工作包 | 负责人角色 | 工期 | Deps | 交付物 | 验收标准（DoD） |
|---|---|---|---:|---|---|---|
| 3.1 | 匿名身份（/auth/anonymous） | Backend | 1d | 1.2 | token机制 | App可获取token；服务端能识别user_id |
| 3.2 | 上传URL签名（MinIO直传） | Backend | 2d | 1.1 | `/audio/upload-url` | 客户端可直传成功；失败有错误码 |
| 3.3 | 同步推理编排（Go→Python）+降级 | Backend | 3d | 1.2,1.3,3.2 | `/inference` | Python挂了也能返回degraded结构；超时可控 |
| 3.4 | 内容API（problems/详情/模板） | Backend | 3d | 2.2 | `/problems/*`等 | Top3问题可查；模板可取；带content_version |
| 3.5 | 反馈与复测API | Backend | 2d | 3.3,3.4 | `/feedback` `/retest` | 能落库；可按problem聚合查询 |

### 2.4 Flutter App（W2-W6）

| WBS ID | 工作包 | 负责人角色 | 工期 | Deps | 交付物 | 验收标准（DoD） |
|---|---|---|---:|---|---|---|
| 4.1 | Flutter工程初始化 + 基础导航 | Mobile | 2d | 1.1 | `apps/mobile` | iOS/Android可跑；首页含“喵测/问题库”入口 |
| 4.2 | 录音+上传（10秒上限） | Mobile | 3d | 4.1,3.2 | 录音页 | m4a录音；弱网重试；上传成功回audio_id |
| 4.3 | 调用推理 + 结果页渲染（结构稳定） | Mobile | 4d | 3.3,3.4 | 结果页 | 意图/证据/追问/建议/风险/工具区折叠/分享入口齐全 |
| 4.4 | 问题库列表/详情页 | Mobile | 3d | 3.4 | 问题库页 | Top3问题可浏览；可从结果页跳转 |
| 4.5 | 分享物料（结果卡+文案复制） | Mobile | 3d | 4.3 | 分享能力 | 保存图片/复制模板；默认含#喵懂 #喵测 |
| 4.6 | 复测对比 + 成就（最小可用） | Mobile | 4d | 3.5,4.3 | 复测模块 | 同一problem复测对比卡可生成；至少1个成就可解锁/可晒 |

### 2.5 运营后台（W4-W7）

| WBS ID | 工作包 | 负责人角色 | 工期 | Deps | 交付物 | 验收标准（DoD） |
|---|---|---|---:|---|---|---|
| 5.1 | Admin API：内容CRUD | Backend | 4d | 2.1 | `/admin/*` | problems/questions/suggestions/tools可改；有草稿状态 |
| 5.2 | 发布中心：发布/灰度/回滚 | Backend | 3d | 2.3,5.1 | release APIs | 一键发布生成content_version；可回滚 |
| 5.3 | Admin Web：最小7页 | Admin | 5d | 5.1,5.2 | 后台Web | 能编辑内容→预览→发布→灰度→回滚 |
| 5.4 | 轻量看板（按problem） | Admin+Backend | 3d | 6.2 | 指标页 | 展示进入率/有用率/复测率/分享率/工具展开率 |

### 2.6 数据与埋点（W4-W8）

| WBS ID | 工作包 | 负责人角色 | 工期 | Deps | 交付物 | 验收标准（DoD） |
|---|---|---|---:|---|---|---|
| 6.1 | 埋点SDK封装（Flutter） | Mobile | 2d | 4.1 | telemetry模块 | 关键事件都能发；离线缓冲 |
| 6.2 | 埋点接收与落库（API） | Backend | 2d | 2.1 | `/analytics/event` | 事件落库；字段齐全含content_version |
| 6.3 | 指标聚合接口（problem维度） | Backend | 3d | 6.2 | `/admin/metrics/*` | 可按content_version对比24h/72h |

### 2.7 冷启动与上线准备（W7-W8）

| WBS ID | 工作包 | 负责人角色 | 工期 | Deps | 交付物 | 验收标准（DoD） |
|---|---|---|---:|---|---|---|
| 7.1 | 冷启动素材包（标题/正文/封面模板） | Ops/Growth | 3d | 4.5 | 素材库 | 每个问题≥10条标题备选；3套封面模板 |
| 7.2 | 发布演练（灰度→回滚→复盘） | QA+Backend+Ops | 2d | 5.2,6.3 | 演练记录 | 5%灰度发布成功；异常可回滚；指标可对比 |
| 7.3 | 上线SOP（小红书账号/评论话术/私信） | Ops/Growth | 2d | 7.1 | SOP文档 | 可直接执行；含收集样本与授权口径 |

---

## 3. 关键路径（Critical Path）建议

最可能卡工期的链路（建议优先保障）：

1) 录音上传（4.2）→ 推理编排（3.3）→ 结果页结构（4.3）  
2) 内容seed导入（2.2）→ 内容API（3.4）→ 问题库与建议闭环（4.4/4.3）  
3) 发布/灰度/回滚（5.2）→ 指标聚合（6.3）→ 发布演练（7.2）

---

## 4. 下一步（如果你点头，我继续落盘配套文件）

我可以再补两份“执行型”文件到 `docs/project/`：

1) `RACI.md`：按 WBS 把责任人/协作人/验收人明确（适合拉外援）  
2) `RISKS.md`：按阶段列Top风险与应对（准确性争议、口碑风险、灰度发布风险等）

