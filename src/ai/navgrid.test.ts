import { Vector3 } from 'three'
import { describe, expect, it } from 'vitest'
import { wall } from '../world/builders'
import { NavGrid } from './navgrid'

describe('NavGrid', () => {
  it('routes through a doorway instead of through the wall', () => {
    // wall along x at z = 0 from x -10..10 with a 1.4 m gap centred at x = 6
    const nav = new NavGrid([-15, -15, 15, 15], wall(-10, 10, 0, 3, false, [{ at: 6, width: 1.4, open: true }]))
    expect(nav.walkable(0, 0)).toBe(false)
    expect(nav.walkable(6, 0.1)).toBe(true)
    const path = nav.findPath(new Vector3(0, 0, -5), new Vector3(0, 0, 5))!
    expect(path).not.toBeNull()
    // some waypoint must pass near the doorway
    expect(path.some((p) => Math.abs(p.x - 6) < 1 && Math.abs(p.z) < 1.5)).toBe(true)
    expect(path[path.length - 1]).toEqual(new Vector3(0, 0, 5))
  })

  it('goes straight when nothing is in the way', () => {
    const nav = new NavGrid([-15, -15, 15, 15], [])
    expect(nav.findPath(new Vector3(-5, 0, 0), new Vector3(5, 0, 3))).toEqual([new Vector3(5, 0, 3)])
  })
})
