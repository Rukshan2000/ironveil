import { useState } from 'react'
import { continueFromCheckpoint, playIntro, openBriefing, quitToMenu, requestLock, restartMission } from '../app/actions'
import { loadCheckpoint } from '../missions/checkpoint'
import { NIGHTFALL } from '../missions/nightfall'
import { ALERT_LABELS, type AlertLevel } from '../security/AlertSystem'
import { coop } from '../net/coop'
import { useGameStore, type MissionResults } from '../state/gameStore'
import { bindingLabel as k, useSettings } from '../state/settings'
import { SettingsPanel } from './SettingsPanel'
import { PRESETS, type TimeOfDay } from '../world/environment'
import { TacticalMap } from './TacticalMap'

/** Controls summary built from the live key bindings. */
const controls = (): [string, string][] => [
  [`${k('forward')} ${k('left')} ${k('back')} ${k('right')}`, 'Move'], [k('sprint'), 'Sprint / hold breath (scoped)'], [k('walk'), 'Slow walk (quiet)'],
  [k('crouch'), 'Crouch'], [k('prone'), 'Prone'], [k('jump'), 'Jump / vault / stand'], [`${k('leanLeft')} / ${k('leanRight')}`, 'Lean'],
  [`${k('fire')} / ${k('aim')}`, 'Fire / Aim (hold)'], ['Wheel (aimed)', 'Optic zoom 1×–8×'], [k('reload'), 'Reload'], [k('inspect'), 'Inspect weapon'],
  [`${k('weapon1')} ${k('weapon2')} ${k('weapon3')} / wheel`, 'Carbine · Pistol · Marksman'], [`${k('grenade')} (hold) / ${k('cycleGrenade')}`, 'Throw · cycle frag/smoke/flash'],
  [k('interact'), 'Use · hold to hack / sabotage'], [k('binoculars'), 'Binoculars (tag, identify)'], [k('map'), 'Tactical map'],
  [k('flashlight'), 'Flashlight'], [k('objectives'), 'Objectives'], ['Esc', 'Pause / settings'],
]

function Overlay({ children, dim = true }: { children: React.ReactNode; dim?: boolean }) {
  return <div className={`fixed inset-0 flex items-center justify-center ${dim ? 'bg-black/60 backdrop-blur-md' : 'bg-black/35'}`}>{children}</div>
}

function Button({ onClick, children, primary }: { onClick: () => void; children: React.ReactNode; primary?: boolean }) {
  return (
    <button
      onClick={(e) => { e.stopPropagation(); onClick() }}
      className={`border px-6 py-2 text-sm tracking-[0.25em] transition-colors ${primary ? 'border-warn text-warn hover:bg-warn hover:text-black' : 'border-hud/30 text-hud hover:border-hud'}`}
    >
      {children}
    </button>
  )
}

function SettingsOverlay() {
  return <Overlay><SettingsPanel onClose={() => useGameStore.setState({ settingsOpen: false })} /></Overlay>
}

/** Host a room (share the code) or join a friend's; then both start the mission as usual. */
function CoopPanel() {
  const status = useGameStore((s) => s.coopStatus)
  const code = useGameStore((s) => s.coopCode)
  const error = useGameStore((s) => s.coopError)
  const [input, setInput] = useState('')
  return (
    <div className="mt-6 border-t border-white/10 pt-4">
      <div className="hud-label">Co-op — play with a friend</div>
      {status === 'off' && (
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <Button onClick={() => coop.host().catch(() => {})}>HOST ROOM</Button>
          <input
            value={input}
            onChange={(e) => setInput(e.target.value.toUpperCase())}
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => { e.stopPropagation(); if (e.key === 'Enter' && input) coop.join(input) }}
            placeholder="ROOM CODE"
            maxLength={6}
            className="w-36 border border-hud/30 bg-transparent px-3 py-2 text-sm tracking-[0.3em] text-hud outline-none placeholder:text-hud-dim focus:border-hud"
          />
          <Button onClick={() => input && coop.join(input)}>JOIN</Button>
          {error && <span className="text-[13px] text-warn">{error}</span>}
        </div>
      )}
      {status !== 'off' && (
        <div className="mt-3 flex flex-wrap items-center gap-4 text-[14px]">
          {status === 'hosting' && <span className="text-hud/80">Room code <b className="select-all text-xl tracking-[0.3em] text-warn">{code}</b> — waiting for your friend…</span>}
          {status === 'joining' && <span className="text-hud/80">Joining…</span>}
          {status === 'connected' && <span className="text-accent">Friend connected — start the mission (both players).</span>}
          <Button onClick={() => coop.leave()}>LEAVE</Button>
        </div>
      )}
    </div>
  )
}

