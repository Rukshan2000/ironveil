import type RAPIER from '@dimforge/rapier3d-compat'
import { Vector3 } from 'three'
import type { Physics } from '../physics/Physics'
import type { BoxDef } from '../world/types'
import type { NavGrid } from './navgrid'

export interface CoverPoint {
  id: number
  pos: Vector3
  /** Unit vector pointing away from the obstacle (the open side). */
  normal: Vector3
  /** Low cover (< 1.5 m) means crouching behind it; tall cover means leaning out to fire. */
  low: boolean
  /** Guard id currently using it. */
  takenBy: string | null
}

const STANDOFF = 0.75
const SPACING = 1.8
const NO_COVER = new Set(['fence', 'glass', 'foliage', 'invisible'])

/** Generates cover points along the sides of every bullet-stopping obstacle tall enough to hide behind. */
export function buildCoverPoints(boxes: BoxDef[], nav: NavGrid): CoverPoint[] {
  const out: CoverPoint[] = []
  for (const b of boxes) {
    if (b.collide === false || NO_COVER.has(b.mat) || b.rx || b.rz) continue
    const bottom = b.p[1] - b.s[1] / 2, top = b.p[1] + b.s[1] / 2
    if (bottom > 0.4 || top < 0.95) continue
    const w = b.s[0], d = b.shape === 'cyl' ? b.s[0] : b.s[2]
    if (Math.max(w, d) < 0.9) continue
    const yaw = b.yaw ?? 0
    const c = Math.cos(yaw), s = Math.sin(yaw)
    const toWorld = (lx: number, lz: number) => new Vector3(b.p[0] + lx * c + lz * s, 0, b.p[2] - lx * s + lz * c)
    const sides: [number, number, number, number, number][] = [
      // [nx, nz, along-length, offset, axis] in local space
      [0, 1, w, d / 2, 0], [0, -1, w, d / 2, 0], [1, 0, d, w / 2, 1], [-1, 0, d, w / 2, 1],
    ]
    for (const [nx, nz, len, off] of sides) {
      const count = Math.max(1, Math.floor(len / SPACING))
      for (let k = 0; k < count; k++) {
        const t = (k + 0.5) / count - 0.5
        const lx = nx !== 0 ? nx * (off + STANDOFF) : t * len
        const lz = nz !== 0 ? nz * (off + STANDOFF) : t * len
        const pos = toWorld(lx, lz)
        if (!nav.walkable(pos.x, pos.z)) continue
        const normal = new Vector3(nx * c + nz * s, 0, -nx * s + nz * c).normalize()
        if (out.some((o) => o.pos.distanceToSquared(pos) < 0.8)) continue
        out.push({ id: out.length, pos, normal, low: top < 1.5, takenBy: null })
      }
    }
  }
  return out
}

const tmp = new Vector3()
const dir = new Vector3()

/**
 * Picks the best cover for a guard against a threat: close, on the far side of an obstacle from the threat, and
 * actually blocking the line of fire (raycast-verified). `retreat` prefers points that put distance between them.
 */
export function findCover(points: CoverPoint[], physics: Physics, guardId: string, guardPos: Vector3, threat: Vector3, opts: { maxDist: number; retreat?: boolean; exclude?: RAPIER.Collider }): CoverPoint | null {
  const threatDist = guardPos.distanceTo(threat)
  const scored: { p: CoverPoint; score: number }[] = []
  for (const p of points) {
    if (p.takenBy && p.takenBy !== guardId) continue
    const d = p.pos.distanceTo(guardPos)
    if (d > opts.maxDist) continue
    tmp.subVectors(threat, p.pos).setY(0)
    const toThreat = tmp.length()
    if (toThreat < 4) continue
    // the obstacle must sit between the point and the threat: open side faces away from the threat
    if (p.normal.dot(tmp.divideScalar(toThreat)) > -0.35) continue
    let score = d
    if (opts.retreat) score -= (toThreat - threatDist) * 1.5
    else if (toThreat > threatDist + 6) score += 6 // don't run away while fighting
    if (toThreat < 7) score += 8
    scored.push({ p, score })
  }
  scored.sort((a, b) => a.score - b.score)
  for (const { p } of scored.slice(0, 6)) {
    // verify: from the guard's head height at the point, the shot line to the threat is blocked by world geometry
    tmp.copy(p.pos).setY(p.pos.y + (p.low ? 0.9 : 1.4))
    dir.subVectors(threat, tmp)
    const len = dir.length()
    dir.divideScalar(len)
    const hit = physics.raycast(tmp, dir, len - 0.6, opts.exclude, 'bullet')
    if (hit && (hit.tag?.kind === 'static' || hit.tag?.kind === 'door' || hit.tag?.kind === 'vehicle') && hit.distance < 3) return p
  }
  return null
}
