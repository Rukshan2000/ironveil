import { clamp } from '../utils/math'
import type { WeaponDefinition } from './types'
import { cheats } from '../game/input'

export type WeaponState = 'IDLE' | 'ADS' | 'FIRING' | 'RELOADING' | 'SPRINTING' | 'EMPTY' | 'INSPECTING' | 'EQUIPPING' | 'HOLSTERING' | 'CYCLING'

/** Discrete moments the audio/animation layers react to. */
export type WeaponEvent = 'magOut' | 'magIn' | 'bolt' | 'reloaded' | 'cycled' | 'equipped'

/** Seconds after sprinting before the weapon can fire (the muzzle has to come up). */
const SPRINT_TO_FIRE = 0.18

/**
 * Pure weapon state machine: ammo (magazine + chamber), fire timing, tactical/empty reloads, bolt cycling, ADS blend,
 * spread bloom, sprint/inspect/equip states. No rendering, no audio — callers react to returned events.
 */
export class WeaponController {
  /** Rounds loaded (magazine + chamber). */
  ammo: number
  reserve: number
  /** 0 = hip, 1 = fully aimed. */
  aim = 0
  bloom = 0
  /** 0 = ready, 1 = fully lowered for sprinting (smoothed). */
  sprint = 0
  reloadTimer = 0
  reloadDuration = 0
  reloadKind: 'tactical' | 'empty' | null = null
  cycleTimer = 0
  equipTimer = 0
  /** Lowering the weapon before a switch. */
  holsterTimer = 0
  inspectTimer = 0
  /** Index into def.optics. */
  zoomIndex = 0
  /** Smoothed magnification relative to the first optic level (1 = base ADS FOV). */
  zoom = 1
  /** Seconds since the last shot. */
  sinceShot = 99
  /** Consecutive shots in the current string (for first-shot recoil and patterns). */
  burst = 0
  private cooldown = 0
  private triggerWasHeld = false
  private sprintCooldown = 0

  constructor(readonly def: WeaponDefinition) {
    this.ammo = def.magazineSize + (def.chamber ? 1 : 0)
    this.reserve = def.reserveAmmo
  }

  get reloading() {
    return this.reloadTimer > 0
  }

  get maxLoaded() {
    return this.def.magazineSize + (this.def.chamber ? 1 : 0)
  }

  /** 0..1 progress through the current reload. */
  get reloadProgress() {
    return this.reloading ? 1 - this.reloadTimer / this.reloadDuration : 0
  }

  get holsterTime() {
    return this.def.equipTime * 0.5
  }

  /** Target magnification over the first optic level. */
  get zoomTarget() {
    const o = this.def.optics
    return o ? o[this.zoomIndex] / o[0] : 1
  }

  /** Steps the optic (+1 = more zoom). Returns true when it changed. */
  stepZoom(dir: number): boolean {
    const o = this.def.optics
    if (!o || o.length < 2 || this.aim < 0.5) return false
    const next = Math.max(0, Math.min(o.length - 1, this.zoomIndex + dir))
    if (next === this.zoomIndex) return false
    this.zoomIndex = next
    return true
  }

  get state(): WeaponState {
    if (this.holsterTimer > 0) return 'HOLSTERING'
    if (this.equipTimer > 0) return 'EQUIPPING'
    if (this.reloading) return 'RELOADING'
    if (this.cycleTimer > 0) return 'CYCLING'
    if (this.inspectTimer > 0) return 'INSPECTING'
    if (this.sprint > 0.5) return 'SPRINTING'
    if (this.sinceShot < 0.12) return 'FIRING'
    if (this.ammo === 0) return 'EMPTY'
    return this.aim > 0.5 ? 'ADS' : 'IDLE'
  }

  equip() {
    this.holsterTimer = 0
    this.equipTimer = this.def.equipTime
    this.inspectTimer = 0
    this.aim = 0
    this.triggerWasHeld = true // don't fire on the frame of switching
  }

  /** Starts lowering the weapon for a switch; `lowered` turns true when it is out of view. */
  lower() {
    this.holster()
    this.holsterTimer = this.holsterTime
    this.aim = 0
  }

  get lowered() {
    return this.holsterTimer === 0
  }

  /** Puts the weapon away mid-reload: the reload is cancelled (magazine stays as it was). */
  holster() {
    this.reloadTimer = 0
    this.reloadKind = null
    this.cycleTimer = 0
    this.inspectTimer = 0
  }

  inspect() {
    if (this.state === 'IDLE' || this.state === 'EMPTY') this.inspectTimer = this.def.inspectTime
  }

