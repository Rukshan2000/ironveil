import { Vector3, type Camera } from 'three'
import { audio, type LoopHandle } from '../audio/AudioSystem'
import { input } from '../game/input'
import type { GameSession } from '../game/GameSession'
import { settings } from '../state/settings'
import { clamp } from '../utils/math'
import { AR_K7 } from '../weapons/definitions'

/**
 * The finale after extraction: the helicopter lifts off with Wren on the right-hand door gun and Kestrel (or the
 * co-op partner) on the left, circles out of the valley while Varn gunships come after it in two waves, and flies
 * home once they are all down. The player aims with the mouse and fires the door gun; tracers, hits, mid-air
 * explosions, burning wrecks spiralling into the ridge. If the hull is shot through, the helicopter goes down.
 */

const CENTER = new Vector3(0, 0, -10)
const RADIUS = 150
const CRUISE = 46
const TURN = 0.13 // rad/s around the valley
const LIFT = 6 // seconds to climb out of the LZ
const HULL = 100
const GUN_RATE = 1 / 13
const GUN_DAMAGE = 6
const GUNSHIP_HP = 100
const HIT_RADIUS = 4
const WAVES = [2, 2]

export interface Gunship {
  pos: Vector3
  yaw: number
  hp: number
  state: 'alive' | 'falling' | 'gone'
  /** Where it holds station relative to us: right, forward, up (metres), drifting over time. */
  slot: Vector3
  fire: number
  burst: number
  spin: number
  fall: Vector3
  rotor: LoopHandle | null
  hitAt: number
}

const v = new Vector3(), w = new Vector3(), fwd = new Vector3(), right = new Vector3(), up = new Vector3(0, 1, 0)

export class EscapeSequence {
  t = 0
  hull = HULL
  kills = 0
  readonly total = WAVES.reduce((a, b) => a + b, 0)
  readonly gunships: Gunship[] = []
  phase: 'lift' | 'fight' | 'home' | 'escaped' | 'down' = 'lift'
  /** Door gun aim relative to looking straight out of the right door. */
  aimYaw = 0
  aimPitch = -0.15
  /** Last time our rounds hit a gunship (hit marker). */
  hitAt = -9
  /** Shown in the overlay. */
  message = ''
  private gunCd = 0
  private wave = 0
  private nextWave = 7
  private angle: number
  private readonly start: Vector3
  private crashT = 0
  private partnerCd = 0

  constructor(private readonly s: GameSession) {
    this.start = s.extraction.heliPos.clone()
    this.angle = Math.atan2(this.start.x - CENTER.x, this.start.z - CENTER.z)
    // aboard: no walking body, nothing to shoot at on the ground
    s.player.active = false
    s.player.character.collider.setEnabled(false)
    s.radio.say('handler', 'CANOPY', 'Wheels up. Varn gunships are scrambling — get on the door gun.')
    this.message = 'GET ON THE DOOR GUN'
  }

  /** Where our helicopter is and which way it faces (`heliYaw`: forward = (-sin, 0, -cos)). */
  private fly(dt: number) {
    const x = this.s.extraction
    if (this.phase === 'down') {
      // shot down: spinning, losing height towards the ridge
      this.crashT += dt
      x.heliYaw += dt * 3
      x.heliPos.y -= dt * (6 + this.crashT * 6)
      x.heliPos.addScaledVector(fwd.set(-Math.sin(x.heliYaw), 0, -Math.cos(x.heliYaw)), dt * 10)
      return
    }
    const lift = clamp(this.t / LIFT, 0, 1)
    if (this.phase === 'home' || this.phase === 'escaped') {
      // out of the valley, climbing away north-west
      x.heliPos.addScaledVector(fwd.set(-Math.sin(x.heliYaw), 0, -Math.cos(x.heliYaw)), dt * 30).add(up.clone().multiplyScalar(dt * 3))
      return
    }
    // clockwise round the valley, so the right-hand door gun faces the base (where the gunships come from)
    if (lift > 0.35) this.angle -= TURN * dt * clamp((lift - 0.35) / 0.4, 0, 1)
    const ring = v.set(CENTER.x + Math.sin(this.angle) * RADIUS, 0, CENTER.z + Math.cos(this.angle) * RADIUS)
    const k = lift * lift * (3 - 2 * lift)
    x.heliPos.lerpVectors(this.start, ring, Math.min(1, k * 1.2)).setY(this.start.y + (CRUISE + Math.sin(this.t * 0.5) * 2 - this.start.y) * k)
    x.heliYaw = Math.atan2(Math.cos(this.angle), -Math.sin(this.angle))
  }

