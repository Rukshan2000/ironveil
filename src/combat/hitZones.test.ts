import { Vector3 } from 'three'
import { describe, expect, it } from 'vitest'
import { hitZone, zoneMultiplier } from './impacts'

describe('hit zones', () => {
  const feet = new Vector3(0, 0, 0)
  it('picks head, chest, stomach, arms and legs from the hit point', () => {
    expect(hitZone({ x: 0, y: 1.6, z: 0 }, feet, 1, 0)).toBe('head')
    expect(hitZone({ x: 0, y: 1.3, z: 0 }, feet, 1, 0)).toBe('chest')
    expect(hitZone({ x: 0, y: 1.0, z: 0 }, feet, 1, 0)).toBe('stomach')
    expect(hitZone({ x: 0.3, y: 1.2, z: 0 }, feet, 1, 0)).toBe('arms')
    expect(hitZone({ x: 0, y: 0.5, z: 0 }, feet, 1, 0)).toBe('legs')
  })
  it('arms are measured across the body, whichever way it faces', () => {
    // facing east (yaw -PI/2): the body's sides are along z
    expect(hitZone({ x: 0.3, y: 1.2, z: 0 }, feet, 1, -Math.PI / 2)).toBe('chest')
    expect(hitZone({ x: 0, y: 1.2, z: 0.3 }, feet, 1, -Math.PI / 2)).toBe('arms')
  })
  it('scales zones for a crouched body', () => {
    expect(hitZone({ x: 0, y: 1.1, z: 0 }, feet, 0.7, 0)).toBe('head')
  })
  it('head > chest > stomach > limbs', () => {
    const m = (z: Parameters<typeof zoneMultiplier>[0]) => zoneMultiplier(z, 3, 0.75)
    expect(m('head')).toBeGreaterThan(m('chest'))
    expect(m('chest')).toBeGreaterThan(m('stomach'))
    expect(m('stomach')).toBeGreaterThan(m('legs'))
  })
})
