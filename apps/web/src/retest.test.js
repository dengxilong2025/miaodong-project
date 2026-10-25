import { describe, expect, it } from 'vitest'

import { createRetestStore } from './retest'

function memoryStorage() {
  const data = new Map()
  return {
    getItem: (key) => (data.has(key) ? data.get(key) : null),
    setItem: (key, value) => data.set(key, String(value)),
    removeItem: (key) => data.delete(key),
  }
}

describe('retest store', () => {
  it('按 problem 保存并读取基线', () => {
    const store = createRetestStore(memoryStorage())
    const baseline = {
      requestId: 'req_1',
      label: '求关注/求陪伴',
      confidence: 0.66,
      createdAtIso: '2026-10-24T08:30:00Z',
    }
    expect(store.getBaseline('night_meow')).toBeNull()
    expect(store.saveBaseline('night_meow', baseline)).toBe(true)

    const saved = store.getBaseline('night_meow')
    expect(saved).toMatchObject({ ...baseline, problemId: 'night_meow' })
    expect(store.getBaseline('always_meow')).toBeNull()
  })

  it('拒绝缺少 requestId 的基线', () => {
    const store = createRetestStore(memoryStorage())
    expect(store.saveBaseline('night_meow', { label: '想玩' })).toBe(false)
    expect(store.getBaseline('night_meow')).toBeNull()
  })

  it('损坏的本地数据按无基线处理', () => {
    const storage = memoryStorage()
    storage.setItem('miaodong.h5.retest.night_meow', '{bad json')
    const store = createRetestStore(storage)
    expect(store.getBaseline('night_meow')).toBeNull()
  })

  it('可以清除基线', () => {
    const store = createRetestStore(memoryStorage())
    store.saveBaseline('night_meow', {
      requestId: 'req_1',
      label: '想玩',
      confidence: 0.7,
      createdAtIso: '2026-10-24T08:30:00Z',
    })
    store.clear('night_meow')
    expect(store.getBaseline('night_meow')).toBeNull()
  })
})
