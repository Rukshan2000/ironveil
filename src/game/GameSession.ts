import { Vector3, type Camera } from 'three'
import { buildCoverPoints, type CoverPoint } from '../ai/cover'
import type { AIWorld, Noise } from '../ai/guardBrain'
import { NavGrid } from '../ai/navgrid'
import { ReinforcementManager } from '../ai/ReinforcementManager'
import { SquadSystem } from '../ai/SquadSystem'
import { audio } from '../audio/AudioSystem'
import { AudioZones } from '../audio/AudioZones'
import { RadioSystem } from '../audio/RadioSystem'
import { Ballistics } from '../combat/ballistics'
import { createHitHandler } from '../combat/impacts'
import { SURFACES } from '../combat/surfaces'
import { EffectsSystem } from '../effects/EffectsSystem'
import { createGuardEntity, updateGuards, type GuardEntity } from '../enemies/guards'
import { EscapeSequence } from '../extraction/EscapeSequence'
import { markCompleted } from '../missions/registry'
import { RiverPath } from '../world/river'
import { ExtractionSystem } from '../extraction/ExtractionSystem'
import { saveCheckpoint } from '../missions/checkpoint'
import { MissionSystem } from '../missions/MissionSystem'
import { coop } from '../net/coop'
import { ObjectiveManager } from '../missions/ObjectiveManager'
import type { MissionDef } from '../missions/types'
import { initPhysics, Physics } from '../physics/Physics'
import { PLAYER, PlayerController, type DeathCause } from '../player/PlayerController'
import { ReconSystem } from '../recon/ReconSystem'
import { ALERT_LABELS, AlertSystem } from '../security/AlertSystem'
import { SecuritySystem } from '../security/SecuritySystem'
import { useGameStore, type Message, type Stats } from '../state/gameStore'
import { settings } from '../state/settings'
import { Training } from '../tutorial/Training'
import { GrenadeSystem } from '../weapons/GrenadeSystem'
import { VehicleSystem } from '../vehicles/VehicleSystem'
import { WeaponController } from '../weapons/WeaponController'
import { LOADOUT } from '../weapons/definitions'
import { Environment, type TimeOfDay } from '../world/environment'
import { Terrain } from '../world/terrain'
import type { LadderDef, LevelLayout, PickupDef } from '../world/types'
import { generateVegetation, type Vegetation } from '../world/vegetation'
import { WorldEventSystem, type WorldEventDef } from '../world/WorldEventSystem'
import { updateInteraction } from './systems/interaction'
import { updateWeapons } from './systems/weaponSystem'

let sessions = 0
const chest = new Vector3()
/** Co-op: seconds a downed player waits before coming back beside their partner. */
const COOP_RESPAWN = 15
/** Incoming damage to the player is scaled by this (firefights last long enough to react and reach a health pack). */
const DAMAGE_TAKEN = 0.55
/** Health a pack restores. */
const MEDKIT_HEAL = 50
/** Ladder climbing speed (m/s) and the step-off time at the top. */
const CLIMB_SPEED = 2.2
const STEP_OFF = 0.45
const head = new Vector3()
const look = new Vector3()
const UP = new Vector3(0, 1, 0)
const DOWN = new Vector3(0, -1, 0)
const push = new Vector3()
/** Beyond this |x| / |z| the player is outside the playable world. */
const WORLD_LIMIT = 196

/**
 * One play-through of a mission. Owns all high-frequency game state and runs the systems in order.
 * Plain TypeScript — React only reads from it.
 */
