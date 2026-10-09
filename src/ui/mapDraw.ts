import { Vector3 } from 'three'
import type { GameSession } from '../game/GameSession'
import { objectivePosition } from '../missions/ObjectiveManager'
import type { LevelLayout } from '../world/types'

const SOLID = new Set(['concrete', 'concreteDark', 'plaster', 'blocks', 'corrugated', 'container', 'crate', 'metal', 'paintedMetal', 'rock', 'wood', 'sandbag', 'rust'])
export const BAKE_SCALE = 4
const tmpV = new Vector3()

export const GUARD_COLORS: Record<string, string> = {
  SUSPICIOUS: '#d9c441', INVESTIGATE: '#d9a441', SEARCH: '#d98a41', ALERT: '#c9503e', COMBAT: '#c9503e', FLANK: '#c9503e',
  RETREAT: '#c9503e', CALL_REINFORCEMENTS: '#c9503e',
}

/** Static map layer (ground-level footprints, roads, fences, restricted zones, LZ), baked once per level. */
export function bakeLevel(layout: LevelLayout) {
  const [minX, minZ, maxX, maxZ] = layout.bounds
  const c = document.createElement('canvas')
  c.width = (maxX - minX) * BAKE_SCALE
  c.height = (maxZ - minZ) * BAKE_SCALE
  const ctx = c.getContext('2d')!
  ctx.scale(BAKE_SCALE, BAKE_SCALE)
  ctx.translate(-minX, -minZ)
  ctx.fillStyle = 'rgba(30,34,28,0.55)'
  ctx.fillRect(minX, minZ, maxX - minX, maxZ - minZ)
  for (const r of layout.roads) {
    ctx.fillStyle = 'rgba(160,160,145,0.16)'
    ctx.fillRect(r[0], r[1], r[2] - r[0], r[3] - r[1])
  }
  for (const b of layout.boxes) {
    if (b.p[1] - b.s[1] / 2 > 2.5) continue
    if (b.mat === 'fence') ctx.fillStyle = 'rgba(217,219,207,0.3)'
    else if (SOLID.has(b.mat) && b.collide !== false) ctx.fillStyle = 'rgba(217,219,207,0.5)'
    else continue
    ctx.save()
    ctx.translate(b.p[0], b.p[2])
    ctx.rotate(-(b.yaw ?? 0))
    const w = b.s[0], d = b.shape === 'cyl' ? b.s[0] : b.s[2]
    ctx.fillRect(-w / 2, -d / 2, Math.max(w, 0.25), Math.max(d, 0.25))
    ctx.restore()
  }
  for (const z of layout.restrictedZones) {
    ctx.strokeStyle = 'rgba(201,80,62,0.55)'
    ctx.setLineDash([1.5, 1.5])
    ctx.lineWidth = 0.4
    ctx.strokeRect(z.rect[0], z.rect[1], z.rect[2] - z.rect[0], z.rect[3] - z.rect[1])
  }
  ctx.setLineDash([])
  const [ex, , ez] = layout.extraction.position
  ctx.strokeStyle = '#d9a441'
  ctx.lineWidth = 0.6
  ctx.beginPath()
  ctx.arc(ex, ez, layout.extraction.radius, 0, Math.PI * 2)
  ctx.stroke()
  return c
}

const FONT = '"DIN Alternate", "Bahnschrift", "Roboto Condensed", sans-serif'

/**
 * Full tactical map, north up. Shows only what the player knows: discovered security devices, tagged guards and the
 * objectives. In briefing mode it shows the insertion point and planned approach routes instead of live data.
 */
