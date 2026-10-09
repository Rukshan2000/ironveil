import { Vector3 } from 'three'
import { describe, expect, it } from 'vitest'
import type { CoverPoint } from './cover'
import { AI, alertGuard, createGuard, updateGuardBrain, type AIWorld, type GuardData, type Perception } from './guardBrain'

const unseen = (): Perception => ({ exposure: 0, playerVisible: false, playerPosition: new Vector3(0, 0, -20), heard: null, intel: null, damaged: false, underFire: false, body: null })

function stubWorld(o: Partial<AIWorld> & { cover?: CoverPoint | null } = {}): AIWorld {
  return {
    findCover: () => o.cover ?? null,
    releaseCover: (g) => {
      if (g.cover) g.cover.takenBy = null
    },
    alarmPanel: () => null,
    canCallAlarm: () => false,
    randomPoint: (c, r) => c.clone().add(new Vector3(r * 0.5, 0, 0)),
    ...o,
  }
}

const run = (g: GuardData, p: Perception | (() => Perception), seconds: number, world = stubWorld()) => {
  let out = updateGuardBrain(g, typeof p === 'function' ? p() : p, world, 0.05, () => 0.5)
  for (let t = 0.05; t < seconds; t += 0.05) out = updateGuardBrain(g, typeof p === 'function' ? p() : p, world, 0.05, () => 0.5)
  return out
}