export class GameSession {
  readonly id = ++sessions
  readonly terrain: Terrain
  readonly vegetation: Vegetation
  readonly physics: Physics
  readonly environment: Environment
  /** Boat lane down the level's river (boat insertion, extraction and escape), if it has one. */
  readonly river: RiverPath | null
  readonly nav: NavGrid
  readonly coverPoints: CoverPoint[]
  readonly player: PlayerController
  readonly weapons = LOADOUT.map((d) => new WeaponController(d))
  weaponIndex = 0
  /** Weapon being switched to (current one is lowering). */
  pendingWeapon: number | null = null
  readonly grenades: GrenadeSystem
  /** Slot 5: knife in hand instead of a gun. */
  readonly knife = { equipped: false, swingAt: -99 }
  /** Working a terminal / system: `using` is set each frame E is held on one; `blend` eases the hands and camera in and out. */
  readonly terminal = { using: false, typing: false, at: new Vector3(), blend: 0, nextKey: 0 }
  readonly training: Training
  /** Bodies already searched for ammo. */
  readonly looted = new Set<string>()
  readonly guards: GuardEntity[]
  readonly objectives: ObjectiveManager
  readonly effects: EffectsSystem
  readonly ballistics: Ballistics
  readonly security: SecuritySystem
  readonly vehicles: VehicleSystem
  readonly pickups: (PickupDef & { taken: boolean })[]
  /** Health packs placed around the base (each usable once). */
  readonly medkits: { position: Vector3; taken: boolean }[]
  /** Ladder climb in progress (player moved along it, no walking). */
  climb: { ladder: LadderDef; up: boolean; t: number } | null = null
  /** The helicopter escape after extraction (door gun vs Varn gunships); the mission ends when it does. */
  escape: EscapeSequence | null = null
  /** Item ids the player carries (keycards). */
  readonly inventory = new Set<string>()
  readonly stats: Stats = { time: 0, kills: 0, alarms: 0, shots: 0, hits: 0, headshots: 0, grenades: 0 }
  /** Noises emitted this frame; guards hear them next frame. */
  noises: Noise[] = []
  heard: Noise[] = []
  /** Latest contact report shared between guards over the radio (AI intel, not the subtitled RadioSystem). */
  intel: { position: Vector3; time: number; contact: boolean; from: string } | null = null
  /** Subtitled radio net: enemy traffic (intercepted) and the handler. */
  readonly radio = new RadioSystem()
  readonly mission: MissionSystem = new MissionSystem()
  readonly alert: AlertSystem
  readonly squads: SquadSystem
  readonly reinforcements: ReinforcementManager
  readonly recon: ReconSystem
  readonly extraction: ExtractionSystem
  readonly events: WorldEventSystem
  readonly audioZones: AudioZones
  readonly bodiesFound = new Set<string>()
  aiWorld: AIWorld | null = null
  /** Co-op link (idle when playing solo). */
  readonly coop = coop
  pathBudget = 0
  time = 0
  status: 'playing' | 'dead' | 'complete' = 'playing'
  /** Why a scripted failure ended the mission (shown in the debrief instead of the death cause). */
  failReason: string | null = null
  prompt: { text: string; progress: number | null } | null = null
  /** Counts shots for the view-model recoil spring. */
  recoilImpulses = 0
  holdingBreath = false
  swayTime = 0
  /** 0..1 from near misses; shakes the view a touch and blurs aim. */
  suppression = 0
  /** 0..1 explosion camera shake. */
  shake = 0
  /** Current view FOV (degrees), computed by the game loop. */
  fov = 72
  /** Seconds the player has been stuck inside geometry. */
  private embedded = 0
  /** World direction damage last came from + when (HUD indicator). */
  readonly damageFrom = new Vector3()
  damageTime = -99
  /** Co-op: how long the local player has been down (they respawn while the partner lives). */
  downFor = 0
  private timers: { at: number; fn: () => void }[] = []
  private breathTimer = 0
  private breathIn = true

  private endAt = Infinity

  static async create(layout: LevelLayout, def: MissionDef, time: TimeOfDay, events: WorldEventDef[] = []) {
    await initPhysics()
    return new GameSession(layout, def, time, events)
  }

