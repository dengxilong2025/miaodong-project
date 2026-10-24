<script setup>
import { computed, onMounted, ref } from 'vue'

import { createApiClient } from './api/client'
import { formatClock, useRecorder } from './composables/useRecorder'
import { Telemetry } from './telemetry'

const api = createApiClient()
const telemetry = new Telemetry(api)
const recorder = useRecorder({ maxSeconds: 10 })

const authState = ref('loading')
const authError = ref('')
const userId = ref('')
const problems = ref([])
const loadingProblems = ref(false)

const uploading = ref(false)
const uploadError = ref('')
const uploadResult = ref(null)

const isRecording = computed(() => recorder.state.value === 'recording')
const canUpload = computed(
  () => recorder.state.value === 'recorded' && !!recorder.blob.value && !uploading.value,
)

function errorText(error) {
  return error?.message || String(error)
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
  } catch {
    problems.value = []
  } finally {
    loadingProblems.value = false
  }
}

async function startRecording() {
  uploadError.value = ''
  uploadResult.value = null
  await recorder.start()
}

async function stopRecording() {
  await recorder.stop()
}

function resetRecording() {
  uploadError.value = ''
  uploadResult.value = null
  recorder.reset()
}

async function uploadRecording() {
  const data = recorder.blob.value
  if (!data) return
  uploading.value = true
  uploadError.value = ''
  uploadResult.value = null

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
              {{ uploading ? '正在上传…' : '上传录音' }}
            </button>
          </div>
        </template>
      </div>

      <div v-if="uploadError" class="notice is-error">
        <strong>上传失败</strong>
        <span>{{ uploadError }}</span>
      </div>

      <div v-else-if="uploadResult" class="notice is-success">
        <strong>上传成功</strong>
        <span>音频编号 {{ uploadResult.audio_id }}，下一步接入结果页。</span>
      </div>
    </section>

    <section class="card problems-card">
      <div class="card-head">
        <span class="step">02</span>
        <div>
          <h2>先看常见问题</h2>
          <p class="hint">数据来自同一套问题库，后续可直接进入详情。</p>
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
