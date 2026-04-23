# 喵懂（喵测）RACI 责任矩阵（对齐 WBS）

版本：v0.1（适配 8 周 MVP）  
团队假设：核心 1-2 人 + 按需外援（可用同一人兼任多个角色）。  

---

## 1) 角色定义

| 角色 | 缩写 | 说明 |
|---|---|---|
| 产品/项目负责人 | PM | 定义需求、优先级、验收口径、对外节奏 |
| 移动端（Flutter） | Mobile | iOS/Android App 开发 |
| 后端（Go API） | Backend | 业务 API、内容/发布系统、埋点接入 |
| 推理服务（Python） | Inference | 音频标准化、推理契约、推理服务 |
| 管理后台（Web） | Admin | 运营后台 Web UI（基于 Admin APIs） |
| 运营/增长 | Ops | 小红书内容与冷启动 SOP、素材、反馈闭环 |
| 测试/质量 | QA | 测试策略、发布演练、回归与验收 |

> RACI 说明：R=Responsible 执行；A=Accountable 负责到底/拍板；C=Consulted 咨询；I=Informed 被通知。

---

## 2) RACI 矩阵（按 WBS 工作包）

> 你可以把这张表当作“拉人/外包/并行”的分工模板：先定 A（拍板人），再定 R（真正干活的人）。

| WBS ID | 工作包 | R | A | C | I |
|---|---|---|---|---|---|
| 1.1 | 本地开发底座（Docker Compose） | Backend | Backend | Inference | PM, QA |
| 1.2 | Go API 骨架（/v1/health） | Backend | Backend | QA | PM |
| 1.3 | Python 推理骨架（/infer stub） | Inference | Inference | Backend | PM, QA |
| 1.4 | 音频链路约束落地（格式/时长/保存） | Mobile | PM | Backend, Inference | QA |
| 2.1 | 内容权威表模型（migrations） | Backend | Backend | PM | QA |
| 2.2 | Seed 导入命令 + 校验 | Backend | Backend | PM | QA, Ops |
| 2.3 | content_version 灰度策略（服务端） | Backend | Backend | PM, QA | Ops |
| 3.1 | 匿名身份（/auth/anonymous） | Backend | Backend | Mobile | PM |
| 3.2 | 上传URL签名（MinIO 直传） | Backend | Backend | Mobile | QA |
| 3.3 | 同步推理编排（Go→Python）+ 降级 | Backend | Backend | Inference, QA | PM |
| 3.4 | 内容 API（problems/详情/模板） | Backend | Backend | PM, Ops | Mobile |
| 3.5 | 反馈与复测 API | Backend | Backend | Mobile, PM | QA |
| 4.1 | Flutter 初始化 + 基础导航 | Mobile | Mobile | PM | QA |
| 4.2 | 录音+上传（10秒上限） | Mobile | Mobile | Backend | QA |
| 4.3 | 调用推理 + 结果页渲染（结构稳定） | Mobile | PM | Backend, Inference | QA |
| 4.4 | 问题库列表/详情页 | Mobile | Mobile | PM | QA |
| 4.5 | 分享物料（结果卡+文案复制） | Mobile | PM | Ops | QA |
| 4.6 | 复测对比 + 成就（最小可用） | Mobile | PM | Backend, Ops | QA |
| 5.1 | Admin API：内容 CRUD | Backend | Backend | PM | Admin, QA |
| 5.2 | 发布中心：发布/灰度/回滚 | Backend | Backend | QA, PM | Ops |
| 5.3 | Admin Web：最小 7 页 | Admin | PM | Backend | QA, Ops |
| 5.4 | 轻量看板（按 problem） | Admin | PM | Backend, Ops | QA |
| 6.1 | 埋点 SDK 封装（Flutter） | Mobile | Mobile | Backend | PM |
| 6.2 | 埋点接收与落库（API） | Backend | Backend | Mobile | PM |
| 6.3 | 指标聚合接口（problem 维度） | Backend | PM | Admin, Ops | QA |
| 7.1 | 冷启动素材包（标题/正文/封面模板） | Ops | PM | Mobile | QA |
| 7.2 | 发布演练（灰度→回滚→复盘） | QA | PM | Backend, Ops | Mobile |
| 7.3 | 上线 SOP（评论/私信/授权口径） | Ops | PM | QA | Mobile, Backend |

---

## 3) 轻团队执行建议（避免扯皮）

1. **每个工作包只允许一个 A**（拍板人），避免“大家都同意=没人负责”。  
2. **R 可以多人，但必须明确谁交付最终产物**（比如 PR 合并人/发布执行人）。  
3. 对“口碑/合规/灰度回滚”相关工作包（2.3、5.2、7.2），建议 PM 与 QA 必须参与评审（至少 C）。  

