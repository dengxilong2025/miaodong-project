<script setup>
import { computed, reactive, ref, watch } from 'vue'

import {
  DEFAULT_SHARE_TEMPLATE,
  asListOfMap,
  asMap,
  buildShareText,
  confidencePercent,
  confidenceValue,
  degradedReasonText,
  formatConfidenceDelta,
  formatIsoTime,
  intentLabel,
  primaryIntentCode,
} from '../lib/result'
import { createRetestStore } from '../retest'

const props = defineProps({
  api: { type: Object, required: true },
  telemetry: { type: Object, required: true },
  result: { type: Object, required: true },
  problemId: { type: String, default: '' },
})

const emit = defineEmits(['retry', 'again'])

const retestStore = createRetestStore()
const doneSuggestions = reactive(new Set())
const followupAnswer = ref('')
const baseline = ref(null)
const baselineLoaded = ref(false)
const baselineBusy = ref(false)
const retestBusy = ref(false)
const feedbackState = ref('idle')
const shareBusy = ref(false)
const note = ref('')
const toolsTracked = ref(false)
const currentAtIso = ref('')

let noteTimer = 0

function setNote(message) {
  note.value = message
  window.clearTimeout(noteTimer)
  noteTimer = window.setTimeout(() => {
    note.value = ''
  }, 3200)
}

const requestId = computed(() => String(props.result?.request_id || ''))
const contentVersion = computed(() => {
  const value = Number(props.result?.content_version)
  return Number.isFinite(value) && value > 0 ? value : undefined
})
const isDegraded = computed(
  () => props.result?.degraded === true || props.result?.degraded === 'true',
)
const label = computed(() => intentLabel(props.result))
const percent = computed(() => confidencePercent(asMap(props.result?.primary_intent)?.confidence))
const reasonText = computed(() =>
  degradedReasonText(props.result?.degraded_reason ?? props.result?.reason),
)

function track(eventName, payload = {}) {
  return props.telemetry.track(eventName, payload, {
    requestId: requestId.value,
    contentVersion: contentVersion.value,
  })
}

const explanations = computed(() => {
  const raw = props.result?.explanations
  if (!Array.isArray(raw)) return []
  return raw
    .map((item, index) => {
      if (item && typeof item === 'object') {
        return {
          key: String(item.factor || item.title || `e${index}`),
          badge: factorLabel(item.factor),
          text: String(item.text || item.explanation || item.reason || '').trim(),
        }
      }
      return { key: `e${index}`, badge: '', text: String(item || '').trim() }
    })
    .filter((item) => item.text)
})

function factorLabel(factor) {
  switch (String(factor || '').toUpperCase()) {
    case 'PATTERN':
      return '叫声模式'
    case 'CONTEXT':
      return '场景线索'
    case 'HISTORY':
      return '历史习惯'
    default:
      return String(factor || '')
  }
}

const followup = computed(() => asMap(props.result?.followup_question))
const followupOptions = computed(() =>
  asListOfMap(followup.value?.options).map((option) => ({
    value: String(option.value ?? option.label ?? ''),
    label: String(option.label ?? option.value ?? ''),
  })),
)

const suggestions = computed(() =>
  asListOfMap(props.result?.suggestions).map((item) => ({
    id: String(item.id || ''),
    title: String(item.title || '建议'),
    steps: textList(item.steps),
    windowHours: Number(item.expected_window_hours) || 0,
    retestTip: String(item.retest_tip || '').trim(),
  })),
)

const risk = computed(() => asMap(props.result?.risk_level))
const riskMeta = computed(() => {
  const level = String(risk.value?.level || 'green').toLowerCase()
  if (level === 'red') return { level: 'red', label: '红灯' }
  if (level === 'yellow') return { level: 'yellow', label: '黄灯' }
  return { level: 'green', label: '绿灯' }
})

