import { describe, expect, it } from 'vitest'
import { NIGHTFALL } from '../missions/nightfall'
import { compoundLayout } from '../world/compoundLayout'
import { validateLevel } from './levelValidation'

describe('level accessibility', () => {
  const checks = validateLevel(compoundLayout, NIGHTFALL)

  it('every objective, door, pickup and spawn in Operation Nightfall passes', () => {
    const failures = checks.filter((c) => c.status === 'fail').map((c) => `${c.label}: ${c.detail}`)
    expect(failures).toEqual([])
  })

  it('checks every objective', () => {
    for (const o of NIGHTFALL.objectives) expect(checks.some((c) => c.id === o.id)).toBe(true)
  })

  it('flags an unreachable objective', () => {
    const broken = { ...NIGHTFALL, objectives: [{ id: 'x', kind: 'hack' as const, label: 'missing', interactId: 'nope', duration: 1 }] }
    expect(validateLevel(compoundLayout, broken).find((c) => c.id === 'x')?.status).toBe('fail')
  })
})
