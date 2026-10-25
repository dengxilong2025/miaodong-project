import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import ResultView from './ResultView.vue'

function buildResult(overrides = {}) {
  return {
    request_id: 'req_1',
    content_version: 3,
    model_version: 'cat-intent-0.1',
    degraded: false,
    primary_intent: { code: 'ATTENTION', label: '求关注/求陪伴', confidence: 0.66 },
    explanations: [{ factor: 'PATTERN', text: '叫声更像在发起互动' }],
    followup_question: {
      id: 'q_night_01',
      text: '通常发生在你关灯后 0-30 分钟内吗？',
      options: [
        { value: 'yes', label: '是' },
        { value: 'no', label: '否' },
      ],
    },
    suggestions: [
      {
        id: 's_night_01',
        title: '睡前小仪式',
        steps: ['逗猫棒 5-10 分钟', '关灯后保持安静'],
        expected_window_hours: 24,
        retest_tip: '明晚同一时段再测一次',
      },
    ],
    risk_level: { level: 'green', message: '先按建议调整看看' },
    optional_tools_section: {
      collapsed_by_default: true,
      content_blocks: [{ type: 'guide', title: '避坑采购指南', bullets: ['不要用惩罚'] }],
    },
    share_asset: { share_text_template: '我家猫这次更像：{label}（{confidence}%）' },
    ...overrides,
  }
}

function setup(result = buildResult()) {
  const api = { postJson: vi.fn(async () => ({ ok: true })) }
  const telemetry = { track: vi.fn(async () => undefined) }
  const wrapper = mount(ResultView, {
    props: { api, telemetry, result, problemId: 'night_meow' },
  })
  return { api, telemetry, wrapper }
}

function tracked(telemetry, name) {
  return telemetry.track.mock.calls.find(([eventName]) => eventName === name)
}

describe('ResultView', () => {
  beforeEach(() => {
    globalThis.localStorage?.clear()
  })

  it('渲染意图、解释、追问、建议、风险与工具区', async () => {
    const { telemetry, wrapper } = setup()
    await flushPromises()

    expect(wrapper.text()).toContain('求关注/求陪伴')
    expect(wrapper.text()).toContain('置信度 66%')
    expect(wrapper.text()).toContain('叫声更像在发起互动')
    expect(wrapper.text()).toContain('通常发生在你关灯后 0-30 分钟内吗？')
    expect(wrapper.text()).toContain('睡前小仪式')
    expect(wrapper.text()).toContain('风险提示 · 绿灯')
    expect(wrapper.text()).toContain('避坑采购指南')
    expect(tracked(telemetry, 'result_page_viewed')).toBeTruthy()
    expect(tracked(telemetry, 'followup_question_shown')).toBeTruthy()
  })

  it('回答追问与标记建议会记录埋点', async () => {
    const { telemetry, wrapper } = setup()
    await flushPromises()

    await wrapper.findAll('.chips .chip')[0].trigger('click')
    expect(tracked(telemetry, 'followup_question_answered')?.[1]).toMatchObject({
      question_id: 'q_night_01',
      answer_value: 'yes',
    })

    const doneButton = wrapper.findAll('button').find((b) => b.text() === '我做了')
    await doneButton.trigger('click')
    expect(tracked(telemetry, 'suggestion_mark_done')?.[1]).toMatchObject({
      suggestion_id: 's_night_01',
    })
    expect(doneButton.text()).toBe('已完成')
  })

  it('反馈会写入后端并显示结果', async () => {
    const { api, wrapper } = setup()
    await flushPromises()

    const helpfulButton = wrapper.findAll('button').find((b) => b.text() === '有用')
    await helpfulButton.trigger('click')
    await flushPromises()

    expect(api.postJson).toHaveBeenCalledWith(
      '/v1/feedback',
      expect.objectContaining({ request_id: 'req_1', helpful: true, problem_id: 'night_meow' }),
    )
    expect(wrapper.text()).toContain('已反馈，感谢～')
  })

  it('可以把当前结果保存为复测基线', async () => {
    const { wrapper } = setup()
    await flushPromises()

    const saveButton = wrapper.findAll('button').find((b) => b.text() === '保存为基线')
    await saveButton.trigger('click')

    expect(wrapper.text()).toContain('已保存为该问题的基线')
    expect(wrapper.text()).toContain('当前结果已经是基线')
  })

  it('降级结果展示问题库建议与重试入口', async () => {
    const degraded = buildResult({
      degraded: true,
      degraded_reason: 'audio_normalize_failed',
      message: '推理解读暂时不可用',
      primary_intent: undefined,
      followup_question: undefined,
      risk_level: undefined,
      optional_tools_section: undefined,
      suggestions: [{ id: 's1', title: '先记录叫的时间', steps: ['连续记录 3 天'] }],
    })
    const { wrapper } = setup(degraded)
    await flushPromises()

    expect(wrapper.text()).toContain('本次解读不完整')
    expect(wrapper.text()).toContain('音频格式无法识别')
    expect(wrapper.text()).toContain('先记录叫的时间')

    const retryButton = wrapper.findAll('button').find((b) => b.text() === '再试一次')
    await retryButton.trigger('click')
    expect(wrapper.emitted('retry')).toHaveLength(1)
  })
})