const toolBlocks = computed(() =>
  asListOfMap(props.result?.optional_tools_section?.content_blocks).map((block) => ({
    type: String(block.type || ''),
    title: String(block.title || ''),
    bullets: textList(block.bullets),
    items: asListOfMap(block.items).map((item) => ({
      name: String(item.name || item.title || item.sku_key || ''),
      reason: String(item.reason || '').trim(),
    })),
  })),
)

function textList(value) {
  if (!Array.isArray(value)) return []
  return value
    .map((item) => {
      if (item && typeof item === 'object') {
        return String(item.text || item.title || '').trim()
      }
      return String(item || '').trim()
    })
    .filter(Boolean)
}

const shareTemplate = computed(() => {
  const template = asMap(props.result?.share_asset)?.share_text_template
  return String(template || '').trim() || DEFAULT_SHARE_TEMPLATE
})

const nativeShareAvailable = computed(() => typeof globalThis.navigator?.share === 'function')

const currentTimestamp = computed(() => {
  const created = String(props.result?.created_at || '').trim()
  return created || currentAtIso.value
})

const hasComparableBaseline = computed(
  () =>
    !!props.problemId &&
    !!baseline.value &&
    !!requestId.value &&
    baseline.value.requestId !== requestId.value,
)

const labelChanged = computed(
  () =>
    !!baseline.value &&
    !!label.value &&
    String(baseline.value.label || '') !== label.value,
)

const deltaText = computed(() => {
  if (!baseline.value) return '-'
  const current = percent.value
  const previous = confidencePercent(baseline.value.confidence)
  if (current === null || previous === null) return '-'
  return formatConfidenceDelta(current, previous)
})

function resetLocalState() {
  doneSuggestions.clear()
  followupAnswer.value = ''
  baseline.value = null
  baselineLoaded.value = false
  baselineBusy.value = false
  retestBusy.value = false
  feedbackState.value = 'idle'
  shareBusy.value = false
  toolsTracked.value = false
  note.value = ''
  currentAtIso.value = new Date().toISOString()
}

function loadBaseline() {
  if (!props.problemId) {
    baselineLoaded.value = true
    return
  }
  baseline.value = retestStore.getBaseline(props.problemId)
  baselineLoaded.value = true
}

watch(
  () => props.result,
  () => {
    resetLocalState()
    loadBaseline()
    const code = primaryIntentCode(props.result)
    void track('result_page_viewed', {
      problem_id: props.problemId || null,
      primary_intent_code: code || null,
    })
    if (followup.value) {
      void track('followup_question_shown', { question_id: followup.value.id || null })
    }
  },
  { immediate: true },
)

watch(
  () => props.problemId,
  () => loadBaseline(),
)

function answerFollowup(value) {
  if (!value || followupAnswer.value === value) return
  followupAnswer.value = value
  void track('followup_question_answered', {
    question_id: followup.value?.id || null,
    answer_value: value,
  })
}

function markSuggestionDone(suggestion) {
  if (!suggestion.id || doneSuggestions.has(suggestion.id)) return
  doneSuggestions.add(suggestion.id)
  void track('suggestion_mark_done', {
    suggestion_id: suggestion.id,
    problem_id: props.problemId || null,
  })
}

function onToolsToggle(event) {
  if (!event.target.open || toolsTracked.value) return
  toolsTracked.value = true
  void track('tools_section_expanded', { problem_id: props.problemId || null })
}

async function sendFeedback(helpful) {
  if (!requestId.value) {
    setNote('缺少 request_id，暂时无法反馈')
    return
  }
  if (feedbackState.value === 'sending' || feedbackState.value === 'sent') return

  feedbackState.value = 'sending'
  try {
    await props.api.postJson('/v1/feedback', {
      request_id: requestId.value,
      helpful,
      problem_id: props.problemId || undefined,
      content_version: contentVersion.value,
    })
    feedbackState.value = 'sent'
    await track('feedback_submitted', {
      helpful,
      problem_id: props.problemId || null,
    })
    setNote('已反馈，感谢～')
  } catch (error) {
    feedbackState.value = 'idle'
    setNote(`反馈失败：${error?.message || error}`)
  }
}

