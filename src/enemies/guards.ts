import { Vector3 } from 'three'
import { findCover } from '../ai/cover'
import { AI, createGuard, KINDS, updateGuardBrain, type AIWorld, type BrainOutput, type Callout, type GuardData, type GuardKind, type Noise, type Perception } from '../ai/guardBrain'
import { computeExposure, hearing } from '../ai/perception'
import { audio, type VoiceSound } from '../audio/AudioSystem'
import type { AnimState } from '../characters/types'
import type { GameSession } from '../game/GameSession'
import type { Character, Physics } from '../physics/Physics'
import { damp, turnTowards, wrapAngle, yawTo } from '../utils/math'
import { AR_K7, P_11, VK_8 } from '../weapons/definitions'
import type { WeaponDefinition } from '../weapons/types'
import type { GuardSpawn } from '../world/types'

const HALF_STAND = 0.55
const HALF_CROUCH = 0.25
const RADIUS = 0.35
const EYE = { stand: 1.62, crouch: 1.1 }
const GRAVITY = 20
/** What each soldier type shoots: weapon (ballistics + sound), damage per hit, and spread multiplier (lower = more accurate). */
export const GUARD_GUNS: Record<GuardKind, { def: WeaponDefinition; damage: number; spread: number }> = {
  rifleman: { def: AR_K7, damage: 8, spread: 1 },
  heavy: { def: AR_K7, damage: 9, spread: 1.35 },
  sniper: { def: VK_8, damage: 42, spread: 0.18 },
  rusher: { def: P_11, damage: 6, spread: 1.2 },
}
const RADIO_RANGE = 45
const SHOUT_RANGE = 14
/** Radio range once the uplink is down. */
const LOCAL_RADIO = 20
/** Brain/perception update interval by distance to the player (0 = every frame). */
const THINK_INTERVAL = (dist: number) => (dist > 90 ? 0.3 : dist > 45 ? 0.12 : 0)
const PATH_BUDGET = 3
const BODY_SIGHT = 20
/** How quickly guards reach their target velocity (higher = snappier). */
const ACCEL = 4

export interface GuardEntity {
  data: GuardData
  character: Character
  /** Inactive guards are reinforcements waiting to spawn. */
  active: boolean
  carries?: string
  squad?: string
  leader?: boolean
  /** Throttled thinking: time since the brain last ran, and its last output (reused for movement in between). */
  thinkAcc: number
  lastOut: BrainOutput | null
  /** Loudest noise heard since the brain last ran. */
  heardBuf: { noise: Noise; loud: number } | null
  vy: number
  stuckTime: number
  /** Horizontal velocity, eased towards the brain's requested speed. */
  vel: Vector3
  muzzleTime: number
  crouched: boolean
  path: Vector3[] | null
  pathGoal: Vector3
  pathTimer: number
  /** Flags consumed by the next perception pass. */
  damaged: boolean
  underFire: boolean
  /** Time the player has been continuously visible (accuracy ramps up with it). */
  trackTime: number
  voiceCooldown: number
  bodyTimer: number
  intelTime: number
  /** Seconds left blinded/deafened by a flashbang. */
  stun: number
  /** Plate carrier (squad leaders): soaks part of torso damage until spent. */
  armor: number
  /** Running from a grenade: where to and for how long. */
  evade: { to: Vector3; time: number } | null
  anim: AnimState
  /** Which player this guard is engaging: us, or the co-op friend (host only). */
  target: 'local' | 'peer'
  /** Last perception results, for debug drawing and the HUD. */
  debug: { exposure: number; los: boolean }
}

