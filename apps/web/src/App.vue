<script setup>
import { computed, nextTick, onMounted, ref } from 'vue'

import { createApiClient } from './api/client'
import ResultView from './components/ResultView.vue'
import { formatClock, useRecorder } from './composables/useRecorder'
import { primaryIntentCode } from './lib/result'
import { Telemetry } from './telemetry'

const api = createApiClient()
const telemetry = new Telemetry(api)
const recorder = useRecorder({ maxSeconds: 10 })

const authState = ref('loading')
const authError = ref('')
const userId = ref('')
const problems = ref([])
const loadingProblems = ref(false)
const selectedProblemId = ref('')

const uploading = ref(false)
const uploadError = ref('')
const uploadResult = ref(null)

const inferenceState = ref('idle')
const inferenceResult = ref(null)
const inferenceError = ref('')
const resultAnchor = ref(null)

const isRecording = computed(() => recorder.state.value === 'recording')
const analyzing = computed(() => inferenceState.value === 'loading')
const canSwitchProblem = computed(
  () => !uploading.value && !analyzing.value && !isRecording.value,
)
const canUpload = computed(
  () => recorder.state.value === 'recorded' && !!recorder.blob.value && !uploading.value,
)

function errorText(error) {
  return error?.message || String(error)
}

function timeOfDay() {
  const hour = new Date().getHours()
  return hour >= 22 || hour < 6 ? 'night' : 'day'
}

async function bootstrap() {
  authState.value = 'loading'
  authError.value = ''
  try {
    userId.value = await api.ensureAnonymousAuth()
    authState.value = 'ready'
    await telemetry.track('app_open')
    await loadProblems()
  } catch (error) {
    authState.value = 'error'
    authError.value = errorText(error)
  }
}

async function loadProblems() {
  loadingProblems.value = true
  try {
    const data = await api.getJson('/v1/problems?limit=3')
    problems.value = Array.isArray(data.items) ? data.items : []
    if (!selectedProblemId.value && problems.value.length) {
      selectedProblemId.value = problems.value[0].id
    }
  } catch {
    problems.value = []
  } finally {
    loadingProblems.value = false
  }
}

function selectProblem(problemId) {
  if (!canSwitchProblem.value) return
  if (selectedProblemId.value === problemId) return
  selectedProblemId.value = problemId
  if (uploadResult.value?.audio_url) {
    void runInference()
  }
}

function clearResult() {
  uploadResult.value = null
  uploadError.value = ''
  inferenceState.value = 'idle'
  inferenceResult.value = null
  inferenceError.value = ''
}

async function startRecording() {
  clearResult()
  await recorder.start()
}

async function stopRecording() {
  await recorder.stop()
}

function resetRecording() {
  clearResult()
  recorder.reset()
}

async function uploadRecording() {
  const data = recorder.blob.value
  if (!data) return
  uploading.value = true
  uploadError.value = ''
  uploadResult.value = null
  inferenceState.value = 'idle'
  inferenceResult.value = null

  let stage = 'upload_url'
  try {
    await api.ensureAnonymousAuth()
    await telemetry.track('upload_url_requested', {
      content_type: data.type,
      duration_ms: recorder.durationMs.value,
    })

    const instruction = await api.postJson('/v1/audio/upload-url', {
      content_type: data.type,
      duration_ms: recorder.durationMs.value,
    })
    if (!instruction.upload_url || !instruction.audio_url) {
      throw new Error('上传凭证不完整：缺少 upload_url/audio_url')
    }

    stage = 'upload'
    await api.putBinary(instruction.upload_url, instruction.headers || {}, data)
    uploadResult.value = instruction
    await telemetry.track('audio_upload_succeeded', {
      audio_id: instruction.audio_id,
      bytes: data.size,
    })

    uploading.value = false
    await runInference()
  } catch (error) {
    uploadError.value = errorText(error)
    await telemetry.track('audio_upload_failed', {
      error_code: uploadError.value,
      stage,
    })
  } finally {
    uploading.value = false
  }
}

