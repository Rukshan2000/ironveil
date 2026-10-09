import { useGameStore } from '../state/gameStore'
import { useSettings } from '../state/settings'

const STATE_CLS: Record<string, string> = { SUSPICIOUS: 'text-warn', INVESTIGATE: 'text-warn', SEARCH: 'text-warn', ALERT: 'text-danger', COMBAT: 'text-danger', RETREAT: 'text-danger', CALL_REINFORCEMENTS: 'text-danger', DEAD: 'text-white/30' }

export function DebugPanel() {
  const debug = useGameStore((s) => s.debug)
  const info = useGameStore((s) => s.debugInfo)
  const quality = useSettings((s) => s.quality)
  if (!debug || !info) return null
  const [x, y, z] = info.position
  return (
    <div className="panel pointer-events-none fixed bottom-36 left-4 w-80 px-3 py-2 font-mono text-[11px] leading-relaxed">
      <div className="text-warn">DEBUG [F1] · QUALITY {quality.toUpperCase()} · VALIDATION [F2]</div>
      <div>FPS {info.fps} · worst frame {info.frameMs} ms</div>
      <div>DRAW CALLS {info.drawCalls} · TRIS {(info.triangles / 1000).toFixed(0)}k</div>
      <div>POS {x.toFixed(1)}, {y.toFixed(1)}, {z.toFixed(1)}</div>
      <div>SPEED {info.speed.toFixed(1)} m/s {info.grounded ? 'GROUNDED' : 'AIR'} {info.stance.toUpperCase()}</div>
      <div>ENTITIES {info.entities} · COLLIDERS {info.colliders}</div>
      <div>BULLETS {info.bullets} · PARTICLES {info.particles}</div>
      <div className="truncate">OBJ {info.objective}</div>
      <div className="mt-1 border-t border-white/10 pt-1">
        {info.guards.map((g) => (
          <div key={g.id} className="flex justify-between gap-2">
            <span className="truncate">{g.id}</span>
            <span className={STATE_CLS[g.state] ?? ''}>{g.state}</span>
            <span className="tnum">{(g.suspicion * 100).toFixed(0)}% · {Math.max(0, g.health).toFixed(0)}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
