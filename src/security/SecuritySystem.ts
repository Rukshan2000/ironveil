import type RAPIER from '@dimforge/rapier3d-compat'
import { Vector3 } from 'three'
import { alertGuard } from '../ai/guardBrain'
import { audio, type LoopHandle } from '../audio/AudioSystem'
import { MATERIALS } from '../assets/materials'
import type { GameSession } from '../game/GameSession'
import type { AlarmPanelDef, CameraDef, DoorDef, SearchlightDef, ZoneDef } from '../world/types'

/** Camera field of view (half-angles) and detection tuning. */
const CAM = { halfFov: 0.48, halfPitch: 0.45, sweepSpeed: 0.32, detectRate: 1.4, decay: 0.3 }
const BEAM = { halfAngle: 0.12, sweepSpeed: 0.22 }
const ALARM_TIMEOUT = 60
const PANEL_SABOTAGE = 2.2

export interface CameraState {
  def: CameraDef
  yaw: number
  pitch: number
  detection: number
  seeing: boolean
  dead: boolean
  cooldown: number
  collider: RAPIER.Collider
  phase: number
}

export interface SearchlightState {
  def: SearchlightDef
  /** Centre of the sweep; world events can re-point it. */
  yaw: number
  dir: Vector3
  on: boolean
  spotted: boolean
  trackTime: number
  phase: number
}

export interface PanelState {
  def: AlarmPanelDef
  disabled: boolean
  sabotage: number
}

export type DoorStatus = 'OPEN' | 'CLOSED' | 'LOCKED' | 'LOCKED_BY_ALERT' | 'OPENING' | 'CLOSING'

export interface DoorState {
  def: DoorDef
  open: number
  target: number
  /** Swing direction for the current opening: chosen so the leaf moves away from whoever opened it. */
  swing: 1 | -1
  body: RAPIER.RigidBody
  autoClose: number
  /** Lock hacked or forced open (until the next lockdown re-arms it). */
  bypassed: boolean
  /** Hold-E progress on a bypass/force, 0..1. */
  progress: number
}

const tmp = new Vector3()
const dir = new Vector3()

/** SecuritySystem: cameras, searchlights, alarm panels, doors, restricted zones and the base alarm. */
export class SecuritySystem {
  readonly cameras: CameraState[]
  readonly searchlights: SearchlightState[]
  readonly panels: PanelState[]
  readonly doors: DoorState[]
  readonly zones: ZoneDef[]
  alarmActive = false
  alarmReason = ''
  /** Guard currently calling the alarm in (only one at a time). */
  caller: string | null = null
  /** Highest camera detection this frame (HUD). */
  cameraDetection = 0
  /** Full lockdown: doors flagged `lockdown` re-lock and reject keycards. */
  lockdownActive = false
  private quiet = 0
  private sirens: LoopHandle[] = []

  constructor(private readonly s: GameSession) {
    const L = s.layout
    this.cameras = L.cameras.map((def, i) => ({
      def, yaw: def.yaw, pitch: def.pitch, detection: 0, seeing: false, dead: false, cooldown: 0, phase: i * 1.7,
      collider: s.physics.createKinematicBox({ x: def.position[0], y: def.position[1], z: def.position[2] }, [0.16, 0.14, 0.26], [0, 0, 0], { kind: 'camera', id: def.id }).collider,
    }))
    this.searchlights = L.searchlights.map((def, i) => ({ def, yaw: def.yaw, dir: new Vector3(0, -0.3, -1).normalize(), on: s.environment.preset.lampsOn, spotted: false, trackTime: 0, phase: i * 2.3 }))
    this.panels = L.alarmPanels.map((def) => ({ def, disabled: false, sabotage: 0 }))
    this.doors = L.doors.map((def) => {
      const body = s.physics.createKinematicBox({ x: def.hinge[0], y: def.hinge[1], z: def.hinge[2] }, [def.width / 2, def.height / 2, 0.045], [def.width / 2, def.height / 2, 0], { kind: 'door', id: def.id, surface: MATERIALS[def.mat ?? 'wood'].surface }).body
      body.setRotation({ x: 0, y: Math.sin(def.yaw / 2), z: 0, w: Math.cos(def.yaw / 2) }, true)
      return { def, open: 0, target: 0, swing: def.swing, body, autoClose: 0, bypassed: false, progress: 0 }
    })
    this.zones = L.restrictedZones
  }

