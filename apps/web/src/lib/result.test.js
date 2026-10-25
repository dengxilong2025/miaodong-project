import { describe, expect, it } from 'vitest'

import {
  DEFAULT_SHARE_TEMPLATE,
  buildShareText,
  confidencePercent,
  confidenceValue,
  degradedReasonText,
  formatConfidenceDelta,
  formatIsoTime,
  intentLabel,
  primaryIntentCode,
} from './result'

describe('confidence', () => {
  it('把 0-1 的置信度转成百分比', () => {
    expect(confidencePercent(0.72)).toBe(72)
    expect(confidencePercent('0.5')).toBe(50)
  })

  it('兼容已经是百分数的值', () => {
    expect(confidencePercent(66)).toBe(66)
    expect(confidencePercent('88')).toBe(88)
  })

  it('非法值返回 null', () => {
    expect(confidencePercent(null)).toBeNull()
    expect(confidencePercent('abc')).toBeNull()
    expect(confidenceValue(undefined)).toBeNull()
  })
})

describe('share text', () => {
  it('替换模板占位符并补齐标签', () => {
    const text = buildShareText({
      template: '我家猫这次更像：{label}（{confidence}%）',
      label: '求关注/求陪伴',
      confidencePercent: 66,
    })
    expect(text).toBe('我家猫这次更像：求关注/求陪伴（66%） #喵懂 #喵测')
  })

  it('不重复添加已有标签', () => {
    const text = buildShareText({
      template: DEFAULT_SHARE_TEMPLATE,
      label: '想玩',
      confidencePercent: 72,
    })
    expect(text.match(/#喵懂/g)).toHaveLength(1)
    expect(text.match(/#喵测/g)).toHaveLength(1)
  })

  it('缺少标签或置信度时仍可生成文案', () => {
    const text = buildShareText({ template: '', label: '', confidencePercent: null })
    expect(text).toContain('未知')
    expect(text).toContain('-')
    expect(text).toContain('#喵懂')
  })
})

describe('result helpers', () => {
  it('从结果中读取意图标签与编码', () => {
    const result = { primary_intent: { code: 'PLAY', label: '想玩/精力过剩' } }
    expect(intentLabel(result)).toBe('想玩/精力过剩')
    expect(primaryIntentCode(result)).toBe('PLAY')
  })

  it('计算置信度变化文案', () => {
    expect(formatConfidenceDelta(72, 66)).toBe('+6%')
    expect(formatConfidenceDelta(60, 66)).toBe('-6%')
    expect(formatConfidenceDelta(66, 66)).toBe('0%')
  })

  it('降级原因映射为可读文案', () => {
    expect(degradedReasonText('timeout')).toBe('分析服务响应超时')
    expect(degradedReasonText('audio_normalize_failed')).toBe('音频格式无法识别')
    expect(degradedReasonText('unknown_code')).toContain('unknown_code')
  })

  it('格式化 ISO 时间', () => {
    const value = formatIsoTime('2026-10-24T08:30:00Z')
    expect(value).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/)
    expect(formatIsoTime('')).toBe('-')
  })
})