  update(dt: number) {
    const s = this.s
    this.t += dt
    this.fly(dt)
    const heli = s.extraction.heliPos
    const H = s.extraction.heliYaw
    fwd.set(-Math.sin(H), 0, -Math.cos(H))
    right.set(Math.cos(H), 0, -Math.sin(H))
    s.player.feet.copy(heli) // so guards/minimap/listener follow the helicopter

    if (this.phase === 'down') {
      if (heli.y < s.terrain.height(heli.x, heli.z) + 2) {
        this.boom(heli, 2)
        s.status = 'dead'
      }
      return
    }
    if (this.phase === 'lift' && this.t > LIFT * 0.6) this.phase = 'fight'

    // aim the door gun
    const { dx, dy } = input.consumeMouse()
    const sens = 0.0022 * settings().sensitivity
    this.aimYaw = clamp(this.aimYaw - dx * sens, -1.7, 1.7)
    this.aimPitch = clamp(this.aimPitch - dy * sens * (settings().invertY ? -1 : 1), -1.0, 0.55)

    // waves
    if (this.phase === 'fight' && this.wave < WAVES.length && this.t >= this.nextWave && this.gunships.every((g) => g.state !== 'alive')) {
      for (let i = 0; i < WAVES[this.wave]; i++) this.spawn(i)
      this.wave++
      s.radio.say('handler', 'CANOPY', this.wave === 1 ? 'Two gunships on your right, closing fast!' : 'Second pair coming in — keep them off us!')
      this.message = `GUNSHIPS INBOUND — ${this.total - this.kills} LEFT`
    }

    this.fireDoorGun(dt)
    this.partnerFire(dt)
    for (const g of this.gunships) this.updateGunship(g, dt, heli)

    if (this.phase === 'fight' && this.kills >= this.total) {
      this.phase = 'home'
      this.message = 'VALLEY CLEAR — HEADING HOME'
      s.radio.say('handler', 'CANOPY', "That's the last of them. Bird's clear — bringing you home, WREN.")
      this.nextWave = this.t + 7
    }
    if (this.phase === 'home' && this.t >= this.nextWave) {
      this.phase = 'escaped'
      this.message = 'ESCAPED'
    }
    if (this.hull <= 0 && this.phase === 'fight') {
      this.phase = 'down'
      this.message = "WE'RE HIT — GOING DOWN"
      s.radio.say('handler', 'CANOPY', 'Mayday, mayday — bird is going down!')
    }
  }

  /** Door gun position (right door) and the camera: looking out of it, plus the player's aim. */
  applyCamera(camera: Camera) {
    const heli = this.s.extraction.heliPos
    const H = this.s.extraction.heliYaw
    camera.position.copy(heli).addScaledVector(right.set(Math.cos(H), 0, -Math.sin(H)), 1.25).add(up.clone().multiplyScalar(0.55))
    camera.rotation.set(this.aimPitch, H - Math.PI / 2 + this.aimYaw, this.phase === 'down' ? Math.sin(this.t * 9) * 0.3 : Math.sin(this.t * 0.8) * 0.02, 'YXZ')
    return true
  }