  zoneAt(p: Vector3): ZoneDef | null {
    return this.zones.find((z) => p.x > z.rect[0] && p.x < z.rect[2] && p.z > z.rect[1] && p.z < z.rect[3]) ?? null
  }

  nearestPanel(from: Vector3, range: number): Vector3 | null {
    let best: Vector3 | null = null
    let bestD = range
    for (const p of this.panels) {
      if (p.disabled) continue
      const stand = panelStand(p.def)
      const d = stand.distanceTo(from)
      if (d < bestD) {
        bestD = d
        best = stand
      }
    }
    return best
  }

  /** Exposure the searchlight operated by `guardId` currently gives that guard (0 when the beam isn't on the player). */
  searchlightExposure(guardId: string) {
    const l = this.searchlights.find((x) => x.def.operator === guardId)
    return l?.on && l.spotted ? 0.85 : 0
  }

  damageCamera(id: string) {
    const c = this.cameras.find((x) => x.def.id === id)
    if (!c || c.dead) return
    c.dead = true
    c.detection = 0
    const s = this.s
    s.effects.emit('spark', tmp.set(...c.def.position), new Vector3(0, 1, 0), 18)
    s.objectives.handle({ type: 'destroyed', targetId: id })
    // a dead camera is noticed by whoever watches the feed — raises guards' alertness, not the alarm
    for (const g of s.guards) if (g.active) g.data.alertness = Math.max(g.data.alertness, 0.5)
    s.schedule(4, () => s.radio.say('enemy', 'Control', `Camera ${id.replace('cam-', '').toUpperCase()} just went dark. Someone take a look.`))
  }

  doorStatus(d: DoorState): DoorStatus {
    if (d.target === 1) return d.open >= 1 ? 'OPEN' : 'OPENING'
    if (d.open > 0) return 'CLOSING'
    if (this.isLocked(d)) return this.lockdownActive && d.def.lockdown ? 'LOCKED_BY_ALERT' : 'LOCKED'
    return 'CLOSED'
  }

  /** Opens a door away from `from` (a closed door picks its swing side; a moving one keeps it). */
  openDoor(d: DoorState, from: Vector3) {
    if (d.open === 0) d.swing = swingAway(d.def, from)
    d.target = 1
  }

  /** Locked for the player right now? */
  isLocked(d: DoorState) {
    if (d.bypassed) return false
    if (this.lockdownActive && d.def.lockdown) return true
    return !!d.def.lockedBy && !this.s.inventory.has(d.def.lockedBy)
  }

  /** Hold-E on a locked door: hack (quiet) or force (noisy). Returns true when it gives. */
  bypassDoor(d: DoorState, dt: number): boolean {
    const time = d.def.hackTime ?? d.def.forceTime
    if (!time || !this.isLocked(d)) return false
    const s = this.s
    const before = d.progress
    d.progress = Math.min(1, d.progress + dt / time)
    const c = doorCenter(d.def)
    if (d.def.hackTime) {
      if (Math.floor(before * 8) !== Math.floor(d.progress * 8)) audio.cue('beep')
    } else if (Math.floor(before * 4) !== Math.floor(d.progress * 4)) {
      // cutting/prying is loud: anyone nearby hears it
      audio.impact('metal', c)
      s.noises.push({ position: c.clone(), kind: 'impact', radius: 12 })
    }
    if (d.progress < 1) return false
    d.bypassed = true
    d.progress = 0
    s.notify(d.def.hackTime ? `${d.def.label ?? 'Door'} — lock bypassed` : `${d.def.label ?? 'Door'} — forced open`, 'good')
    if (d.def.forceTime) {
      this.openDoor(d, s.player.feet)
      audio.mech('bolt', c)
    }
    return true
  }

