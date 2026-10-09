import { useEffect, useState } from 'react'
import type { DetectionLevel } from '../ai/perception'
import { ALERT_LABELS, type AlertLevel } from '../security/AlertSystem'
import { useGameStore, type HudState } from '../state/gameStore'
import { bindingLabel, keyLabel, useSettings } from '../state/settings'
import { Compass } from './Compass'
import { Minimap } from './Minimap'
import { Reticle } from './Reticle'

/** Text + glyph per level so detection never depends on colour alone. */
const DETECTION: Record<DetectionLevel, { text: string; color: string; glyph: string }> = {
  hidden: { text: 'UNDETECTED', color: '#a9bf8e', glyph: '○' },
  suspicious: { text: 'SUSPICIOUS', color: '#d9c441', glyph: '?' },
  searching: { text: 'SEARCHING', color: '#d9a441', glyph: '??' },
  detected: { text: 'COMPROMISED', color: '#c9503e', glyph: '!' },
}

function Segments({ value, max, n, color, height = 6, width = 168 }: { value: number; max: number; n: number; color: string; height?: number; width?: number }) {
  const filled = (value / max) * n
  return (
    <div className="flex gap-[2px]" style={{ width }}>
      {Array.from({ length: n }, (_, i) => (
        <div key={i} className="flex-1 bg-white/10" style={{ height }}>
          <div className="h-full" style={{ width: `${Math.max(0, Math.min(1, filled - i)) * 100}%`, background: color }} />
        </div>
      ))}
    </div>
  )
}

function Status({ hud }: { hud: HudState }) {
  const d = DETECTION[hud.detection]
  const level = Math.max(hud.awareness, hud.cameraDetection)
  return (
    <div className="absolute left-1/2 top-[60px] flex -translate-x-1/2 flex-col items-center gap-1">
      <div className="flex items-center gap-2">
        <EyeIcon color={d.color} />
        <span className="hud-text w-4 text-center text-[12px] font-bold" style={{ color: d.color }}>{d.glyph}</span>
        <span className={`hud-text text-[11px] tracking-[0.3em] ${hud.detection === 'detected' ? 'blink' : ''}`} style={{ color: d.color }}>{d.text}</span>
      </div>
      <Segments value={level} max={1} n={10} color={d.color} height={3} width={120} />
      <div className="hud-text text-[11px] tracking-[0.25em]">
        <span className="text-hud-dim">KILLED</span> <span className="text-danger">{hud.enemiesKilled}</span>
        <span className="text-hud-dim"> · REMAINING</span> <span className="text-hud">{hud.enemiesLeft}</span>
      </div>
      {hud.alarm && <div className="hud-text blink mt-1 text-[11px] tracking-[0.3em] text-danger">ALARM · {hud.alarmReason.toUpperCase()}</div>}
      {hud.restricted && <div className="hud-text text-[10px] tracking-[0.3em] text-warn">⚠ {hud.restricted}</div>}
    </div>
  )
}

const LEVEL_COLORS = ['#a9bf8e', '#d9c441', '#d9a441', '#c9503e', '#e0402e']

/** Facility security level 0–4. */
function AlertIndicator({ hud }: { hud: HudState }) {
  const level = hud.alertLevel as AlertLevel
  const color = LEVEL_COLORS[level]
  return (
    <div className="hud-text flex flex-col items-end gap-1">
      <div className="flex items-center gap-2">
        <span className="hud-label">SEC</span>
        <div className="flex gap-[3px]">
          {[1, 2, 3, 4].map((i) => <div key={i} className="h-2 w-4" style={{ background: i <= level ? color : 'rgb(255 255 255 / 0.12)' }} />)}
        </div>
      </div>
      <div className={`text-[10px] tracking-[0.25em] ${level >= 3 ? 'blink' : ''}`} style={{ color }}>{ALERT_LABELS[level]}</div>
      {hud.commsDown && <div className="text-[10px] tracking-[0.25em] text-accent">ENEMY UPLINK DOWN</div>}
    </div>
  )
}

