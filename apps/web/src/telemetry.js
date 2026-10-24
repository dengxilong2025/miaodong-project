const SESSION_KEY = 'miaodong.h5.session'
const APP_VERSION = '0.1.0-web'

export class Telemetry {
  constructor(api, storage = globalThis.localStorage) {
    this.api = api
    this.storage = storage
  }

  sessionId() {
    try {
      const existing = this.storage?.getItem(SESSION_KEY)
      if (existing) return existing
      const value =
        globalThis.crypto?.randomUUID?.() ||
        `${Date.now()}-${Math.random().toString(16).slice(2)}`
      this.storage.setItem(SESSION_KEY, value)
      return value
    } catch {
      return `${Date.now()}-anon`
    }
  }

  async track(eventName, payload = {}) {
    const event = {
      event_name: eventName,
      ts_ms: Date.now(),
      user_id: this.api.getUserId(),
      session_id: this.sessionId(),
      platform: 'h5',
      channel: 'h5',
      app_version: APP_VERSION,
      payload,
    }
    try {
      await this.api.postJson('/v1/analytics/event', event)
    } catch {
      // 验证期不阻塞 UI；后续按 6.1 补离线队列。
    }
  }
}