export function createGuardEntity(physics: Physics, spawn: GuardSpawn, active = true): GuardEntity {
  const patrol = spawn.patrol.map((p) => new Vector3(...p))
  const [fx, fz] = spawn.faceTowards ?? [patrol[0].x, patrol[0].z - 1]
  const yaw = yawTo(fx - patrol[0].x, fz - patrol[0].z)
  const kind = spawn.kind ?? 'rifleman'
  // snipers see further (scoped)
  const data = createGuard(spawn.id, patrol, yaw, spawn.waitTime ?? 3, (spawn.visionRange ?? 30) * (kind === 'sniper' ? 1.5 : 1), kind)
  const character = physics.createCapsule(data.position.clone().setY(data.position.y + HALF_STAND + RADIUS), HALF_STAND, RADIUS, { kind: 'guard', id: spawn.id })
  if (!active) {
    character.collider.setEnabled(false)
    data.state = 'IDLE'
  }
  return {
    data, character, active, carries: spawn.carries, squad: spawn.squad, leader: spawn.leader, thinkAcc: Math.random() * 0.1, lastOut: null, heardBuf: null, vy: 0, vel: new Vector3(), stuckTime: 0, muzzleTime: -999, crouched: false,
    path: null, pathGoal: new Vector3(), pathTimer: 0, damaged: false, underFire: false, trackTime: 0, voiceCooldown: 0,
    bodyTimer: Math.random(), intelTime: 0, stun: 0, armor: Math.max(KINDS[kind].armor, spawn.leader ? 40 : 0), evade: null, target: 'local', debug: { exposure: 0, los: false },
    anim: { speed: 0, crouch: 0, aim: 0, sinceShot: 99, reload: -1, radio: false, turnRate: 0, lookYaw: 0, sinceHit: 99, dead: false, sinceDeath: 0, deathDir: new Vector3(0, 0, 1), yaw },
  }
}

/** Applies damage. Returns true if this killed the guard. */
export function damageGuard(s: GameSession, g: GuardEntity, amount: number, dir: Vector3, byPlayer: boolean, torso = false, from = s.player.feet): boolean {
  const d = g.data
  if (d.state === 'DEAD') return false
  // co-op friend: the host owns guard health
  if (s.coop.isClient) {
    if (byPlayer) s.coop.guardDamage(s.guards.indexOf(g), amount, dir, torso)
    return false
  }
  if (torso && g.armor > 0) {
    const soak = Math.min(g.armor, amount * 0.35)
    g.armor -= soak
    amount -= soak
  }
  d.health -= amount
  g.anim.sinceHit = 0
  g.anim.deathDir.copy(dir) // also the hit direction, for the flinch
  g.vel.multiplyScalar(0.25) // a round stops you mid-stride
  if (d.health <= 0) {
    d.state = 'DEAD'
    g.anim.dead = true
    g.anim.sinceDeath = 0
    g.character.collider.setEnabled(false)
    if (d.cover) d.cover.takenBy = null
    if (s.security.caller === d.id) s.security.caller = null
    s.stats.kills++
    s.objectives.handle({ type: 'killed', entityId: d.id })
    if (g.carries) s.dropPickup(g.carries, d.position)
    say(g, 'death', true)
    if (byPlayer) s.alert.report(from)
    // a scream carries: nearby guards come to look
    s.noises.push({ position: d.position.clone(), kind: 'voice', radius: 16 })
    return true
  }
  g.damaged = true
  say(g, 'hurt', true)
  if (byPlayer) {
    d.lastKnown = (d.lastKnown ?? new Vector3()).copy(from)
    d.memoryAge = 0
  }
  return false
}

function say(g: GuardEntity, kind: VoiceSound, force = false, radio = false) {
  if (!force && g.voiceCooldown > 0) return
  g.voiceCooldown = 2.5
  audio.voice(kind, { x: g.data.position.x, y: g.data.position.y + 1.6, z: g.data.position.z }, radio)
}

const CALLOUT_VOICE: Record<Callout, VoiceSound> = {
  suspicious: 'suspicious', contact: 'contact', lost: 'lost', reload: 'reload', reinforce: 'reinforce', body: 'body', search: 'search', clear: 'search', hurt: 'hurt',
}

const eye = new Vector3()
const target = new Vector3()
const dir = new Vector3()
const delta = new Vector3()
const wish = new Vector3()
const muzzle = new Vector3()
const look = new Vector3()