const fmt = (t: number) => `${Math.floor(t / 60)}:${String(Math.ceil(t % 60) % 60).padStart(2, '0')}`

/** Mission-state banner under the compass. */
function MissionBanner({ hud }: { hud: HudState }) {
  const x = hud.extraction
  let text: string | null = null
  let sub: string | null = null
  let tone = 'text-hud'
  if (hud.missionState === 'INSERTION') {
    text = `OPERATION ${hud.missionName}`
    sub = 'INSERTION'
  } else if (hud.missionState === 'OBJECTIVE_COMPLETE') {
    text = 'OBJECTIVE COMPLETE'
    tone = 'text-accent'
  } else if (hud.missionState === 'SUCCESS') {
    text = 'EXTRACTED'
    tone = 'text-accent'
  } else if (x) {
    text = x.inZone ? `HOLD THE LZ — ${fmt(x.total - x.progress)}` : 'EXTRACTION AVAILABLE'
    sub = x.inZone ? 'helicopter inbound' : 'reach the north-west landing zone'
    tone = 'text-warn'
  } else if (hud.missionState === 'LOCKDOWN') {
    text = 'FULL LOCKDOWN'
    sub = 'secure doors sealed — bypass required'
    tone = 'text-danger'
  }
  if (!text) return null
  return (
    <div className="hud-text absolute left-1/2 top-[132px] -translate-x-1/2 text-center">
      <div className={`text-[15px] tracking-[0.4em] ${tone}`}>{text}</div>
      {sub && <div className="hud-label mt-0.5">{sub}</div>}
      {x?.inZone && (
        <div className="mx-auto mt-1.5 h-[3px] w-48 bg-white/15">
          <div className="h-full bg-warn" style={{ width: `${(x.progress / x.total) * 100}%` }} />
        </div>
      )}
    </div>
  )
}

/** Radio subtitles: intercepted enemy traffic and the handler. */
function Radio() {
  const lines = useGameStore((s) => s.radio)
  const on = useSettings((s) => s.subtitles)
  if (!on) return null
  return (
    <div className="hud-text absolute bottom-[150px] left-5 flex w-[30rem] flex-col gap-1">
      {lines.map((l) => (
        <div key={l.id} className="text-[13px] leading-snug">
          <span className={`mr-2 text-[10px] tracking-[0.2em] ${l.channel === 'handler' ? 'text-accent' : 'text-warn/80'}`}>
            {l.channel === 'handler' ? l.speaker : `INTERCEPT · ${l.speaker.toUpperCase()}`}
          </span>
          <span className={l.channel === 'handler' ? 'text-hud' : 'text-hud/80'}>{l.text}</span>
        </div>
      ))}
    </div>
  )
}

const EYEPIECES = 'radial-gradient(circle 31vh at 41% 50%, transparent 98%, black 100%), radial-gradient(circle 31vh at 59% 50%, transparent 98%, black 100%)'

