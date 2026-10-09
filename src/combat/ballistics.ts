import type RAPIER from '@dimforge/rapier3d-compat'
import { Vector3 } from 'three'
import type { Physics, RayHit } from '../physics/Physics'
import type { BallisticsDef } from '../weapons/types'

export type BulletOwner = { kind: 'player' } | { kind: 'guard'; id: string }

export interface Bullet {
  active: boolean
  pos: Vector3
  vel: Vector3
  /** Distance flown so far (m). */
  traveled: number
  age: number
  damage: number
  headMult: number
  limbMult: number
  def: BallisticsDef
  owner: BulletOwner
  exclude: RAPIER.Collider | undefined
  /** Remaining penetration budget. */
  pen: number
  tracer: boolean
  whizzed: boolean
}

export interface HitHandler {
  /** Called for every surface a bullet touches. Return the penetration cost (Infinity stops the bullet). */
  onHit(b: Bullet, hit: RayHit, dir: Vector3, damage: number): number
  /** A hostile bullet passed close to the listener's head. */
  onWhizz(b: Bullet, closest: Vector3): void
}

const GRAVITY = 9.81
const MAX_AGE = 3
const POOL = 128

const dir = new Vector3()
const next = new Vector3()
const origin = new Vector3()
const closest = new Vector3()

export function falloffScale(def: BallisticsDef, distance: number) {
  const f = def.falloff
  if (distance <= f.start) return 1
  if (distance >= f.end) return f.minScale
  return 1 + ((distance - f.start) / (f.end - f.start)) * (f.minScale - 1)
}

/**
 * Bullet simulation. Projectile rounds fly with gravity, drag and travel time and are swept with segment raycasts
 * each tick; hitscan rounds resolve the same way in a single straight segment. Penetration, falloff and near-miss
 * detection are shared by both paths.
 */
export class Ballistics {
  readonly bullets: Bullet[] = Array.from({ length: POOL }, () => ({
    active: false, pos: new Vector3(), vel: new Vector3(), traveled: 0, age: 0, damage: 0, headMult: 1, limbMult: 1,
    def: null as unknown as BallisticsDef, owner: { kind: 'player' }, exclude: undefined, pen: 0, tracer: false, whizzed: false,
  }))
  private cursor = 0

  constructor(private readonly physics: Physics, private readonly handler: HitHandler) {}

  fire(from: Vector3, direction: Vector3, def: BallisticsDef, damage: number, mults: { head: number; limb: number }, owner: BulletOwner, exclude: RAPIER.Collider | undefined, tracer: boolean) {
    const b = this.claim()
    b.active = true
    b.pos.copy(from)
    b.vel.copy(direction).multiplyScalar(def.muzzleVelocity)
    b.traveled = 0
    b.age = 0
    b.damage = damage
    b.headMult = mults.head
    b.limbMult = mults.limb
    b.def = def
    b.owner = owner
    b.exclude = exclude
    b.pen = def.penetration
    b.tracer = tracer
    b.whizzed = false
    if (def.mode === 'hitscan') {
      next.copy(from).addScaledVector(direction, def.range)
      this.sweep(b, next, null)
      b.active = false
    }
    return b
  }

  update(dt: number, listener: Vector3 | null) {
    for (const b of this.bullets) {
      if (!b.active) continue
      b.age += dt
      if (b.age > MAX_AGE || b.traveled > b.def.range) {
        b.active = false
        continue
      }
      b.vel.y -= GRAVITY * b.def.gravityScale * dt
      b.vel.multiplyScalar(1 - b.def.drag * dt)
      next.copy(b.pos).addScaledVector(b.vel, dt)
      this.sweep(b, next, listener)
    }
  }

  /** Moves a bullet along pos→to, resolving every hit (with penetration) on the way. */
  private sweep(b: Bullet, to: Vector3, listener: Vector3 | null) {
    dir.subVectors(to, b.pos)
    let remaining = dir.length()
    if (remaining < 1e-6) return
    dir.divideScalar(remaining)
    if (listener && b.owner.kind !== 'player' && !b.whizzed) this.checkWhizz(b, to, listener)
    origin.copy(b.pos)
    for (let guard = 0; guard < 4 && remaining > 0; guard++) {
      const hit = this.physics.raycast(origin, dir, remaining, b.exclude, 'bullet')
      if (!hit) break
      const damage = b.damage * falloffScale(b.def, b.traveled + hit.distance)
      const cost = this.handler.onHit(b, hit, dir, damage)
      b.traveled += hit.distance
      if (!(cost < b.pen)) {
        b.active = false
        b.pos.set(hit.point.x, hit.point.y, hit.point.z)
        return
      }
      // punch through: lose energy, skip past the thing we hit
      b.damage *= 1 - (cost / b.pen) * 0.6
      b.pen -= cost
      b.exclude = hit.collider
      const skip = 0.12
      origin.set(hit.point.x, hit.point.y, hit.point.z).addScaledVector(dir, skip)
      remaining -= hit.distance + skip
    }
    b.traveled += Math.max(0, remaining)
    b.pos.copy(to)
  }

  private checkWhizz(b: Bullet, to: Vector3, head: Vector3) {
    const t = Math.max(0, Math.min(1, closest.subVectors(head, b.pos).dot(dir) / b.pos.distanceTo(to)))
    closest.copy(b.pos).lerp(to, t)
    if (closest.distanceTo(head) < 2.2 && closest.distanceTo(head) > 0.25) {
      b.whizzed = true
      this.handler.onWhizz(b, closest)
    }
  }

  private claim() {
    for (let i = 0; i < POOL; i++) {
      const b = this.bullets[(this.cursor + i) % POOL]
      if (!b.active) {
        this.cursor = (this.cursor + i + 1) % POOL
        return b
      }
    }
    // pool exhausted: recycle the oldest slot
    const b = this.bullets[this.cursor]
    this.cursor = (this.cursor + 1) % POOL
    return b
  }
}
