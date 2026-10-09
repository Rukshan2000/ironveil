import { create } from 'zustand'

/** Every remappable action. Codes are KeyboardEvent.code values, or Mouse0/Mouse1/Mouse2 for buttons. */
export const ACTIONS = {
  forward: 'Move forward', back: 'Move back', left: 'Strafe left', right: 'Strafe right',
  sprint: 'Sprint / steady scope', walk: 'Slow walk (quiet)', jump: 'Jump / vault', crouch: 'Crouch', prone: 'Prone',
  leanLeft: 'Lean left', leanRight: 'Lean right',
  fire: 'Fire', aim: 'Aim down sights', reload: 'Reload', inspect: 'Inspect weapon',
  weapon1: 'Primary', weapon2: 'Secondary', weapon3: 'Special', grenade: 'Throw equipment (hold)', cycleGrenade: 'Cycle equipment',
  interact: 'Interact', flashlight: 'Flashlight', binoculars: 'Binoculars', map: 'Tactical map', objectives: 'Objectives (hold)',
  debug: 'Debug panel', validate: 'Level validation',
} as const

export type Action = keyof typeof ACTIONS

export const DEFAULT_BINDINGS: Record<Action, string[]> = {
  forward: ['KeyW'], back: ['KeyS'], left: ['KeyA'], right: ['KeyD'],
  sprint: ['ShiftLeft'], walk: ['AltLeft'], jump: ['Space'], crouch: ['ControlLeft', 'KeyC'], prone: ['KeyZ'],
  leanLeft: ['KeyQ'], leanRight: ['KeyE'],
  fire: ['Mouse0'], aim: ['Mouse2'], reload: ['KeyR'], inspect: ['KeyI'],
  weapon1: ['Digit1'], weapon2: ['Digit2'], weapon3: ['Digit3'], grenade: ['KeyG'], cycleGrenade: ['KeyH'],
  interact: ['KeyE'], flashlight: ['KeyF'], binoculars: ['KeyB'], map: ['KeyM'], objectives: ['Tab'],
  debug: ['F1'], validate: ['F2'],
}

export interface Settings {
  // controls
  sensitivity: number
  adsSensitivity: number
  scopeSensitivity: number
  invertY: boolean
  toggleCrouch: boolean
  /** Multiplier on every weapon's ADS transition speed. */
  adsSpeed: number
  bindings: Record<Action, string[]>
  // graphics
  quality: 'high' | 'low'
  shadows: boolean
  resolutionScale: number
  postProcessing: boolean
  fov: number
  // audio (0..1)
  master: number
  music: number
  effects: number
  voice: number
  // gameplay / accessibility
  crosshair: boolean
  minimap: boolean
  minimapRotate: boolean
  subtitles: boolean
  detectionIndicators: boolean
  uiScale: number
  tutorial: boolean
}

export const DEFAULT_SETTINGS: Settings = {
  sensitivity: 1, adsSensitivity: 1, scopeSensitivity: 1, invertY: false, toggleCrouch: false, adsSpeed: 1,
  bindings: DEFAULT_BINDINGS,
  quality: 'high', shadows: true, resolutionScale: 1, postProcessing: true, fov: 72,
  master: 0.8, music: 0.55, effects: 1, voice: 1,
  crosshair: true, minimap: true, minimapRotate: true, subtitles: true, detectionIndicators: true, uiScale: 1, tutorial: true,
}

const KEY = 'ironveil.settings.v2'

function load(): Settings {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Partial<Settings> | null
    // merge so settings added later get their defaults
    return raw ? { ...DEFAULT_SETTINGS, ...raw, bindings: { ...DEFAULT_BINDINGS, ...raw.bindings } } : DEFAULT_SETTINGS
  } catch {
    return DEFAULT_SETTINGS
  }
}

interface SettingsStore extends Settings {
  set: (patch: Partial<Settings>) => void
  bind: (action: Action, code: string) => void
  reset: () => void
}

export const useSettings = create<SettingsStore>((set, get) => ({
  ...load(),
  set: (patch) => set(patch),
  /** Single primary binding per action; the code is taken off any other action that had it. */
  bind: (action, code) => {
    const bindings = Object.fromEntries(Object.entries(get().bindings).map(([a, codes]) => [a, codes.filter((c) => c !== code)])) as Record<Action, string[]>
    bindings[action] = [code]
    set({ bindings })
  },
  reset: () => set({ ...DEFAULT_SETTINGS }),
}))

useSettings.subscribe((s) => {
  try {
    const { set: _s, bind: _b, reset: _r, ...data } = s
    localStorage.setItem(KEY, JSON.stringify(data))
  } catch {
    // storage unavailable: settings last for this session only
  }
})

/** Non-reactive read for game code. */
export const settings = () => useSettings.getState()

/** "Mouse2" → "RMB", "KeyE" → "E", "ShiftLeft" → "Shift". */
export function keyLabel(code: string | undefined): string {
  if (!code) return '—'
  const named: Record<string, string> = { Mouse0: 'LMB', Mouse1: 'MMB', Mouse2: 'RMB', Space: 'Space', ShiftLeft: 'Shift', ShiftRight: 'R-Shift', ControlLeft: 'Ctrl', ControlRight: 'R-Ctrl', AltLeft: 'Alt', AltRight: 'R-Alt', Tab: 'Tab', Escape: 'Esc', Backquote: '`' }
  if (named[code]) return named[code]
  return code.replace(/^Key|^Digit|^Numpad/, '')
}

/** Display label of the primary key for an action. */
export const bindingLabel = (a: Action) => keyLabel(settings().bindings[a][0])