/** Binocular view: masked eyepieces, stadia reticle, rangefinder and target identification. */
function Binoculars({ r }: { r: NonNullable<HudState['recon']> }) {
  return (
    <div className="absolute inset-0">
      {/* everything outside the two eyepieces is masked off */}
      <div className="absolute inset-0" style={{ backgroundColor: 'rgb(4 5 4 / 0.96)', WebkitMaskImage: EYEPIECES, maskImage: EYEPIECES, WebkitMaskComposite: 'source-in', maskComposite: 'intersect' }} />
      <svg className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2" width="240" height="240" viewBox="-120 -120 240 240" fill="none" stroke="#d9dbcf" strokeOpacity="0.75" strokeWidth="1">
        <line x1="-110" y1="0" x2="-14" y2="0" /><line x1="14" y1="0" x2="110" y2="0" /><line x1="0" y1="14" x2="0" y2="100" />
        {[-80, -60, -40, 40, 60, 80].map((x) => <line key={x} x1={x} y1="-4" x2={x} y2="4" />)}
        {[30, 50, 70].map((y) => <line key={y} x1="-4" y1={y} x2="4" y2={y} />)}
        <circle r="3" />
      </svg>
      <div className="hud-text absolute left-1/2 top-[calc(50%+130px)] -translate-x-1/2 text-center">
        {r.target ? (
          <>
            <div className={`text-[14px] tracking-[0.3em] ${r.target.label.startsWith('HOSTILE') ? 'text-danger' : 'text-hud'}`}>{r.target.label}</div>
            <div className="hud-label mt-0.5">{r.target.detail}</div>
            {r.tagProgress > 0 && <div className="mx-auto mt-1.5 h-[3px] w-28 bg-white/15"><div className="h-full bg-warn" style={{ width: `${r.tagProgress * 100}%` }} /></div>}
          </>
        ) : <div className="hud-label">no target</div>}
      </div>
      <div className="hud-text absolute right-[6%] top-1/2 -translate-y-1/2 text-right">
        <div className="tnum text-2xl">{r.range === null ? '----' : Math.round(r.range)}<span className="ml-1 text-sm text-hud-dim">m</span></div>
        <div className="hud-label mt-1">×{r.zoom} · RMB/wheel zoom</div>
        <div className="hud-label">{r.tagged} tagged · B to lower</div>
      </div>
    </div>
  )
}

function EyeIcon({ color }: { color: string }) {
  return (
    <svg width="16" height="10" viewBox="0 0 16 10" fill="none" stroke={color} strokeWidth="1.3">
      <path d="M1 5 C4 0.5 12 0.5 15 5 C12 9.5 4 9.5 1 5 Z" />
      <circle cx="8" cy="5" r="2" fill={color} />
    </svg>
  )
}

function Objective({ hud }: { hud: HudState }) {
  const [full, setFull] = useState(false)
  const key = useSettings((s) => s.bindings.objectives[0])
  useEffect(() => {
    const down = (e: KeyboardEvent) => e.code === key && setFull(true)
    const up = (e: KeyboardEvent) => e.code === key && setFull(false)
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
    }
  }, [key])
  const current = hud.objectives.find((o) => o.current)
  const primaries = hud.objectives.filter((o) => !o.optional)
  const secondaries = hud.objectives.filter((o) => o.optional)
  const doneSecondaries = secondaries.filter((o) => o.status === 'done').length
  const row = (o: HudState['objectives'][number]) => (
    <li key={o.id} className={o.status === 'done' ? 'text-hud-dim line-through' : o.status === 'failed' ? 'text-danger/80 line-through' : o.current ? 'text-hud' : o.optional ? 'text-hud/75' : 'text-hud/45'}>
      {o.status === 'done' ? '✓' : o.status === 'failed' ? '✗' : o.current ? '›' : '·'} {o.label}{o.progress ? <span className="tnum text-warn"> {o.progress}</span> : null}
    </li>
  )
  return (
    <div className="hud-text absolute left-5 top-5 w-96">
      <div className="hud-label">OP {hud.missionName} · Objective {Math.min(hud.objectiveIndex + 1, primaries.length)}/{primaries.length}</div>
      {current && (
        <div className="mt-1 flex items-baseline gap-3">
          <span className="text-[15px] tracking-wide text-hud">{current.label}</span>
          {hud.objectiveDistance !== null && <span className="tnum text-xs text-warn">{Math.round(hud.objectiveDistance)} m</span>}
          {current.progress && <span className="tnum text-xs text-warn">{current.progress}</span>}
        </div>
      )}
      {full ? (
        <div className="hud-panel mt-3 px-3 py-2 text-[13px]">
          <div className="hud-label mb-1">Primary</div>
          <ul className="space-y-1">{primaries.map(row)}</ul>
          <div className="hud-label mb-1 mt-3">Secondary</div>
          <ul className="space-y-1">{secondaries.map(row)}</ul>
        </div>
      ) : (
        <div className="hud-label mt-1 normal-case tracking-wider opacity-70">secondary {doneSecondaries}/{secondaries.length} · {keyLabel(key)} objectives · {bindingLabel('map')} map · {bindingLabel('binoculars')} binoculars</div>
      )}
    </div>
  )
}

