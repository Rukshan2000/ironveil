import { Vector3 } from 'three'
import { wrapAngle, yawTo } from '../utils/math'
import type { CoverPoint } from './cover'

export type AIState =
  | 'IDLE' | 'PATROL' | 'SUSPICIOUS' | 'INVESTIGATE' | 'SEARCH' | 'ALERT' | 'COMBAT' | 'FLANK' | 'RETREAT' | 'CALL_REINFORCEMENTS' | 'DEAD'

export type Callout = 'suspicious' | 'contact' | 'lost' | 'reload' | 'reinforce' | 'body' | 'search' | 'clear' | 'hurt'

export interface Noise {
  position: Vector3
  kind: 'gunshot' | 'footstep' | 'impact' | 'voice' | 'vehicle' | 'door'
  radius: number
}

/** Tunables in one place. */
export const AI = {
  suspiciousAt: 0.35,
  detectRate: 1.0,
  decayRate: 0.1,
  reactionTime: 0.55,
  loseSightAfter: 7,
  searchDuration: 26,
  investigateLook: 4.5,
  magazine: 30,
  reloadTime: 2.6,
  retreatHealth: 40,
  callTime: 2.6,
  panelTime: 1.2,
  speed: { patrol: 1.45, investigate: 1.7, search: 2.4, combat: 3.6, retreat: 4.4 },
}

export interface GuardData {
  id: string
  state: AIState
  health: number
  /** Feet position. */
  position: Vector3
  yaw: number
  homeYaw: number
  patrol: Vector3[]
  patrolIndex: number
  waitTime: number
  visionRange: number
  fov: number
  /** Tower/post guards hold position. */
  stationary: boolean
  stateTime: number
  suspicion: number
  /** 0..1, rises with incidents, decays slowly — a guard who has seen trouble stays sharper. */
  alertness: number
  lastKnown: Vector3 | null
  /** Seconds since lastKnown was confirmed. */
  memoryAge: number
  lostSightTime: number
  searchPoints: Vector3[]
  searchIndex: number
  searchPause: number
  fireCooldown: number
  burstLeft: number
  ammo: number
  reloadTimer: number
  cover: CoverPoint | null
  coverAge: number
  coverRetry: number
  peeking: boolean
  peekTimer: number
  strafeDir: number
  strafeTimer: number
  retreatCooldown: number
  glanceTimer: number
  glance: number
  /** Alarm panel this guard is running to (CALL_REINFORCEMENTS). */
  panel: Vector3 | null
  callProgress: number
  /** Flanking destination ordered by the squad leader (FLANK). */
  flankPoint: Vector3 | null
  /** Squad has taken heavy losses: fall back at any health. Set by the SquadSystem. */
  broken: boolean
}

export interface Perception {
  /** Vision exposure 0..1 (see perception.ts). */
  exposure: number
  /** Raw line of sight to the player, used once the guard knows where to look. */
  playerVisible: boolean
  playerPosition: Vector3
  heard: Noise | null
  /** Position reported over the radio by an ally, if newer than ours. */
  intel: { position: Vector3; contact: boolean } | null
  /** Was hit this frame. */
  damaged: boolean
  /** A bullet passed close. */
  underFire: boolean
  /** Found a dead colleague. */
  body: Vector3 | null
}

/** World queries the brain needs (implemented by the AI system; stubbed in tests). */
export interface AIWorld {
  findCover(g: GuardData, threat: Vector3, retreat: boolean): CoverPoint | null
  releaseCover(g: GuardData): void
  /** Nearest working alarm panel within reach, if any. */
  alarmPanel(g: GuardData): Vector3 | null
  /** Someone may still call the base alarm (not already raised/being called). */
  canCallAlarm(g: GuardData): boolean
  randomPoint(c: Vector3, r: number): Vector3 | null
}

export interface BrainOutput {
  moveTo: Vector3 | null
  speed: number
  lookAt: Vector3 | null
  lookYaw: number | null
  fire: boolean
  crouch: boolean
  /** Guard has raised the weapon (aim pose). */
  aiming: boolean
  /** Using the radio (animation). */
  radio: boolean
  callout: Callout | null
  /** Finished calling it in: trigger the base alarm. */
  raiseAlarm: boolean
}