  /** Full lockdown on/off: lockdown doors slam shut and every bypass is re-armed. */
  setLockdown(on: boolean) {
    if (on === this.lockdownActive) return
    this.lockdownActive = on
    if (!on) return
    for (const d of this.doors) {
      if (!d.def.lockdown) continue
      d.bypassed = false
      d.progress = 0
      if (d.target) audio.mech('magIn', doorCenter(d.def))
      d.target = 0
    }
  }

  triggerAlarm(reason: string, at: Vector3) {
    this.quiet = 0
    const s = this.s
    if (this.alarmActive) return
    this.alarmActive = true
    this.alarmReason = reason
    this.caller = null
    s.stats.alarms++
    s.objectives.handle({ type: 'alarm' })
    s.alert.report(at)
    s.notify(`FACILITY ALARM — ${reason}`, 'warn')
    s.radio.say('enemy', 'Control', `All units, facility alert! Intruder near ${s.areaName(at)}. Reaction teams to muster.`)
    for (const p of this.panels) {
      const h = audio.loop('siren', { x: p.def.position[0], y: p.def.position[1] + 2.5, z: p.def.position[2] })
      if (h) this.sirens.push(h)
    }
    // everyone wakes up: nearby guards converge, the rest search at higher alertness
    for (const g of s.guards) {
      if (!g.active || g.data.state === 'DEAD') continue
      if (g.data.position.distanceTo(at) < 70) alertGuard(g.data, at)
      else g.data.alertness = 1
    }
    s.intel = { position: at.clone(), time: s.time, contact: true, from: 'hq' }
  }

  /** Guards have keys: unlocked or not, doors open as they walk up to them and close behind them. */
  guardOpensDoors(pos: Vector3) {
    for (const d of this.doors) {
      if (doorCenter(d.def).distanceTo(pos) < 1.9 && d.target === 0) {
        this.openDoor(d, pos)
        d.autoClose = 3.5
        audio.mech('switch', doorCenter(d.def))
      }
    }
  }

  /** Player toggles a door. Returns a message when locked. */
  toggleDoor(d: DoorState): string | null {
    if (d.target === 0 && this.isLocked(d)) {
      audio.cue('denied')
      return this.lockdownActive && d.def.lockdown ? 'Locked — facility lockdown' : 'Locked — security keycard required'
    }
    if (d.target) d.target = 0
    else this.openDoor(d, this.s.player.feet)
    d.autoClose = 0
    const c = doorCenter(d.def)
    audio.mech(d.target ? 'bolt' : 'magIn', c)
    // heavy doors are heard by anyone close
    this.s.noises.push({ position: c, kind: 'door', radius: 6 })
    if (d.def.lockedBy && d.target && !d.bypassed && this.s.inventory.has(d.def.lockedBy)) this.s.notify('Keycard accepted', 'good')
    return null
  }

  sabotagePanel(p: PanelState, dt: number): boolean {
    if (p.disabled) return false
    const before = p.sabotage
    p.sabotage = Math.min(1, p.sabotage + dt / PANEL_SABOTAGE)
    if (Math.floor(before * 6) !== Math.floor(p.sabotage * 6)) audio.mech('dry', tmp.set(...p.def.position))
    if (p.sabotage >= 1) {
      p.disabled = true
      this.s.effects.emit('spark', tmp.set(...p.def.position), new Vector3(0, 1, 0), 14)
      audio.impact('metal', tmp)
      this.s.notify('Alarm panel disabled', 'good')
      return true
    }
    return false
  }