/** Brain → world adapter. */
function worldFor(s: GameSession): AIWorld {
  return {
    findCover: (g, threat, retreat) => findCover(s.coverPoints, s.physics, g.id, g.position, threat, { maxDist: retreat ? 26 : 16, retreat, exclude: s.guards.find((x) => x.data === g)?.character.collider }),
    releaseCover: (g) => {
      if (g.cover?.takenBy === g.id) g.cover.takenBy = null
    },
    // with the uplink down a radio call goes nowhere: they have to run further for a wired panel
    alarmPanel: (g) => s.security.nearestPanel(g.position, s.alert.commsDown ? 60 : 24),
    canCallAlarm: (g) => !s.security.alarmActive && (s.security.caller === null || s.security.caller === g.id) && !g.stationary
      && (!s.alert.commsDown || !!s.security.nearestPanel(g.position, 60)),
    randomPoint: (c, r) => s.nav.randomPoint(c, r),
  }
}

/** AISystem: perception, brains, movement, combat and comms for every guard. */
export function updateGuards(s: GameSession, dt: number) {
  const world = (s.aiWorld ??= worldFor(s))
  s.pathBudget = PATH_BUDGET
  for (const g of s.guards) {
    g.anim.sinceShot += dt
    g.anim.sinceHit += dt
    if (!g.active) continue
    if (g.data.state === 'DEAD') {
      g.anim.sinceDeath += dt
      continue
    }
    g.voiceCooldown -= dt
    const before = g.data.state
    listen(s, g)
    // far guards think less often; movement keeps using the last decision in between
    g.thinkAcc += dt
    let out: BrainOutput
    if (!g.lastOut || g.thinkAcc >= THINK_INTERVAL(Math.min(g.data.position.distanceTo(s.player.feet), s.coop.connected ? g.data.position.distanceTo(s.coop.other.feet) : Infinity))) {
      const step = g.thinkAcc
      g.thinkAcc = 0
      out = g.lastOut = updateGuardBrain(g.data, perceive(s, g, step), world, step)
    } else out = { ...g.lastOut, fire: false, callout: null, raiseAlarm: false }
    if (g.stun > 0) {
      // flashed: stagger in place, can't see, can't shoot straight
      g.stun -= dt
      out = { ...out, moveTo: null, fire: false, lookAt: null, lookYaw: g.data.yaw + Math.sin(s.time * 3) * 0.6, callout: null, raiseAlarm: false }
    } else {
      out = evadeGrenade(s, g, out, dt)
    }
    const now = g.data.state
    if (now === 'CALL_REINFORCEMENTS') s.security.caller = g.data.id
    else if (s.security.caller === g.data.id) s.security.caller = null
    if (out.raiseAlarm) s.security.triggerAlarm(g.data.panel ? 'alarm panel' : 'radio call', g.data.lastKnown ?? s.player.feet)
    if (out.callout) callout(s, g, out.callout)
    if (before !== now && now === 'SEARCH') say(g, 'search')
    move(s, g, out, dt)
    if (out.fire && (g.target === 'peer' ? s.coop.other.alive : s.player.alive)) shoot(s, g)
    animate(g, out, dt)
  }
}

/** A live frag nearby: drop everything and get away from it (they can see or hear it bounce). */
function evadeGrenade(s: GameSession, g: GuardEntity, out: BrainOutput, dt: number): BrainOutput {
  const d = g.data
  if (g.evade && (g.evade.time -= dt) <= 0) g.evade = null
  if (!g.evade) {
    const frag = s.grenades.fragNear(d.position)
    if (!frag || d.stationary) return out
    const away = delta.subVectors(d.position, frag).setY(0)
    if (away.lengthSq() < 0.01) away.set(Math.random() - 0.5, 0, Math.random() - 0.5)
    away.normalize()
    const to = s.nav.randomPoint(new Vector3().copy(d.position).addScaledVector(away, 7), 2.5) ?? d.position.clone().addScaledVector(away, 6)
    g.evade = { to, time: 2.2 }
    say(g, 'alert', true)
  }
  return { ...out, moveTo: g.evade.to, speed: AI.speed.retreat, crouch: false, fire: false, lookAt: null, lookYaw: null }
}