export function createGuard(id: string, patrol: Vector3[], yaw: number, waitTime: number, visionRange = 30): GuardData {
  return {
    id, state: patrol.length > 1 ? 'PATROL' : 'IDLE', health: 100,
    position: patrol[0].clone(), yaw, homeYaw: yaw, patrol, patrolIndex: patrol.length > 1 ? 1 : 0,
    waitTime, visionRange, fov: (110 * Math.PI) / 180, stationary: patrol[0].y > 1,
    stateTime: 0, suspicion: 0, alertness: 0, lastKnown: null, memoryAge: 0, lostSightTime: 0,
    searchPoints: [], searchIndex: 0, searchPause: 0, fireCooldown: 0, burstLeft: 3, ammo: AI.magazine, reloadTimer: 0,
    cover: null, coverAge: 0, coverRetry: 0, peeking: false, peekTimer: 0, strafeDir: 1, strafeTimer: 0,
    retreatCooldown: 0, glanceTimer: 3, glance: 0, panel: null, callProgress: 0, flankPoint: null, broken: false,
  }
}

function setState(g: GuardData, s: AIState) {
  g.state = s
  g.stateTime = 0
}

const flatDist = (a: Vector3, b: Vector3) => Math.hypot(a.x - b.x, a.z - b.z)
const remember = (g: GuardData, p: Vector3) => {
  g.lastKnown = (g.lastKnown ?? new Vector3()).copy(p)
  g.memoryAge = 0
}

export const hostile = (s: AIState) => s === 'ALERT' || s === 'COMBAT' || s === 'FLANK' || s === 'RETREAT' || s === 'CALL_REINFORCEMENTS'
export const calmState = (s: AIState) => s === 'IDLE' || s === 'PATROL'

/** Forces a guard into ALERT (alarm, being shot, ally contact report). Returns false if already fighting/dead. */
export function alertGuard(g: GuardData, at: Vector3): boolean {
  if (g.state === 'DEAD') return false
  remember(g, at)
  g.suspicion = 1
  g.alertness = 1
  if (hostile(g.state)) return false
  setState(g, 'ALERT')
  return true
}

/** Squad order: move to a flanking position, then fight from there. Only fighters who aren't posted can flank. */
export function orderFlank(g: GuardData, point: Vector3): boolean {
  if (g.state !== 'COMBAT' || g.stationary) return false
  g.flankPoint = point.clone()
  setState(g, 'FLANK')
  return true
}

/** Squad order: go and look around `at` without assuming contact (no alarm call unless they actually find someone). */
export function orderSearch(g: GuardData, at: Vector3, world: AIWorld, rng: () => number = Math.random): boolean {
  if (g.state === 'DEAD' || hostile(g.state)) return false
  remember(g, at)
  g.alertness = Math.max(g.alertness, 0.7)
  startSearch(g, world, rng)
  return true
}

/** Squad order: check out a point (a colleague's report). */
export function orderInvestigate(g: GuardData, at: Vector3): boolean {
  if (!calmState(g.state)) return false
  remember(g, at)
  g.suspicion = Math.max(g.suspicion, AI.suspiciousAt)
  setState(g, 'INVESTIGATE')
  return true
}

