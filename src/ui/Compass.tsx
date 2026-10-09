import { useEffect, useRef } from 'react'
import { Vector3 } from 'three'
import { objectiveTarget } from '../missions/ObjectiveManager'
import { useGameStore } from '../state/gameStore'

const W = 440
const H = 34
const SPAN = 140 // degrees visible across the strip
const tmp = new Vector3()
const LABELS: Record<number, string> = { 0: 'N', 45: 'NE', 90: 'E', 135: 'SE', 180: 'S', 225: 'SW', 270: 'W', 315: 'NW' }

/** Heading strip with an objective bearing marker. Redrawn per animation frame from session state (no React state). */
export function Compass() {
  const ref = useRef<HTMLCanvasElement>(null)
  const heading = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const ctx = ref.current!.getContext('2d')!
    const dpr = window.devicePixelRatio || 1
    ref.current!.width = W * dpr
    ref.current!.height = H * dpr
    ctx.scale(dpr, dpr)
    let raf = 0
    const draw = () => {
      raf = requestAnimationFrame(draw)
      const s = useGameStore.getState().session
      if (!s) return
      // yaw 0 looks along -Z which we call north; heading grows clockwise
      const veh = s.vehicles.driving
      const yaw = veh ? Math.atan2(-veh.forward(tmp).x, -tmp.z) : s.player.yaw
      const hdg = ((-yaw * 180) / Math.PI + 360 * 4) % 360
      ctx.clearRect(0, 0, W, H)
      const px = (deg: number) => {
        const d = ((deg - hdg + 540) % 360) - 180
        return W / 2 + (d / SPAN) * W
      }
      ctx.font = '600 11px "DIN Alternate", "Bahnschrift", "Roboto Condensed", sans-serif'
      ctx.textAlign = 'center'
      for (let deg = 0; deg < 360; deg += 5) {
        const x = px(deg)
        if (x < 0 || x > W) continue
        const fade = 1 - Math.abs(x - W / 2) / (W / 2)
        ctx.globalAlpha = 0.2 + fade * 0.8
        ctx.fillStyle = '#d9dbcf'
        const major = deg % 15 === 0
        ctx.fillRect(x - 0.5, H - (major ? 9 : 5), 1, major ? 9 : 5)
        if (LABELS[deg]) ctx.fillText(LABELS[deg], x, 12)
        else if (deg % 15 === 0) {
          ctx.fillStyle = '#8d9184'
          ctx.font = '10px "DIN Alternate", "Bahnschrift", sans-serif'
          ctx.fillText(String(deg), x, 12)
          ctx.font = '600 11px "DIN Alternate", "Bahnschrift", "Roboto Condensed", sans-serif'
        }
      }
      ctx.globalAlpha = 1
      // objective bearing
      const t = objectiveTarget(s)
      if (t) {
        const p = veh?.position ?? s.player.feet
        const bearing = ((Math.atan2(t[0] - p.x, -(t[2] - p.z)) * 180) / Math.PI + 360) % 360
        let x = px(bearing)
        const off = x < 6 || x > W - 6
        x = Math.min(W - 6, Math.max(6, x))
        ctx.fillStyle = off ? 'rgba(217,164,65,0.6)' : '#d9a441'
        ctx.beginPath()
        ctx.moveTo(x, 16)
        ctx.lineTo(x + 4, 20)
        ctx.lineTo(x, 24)
        ctx.lineTo(x - 4, 20)
        ctx.closePath()
        ctx.fill()
      }
      // centre caret
      ctx.fillStyle = '#d9dbcf'
      ctx.beginPath()
      ctx.moveTo(W / 2 - 4, H)
      ctx.lineTo(W / 2 + 4, H)
      ctx.lineTo(W / 2, H - 5)
      ctx.fill()
      heading.current!.textContent = String(Math.round(hdg) % 360).padStart(3, '0')
    }
    draw()
    return () => cancelAnimationFrame(raf)
  }, [])
  return (
    <div className="absolute left-1/2 top-3 flex -translate-x-1/2 flex-col items-center">
      <canvas ref={ref} style={{ width: W, height: H, maskImage: 'linear-gradient(90deg, transparent, black 15%, black 85%, transparent)' }} />
      <div ref={heading} className="hud-text tnum -mt-0.5 text-[11px] tracking-[0.2em] text-hud">000</div>
    </div>
  )
}