function Messages() {
  const messages = useGameStore((s) => s.messages)
  const tone = { info: 'text-hud', warn: 'text-warn', good: 'text-accent' }
  return (
    <div className="absolute bottom-28 left-1/2 flex -translate-x-1/2 flex-col items-center gap-1">
      {messages.map((m) => (
        <div key={m.id} className={`hud-text text-[13px] tracking-wider ${tone[m.tone]}`}>{m.text}</div>
      ))}
    </div>
  )
}

function Vitals({ hud }: { hud: HudState }) {
  return (
    <div className="hud-text absolute bottom-5 left-5 space-y-2">
      <div className="flex items-center gap-3">
        <span className="hud-label w-8">HP</span>
        <Segments value={hud.health} max={100} n={10} color={hud.health < 30 ? '#c9503e' : '#d9dbcf'} />
        <span className="tnum w-7 text-right text-sm">{Math.ceil(hud.health)}</span>
      </div>
      <div className="flex items-center gap-3">
        <span className="hud-label w-8">ARM</span>
        <Segments value={hud.armor} max={50} n={10} color="#8fb8c9" height={3} />
      </div>
      <div className="flex items-center gap-3">
        <span className="hud-label w-8">STA</span>
        <Segments value={hud.stamina} max={100} n={20} color={hud.holdingBreath ? '#d9a441' : '#9aa88a'} height={3} />
      </div>
      <div className="flex items-center gap-3">
        <span className="hud-label w-8">VIS</span>
        <Segments value={hud.light} max={1} n={10} color="#d9c98a" height={3} />
        <span className="hud-label">{hud.light < 0.35 ? 'DARK' : hud.light < 0.65 ? 'SHADE' : 'LIT'}{hud.indoors ? ' · INDOORS' : ''}</span>
      </div>
      <div className="flex items-center gap-4 pt-1 text-[10px] tracking-[0.25em]">
        <span className="text-hud">{hud.stance === 'prone' ? '▁ PRONE' : hud.stance === 'crouch' ? '▄ CROUCH' : '█ STAND'}</span>
        {Math.abs(hud.lean) > 0.3 && <span className="text-hud">{hud.lean < 0 ? '◂ LEAN' : 'LEAN ▸'}</span>}
        <span className={hud.flashlight ? 'text-warn' : 'text-hud-dim'}>LIGHT {hud.flashlight ? 'ON' : 'OFF'}</span>
        {hud.keycard && <span className="text-accent">▣ KEYCARD</span>}
      </div>
    </div>
  )
}

