import { useState } from 'react'
import { input } from '../game/input'
import { ACTIONS, keyLabel, useSettings, type Action, type Settings } from '../state/settings'

type Tab = 'graphics' | 'controls' | 'audio' | 'gameplay'

function Slider({ label, k, min, max, step, fmt = (v) => v.toFixed(2) }: { label: string; k: keyof Settings; min: number; max: number; step: number; fmt?: (v: number) => string }) {
  const value = useSettings((s) => s[k] as number)
  const set = useSettings((s) => s.set)
  return (
    <label className="flex items-center gap-3 border-b border-white/5 py-1.5">
      <span className="w-48 text-hud/80">{label}</span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => set({ [k]: Number(e.target.value) } as Partial<Settings>)} className="flex-1 accent-[#d9a441]" />
      <span className="tnum w-14 text-right text-hud">{fmt(value)}</span>
    </label>
  )
}

function Toggle({ label, k }: { label: string; k: keyof Settings }) {
  const value = useSettings((s) => s[k] as boolean)
  const set = useSettings((s) => s.set)
  return (
    <label className="flex cursor-pointer items-center gap-3 border-b border-white/5 py-1.5">
      <span className="w-48 text-hud/80">{label}</span>
      <input type="checkbox" checked={value} onChange={(e) => set({ [k]: e.target.checked } as Partial<Settings>)} className="h-4 w-4 accent-[#d9a441]" />
      <span className="text-hud-dim">{value ? 'On' : 'Off'}</span>
    </label>
  )
}

function Choice<T extends string>({ label, k, options }: { label: string; k: keyof Settings; options: [T, string][] }) {
  const value = useSettings((s) => s[k] as T)
  const set = useSettings((s) => s.set)
  return (
    <div className="flex items-center gap-3 border-b border-white/5 py-1.5">
      <span className="w-48 text-hud/80">{label}</span>
      {options.map(([v, text]) => (
        <button key={v} onClick={() => set({ [k]: v } as Partial<Settings>)} className={`border px-3 py-0.5 text-[12px] tracking-[0.15em] ${v === value ? 'border-hud text-hud' : 'border-hud/20 text-hud-dim hover:border-hud/50'}`}>{text}</button>
      ))}
    </div>
  )
}

function Bindings() {
  const bindings = useSettings((s) => s.bindings)
  const bind = useSettings((s) => s.bind)
  const [waiting, setWaiting] = useState<Action | null>(null)
  const rebind = async (a: Action) => {
    setWaiting(a)
    const code = await input.captureNext()
    setWaiting(null)
    if (code) bind(a, code)
  }
  return (
    <div className="grid grid-cols-2 gap-x-6">
      {(Object.keys(ACTIONS) as Action[]).map((a) => (
        <div key={a} className="flex items-center justify-between border-b border-white/5 py-1">
          <span className="text-hud/80">{ACTIONS[a]}</span>
          <button onClick={() => rebind(a)} className={`min-w-20 border px-2 py-0.5 text-[12px] ${waiting === a ? 'border-warn text-warn' : 'border-hud/25 text-hud hover:border-hud'}`}>
            {waiting === a ? 'press a key…' : bindings[a].map(keyLabel).join(' / ') || '—'}
          </button>
        </div>
      ))}
    </div>
  )
}