const RADIO_LINES: Partial<Record<Callout, (area: string, panel: boolean) => string>> = {
  contact: (a) => `Contact! Intruder near ${a}!`,
  body: (a) => `Man down near ${a}! We have a body!`,
  lost: (a) => `Lost him near ${a}. Spreading out to search.`,
  reinforce: (a, panel) => (panel ? `Hitting the alarm — intruder near ${a}!` : `Control, requesting backup at ${a}!`),
  clear: () => 'Nothing here. Back to my post.',
}

function callout(s: GameSession, g: GuardEntity, c: Callout) {
  const d = g.data
  const radio = c === 'reinforce' || c === 'lost' || c === 'body'
  say(g, CALLOUT_VOICE[c], c === 'contact' || c === 'body' || c === 'reinforce', radio)
  if (radio) audio.radioChatter({ x: d.position.x, y: d.position.y + 1.4, z: d.position.z }, 1.2)
  const line = RADIO_LINES[c]
  if (line && (c !== 'clear' || d.alertness > 0.5)) s.radio.say('enemy', s.squads.callsign(g), line(s.areaName(d.lastKnown ?? d.position), !!d.panel))
  if (c === 'contact' || c === 'body') {
    // radio contact report: allies in range (everyone once the alarm is up) converge on the position
    s.intel = { position: (d.lastKnown ?? d.position).clone(), time: s.time, contact: true, from: d.id }
    if (c === 'contact') s.alert.report(d.lastKnown ?? s.player.feet)
  } else if (c === 'suspicious') {
    s.noises.push({ position: d.position.clone(), kind: 'voice', radius: SHOUT_RANGE })
  }
}