function saveBaseline() {
  if (!props.problemId) {
    setNote('缺少问题，无法保存基线')
    return
  }
  if (!requestId.value || !label.value || percent.value === null) {
    setNote('当前结果信息不完整，无法保存基线')
    return
  }

  baselineBusy.value = true
  try {
    const next = {
      problemId: props.problemId,
      requestId: requestId.value,
      label: label.value,
      confidence: confidenceValue(asMap(props.result?.primary_intent)?.confidence),
      createdAtIso: currentTimestamp.value,
    }
    if (!retestStore.saveBaseline(props.problemId, next)) {
      setNote('本地存储不可用，暂时无法保存基线')
      return
    }
    baseline.value = retestStore.getBaseline(props.problemId)
    setNote('已保存为该问题的基线')
  } finally {
    baselineBusy.value = false
  }
}

async function submitRetest() {
  if (!props.problemId) {
    setNote('缺少问题，无法提交复测')
    return
  }
  if (!baseline.value) {
    setNote('还没有基线结果，先保存一次基线吧')
    return
  }
  if (!requestId.value) {
    setNote('缺少 request_id，暂时无法提交复测')
    return
  }
  if (baseline.value.requestId === requestId.value) {
    setNote('当前结果已是基线，再测一次再提交复测吧')
    return
  }
  if (retestBusy.value) return

  retestBusy.value = true
  try {
    await track('retest_started', {
      problem_id: props.problemId,
      baseline_request_id: baseline.value.requestId,
    })

    await props.api.postJson('/v1/retest', {
      problem_id: props.problemId,
      baseline_request_id: baseline.value.requestId,
      current_request_id: requestId.value,
      content_version: contentVersion.value,
    })

    const current = percent.value
    const previous = confidencePercent(baseline.value.confidence)
    const diff = current !== null && previous !== null ? current - previous : null
    const direction = diff === null ? 'same' : diff === 0 ? 'same' : diff > 0 ? 'better' : 'worse'
    await track('retest_completed', {
      problem_id: props.problemId,
      delta_direction: direction,
      delta_value: diff,
    })
    setNote('已提交复测记录')
  } catch (error) {
    setNote(`提交复测失败：${error?.message || error}`)
  } finally {
    retestBusy.value = false
  }
}

function buildText() {
  return buildShareText({
    template: shareTemplate.value,
    label: label.value,
    confidencePercent: percent.value,
  })
}

async function copyShareText() {
  const text = buildText()
  await track('share_clicked', { share_channel: 'copy', asset_type: 'text' })
  shareBusy.value = true
  try {
    await copyToClipboard(text)
    await track('share_completed', { share_channel: 'copy', asset_type: 'text' })
    setNote('已复制分享文案')
  } catch (error) {
    setNote(`复制分享文案失败：${error?.message || error}`)
  } finally {
    shareBusy.value = false
  }
}

async function systemShare() {
  if (!nativeShareAvailable.value) {
    await copyShareText()
    return
  }
  await track('share_clicked', { share_channel: 'system', asset_type: 'text' })
  shareBusy.value = true
  try {
    await globalThis.navigator.share({ text: buildText() })
    await track('share_completed', { share_channel: 'system', asset_type: 'text' })
  } catch (error) {
    if (error?.name !== 'AbortError') {
      setNote(`系统分享失败：${error?.message || error}`)
    }
  } finally {
    shareBusy.value = false
  }
}

async function copyToClipboard(text) {
  if (globalThis.navigator?.clipboard?.writeText) {
    await globalThis.navigator.clipboard.writeText(text)
    return
  }
  const area = document.createElement('textarea')
  area.value = text
  area.setAttribute('readonly', '')
  area.style.position = 'fixed'
  area.style.opacity = '0'
  document.body.appendChild(area)
  area.select()
  const ok = document.execCommand('copy')
  document.body.removeChild(area)
  if (!ok) throw new Error('当前浏览器不支持自动复制')
}
</script>