  /** Advances timers. Returns the events that happened this tick. */
  tick(dt: number, aiming: boolean, sprinting: boolean, adsSpeed = 1): WeaponEvent[] {
    const events: WeaponEvent[] = []
    this.sinceShot += dt
    this.cooldown = Math.max(0, this.cooldown - dt)
    this.bloom = Math.max(0, this.bloom - this.def.spread.recovery * dt)
    if (this.sinceShot > 0.35) this.burst = 0
    this.sprint = clamp(this.sprint + (sprinting ? dt : -dt) / 0.2, 0, 1)
    this.sprintCooldown = sprinting ? SPRINT_TO_FIRE : Math.max(0, this.sprintCooldown - dt)

    if (this.holsterTimer > 0) this.holsterTimer = Math.max(0, this.holsterTimer - dt)
    if (this.equipTimer > 0 && (this.equipTimer -= dt) <= 0) {
      this.equipTimer = 0
      events.push('equipped')
    }
    if (this.inspectTimer > 0 && (aiming || sprinting)) this.inspectTimer = 0
    this.inspectTimer = Math.max(0, this.inspectTimer - dt)

    const canAim = aiming && !this.reloading && !sprinting && this.equipTimer === 0 && this.holsterTimer === 0
    const step = (dt * adsSpeed) / this.def.adsTime
    this.aim = clamp(this.aim + (canAim ? step : -step), 0, 1)
    // optics: smooth magnification change, back to the first level when not aimed
    if (this.aim === 0) this.zoomIndex = 0
    this.zoom += (this.zoomTarget - this.zoom) * (1 - Math.exp(-12 * dt))

    if (this.cycleTimer > 0 && (this.cycleTimer -= dt) <= 0) {
      this.cycleTimer = 0
      events.push('cycled')
    }

    if (this.reloadTimer > 0) {
      const before = this.reloadProgress
      this.reloadTimer -= dt
      const after = this.reloadTimer <= 0 ? 1 : this.reloadProgress
      const r = this.def.reload
      if (before < r.magOut && after >= r.magOut) events.push('magOut')
      if (before < r.magIn && after >= r.magIn) events.push('magIn')
      if (this.reloadKind === 'empty' && before < r.bolt && after >= r.bolt) events.push('bolt')
      if (this.reloadTimer <= 0) {
        this.finishReload()
        events.push('reloaded')
      }
    }
    return events
  }

  private finishReload() {
    // a tactical reload keeps the chambered round; an empty one has to chamber from the new magazine
    const keepChambered = this.reloadKind === 'tactical' && this.def.chamber && this.ammo > 0 ? 1 : 0
    const want = this.def.magazineSize
    const moved = Math.min(want - (this.ammo - keepChambered), this.reserve)
    this.ammo += moved
    this.reserve -= moved
    this.reloadTimer = 0
    this.reloadKind = null
  }

  /** Call every frame with the trigger state. Returns 'fired', 'empty' (dry click on press) or null. */
  trigger(held: boolean): 'fired' | 'empty' | null {
    const pressed = held && !this.triggerWasHeld
    this.triggerWasHeld = held
    // a tactical reload can be abandoned before the old magazine is out: you still have rounds to shoot
    if (pressed && this.reloading && this.reloadKind === 'tactical' && this.reloadProgress < this.def.reload.magOut) this.cancelReload()
    if (!held || this.reloading || this.cooldown > 0 || this.equipTimer > 0 || this.holsterTimer > 0 || this.cycleTimer > 0 || this.sprintCooldown > 0) return null
    if (this.def.action !== 'auto' && !pressed) return null
    if (this.ammo <= 0) {
      this.cooldown = 0.25
      return pressed ? 'empty' : null
    }
    this.inspectTimer = 0
    if (!cheats.ammo) this.ammo--
    this.cooldown = 60 / this.def.fireRate
    this.bloom = Math.min(this.def.spread.maxBloom, this.bloom + this.def.spread.perShot)
    this.sinceShot = 0
    this.burst++
    if (this.def.action === 'bolt' && this.ammo > 0) this.cycleTimer = this.def.boltCycle
    return 'fired'
  }

  cancelReload() {
    this.reloadTimer = 0
    this.reloadKind = null
  }

  startReload(): boolean {
    if (this.reloading || this.equipTimer > 0 || this.holsterTimer > 0 || this.ammo >= this.maxLoaded || this.reserve <= 0) return false
    if (this.def.chamber && this.ammo > 0 && this.ammo >= this.def.magazineSize + 1) return false
    this.reloadKind = this.ammo > 0 ? 'tactical' : 'empty'
    this.reloadDuration = this.reloadKind === 'tactical' ? this.def.reload.tactical : this.def.reload.empty
    this.reloadTimer = this.reloadDuration
    this.cycleTimer = 0
    this.inspectTimer = 0
    return true
  }

  /** Current spread cone half-angle in radians. */
  spread(moving: boolean): number {
    const s = this.def.spread
    const base = s.hip + (s.ads - s.hip) * this.aim
    return base + (moving ? s.moving * (1 - this.aim * 0.7) : 0) + this.bloom * (1 - this.aim * 0.5)
  }
}
