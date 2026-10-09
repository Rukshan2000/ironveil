import { Vector3 } from 'three'
import { alertGuard } from '../ai/guardBrain'
import { audio } from '../audio/AudioSystem'
import { damageGuard } from '../enemies/guards'
import { input } from '../game/input'
import type { GameSession } from '../game/GameSession'
import type { Physics } from '../physics/Physics'
import { useGameStore } from '../state/gameStore'

export type GrenadeKind = 'frag' | 'smoke' | 'flash'

export const GRENADES: Record<GrenadeKind, { name: string; fuse: number; carry: number }> = {
  frag: { name: 'Frag grenade', fuse: 3.2, carry: 2 },
  smoke: { name: 'Smoke grenade', fuse: 1.6, carry: 2 },
  flash: { name: 'Flashbang', fuse: 1.8, carry: 2 },
}
const ORDER: GrenadeKind[] = ['frag', 'smoke', 'flash']

const FRAG = { radius: 9, damage: 190, cameraRadius: 5 }
const FLASH = { radius: 14 }
const SMOKE = { life: 24, maxRadius: 5.5, grow: 1.4 }
const THROW_SPEED = 15.5
const GRAVITY = 9.81
const RESTITUTION = 0.32
const POOL = 6
const ARC_POINTS = 64

export interface Grenade {
  active: boolean
  kind: GrenadeKind
  pos: Vector3
  vel: Vector3
  /** Seconds until it goes off. */
  fuse: number
  resting: boolean
  spin: number
  rot: number
  /** Thrower's collider is ignored for the first moments. */
  age: number
}

export interface SmokeCloud {
  pos: Vector3
  start: number
  emit: number
}

const tmp = new Vector3()
const dir = new Vector3()
const eye = new Vector3()
const right = new Vector3()
const segA = new Vector3()
const segB = new Vector3()

/**
 * Equipment: frag, smoke and flash grenades. Hold the key to pull the pin and see the throw arc, release to throw.
 * Projectiles are pooled and swept with raycasts (bounce, roll, rest). Frags do radius damage with line-of-sight,
 * smoke blocks AI vision and cameras, flashbangs stun guards who look at them (and you).
 */
export class GrenadeSystem {
  readonly pool: Grenade[] = Array.from({ length: POOL }, () => ({ active: false, kind: 'frag' as GrenadeKind, pos: new Vector3(), vel: new Vector3(), fuse: 0, resting: false, spin: 0, rot: 0, age: 0 }))
  readonly counts: Record<GrenadeKind, number> = { frag: GRENADES.frag.carry, smoke: GRENADES.smoke.carry, flash: GRENADES.flash.carry }
  selected: GrenadeKind = 'frag'
  /** Pin pulled, waiting for release. */
  priming = false
  /** Session time of the last throw (view-model animation). */
  thrownAt = -99
  /** Throw preview: world points along the arc. */
  readonly arc = Array.from({ length: ARC_POINTS }, () => new Vector3())
  arcCount = 0
  readonly smokes: SmokeCloud[] = []
  /** Player blinded by a flashbang: 0..1, decays. */
  flash = 0
  private throws = 0

  constructor(private readonly s: GameSession) {}

  /** 0..1 how much the hands are busy with equipment (weapon lowered, no firing). */
  get handsBusy() {
    return this.priming ? 1 : Math.max(0, 1 - (this.s.time - this.thrownAt) / 0.45)
  }

