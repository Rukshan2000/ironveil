import { describe, expect, it } from 'vitest'
import { MissionSystem, type MissionContext } from './MissionSystem'

const ctx = (o: Partial<MissionContext> = {}): MissionContext => ({ playerAlive: true, alertLevel: 0, extractionAvailable: false, ...o })

describe('MissionSystem', () => {
  it('runs briefing → insertion → active, and reacts to alert levels', () => {
    const m = new MissionSystem()
    m.update(5, ctx())
    expect(m.state).toBe('BRIEFING') // waits for deploy
    m.deploy()
    expect(m.state).toBe('INSERTION')
    m.update(3, ctx())
    expect(m.state).toBe('INSERTION')
    m.update(8, ctx())
    expect(m.state).toBe('ACTIVE')
    m.update(0.1, ctx({ alertLevel: 3 }))
    expect(m.state).toBe('ALERT')
    m.update(0.1, ctx({ alertLevel: 4 }))
    expect(m.state).toBe('LOCKDOWN')
    m.update(0.1, ctx({ alertLevel: 1 }))
    expect(m.state).toBe('ACTIVE')
  })

  it('holds the objective banner, then goes to extraction and success', () => {
    const m = new MissionSystem()
    m.deploy()
    m.update(11, ctx())
    m.objectiveCompleted()
    m.update(1, ctx({ extractionAvailable: true }))
    expect(m.state).toBe('OBJECTIVE_COMPLETE')
    m.update(3, ctx({ extractionAvailable: true }))
    expect(m.state).toBe('EXTRACTION')
    m.succeed()
    m.update(1, ctx({ playerAlive: false }))
    expect(m.state).toBe('SUCCESS') // terminal
  })

  it('fails when the player dies', () => {
    const m = new MissionSystem()
    m.deploy()
    m.update(0.1, ctx({ playerAlive: false }))
    expect(m.state).toBe('FAILED')
    expect(m.over).toBe(true)
  })
})