export function drawTacticalMap(ctx: CanvasRenderingContext2D, s: GameSession, baked: HTMLCanvasElement, w: number, h: number, briefing: boolean) {
  const L = s.layout
  const [minX, minZ, maxX, maxZ] = L.bounds
  const k = Math.min(w / (maxX - minX), h / (maxZ - minZ))
  const ox = (w - (maxX - minX) * k) / 2, oz = (h - (maxZ - minZ) * k) / 2
  const X = (x: number) => ox + (x - minX) * k
  const Z = (z: number) => oz + (z - minZ) * k

  ctx.clearRect(0, 0, w, h)
  ctx.drawImage(baked, ox, oz, (maxX - minX) * k, (maxZ - minZ) * k)
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'

  // area names
  ctx.font = `600 ${Math.max(9, k * 3.2)}px ${FONT}`
  ctx.fillStyle = 'rgba(217,219,207,0.42)'
  for (const a of L.areas) {
    const cx = Math.max(minX + 10, Math.min(maxX - 10, (a.rect[0] + a.rect[2]) / 2))
    const cz = Math.max(minZ + 4, Math.min(maxZ - 4, (a.rect[1] + a.rect[3]) / 2))
    if (a.rect[2] - a.rect[0] > 60) continue // big outer regions would clutter
    // areas nested inside another (comms building in the compound) would overprint it
    if (L.areas.some((b) => b !== a && b.rect[0] <= a.rect[0] && b.rect[1] <= a.rect[1] && b.rect[2] >= a.rect[2] && b.rect[3] >= a.rect[3])) continue
    ctx.fillText(a.label.replace(/^the /, '').toUpperCase(), X(cx), Z(cz))
  }

  // objectives
  const m = s.objectives
  const cur = m.current
  for (const o of s.def.objectives) {
    if (m.status[o.id] === 'done' || m.status[o.id] === 'failed') continue
    const pos = objectivePosition(o, s)
    if (!pos) continue
    const primary = !o.optional
    const r = primary ? 6 : 4.5
    ctx.save()
    ctx.translate(X(pos[0]), Z(pos[2]))
    ctx.rotate(Math.PI / 4)
    ctx.strokeStyle = o === cur ? '#d9a441' : primary ? 'rgba(217,164,65,0.55)' : 'rgba(169,191,142,0.85)'
    ctx.lineWidth = o === cur ? 2 : 1.3
    ctx.strokeRect(-r, -r, r * 2, r * 2)
    if (o === cur) {
      ctx.fillStyle = 'rgba(217,164,65,0.35)'
      ctx.fillRect(-r, -r, r * 2, r * 2)
    }
    ctx.restore()
    if (primary) {
      ctx.fillStyle = '#d9a441'
      ctx.font = `600 11px ${FONT}`
      ctx.fillText(String(s.def.objectives.filter((x) => !x.optional).indexOf(o) + 1), X(pos[0]), Z(pos[2]) - 13)
    }
  }

  if (briefing) {
    // planned approaches and the insertion point
    const colors = ['#a9bf8e', '#8fb8c9', '#c98f8f', '#c9b88f']
    s.def.approaches?.forEach((a, i) => {
      if (!a.path?.length) return
      ctx.strokeStyle = colors[i % colors.length]
      ctx.setLineDash([5, 4])
      ctx.lineWidth = 1.5
      ctx.beginPath()
      a.path.forEach(([x, z], j) => (j ? ctx.lineTo(X(x), Z(z)) : ctx.moveTo(X(x), Z(z))))
      ctx.stroke()
      ctx.setLineDash([])
      const [lx, lz] = a.path[a.path.length - 1]
      ctx.fillStyle = colors[i % colors.length]
      ctx.font = `600 11px ${FONT}`
      ctx.fillText(a.name.split(' ')[0], X(lx) + 10, Z(lz) - 8)
    })
    const [px, , pz] = L.playerStart
    ctx.fillStyle = '#d9dbcf'
    ctx.beginPath()
    ctx.arc(X(px), Z(pz), 4, 0, Math.PI * 2)
    ctx.fill()
    ctx.font = `600 10px ${FONT}`
    ctx.fillText('INSERTION', X(px), Z(pz) + 12)
    return
  }

  // discovered security devices
  const known = s.recon.discovered
  for (const c of s.security.cameras) {
    if (!known.has(c.def.id)) continue
    const x = X(c.def.position[0]), z = Z(c.def.position[2])
    if (!c.dead) {
      // camera's current view wedge
      ctx.fillStyle = c.seeing ? 'rgba(201,80,62,0.28)' : 'rgba(217,219,207,0.12)'
      ctx.beginPath()
      ctx.moveTo(x, z)
      const r = c.def.range * k
      ctx.arc(x, z, r, -Math.PI / 2 - c.yaw - 0.48, -Math.PI / 2 - c.yaw + 0.48)
      ctx.closePath()
      ctx.fill()
    }
    ctx.fillStyle = c.dead ? '#5a5a52' : c.seeing ? '#c9503e' : '#d9dbcf'
    ctx.fillRect(x - 3, z - 3, 6, 6)
  }
  for (const l of s.security.searchlights) {
    if (!known.has(l.def.id)) continue
    const x = X(l.def.position[0]), z = Z(l.def.position[2])
    if (l.on) {
      ctx.strokeStyle = 'rgba(255,230,160,0.45)'
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.moveTo(x, z)
      ctx.lineTo(x + l.dir.x * l.def.reach * k, z + l.dir.z * l.def.reach * k)
      ctx.stroke()
    }
    ctx.fillStyle = l.on ? '#ffe6a0' : '#5a5a52'
    ctx.beginPath()
    ctx.arc(x, z, 3.5, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.font = `700 9px ${FONT}`
  for (const p of s.security.panels) {
    if (!known.has(p.def.id)) continue
    const x = X(p.def.position[0]), z = Z(p.def.position[2])
    ctx.fillStyle = p.disabled ? '#5a5a52' : '#c9503e'
    ctx.fillRect(x - 4, z - 4, 8, 8)
    ctx.fillStyle = '#0b0e12'
    ctx.fillText('A', x, z + 0.5)
  }

  // vehicles
  for (const v of s.vehicles.vehicles) {
    if (v.position.z > maxZ) continue
    ctx.save()
    ctx.translate(X(v.position.x), Z(v.position.z))
    ctx.rotate(-Math.atan2(-v.forward(tmpV).x, -tmpV.z))
    ctx.fillStyle = 'rgba(169,191,142,0.8)'
    const len = v.def.model === 'truck' ? 7 : 4
    ctx.fillRect(-1.2 * k, (-len / 2) * k, 2.4 * k, len * k)
    ctx.restore()
  }

  // tagged guards (live), with facing
  for (const g of s.guards) {
    if (!g.active || !s.recon.tagged.has(g.data.id)) continue
    const d = g.data
    const x = X(d.position.x), z = Z(d.position.z)
    const dead = d.state === 'DEAD'
    ctx.fillStyle = dead ? '#5a5a52' : GUARD_COLORS[d.state] ?? '#e8e2c8'
    ctx.beginPath()
    ctx.arc(x, z, dead ? 2.5 : 4, 0, Math.PI * 2)
    ctx.fill()
    if (!dead) {
      ctx.strokeStyle = ctx.fillStyle
      ctx.lineWidth = 1.5
      ctx.beginPath()
      ctx.moveTo(x, z)
      ctx.lineTo(x - Math.sin(d.yaw) * 10, z - Math.cos(d.yaw) * 10)
      ctx.stroke()
    }
  }

  // extraction marker
  const [ex, , ez] = L.extraction.position
  ctx.fillStyle = s.extraction.available ? '#d9a441' : 'rgba(217,164,65,0.5)'
  ctx.font = `600 10px ${FONT}`
  ctx.fillText('LZ', X(ex), Z(ez))

  // player
  const p = s.vehicles.driving?.position ?? s.player.feet
  const yaw = s.player.yaw
  ctx.save()
  ctx.translate(X(p.x), Z(p.z))
  ctx.rotate(-yaw)
  ctx.fillStyle = '#ffffff'
  ctx.beginPath()
  ctx.moveTo(0, -8)
  ctx.lineTo(5, 5)
  ctx.lineTo(0, 2)
  ctx.lineTo(-5, 5)
  ctx.closePath()
  ctx.fill()
  ctx.restore()
}
