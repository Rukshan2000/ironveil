import { Color, Vector3 } from 'three'
import { SURFACES, type DecalKind, type ParticleKind } from '../combat/surfaces'
import type { Surface } from '../world/types'
import { PARTICLES } from './presets'

/** Fixed-capacity particle pool in flat typed arrays (no allocation while playing). */
export class ParticlePool {
  readonly position: Float32Array
  readonly color: Float32Array
  readonly size: Float32Array
  readonly alpha: Float32Array
  private readonly vel: Float32Array
  private readonly life: Float32Array
  private readonly maxLife: Float32Array
  private readonly size0: Float32Array
  private readonly size1: Float32Array
  private readonly alpha0: Float32Array
  private readonly gravity: Float32Array
  private readonly drag: Float32Array
  private next = 0
  /** Number of live particles after the last update (for stats). */
  live = 0

  constructor(readonly capacity: number) {
    this.position = new Float32Array(capacity * 3)
    this.color = new Float32Array(capacity * 3)
    this.vel = new Float32Array(capacity * 3)
    this.size = new Float32Array(capacity)
    this.alpha = new Float32Array(capacity)
    this.life = new Float32Array(capacity)
    this.maxLife = new Float32Array(capacity)
    this.size0 = new Float32Array(capacity)
    this.size1 = new Float32Array(capacity)
    this.alpha0 = new Float32Array(capacity)
    this.gravity = new Float32Array(capacity)
    this.drag = new Float32Array(capacity)
  }

  spawn(p: Vector3, v: Vector3, life: number, size0: number, size1: number, c: Color, alpha: number, gravity: number, drag: number) {
    const i = this.next
    this.next = (this.next + 1) % this.capacity
    this.position.set([p.x, p.y, p.z], i * 3)
    this.vel.set([v.x, v.y, v.z], i * 3)
    this.color.set([c.r, c.g, c.b], i * 3)
    this.life[i] = this.maxLife[i] = life
    this.size0[i] = size0
    this.size1[i] = size1
    this.alpha0[i] = alpha
    this.gravity[i] = gravity
    this.drag[i] = drag
  }

  update(dt: number) {
    let live = 0
    for (let i = 0; i < this.capacity; i++) {
      if (this.life[i] <= 0) {
        this.size[i] = 0
        continue
      }
      live++
      this.life[i] -= dt
      const t = 1 - Math.max(0, this.life[i]) / this.maxLife[i]
      const k = Math.max(0, 1 - this.drag[i] * dt)
      const j = i * 3
      this.vel[j] *= k
      this.vel[j + 1] = this.vel[j + 1] * k - this.gravity[i] * dt
      this.vel[j + 2] *= k
      this.position[j] += this.vel[j] * dt
      this.position[j + 1] += this.vel[j + 1] * dt
      this.position[j + 2] += this.vel[j + 2] * dt
      this.size[i] = this.size0[i] + (this.size1[i] - this.size0[i]) * t
      // quick fade-in, long fade-out
      this.alpha[i] = this.alpha0[i] * Math.min(1, t * 12) * (1 - t * t)
    }
    this.live = live
  }
}

export interface Decal {
  position: Vector3
  normal: Vector3
  kind: DecalKind
  time: number
  rot: number
  size: number
}

export interface Shell {
  position: Vector3
  velocity: Vector3
  spin: Vector3
  rot: Vector3
  time: number
  size: number
  bounces: number
  resting: boolean
}

class Ring<T> {
  private next = 0
  constructor(readonly items: T[]) {}
  claim(): T {
    const item = this.items[this.next]
    this.next = (this.next + 1) % this.items.length
    return item
  }
}

const tmpV = new Vector3()
const tmpN = new Vector3()
const tmpC = new Color()
const right = new Vector3()
const up = new Vector3()

/** Random unit vector within `angle` of `axis`. */
export function randomInCone(axis: Vector3, angle: number, out: Vector3) {
  right.crossVectors(axis, Math.abs(axis.y) > 0.99 ? X : Y).normalize()
  up.crossVectors(right, axis)
  const r = Math.tan(Math.min(1.45, angle) * Math.sqrt(Math.random()))
  const th = Math.random() * Math.PI * 2
  return out.copy(axis).addScaledVector(right, r * Math.cos(th)).addScaledVector(up, r * Math.sin(th)).normalize()
}
const X = new Vector3(1, 0, 0)
const Y = new Vector3(0, 1, 0)

const DECALS_PER_KIND = 48
const DECAL_KINDS: DecalKind[] = ['concrete', 'metal', 'wood', 'glass', 'dirt']

/**
 * Visual event state written by game logic and read by EffectsView: pooled particles, decals, shell casings and
 * persistent smoke emitters. Times are session time in seconds.
 */
export class EffectsSystem {
  readonly additive = new ParticlePool(500)
  readonly soft = new ParticlePool(1600)
  readonly decals = Object.fromEntries(DECAL_KINDS.map((k) => [k, new Ring<Decal>(Array.from({ length: DECALS_PER_KIND }, () => ({ position: new Vector3(), normal: new Vector3(0, 1, 0), kind: k, time: -999, rot: 0, size: 0 })))])) as Record<DecalKind, Ring<Decal>>
  readonly shells = new Ring<Shell>(Array.from({ length: 40 }, () => ({ position: new Vector3(), velocity: new Vector3(), spin: new Vector3(), rot: new Vector3(), time: -999, size: 1, bounces: 0, resting: true })))
  playerMuzzleTime = -999
  /** Last explosion: drives a brief world light flash. */
  readonly blastAt = new Vector3()
  blastTime = -999
  /** Debug: recent player shot paths. */
  readonly shotRays = new Ring(Array.from({ length: 16 }, () => ({ from: new Vector3(), to: new Vector3(), time: -999 })))
  private smokeTimer = 0
  private moteTimer = 0
  time = 0