export function MainMenu() {
  const time = useGameStore((s) => s.timeOfDay)
  const settingsOpen = useGameStore((s) => s.settingsOpen)
  useSettings((s) => s.bindings) // re-render the controls list on rebinding
  const [checkpoint] = useState(loadCheckpoint)
  if (settingsOpen) return <SettingsOverlay />
  return (
    <Overlay>
      <div className="panel w-[760px] max-w-[94vw] p-8">
        <div className="hud-label">Tactical infiltration</div>
        <h1 className="mt-1 text-5xl font-semibold tracking-[0.25em] text-hud">IRONVEIL</h1>
        <div className="mt-6 text-xs tracking-[0.3em] text-warn">MISSION 01 // OPERATION {NIGHTFALL.name}</div>
        <p className="mt-2 text-[15px] leading-relaxed text-hud/85">{NIGHTFALL.briefing}</p>
        <div className="mt-5 flex items-center gap-3">
          <span className="hud-label">Insertion</span>
          {(Object.keys(PRESETS) as TimeOfDay[]).map((t) => (
            <button
              key={t}
              onClick={(e) => { e.stopPropagation(); useGameStore.setState({ timeOfDay: t }) }}
              className={`border px-3 py-1 text-[11px] tracking-[0.2em] ${t === time ? 'border-hud text-hud' : 'border-hud/20 text-hud-dim hover:border-hud/50'}`}
            >
              {PRESETS[t].label}
            </button>
          ))}
        </div>
        <div className="mt-6 grid grid-cols-2 gap-x-8 gap-y-1 text-[13px]">
          {controls().map(([key, v]) => (
            <div key={v} className="flex justify-between border-b border-white/5 py-0.5">
              <span className="text-warn">{key}</span><span className="text-hud/70">{v}</span>
            </div>
          ))}
        </div>
        <div className="mt-6 flex flex-wrap items-center gap-3">
          <Button primary onClick={openBriefing}>MISSION BRIEFING</Button>
          {checkpoint?.missionId === NIGHTFALL.id && (
            <Button onClick={continueFromCheckpoint}>CONTINUE — {checkpoint.label.split(' — ')[0].toUpperCase()}</Button>
          )}
          <Button onClick={() => useGameStore.setState({ settingsOpen: true })}>SETTINGS</Button>
        </div>
        <CoopPanel />
      </div>
    </Overlay>
  )
}

/** Full briefing over the paused world: situation, objectives, intel, approaches and the planning map. */
export function BriefingScreen() {
  const m = NIGHTFALL
  return (
    <Overlay>
      <div className="panel flex max-h-[94vh] w-[1180px] max-w-[96vw] gap-6 overflow-hidden p-6">
        <div className="flex min-w-0 flex-1 flex-col overflow-y-auto pr-2">
          <div className="hud-label">Mission 01 · Briefing</div>
          <h1 className="mt-1 text-3xl tracking-[0.3em] text-hud">OPERATION {m.name}</h1>
          <Section title="Situation"><p>{m.situation}</p></Section>
          <Section title="Objectives">
            <ol className="space-y-0.5">
              {m.objectives.filter((o) => !o.optional).map((o, i) => <li key={o.id}><span className="mr-2 text-warn">{i + 1}</span>{o.label}</li>)}
            </ol>
            <div className="hud-label mb-1 mt-3">Secondary — affects your debrief</div>
            <ul className="space-y-0.5 text-hud/75">{m.objectives.filter((o) => o.optional).map((o) => <li key={o.id}>○ {o.label}</li>)}</ul>
          </Section>
          <Section title="Intelligence">
            <ul className="space-y-1">{m.intel?.map((t) => <li key={t}>— {t}</li>)}</ul>
          </Section>
          <Section title="Approaches">
            <div className="space-y-2">{m.approaches?.map((a) => <div key={a.name}><span className="text-warn">{a.name}.</span> {a.text}</div>)}</div>
          </Section>
          <div className="mt-6 flex gap-3">
            <Button primary onClick={playIntro}>DEPLOY</Button>
            <Button onClick={quitToMenu}>BACK</Button>
          </div>
        </div>
        <div className="w-[520px] shrink-0">
          <div className="hud-label mb-2">Planning map · suggested routes</div>
          <TacticalMap briefing />
          <div className="mt-2 text-[11px] text-hud-dim">Map shows terrain, structures and restricted areas only. Guard positions and security devices are unknown — scout them with binoculars.</div>
        </div>
      </div>
    </Overlay>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mt-5 text-[13.5px] leading-relaxed text-hud/85">
      <div className="hud-label mb-1.5 border-b border-white/10 pb-1">{title}</div>
      {children}
    </div>
  )
}

export function LoadingScreen() {
  return <Overlay><div className="animate-pulse text-sm tracking-[0.4em] text-warn">LOADING OPERATION…</div></Overlay>
}