function Ammo({ hud }: { hud: HudState }) {
  const status = hud.weaponState === 'RELOADING' ? 'RELOADING' : hud.weaponState === 'CYCLING' ? 'CYCLING BOLT' : hud.weaponState === 'HOLSTERING' || hud.weaponState === 'EQUIPPING' ? 'SWITCHING' : hud.ammo === 0 ? `EMPTY — ${bindingLabel('reload')}` : hud.weaponState === 'INSPECTING' ? 'INSPECT' : ''
  return (
    <div className="hud-text absolute bottom-5 right-5 text-right">
      <div className="hud-label">{hud.weaponName} · {hud.fireMode}{hud.optic ? ` · ${hud.optic}` : ''}</div>
      <div className="mt-0.5 flex items-baseline justify-end gap-2">
        <span className={`tnum text-4xl font-semibold ${hud.ammo === 0 ? 'text-danger' : 'text-hud'}`}>{hud.ammo}</span>
        <span className="tnum text-base text-hud-dim">/ {hud.reserve}</span>
      </div>
      {hud.magSize <= 15 && (
        <div className="mt-1 flex justify-end gap-[3px]">
          {Array.from({ length: hud.magSize }, (_, i) => <div key={i} className="h-2.5 w-[3px]" style={{ background: i < hud.ammo ? '#d9dbcf' : 'rgb(255 255 255 / 0.12)' }} />)}
        </div>
      )}
      <div className="mt-1 h-3 text-[10px] tracking-[0.3em] text-warn">{status}</div>
      <div className="hud-label mt-1.5">
        [{bindingLabel('grenade')}] {hud.equipment.name} ×{hud.equipment.count}
        <span className="ml-2 opacity-60">F{hud.equipment.counts.frag} S{hud.equipment.counts.smoke} B{hud.equipment.counts.flash} · {bindingLabel('cycleGrenade')} cycle</span>
      </div>
    </div>
  )
}

function Vehicle({ hud }: { hud: HudState }) {
  if (!hud.driving) return null
  return (
    <div className="hud-text absolute bottom-24 left-1/2 -translate-x-1/2 text-center">
      <div className="hud-label">{hud.driving.name}</div>
      <div className="tnum text-3xl">{Math.round(hud.driving.speed)} <span className="text-sm text-hud-dim">km/h</span></div>
      <div className="hud-label mt-1">{bindingLabel('forward')}/{bindingLabel('back')} drive · {bindingLabel('left')}/{bindingLabel('right')} steer · {bindingLabel('jump')} handbrake · {bindingLabel('interact')} exit</div>
    </div>
  )
}

function TrainingPanel({ t }: { t: NonNullable<HudState['training']> }) {
  return (
    <div className="hud-text hud-panel absolute left-1/2 top-[190px] w-[30rem] -translate-x-1/2 px-4 py-2 text-center">
      <div className="hud-label">Training {t.index}/{t.total} · {t.title}</div>
      <div className="mt-1 text-[14px] text-hud">{t.text}</div>
    </div>
  )
}

export function HUD() {
  const hud = useGameStore((s) => s.hud)
  const minimap = useSettings((s) => s.minimap)
  const detection = useSettings((s) => s.detectionIndicators)
  const uiScale = useSettings((s) => s.uiScale)
  if (!hud) return null
  const recon = hud.recon
  return (
    <>
    <div className="pointer-events-none fixed inset-0">
      {recon && <Binoculars r={recon} />}
      <Reticle />
    </div>
    <div className="pointer-events-none fixed inset-0" style={{ zoom: uiScale }}>
      <Compass />
      {detection && <Status hud={hud} />}
      {hud.training && !recon && hud.aim < 0.5 && <TrainingPanel t={hud.training} />}
      <MissionBanner hud={hud} />
      <Objective hud={hud} />
      <div className="absolute right-5 top-5 flex flex-col items-end gap-1.5">
        {minimap && <Minimap />}
        <div className="hud-text hud-label">{hud.timeLabel}</div>
        <AlertIndicator hud={hud} />
      </div>
      <Messages />
      <Radio />
      {hud.prompt && (
        <div className="hud-text absolute left-1/2 top-[57%] -translate-x-1/2 text-center">
          <div className="text-[13px] tracking-[0.15em] text-hud">{hud.prompt}</div>
          {hud.promptProgress !== null && (
            <div className="mx-auto mt-1.5 h-[3px] w-40 bg-white/15">
              <div className="h-full bg-warn" style={{ width: `${hud.promptProgress * 100}%` }} />
            </div>
          )}
        </div>
      )}
      <Vehicle hud={hud} />
      {!hud.driving && <Vitals hud={hud} />}
      {!hud.driving && !recon && <Ammo hud={hud} />}
    </div>
    </>
  )
}