  /** Where the partner sits: the left door. */
  partnerSeat(out: Vector3) {
    const H = this.s.extraction.heliYaw
    return out.copy(this.s.extraction.heliPos).addScaledVector(v.set(-Math.cos(H), 0, Math.sin(H)), 0.9).setY(this.s.extraction.heliPos.y - 0.6)
  }

  private spawn(i: number) {
    const s = this.s
    const heli = s.extraction.heliPos
    // they come up from the base side (our right) and from behind
    const from = heli.clone().addScaledVector(right, 160 + i * 30).addScaledVector(fwd, -120 + i * 60).setY(heli.y - 20)
    const g: Gunship = {
      pos: from, yaw: 0, hp: GUNSHIP_HP, state: 'alive', fire: 3 + i * 1.5, burst: 0, spin: 0, fall: new Vector3(), hitAt: -9,
      slot: new Vector3(38 + i * 18, (i % 2 ? 1 : -1) * 18, i % 2 ? 6 : -4),
      rotor: audio.loop('rotor', from, 1.1),
    }
    this.gunships.push(g)
  }

  private updateGunship(g: Gunship, dt: number, heli: Vector3) {
    const s = this.s
    if (g.state === 'gone') return
    g.rotor?.move(g.pos)
    if (g.state === 'falling') {
      // burning wreck: spinning, trailing fire and smoke, until it hits the ground
      g.fall.y -= 9.8 * dt
      g.pos.addScaledVector(g.fall, dt)
      g.yaw += g.spin * dt
      s.effects.emit('fire', g.pos, up, 2, 1.5)
      s.effects.emit('smoke', g.pos, up, 2, 1)
      if (g.pos.y < s.terrain.height(g.pos.x, g.pos.z) + 1) {
        this.boom(g.pos, 1.6)
        g.rotor?.stop()
        g.state = 'gone'
      }
      return
    }
    // hold a station off our right side, drifting so it's a moving target
    const drift = this.t * 0.35 + g.slot.x
    w.copy(heli).addScaledVector(right, g.slot.x + Math.sin(drift) * 10).addScaledVector(fwd, g.slot.y + Math.cos(drift * 0.7) * 14).setY(heli.y + g.slot.z + Math.sin(drift * 1.3) * 5)
    const before = g.pos.clone()
    g.pos.lerp(w, 1 - Math.exp(-0.7 * dt))
    g.fall.subVectors(g.pos, before).divideScalar(Math.max(dt, 1e-3)) // velocity, kept for when it falls
    v.subVectors(heli, g.pos)
    g.yaw = Math.atan2(-v.x, -v.z)

    // bursts at us once in range
    if ((g.fire -= dt) <= 0 && this.phase === 'fight' && g.pos.distanceTo(heli) < 140) {
      if (g.burst <= 0) g.burst = 6 + Math.floor(Math.random() * 4)
      g.fire = 0.12
      g.burst--
      if (g.burst <= 0) g.fire = 2.2 + Math.random() * 1.8
      const muzzle = g.pos.clone().add(v.set(0, -0.8, 0))
      const aim = heli.clone().add(w.set((Math.random() - 0.5) * 6, (Math.random() - 0.5) * 3, (Math.random() - 0.5) * 6)).sub(muzzle).normalize()
      s.ballistics.fire(muzzle, aim, AR_K7.ballistics, 0, { head: 1, limb: 1 }, { kind: 'peer' }, undefined, true)
      s.effects.muzzle(muzzle, aim, 1.4)
      audio.gunshot(AR_K7.sound, muzzle)
      if (Math.random() < 0.3) {
        this.hull = Math.max(0, this.hull - 1.3)
        s.shake = Math.min(1, s.shake + 0.08)
      }
    }
  }

