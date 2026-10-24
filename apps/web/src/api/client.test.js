import { describe, expect, it, vi } from 'vitest'

import { ApiClient } from './client'

function memoryStorage(initial = {}) {
  const data = new Map(Object.entries(initial))
  return {
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => data.set(key, value),
  }
}

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

describe('ApiClient', () => {
  it('creates anonymous auth and stores token', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ user_id: 'u_1', token: 't_1' }))
    const storage = memoryStorage()
    const api = new ApiClient({ baseUrl: 'http://api.test/', storage, fetchImpl })

    await expect(api.ensureAnonymousAuth()).resolves.toBe('u_1')

    expect(storage.getItem('miaodong.h5.token')).toBe('t_1')
    expect(storage.getItem('miaodong.h5.user_id')).toBe('u_1')
    expect(fetchImpl).toHaveBeenCalledWith(
      'http://api.test/v1/auth/anonymous',
      expect.objectContaining({ method: 'POST' }),
    )
  })

  it('reuses token and sends h5 channel header', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ items: [{ id: 'night_meow' }] }))
    const api = new ApiClient({
      baseUrl: 'http://api.test',
      storage: memoryStorage({ 'miaodong.h5.token': 't_1' }),
      fetchImpl,
    })

    const result = await api.getJson('/v1/problems?limit=3')

    expect(result.items[0].id).toBe('night_meow')
    const [, options] = fetchImpl.mock.calls[0]
    expect(options.headers.Authorization).toBe('Bearer t_1')
    expect(options.headers['X-Client-Channel']).toBe('h5')
  })

  it('uploads a blob to the absolute upload url', async () => {
    const fetchImpl = vi.fn(async () => new Response(null, { status: 204 }))
    const api = new ApiClient({ baseUrl: 'http://api.test', storage: memoryStorage(), fetchImpl })
    const blob = new Blob(['audio'], { type: 'audio/webm' })

    await api.putBinary('http://storage.test/audio/a_1', {}, blob)

    const [url, options] = fetchImpl.mock.calls[0]
    expect(url).toBe('http://storage.test/audio/a_1')
    expect(options.method).toBe('PUT')
    expect(options.headers['Content-Type']).toBe('audio/webm')
    expect(options.body).toBe(blob)
  })

  it('throws a readable error on non-2xx', async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({ error: { message: '音频转码失败' } }, 422),
    )
    const api = new ApiClient({ baseUrl: 'http://api.test', storage: memoryStorage(), fetchImpl })

    await expect(api.postJson('/v1/inference', {})).rejects.toThrow('音频转码失败')
  })
})
