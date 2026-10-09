import { Vector3 } from 'three'
import { NavGrid } from '../ai/navgrid'
import { objectivePosition } from '../missions/ObjectiveManager'
import type { MissionDef } from '../missions/types'
import type { LevelLayout } from '../world/types'

export type CheckStatus = 'ok' | 'warn' | 'fail'

export interface Check {
  id: string
  label: string
  status: CheckStatus
  detail: string
  /** World position for the map marker. */
  position: [number, number] | null
}

/** How close (horizontally) the player must be able to stand to use something. Interaction reach is 2.1 m from the eye. */
const USE_REACH = 1.8

/**
 * Level accessibility audit: every objective must be physically reachable from the insertion point, everything it
 * needs (terminal, pickup, door) must exist and be usable, and nothing may spawn inside geometry. Pure — runs in the
 * F2 overlay and in unit tests.
 */
export function validateLevel(layout: LevelLayout, mission: MissionDef, nav = new NavGrid(layout.bounds, layout.boxes)): Check[] {
  const out: Check[] = []
  const add = (id: string, label: string, status: CheckStatus, detail: string, position: [number, number] | null) => out.push({ id, label, status, detail, position })
  const start = new Vector3(...layout.playerStart)
  // the insertion point may sit outside the nav bounds (approach road): route from where the road enters them
  const navStart = nav.nearestWalkable(start.x, Math.min(start.z, layout.bounds[3] - 1), 40)
  if (!navStart) {
    add('start', 'Insertion point', 'fail', 'No walkable ground near the insertion point', [start.x, start.z])
    return out
  }
  add('start', 'Insertion point', 'ok', 'On walkable ground', [start.x, start.z])
  const reachable = nav.floodFrom(navStart)

  /** Reachable standing spot within `r` of (x, z): tries the closest walkable cells (the nearest may be a sealed pocket). */
  const reach = (x: number, z: number, r = USE_REACH): { ok: boolean; why: string } => {
    const spots: Vector3[] = []
    for (let dx = -r; dx <= r; dx += 0.5) {
      for (let dz = -r; dz <= r; dz += 0.5) {
        if (Math.hypot(dx, dz) <= r && nav.walkable(x + dx, z + dz)) spots.push(new Vector3(x + dx, 0, z + dz))
      }
    }
    if (!spots.length) return { ok: false, why: `nowhere to stand within ${r} m` }
    spots.sort((a, b) => Math.hypot(a.x - x, a.z - z) - Math.hypot(b.x - x, b.z - z))
    const spot = spots.find((p) => nav.inFlood(reachable, p.x, p.z))
    if (spot) return { ok: true, why: `path found, standing spot ${Math.hypot(spot.x - x, spot.z - z).toFixed(1)} m away` }
    return { ok: false, why: 'no path from the insertion point' }
  }

  const pickups = layout.pickups.map((p) => ({ ...p, taken: false }))
  const carried = new Set(layout.guards.map((g) => g.carries).filter(Boolean))

  for (const o of mission.objectives) {
    const tag = `${o.optional ? 'Secondary' : 'Primary'}: ${o.label}`
    if (o.kind === 'hack' || o.kind === 'disable' || o.kind === 'interact') {
      const target = layout.interactables.find((i) => i.id === o.interactId)
      if (!target) {
        add(o.id, tag, 'fail', `interactable "${o.interactId}" does not exist`, null)
        continue
      }
      const r = reach(target.position[0], target.position[2])
      add(o.id, tag, r.ok ? 'ok' : 'fail', r.why, [target.position[0], target.position[2]])
      continue
    }
    if (o.kind === 'collect') {
      const p = layout.pickups.find((x) => x.id === o.itemId)
      if (!p) {
        add(o.id, tag, carried.has(o.itemId) ? 'warn' : 'fail', carried.has(o.itemId) ? 'only dropped by a guard' : `pickup "${o.itemId}" does not exist`, null)
        continue
      }
      const r = reach(p.position[0], p.position[2], 2.2)
      add(o.id, tag, r.ok ? 'ok' : 'fail', r.why, [p.position[0], p.position[2]])
      continue
    }
    if (o.kind === 'destroy') {
      const missing = o.targets.filter((t) => !layout.cameras.some((c) => c.id === t))
      add(o.id, tag, missing.length ? 'fail' : 'ok', missing.length ? `missing targets: ${missing.join(', ')}` : `${o.targets.length} targets exist`, null)
      continue
    }
    if (o.kind === 'eliminate') {
      const g = layout.guards.find((x) => x.id === o.targetId)
      add(o.id, tag, g ? 'ok' : 'fail', g ? 'target exists' : `target "${o.targetId}" missing`, g ? [g.patrol[0][0], g.patrol[0][2]] : null)
      continue
    }
    if (o.kind === 'avoid') {
      add(o.id, tag, 'ok', 'condition objective', null)
      continue
    }
    const pos = objectivePosition(o, { layout, pickups })
    if (!pos) {
      add(o.id, tag, 'fail', 'objective has no location', null)
      continue
    }
    if (o.kind === 'enter') {
      // any walkable, reachable cell inside the rectangle
      const [x1, z1, x2, z2] = o.rect
      let ok = false
      for (let x = x1 + 0.5; x < x2 && !ok; x += 1) for (let z = z1 + 0.5; z < z2 && !ok; z += 1) if (nav.inFlood(reachable, x, z)) ok = true
      add(o.id, tag, ok ? 'ok' : 'fail', ok ? 'area reachable' : 'no reachable walkable ground inside the area', [pos[0], pos[2]])
      continue
    }
    const r = reach(pos[0], pos[2], o.kind === 'extract' || o.kind === 'reach' ? o.radius : USE_REACH)
    add(o.id, tag, r.ok ? 'ok' : 'fail', r.why, [pos[0], pos[2]])
  }

  // doors: must have a way to open, and ground on both sides
  for (const d of layout.doors) {
    const name = `Door: ${d.label ?? d.id}`
    const cx = d.hinge[0] + (Math.cos(d.yaw) * d.width) / 2, cz = d.hinge[2] - (Math.sin(d.yaw) * d.width) / 2
    const nx = Math.sin(d.yaw), nz = Math.cos(d.yaw)
    const sides = [1, -1].map((k) => nav.nearestWalkable(cx + nx * 1.2 * k, cz + nz * 1.2 * k, 1.2))
    const keyExists = !d.lockedBy || d.lockedBy === 'never' || layout.pickups.some((p) => p.id === d.lockedBy) || carried.has(d.lockedBy)
    const canOpen = !d.lockedBy || keyExists || !!d.hackTime || !!d.forceTime
    const lockdownTrap = d.lockdown && !d.hackTime && !d.forceTime
    let status: CheckStatus = 'ok'
    const notes: string[] = []
    if (!canOpen || (d.lockedBy === 'never' && !d.forceTime && !d.hackTime)) {
      status = 'fail'
      notes.push('locked with no key, hack or force option')
    }
    if (lockdownTrap) {
      status = 'fail'
      notes.push('lockdown seals it with no bypass')
    }
    if (sides.some((s) => !s)) {
      status = status === 'fail' ? 'fail' : 'warn'
      notes.push('no walkable ground on one side')
    }
    if (!notes.length) notes.push(d.lockedBy ? `locked (${keyExists ? 'key exists' : 'no key'}${d.hackTime ? ', hackable' : ''}${d.forceTime ? ', forceable' : ''})` : 'opens freely')
    add(`door-${d.id}`, name, status, notes.join('; '), [cx, cz])
  }

  // spawns inside geometry
  for (const g of layout.guards) {
    for (const p of g.patrol) {
      if (p[1] > 1) continue // tower posts stand on platforms
      if (!nav.walkable(p[0], p[2])) {
        const near = nav.nearestWalkable(p[0], p[2], 1)
        add(`guard-${g.id}`, `Guard spawn/patrol: ${g.id}`, near ? 'warn' : 'fail', `point (${p[0]}, ${p[2]}) is inside geometry${near ? ' (free space within 1 m)' : ''}`, [p[0], p[2]])
        break
      }
    }
  }
  for (const r of layout.reinforcements.sources) {
    const ok = !!nav.nearestWalkable(r.position[0], r.position[2], 1.5)
    if (!ok) add(`qrf-${r.id}`, `Reinforcement source: ${r.label}`, 'fail', 'spawns inside geometry', [r.position[0], r.position[2]])
  }
  for (const p of layout.pickups) {
    const r = reach(p.position[0], p.position[2], 2.2)
    if (!r.ok) add(`pickup-${p.id}`, `Pickup: ${p.label}`, 'fail', r.why, [p.position[0], p.position[2]])
  }
  return out
}
