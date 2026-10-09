import { Vector3 } from 'three'
import { describe, expect, it } from 'vitest'
import type { Physics, RayHit } from '../physics/Physics'
import { AR_K7, P_11, VK_8 } from '../weapons/definitions'
import { Ballistics, falloffScale, type HitHandler } from './ballistics'

/** A world with a set of vertical walls at given z distances (each with a penetration cost). */
function world(walls: { z: number; cost: number }[]) {
  const physics = {
    raycast(o: Vector3, d: Vector3, max: number) {
      let best: (RayHit & { cost: number }) | null = null
      for (const w of walls) {
        if (Math.abs(d.z) < 1e-9) continue
        const t = (w.z - o.z) / d.z
        if (t >= 0 && t <= max && (!best || t < best.distance)) {
          best = { distance: t, point: { x: o.x + d.x * t, y: o.y + d.y * t, z: o.z + d.z * t }, normal: { x: 0, y: 0, z: 1 }, tag: undefined, collider: w as never, cost: w.cost }
        }
      }
      return best
    },
  } as unknown as Physics
  const hits: { z: number; y: number; damage: number }[] = []
  const handler: HitHandler = {
    onHit: (_b, hit, _d, damage) => (hits.push({ z: hit.point.z, y: hit.point.y, damage }), (hit as RayHit & { cost: number }).cost),
    onWhizz: () => {},
  }
  return { b: new Ballistics(physics, handler), hits }
}

const fwd = new Vector3(0, 0, -1)
const run = (b: Ballistics, seconds: number) => {
  for (let t = 0; t < seconds; t += 1 / 60) b.update(1 / 60, null)
}

describe('ballistics', () => {
  it('projectiles drop over distance and take time to arrive', () => {
    const { b, hits } = world([{ z: -400, cost: 999 }])
    b.fire(new Vector3(0, 0, 0), fwd, VK_8.ballistics, 100, { head: 1, limb: 1 }, { kind: 'player' }, undefined, false)
    run(b, 0.3)
    expect(hits).toHaveLength(0) // 400 m at ~790 m/s is still in flight
    run(b, 1)
    expect(hits).toHaveLength(1)
    expect(hits[0].y).toBeLessThan(-1) // visible drop at 400 m
    expect(hits[0].y).toBeGreaterThan(-3)
  })

  it('hitscan resolves instantly and in a straight line', () => {
    const { b, hits } = world([{ z: -30, cost: 999 }])
    b.fire(new Vector3(), fwd, P_11.ballistics, 30, { head: 1, limb: 1 }, { kind: 'player' }, undefined, false)
    expect(hits).toEqual([{ z: -30, y: 0, damage: 30 * falloffScale(P_11.ballistics, 30) }])
  })

  it('penetrates cheap surfaces with reduced damage and stops in expensive ones', () => {
    const { b, hits } = world([{ z: -5, cost: 8 }, { z: -10, cost: 999 }, { z: -15, cost: 1 }])
    b.fire(new Vector3(), fwd, AR_K7.ballistics, 30, { head: 1, limb: 1 }, { kind: 'player' }, undefined, false)
    run(b, 0.1)
    expect(hits.map((h) => h.z)).toEqual([-5, -10])
    expect(hits[1].damage).toBeLessThan(hits[0].damage)
  })

  it('damage falls off with distance', () => {
    expect(falloffScale(AR_K7.ballistics, 10)).toBe(1)
    expect(falloffScale(AR_K7.ballistics, 1000)).toBe(AR_K7.ballistics.falloff.minScale)
  })
})