  update(dt: number) {
    const s = this.s
    const p = s.player
    this.flash = Math.max(0, this.flash - dt * 0.35)
    const usable = p.active && p.alive && !s.recon.active && !p.vault
    if (!usable) this.priming = false

    if (usable && input.pressed('cycleGrenade')) {
      for (let i = 1; i <= ORDER.length; i++) {
        const k = ORDER[(ORDER.indexOf(this.selected) + i) % ORDER.length]
        if (this.counts[k] > 0 || i === ORDER.length) {
          this.selected = k
          break
        }
      }
      audio.cloth(0.5)
      s.notify(`${GRENADES[this.selected].name} — ${this.counts[this.selected]} left`, 'info')
    }
    if (usable && input.pressed('grenade') && !this.priming && this.handsBusy === 0) {
      if (this.counts[this.selected] > 0) {
        this.priming = true
        s.weapon.holster()
        audio.pin()
      } else s.notify(`No ${GRENADES[this.selected].name.toLowerCase()}s left`, 'warn')
    }
    if (this.priming) {
      this.throwVelocity(dir)
      this.predict(this.throwOrigin(eye), dir)
      if (!input.down('grenade')) this.throw()
    } else this.arcCount = 0

    for (const g of this.pool) if (g.active) this.step(g, dt)

    // smoke clouds: keep emitting while they last, expire old ones
    for (let i = this.smokes.length - 1; i >= 0; i--) {
      const c = this.smokes[i]
      const age = s.time - c.start
      if (age > SMOKE.life) {
        this.smokes.splice(i, 1)
        continue
      }
      if (age < SMOKE.life - 6 && (c.emit -= dt) <= 0) {
        c.emit = 0.12
        tmp.copy(c.pos).setY(c.pos.y + 0.4)
        s.effects.emit('smokeScreen', tmp, UP, 2, 1 + Math.min(1, age / 4))
      }
    }
  }

  /** Radius of a smoke cloud right now. */
  smokeRadius(c: SmokeCloud) {
    const age = this.s.time - c.start
    const fade = Math.max(0, Math.min(1, (SMOKE.life - age) / 5))
    return Math.min(SMOKE.maxRadius, 1 + age * SMOKE.grow) * fade
  }

  /** True when the segment a→b passes through any smoke cloud (vision only — bullets go straight through). */
  blocksVision(a: Vector3, b: Vector3) {
    for (const c of this.smokes) {
      const r = this.smokeRadius(c)
      if (r < 0.5) continue
      // closest point on the segment to the cloud centre (cloud centre sits ~1.4 m up)
      const centre = segA.copy(c.pos).setY(c.pos.y + 1.4)
      const ab = segB.subVectors(b, a)
      const len2 = ab.lengthSq()
      const t = len2 > 0 ? Math.max(0, Math.min(1, ((centre.x - a.x) * ab.x + (centre.y - a.y) * ab.y + (centre.z - a.z) * ab.z) / len2)) : 0
      if (Math.hypot(a.x + ab.x * t - centre.x, a.y + ab.y * t - centre.y, a.z + ab.z * t - centre.z) < r) return true
    }
    return false
  }

  /** A live frag close enough to `p` to make someone run, if any. */
  fragNear(p: Vector3, range = 7): Vector3 | null {
    for (const g of this.pool) if (g.active && g.kind === 'frag' && g.pos.distanceTo(p) < range) return g.pos
    return null
  }

  private throwOrigin(out: Vector3) {
    const p = this.s.player
    p.eye(out)
    right.set(Math.cos(p.yaw), 0, -Math.sin(p.yaw))
    return out.addScaledVector(right, 0.18).setY(out.y - 0.1)
  }

  private throwVelocity(out: Vector3) {
    const p = this.s.player
    p.forward(out)
    // lobbed a little above the aim point; prone throws are weaker
    out.y += 0.18
    out.normalize().multiplyScalar(THROW_SPEED * (p.prone ? 0.6 : p.crouching ? 0.85 : 1))
    return out.add(tmp.copy(p.velocity).setY(0))
  }

