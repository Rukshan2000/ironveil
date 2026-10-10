import type { WorldEventDef } from '../world/WorldEventSystem'
import type { LevelLayout } from '../world/types'
import { compoundLayout } from '../world/compoundLayout'
import { damLayout } from '../world/damLayout'
import { LOW_WATER } from './lowWater'
import { LOW_WATER_EVENTS } from './lowWaterEvents'
import { NIGHTFALL } from './nightfall'
import { NIGHTFALL_EVENTS } from './nightfallEvents'
import type { MissionDef } from './types'

export interface MissionEntry {
  def: MissionDef
  layout: LevelLayout
  events: WorldEventDef[]
  /** "01", "02": shown on menus, the film title and the briefing. */
  number: string
}

/** The campaign, in order. Each mission unlocks when the one before it is completed. */
export const MISSIONS: MissionEntry[] = [
  { def: NIGHTFALL, layout: compoundLayout, events: NIGHTFALL_EVENTS, number: '01' },
  { def: LOW_WATER, layout: damLayout, events: LOW_WATER_EVENTS, number: '02' },
]

export const mission = (id: string) => MISSIONS.find((m) => m.def.id === id) ?? MISSIONS[0]
export const nextMission = (id: string) => MISSIONS[MISSIONS.indexOf(mission(id)) + 1] ?? null

const UNLOCK_KEY = 'ironveil.completed.v1'

/** Mission ids completed on this machine. */
export function completedMissions(): string[] {
  try {
    return JSON.parse(localStorage.getItem(UNLOCK_KEY) ?? '[]') as string[]
  } catch {
    return []
  }
}

export function markCompleted(id: string) {
  try {
    localStorage.setItem(UNLOCK_KEY, JSON.stringify([...new Set([...completedMissions(), id])]))
  } catch {
    // storage unavailable: the unlock lasts this session only via the results screen's NEXT MISSION
  }
}

/** The first mission is always open; every other one needs the one before it completed. */
export const unlocked = (id: string) => {
  const i = MISSIONS.indexOf(mission(id))
  return i <= 0 || completedMissions().includes(MISSIONS[i - 1].def.id)
}