function perceive(s: GameSession, g: GuardEntity, dt: number): Perception {
  const d = g.data
  const p = s.player
  eye.set(d.position.x, d.position.y + (g.crouched ? EYE.crouch : EYE.stand), d.position.z)
  p.chest(target)
  const distance = eye.distanceTo(target)
  const angle = Math.abs(wrapAngle(yawTo(target.x - eye.x, target.z - eye.z) - d.yaw))

  let los = false
  if (g.stun > 0) {
    // blinded by a flashbang
  } else if (p.alive && p.active && distance < d.visionRange * 2.2 && (angle < d.fov / 2 + 0.2 || distance < 6)) {
    los = canSee(s, g, target) || canSee(s, g, p.eye(look))
  } else if (p.alive && !p.active && s.vehicles.driving) {
    // a moving vehicle is obvious
    los = distance < 60 && canSee(s, g, s.vehicles.driving.position)
  }
  // is the player's flashlight beam pointing at this guard?
  let beam = false
  if (p.flashlight && los) {
    p.forward(look)
    dir.subVectors(eye, p.eye(muzzle)).normalize()
    beam = look.dot(dir) > 0.85
  }
  let exposure = computeExposure({
    distance, range: d.visionRange * s.environment.sightFactor, angle, fov: d.fov, hasLineOfSight: los, speed: p.active ? p.speed : 8,
    crouching: p.crouching, prone: p.prone, light: s.environment.playerLight + (p.flashlight ? 0.25 : 0), flashlightAtGuard: beam, alertness: d.alertness,
  })
  if (!p.active && los) exposure = Math.max(exposure, 0.8)
  // somebody where nobody is allowed to be stands out
  if (exposure > 0 && s.security.zoneAt(p.feet)) exposure = Math.min(1, exposure * 1.35)
  // the searchlight this guard operates has the player in its beam
  exposure = Math.max(exposure, s.security.searchlightExposure(d.id))
  // co-op: whichever player this guard sees better is the one he deals with
  let position = p.active ? p.feet : s.vehicles.driving?.position ?? p.feet
  g.target = 'local'
  const o = s.coop.other
  if (s.coop.connected && o.seen && o.alive && g.stun <= 0) {
    target.copy(o.shown).setY(o.shown.y + (o.stance === 2 ? 0.3 : o.stance === 1 ? 0.8 : 1.3))
    const dist = eye.distanceTo(target)
    const ang = Math.abs(wrapAngle(yawTo(target.x - eye.x, target.z - eye.z) - d.yaw))
    const seen = dist < d.visionRange * 2.2 && (ang < d.fov / 2 + 0.2 || dist < 6) && canSee(s, g, target)
    const ex = computeExposure({
      distance: dist, range: d.visionRange * s.environment.sightFactor, angle: ang, fov: d.fov, hasLineOfSight: seen, speed: o.speed,
      crouching: o.stance === 1, prone: o.stance === 2, light: s.environment.playerLight, flashlightAtGuard: false, alertness: d.alertness,
    })
    if (seen && (ex > exposure || !los)) {
      exposure = ex
      los = true
      position = o.shown
      g.target = 'peer'
    }
  }
  g.debug.exposure = exposure
  g.debug.los = los
  g.trackTime = los ? g.trackTime + dt : Math.max(0, g.trackTime - dt * 2)

  const heard = g.heardBuf?.noise ?? null
  g.heardBuf = null
  const underFire = g.underFire

  // radio intel from allies (base-wide during an alarm — unless the uplink is down)
  let intel: Perception['intel'] = null
  const r = s.intel
  if (r && r.time > g.intelTime && r.from !== d.id) {
    g.intelTime = r.time
    const range = s.alert.commsDown ? LOCAL_RADIO : RADIO_RANGE
    if ((s.security.alarmActive && !s.alert.commsDown) || r.position.distanceTo(d.position) < range) intel = { position: r.position, contact: r.contact }
  }

  // dead colleagues lying in view
  let body: Vector3 | null = null
  if ((g.bodyTimer -= dt) <= 0) {
    g.bodyTimer = 0.5
    for (const o of s.guards) {
      if (o === g || o.data.state !== 'DEAD' || s.bodiesFound.has(o.data.id) || o.anim.sinceDeath < 1) continue
      const bd = o.data.position.distanceTo(d.position)
      const ba = Math.abs(wrapAngle(yawTo(o.data.position.x - d.position.x, o.data.position.z - d.position.z) - d.yaw))
      if (bd > BODY_SIGHT || ba > d.fov / 2) continue
      if (s.physics.clearLine(eye, o.data.position.clone().setY(o.data.position.y + 0.3), g.character.collider)) {
        s.bodiesFound.add(o.data.id)
        body = o.data.position
        break
      }
    }
  }

  const damaged = g.damaged
  g.damaged = false
  g.underFire = false
  return { exposure, playerVisible: los, playerPosition: position, heard, intel, damaged, underFire, body }
}

/** Hearing runs every frame (noises only last one) and keeps the loudest until the brain next thinks. */
function listen(s: GameSession, g: GuardEntity) {
  const d = g.data
  if (!s.heard.length) return
  eye.set(d.position.x, d.position.y + (g.crouched ? EYE.crouch : EYE.stand), d.position.z)
  for (const n of s.heard) {
    const dist = n.position.distanceTo(d.position)
    if (dist > n.radius) continue
    if (n.kind === 'impact' && dist < 3.5) g.underFire = true
    const occluded = !s.physics.clearLine(n.position.clone().setY(n.position.y + 0.5), eye, g.character.collider)
    const l = hearing(dist, n.radius, occluded) * (n.kind === 'gunshot' ? 2 : 1)
    if (l > (g.heardBuf?.loud ?? 0)) g.heardBuf = { noise: n, loud: l }
  }
}

function canSee(s: GameSession, g: GuardEntity, point: Vector3) {
  if (s.grenades.blocksVision(eye, point)) return false
  dir.subVectors(point, eye)
  const dist = dir.length()
  dir.divideScalar(dist)
  const hit = s.physics.raycast(eye, dir, dist + 0.5, g.character.collider, 'vision')
  return hit?.tag?.kind === 'player' || hit?.tag?.kind === 'vehicle' || hit?.tag?.kind === 'peer'
}

