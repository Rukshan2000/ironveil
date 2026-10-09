import { describe, expect, it } from 'vitest'
import { computeExposure, hearing, type VisionInput } from './perception'

const base: VisionInput = { distance: 10, range: 30, angle: 0, fov: 2, hasLineOfSight: true, speed: 3, crouching: false, light: 0.8, flashlightAtGuard: false, alertness: 0 }

describe('computeExposure', () => {
  it('is zero without line of sight, outside FOV or beyond range', () => {
    expect(computeExposure({ ...base, hasLineOfSight: false })).toBe(0)
    expect(computeExposure({ ...base, angle: 1.2 })).toBe(0)
    expect(computeExposure({ ...base, distance: 40 })).toBe(0)
  })

  it('senses very close players even behind the guard', () => {
    expect(computeExposure({ ...base, distance: 1.5, angle: 3 })).toBe(1)
  })

  it('crouching, darkness, stillness, distance and peripheral vision all reduce exposure', () => {
    const e = computeExposure(base)
    expect(computeExposure({ ...base, crouching: true })).toBeLessThan(e)
    expect(computeExposure({ ...base, light: 0.1 })).toBeLessThan(e)
    expect(computeExposure({ ...base, speed: 0 })).toBeLessThan(e)
    expect(computeExposure({ ...base, distance: 20 })).toBeLessThan(e)
    expect(computeExposure({ ...base, angle: 0.8 })).toBeLessThan(e)
  })

  it('a still, crouched player in the dark at range is hidden', () => {
    expect(computeExposure({ ...base, distance: 18, crouching: true, light: 0.05, speed: 0 })).toBe(0)
  })

  it('a flashlight aimed at a guard extends how far he can see you', () => {
    expect(computeExposure({ ...base, distance: 40, light: 0.1 })).toBe(0)
    expect(computeExposure({ ...base, distance: 40, light: 0.1, flashlightAtGuard: true })).toBeGreaterThan(0)
  })

  it('alert guards see further', () => {
    expect(computeExposure({ ...base, distance: 33 })).toBe(0)
    expect(computeExposure({ ...base, distance: 33, alertness: 1 })).toBeGreaterThan(0)
  })
})

describe('hearing', () => {
  it('walls halve the audible radius', () => {
    expect(hearing(6, 10, false)).toBeGreaterThan(0)
    expect(hearing(6, 10, true)).toBe(0)
  })
})