  update(dt: number) {
    const s = this.s
    const t = s.time
    const p = s.player
    const chest = p.chest(new Vector3())
    const playerTarget = p.active ? chest : s.vehicles.driving?.position ?? chest

    // ---- cameras
    this.cameraDetection = 0
    for (const c of this.cameras) {
      if (c.dead) continue
      const cam = tmp.set(...c.def.position)
      dir.subVectors(playerTarget, cam)
      const dist = dir.length()
      const toYaw = Math.atan2(-dir.x, -dir.z)
      const toPitch = Math.asin(dir.y / Math.max(dist, 0.01))
      let sees = false
      if (dist < c.def.range && Math.abs(wrap(toYaw - c.yaw)) < CAM.halfFov && Math.abs(toPitch - c.pitch) < CAM.halfPitch) {
        dir.divideScalar(dist)
        // start the sight ray clear of the mount/wall the camera hangs on
        const hit = s.physics.raycast(cam.addScaledVector(dir, 0.4), dir, dist, c.collider, 'vision')
        sees = (hit?.tag?.kind === 'player' || hit?.tag?.kind === 'vehicle') && !s.grenades.blocksVision(cam, playerTarget)
      }
      c.seeing = sees
      if (sees) {
        const light = 0.35 + s.environment.playerLight * 0.65
        // anyone in a restricted zone is flagged faster
        const zone = this.zoneAt(p.feet) ? 1.3 : 1
        c.detection = Math.min(1, c.detection + (1 - dist / c.def.range) * CAM.detectRate * light * zone * (p.crouching ? 0.7 : 1) * dt * 1.6)
        // track the target
        c.yaw += clampStep(wrap(toYaw - c.yaw), 1.2 * dt)
        c.pitch += clampStep(toPitch - c.pitch, 1 * dt)
      } else {
        c.detection = Math.max(0, c.detection - CAM.decay * dt)
        c.phase += dt * CAM.sweepSpeed
        const want = c.def.yaw + Math.sin(c.phase) * c.def.sweep
        c.yaw += clampStep(wrap(want - c.yaw), 0.5 * dt)
        c.pitch += clampStep(c.def.pitch - c.pitch, 0.4 * dt)
      }
      c.cooldown -= dt
      if (c.detection >= 1 && c.cooldown <= 0) {
        c.cooldown = 10
        this.triggerAlarm(`camera ${c.def.id.replace('cam-', '').toUpperCase()}`, playerTarget.clone())
      }
      this.cameraDetection = Math.max(this.cameraDetection, c.detection)
    }

    // ---- searchlights (die with their operator)
    for (const l of this.searchlights) {
      const op = s.guards.find((g) => g.data.id === l.def.operator)
      l.on = s.environment.preset.lampsOn && !!op && op.data.state !== 'DEAD'
      if (!l.on) {
        l.spotted = false
        continue
      }
      const pos = tmp.set(...l.def.position)
      dir.subVectors(playerTarget, pos)
      const dist = dir.length()
      dir.divideScalar(dist)
      const inBeam = dist < l.def.reach * 1.8 && dir.angleTo(l.dir) < BEAM.halfAngle
      // the operator stands right under the lamp: start the ray outside him
      l.spotted = inBeam && s.physics.raycast(pos.clone().addScaledVector(dir, 0.9), dir, dist, op?.character.collider, 'vision')?.tag?.kind === 'player'
      if (l.spotted || (op && (op.data.state === 'COMBAT' || op.data.state === 'ALERT') && l.trackTime > 0)) {
        // lock on and follow
        l.trackTime = l.spotted ? 2.5 : l.trackTime - dt
        l.dir.lerp(dir, Math.min(1, dt * 3)).normalize()
      } else {
        // at facility alert the operators sweep faster and wider
        const alarmed = s.alert.level >= 3
        l.phase += dt * BEAM.sweepSpeed * (alarmed ? 2 : 1)
        const yaw = l.yaw + Math.sin(l.phase) * l.def.sweep * (alarmed ? 1.4 : 1)
        const drop = l.def.position[1] - 0.5
        const want = new Vector3(-Math.sin(yaw) * l.def.reach, -drop, -Math.cos(yaw) * l.def.reach).normalize()
        l.dir.lerp(want, Math.min(1, dt * 1.5)).normalize()
      }
    }

    // ---- doors
    for (const d of this.doors) {
      if (d.autoClose > 0 && (d.autoClose -= dt) <= 0) {
        const c = doorCenter(d.def)
        const someoneNear = c.distanceTo(p.feet) < 2 || s.guards.some((g) => g.active && g.data.state !== 'DEAD' && c.distanceTo(g.data.position) < 2)
        if (someoneNear) d.autoClose = 1
        else d.target = 0
      }
      const before = d.open
      const next = before + Math.sign(d.target - before) * Math.min(Math.abs(d.target - before), dt * 1.4)
      if (next === before) continue
      // never sweep the leaf through a person: it stops against them instead (and they can push past)
      const angle = d.def.yaw + d.swing * easeInOut(next) * 1.6
      const blocked = this.leafHits(d, angle, p.feet, p.active) || s.guards.some((g) => g.active && g.data.state !== 'DEAD' && this.leafHits(d, angle, g.data.position, true))
      if (blocked && !this.leafHits(d, d.def.yaw + d.swing * easeInOut(before) * 1.6, p.feet, p.active)) continue
      d.open = next
      d.body.setNextKinematicRotation({ x: 0, y: Math.sin(angle / 2), z: 0, w: Math.cos(angle / 2) })
    }

    // ---- alarm timeout once things go quiet
    if (this.alarmActive) {
      const fighting = s.guards.some((g) => g.active && (g.data.state === 'COMBAT' || g.data.state === 'ALERT'))
      this.quiet = fighting ? 0 : this.quiet + dt
      if (this.quiet > ALARM_TIMEOUT) {
        this.alarmActive = false
        this.sirens.forEach((h) => h.stop())
        this.sirens = []
        s.notify('Facility alarm cleared — guards remain on alert', 'info')
        s.radio.say('enemy', 'Control', 'All units, stand down from facility alert. Remain alert and keep searching.')
      }
    }
    void t
  }