<template>
  <section ref="resultCard" class="card result-card" :class="{ 'is-degraded': isDegraded }">
    <template v-if="isDegraded">
      <div class="result-head">
        <span class="eyebrow">本次解读不完整</span>
        <h2>{{ result.message || '推理解读暂时不可用' }}</h2>
        <p class="hint">原因：{{ reasonText }}。可以稍后再试，或先按问题库建议排查。</p>
      </div>

      <div class="actions">
        <button class="primary-button" type="button" @click="emit('retry')">再试一次</button>
        <button class="secondary-button" type="button" @click="emit('again')">重新录音</button>
      </div>

      <div v-if="suggestions.length" class="section">
        <h3 class="section-title">先按问题库建议排查</h3>
        <article v-for="item in suggestions" :key="item.id || item.title" class="sub-card">
          <h4>{{ item.title }}</h4>
          <ul v-if="item.steps.length" class="steps">
            <li v-for="(step, index) in item.steps" :key="index">{{ step }}</li>
          </ul>
        </article>
      </div>
    </template>

    <template v-else>
      <div class="result-head">
        <span class="eyebrow">这次更像</span>
        <h2>{{ label || '暂未识别' }}</h2>
        <p v-if="percent !== null" class="confidence-line">置信度 {{ percent }}%</p>
        <div v-if="percent !== null" class="confidence-track" aria-hidden="true">
          <span :style="{ width: `${Math.max(0, Math.min(100, percent))}%` }"></span>
        </div>
        <p class="hint">结果只作行为参考，不构成医疗诊断。</p>
      </div>

      <div v-if="explanations.length" class="section">
        <h3 class="section-title">为什么这么判断</h3>
        <ul class="explain-list">
          <li v-for="item in explanations" :key="item.key">
            <span v-if="item.badge" class="badge">{{ item.badge }}</span>
            <span>{{ item.text }}</span>
          </li>
        </ul>
      </div>

      <div v-if="followup" class="section sub-card">
        <h3 class="section-title">帮我校准一下</h3>
        <p class="followup-text">{{ followup.text }}</p>
        <div v-if="followupOptions.length" class="chips">
          <button
            v-for="option in followupOptions"
            :key="option.value"
            class="chip"
            :class="{ 'is-active': followupAnswer === option.value }"
            type="button"
            @click="answerFollowup(option.value)"
          >
            {{ option.label }}
          </button>
        </div>
        <p v-if="followupAnswer" class="inline-note is-ok">已记录，谢谢～</p>
      </div>

      <div v-if="suggestions.length" class="section">
        <h3 class="section-title">建议</h3>
        <article v-for="item in suggestions" :key="item.id || item.title" class="sub-card">
          <h4>{{ item.title }}</h4>
          <ul v-if="item.steps.length" class="steps">
            <li v-for="(step, index) in item.steps" :key="index">{{ step }}</li>
          </ul>
          <p v-if="item.windowHours > 0" class="meta">
            预计 {{ item.windowHours }} 小时内可观察
          </p>
          <p v-if="item.retestTip" class="meta">复测提示：{{ item.retestTip }}</p>
          <button
            class="ghost-button"
            type="button"
            :disabled="doneSuggestions.has(item.id)"
            @click="markSuggestionDone(item)"
          >
            {{ doneSuggestions.has(item.id) ? '已完成' : '我做了' }}
          </button>
        </article>
      </div>

      <div v-if="risk" class="risk-card" :class="`is-${riskMeta.level}`">
        <div class="risk-head">
          <span class="risk-dot" aria-hidden="true"></span>
          <strong>风险提示 · {{ riskMeta.label }}</strong>
        </div>
        <p>{{ risk.message }}</p>
        <p class="meta">本结果不构成医疗诊断，出现异常请及时咨询兽医。</p>
      </div>

      <details v-if="toolBlocks.length" class="tools" @toggle="onToolsToggle">
        <summary>
          <span>省力工具（可选）</span>
          <small>不买也能先按建议做</small>
        </summary>
        <div class="tools-body">
          <div v-for="block in toolBlocks" :key="block.title" class="tool-block">
            <h4>{{ block.title }}</h4>
            <ul v-if="block.bullets.length" class="steps">
              <li v-for="(bullet, index) in block.bullets" :key="index">{{ bullet }}</li>
            </ul>
            <ul v-else class="steps">
              <li v-for="(item, index) in block.items" :key="index">
                <strong>{{ item.name }}</strong>
                <span v-if="item.reason"> · {{ item.reason }}</span>
              </li>
            </ul>
          </div>
        </div>
      </details>

      <div v-if="problemId && baselineLoaded" class="section sub-card retest-card">
        <h3 class="section-title">复测对比</h3>
        <template v-if="hasComparableBaseline">
          <div class="compare-grid">
            <div>
              <span>上次</span>
              <strong>{{ baseline.label }}</strong>
              <small>{{ formatIsoTime(baseline.createdAtIso) }}</small>
            </div>
            <div>
              <span>本次</span>
              <strong>{{ label }}</strong>
              <small>{{ formatIsoTime(currentTimestamp) }}</small>
            </div>
          </div>
          <p class="meta">
            {{ labelChanged ? '标签发生变化' : '标签保持一致' }} · 置信度变化
            {{ deltaText }}
          </p>
          <div class="actions">
            <button class="primary-button" type="button" :disabled="retestBusy" @click="submitRetest">
              {{ retestBusy ? '提交中…' : '提交复测记录' }}
            </button>
            <button class="secondary-button" type="button" :disabled="baselineBusy" @click="saveBaseline">
              保存为新的基线
            </button>
          </div>
        </template>
        <template v-else>
          <p class="hint">
            {{
              baseline
                ? '当前结果已经是基线，再测一次后回来就能看到对比。'
                : '把这次结果保存为基线，72 小时内再测一次会自动展示对比。'
            }}
          </p>
          <button class="secondary-button" type="button" :disabled="baselineBusy" @click="saveBaseline">
            保存为基线
          </button>
        </template>
      </div>
    </template>

    <div v-if="!isDegraded" class="actions-row">
      <button
        class="primary-button"
        type="button"
        :disabled="feedbackState === 'sending' || feedbackState === 'sent'"
        @click="sendFeedback(true)"
      >
        有用
      </button>
      <button
        class="secondary-button"
        type="button"
        :disabled="feedbackState === 'sending' || feedbackState === 'sent'"
        @click="sendFeedback(false)"
      >
        没用
      </button>
    </div>

    <div v-if="!isDegraded" class="actions-row">
      <button class="secondary-button" type="button" :disabled="shareBusy" @click="copyShareText">
        复制分享文案
      </button>
      <button
        v-if="nativeShareAvailable"
        class="secondary-button"
        type="button"
        :disabled="shareBusy"
        @click="systemShare"
      >
        系统分享
      </button>
      <button class="secondary-button" type="button" @click="emit('again')">再测一次</button>
    </div>

    <p v-if="note" class="inline-note">{{ note }}</p>

    <details class="debug">
      <summary>调试信息</summary>
      <dl>
        <dt>request_id</dt>
        <dd>{{ requestId || '-' }}</dd>
        <dt>content_version</dt>
        <dd>{{ contentVersion ?? '-' }}</dd>
        <dt>model_version</dt>
        <dd>{{ result.model_version || '-' }}</dd>
        <dt>audio_meta</dt>
        <dd>{{ result.audio_meta ? JSON.stringify(result.audio_meta) : '-' }}</dd>
      </dl>
    </details>
  </section>
</template>