  private throw() {
    const s = this.s
    this.priming = false
    const g = this.pool.find((x) => !x.active) ?? this.pool[this.throws % POOL]
    this.throws++
    this.counts[this.selected]--
    g.active = true
    g.kind = this.selected
    this.throwOrigin(g.pos)
    this.throwVelocity(g.vel)
    g.fuse = GRENADES[g.kind].fuse
    g.resting = false
    g.spin = 8 + Math.random() * 6
    g.rot = 0
    g.age = 0
    this.thrownAt = s.time
    audio.cloth(1)
    s.noises.push({ position: s.player.feet.clone(), kind: 'footstep', radius: 3 })
    s.stats.grenades++
    if (this.counts[this.selected] === 0) {
      const next = ORDER.find((k) => this.counts[k] > 0)
      if (next) this.selected = next
    }
  }

  /** Simulates the throw for the preview arc (same integrator, no bounces past the first impact). */
  private predict(from: Vector3, vel: Vector3) {
    const ph = this.s.physics
    const p = tmp.copy(from)
    const v = dir.copy(vel)
    const step = 1 / 30
    let n = 0
    this.arc[n++].copy(p)
    while (n < ARC_POINTS) {
      v.y -= GRAVITY * step
      const len = v.length() * step
      const hit = ph.raycast(p, right.copy(v).normalize(), len, this.s.player.character.collider, 'move')
      if (hit) {
        this.arc[n++].set(hit.point.x, hit.point.y, hit.point.z)
        break
      }
      p.addScaledVector(v, step)
      this.arc[n++].copy(p)
    }
    this.arcCount = n
  }

  private step(g: Grenade, dt: number) {
    const s = this.s
    g.age += dt
    g.fuse -= dt
    if (!g.resting) {
      g.vel.y -= GRAVITY * dt
      const len = g.vel.length() * dt
      if (len > 1e-4) {
        dir.copy(g.vel).normalize()
        const hit = s.physics.raycast(g.pos, dir, len + 0.06, g.age < 0.25 ? s.player.character.collider : undefined, 'move')
        if (hit && hit.tag?.kind !== 'player') {
          const n = tmp.set(hit.normal.x, hit.normal.y, hit.normal.z)
          g.pos.set(hit.point.x, hit.point.y, hit.point.z).addScaledVector(n, 0.07)
          const vn = g.vel.dot(n)
          const impact = Math.abs(vn)
          g.vel.addScaledVector(n, -(1 + RESTITUTION) * vn).multiplyScalar(0.7)
          g.spin *= 0.6
          if (impact > 1.2) {
            audio.grenadeBounce(g.pos, Math.min(1, impact / 8))
            s.noises.push({ position: g.pos.clone(), kind: 'impact', radius: 6 })
          }
          if (n.y > 0.6 && g.vel.length() < 0.9) {
            g.resting = true
            g.vel.set(0, 0, 0)
          }
        } else g.pos.addScaledVector(g.vel, dt)
      }
      g.rot += g.spin * dt
      if (g.pos.y < s.terrain.height(g.pos.x, g.pos.z) + 0.05) {
        g.pos.y = s.terrain.height(g.pos.x, g.pos.z) + 0.05
        if (Math.abs(g.vel.y) < 1) {
          g.resting = true
          g.vel.set(0, 0, 0)
        } else g.vel.set(g.vel.x * 0.6, Math.abs(g.vel.y) * RESTITUTION, g.vel.z * 0.6)
      }
    }
    if (g.fuse > 0) return
    g.active = false
    if (g.kind === 'frag') this.explodeFrag(g.pos)
    else if (g.kind === 'flash') this.explodeFlash(g.pos)
    else {
      this.smokes.push({ pos: g.pos.clone(), start: s.time, emit: 0 })
      audio.explosion(g.pos, 'smoke')
      s.noises.push({ position: g.pos.clone(), kind: 'impact', radius: 12 })
    }
  }

