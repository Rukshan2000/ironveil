import { useEffect, useRef } from 'react'
import { ALERT_LABELS, type AlertLevel } from '../security/AlertSystem'
import { useGameStore } from '../state/gameStore'
import { bakeLevel, drawTacticalMap } from './mapDraw'

const W = 600
const H = 538

/** Live tactical map (M). Redraws at 10 Hz straight from the session; shows only what reconnaissance has revealed. */
export function TacticalMap({ briefing = false }: { briefing?: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const session = useGameStore.getState().session
    if (!session) return
    const canvas = ref.current!
    const dpr = window.devicePixelRatio || 1
    canvas.width = W * dpr
    canvas.height = H * dpr
    const ctx = canvas.getContext('2d')!
    ctx.scale(dpr, dpr)
    const baked = bakeLevel(session.layout)
    const draw = () => drawTacticalMap(ctx, session, baked, W, H, briefing)
    draw()
    if (briefing) return
    const id = setInterval(draw, 100)
    return () => clearInterval(id)
  }, [briefing])
  return <canvas ref={ref} className="block h-auto w-full max-w-[600px]" style={{ aspectRatio: `${W} / ${H}` }} />
}

const LEGEND: [string, string][] = [
  ['◆', 'Objective (amber: current)'], ['■', 'Camera (discovered)'], ['●', 'Searchlight'], ['A', 'Alarm panel'],
  ['•', 'Tagged hostile'], ['- -', 'Restricted area'],
]

export function TacticalMapOverlay() {
  const hud = useGameStore((s) => s.hud)
  if (!hud) return null
  const level = hud.alertLevel as AlertLevel
  return (
    <div className="pointer-events-none fixed inset-0 flex items-center justify-center bg-black/55">
      <div className="panel flex max-h-[94vh] gap-5 p-5">
        <div className="w-[600px] max-w-[62vw]">
          <div className="mb-2 flex items-baseline justify-between">
            <div className="text-sm tracking-[0.35em] text-hud">TACTICAL MAP</div>
            <div className="hud-label">OP {hud.missionName} · M to close</div>
          </div>
          <TacticalMap />
        </div>
        <div className="flex w-64 flex-col gap-4 text-[12px]">
          <div>
            <div className="hud-label">Security level</div>
            <div className={`mt-1 tracking-[0.2em] ${level >= 3 ? 'text-danger' : level >= 1 ? 'text-warn' : 'text-accent'}`}>{level} · {ALERT_LABELS[level]}</div>
            {hud.commsDown && <div className="mt-1 tracking-[0.2em] text-accent">ENEMY UPLINK DOWN</div>}
          </div>
          <div>
            <div className="hud-label">Objectives</div>
            <ul className="mt-1 space-y-1">
              {hud.objectives.map((o) => (
                <li key={o.id} className={o.status === 'done' ? 'text-hud-dim line-through' : o.status === 'failed' ? 'text-danger/80 line-through' : o.current ? 'text-warn' : o.optional ? 'text-accent/90' : 'text-hud/50'}>
                  {o.optional ? '○' : '◆'} {o.label}{o.progress ? ` (${o.progress})` : ''}
                </li>
              ))}
            </ul>
          </div>
          <div>
            <div className="hud-label">Legend</div>
            {LEGEND.map(([k, v]) => <div key={v} className="flex gap-2 text-hud/70"><span className="w-5 text-hud">{k}</span>{v}</div>)}
            <div className="mt-2 text-[11px] leading-snug text-hud-dim">Use binoculars (B) to tag hostiles and spot security devices — only what you have seen appears here.</div>
          </div>
        </div>
      </div>
    </div>
  )
}
