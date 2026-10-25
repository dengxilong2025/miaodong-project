const KEY_PREFIX = 'miaodong.h5.retest.'

export function createRetestStore(storage = globalThis.localStorage) {
  function key(problemId) {
    return `${KEY_PREFIX}${problemId}`
  }

  return {
    getBaseline(problemId) {
      if (!problemId) return null
      try {
        const raw = storage?.getItem(key(problemId))
        if (!raw) return null
        const data = JSON.parse(raw)
        if (!data || !data.requestId || !data.label) return null
        return data
      } catch {
        return null
      }
    },

    saveBaseline(problemId, baseline) {
      if (!problemId || !baseline?.requestId) return false
      try {
        storage?.setItem(
          key(problemId),
          JSON.stringify({
            problemId,
            requestId: baseline.requestId,
            label: baseline.label,
            confidence: baseline.confidence,
            createdAtIso: baseline.createdAtIso,
          }),
        )
        return true
      } catch {
        return false
      }
    },

    clear(problemId) {
      try {
        storage?.removeItem(key(problemId))
      } catch {
        // 忽略：本地存储不可用不影响结果页
      }
    },
  }
}