function move(s: GameSession, g: GuardEntity, out: BrainOutput, dt: number) {
  const d = g.data
  setCrouch(s.physics, g, out.crouch)
  delta.set(0, 0, 0)
  let requested = 0
  let goal = out.moveTo
  if (goal && d.stationary) goal = null

  if (goal) {
    // follow a nav-grid path to the goal; re-plan when the goal moves or periodically
    g.pathTimer -= dt
    if ((!g.path || g.pathGoal.distanceToSquared(goal) > 2.25 || g.pathTimer <= 0) && s.pathBudget > 0) {
      s.pathBudget--
      g.path = s.nav.findPath(d.position, goal) ?? [goal.clone()]
      g.pathGoal.copy(goal)
      g.pathTimer = 2.5
    }
    while (g.path && g.path.length > 1 && Math.hypot(g.path[0].x - d.position.x, g.path[0].z - d.position.z) < 0.5) g.path.shift()
    const wp = g.path?.[0] ?? goal
    const dx = wp.x - d.position.x, dz = wp.z - d.position.z
    const dist = Math.hypot(dx, dz)
    if (dist > 0.25) {
      // ease into the target speed and slow down on arrival; no instant 0 → jog or reversals
      const want = Math.min(out.speed * (g.crouched ? 0.55 : 1), (Math.hypot(goal.x - d.position.x, goal.z - d.position.z) + 0.3) * 2)
      wish.set((dx / dist) * want, 0, (dz / dist) * want)
    } else wish.set(0, 0, 0)
    s.security.guardOpensDoors(d.position)
  } else {
    g.path = null
    wish.set(0, 0, 0)
  }
  g.vel.x = damp(g.vel.x, wish.x, ACCEL, dt)
  g.vel.z = damp(g.vel.z, wish.z, ACCEL, dt)
  delta.set(g.vel.x * dt, 0, g.vel.z * dt)
  requested = delta.length()
  if (requested < 0.0005) requested = 0

  // keep a little personal space from other guards
  for (const o of s.guards) {
    if (o === g || !o.active || o.data.state === 'DEAD') continue
    const ox = d.position.x - o.data.position.x, oz = d.position.z - o.data.position.z
    const od = Math.hypot(ox, oz)
    if (od > 0.01 && od < 1.1) delta.add({ x: (ox / od) * (1.1 - od) * dt * 2, y: 0, z: (oz / od) * (1.1 - od) * dt * 2 })
  }
  const moveYaw = requested > 0 ? yawTo(delta.x, delta.z) : null

  g.vy -= GRAVITY * dt
  delta.y = g.vy * dt
  if (s.physics.moveCharacter(g.character, delta)) g.vy = 0
  d.position.add(delta)
  const moved = Math.hypot(delta.x, delta.z)
  // blocked by a wall: lose the momentum instead of pushing into it
  if (requested > 0 && moved < requested * 0.5) g.vel.multiplyScalar(moved / requested)
  g.anim.speed = damp(g.anim.speed, moved / dt, 10, dt)

  g.stuckTime = requested > 0 && moved < requested * 0.25 ? g.stuckTime + dt : 0
  if (g.stuckTime > 1.5) {
    g.stuckTime = 0
    g.path = null
    g.pathTimer = 0
    if (d.state === 'PATROL') d.patrolIndex = (d.patrolIndex + 1) % d.patrol.length
    if (d.state === 'SEARCH') d.searchIndex = (d.searchIndex + 1) % Math.max(1, d.searchPoints.length)
  }

  const lookYaw = out.lookAt ? yawTo(out.lookAt.x - d.position.x, out.lookAt.z - d.position.z) : out.lookYaw ?? moveYaw
  const hostile = d.state === 'COMBAT' || d.state === 'ALERT' || d.state === 'RETREAT'
  const turnRate = hostile ? 3.6 : d.state === 'SUSPICIOUS' ? 2.6 : 2
  const prev = d.yaw
  if (lookYaw !== null) d.yaw = turnTowards(d.yaw, lookYaw, turnRate * dt)
  g.anim.turnRate = damp(g.anim.turnRate, wrapAngle(d.yaw - prev) / dt, 12, dt)
  // head leads the body a little when looking at something
  g.anim.lookYaw = damp(g.anim.lookYaw, lookYaw === null ? 0 : Math.max(-0.7, Math.min(0.7, wrapAngle(lookYaw - d.yaw))), 6, dt)
}