  /** Does the door leaf at `angle` touch a body standing at `feet`? */
  private leafHits(d: DoorState, angle: number, feet: Vector3, present: boolean) {
    if (!present) return false
    const hx = d.def.hinge[0], hz = d.def.hinge[2]
    const lx = Math.cos(angle), lz = -Math.sin(angle)
    const t = Math.max(0, Math.min(d.def.width, (feet.x - hx) * lx + (feet.z - hz) * lz))
    return Math.hypot(hx + lx * t - feet.x, hz + lz * t - feet.z) < 0.42 && feet.y < d.def.hinge[1] + d.def.height
  }

  dispose() {
    this.sirens.forEach((h) => h.stop())
  }
}

/** Swing sign that moves the leaf away from someone standing at `from`. Increasing angle moves the leaf towards -normal. */
function swingAway(d: DoorDef, from: Vector3): 1 | -1 {
  const side = (from.x - d.hinge[0]) * Math.sin(d.yaw) + (from.z - d.hinge[2]) * Math.cos(d.yaw)
  return side >= 0 ? 1 : -1
}

export function doorCenter(d: DoorDef) {
  return new Vector3(d.hinge[0] + Math.cos(d.yaw) * d.width / 2, 1, d.hinge[2] - Math.sin(d.yaw) * d.width / 2)
}

/** Where a guard stands to hit an alarm panel (in front of the wall it hangs on). */
export function panelStand(p: AlarmPanelDef) {
  return new Vector3(p.position[0] - Math.sin(p.yaw) * 0.7, 0, p.position[2] - Math.cos(p.yaw) * 0.7)
}

const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a))
const clampStep = (v: number, max: number) => Math.max(-max, Math.min(max, v))
const easeInOut = (x: number) => x * x * (3 - 2 * x)
