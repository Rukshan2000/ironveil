import { audio } from '../audio/AudioSystem'
import { GameSession } from '../game/GameSession'
import { applyCheckpoint, loadCheckpoint } from '../missions/checkpoint'
import { NIGHTFALL } from '../missions/nightfall'
import { NIGHTFALL_EVENTS } from '../missions/nightfallEvents'
import { useGameStore } from '../state/gameStore'
import type { TimeOfDay } from '../world/environment'
import { compoundLayout } from '../world/compoundLayout'

export const requestLock = () => {
  // Chrome rejects re-locking for ~1s after Esc; the player can simply click again.
  Promise.resolve(document.body.requestPointerLock()).catch(() => {})
}

async function load(time: TimeOfDay) {
  const { session: old, setPhase } = useGameStore.getState()
  setPhase('loading')
  const session = await GameSession.create(compoundLayout, NIGHTFALL, time, NIGHTFALL_EVENTS)
  useGameStore.setState({ session, messages: [], radio: [], hud: null, stats: null, results: null, mapOpen: false })
  old?.dispose()
  return session
}

/** Loads the mission and shows the briefing over the (paused) world. */
export async function openBriefing() {
  audio.unlock()
  await load(useGameStore.getState().timeOfDay)
  useGameStore.getState().setPhase('briefing')
}

/** Briefing → insertion. Must run inside a click handler for pointer lock. */
export function deploy() {
  const { session, setPhase } = useGameStore.getState()
  if (!session) return
  requestLock()
  session.deploy()
  setPhase('playing')
}

/** Restart from the top, skipping the briefing. Must run inside a click handler. */
export async function restartMission() {
  audio.unlock()
  requestLock()
  const s = await load(useGameStore.getState().timeOfDay)
  s.deploy()
  useGameStore.getState().setPhase('playing')
}

/** Resume from the last local checkpoint. Must run inside a click handler. */
export async function continueFromCheckpoint() {
  const c = loadCheckpoint()
  if (!c) return
  audio.unlock()
  requestLock()
  useGameStore.setState({ timeOfDay: c.timeOfDay })
  const s = await load(c.timeOfDay)
  applyCheckpoint(s, c)
  useGameStore.getState().setPhase('playing')
  s.notify(`Checkpoint — ${c.label}`, 'info')
}

export function quitToMenu() {
  useGameStore.getState().setPhase('menu')
}