/** Advances one guard's decision making. Mutates `g`; the caller applies movement, turning, firing and callouts. */
export function updateGuardBrain(g: GuardData, p: Perception, world: AIWorld, dt: number, rng: () => number = Math.random): BrainOutput {
  const out: BrainOutput = { moveTo: null, speed: 0, lookAt: null, lookYaw: null, fire: false, crouch: false, aiming: false, radio: false, callout: null, raiseAlarm: false }
  if (g.state === 'DEAD') return out
  g.stateTime += dt
  g.memoryAge += dt
  g.alertness = Math.max(hostile(g.state) ? 1 : 0, g.alertness - dt / 240)
  g.retreatCooldown = Math.max(0, g.retreatCooldown - dt)

  // ---- perception → suspicion and memory
  const sees = p.exposure > 0
  g.suspicion = sees
    ? Math.min(1, g.suspicion + p.exposure * AI.detectRate * (1 + g.alertness) * dt)
    : Math.max(0, g.suspicion - AI.decayRate * dt)
  if (sees && g.suspicion > 0.15) remember(g, p.playerPosition)

  const calm = g.state === 'IDLE' || g.state === 'PATROL'
  const wary = calm || g.state === 'SUSPICIOUS' || g.state === 'INVESTIGATE' || g.state === 'SEARCH'
  if (wary) {
    if (g.suspicion >= 1 || (g.state === 'SEARCH' && p.exposure > 0.2) || (g.state === 'INVESTIGATE' && p.exposure > 0.45)) {
      remember(g, p.playerPosition)
      setState(g, 'ALERT')
    } else if (p.damaged || p.underFire) {
      alertGuard(g, p.playerPosition)
    } else if (p.body) {
      remember(g, p.body)
      g.alertness = 1
      out.callout = 'body'
      setState(g, 'ALERT')
    } else if (p.intel?.contact) {
      alertGuard(g, p.intel.position)
    } else if (p.heard?.kind === 'gunshot' && flatDist(g.position, p.heard.position) < p.heard.radius * 0.45) {
      alertGuard(g, p.heard.position)
    } else if (p.heard && (p.heard.kind === 'gunshot' || p.heard.kind === 'impact') && g.state !== 'SEARCH') {
      remember(g, p.heard.position)
      g.alertness = Math.max(g.alertness, 0.6)
      g.suspicion = Math.max(g.suspicion, 0.6)
      if (g.state !== 'INVESTIGATE') startSuspicious(g, out)
    } else if (calm && (g.suspicion >= AI.suspiciousAt || p.heard || p.intel)) {
      remember(g, p.heard?.position ?? p.intel?.position ?? p.playerPosition)
      g.suspicion = Math.max(g.suspicion, AI.suspiciousAt)
      startSuspicious(g, out)
    }
  }
  if (hostile(g.state) && (p.damaged || p.underFire)) remember(g, p.playerPosition)

  switch (g.state) {
    case 'IDLE': {
      // posted guards scan their sector instead of staring at one spot
      if ((g.glanceTimer -= dt) <= 0) {
        g.glanceTimer = 3 + rng() * 4
        g.glance = (rng() * 2 - 1) * 1.1
      }
      out.lookYaw = g.homeYaw + g.glance
      if (g.patrol.length > 1 && g.stateTime >= g.waitTime) setState(g, 'PATROL')
      break
    }
    case 'PATROL': {
      const target = g.patrol[g.patrolIndex]
      if (flatDist(g.position, target) < 0.5) {
        g.homeYaw = g.yaw
        g.patrolIndex = (g.patrolIndex + 1) % g.patrol.length
        setState(g, 'IDLE')
      } else {
        out.moveTo = target
        out.speed = AI.speed.patrol
      }
      break
    }
    case 'SUSPICIOUS': {
      // stop, turn and stare at what caught his attention
      out.lookAt = g.lastKnown
      out.aiming = g.stateTime > 0.8
      if (g.stateTime > 2.2) {
        if (g.suspicion > 0.1 || g.alertness > 0.5) setState(g, 'INVESTIGATE')
        else if (g.stateTime > 4) returnToPost(g, out)
      }
      break
    }
    case 'INVESTIGATE': {
      out.aiming = true
      if (g.lastKnown && !g.stationary && flatDist(g.position, g.lastKnown) > 1.2 && g.stateTime < 30) {
        out.moveTo = g.lastKnown
        out.speed = g.alertness > 0.5 ? AI.speed.search : AI.speed.investigate
        out.lookAt = g.lastKnown
        g.searchPause = 0
      } else {
        // arrived (or can't move): sweep the area
        g.searchPause += dt
        out.lookYaw = g.yaw + Math.sin(g.searchPause * 1.3) * 1.2 * dt * 2
        if (g.searchPause > AI.investigateLook) {
          out.callout = 'clear'
          returnToPost(g, out)
        }
      }
      break
    }
    case 'ALERT': {
      out.lookAt = g.lastKnown
      out.aiming = true
      if (g.stateTime <= dt + 1e-6 && !out.callout) out.callout = 'contact'
      if (g.stateTime >= AI.reactionTime * (1 - g.alertness * 0.4)) {
        g.lostSightTime = 0
        if (world.canCallAlarm(g) && !p.damaged) {
          g.panel = world.alarmPanel(g)
          g.callProgress = 0
          out.callout = 'reinforce'
          setState(g, 'CALL_REINFORCEMENTS')
        } else enterCombat(g)
      }
      break
    }
    case 'CALL_REINFORCEMENTS': {
      out.lookAt = g.lastKnown
      if (p.damaged || !world.canCallAlarm(g)) {
        enterCombat(g) // interrupted — a quick shot stops the call
        break
      }
      if (g.panel && flatDist(g.position, g.panel) > 1.1) {
        out.moveTo = g.panel
        out.speed = AI.speed.combat
        out.lookAt = g.panel
      } else {
        out.radio = !g.panel
        if (g.panel) out.lookAt = g.panel
        g.callProgress += dt / (g.panel ? AI.panelTime : AI.callTime)
        if (g.callProgress >= 1) {
          out.raiseAlarm = true
          enterCombat(g)
        }
      }
      break
    }
    case 'COMBAT':
      combat(g, p, world, out, dt, rng)
      break
    case 'FLANK': {
      out.aiming = true
      const dest = g.flankPoint
      if (p.playerVisible) remember(g, p.playerPosition)
      if (!dest || p.damaged || g.stateTime > 12 || flatDist(g.position, dest) < 1) {
        g.flankPoint = null
        enterCombat(g)
        break
      }
      out.moveTo = dest
      out.speed = AI.speed.combat
      out.lookAt = p.playerVisible ? p.playerPosition : g.lastKnown
      // shoot on the move only when the angle opens up
      if (p.playerVisible && flatDist(g.position, p.playerPosition) < 30) out.fire = updateFiring(g, p.playerPosition, dt, rng)
      break
    }
    case 'RETREAT': {
      out.aiming = true
      if (g.cover && flatDist(g.position, g.cover.pos) > 0.5 && g.stateTime < 7) {
        out.moveTo = g.cover.pos
        out.speed = AI.speed.retreat
        out.lookAt = p.playerVisible ? p.playerPosition : g.lastKnown
      } else {
        g.retreatCooldown = 15
        enterCombat(g)
      }
      break
    }
    case 'SEARCH': {
      out.aiming = true
      const target = g.searchPoints[g.searchIndex]
      if (target && flatDist(g.position, target) > 0.7 && !g.stationary) {
        out.moveTo = target
        out.speed = AI.speed.search
        g.searchPause = 0
      } else {
        g.searchPause += dt
        out.lookYaw = g.yaw + Math.sin(g.searchPause * 1.6) * 2.5 * dt
        if (g.searchPause > 2.4) {
          g.searchPause = 0
          g.searchIndex = (g.searchIndex + 1) % Math.max(1, g.searchPoints.length)
        }
      }
      if (g.stateTime > AI.searchDuration) {
        g.suspicion = 0
        g.alertness = Math.max(g.alertness, 0.6)
        out.callout = 'clear'
        returnToPost(g, out)
      }
      break
    }
  }
  return out
}

