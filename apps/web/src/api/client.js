const TOKEN_KEY = 'miaodong.h5.token'
const USER_KEY = 'miaodong.h5.user_id'

export class ApiClient {
  constructor({
    baseUrl = import.meta.env.VITE_API_BASE || '',
    storage = globalThis.localStorage,
    fetchImpl = globalThis.fetch?.bind(globalThis),
  } = {}) {
    this.baseUrl = String(baseUrl || '').replace(/\/$/, '')
    this.storage = storage
    this.fetchImpl = fetchImpl
  }

  getToken() {
    try {
      return this.storage?.getItem(TOKEN_KEY) || ''
    } catch {
      return ''
    }
  }

  getUserId() {
    try {
      return this.storage?.getItem(USER_KEY) || ''
    } catch {
      return ''
    }
  }

  async ensureAnonymousAuth() {
    if (this.getToken()) return this.getUserId()
    const res = await this.postJson('/v1/auth/anonymous', {})
    const userId = String(res.user_id || '')
    const token = String(res.token || '')
    if (!userId || !token) throw new Error('登录响应缺少 user_id/token')
    this.storage.setItem(TOKEN_KEY, token)
    this.storage.setItem(USER_KEY, userId)
    return userId
  }

  async postJson(path, body = {}) {
    return this.request(path, { method: 'POST', body })
  }

  async getJson(path) {
    return this.request(path, { method: 'GET' })
  }

  async request(path, { method = 'GET', body } = {}) {
    const headers = {
      'Content-Type': 'application/json',
      'X-Client-Channel': 'h5',
    }
    const token = this.getToken()
    if (token) headers.Authorization = `Bearer ${token}`

    const res = await this.fetchImpl(`${this.baseUrl}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    })
    return this.parseJson(res)
  }

  async putBinary(url, headers = {}, blob) {
    const finalHeaders = {
      'Content-Type': blob?.type || 'application/octet-stream',
      ...headers,
    }
    const res = await this.fetchImpl(url, {
      method: 'PUT',
      headers: finalHeaders,
      body: blob,
    })
    if (res.status !== 200 && res.status !== 204) {
      const text = await res.text().catch(() => '')
      throw new Error(`上传失败 HTTP ${res.status}: ${text.slice(0, 200)}`)
    }
  }

  async parseJson(res) {
    const text = await res.text()
    let data = null
    if (text) {
      try {
        data = JSON.parse(text)
      } catch {
        data = null
      }
    }
    if (!res.ok) {
      const message = data?.error?.message || text || `HTTP ${res.status}`
      throw new Error(`HTTP ${res.status}: ${String(message).slice(0, 200)}`)
    }
    if (!data || typeof data !== 'object') {
      throw new Error('接口返回不是 JSON 对象')
    }
    return data
  }
}

export function createApiClient(options = {}) {
  return new ApiClient(options)
}