  /** Our door gun: hold fire. Hitscan against the gunships (tracers are cosmetic). */
  private fireDoorGun(dt: number) {
    const s = this.s
    this.gunCd -= dt
    if (!input.down('fire') || this.gunCd > 0 || this.phase === 'down' || this.phase === 'escaped') return
    this.gunCd = GUN_RATE
    const H = s.extraction.heliYaw
    const yaw = H - Math.PI / 2 + this.aimYaw
    const dir = new Vector3(-Math.sin(yaw) * Math.cos(this.aimPitch), Math.sin(this.aimPitch), -Math.cos(yaw) * Math.cos(this.aimPitch))
    dir.x += (Math.random() - 0.5) * 0.02
    dir.y += (Math.random() - 0.5) * 0.02
    dir.normalize()
    const muzzle = s.extraction.heliPos.clone().addScaledVector(right.set(Math.cos(H), 0, -Math.sin(H)), 1.9).add(v.set(0, 0.35, 0))
    s.ballistics.fire(muzzle, dir, AR_K7.ballistics, 0, { head: 1, limb: 1 }, { kind: 'peer' }, undefined, true)
    s.effects.muzzle(muzzle, dir, 1.6)
    audio.gunshot(AR_K7.sound, muzzle)
    const hit = this.rayHit(muzzle, dir)
    if (hit) {
      this.damage(hit, GUN_DAMAGE)
      this.hitAt = this.t
    }
  }

  /** The partner on the left door fires at whatever gunship is closest (tracers out of the other side). */
  private partnerFire(dt: number) {
    if ((this.partnerCd -= dt) > 0 || this.phase !== 'fight') return
    this.partnerCd = 0.18
    const s = this.s
    const target = this.gunships.filter((g) => g.state === 'alive').sort((a, b) => a.pos.distanceToSquared(s.extraction.heliPos) - b.pos.distanceToSquared(s.extraction.heliPos))[0]
    if (!target) return
    const muzzle = this.partnerSeat(new Vector3()).setY(s.extraction.heliPos.y + 0.3)
    const dir = target.pos.clone().add(v.set((Math.random() - 0.5) * 8, (Math.random() - 0.5) * 4, (Math.random() - 0.5) * 8)).sub(muzzle).normalize()
    s.ballistics.fire(muzzle, dir, AR_K7.ballistics, 0, { head: 1, limb: 1 }, { kind: 'peer' }, undefined, true)
    s.effects.muzzle(muzzle, dir, 1)
    if (Math.random() < 0.35) this.damage(target, 3)
  }

  private rayHit(from: Vector3, dir: Vector3): Gunship | null {
    let best: Gunship | null = null, bestT = Infinity
    for (const g of this.gunships) {
      if (g.state !== 'alive') continue
      v.subVectors(g.pos, from)
      const t = v.dot(dir)
      if (t < 0 || t > 600) continue
      if (v.addScaledVector(dir, -t).length() < HIT_RADIUS && t < bestT) [best, bestT] = [g, t]
    }
    return best
  }

  private damage(g: Gunship, amount: number) {
    g.hp -= amount
    g.hitAt = this.t
    this.s.effects.emit('spark', g.pos, up, 3, 2)
    if (g.hp > 0 || g.state !== 'alive') return
    // shot down: blows apart in the air, then the wreck falls burning
    g.state = 'falling'
    g.spin = (Math.random() < 0.5 ? -1 : 1) * (3 + Math.random() * 2)
    this.boom(g.pos, 1.2)
    this.kills++
    this.message = this.kills >= this.total ? 'ALL GUNSHIPS DOWN' : `GUNSHIP DOWN — ${this.total - this.kills} LEFT`
    audio.cue('kill')
  }

  private boom(at: Vector3, size: number) {
    const s = this.s
    s.effects.emit('explosion', at, up, Math.round(16 * size), 1.5 * size)
    s.effects.emit('flash', at, up, 4, 4 * size)
    s.effects.emit('fire', at, up, Math.round(20 * size), 4 * size)
    s.effects.emit('smoke', at, up, Math.round(14 * size), 2 * size)
    audio.explosion(at, 'frag')
    s.shake = Math.min(1, s.shake + 0.3)
  }

  dispose() {
    for (const g of this.gunships) g.rotor?.stop()
  }
}

