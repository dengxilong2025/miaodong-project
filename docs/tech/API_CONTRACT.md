# API 契约草案 v0.1（同步推理）

本文件给出可实现的最小契约集合，目标：接口稳定、可版本化、可灰度、可回溯。

> 注：更完整的 JSON 示例请参考 `data/seed/miaodong-seed-v1.json`（内容与模板）。

---

## 0. 全局约定

- Base URL：`/v1`
- Auth：`Authorization: Bearer <token>`（MVP 支持匿名 token）
- Trace：服务端返回 `X-Request-Id`
- 版本：响应体包含 `schema_version`、`model_version`、并记录 `content_version`
- 错误格式：
```json
{ "error": { "code": "RATE_LIMITED", "message": "请稍后再试", "request_id": "..." } }
```

---

## 1) 获取匿名身份

`POST /v1/auth/anonymous`

Response：
```json
{ "token": "eyJ...", "user_id": "u_123", "expires_in": 2592000 }
```

---

## 2) 获取上传 URL（对象存储直传）

`POST /v1/audio/upload-url`

Request：
```json
{ "content_type": "audio/mp4", "duration_ms": 6000 }
```

Response：
```json
{
  "audio_id": "a_789",
  "upload_url": "https://object-store/...signed...",
  "headers": { "Content-Type": "audio/mp4" },
  "expires_in": 600
}
```

### 支持的 content_type（推荐）

- `audio/mp4`（.m4a / AAC-LC，iOS/Android 最通用）
- `audio/aac`
- `audio/wav`
- `audio/3gpp`（部分安卓录音）

服务端统一转码为：16kHz / mono / PCM WAV（推理侧只吃一种标准输入）。

---

## 3) 同步推理（核心）

`POST /v1/inference`

Request：
```json
{
  "audio_id": "a_789",
  "pet_id": "p_456",
  "entry": "TEST",
  "problem_id": "night_meow",
  "context_answers": { "time_of_day": "night", "before_feeding": true }
}
```

Response（结构要长期稳定）：
```json
{
  "request_id": "r_001",
  "schema_version": "1.0",
  "model_version": "cat-intent-0.1",
  "content_version": 1,

  "primary_intent": { "code": "ATTENTION", "label": "求关注/求陪伴", "confidence": 0.78 },
  "explanations": [
    { "factor": "PATTERN", "text": "叫声短促且间隔逐渐变短" },
    { "factor": "CONTEXT", "text": "发生在喂食前的夜间时段" }
  ],
  "risk_badges": [
    { "code": "STRESS_SUSPECTED", "level": "info", "title": "应激疑似", "message": "仅为风险提示，非诊断…" }
  ],

  "followup_question": {
    "id": "q_night_01",
    "text": "通常发生在你关灯后 0-30 分钟内吗？",
    "type": "single_choice",
    "options": [{ "value": "yes", "label": "是" }, { "value": "no", "label": "否" }]
  },

  "suggestions": [
    { "id": "s_night_01", "title": "睡前小仪式", "steps": ["…"], "expected_window_hours": 24, "retest_tip": "…" }
  ],

  "risk_level": { "level": "green", "message": "可先观察与调整作息…" },

  "optional_tools_section": {
    "collapsed_by_default": true,
    "content_blocks": [
      { "type": "guide", "title": "避坑采购指南", "bullets": ["…"] },
      {
        "type": "efficiency_list",
        "title": "省力工具（非必需）",
        "items": [{ "sku_key": "wand_toy_basic", "name": "逗猫棒", "reason": "…", "buy_link": null }]
      }
    ]
  },

  "share_asset": {
    "share_title": "测一测我家猫在想啥",
    "share_text_template": "我家猫这次更像：{label}（{confidence}%）…",
    "card_style": "result_card_v1"
  }
}
```

---

## 4) 问题库

`GET /v1/problems`  
`GET /v1/problems/{id}`

---

## 5) 反馈闭环

`POST /v1/feedback`

Request：
```json
{ "request_id": "r_001", "helpful": true, "intent_match": "match", "notes": "…" }
```