async function runInference() {
  const audio = uploadResult.value
  if (!audio?.audio_url) return

  inferenceState.value = 'loading'
  inferenceError.value = ''
  inferenceResult.value = null

  await telemetry.track('inference_started', {
    audio_id: audio.audio_id,
    entry: 'TEST',
    problem_id: selectedProblemId.value || null,
    context_keys: ['time_of_day'],
  })

  try {
    const res = await api.postJson('/v1/inference', {
      audio_url: audio.audio_url,
      entry: 'TEST',
      problem_id: selectedProblemId.value || undefined,
      context: { time_of_day: timeOfDay() },
    })
    inferenceResult.value = res

    const degraded = res.degraded === true || res.degraded === 'true'
    inferenceState.value = degraded ? 'degraded' : 'success'

    const meta = {
      requestId: res.request_id,
      contentVersion: Number(res.content_version),
    }
    if (degraded) {
      await telemetry.track(
        'inference_failed',
        {
          degraded: true,
          degraded_reason: res.degraded_reason || null,
          elapsed_ms: res.inference_latency_ms ?? null,
        },
        meta,
      )
    } else {
      const primary = res.primary_intent || {}
      await telemetry.track(
        'inference_succeeded',
        {
          model_version: res.model_version || null,
          primary_intent_code: primaryIntentCode(res) || null,
          confidence: primary.confidence ?? null,
          risk_badges: Array.isArray(res.risk_badges)
            ? res.risk_badges.map((badge) => badge?.code).filter(Boolean)
            : [],
        },
        meta,
      )
    }

    await nextTick()
    resultAnchor.value?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  } catch (error) {
    inferenceState.value = 'error'
    inferenceError.value = errorText(error)
    await telemetry.track('inference_failed', {
      degraded: false,
      error: inferenceError.value,
      problem_id: selectedProblemId.value || null,
    })
  }
}

function startAgain() {
  resetRecording()
  nextTick(() => window.scrollTo({ top: 0, behavior: 'smooth' }))
}

onMounted(bootstrap)
</script>

