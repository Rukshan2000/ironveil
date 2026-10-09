import { describe, expect, it } from 'vitest'
import { Environment, TIME_SCALE, weatherAt } from './environment'
import type { LevelLayout } from './types'

const make = () => new Environment('night', { lamps: [], interiors: [], roads: [] } as unknown as LevelLayout, {} as never, {} as never)

describe('day cycle', () => {
  it('runs the clock, lights the base at night and turns the lamps off at noon', () => {
    const env = make()
    expect(env.lamps).toBe(1)
    expect(env.night).toBe(true)
    const toNoon = ((12.5 - env.hour) * 3600) / TIME_SCALE
    for (let t = 0; t < toNoon; t += 1) env.tick(1)
    expect(env.hour).toBeGreaterThan(12)
    expect(env.preset.sunElevation).toBeGreaterThan(50)
    expect(env.preset.sunIntensity).toBeGreaterThan(env.weather === 'clear' ? 3 : 0.5)
    expect(env.preset.lampsOn).toBe(false)
    expect(env.preset.label).toMatch(/^12:/)
  })

  it('wraps at midnight and the forecast starts clear', () => {
    const env = make()
    env.hour = 23.99
    env.tick(60)
    expect(env.hour).toBeLessThan(1)
    expect(weatherAt(10)).toBe('clear')
  })
})