describe('guard brain', () => {
  it('patrols towards the next point and idles on arrival', () => {
    const g = createGuard('g', [new Vector3(0, 0, 0), new Vector3(10, 0, 0)], 0, 2)
    expect(updateGuardBrain(g, unseen(), stubWorld(), 0.1).moveTo).toEqual(new Vector3(10, 0, 0))
    g.position.set(10, 0, 0)
    updateGuardBrain(g, unseen(), stubWorld(), 0.1)
    expect(g.state).toBe('IDLE')
    run(g, unseen(), 2.5)
    expect(g.state).toBe('PATROL')
  })

  it('suspicious → investigate → back to patrol when nothing is found', () => {
    const g = createGuard('g', [new Vector3(), new Vector3(5, 0, 0)], 0, 2)
    const out = updateGuardBrain(g, { ...unseen(), heard: { kind: 'footstep', position: new Vector3(3, 0, 0), radius: 6 } }, stubWorld(), 0.05)
    expect(g.state).toBe('SUSPICIOUS')
    expect(out.callout).toBe('suspicious')
    run(g, unseen(), 2.5)
    expect(g.state).toBe('INVESTIGATE')
    g.position.set(3, 0, 0) // walked there
    run(g, unseen(), AI.investigateLook + 0.5)
    expect(['PATROL', 'IDLE']).toContain(g.state)
  })

  it('sustained exposure escalates to ALERT then COMBAT', () => {
    const g = createGuard('g', [new Vector3()], 0, 2)
    const seen: Perception = { ...unseen(), exposure: 0.5, playerVisible: true }
    run(g, seen, 0.8)
    expect(g.state).toBe('SUSPICIOUS')
    run(g, seen, 2.5)
    expect(g.state).toBe('COMBAT')
  })

  it('calls reinforcements when able, and a hit interrupts the call', () => {
    let allowed = true
    const world = stubWorld({ canCallAlarm: () => allowed })
    const a = createGuard('a', [new Vector3()], 0, 2)
    alertGuard(a, new Vector3(0, 0, -10))
    run(a, unseen(), 0.7, world)
    expect(a.state).toBe('CALL_REINFORCEMENTS')
    let raised = false
    for (let t = 0; t < AI.callTime + 0.3; t += 0.05) raised ||= updateGuardBrain(a, unseen(), world, 0.05).raiseAlarm
    expect(raised).toBe(true)
    expect(a.state).toBe('COMBAT')

    const b = createGuard('b', [new Vector3()], 0, 2)
    alertGuard(b, new Vector3(0, 0, -10))
    run(b, unseen(), 0.7, world)
    expect(b.state).toBe('CALL_REINFORCEMENTS')
    const out = updateGuardBrain(b, { ...unseen(), damaged: true }, world, 0.05)
    expect(out.raiseAlarm).toBe(false)
    expect(b.state).toBe('COMBAT')
    allowed = false
  })

  it('moves to cover in combat and alternates hiding and peeking', () => {
    const cover: CoverPoint = { id: 0, pos: new Vector3(4, 0, 0), normal: new Vector3(0, 0, 1), low: true, takenBy: null }
    const world = stubWorld({ cover })
    const g = createGuard('g', [new Vector3(), new Vector3(1, 0, 0)], 0, 2)
    alertGuard(g, new Vector3(0, 0, -15))
    const visible: Perception = { ...unseen(), playerVisible: true, exposure: 1, playerPosition: new Vector3(0, 0, -15) }
    const out = run(g, visible, 1, world)
    expect(g.state).toBe('COMBAT')
    expect(cover.takenBy).toBe('g')
    expect(out.moveTo).toEqual(cover.pos)
    g.position.copy(cover.pos)
    const crouches = new Set<boolean>()
    for (let t = 0; t < 8; t += 0.05) crouches.add(updateGuardBrain(g, visible, world, 0.05, () => 0.5).crouch)
    expect(crouches).toEqual(new Set([true, false]))
  })

  it('reloads after emptying the magazine and does not fire meanwhile', () => {
    const g = createGuard('g', [new Vector3()], 0, 2)
    alertGuard(g, new Vector3(0, 0, -10))
    run(g, unseen(), 0.7)
    g.ammo = 0
    const visible: Perception = { ...unseen(), playerVisible: true, exposure: 1, playerPosition: new Vector3(0, 0, -10) }
    const out = updateGuardBrain(g, visible, stubWorld(), 0.05)
    expect(out.callout).toBe('reload')
    let fired = false
    for (let t = 0; t < AI.reloadTime - 0.2; t += 0.05) fired ||= updateGuardBrain(g, visible, stubWorld(), 0.05).fire
    expect(fired).toBe(false)
    run(g, visible, 0.5)
    expect(g.ammo).toBeGreaterThan(0)
  })

  it('retreats when badly hurt', () => {
    const cover: CoverPoint = { id: 0, pos: new Vector3(0, 0, 8), normal: new Vector3(0, 0, 1), low: false, takenBy: null }
    const g = createGuard('g', [new Vector3(), new Vector3(1, 0, 0)], 0, 2)
    alertGuard(g, new Vector3(0, 0, -10))
    run(g, unseen(), 0.7)
    g.health = 30
    updateGuardBrain(g, { ...unseen(), playerVisible: true, exposure: 1, playerPosition: new Vector3(0, 0, -10) }, stubWorld({ cover }), 0.05)
    expect(g.state).toBe('RETREAT')
  })

  it('searches after losing the player, then returns to patrol with raised alertness', () => {
    const g = createGuard('g', [new Vector3(), new Vector3(5, 0, 0)], 0, 2)
    alertGuard(g, new Vector3(0, 0, -5))
    run(g, unseen(), 1)
    expect(g.state).toBe('COMBAT')
    g.position.set(0, 0, -5)
    run(g, unseen(), AI.loseSightAfter + 0.5)
    expect(g.state).toBe('SEARCH')
    run(g, unseen(), AI.searchDuration + 1)
    expect(g.state).toBe('PATROL')
    expect(g.alertness).toBeGreaterThan(0.4)
  })

  it('close gunshots alert; distant shots and impacts make guards investigate; ally contact alerts', () => {
    const a = createGuard('a', [new Vector3()], 0, 2)
    updateGuardBrain(a, { ...unseen(), heard: { kind: 'gunshot', position: new Vector3(10, 0, 0), radius: 50 } }, stubWorld(), 0.05)
    expect(a.state).toBe('ALERT')
    const b = createGuard('b', [new Vector3()], 0, 2)
    updateGuardBrain(b, { ...unseen(), heard: { kind: 'impact', position: new Vector3(4, 0, 0), radius: 7 } }, stubWorld(), 0.05)
    expect(b.state).toBe('SUSPICIOUS')
    expect(b.lastKnown).toEqual(new Vector3(4, 0, 0))
    const c = createGuard('c', [new Vector3()], 0, 2)
    updateGuardBrain(c, { ...unseen(), intel: { position: new Vector3(20, 0, 0), contact: true } }, stubWorld(), 0.05)
    expect(c.state).toBe('ALERT')
  })

  it('fires in bursts only when facing a visible player', () => {
    const g = createGuard('g', [new Vector3()], 0, 2)
    alertGuard(g, new Vector3(0, 0, -10))
    run(g, unseen(), 0.7)
    const visible: Perception = { ...unseen(), playerVisible: true, exposure: 1, playerPosition: new Vector3(0, 0, -10) }
    let shots = 0
    for (let t = 0; t < 1; t += 0.05) if (updateGuardBrain(g, visible, stubWorld(), 0.05, () => 0.5).fire) shots++
    expect(shots).toBeGreaterThanOrEqual(3)
    g.yaw = Math.PI // facing away
    g.fireCooldown = 0
    expect(updateGuardBrain(g, visible, stubWorld(), 0.05).fire).toBe(false)
  })
})
