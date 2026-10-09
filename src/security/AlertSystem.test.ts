import { describe, expect, it } from 'vitest'
import { AlertTracker } from './AlertSystem'

describe('AlertTracker', () => {
  it('rises with observations and decays after the hold time', () => {
    const a = new AlertTracker()
    expect(a.update(0)).toBe(0)
    a.observe(1, 0)
    expect(a.update(1)).toBe(1)
    a.observe(2, 2)
    expect(a.update(3)).toBe(2)
    expect(a.update(40)).toBe(2) // still held
    expect(a.update(50)).toBe(0) // both holds expired (level 1 was refreshed by the level 2 observation)
    expect(a.maxLevel).toBe(2)
  })

  it('follows the alarm and only locks down while it is on', () => {
    const a = new AlertTracker()
    a.alarm = true
    expect(a.update(0)).toBe(3)
    a.lockdown = true
    expect(a.update(1)).toBe(4)
    a.alarm = false
    expect(a.update(2)).toBe(0)
    a.alarm = true
    expect(a.update(3)).toBe(3) // lockdown was released with the alarm
  })
})
