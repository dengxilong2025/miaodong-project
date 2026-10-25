export const DEFAULT_SHARE_TEMPLATE =
  '我家猫这次更像：{label}（{confidence}%）。来喵懂试试 #喵懂 #喵测'

export function asMap(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  return value
}

export function asListOfMap(value) {
  if (!Array.isArray(value)) return []
  return value.filter((item) => item && typeof item === 'object' && !Array.isArray(item))
}

export function confidenceValue(raw) {
  if (raw === null || raw === undefined || raw === '') return null
  const value = typeof raw === 'number' ? raw : Number(raw)
  return Number.isFinite(value) ? value : null
}

export function confidencePercent(raw) {
  const value = confidenceValue(raw)
  if (value === null) return null
  return value >= 0 && value <= 1 ? Math.round(value * 100) : Math.round(value)
}

export function formatIsoTime(iso) {
  if (!iso || !String(iso).trim()) return '-'
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return String(iso)
  const pad = (n) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

export function formatConfidenceDelta(current, baseline) {
  const diff = current - baseline
  if (diff === 0) return '0%'
  return `${diff > 0 ? '+' : ''}${diff}%`
}

export function buildShareText({ template, label, confidencePercent: percent }) {
  const resolvedLabel = String(label || '').trim() || '未知'
  const resolvedPercent = percent === null || percent === undefined ? '-' : String(percent)
  let text = String(template || DEFAULT_SHARE_TEMPLATE)
    .replaceAll('{label}', resolvedLabel)
    .replaceAll('{confidence}', resolvedPercent)
    .trim()

  const missingTags = ['#喵懂', '#喵测'].filter((tag) => !text.includes(tag))
  if (missingTags.length) {
    text = `${text} ${missingTags.join(' ')}`.trim()
  }
  return text
}

const DEGRADED_REASON_TEXT = {
  timeout: '分析服务响应超时',
  unreachable: '分析服务暂时不可达',
  bad_status: '分析服务返回异常',
  bad_json: '分析结果解析失败',
  audio_normalize_failed: '音频格式无法识别',
}

export function degradedReasonText(reason) {
  const code = String(reason || '').trim()
  if (!code || code === '-') return '暂时无法完成解读'
  return DEGRADED_REASON_TEXT[code] || `暂时无法完成解读（${code}）`
}

export function intentLabel(result) {
  const primary = asMap(result?.primary_intent)
  const label = primary?.label ?? primary?.name ?? result?.primary_intent
  return String(label || '').trim()
}

export function primaryIntentCode(result) {
  const primary = asMap(result?.primary_intent)
  if (!primary) return String(result?.primary_intent || '').trim()
  for (const key of ['code', 'intent_code', 'primary_intent_code', 'id']) {
    const value = String(primary[key] || '').trim()
    if (value) return value
  }
  return ''
}
