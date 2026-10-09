import { Vector3 } from 'three'
import type { GameSession } from '../game/GameSession'
import type { Stats } from '../state/gameStore'
import type { TimeOfDay } from '../world/environment'
import type { ObjectiveStatus } from './ObjectiveManager'

const KEY = 'ironveil.checkpoint.v2'

/** Everything needed to resume a mission. Local only; versioned so old saves are ignored after format changes. */
export interface CheckpointData {
  version: 2
  missionId: string
  timeOfDay: TimeOfDay
  savedAt: number
  label: string
  time: number
  objectives: Record<string, ObjectiveStatus>
  destroyed: string[]
  player: { position: [number, number, number]; yaw: number; health: number; armor: number }
  weaponIndex: number
  grenades: Record<'frag' | 'smoke' | 'flash', number>
  looted: string[]
  inventory: string[]
  pickupsTaken: string[]
  weapons: { ammo: number; reserve: number }[]
  dead: string[]
  /** Where each dead guard lies: x, y, z, yaw, fall direction x/z. */
  bodies?: Record<string, number[]>
  tagged: string[]
  discovered: string[]
  cameras: string[]
  panels: string[]
  doors: string[]
  commsDown: boolean
  firedEvents: string[]
  stats: Stats
}

export function saveCheckpoint(s: GameSession, label: string): boolean {
  const p = s.player
  const data: CheckpointData = {
    version: 2,
    missionId: s.def.id,
    timeOfDay: s.timeOfDay,
    savedAt: Date.now(),
    label,
    time: s.time,
    objectives: { ...s.objectives.status },
    destroyed: [...s.objectives.destroyed],
    // the last safe spot, not wherever we are mid-vault or mid-air
    player: { position: [p.lastSafe.x, p.lastSafe.y, p.lastSafe.z], yaw: p.yaw, health: Math.max(p.health, 35), armor: p.armor },
    weaponIndex: s.weaponIndex,
    grenades: { ...s.grenades.counts },
    looted: [...s.looted],
    inventory: [...s.inventory],
    pickupsTaken: s.pickups.filter((x) => x.taken).map((x) => x.id),
    weapons: s.weapons.map((w) => ({ ammo: w.ammo, reserve: w.reserve })),
    dead: deadIds(s),
    bodies: bodies(s),
    tagged: [...s.recon.tagged],
    discovered: [...s.recon.discovered],
    cameras: s.security.cameras.filter((c) => c.dead).map((c) => c.def.id),
    panels: s.security.panels.filter((x) => x.disabled).map((x) => x.def.id),
    doors: s.security.doors.filter((d) => d.bypassed).map((d) => d.def.id),
    commsDown: s.alert.commsDown,
    firedEvents: [...s.events.fired],
    stats: { ...s.stats },
  }
  try {
    localStorage.setItem(KEY, JSON.stringify(data))
    return true
  } catch {
    return false
  }
}

const deadIds = (s: GameSession) => s.guards.filter((g) => g.data.state === 'DEAD').map((g) => g.data.id)
const bodies = (s: GameSession) => Object.fromEntries(s.guards.filter((g) => g.data.state === 'DEAD').map((g) => {
  const p = g.data.position
  return [g.data.id, [p.x, p.y, p.z, g.data.yaw, g.anim.deathDir.x, g.anim.deathDir.z]]
}))

/**
 * Before respawning: guards killed since the last checkpoint stay dead (and the kill count with them), even though
 * the player's own position/ammo roll back to the save.
 */
export function keepKills(s: GameSession) {
  const c = loadCheckpoint()
  if (!c || c.missionId !== s.def.id) return
  c.dead = [...new Set([...c.dead, ...deadIds(s)])]
  c.bodies = { ...c.bodies, ...bodies(s) }
  c.stats.kills = Math.max(c.stats.kills, s.stats.kills)
  try {
    localStorage.setItem(KEY, JSON.stringify(c))
  } catch {
    // storage unavailable: the save stays as it was
  }
}

export function loadCheckpoint(): CheckpointData | null {
  try {
    const raw = localStorage.getItem(KEY)
    const data = raw ? (JSON.parse(raw) as CheckpointData) : null
    return data?.version === 2 ? data : null
  } catch {
    return null
  }
}

export function clearCheckpoint() {
  try {
    localStorage.removeItem(KEY)
  } catch {
    // storage unavailable: nothing to clear
  }
}

/**
 * Applies a checkpoint to a freshly created session. Dead guards are laid back where they fell (older saves without
 * body positions just remove them); the alert level restarts calm — the facility has had time to settle, but stays sharper.
 */
export function applyCheckpoint(s: GameSession, c: CheckpointData) {
  s.time = c.time
  Object.assign(s.stats, c.stats)
  s.objectives.restore(c.objectives, c.destroyed)
  const pos = new Vector3(...c.player.position)
  s.player.teleport(pos)
  s.player.lastSafe.copy(pos)
  s.player.yaw = c.player.yaw
  s.player.health = c.player.health
  s.player.armor = c.player.armor
  s.weaponIndex = Math.min(c.weaponIndex, s.weapons.length - 1)
  s.weapon.equip()
  Object.assign(s.grenades.counts, c.grenades)
  for (const id of c.looted) s.looted.add(id)
  for (const id of c.inventory) s.inventory.add(id)
  for (const p of s.pickups) if (c.pickupsTaken.includes(p.id)) p.taken = true
  c.weapons.forEach((w, i) => {
    if (!s.weapons[i]) return
    s.weapons[i].ammo = w.ammo
    s.weapons[i].reserve = w.reserve
  })
  for (const g of s.guards) {
    if (c.dead.includes(g.data.id)) {
      const b = c.bodies?.[g.data.id]
      g.data.state = 'DEAD'
      g.active = !!b
      g.character.collider.setEnabled(false)
      s.bodiesFound.add(g.data.id) // old news: nobody raises the alarm over them again
      if (!b) continue
      g.data.position.set(b[0], b[1], b[2])
      g.data.yaw = g.anim.yaw = b[3]
      g.anim.deathDir.set(b[4], 0, b[5])
      g.anim.dead = true
      g.anim.sinceDeath = 1 // settles into the fallen pose within a second, then freezes
    } else if (g.active) g.data.alertness = Math.max(g.data.alertness, 0.4)
  }
  for (const id of c.tagged) s.recon.tagged.add(id)
  for (const id of c.discovered) s.recon.discovered.add(id)
  for (const cam of s.security.cameras) if (c.cameras.includes(cam.def.id)) cam.dead = true
  for (const p of s.security.panels) if (c.panels.includes(p.def.id)) p.disabled = true
  for (const d of s.security.doors) if (c.doors.includes(d.def.id)) d.bypassed = true
  s.alert.commsDown = c.commsDown
  for (const id of c.firedEvents) s.events.fired.add(id)
  // reinforcement squads that already died stay spent
  for (const q of s.reinforcements.squads) if (q.members.every((g) => c.dead.includes(g.data.id))) q.deployed = true
  s.mission.resume()
}