function startSuspicious(g: GuardData, out: BrainOutput) {
  out.callout = 'suspicious'
  setState(g, 'SUSPICIOUS')
}

function returnToPost(g: GuardData, _out: BrainOutput) {
  g.searchPoints = []
  setState(g, g.patrol.length > 1 ? 'PATROL' : 'IDLE')
  if (g.patrol.length === 1) g.patrolIndex = 0
}

function enterCombat(g: GuardData) {
  g.lostSightTime = 0
  g.coverRetry = 0
  setState(g, 'COMBAT')
}

function combat(g: GuardData, p: Perception, world: AIWorld, out: BrainOutput, dt: number, rng: () => number) {
  out.aiming = true
  const threat = p.playerVisible ? p.playerPosition : g.lastKnown ?? p.playerPosition
  const dist = flatDist(g.position, threat)

  // reload behind cover
  if (g.reloadTimer > 0) {
    g.reloadTimer -= dt
    if (g.reloadTimer <= 0) g.ammo = AI.magazine
  } else if (g.ammo <= 0) {
    g.reloadTimer = AI.reloadTime
    out.callout = 'reload'
  }
  const reloading = g.reloadTimer > 0

  // badly hurt and under pressure: fall back
  if ((g.health < AI.retreatHealth || g.broken) && g.retreatCooldown <= 0 && p.playerVisible && dist < 25 && !g.stationary) {
    world.releaseCover(g)
    g.cover = world.findCover(g, threat, true)
    if (g.cover) {
      g.cover.takenBy = g.id
      out.callout = 'hurt'
      setState(g, 'RETREAT')
      return
    }
    g.retreatCooldown = 6
  }

  if (p.playerVisible) {
    remember(g, p.playerPosition)
    g.lostSightTime = 0
  } else {
    g.lostSightTime += dt
    g.burstLeft = 3
  }

  // cover: (re)acquire when we have none, it's stale, or the player has flanked it
  g.coverAge += dt
  g.coverRetry -= dt
  const flanked = g.cover && !g.peeking && p.playerVisible && flatDist(g.position, g.cover.pos) < 0.8
  if (!g.stationary && (!g.cover || g.coverAge > 14 || flanked) && g.coverRetry <= 0) {
    world.releaseCover(g)
    g.cover = world.findCover(g, threat, false)
    g.coverRetry = 1.5
    g.coverAge = 0
    if (g.cover) g.cover.takenBy = g.id
  }

  out.lookAt = p.playerVisible ? p.playerPosition : g.lastKnown
  let exposed = true
  if (g.cover && !g.stationary) {
    const atCover = flatDist(g.position, g.cover.pos) < 0.6
    if (!atCover) {
      out.moveTo = g.cover.pos
      out.speed = AI.speed.combat
    } else {
      // hide → peek → hide; never stand still in the open
      g.peekTimer -= dt
      if (g.peekTimer <= 0) {
        g.peeking = !g.peeking && !reloading
        g.peekTimer = g.peeking ? 1.6 + rng() * 2 : 1.2 + rng() * 1.6
      }
      if (reloading) g.peeking = false
      exposed = g.peeking
      if (g.cover.low) out.crouch = !g.peeking
      else if (g.peeking) {
        // lean out past the edge of tall cover
        const side = new Vector3(-g.cover.normal.z, 0, g.cover.normal.x).multiplyScalar(g.strafeDir)
        out.moveTo = g.cover.pos.clone().addScaledVector(side, 0.9)
        out.speed = AI.speed.investigate
      }
    }
  } else if (!g.stationary) {
    // no cover: keep moving laterally and hold a sensible range
    if ((g.strafeTimer -= dt) <= 0) {
      g.strafeTimer = 1.2 + rng() * 1.4
      g.strafeDir = rng() < 0.5 ? -1 : 1
    }
    const to = new Vector3(threat.x - g.position.x, 0, threat.z - g.position.z).normalize()
    const side = new Vector3(-to.z, 0, to.x).multiplyScalar(g.strafeDir * 2.5)
    const advance = dist > 26 ? 3 : dist < 7 ? -3 : 0
    out.moveTo = g.position.clone().add(side).addScaledVector(to, advance)
    out.speed = advance > 0 ? AI.speed.combat : AI.speed.investigate
    out.crouch = reloading
  }

  if (p.playerVisible && exposed && !reloading) out.fire = updateFiring(g, p.playerPosition, dt, rng)

  if (!p.playerVisible && g.lostSightTime > 3 && g.lastKnown && !g.stationary) {
    // push towards where we last saw him
    out.moveTo = g.lastKnown
    out.speed = AI.speed.investigate
  }
  if (g.lostSightTime > AI.loseSightAfter) {
    world.releaseCover(g)
    g.cover = null
    out.callout = 'lost'
    startSearch(g, world, rng)
  }
}

function startSearch(g: GuardData, world: AIWorld, rng: () => number) {
  const c = g.lastKnown ?? g.position
  // the older the information, the wider the search
  const radius = 5 + Math.min(12, g.memoryAge * 0.8)
  g.searchPoints = [c.clone()]
  for (let i = 0; i < 4; i++) {
    const p = world.randomPoint(c, radius)
    if (p) g.searchPoints.push(p)
  }
  g.searchIndex = 0
  g.searchPause = 0
  g.suspicion = 0.5
  setState(g, 'SEARCH')
  void rng
}

function updateFiring(g: GuardData, target: Vector3, dt: number, rng: () => number): boolean {
  g.fireCooldown -= dt
  const facing = Math.abs(wrapAngle(yawTo(target.x - g.position.x, target.z - g.position.z) - g.yaw)) < 0.25
  if (g.fireCooldown > 0 || !facing || g.ammo <= 0) return false
  g.burstLeft--
  g.ammo--
  if (g.burstLeft > 0) {
    g.fireCooldown = 0.11 + rng() * 0.05
  } else {
    g.burstLeft = 2 + Math.floor(rng() * 3)
    g.fireCooldown = 0.9 + rng() * 1.1
  }
  return true
}
