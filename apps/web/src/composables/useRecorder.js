import { onBeforeUnmount, ref } from 'vue'

const MIME_CANDIDATES = [
  'audio/webm;codecs=opus',
  'audio/webm',
  'audio/mp4',
  'audio/aac',
]

export function pickMimeType() {
  if (typeof MediaRecorder === 'undefined') return ''
  try {
    return MIME_CANDIDATES.find((type) => MediaRecorder.isTypeSupported(type)) || ''
  } catch {
    return ''
  }
}

export function formatClock(seconds) {
  const safe = Math.max(0, Math.floor(Number(seconds) || 0))
  return `0:${String(safe).padStart(2, '0')}`
}

export function useRecorder({ maxSeconds = 10 } = {}) {
  const state = ref('idle')
  const secondsLeft = ref(maxSeconds)
  const blob = ref(null)
  const audioUrl = ref('')
  const durationMs = ref(0)
  const error = ref('')

  let stream = null
  let recorder = null
  let chunks = []
  let timer = null
  let startedAt = 0
  let stopResolve = null
  let ignoreStop = false

  function clearTimer() {
    if (timer) {
      clearInterval(timer)
      timer = null
    }
  }

  function cleanupTracks() {
    if (stream) {
      stream.getTracks?.().forEach((track) => track.stop())
      stream = null
    }
  }

  function clearAudioUrl() {
    if (audioUrl.value) {
      URL.revokeObjectURL(audioUrl.value)
      audioUrl.value = ''
    }
  }

  function resetMedia() {
    clearTimer()
    clearAudioUrl()
    blob.value = null
    chunks = []
    durationMs.value = 0
    error.value = ''
    secondsLeft.value = maxSeconds
  }

  async function start() {
    if (state.value === 'recording' || state.value === 'requesting') return
    resetMedia()
    state.value = 'requesting'

    if (!navigator.mediaDevices?.getUserMedia) {
      state.value = 'error'
      error.value = '当前浏览器不支持麦克风录音，请使用最新版 Chrome/Safari。'
      return
    }
    if (typeof MediaRecorder === 'undefined') {
      state.value = 'error'
      error.value = '当前浏览器不支持 MediaRecorder。'
      return
    }

    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true },
      })
      const mimeType = pickMimeType()
      try {
        recorder = mimeType
          ? new MediaRecorder(stream, { mimeType })
          : new MediaRecorder(stream)
      } catch {
        recorder = new MediaRecorder(stream)
      }

      ignoreStop = false
      chunks = []
      recorder.ondataavailable = (event) => {
        if (event.data?.size) chunks.push(event.data)
      }
      recorder.onstop = () => {
        if (ignoreStop) {
          ignoreStop = false
          cleanupTracks()
          if (stopResolve) {
            stopResolve()
            stopResolve = null
          }
          return
        }
        const type = recorder?.mimeType || mimeType || 'audio/webm'
        const data = new Blob(chunks, { type })
        blob.value = data.size > 0 ? data : null
        durationMs.value = Math.max(0, Date.now() - startedAt)
        clearAudioUrl()
        if (blob.value) audioUrl.value = URL.createObjectURL(blob.value)
        state.value = blob.value ? 'recorded' : 'error'
        if (!blob.value) error.value = '没有录到声音，请靠近一点再试。'
        cleanupTracks()
        if (stopResolve) {
          stopResolve()
          stopResolve = null
        }
      }

      startedAt = Date.now()
      secondsLeft.value = maxSeconds
      state.value = 'recording'
      recorder.start()

      clearTimer()
      timer = setInterval(() => {
        const elapsed = Math.floor((Date.now() - startedAt) / 1000)
        secondsLeft.value = Math.max(0, maxSeconds - elapsed)
        if (secondsLeft.value <= 0) {
          clearTimer()
          void stop()
        }
      }, 200)
    } catch (err) {
      cleanupTracks()
      state.value = 'error'
      error.value = `无法使用麦克风：${err?.message || err}`
    }
  }

  function stop() {
    clearTimer()
    if (!recorder || recorder.state === 'inactive') return Promise.resolve()
    return new Promise((resolve) => {
      stopResolve = resolve
      try {
        recorder.stop()
      } catch {
        cleanupTracks()
        resolve()
      }
    })
  }

  function reset() {
    clearTimer()
    ignoreStop = true
    if (recorder && recorder.state === 'recording') {
      try {
        recorder.stop()
      } catch {
        // ignore
      }
    }
    recorder = null
    cleanupTracks()
    resetMedia()
    state.value = 'idle'
  }

  onBeforeUnmount(() => {
    clearTimer()
    ignoreStop = true
    if (recorder && recorder.state === 'recording') {
      try {
        recorder.stop()
      } catch {
        // ignore
      }
    }
    cleanupTracks()
    clearAudioUrl()
  })

  return {
    state,
    secondsLeft,
    blob,
    audioUrl,
    durationMs,
    error,
    start,
    stop,
    reset,
  }
}
