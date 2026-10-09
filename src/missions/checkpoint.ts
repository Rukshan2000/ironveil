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
    dead: s.guards.filter((g) => g.data.state === 'DEAD').map((g) => g.data.id),
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
 * Applies a checkpoint to a freshly created session. Dead guards are removed rather than re-laid (bodies are not
 * persisted); the alert level restarts calm — the facility has had time to settle, but stays sharper.
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
      g.data.state = 'DEAD'
      g.active = false
      g.character.collider.setEnabled(false)
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
