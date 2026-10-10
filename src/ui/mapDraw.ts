import { Vector3 } from 'three'
import type { GameSession } from '../game/GameSession'
import { objectivePosition } from '../missions/ObjectiveManager'
import type { BoxDef } from '../world/types'

const WALLS = new Set(['concrete', 'concreteDark', 'plaster', 'blocks', 'corrugated'])
export const BAKE_SCALE = 4
const tmpV = new Vector3()

export const GUARD_COLORS: Record<string, string> = {
  SUSPICIOUS: '#d9c441', INVESTIGATE: '#d9a441', SEARCH: '#d98a41', ALERT: '#c9503e', COMBAT: '#c9503e', FLANK: '#c9503e',
  RETREAT: '#c9503e', CALL_REINFORCEMENTS: '#c9503e',
}

/** Top-down colour per ground-level material; null = not drawn. */
function matColor(b: BoxDef): string | null {
  const tint = b.color !== undefined ? `#${b.color.toString(16).padStart(6, '0')}` : null
  switch (b.mat) {
    case 'container': return tint ?? '#7a4a32'
    case 'crate': case 'wood': return '#8a6a44'
    case 'sandbag': return '#a8956a'
    case 'rock': return '#7d7b74'
    case 'metal': case 'paintedMetal': case 'rust': return tint ?? '#7f837c'
    case 'foliage': return '#2f4a2a'
    default: return WALLS.has(b.mat) ? '#e2e0d4' : null
  }
}

/**
 * Static map layer baked once per level, styled like an annotated satellite photo: hill-shaded grass/gravel terrain,
 * asphalt roads, tree canopies, building floors with bright walls, coloured props, a 25 m grid, restricted zones and LZ.
 */
export function bakeLevel(s: Pick<GameSession, 'layout' | 'terrain' | 'vegetation'>, pad = 0) {
  const { layout, terrain, vegetation } = s
  // pad extends the terrain past the bounds so the minimap has no blank edge; the image origin is (minX, minZ)
  const minX = layout.bounds[0] - pad, minZ = layout.bounds[1] - pad, maxX = layout.bounds[2] + pad, maxZ = layout.bounds[3] + pad
  const W = maxX - minX, H = maxZ - minZ
  const c = document.createElement('canvas')
  c.width = W * BAKE_SCALE
  c.height = H * BAKE_SCALE
  const ctx = c.getContext('2d')!

  // terrain at 1 px/m: grass vs gravel blend, lit from the north-west
  const ground = document.createElement('canvas')
  ground.width = W
  ground.height = H
  const gctx = ground.getContext('2d')!
  const img = gctx.createImageData(W, H)
  for (let j = 0; j < H; j++) {
    for (let i = 0; i < W; i++) {
      const x = minX + i + 0.5, z = minZ + j + 0.5
      const w = terrain.wildness(x, z)
      const h = terrain.height(x, z)
      const shade = Math.max(0.6, Math.min(1.35, 1 + ((h - terrain.height(x + 1, z + 1)) * 0.35))) * (h < -0.3 ? 0.8 : 1)
      const o = (j * W + i) * 4
      img.data[o] = (118 + (70 - 118) * w) * shade
      img.data[o + 1] = (110 + (90 - 110) * w) * shade
      img.data[o + 2] = (92 + (56 - 92) * w) * shade
      img.data[o + 3] = 255
    }
  }
  gctx.putImageData(img, 0, 0)
  ctx.imageSmoothingEnabled = true
  ctx.drawImage(ground, 0, 0, c.width, c.height)

  ctx.scale(BAKE_SCALE, BAKE_SCALE)
  ctx.translate(-minX, -minZ)

  // 25 m reference grid
  ctx.strokeStyle = 'rgba(255,255,255,0.06)'
  ctx.lineWidth = 0.25
  ctx.beginPath()
  for (let x = Math.ceil(minX / 25) * 25; x < maxX; x += 25) { ctx.moveTo(x, minZ); ctx.lineTo(x, maxZ) }
  for (let z = Math.ceil(minZ / 25) * 25; z < maxZ; z += 25) { ctx.moveTo(minX, z); ctx.lineTo(maxX, z) }
  ctx.stroke()

  // roads: asphalt with pale edges and a dashed centre line on long stretches
  for (const r of layout.roads) {
    ctx.fillStyle = '#45463f'
    ctx.fillRect(r[0], r[1], r[2] - r[0], r[3] - r[1])
    ctx.strokeStyle = 'rgba(200,198,180,0.35)'
    ctx.lineWidth = 0.3
    ctx.strokeRect(r[0], r[1], r[2] - r[0], r[3] - r[1])
    const along = r[2] - r[0] < r[3] - r[1]
    if (Math.max(r[2] - r[0], r[3] - r[1]) > 30) {
      ctx.strokeStyle = 'rgba(220,200,120,0.35)'
      ctx.setLineDash([2, 2])
      ctx.beginPath()
      if (along) { ctx.moveTo((r[0] + r[2]) / 2, r[1]); ctx.lineTo((r[0] + r[2]) / 2, r[3]) }
      else { ctx.moveTo(r[0], (r[1] + r[3]) / 2); ctx.lineTo(r[2], (r[1] + r[3]) / 2) }
      ctx.stroke()
      ctx.setLineDash([])
    }
  }

  // vegetation canopies, with a soft south-east shadow
  const canopy = (plants: { x: number; z: number; scale: number }[][], r: number, color: string) => {
    for (const [off, fill] of [[0.6, 'rgba(0,0,0,0.25)'], [0, color]] as const) {
      ctx.fillStyle = fill
      ctx.beginPath()
      for (const chunk of plants) for (const p of chunk) {
        const rad = r * p.scale
        ctx.moveTo(p.x + off + rad, p.z + off)
        ctx.arc(p.x + off, p.z + off, rad, 0, Math.PI * 2)
      }
      ctx.fill()
    }
  }
  canopy(vegetation.bushes, 0.9, '#3e5a30')
  canopy(vegetation.trees, 2.2, '#2c4426')

  // building floors, then ground-level structure on top
  ctx.fillStyle = 'rgba(58,60,56,0.92)'
  for (const r of layout.interiors) ctx.fillRect(r.min[0], r.min[2], r.max[0] - r.min[0], r.max[2] - r.min[2])
  for (const b of layout.boxes) {
    if (b.hidden || b.p[1] - b.s[1] / 2 > 2.5) continue
    ctx.save()
    ctx.translate(b.p[0], b.p[2])
    ctx.rotate(-(b.yaw ?? 0))
    const w = b.s[0], d = b.shape === 'cyl' ? b.s[0] : b.s[2]
    if (b.mat === 'fence') {
      ctx.fillStyle = 'rgba(217,219,207,0.45)'
      ctx.fillRect(-w / 2, -d / 2, Math.max(w, 0.2), Math.max(d, 0.2))
    } else {
      const col = matColor(b)
      if (!col || (b.collide === false && b.mat !== 'foliage')) { ctx.restore(); continue }
      ctx.fillStyle = col
      if (b.shape === 'cyl') {
        ctx.beginPath()
        ctx.arc(0, 0, Math.max(w / 2, 0.2), 0, Math.PI * 2)
        ctx.fill()
      } else ctx.fillRect(-w / 2, -d / 2, Math.max(w, 0.3), Math.max(d, 0.3))
    }
    ctx.restore()
  }

  for (const z of layout.restrictedZones) {
    ctx.fillStyle = 'rgba(201,80,62,0.08)'
    ctx.fillRect(z.rect[0], z.rect[1], z.rect[2] - z.rect[0], z.rect[3] - z.rect[1])
    ctx.strokeStyle = 'rgba(224,90,70,0.8)'
    ctx.setLineDash([1.5, 1.5])
    ctx.lineWidth = 0.4
    ctx.strokeRect(z.rect[0], z.rect[1], z.rect[2] - z.rect[0], z.rect[3] - z.rect[1])
  }
  ctx.setLineDash([])
  const [ex, , ez] = layout.extraction.position
  ctx.fillStyle = 'rgba(217,164,65,0.15)'
  ctx.strokeStyle = '#d9a441'
  ctx.lineWidth = 0.6
  ctx.beginPath()
  ctx.arc(ex, ez, layout.extraction.radius, 0, Math.PI * 2)
  ctx.fill()
  ctx.stroke()
  return c
}

