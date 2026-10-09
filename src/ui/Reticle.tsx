import { useEffect, useRef } from 'react'
import { useGameStore } from '../state/gameStore'
import { settings } from '../state/settings'

/**
 * Crosshair, hit marker, damage direction, damage vignette and the scope overlay. Updated every animation frame via
 * refs (spread and aim change per shot — too fast for React state).
 */
export function Reticle() {
  const cross = useRef<HTMLDivElement>(null)
  const hit = useRef<HTMLDivElement>(null)
  const vignette = useRef<HTMLDivElement>(null)
  const scope = useRef<HTMLDivElement>(null)
  const dmg = useRef<HTMLDivElement>(null)
  const white = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let raf = 0
    const tick = () => {
      raf = requestAnimationFrame(tick)
      const { session, lastHitMarker, lastDamage, lastHitKill } = useGameStore.getState()
      if (!session) return
      const { weapon, player } = session
      const halfFov = (session.fov * Math.PI) / 360
      const gap = (Math.tan(weapon.spread(player.moving)) / Math.tan(halfFov)) * (window.innerHeight / 2)
      cross.current!.style.setProperty('--gap', `${Math.max(4, gap)}px`)
      cross.current!.style.opacity = !settings().crosshair || session.grenades.handsBusy > 0 || session.pendingWeapon !== null || weapon.aim > 0.5 || weapon.sprint > 0.5 || !player.active || weapon.reloading || session.recon.active ? '0' : '0.85'
      const now = performance.now()
      hit.current!.style.opacity = String(Math.max(0, 1 - (now - lastHitMarker) / 220))
      hit.current!.style.setProperty('--hit', lastHitKill ? '#c9503e' : '#ffffff')
      const lowHp = player.health < 30 ? 0.35 : 0
      vignette.current!.style.opacity = String(Math.max(lowHp, 0.5 - (now - lastDamage) / 500))
      white.current!.style.opacity = String(Math.min(1, session.grenades.flash * 1.3))
      scope.current!.style.display = weapon.def.scope && weapon.aim > 0.85 && player.active ? 'block' : 'none'
      // damage direction: rotate an arc towards where the shot came from, relative to the view
      const age = session.time - session.damageTime
      dmg.current!.style.opacity = String(Math.max(0, 1 - age / 1.6))
      if (age < 1.6) {
        const d = session.damageFrom
        const ang = Math.atan2(d.x, -d.z) + player.yaw
        dmg.current!.style.transform = `translate(-50%, -50%) rotate(${ang}rad)`
      }
    }
    tick()
    return () => cancelAnimationFrame(raf)
  }, [])

  const line = 'absolute bg-hud shadow-[0_0_2px_black]'
  return (
    <>
      <div ref={white} className="absolute inset-0 bg-[#f4f2ea] opacity-0" />
      <div ref={vignette} className="absolute inset-0 opacity-0" style={{ background: 'radial-gradient(ellipse at center, transparent 50%, rgb(120 10 0 / 0.5) 100%)' }} />
      <div ref={scope} className="absolute inset-0" style={{ display: 'none' }}>
        <div className="absolute inset-0" style={{ background: 'radial-gradient(circle at center, transparent 0, transparent 33vh, rgba(0,0,0,0.6) 34vh, #000 35vh)' }} />
        <div className="absolute left-1/2 top-1/2 h-[68vh] w-px -translate-x-1/2 -translate-y-1/2 bg-black/90" />
        <div className="absolute left-1/2 top-1/2 h-px w-[68vh] -translate-x-1/2 -translate-y-1/2 bg-black/90" />
        {[-4, -3, -2, -1, 1, 2, 3, 4].map((k) => (
          <div key={`v${k}`} className="absolute left-1/2 h-1 w-1 -translate-x-1/2 -translate-y-1/2 rounded-full bg-black" style={{ top: `calc(50% + ${k * 3.5}vh)` }} />
        ))}
        {[-4, -3, -2, -1, 1, 2, 3, 4].map((k) => (
          <div key={`h${k}`} className="absolute top-1/2 h-1 w-1 -translate-x-1/2 -translate-y-1/2 rounded-full bg-black" style={{ left: `calc(50% + ${k * 3.5}vh)` }} />
        ))}
        <div className="absolute left-1/2 top-1/2 h-[10vh] w-[3px] -translate-x-1/2 bg-black" style={{ top: 'calc(50% + 24vh)' }} />
      </div>
      <div ref={dmg} className="absolute left-1/2 top-1/2 opacity-0" style={{ width: 220, height: 220 }}>
        <div className="absolute left-1/2 top-0 h-2 w-16 -translate-x-1/2 rounded-full" style={{ background: 'radial-gradient(ellipse, rgb(220 60 40 / 0.85), transparent 70%)' }} />
      </div>
      <div ref={cross} className="absolute left-1/2 top-1/2" style={{ '--gap': '6px' } as React.CSSProperties}>
        <div className={`${line} h-px w-2`} style={{ right: 'var(--gap)', top: 0 }} />
        <div className={`${line} h-px w-2`} style={{ left: 'var(--gap)', top: 0 }} />
        <div className={`${line} h-2 w-px`} style={{ top: 'var(--gap)', left: 0 }} />
        <div className={`${line} h-px w-px opacity-70`} />
      </div>
      <div ref={hit} className="absolute left-1/2 top-1/2 h-0 w-0 opacity-0">
        {[45, 135, 225, 315].map((a) => (
          <div key={a} className="absolute h-px w-2.5" style={{ background: 'var(--hit)', transform: `rotate(${a}deg) translateX(8px)`, transformOrigin: '0 0' }} />
        ))}
      </div>
    </>
  )
}