  private constructor(readonly layout: LevelLayout, readonly def: MissionDef, readonly timeOfDay: TimeOfDay, events: WorldEventDef[]) {
    this.terrain = new Terrain(layout)
    this.vegetation = generateVegetation(layout, this.terrain)
    this.physics = new Physics([...layout.boxes, ...this.vegetation.colliders], this.terrain)
    this.environment = new Environment(timeOfDay, layout, this.terrain, this.physics)
    this.river = layout.water ? new RiverPath(layout.water.river, layout.water.y) : null
    this.nav = new NavGrid(layout.bounds, layout.boxes)
    this.coverPoints = buildCoverPoints(layout.boxes, this.nav)
    this.pickups = layout.pickups.map((p) => ({ ...p, taken: false }))
    // each pack goes on walkable floor near its spot, on whatever surface is there (floor or table)
    this.medkits = (layout.healthPacks ?? []).map(([x, z]) => {
      const at = this.nav.nearestWalkable(x, z, 4) ?? new Vector3(x, 0, z)
      return { position: new Vector3(at.x, this.floorAt(at.x, at.z, 2.6) + 0.02, at.z), taken: false }
    })
    this.effects = new EffectsSystem(layout.smoke)
    this.ballistics = new Ballistics(this.physics, createHitHandler(this))
    this.grenades = new GrenadeSystem(this)

    const start = new Vector3(...layout.playerStart)
    start.y = this.terrain.height(start.x, start.z) + 0.05
    this.player = new PlayerController(this.physics, start, layout.playerYaw)
    this.environment.ignore = this.player.character.collider
    this.weapon.equip()

    // reaction squads are pooled up front (inactive) so nothing is allocated mid-fight
    const R = layout.reinforcements
    this.guards = [
      ...layout.guards.map((g) => createGuardEntity(this.physics, g)),
      ...R.squads.flatMap((q) => {
        const src = R.sources.find((x) => x.id === q.source)!
        return q.guards.map((g) => createGuardEntity(this.physics, { ...g, patrol: [src.position] }, false))
      }),
    ]
    this.objectives = new ObjectiveManager(def)
    this.security = new SecuritySystem(this)
    this.vehicles = new VehicleSystem(this)
    this.alert = new AlertSystem(this)
    this.squads = new SquadSystem(this)
    this.reinforcements = new ReinforcementManager(this)
    this.recon = new ReconSystem(this)
    this.extraction = new ExtractionSystem(this)
    this.events = new WorldEventSystem(this, events)
    this.training = new Training(this)
    this.aiWorld = null
    this.objectives.onCompleted = (o) => {
      audio.cue('objective')
      if (o.optional) {
        // the keycard opens the whole compound: worth a checkpoint
        if (o.kind === 'collect') this.checkpoint(o.label)
        return this.notify(`Secondary complete: ${o.label}`, 'good')
      }
      if (this.objectives.complete) return this.mission.succeed()
      this.notify(`Objective complete: ${o.label}`, 'good')
      this.mission.objectiveCompleted()
      this.checkpoint(o.label)
    }
    this.objectives.onFailed = (o) => this.notify(`Secondary failed: ${o.label}`, 'warn')
    this.alert.onChange = (level, prev) => this.onAlertChange(level, prev)
    this.mission.onEnter = (state) => {
      if (state === 'SUCCESS') {
        this.objectives.finalize()
        this.escape = new EscapeSequence(this) // the results wait until the helicopter is out
      }
    }
    this.radio.onLine = (line) => useGameStore.getState().pushRadio(line)
    audio.startAmbience(this.environment.preset.ambience, layout.ambientSources)
    this.audioZones = new AudioZones(layout.audioZones)
    coop.attach(this)
    if (import.meta.env.DEV) Object.assign(window, { __session: this })
  }

  get weapon() {
    return this.weapons[this.weaponIndex]
  }

  /** Spoken location for radio traffic: "the warehouse". */
  areaName(p: { x: number; z: number }) {
    return this.layout.areas.find((a) => p.x > a.rect[0] && p.x < a.rect[2] && p.z > a.rect[1] && p.z < a.rect[3])?.label ?? 'the facility'
  }

  /** Facility-wide reactions to security level changes (radio, door lockdown). */
  private onAlertChange(level: number, prev: number) {
    const area = this.areaName(this.alert.lastKnown)
    if (level === 2 && prev < 2) this.radio.say('enemy', 'Control', `All units, remain alert. Intruder reported near ${area}.`)
    if (level >= 3 && prev < 3) this.radio.say('handler', 'CANOPY', this.def.radio?.alarm ?? 'They\'ve sounded the alarm. Reaction teams will come from the barracks and up the south road. Keep moving.')
    if (level === 4) {
      this.security.setLockdown(true)
      this.radio.say('enemy', 'Control', this.def.radio?.lockdown ?? 'Lock down the communications building! Seal every compound gate!')
      this.notify('FULL LOCKDOWN — secure doors sealed', 'warn')
    }
    if (prev === 4 && level < 4) this.security.setLockdown(false)
    if (level === 0 && prev >= 2) this.radio.say('enemy', 'Control', 'All units, resume normal patrols.')
    if (level > prev && level >= 2) this.notify(`Security level ${level} — ${ALERT_LABELS[level as 2]}`, 'warn')
  }