/** Co-op friend: puts a host-driven guard's collider where the host says he is. */
export function placeGuard(g: GuardEntity) {
  const half = g.crouched ? HALF_CROUCH : HALF_STAND
  if (g.character.collider.halfHeight() !== half) g.character.collider.setHalfHeight(half)
  const p = g.data.position
  g.character.body.setNextKinematicTranslation({ x: p.x, y: p.y + half + RADIUS, z: p.z })
}

function setCrouch(physics: Physics, g: GuardEntity, crouch: boolean) {
  if (crouch === g.crouched) return
  g.crouched = crouch
  const half = crouch ? HALF_CROUCH : HALF_STAND
  g.character.collider.setHalfHeight(half)
  const p = g.data.position
  g.character.body.setTranslation({ x: p.x, y: p.y + half + RADIUS, z: p.z }, true)
  void physics
}

function shoot(s: GameSession, g: GuardEntity) {
  const d = g.data
  const p = s.player
  const fy = g.crouched ? 1.05 : 1.45
  muzzle.set(d.position.x - Math.sin(d.yaw) * 0.7 + Math.cos(d.yaw) * 0.12, d.position.y + fy, d.position.z - Math.cos(d.yaw) * 0.7 - Math.sin(d.yaw) * 0.12)
  const o = s.coop.other
  if (g.target === 'peer') target.copy(o.shown).setY(o.shown.y + (o.stance === 2 ? 0.3 : o.stance === 1 ? 0.8 : 1.3))
  else if (p.active) p.chest(target)
  else target.copy(s.vehicles.driving!.position).setY(s.vehicles.driving!.position.y + 1)
  const distance = muzzle.distanceTo(target)
  // accuracy: worse at range, against movers, in the dark, right after spotting, and while being hit
  const gun = GUARD_GUNS[d.kind]
  // rushers' SMGs spray at range; snipers barely care about distance
  const rangeErr = d.kind === 'rusher' ? 0.03 : d.kind === 'sniper' ? 0.006 : 0.018
  const err = (0.22 + distance * rangeErr + Math.max(0, 1.6 - g.trackTime * 0.55) + (g.anim.sinceHit < 1 ? 0.5 : 0) + (s.environment.playerLight < 0.3 ? 0.3 : 0)) * gun.spread
    + (g.target === 'peer' ? o.speed : p.speed) * 0.1 - (p.crouching ? 0.05 : 0)
  dir.randomDirection().multiplyScalar(Math.random() * err)
  target.add(dir)
  dir.subVectors(target, muzzle).normalize()
  s.coop.guardShot(s.guards.indexOf(g), muzzle, dir)
  s.ballistics.fire(muzzle, dir, gun.def.ballistics, gun.damage, { head: 1.5, limb: 0.75 }, { kind: 'guard', id: d.id }, g.character.collider, true)
  g.muzzleTime = s.time
  g.anim.sinceShot = 0
  audio.gunshot(gun.def.sound, muzzle)
  s.effects.muzzle(muzzle, dir, 0.6)
  s.noises.push({ position: d.position.clone(), kind: 'gunshot', radius: 40 })
}

function animate(g: GuardEntity, out: BrainOutput, dt: number) {
  const a = g.anim
  const d = g.data
  a.crouch = damp(a.crouch, g.crouched ? 1 : 0, 8, dt)
  a.aim = damp(a.aim, out.aiming || d.state === 'COMBAT' ? 1 : 0, 6, dt)
  a.reload = d.reloadTimer > 0 ? 1 - d.reloadTimer / KINDS[d.kind].reload : -1
  a.radio = out.radio
  a.yaw = d.yaw
}
