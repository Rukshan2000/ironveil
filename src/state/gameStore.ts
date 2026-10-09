import { create } from 'zustand'
import type { AIState } from '../ai/guardBrain'
import type { DetectionLevel } from '../ai/perception'
import type { RadioDisplay } from '../audio/RadioSystem'
import type { ObjectiveStatus } from '../missions/ObjectiveManager'
import type { MissionState } from '../missions/MissionSystem'
import type { ChatLine, CoopStatus, VoiceState } from '../net/coop'
import type { GameSession } from '../game/GameSession'
import type { TimeOfDay } from '../world/environment'

export type Phase = 'menu' | 'loading' | 'briefing' | 'intro' | 'playing' | 'paused' | 'dead' | 'complete'

export interface ObjectiveView {
  id: string
  label: string
  optional: boolean
  status: ObjectiveStatus
  current: boolean
  /** "3/5" counters or a hold-progress percentage, when relevant. */
  progress: string | null
}

/** Debrief snapshot, taken once when the mission ends. */
export interface MissionResults {
  success: boolean
  missionName: string
  objectives: ObjectiveView[]
  detection: 'none' | 'suspicious' | 'detected'
  alarm: boolean
  maxAlert: number
  kills: number
  time: number
  intel: { collected: number; total: number }
  accuracy: number | null
  headshots: number
  /** What killed the player (failed missions). */
  cause: string | null
}

/** Low-frequency snapshot for React UI. Written ~10x/s by the game loop, never read by game logic. */
export interface HudState {
  health: number
  stamina: number
  ammo: number
  reserve: number
  magSize: number
  weaponName: string
  fireMode: string
  weaponState: string
  detection: DetectionLevel
  /** Highest guard awareness (0..1). */
  awareness: number
  cameraDetection: number
  alarm: boolean
  alarmReason: string
  missionName: string
  missionState: MissionState
  objectiveIndex: number
  objectives: ObjectiveView[]
  objectiveDistance: number | null
  alertLevel: number
  commsDown: boolean
  /** Guards down / guards still standing on the map (reinforcements count once they arrive). */
  enemiesKilled: number
  enemiesLeft: number
  extraction: { inZone: boolean; progress: number; total: number } | null
  recon: { zoom: number; range: number | null; target: { label: string; detail: string; distance: number } | null; tagProgress: number; tagged: number } | null
  prompt: string | null
  promptProgress: number | null
  stance: 'stand' | 'crouch' | 'prone'
  /** -1..1 lean. */
  lean: number
  armor: number
  equipment: { name: string; count: number; counts: Record<'frag' | 'smoke' | 'flash', number> }
  /** 0..1 aim-down-sights blend. */
  aim: number
  /** Optic magnification label while aimed ("2×"), null otherwise. */
  optic: string | null
  /** Light level at the player 0..1. */
  light: number
  indoors: boolean
  flashlight: boolean
  keycard: boolean
  restricted: string | null
  timeLabel: string
  driving: { name: string; speed: number } | null
  training: { title: string; text: string; index: number; total: number } | null
  holdingBreath: boolean
}

export interface DebugInfo {
  fps: number
  frameMs: number
  drawCalls: number
  triangles: number
  position: [number, number, number]
  grounded: boolean
  stance: string
  speed: number
  guards: { id: string; state: AIState; suspicion: number; health: number }[]
  entities: number
  colliders: number
  bullets: number
  particles: number
  objective: string
}

export interface Stats {
  time: number
  kills: number
  alarms: number
  shots: number
  hits: number
  headshots: number
  grenades: number
}

export interface Message {
  id: number
  text: string
  tone: 'info' | 'warn' | 'good'
}

interface GameStore {
  phase: Phase
  session: GameSession | null
  debug: boolean
  hud: HudState | null
  debugInfo: DebugInfo | null
  stats: Stats | null
  messages: Message[]
  radio: RadioDisplay[]
  results: MissionResults | null
  /** Tactical map overlay (M). */
  mapOpen: boolean
  /** F2 level validation overlay. */
  validationOpen: boolean
  /** Settings panel open (from the main or pause menu). */
  settingsOpen: boolean
  /** performance.now() of the last hit on an enemy / on the player — read by effects in the UI. */
  lastHitMarker: number
  lastDamage: number
  lastHitKill: boolean
  timeOfDay: TimeOfDay
  coopStatus: CoopStatus
  coopCode: string
  coopError: string
  chat: ChatLine[]
  /** Chat input is open (pointer lock released without pausing). */
  chatOpen: boolean
  voice: VoiceState
  setPhase: (phase: Phase) => void
  toggleDebug: () => void
  pushMessage: (text: string, tone?: Message['tone']) => void
  pushRadio: (line: RadioDisplay) => void
}

let nextId = 1

export const useGameStore = create<GameStore>((set) => ({
  phase: 'menu',
  session: null,
  debug: false,
  hud: null,
  debugInfo: null,
  stats: null,
  messages: [],
  radio: [],
  results: null,
  mapOpen: false,
  validationOpen: false,
  settingsOpen: false,
  lastHitMarker: 0,
  lastDamage: 0,
  lastHitKill: false,
  timeOfDay: 'dusk',
  coopStatus: 'off',
  coopCode: '',
  coopError: '',
  chat: [],
  chatOpen: false,
  voice: 'off',
  setPhase: (phase) => set({ phase }),
  toggleDebug: () => set((s) => ({ debug: !s.debug })),
  pushMessage: (text, tone = 'info') => {
    const id = nextId++
    set((s) => ({ messages: [...s.messages.slice(-3), { id, text, tone }] }))
    setTimeout(() => set((s) => ({ messages: s.messages.filter((m) => m.id !== id) })), 4000)
  },
  pushRadio: (line) => {
    set((s) => ({ radio: [...s.radio.slice(-2), line] }))
    setTimeout(() => set((s) => ({ radio: s.radio.filter((m) => m.id !== line.id) })), (line.duration + 2.5) * 1000)
  },
}))
