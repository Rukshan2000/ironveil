import { audio } from '../audio/AudioSystem'
import { GameSession } from '../game/GameSession'
import { applyCheckpoint, keepKills, loadCheckpoint } from '../missions/checkpoint'
import { mission } from '../missions/registry'
import { useGameStore } from '../state/gameStore'
import type { TimeOfDay } from '../world/environment'

export const requestLock = () => {
  // Chrome rejects re-locking for ~1s after Esc; the player can simply click again.
  Promise.resolve(document.body.requestPointerLock()).catch(() => {})
}

async function load(time: TimeOfDay) {
  const { session: old, setPhase } = useGameStore.getState()
  setPhase('loading')
  const m = mission(useGameStore.getState().missionId)
  const session = await GameSession.create(m.layout, m.def, time, m.events)
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

/** Website START GAME: load the mission, play the story film (StoryFilm), then the briefing. */
export async function startGame() {
  audio.unlock()
  await load(useGameStore.getState().timeOfDay)
  useGameStore.getState().setPhase('story')
}

/** Picks the mission the next START / BRIEFING / RESTART loads. */
export function selectMission(id: string) {
  useGameStore.setState({ missionId: id })
}

/** Results NEXT MISSION: straight into the next mission's story film. */
export async function startMission(id: string) {
  selectMission(id)
  await startGame()
}

/** Story film finished or skipped → the mission briefing. */
export function endStory() {
  useGameStore.getState().setPhase('briefing')
}

/** Briefing DEPLOY → the mission story: EVA's briefing and the flight in (IntroCinematic), which then calls deploy(). */
export function playIntro() {
  useGameStore.getState().setPhase('intro')
}

export function goHome() {
  useGameStore.getState().setPhase('home')
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
  const old = useGameStore.getState().session
  if (old) keepKills(old)
  const c = loadCheckpoint()
  if (!c) return
  audio.unlock()
  requestLock()
  useGameStore.setState({ timeOfDay: c.timeOfDay, missionId: c.missionId })
  const s = await load(c.timeOfDay)
  applyCheckpoint(s, c)
  useGameStore.getState().setPhase('playing')
  s.notify(`Checkpoint — ${c.label}`, 'info')
}

export function quitToMenu() {
  useGameStore.getState().setPhase('menu')
}