<template>
  <main class="page">
    <header class="hero">
      <div class="brand">
        <span class="brand-mark" aria-hidden="true"><span class="brand-ear"></span></span>
        <span>喵懂 · 喵测</span>
      </div>
      <h1>听懂它这一声</h1>
      <p class="lede">
        录一段 6–10 秒猫叫，先看意图解释，再决定要不要继续排查。结果只作行为参考，不构成医疗诊断。
      </p>

      <div class="auth-line" :class="`is-${authState}`">
        <span v-if="authState === 'loading'">正在准备匿名身份…</span>
        <span v-else-if="authState === 'ready'">匿名身份已就绪</span>
        <span v-else>登录失败：{{ authError }}</span>
        <button v-if="authState === 'error'" class="text-button" type="button" @click="bootstrap">
          重试
        </button>
      </div>
    </header>

    <section class="card recorder-card">
      <div class="card-head">
        <span class="step">01</span>
        <div>
          <h2>录一段猫叫</h2>
          <p class="hint">保持环境安静，手机靠近猫，最长 10 秒。</p>
        </div>
      </div>

      <div v-if="problems.length" class="problem-picker">
        <span class="picker-label">这次想先排查</span>
        <div class="chips">
          <button
            class="chip"
            :class="{ 'is-active': !selectedProblemId }"
            type="button"
            :disabled="!canSwitchProblem"
            @click="selectProblem('')"
          >
            还不确定
          </button>
          <button
            v-for="problem in problems"
            :key="problem.id"
            class="chip"
            :class="{ 'is-active': selectedProblemId === problem.id }"
            type="button"
            :disabled="!canSwitchProblem"
            @click="selectProblem(problem.id)"
          >
            {{ problem.title }}
          </button>
        </div>
        <p class="hint">选择后结果会附带对应追问与排查建议；切换会重新分析当前录音。</p>
      </div>

      <div class="recorder-body">
        <template v-if="recorder.state.value === 'idle' || recorder.state.value === 'error'">
          <button class="mic-button" type="button" :disabled="authState !== 'ready'" @click="startRecording">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path
                d="M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3Zm6 9a6 6 0 0 1-12 0M12 18v3m-3 0h6"
              />
            </svg>
            <span>开始录音</span>
          </button>
          <p v-if="recorder.error.value" class="error-note">{{ recorder.error.value }}</p>
        </template>

        <template v-else-if="recorder.state.value === 'requesting'">
          <div class="status-center">
            <span class="pulse"></span>
            <p>正在请求麦克风权限…</p>
          </div>
        </template>

        <template v-else-if="isRecording">
          <div class="status-center">
            <p class="timer">{{ formatClock(recorder.secondsLeft.value) }}</p>
            <p class="recording-label"><span class="dot"></span>录音中</p>
            <button class="secondary-button" type="button" @click="stopRecording">停止录音</button>
          </div>
        </template>

        <template v-else-if="recorder.state.value === 'recorded'">
          <audio class="preview" :src="recorder.audioUrl.value" controls></audio>
          <div class="actions">
            <button class="secondary-button" type="button" :disabled="uploading" @click="resetRecording">
              重新录
            </button>
            <button class="primary-button" type="button" :disabled="!canUpload" @click="uploadRecording">
              {{ uploading ? '正在上传…' : '上传并分析' }}
            </button>
          </div>
        </template>
      </div>

      <div v-if="uploadError" class="notice is-error">
        <strong>上传失败</strong>
        <span>{{ uploadError }}</span>
      </div>

      <div v-else-if="uploadResult" class="notice is-success">
        <strong>录音已上传</strong>
        <span>音频编号 {{ uploadResult.audio_id }}</span>
      </div>
    </section>

    <section v-if="analyzing" class="card analyzing-card">
      <div class="status-center">
        <span class="pulse"></span>
        <p>正在分析这段猫叫…</p>
        <p class="hint">首次分析需要下载并标准化音频，请稍等。</p>
      </div>
    </section>

    <section v-else-if="inferenceState === 'error'" class="card">
      <div class="card-head">
        <span class="step">!</span>
        <div>
          <h2>分析失败</h2>
          <p class="hint">{{ inferenceError }}</p>
        </div>
      </div>
      <div class="actions">
        <button class="primary-button" type="button" @click="runInference">重试</button>
        <button class="secondary-button" type="button" @click="startAgain">重新录音</button>
      </div>
    </section>

    <div v-else-if="inferenceResult" ref="resultAnchor" class="result-anchor">
      <ResultView
        :api="api"
        :telemetry="telemetry"
        :result="inferenceResult"
        :problem-id="selectedProblemId"
        @retry="runInference"
        @again="startAgain"
      />
    </div>

    <section class="card problems-card">
      <div class="card-head">
        <span class="step">02</span>
        <div>
          <h2>先看常见问题</h2>
          <p class="hint">数据来自同一套问题库，可切换上方排查方向。</p>
        </div>
      </div>

      <p v-if="loadingProblems" class="muted">正在加载问题库…</p>
      <ul v-else-if="problems.length" class="problem-list">
        <li v-for="problem in problems" :key="problem.id">
          <span class="problem-title">{{ problem.title }}</span>
          <span class="problem-summary">{{ problem.summary }}</span>
        </li>
      </ul>
      <p v-else class="muted">问题库暂不可用，不影响录音与上传。</p>
    </section>

    <footer class="footer">
      <p>喵懂 MVP · H5 验证版</p>
      <p>结果仅用于行为参考，不构成医疗诊断；如猫持续痛苦，请及时就医。</p>
    </footer>
  </main>
</template>
