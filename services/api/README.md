# Go 业务 API（预留）

职责（建议按域分包，MVP 可先单体实现）：
- user / auth
- pets
- content（问题库/追问/建议/模板/版本发布）
- inference_orchestrator（推理编排：调用 Python 推理，做降级/合并策略）
- recommendation（工具区与后续变现策略）
- telemetry（埋点接入）