/** Settings: graphics, controls (sensitivity + key bindings), audio, gameplay/accessibility. Saved to localStorage. */
export function SettingsPanel({ onClose }: { onClose: () => void }) {
  const [tab, setTab] = useState<Tab>('controls')
  const reset = useSettings((s) => s.reset)
  const pct = (v: number) => `${Math.round(v * 100)}%`
  return (
    <div className="panel flex max-h-[90vh] w-[820px] max-w-[96vw] flex-col p-6 text-[13px]" onClick={(e) => e.stopPropagation()}>
      <div className="flex items-center justify-between">
        <div className="text-2xl tracking-[0.4em]">SETTINGS</div>
        <div className="flex gap-2">
          {(['graphics', 'controls', 'audio', 'gameplay'] as Tab[]).map((t) => (
            <button key={t} onClick={() => setTab(t)} className={`border px-3 py-1 text-[11px] uppercase tracking-[0.2em] ${t === tab ? 'border-warn text-warn' : 'border-hud/20 text-hud-dim hover:border-hud/50'}`}>{t}</button>
          ))}
        </div>
      </div>
      <div className="mt-4 min-h-0 flex-1 overflow-y-auto pr-2">
        {tab === 'graphics' && (
          <>
            <Choice label="Quality" k="quality" options={[['high', 'High'], ['low', 'Low']]} />
            <Toggle label="Shadows" k="shadows" />
            <Toggle label="Post processing" k="postProcessing" />
            <Slider label="Resolution scale" k="resolutionScale" min={0.5} max={1.5} step={0.05} fmt={pct} />
            <Slider label="Field of view" k="fov" min={60} max={95} step={1} fmt={(v) => `${v}°`} />
            <Slider label="Weapon position: left / right" k="weaponX" min={-6} max={6} step={0.5} fmt={(v) => `${v} cm`} />
            <Slider label="Weapon position: down / up" k="weaponY" min={-6} max={6} step={0.5} fmt={(v) => `${v} cm`} />
            <Slider label="Weapon position: closer / further" k="weaponZ" min={-6} max={6} step={0.5} fmt={(v) => `${v} cm`} />
          </>
        )}
        {tab === 'controls' && (
          <>
            <Slider label="Mouse sensitivity" k="sensitivity" min={0.2} max={3} step={0.05} />
            <Slider label="ADS sensitivity" k="adsSensitivity" min={0.2} max={2} step={0.05} />
            <Slider label="Scope sensitivity" k="scopeSensitivity" min={0.2} max={2} step={0.05} />
            <Slider label="ADS transition speed" k="adsSpeed" min={0.6} max={1.6} step={0.05} fmt={pct} />
            <Toggle label="Invert Y" k="invertY" />
            <Toggle label="Toggle crouch" k="toggleCrouch" />
            <div className="hud-label mb-1 mt-4">Key bindings — click, then press a key or mouse button (Esc cancels)</div>
            <Bindings />
            <div className="mt-2 text-[11px] text-hud-dim">Lean right and Interact share E by default: with something to use in front of you, E interacts.</div>
          </>
        )}
        {tab === 'audio' && (
          <>
            <Slider label="Master" k="master" min={0} max={1} step={0.05} fmt={pct} />
            <Slider label="Music / ambience" k="music" min={0} max={1} step={0.05} fmt={pct} />
            <Slider label="Effects" k="effects" min={0} max={1} step={0.05} fmt={pct} />
            <Slider label="Voice / radio" k="voice" min={0} max={1} step={0.05} fmt={pct} />
          </>
        )}
        {tab === 'gameplay' && (
          <>
            <Toggle label="Crosshair" k="crosshair" />
            <Toggle label="Minimap" k="minimap" />
            <Toggle label="Rotate minimap with view" k="minimapRotate" />
            <Toggle label="Subtitles (radio)" k="subtitles" />
            <Toggle label="Detection indicators" k="detectionIndicators" />
            <Toggle label="Training hints" k="tutorial" />
            <Slider label="UI scale" k="uiScale" min={0.75} max={1.5} step={0.05} fmt={pct} />
          </>
        )}
      </div>
      <div className="mt-4 flex gap-3">
        <button onClick={onClose} className="border border-warn px-6 py-2 text-sm tracking-[0.25em] text-warn hover:bg-warn hover:text-black">DONE</button>
        <button onClick={reset} className="border border-hud/30 px-6 py-2 text-sm tracking-[0.25em] text-hud hover:border-hud">RESET TO DEFAULTS</button>
      </div>
    </div>
  )
}
