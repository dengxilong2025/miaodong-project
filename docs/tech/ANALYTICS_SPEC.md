# 埋点事件字典 + 指标口径（MVP）

版本：v0.1（适配 8 周 MVP 与小红书冷启动）  
目标：让增长、内容迭代、灰度回滚都有“可量化依据”；同时支持后续画像/品牌合作/变现。

---

## 1. 基本原则

1) **事件少而关键**：先覆盖 AARRR + 内容迭代闭环（有用率/复测率/分享率）  
2) **强一致性**：事件命名、字段命名全局统一（snake_case）  
3) **可回溯**：每条推理结果与关键行为都带 `request_id` + `content_version`  
4) **隐私最小化**：不上传原始音频到埋点系统；音频仅用 `audio_id` 引用  

---

## 2. 公共字段（所有事件必带）

| 字段 | 类型 | 示例 | 说明 |
|---|---|---|---|
| event_name | string | inference_succeeded | 事件名 |
| ts_ms | int | 1710000000000 | 时间戳（毫秒） |
| user_id | string | u_123 | 用户ID（匿名也可） |
| session_id | string | s_abc | 会话ID |
| platform | string | ios/android | 平台 |
| app_version | string | 0.1.0 | 客户端版本 |
| content_version | int | 1 | 当前内容版本（发布系统生成） |
| experiment_bucket | string | exp_xhs_v1:A | AB/灰度桶（可选） |

### 2.1 推理链路公共字段（适用推理相关事件）

| 字段 | 类型 | 示例 | 说明 |
|---|---|---|---|
| request_id | string | r_001 | 推理请求ID（端到端追踪） |
| audio_id | string | a_789 | 音频对象ID |
| entry | string | TEST/PROBLEM | 入口：测一测/问题库 |
| problem_id | string | night_meow | 关联问题（可空） |
| model_version | string | cat-intent-0.1 | 模型版本 |
| primary_intent_code | string | ATTENTION | 主意图（可空：失败时） |
| confidence | float | 0.78 | 置信度（可空） |
| risk_badges | array<string> | ["STRESS_SUSPECTED"] | 风险徽标（仅code） |

---

## 3. 事件字典（MVP P0）

> 事件按用户路径组织：获取→激活→留存→分享/推荐→反馈复测。

### 3.1 获取与激活

#### app_open
触发：启动 App / 回到前台  
关键字段：referrer（可选）、utm_source（可选）

#### onboarding_completed
触发：首次进入完成（或跳过）  
字段：completed（bool）、steps（int）

### 3.2 音频上传

#### upload_url_requested
触发：请求直传 URL  
字段：content_type、duration_ms

#### audio_upload_succeeded
触发：音频直传成功  
字段：audio_id、bytes

#### audio_upload_failed
触发：音频直传失败  
字段：audio_id、error_code、network_type

### 3.3 推理（核心）

#### inference_started
触发：调用 `/v1/inference` 前  
字段：request_id、audio_id、entry、problem_id、context_keys（array）

#### inference_succeeded
触发：推理返回成功  
字段：request_id、model_version、primary_intent_code、confidence、risk_badges

#### inference_failed
触发：推理失败/超时/降级  
字段：request_id、error_code、elapsed_ms、degraded（bool）

### 3.4 结果页与内容消费

#### result_page_viewed
触发：结果页展示  
字段：request_id、primary_intent_code、problem_id

#### followup_question_shown
触发：追问展示  
字段：request_id、question_id

#### followup_question_answered
触发：追问提交  
字段：request_id、question_id、answer_value

#### suggestion_expanded
触发：展开某条建议  
字段：request_id、suggestion_id

#### suggestion_mark_done
触发：标记“我做了/已完成”（若MVP支持）  
字段：request_id、suggestion_id

#### tools_section_expanded
触发：展开工具区（先C阶段的关键验证指标）  
字段：request_id、problem_id

### 3.5 问题库

#### problem_list_viewed
触发：查看问题库列表  
字段：source（home/result/share_backflow）

#### problem_viewed
触发：进入某个问题详情  
字段：problem_id

### 3.6 分享（小红书冷启动关键）

#### share_clicked
触发：点击分享按钮  
字段：request_id、share_channel（xhs/wechat/other）、asset_type（result_card/persona/achievement/heatmap）

#### share_completed
触发：分享导出完成（保存到相册/复制文案）  
字段：request_id、share_channel、asset_type

### 3.7 反馈与复测（护城河）

#### feedback_submitted
触发：提交反馈（有用/不匹配等）  
字段：request_id、helpful（bool）、intent_match（match/mismatch/unknown）

#### retest_started
触发：在同一 problem 下发起复测  
字段：problem_id、baseline_request_id（可选）

#### retest_completed
触发：复测完成并生成对比  
字段：problem_id、delta_direction（better/same/worse）、delta_value（可选）

---

## 4. 指标口径（MVP P0）

### 4.1 北极星指标

**有效解决次数（Effective Fix Count）**
- 分子：`suggestion_mark_done` + `retest_completed` + `feedback_submitted(helpful=true)`（可按权重）  
- 分母：活跃用户或推理成功次数（按你运营口径选择）

### 4.2 核心漏斗（App 内）

1) 推理成功率 = inference_succeeded / inference_started  
2) 结果页到追问回答率 = followup_question_answered / followup_question_shown  
3) 建议展开率 = suggestion_expanded / result_page_viewed  
4) 反馈率 = feedback_submitted / result_page_viewed  
5) 复测率 = retest_completed / inference_succeeded  
6) 分享完成率 = share_completed / result_page_viewed  

### 4.3 口碑期“先C”的验证指标

- 工具区展开率 = tools_section_expanded / result_page_viewed  
> 若展开率很低，说明用户更关注“解决动作”；若很高但有用率低，说明工具内容需优化或更克制。

### 4.4 内容迭代指标（按 problem 维度）

- problem 进入率 = problem_viewed / active_users  
- problem 有用率 = feedback(helpful=true) / feedback_total  
- problem 复测率 = retest_completed / inference_succeeded(problem_id=X)  
- problem 分享率 = share_completed / result_page_viewed(problem_id=X)  

---

## 5. 发布/灰度与指标联动（必做）

每次发布生成新 `content_version` 后，需在后台看板对比：

- 发布后 24h / 72h：有用率、复测率、分享率是否变化  
- 若出现显著下滑：一键回滚到上个版本  

---

## 6. 后续扩展（P1）

- persona_card_generated / achievement_unlocked / heatmap_generated 等增长模块事件
- 带货期再新增：sku_exposed / sku_clicked / purchase_redirected（注意合规与反感控制）