  /** Ends the mission as failed for a scripted reason. */
  fail(reason: string) {
    this.failReason = reason
    this.mission.fail()
  }

  /** Saves a checkpoint after meaningful progress — never mid-firefight. */
  checkpoint(label: string, force = false) {
    if (!force && this.alert.level >= 3) return
    if (saveCheckpoint(this, label)) this.schedule(1.2, () => this.notify('CHECKPOINT REACHED', 'info'))
  }

  /** Briefing done: start the clock. The insertion point is the first checkpoint. */
  deploy() {
    this.mission.deploy()
    saveCheckpoint(this, 'Insertion')
  }

  /** View FOV for this frame: base setting, sprint kick, ADS/optic zoom, binoculars, vehicle. */
  viewFov() {
    const base = settings().fov
    if (this.vehicles.driving) return base - 7
    if (this.recon.active) return base / this.recon.zoom
    const w = this.weapon
    const ads = (w.def.adsFov * base) / 72 / w.zoom
    // leaning in to read a screen
    return base + (ads - base) * w.aim + this.player.fovKick * (1 - w.aim) - this.terminal.blend * 16
  }

  update(dt: number) {
    if (this.status !== 'playing') return
    if (this.time >= this.endAt) {
      this.status = 'complete'
      markCompleted(this.def.id)
      return
    }
    this.time += dt
    this.stats.time = this.time
    this.heard = this.noises
    this.noises = []
    this.suppression = Math.max(0, this.suppression - dt * 0.8)
    for (const t of this.timers.filter((t) => t.at <= this.time)) t.fn()
    this.timers = this.timers.filter((t) => t.at > this.time)

    const p = this.player
    this.environment.tick(dt)
    if (p.active && p.alive) {
      this.environment.update(p.chest(chest))
      const w = this.weapon
      const step = p.update(dt, { aim: w.aim, recoilRecovery: w.def.recoil.recovery, fovRatio: this.fov / settings().fov, scoped: w.def.scope })
      if (step && !this.vehicles.riding && !this.climb) this.footstep(step.gait === 'land' || step.gait === 'vault', step.intensity, step.radius)
      this.breathing(dt)
      this.ensureSafe(dt)
    }
    this.updateClimb(dt)
    if (this.escape) {
      this.escape.update(dt)
      if (this.escape.phase === 'escaped' && this.endAt === Infinity) this.endAt = this.time + 4
    }
    this.shake = Math.max(0, this.shake - dt * 1.8)
    this.grenades.update(dt)
    this.recon.update(dt)
    updateWeapons(this, dt)
    this.ballistics.update(dt, p.active ? p.eye(head) : null)
    // the co-op host runs the guards; a joined friend gets them over the network
    if (!coop.isClient) {
      updateGuards(this, dt)
      this.squads.update(dt)
      this.alert.update(dt)
      this.reinforcements.update(dt)
    }
    this.security.update(dt)
    this.vehicles.update(dt)
    updateInteraction(this, dt)
    this.extraction.update(dt)
    this.events.update(dt)
    this.radio.update(dt)
    this.training.update(dt)
    this.audioZones.update(dt, p.feet)
    this.coopDown(dt)
    // co-op: the mission only fails when both players are down
    this.mission.update(dt, { playerAlive: p.alive || (coop.connected && coop.other.alive), alertLevel: this.alert.level, extractionAvailable: this.extraction.available })
    this.effects.update(dt, (x, y, z) => this.floorAt(x, z, y), (pos, k) => audio.shellTink(pos, k), p.feet, this.environment.playerLight > 0.6)
    coop.update(dt)
    this.physics.step(dt)

    if (this.mission.state === 'FAILED') this.status = 'dead'
  }

