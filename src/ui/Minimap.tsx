import { useEffect, useRef } from 'react'
import { Vector3 } from 'three'
import { objectiveTarget } from '../missions/ObjectiveManager'
import { doorCenter } from '../security/SecuritySystem'
import { useGameStore } from '../state/gameStore'
import { settings } from '../state/settings'
import { BAKE_SCALE, bakeLevel, drawMedkit, GUARD_COLORS } from './mapDraw'

const SIZE = 150
const PX_PER_M = 1.6
const SPOT_MEMORY = 4
const PAD = 80

const eye = new Vector3()
const chest = new Vector3()

/**
 * Heading-up minimap. Guards appear only while you can actually see them (and briefly after) or once tagged through
 * binoculars; security devices only once discovered — no omniscient radar.
 */
export function Minimap() {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const session = useGameStore.getState().session
    if (!session) return
    const baked = bakeLevel(session, PAD)
    const minX = session.layout.bounds[0] - PAD, minZ = session.layout.bounds[1] - PAD
    const areas = session.layout.areas.filter((a) => a.rect[2] - a.rect[0] <= 60)
    const ctx = ref.current!.getContext('2d')!
    const spotted = new Map<string, number>()
    const draw = () => {
      const { player, guards, physics, vehicles } = session
      const center = vehicles.driving?.position ?? player.feet
      // inactive without a vehicle = aboard the escape helicopter: follow its heading
      const heading = vehicles.driving ? Math.atan2(-vehicles.driving.forward(eye).x, -eye.z) : session.escape ? session.extraction.heliYaw : player.yaw
      // heading-up (rotating) or north-up with a rotating player arrow
      const rotate = settings().minimapRotate
      const yaw = rotate ? heading : 0
      ctx.clearRect(0, 0, SIZE, SIZE)
      ctx.save()
      ctx.translate(SIZE / 2, SIZE / 2)
      ctx.rotate(yaw)
      ctx.translate(-center.x * PX_PER_M, -center.z * PX_PER_M)
      ctx.drawImage(baked, minX * PX_PER_M, minZ * PX_PER_M, baked.width * (PX_PER_M / BAKE_SCALE), baked.height * (PX_PER_M / BAKE_SCALE))

      // line-of-sight spotting, refreshed at the minimap rate
      player.eye(eye)
      const now = session.time
      for (const g of guards) {
        if (!g.active) continue
        const d = g.data.position.distanceTo(center)
        if (d < 70) {
          chest.copy(g.data.position).setY(g.data.position.y + 1.3)
          if (d < 4 || physics.canSee(eye, chest, player.character.collider)) spotted.set(g.data.id, now)
        }
        const seen = session.recon.tagged.has(g.data.id) ? now : spotted.get(g.data.id)
        if (seen === undefined || now - seen > SPOT_MEMORY) continue
        const alpha = 1 - (now - seen) / SPOT_MEMORY
        ctx.globalAlpha = 0.35 + alpha * 0.65
        ctx.fillStyle = g.data.state === 'DEAD' ? '#5a5a52' : GUARD_COLORS[g.data.state] ?? '#d9dbcf'
        const x = g.data.position.x * PX_PER_M, y = g.data.position.z * PX_PER_M
        ctx.beginPath()
        ctx.arc(x, y, g.data.state === 'DEAD' ? 1.6 : 2.4, 0, Math.PI * 2)
        ctx.fill()
        if (g.data.state !== 'DEAD') {
          ctx.strokeStyle = ctx.fillStyle
          ctx.lineWidth = 1
          ctx.beginPath()
          ctx.moveTo(x, y)
          ctx.lineTo(x - Math.sin(g.data.yaw) * 6, y - Math.cos(g.data.yaw) * 6)
          ctx.stroke()
        }
      }
      ctx.globalAlpha = 1
      for (const c of session.security.cameras) {
        if (c.dead || !session.recon.discovered.has(c.def.id)) continue
        ctx.fillStyle = c.seeing ? '#c9503e' : 'rgba(217,219,207,0.6)'
        ctx.fillRect(c.def.position[0] * PX_PER_M - 1.5, c.def.position[2] * PX_PER_M - 1.5, 3, 3)
      }
      // doors: red = locked, amber = locked down, pale = open/unlocked
      for (const d of session.security.doors) {
        const st = session.security.doorStatus(d)
        const c = doorCenter(d.def)
        ctx.fillStyle = st === 'LOCKED' ? '#c9503e' : st === 'LOCKED_BY_ALERT' ? '#e0402e' : 'rgba(217,219,207,0.75)'
        ctx.save()
        ctx.translate(c.x * PX_PER_M, c.z * PX_PER_M)
        ctx.rotate(-d.def.yaw)
        ctx.fillRect(-d.def.width * PX_PER_M / 2, -1, d.def.width * PX_PER_M, 2)
        ctx.restore()
      }
      for (const m of session.medkits) if (!m.taken) drawMedkit(ctx, m.position.x * PX_PER_M, m.position.z * PX_PER_M, 3.5)
      for (const v of vehicles.vehicles) {
        ctx.fillStyle = 'rgba(169,191,142,0.8)'
        ctx.fillRect(v.position.x * PX_PER_M - 2, v.position.z * PX_PER_M - 3, 4, 6)
      }
      const t = objectiveTarget(session)
      ctx.restore()
      // area names, kept upright
      ctx.font = '600 9px "DIN Alternate", "Bahnschrift", sans-serif'
      ctx.textAlign = 'center'
      ctx.lineWidth = 3
      ctx.lineJoin = 'round'
      ctx.strokeStyle = 'rgba(10,12,10,0.75)'
      ctx.fillStyle = 'rgba(236,236,224,0.9)'
      const cy = Math.cos(yaw), sy = Math.sin(yaw)
      for (const a of areas) {
        const dx = (a.rect[0] + a.rect[2]) / 2 - center.x, dz = (a.rect[1] + a.rect[3]) / 2 - center.z
        const x = SIZE / 2 + (dx * cy - dz * sy) * PX_PER_M, y = SIZE / 2 + (dx * sy + dz * cy) * PX_PER_M
        if (x < 10 || x > SIZE - 10 || y < 10 || y > SIZE - 10) continue
        const label = a.label.replace(/^the /, '').toUpperCase()
        ctx.strokeText(label, x, y)
        ctx.fillText(label, x, y)
      }
      if (t) {
        // objective marker, clamped to the edge
        const dx = t[0] - center.x, dz = t[2] - center.z
        const c = Math.cos(yaw), s = Math.sin(yaw)
        let x = (dx * c - dz * s) * PX_PER_M, y = (dx * s + dz * c) * PX_PER_M
        const r = SIZE / 2 - 7
        const len = Math.hypot(x, y)
        if (len > r) {
          x *= r / len
          y *= r / len
        }
        ctx.fillStyle = '#d9a441'
        ctx.save()
        ctx.translate(SIZE / 2 + x, SIZE / 2 + y)
        ctx.rotate(Math.PI / 4)
        ctx.fillRect(-3, -3, 6, 6)
        ctx.restore()
      }
      // player
      ctx.fillStyle = '#d9dbcf'
      ctx.save()
      ctx.translate(SIZE / 2, SIZE / 2)
      ctx.rotate(rotate ? 0 : -heading)
      ctx.translate(-SIZE / 2, -SIZE / 2)
      ctx.beginPath()
      ctx.moveTo(SIZE / 2, SIZE / 2 - 6)
      ctx.lineTo(SIZE / 2 + 4, SIZE / 2 + 4)
      ctx.lineTo(SIZE / 2, SIZE / 2 + 2)
      ctx.lineTo(SIZE / 2 - 4, SIZE / 2 + 4)
      ctx.closePath()
      ctx.fill()
      ctx.restore()
      // north tick
      ctx.fillStyle = '#8d9184'
      ctx.font = '10px "DIN Alternate", "Bahnschrift", sans-serif'
      ctx.textAlign = 'center'
      ctx.fillText('N', SIZE / 2 + Math.sin(yaw) * (SIZE / 2 - 8), SIZE / 2 - Math.cos(-yaw) * (SIZE / 2 - 8) + 4)
    }
    const id = setInterval(draw, 1000 / 15)
    draw()
    return () => clearInterval(id)
  }, [])

  return <canvas ref={ref} width={SIZE} height={SIZE} className="hud-panel" style={{ width: SIZE, height: SIZE }} />
}