  private explodeFrag(at: Vector3) {
    const s = this.s
    const c = at.clone().setY(at.y + 0.25)
    s.effects.emit('explosion', c, UP, 14)
    s.effects.emit('flash', c, UP, 3, 3)
    s.effects.emit('fire', c, UP, 18, 4)
    s.effects.emit('dust', c, UP, 36, 3)
    s.effects.emit('dirt', c, UP, 26, 2)
    s.effects.emit('spark', c, UP, 30, 1.4)
    s.effects.emit('smoke', c, UP, 10, 2)
    s.effects.lightFlash(c, s.time)
    audio.explosion(c, 'frag')
    s.noises.push({ position: c.clone(), kind: 'gunshot', radius: 110 })

    const hurt = (target: Vector3, exclude: Parameters<Physics['raycast']>[3]) => {
      const d = target.distanceTo(c)
      if (d > FRAG.radius) return 0
      dir.subVectors(target, c).divideScalar(Math.max(d, 0.01))
      // cover protects: anything solid between the blast and the target stops the fragments
      const block = s.physics.raycast(c, dir, d, exclude, 'bullet')
      if (block && block.tag?.kind !== 'guard' && block.tag?.kind !== 'player') return 0
      return FRAG.damage * Math.pow(1 - d / FRAG.radius, 1.5) + (d < 2 ? 60 : 0)
    }
    for (const g of s.guards) {
      if (!g.active || g.data.state === 'DEAD') continue
      const dmg = hurt(tmp.copy(g.data.position).setY(g.data.position.y + 1), g.character.collider)
      if (dmg > 0) damageGuard(s, g, dmg, dir.clone(), true)
    }
    const p = s.player
    if (p.active) {
      const dmg = hurt(p.chest(eye), p.character.collider)
      if (dmg > 0) s.damagePlayer(dmg * 0.8, dir.clone(), 'Explosion', true)
    }
    const near = c.distanceTo(s.player.feet)
    s.suppression = Math.min(1, s.suppression + Math.max(0, 1 - near / 25))
    s.shake = Math.max(s.shake, Math.max(0, 1 - near / 30))
    for (const cam of s.security.cameras) if (!cam.dead && tmp.set(...cam.def.position).distanceTo(c) < FRAG.cameraRadius) s.security.damageCamera(cam.def.id)
  }

  private explodeFlash(at: Vector3) {
    const s = this.s
    const c = at.clone().setY(at.y + 0.3)
    s.effects.emit('flash', c, UP, 6, 6)
    s.effects.emit('spark', c, UP, 20, 1)
    s.effects.emit('smoke', c, UP, 4, 1)
    s.effects.lightFlash(c, s.time)
    audio.explosion(c, 'flash')
    s.noises.push({ position: c.clone(), kind: 'gunshot', radius: 60 })
    for (const g of s.guards) {
      if (!g.active || g.data.state === 'DEAD') continue
      const head = tmp.copy(g.data.position).setY(g.data.position.y + 1.6)
      const d = head.distanceTo(c)
      if (d > FLASH.radius || !s.physics.clearLine(c, head, g.character.collider)) continue
      const facing = (-Math.sin(g.data.yaw) * (c.x - head.x) - Math.cos(g.data.yaw) * (c.z - head.z)) / Math.max(d, 0.01)
      const k = (1 - d / FLASH.radius) * (facing > 0.2 || d < 4 ? 1 : 0.35)
      if (k <= 0.05) continue
      g.stun = Math.max(g.stun, 1.5 + 5 * k)
      alertGuard(g.data, c)
    }
    const p = s.player
    if (!p.active) return
    p.eye(eye)
    const d = eye.distanceTo(c)
    if (d > FLASH.radius + 4 || !s.physics.clearLine(c, eye, p.character.collider)) return
    p.forward(dir)
    const facing = dir.dot(tmp.subVectors(c, eye).normalize())
    const k = (1 - d / (FLASH.radius + 4)) * (facing > 0.3 ? 1 : d < 5 ? 0.6 : 0.2)
    if (k > 0.05) {
      this.flash = Math.max(this.flash, Math.min(1, k * 1.4))
      audio.ringing(k)
      useGameStore.setState({ lastDamage: performance.now() })
    }
  }
}

const UP = new Vector3(0, 1, 0)