  /** Floor height under a point for debris: the first surface below `y` (roofs, floors), else terrain. */
  floorAt(x: number, z: number, y = 1e3) {
    if (y < 1e3) {
      const hit = this.physics.raycast(head.set(x, y + 0.3, z), DOWN, 4, undefined, 'move')
      if (hit && hit.tag?.kind !== 'player' && hit.tag?.kind !== 'guard' && hit.tag?.kind !== 'peer') return hit.point.y
    }
    return this.terrain.height(x, z)
  }

  private footstep(land: boolean, intensity: number, radius: number) {
    const p = this.player
    if (land) audio.land(intensity)
    else audio.footstep(SURFACES[this.environment.surfaceAt(p.feet)].sound, intensity)
    if (radius > 0) this.noises.push({ position: p.feet.clone(), kind: 'footstep', radius })
  }

  private breathing(dt: number) {
    const p = this.player
    if (p.exertion < 0.15 && !this.holdingBreath) return
    this.breathTimer -= dt
    if (this.breathTimer > 0 || this.holdingBreath) return
    this.breathTimer = this.breathIn ? 0.55 - p.exertion * 0.25 : 0.7 - p.exertion * 0.35
    audio.breath(p.exertion, this.breathIn)
    this.breathIn = !this.breathIn
  }

  /**
   * Keeps the player inside a valid space: pushes out of anything they got embedded in (a door, a vehicle), and if
   * they end up under the terrain, outside the world or stuck for more than a second, returns them to the last safe spot.
   */
  private ensureSafe(dt: number) {
    const p = this.player
    if (p.vault) return
    const corr = this.physics.depenetrate(p.character, push)
    if (corr.lengthSq() > 0) {
      p.feet.add(corr)
      this.embedded += dt
    } else this.embedded = 0
    const under = p.feet.y < this.terrain.height(p.feet.x, p.feet.z) - 2.5
    const outside = Math.abs(p.feet.x) > WORLD_LIMIT || Math.abs(p.feet.z) > WORLD_LIMIT
    if (under || outside || this.embedded > 1) this.recoverPlayer()
  }

  /** Teleports the player back to the last position that was known to be safe. */
  recoverPlayer() {
    const p = this.player
    this.embedded = 0
    p.teleport(push.copy(p.lastSafe).setY(p.lastSafe.y + 0.05))
    this.notify('Position recovered', 'info')
  }

  damagePlayer(amount: number, dir: Vector3, cause: DeathCause = 'Eliminated', torso = false) {
    amount *= DAMAGE_TAKEN
    if (this.vehicles.driving) amount *= 0.5 // some protection from the bodywork
    this.player.damage(amount, cause, torso)
    this.player.flinch(Math.min(1.5, amount / 15))
    this.damageFrom.copy(dir).negate()
    this.damageTime = this.time
    this.suppression = Math.min(1, this.suppression + 0.5)
    audio.cue('hurt')
    useGameStore.setState({ lastDamage: performance.now() })
  }

  /**
   * Co-op: a player who goes down while the partner lives is out of the fight for COOP_RESPAWN seconds (out of any
   * vehicle, no moving or shooting), then comes back beside the partner at full health.
   */
  private coopDown(dt: number) {
    const p = this.player
    if (p.alive || !coop.connected) {
      this.downFor = 0
      return
    }
    if (this.downFor === 0) {
      if (this.vehicles.driving) this.vehicles.exit()
      this.vehicles.leaveRide()
      if (coop.other.alive) this.notify(`You're down — back in ${COOP_RESPAWN} s beside your partner`, 'warn')
    }
    this.downFor += dt
    if (this.downFor < COOP_RESPAWN || !coop.other.alive) return
    const at = coop.other.feet.clone().add({ x: 1.5, y: 0, z: 1.5 })
    at.y = this.floorAt(at.x, at.z, coop.other.feet.y + 1) + 0.05
    p.teleport(this.physics.capsuleFits(at, 0.5, 0.33) ? at : coop.other.feet.clone().setY(coop.other.feet.y + 0.05))
    p.revive()
    this.downFor = 0
    this.notify('Back in the fight', 'good')
  }