/** Health pack icon: green square with a white cross, centred on (x, y), `r` px half-size. */
export function drawMedkit(ctx: CanvasRenderingContext2D, x: number, y: number, r: number) {
  ctx.fillStyle = '#2f8a46'
  ctx.fillRect(x - r, y - r, r * 2, r * 2)
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(x - r * 0.65, y - r * 0.2, r * 1.3, r * 0.4)
  ctx.fillRect(x - r * 0.2, y - r * 0.65, r * 0.4, r * 1.3)
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
  ctx.fillStyle = 'rgba(236,236,224,0.85)'
  ctx.strokeStyle = 'rgba(10,12,10,0.7)'
  ctx.lineWidth = 3
  ctx.lineJoin = 'round'
  for (const a of L.areas) {
    const cx = Math.max(minX + 10, Math.min(maxX - 10, (a.rect[0] + a.rect[2]) / 2))
    const cz = Math.max(minZ + 4, Math.min(maxZ - 4, (a.rect[1] + a.rect[3]) / 2))
    if (a.rect[2] - a.rect[0] > 60) continue // big outer regions would clutter
    // areas nested inside another (comms building in the compound) would overprint it
    if (L.areas.some((b) => b !== a && b.rect[0] <= a.rect[0] && b.rect[1] <= a.rect[1] && b.rect[2] >= a.rect[2] && b.rect[3] >= a.rect[3])) continue
    const label = a.label.replace(/^the /, '').toUpperCase()
    ctx.strokeText(label, X(cx), Z(cz))
    ctx.fillText(label, X(cx), Z(cz))
  }

  // scale bar (50 m) and north arrow
  const bar = 50 * k
  ctx.fillStyle = 'rgba(10,12,10,0.6)'
  ctx.fillRect(8, h - 26, bar + 16, 20)
  ctx.strokeStyle = '#e2e0d4'
  ctx.lineWidth = 1.5
  ctx.beginPath()
  ctx.moveTo(16, h - 14); ctx.lineTo(16, h - 10); ctx.lineTo(16 + bar, h - 10); ctx.lineTo(16 + bar, h - 14)
  ctx.stroke()
  ctx.fillStyle = '#e2e0d4'
  ctx.font = `600 9px ${FONT}`
  ctx.fillText('50 m', 16 + bar / 2, h - 18)
  ctx.beginPath()
  ctx.moveTo(w - 18, 10); ctx.lineTo(w - 12, 26); ctx.lineTo(w - 18, 22); ctx.lineTo(w - 24, 26)
  ctx.closePath()
  ctx.fill()
  ctx.fillText('N', w - 18, 34)

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

  // health packs still in the base (on the planning map too)
  for (const m of s.medkits) if (!m.taken) drawMedkit(ctx, X(m.position.x), Z(m.position.z), 5)

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