export function PauseScreen() {
  const [checkpoint] = useState(loadCheckpoint)
  const settingsOpen = useGameStore((s) => s.settingsOpen)
  if (settingsOpen) return <SettingsOverlay />
  return (
    <Overlay>
      <div className="panel flex w-80 flex-col items-stretch gap-3 p-8">
        <div className="mb-2 text-center text-2xl tracking-[0.4em]">PAUSED</div>
        <Button primary onClick={requestLock}>RESUME</Button>
        <Button onClick={() => useGameStore.setState({ settingsOpen: true })}>SETTINGS</Button>
        {checkpoint && <Button onClick={continueFromCheckpoint}>RESTART CHECKPOINT</Button>}
        <Button onClick={restartMission}>RESTART MISSION</Button>
        <Button onClick={() => useGameStore.getState().session?.recoverPlayer()}>UNSTUCK — LAST SAFE SPOT</Button>
        <Button onClick={quitToMenu}>QUIT TO MENU</Button>
        {checkpoint && <div className="text-center text-[11px] text-hud-dim">Checkpoint: {checkpoint.label}</div>}
      </div>
    </Overlay>
  )
}

const fmtTime = (t: number) => `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(Math.floor(t % 60)).padStart(2, '0')}`
const DETECTION = { none: ['None', 'text-accent'], suspicious: ['Suspicious', 'text-warn'], detected: ['Detected', 'text-danger'] } as const

/** Debrief. Facts only — no score. */
export function ResultsScreen() {
  const r = useGameStore((s) => s.results)
  const [checkpoint] = useState(loadCheckpoint)
  if (!r) return null
  return (
    <Overlay>
      <div className="panel flex w-[40rem] max-w-[94vw] flex-col gap-5 p-8">
        <div>
          <div className="hud-label">Operation {r.missionName} · debrief</div>
          <div className={`mt-1 text-3xl tracking-[0.3em] ${r.success ? 'text-accent' : 'text-danger'}`}>{r.success ? 'MISSION COMPLETE' : 'MISSION FAILED'}</div>
          {!r.success && <div className="mt-1 text-sm text-hud-dim">Cause: <span className="text-danger">{r.cause ?? 'Eliminated'}</span></div>}
        </div>
        <ObjectiveBlock r={r} optional={false} title="Primary objectives" />
        <ObjectiveBlock r={r} optional title="Secondary objectives" />
        <div className="grid grid-cols-2 gap-x-8 gap-y-1 text-sm">
          <Row k="Detection" v={DETECTION[r.detection][0]} c={DETECTION[r.detection][1]} />
          <Row k="Alarm" v={r.alarm ? 'Triggered' : 'Not triggered'} c={r.alarm ? 'text-danger' : 'text-accent'} />
          <Row k="Highest security level" v={`${r.maxAlert} · ${ALERT_LABELS[r.maxAlert as AlertLevel].toLowerCase()}`} />
          <Row k="Enemies neutralized" v={String(r.kills)} />
          <Row k="Intelligence" v={`${r.intel.collected}/${r.intel.total} collected`} c={r.intel.collected === r.intel.total ? 'text-accent' : undefined} />
          <Row k="Time" v={fmtTime(r.time)} />
          <Row k="Accuracy" v={r.accuracy === null ? '—' : `${Math.round(r.accuracy * 100)}%`} />
          <Row k="Headshots" v={String(r.headshots)} />
        </div>
        <div className="flex flex-wrap gap-3">
          {!r.success && checkpoint && <Button primary onClick={continueFromCheckpoint}>RESTART CHECKPOINT</Button>}
          <Button primary={r.success || !checkpoint} onClick={restartMission}>{r.success ? 'PLAY AGAIN' : 'RESTART MISSION'}</Button>
          <Button onClick={quitToMenu}>MAIN MENU</Button>
        </div>
      </div>
    </Overlay>
  )
}

function ObjectiveBlock({ r, optional, title }: { r: MissionResults; optional: boolean; title: string }) {
  return (
    <div className="text-sm">
      <div className="hud-label mb-1 border-b border-white/10 pb-1">{title}</div>
      {r.objectives.filter((o) => o.optional === optional).map((o) => (
        <div key={o.id} className="flex gap-3 py-0.5">
          <span className={`w-4 ${o.status === 'done' ? 'text-accent' : 'text-danger'}`}>{o.status === 'done' ? '✓' : '✗'}</span>
          <span className={o.status === 'done' ? 'text-hud' : 'text-hud-dim'}>{o.label}{o.progress && o.status !== 'done' ? ` (${o.progress})` : ''}</span>
        </div>
      ))}
    </div>
  )
}

function Row({ k, v, c }: { k: string; v: string; c?: string }) {
  return <div className="flex justify-between border-b border-white/5"><span className="text-hud-dim">{k}</span><span className={`tnum ${c ?? ''}`}>{v}</span></div>
}
