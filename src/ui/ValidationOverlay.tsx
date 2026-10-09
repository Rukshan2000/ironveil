import { useEffect, useMemo, useRef } from 'react'
import { validateLevel, type Check } from '../debug/levelValidation'
import { useGameStore } from '../state/gameStore'
import { bakeLevel } from './mapDraw'

const COLOR = { ok: '#6fbf5a', warn: '#d9c441', fail: '#e0402e' }
const W = 420, H = 380

/**
 * F2 — level accessibility audit: every objective, door, pickup and spawn checked for a walkable route from the
 * insertion point (GREEN reachable, YELLOW warning, RED unreachable), plus live checks on the current run.
 */
export function ValidationOverlay() {
  const session = useGameStore((s) => s.session)!
  useGameStore((s) => s.hud) // re-render with the HUD tick so live checks stay current
  const checks = useMemo(() => validateLevel(session.layout, session.def, session.nav), [session])
  const baked = useMemo(() => bakeLevel(session.layout), [session])
  const p = session.player
  const onNav = session.nav.walkable(p.feet.x, p.feet.z)
  const sealed = session.security.doors.filter((d) => session.security.doorStatus(d) === 'LOCKED_BY_ALERT' && !d.def.hackTime && !d.def.forceTime)
  const live: Check[] = [
    { id: 'live-pos', label: 'Player position', status: onNav ? 'ok' : 'warn', detail: onNav ? 'on walkable ground' : 'off the nav grid (roof, vehicle or obstacle top)', position: [p.feet.x, p.feet.z] },
    { id: 'live-safe', label: 'Last safe position', status: 'ok', detail: `${p.lastSafe.x.toFixed(1)}, ${p.lastSafe.y.toFixed(1)}, ${p.lastSafe.z.toFixed(1)}`, position: [p.lastSafe.x, p.lastSafe.z] },
    { id: 'live-doors', label: 'Doors (live)', status: sealed.length ? 'fail' : 'ok', detail: sealed.length ? `sealed without bypass: ${sealed.map((d) => d.def.id).join(', ')}` : 'every locked door has a bypass', position: null },
  ]
  const all = [...checks, ...live]

  const canvas = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const ctx = canvas.current!.getContext('2d')!
    const [minX, minZ, maxX, maxZ] = session.layout.bounds
    const k = Math.min(W / (maxX - minX), H / (maxZ - minZ))
    ctx.clearRect(0, 0, W, H)
    ctx.drawImage(baked, 0, 0, (maxX - minX) * k, (maxZ - minZ) * k)
    for (const c of all) {
      if (!c.position) continue
      ctx.fillStyle = COLOR[c.status]
      ctx.beginPath()
      ctx.arc((c.position[0] - minX) * k, (c.position[1] - minZ) * k, c.id.startsWith('live') ? 3 : 4.5, 0, Math.PI * 2)
      ctx.fill()
    }
  })

  const count = (st: Check['status']) => all.filter((c) => c.status === st).length
  return (
    <div className="panel pointer-events-none fixed left-4 top-20 flex max-h-[80vh] gap-4 p-4 font-mono text-[11px]">
      <div className="w-[26rem] overflow-hidden">
        <div className="text-warn">LEVEL VALIDATION [F2] · <span style={{ color: COLOR.ok }}>{count('ok')} OK</span> · <span style={{ color: COLOR.warn }}>{count('warn')} WARN</span> · <span style={{ color: COLOR.fail }}>{count('fail')} FAIL</span></div>
        <div className="mt-2 space-y-0.5">
          {all.map((c) => (
            <div key={c.id} className="flex gap-2">
              <span className="w-10 shrink-0 font-bold" style={{ color: COLOR[c.status] }}>{c.status === 'ok' ? 'PASS' : c.status.toUpperCase()}</span>
              <span className="truncate text-hud">{c.label}</span>
              <span className="ml-auto max-w-48 shrink-0 truncate text-hud-dim">{c.detail}</span>
            </div>
          ))}
        </div>
      </div>
      <canvas ref={canvas} width={W} height={H} className="shrink-0" />
    </div>
  )
}
