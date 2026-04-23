# 喵懂（MiāoDǒng）

面向新手养猫人群的「叫声理解 + 快速排查 + 可执行建议」App。  
产品调性：温柔陪伴型（但仍科学克制）；**功能名/口头禅：喵测**（测一测我家猫在想啥），核心护城河是可解释性与复测闭环带来的高黏性。

## 品牌命名

- 主名：喵懂
- 传播口头禅/功能名：喵测
- 副标题：测一测我家猫在想啥｜可解释｜可复测

## 快速入口

- 产品文档：[`docs/product/PRD.md`](docs/product/PRD.md)
- 冷启动（小红书）：[`docs/ops/COLD_START_XHS.md`](docs/ops/COLD_START_XHS.md)
- 技术架构：[`docs/tech/ARCHITECTURE.md`](docs/tech/ARCHITECTURE.md)
- API 契约（同步推理）：[`docs/tech/API_CONTRACT.md`](docs/tech/API_CONTRACT.md)
- ADR（关键决策记录）：[`docs/adr/`](docs/adr/)

## 目录结构（大厂风格：分层、分域、可扩展）

```text
miaodong/
  apps/                   # 客户端应用（Flutter）
    mobile/
  services/               # 云端服务（按域拆分，MVP可先单体实现）
    api/                  # Go：业务 API / BFF / 推理编排
    inference/            # Python：推理服务（音频→标签/置信度/解释因子）
  data/
    seed/                 # 首发内容种子数据（问题库/追问/建议/模板/增长玩法）
  docs/
    product/              # PRD、增长、运营后台需求
    tech/                 # 架构、API、数据模型、音频链路
    ops/                  # 冷启动作战手册、发布/灰度/回滚
    adr/                  # 架构决策记录（Architecture Decision Records）
  infra/                  # 基础设施与部署（预留）
```

## 运行原则（摘要）

- 内容与策略优先配置化：运营可后台改内容；发布有版本/灰度/回滚。
- AI 推理云端优先：Go 承载并发与稳定性；Python 承载模型迭代速度。
- 可解释性与复测闭环：结果必须“可解释、可行动、可复测”。
