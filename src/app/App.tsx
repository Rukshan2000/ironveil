import { useEffect } from 'react'
import { requestLock } from './actions'
import { GameCanvas } from '../game/GameCanvas'
import { attachInput } from '../game/input'
import { audio } from '../audio/AudioSystem'
import { useGameStore } from '../state/gameStore'
import { useSettings } from '../state/settings'
import { ValidationOverlay } from '../ui/ValidationOverlay'
import { DebugPanel } from '../ui/DebugPanel'
import { HUD } from '../ui/HUD'
import { BriefingScreen, LoadingScreen, MainMenu, PauseScreen, ResultsScreen } from '../ui/Screens'
import { TacticalMapOverlay } from '../ui/TacticalMap'
import { IntroOverlay } from '../game/IntroCinematic'
import { CoopChat } from '../ui/CoopChat'

export function App() {
  const phase = useGameStore((s) => s.phase)
  const session = useGameStore((s) => s.session)
  const mapOpen = useGameStore((s) => s.mapOpen)
  const validationOpen = useGameStore((s) => s.validationOpen)

  useEffect(() => attachInput(), [])
  // pause freezes the audio graph too (tails, delayed shots, loops); settings closes when play resumes
  useEffect(() => {
    audio.setPaused(phase === 'paused')
    if (phase === 'playing') useGameStore.setState({ settingsOpen: false })
  }, [phase])
  useEffect(() => {
    const apply = (s: { master: number; music: number; effects: number; voice: number }) => audio.setVolumes(s)
    apply(useSettings.getState())
    return useSettings.subscribe(apply)
  }, [])
  useEffect(() => {
    const onLockChange = () => {
      const { phase, setPhase } = useGameStore.getState()
      // typing in co-op chat frees the mouse without pausing (the friend's game keeps running)
      if (!document.pointerLockElement && phase === 'playing' && !useGameStore.getState().chatOpen) setPhase('paused')
      if (document.pointerLockElement && phase === 'paused') setPhase('playing')
    }
    document.addEventListener('pointerlockchange', onLockChange)
    return () => document.removeEventListener('pointerlockchange', onLockChange)
  }, [])

  return (
    <div className="fixed inset-0" onClick={() => phase === 'playing' && !document.pointerLockElement && requestLock()}>
      {session && <GameCanvas session={session} />}
      {session && (phase === 'playing' || phase === 'paused') && <HUD />}
      {session && phase === 'playing' && mapOpen && <TacticalMapOverlay />}
      {session && (phase === 'playing' || phase === 'paused') && validationOpen && <ValidationOverlay />}
      <DebugPanel />
      <CoopChat />
      {phase === 'menu' && <MainMenu />}
      {phase === 'loading' && <LoadingScreen />}
      {phase === 'briefing' && <BriefingScreen />}
      {phase === 'intro' && <IntroOverlay />}
      {phase === 'paused' && <PauseScreen />}
      {(phase === 'dead' || phase === 'complete') && <ResultsScreen />}
    </div>
  )
}
