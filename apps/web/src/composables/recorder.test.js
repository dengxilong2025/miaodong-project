import { afterEach, describe, expect, it, vi } from 'vitest'

import { formatClock, pickMimeType } from './useRecorder'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('recorder helpers', () => {
  it('formats the countdown as m:ss', () => {
    expect(formatClock(10)).toBe('0:10')
    expect(formatClock(7)).toBe('0:07')
    expect(formatClock(-3)).toBe('0:00')
  })

  it('picks the first supported mime type', () => {
    vi.stubGlobal('MediaRecorder', {
      isTypeSupported: (type) => type === 'audio/webm',
    })
    expect(pickMimeType()).toBe('audio/webm')
  })

  it('returns empty when MediaRecorder is unavailable', () => {
    vi.stubGlobal('MediaRecorder', undefined)
    expect(pickMimeType()).toBe('')
  })
})
