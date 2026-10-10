import { useEffect, useState } from 'react'
import { BUDDY_NAME } from '../ai/BuddyBot'
import { bindingLabel } from '../state/settings'
import { useGameStore } from '../state/gameStore'

/** HUD for the helicopter escape: door-gun crosshair and hit marker, hull bar, gunships left and the phase banner. */
export function EscapeOverlay() {
  const session = useGameStore((s) => s.session)
  const buddy = useGameStore((s) => s.buddyActive)
  const [, tick] = useState(0)
  useEffect(() => {
    let raf = 0
    const loop = () => {
      tick((n) => n + 1)
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [])
  const e = session?.escape
  if (!e) return null
  const hit = e.t - e.hitAt < 0.12
  const hull = Math.max(0, e.hull)
  const left = e.total - e.kills
  const banner = e.t < 4 ? (e.enemyLabel === 'GUNSHIPS' ? 'ESCAPE THE VALLEY' : 'GET DOWNRIVER') : e.message
  return (
    <div className="pointer-events-none fixed inset-0 z-20">
      {/* crosshair: door gun */}
      <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
        <div className="relative h-14 w-14 rounded-full border border-warn/70">
          <div className="absolute left-1/2 top-1/2 h-1 w-1 -translate-x-1/2 -translate-y-1/2 rounded-full bg-warn" />
          {hit && <div className="absolute -inset-3 rotate-45 border-2 border-danger/90" />}
        </div>
      </div>
      {/* banner */}
      <div className="absolute inset-x-0 top-[12vh] text-center">
        <div className={`text-2xl font-bold tracking-[0.35em] ${e.phase === 'down' ? 'text-danger' : e.phase === 'escaped' || e.phase === 'home' ? 'text-accent' : 'text-[#ecebe2]'}`} style={{ textShadow: '0 2px 10px rgba(0,0,0,0.9)' }}>{banner}</div>
        {e.phase === 'fight' && <div className="mt-2 text-[12px] tracking-[0.3em] text-hud/80">HOLD {bindingLabel('fire')} — {e.gunLabel} · MOUSE TO AIM · {buddy ? BUDDY_NAME.toUpperCase() : 'PARTNER'} ON THE LEFT {e.gunLabel === 'DOOR GUN' ? 'DOOR' : 'SIDE'}</div>}
      </div>
      {/* status */}
      <div className="absolute bottom-[14vh] left-1/2 w-[min(460px,80vw)] -translate-x-1/2">
        <div className="flex justify-between text-[11px] tracking-[0.25em] text-hud/80">
          <span>HULL</span>
          <span>{e.enemyLabel} LEFT <b className={left ? 'text-danger' : 'text-accent'}>{left}</b></span>
        </div>
        <div className="mt-1 h-2 w-full bg-black/60">
          <div className={`h-full transition-all ${hull > 50 ? 'bg-accent' : hull > 25 ? 'bg-warn' : 'bg-danger'}`} style={{ width: `${hull}%` }} />
        </div>
      </div>
    </div>
  )
}