  constructor(private readonly smokeSources: readonly (readonly number[])[]) {}

  emit(kind: ParticleKind, at: Vector3, dir: Vector3, count: number, speedScale = 1) {
    const p = PARTICLES[kind]
    const pool = p.additive ? this.additive : this.soft
    for (let i = 0; i < count; i++) {
      randomInCone(dir, p.spread, tmpV)
      tmpV.multiplyScalar((p.speed[0] + Math.random() * (p.speed[1] - p.speed[0])) * speedScale)
      tmpV.y += p.lift
      tmpC.setHex(p.colors[(Math.random() * p.colors.length) | 0])
      const life = p.life[0] + Math.random() * (p.life[1] - p.life[0])
      const s = 0.8 + Math.random() * 0.4
      pool.spawn(at, tmpV, life, p.size[0] * s, p.size[1] * s, tmpC, p.alpha, p.gravity, p.drag)
    }
  }

  /** Surface-specific impact: particles + decal. `incoming` is the bullet direction. */
  impact(surface: Surface, point: { x: number; y: number; z: number }, normal: { x: number; y: number; z: number }, incoming: Vector3) {
    const def = SURFACES[surface]
    const p = tmpN.set(point.x, point.y, point.z)
    const n = new Vector3(normal.x, normal.y, normal.z)
    // spray mostly along the normal, biased by the reflected bullet direction
    const spray = n.clone().addScaledVector(incoming, -0.3).normalize()
    for (const [kind, count] of def.particles) this.emit(kind, p, kind === 'spark' ? incoming.clone().reflect(n).lerp(n, 0.5).normalize() : spray, count)
    if (def.decal) {
      const d = this.decals[def.decal].claim()
      d.position.copy(p).addScaledVector(n, 0.012)
      d.normal.copy(n)
      d.time = this.time
      d.rot = Math.random() * Math.PI * 2
      d.size = (def.decal === 'glass' ? 0.22 : def.decal === 'dirt' ? 0.14 : 0.07) * (0.8 + Math.random() * 0.4)
    }
  }

  lightFlash(at: Vector3, time: number) {
    this.blastAt.copy(at)
    this.blastTime = time
  }

  muzzle(at: Vector3, dir: Vector3, scale = 1) {
    this.emit('muzzleSmoke', at, dir, Math.round(3 * scale), 1)
  }

  ejectShell(at: Vector3, velocity: Vector3, size: number) {
    const s = this.shells.claim()
    s.position.copy(at)
    s.velocity.copy(velocity)
    s.spin.set((Math.random() - 0.5) * 30, (Math.random() - 0.5) * 20, 15 + Math.random() * 15)
    s.rot.set(0, Math.random() * 6, Math.PI / 2)
    s.time = this.time
    s.size = size
    s.bounces = 0
    s.resting = false
  }

  /**
   * Advances particles, shells and emitters. `ground` gives the floor height under a point; `onShellBounce` lets the
   * audio layer play brass tinks.
   */
  update(dt: number, ground: (x: number, y: number, z: number) => number, onShellBounce: (p: Vector3, strength: number) => void, player: Vector3, playerLit: boolean) {
    this.time += dt
    this.additive.update(dt)
    this.soft.update(dt)

    for (const s of this.shells.items) {
      if (s.resting || this.time - s.time > 8) continue
      s.velocity.y -= 9.81 * dt
      s.position.addScaledVector(s.velocity, dt)
      s.rot.addScaledVector(s.spin, dt)
      const floor = ground(s.position.x, s.position.y, s.position.z) + 0.01
      if (s.position.y < floor) {
        s.position.y = floor
        if (Math.abs(s.velocity.y) > 0.6) {
          onShellBounce(s.position, Math.min(1, Math.abs(s.velocity.y) / 4))
          s.velocity.y *= -0.35
          s.velocity.x *= 0.55
          s.velocity.z *= 0.55
          s.spin.multiplyScalar(0.5)
          s.bounces++
        } else {
          // settle on its side
          s.resting = true
          s.rot.x = 0
          s.rot.z = Math.PI / 2
        }
      }
    }

    // persistent smoke columns (burn barrels, exhausts)
    if ((this.smokeTimer -= dt) <= 0) {
      this.smokeTimer = 0.18
      for (const src of this.smokeSources) {
        tmpV.set(src[0], src[1], src[2])
        if (tmpV.distanceToSquared(player) > 140 * 140) continue
        this.emit('smoke', tmpV, Y, 1)
        if (src[1] < 1.5) this.emit('fire', tmpV, Y, 1)
      }
    }
    // dust motes drifting around the player catch the light
    if (playerLit && (this.moteTimer -= dt) <= 0) {
      this.moteTimer = 0.12
      tmpV.set(player.x + (Math.random() - 0.5) * 10, player.y + 0.4 + Math.random() * 2.5, player.z + (Math.random() - 0.5) * 10)
      this.emit('mote', tmpV, Y, 1)
    }
  }
}
