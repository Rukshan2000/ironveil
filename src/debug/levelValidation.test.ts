import { describe, expect, it } from 'vitest'
import { MISSIONS } from '../missions/registry'
import { validateLevel } from './levelValidation'

describe.each(MISSIONS.map((m) => [m.def.name, m] as const))('level accessibility: %s', (_, { def, layout }) => {
  const checks = validateLevel(layout, def)

  it('every objective, door, pickup and spawn passes', () => {
    const failures = checks.filter((c) => c.status === 'fail').map((c) => `${c.label}: ${c.detail}`)
    expect(failures).toEqual([])
  })

  it('checks every objective', () => {
    for (const o of def.objectives) expect(checks.some((c) => c.id === o.id)).toBe(true)
  })

  it('flags an unreachable objective', () => {
    const broken = { ...def, objectives: [{ id: 'x', kind: 'hack' as const, label: 'missing', interactId: 'nope', duration: 1 }] }
    expect(validateLevel(layout, broken).find((c) => c.id === 'x')?.status).toBe('fail')
  })
})