  /** Uses a health pack: +MEDKIT_HEAL health (capped), the pack is gone. */
  useMedkit(m: { position: Vector3; taken: boolean }) {
    const p = this.player
    if (m.taken || p.health >= PLAYER.maxHealth) return
    m.taken = true
    p.health = Math.min(PLAYER.maxHealth, p.health + MEDKIT_HEAL)
    audio.cue('pickup')
    this.notify(`Health pack used — health ${Math.ceil(p.health)}`, 'good')
  }

  /** Starts climbing a ladder up (from its foot) or down (from the top). */
  startClimb(ladder: LadderDef, up: boolean) {
    this.climb = { ladder, up, t: 0 }
    this.player.character.collider.setEnabled(false) // through the parapet / platform edge
    audio.cloth(0.6)
  }

  /**
   * Moves the player along the ladder: straight up (or down) the rungs, then a short step on/off the platform.
   * Looking around still works; walking, jumping and footsteps don't.
   */
  private updateClimb(dt: number) {
    const c = this.climb
    if (!c) return
    const p = this.player
    const foot = new Vector3(...c.ladder.bottom), top = new Vector3(...c.ladder.top)
    const rise = (top.y - foot.y) / CLIMB_SPEED, total = rise + STEP_OFF
    const before = c.t
    c.t = Math.min(total, c.t + dt)
    if (Math.floor(before / 0.45) !== Math.floor(c.t / 0.45)) audio.cloth(0.35) // hands and boots on the rungs
    // time along the path from the foot: rungs first, then the step onto the platform
    const u = c.up ? c.t : total - c.t
    const at = u <= rise
      ? foot.clone().setY(foot.y + (top.y - foot.y) * (u / rise))
      : foot.clone().setY(top.y).lerp(top, (u - rise) / STEP_OFF)
    p.teleport(at)
    if (c.t < total) return
    p.teleport(c.up ? top : foot)
    p.character.collider.setEnabled(true)
    this.climb = null
  }

  /** Drops an item into the world (e.g. the officer's keycard when he dies). */
  dropPickup(id: string, at: Vector3) {
    if (this.inventory.has(id)) return
    const def = this.layout.pickups.find((p) => p.id === id)
    this.pickups.push({ id, label: def?.label ?? id, position: [at.x, this.floorAt(at.x, at.z) + 0.05, at.z], taken: false })
  }

  schedule(seconds: number, fn: () => void) {
    this.timers.push({ at: this.time + seconds, fn })
  }

  /** Overridden by the vehicle system while driving. Returns true when it positioned the camera. */
  applyVehicleCamera(camera: Camera): boolean {
    return this.escape?.applyCamera(camera) || this.vehicles.applyCamera(camera)
  }

  /** Feed the audio listener from the camera. */
  updateListener(camera: Camera, dt: number) {
    camera.getWorldDirection(look)
    audio.setListener(camera.position, look, UP)
    audio.update(dt)
  }

  notify(text: string, tone: Message['tone'] = 'info') {
    useGameStore.getState().pushMessage(text, tone)
  }

  /** Spare magazines (and sometimes a grenade) off a dead guard. */
  lootBody(id: string) {
    if (this.looted.has(id)) return
    this.looted.add(id)
    const [rifle, pistol, marksman] = this.weapons
    rifle.reserve = Math.min(rifle.def.reserveAmmo * 1.5, rifle.reserve + 60)
    pistol.reserve = Math.min(pistol.def.reserveAmmo * 1.5, pistol.reserve + 15)
    const extra = Math.random() < 0.35 ? 5 : 0
    if (marksman) marksman.reserve += extra
    const nade = Math.random() < 0.3
    if (nade) this.grenades.counts.frag++
    audio.cue('pickup')
    audio.cloth(0.8)
    this.notify(`Ammo recovered${extra ? ' · marksman rounds' : ''}${nade ? ' · frag grenade' : ''}`, 'good')
  }

  dispose() {
    this.escape?.dispose()
    this.extraction.dispose()
    this.security.dispose()
    this.vehicles.dispose()
    audio.stopAll()
    this.physics.dispose()
  }
}
